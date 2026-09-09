"""FastAPI application for MIRIAX ONE cargo operations.

The API owns authentication, validation, business rules, and MongoDB access.
Browser clients must use the HTTP endpoints in this module and must never
connect directly to the database.
"""

from __future__ import annotations

import os
import re
import secrets
import hashlib
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, urlencode, urlsplit, urlunsplit

import jwt
from bson import ObjectId
from bson.decimal128 import Decimal128
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from pydantic import field_validator, ConfigDict
from pymongo.errors import DuplicateKeyError
from pymongo.errors import OperationFailure
from pymongo import ReturnDocument
from bson.errors import InvalidId


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


DB_NAME = os.getenv("DB_NAME", "miriaxcargo")
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = int(os.getenv("JWT_EXPIRY", "6000"))


def mongo_uri() -> str:
    """Build the MongoDB connection string from server-side configuration.

    Returns:
        A MongoDB URI with the application database and write settings.

    Raises:
        RuntimeError: If neither ``MONGODB_URI`` nor ``DB_HOST`` is configured.
    """
    configured = os.getenv("MONGODB_URI")
    if configured:
        parts = urlsplit(configured)
        query = parse_qs(parts.query)
        path = parts.path or f"/{DB_NAME}"
        if path == "/":
            path = f"/{DB_NAME}"
        query.setdefault("retryWrites", ["true"])
        query.setdefault("w", ["majority"])
        return urlunsplit((parts.scheme, parts.netloc, path, urlencode(query, doseq=True), parts.fragment))

    host = os.getenv("DB_HOST")
    if not host:
        raise RuntimeError("Set MONGODB_URI or DB_HOST in the API environment")
    username = os.getenv("DB_USERNAME", "")
    password = os.getenv("DB_PASSWORD", "")
    credentials = f"{quote(username, safe='')}:{quote(password, safe='')}@" if username else ""
    return f"mongodb+srv://{credentials}{host}/{DB_NAME}?retryWrites=true&w=majority"


def serialize(value: Any) -> Any:
    """Convert BSON and datetime values into JSON-compatible values.

    Args:
        value: A value returned by MongoDB, or a nested list or dictionary.

    Returns:
        The value with BSON-specific types converted to standard JSON types.
    """
    if isinstance(value, Decimal128):
        return float(value.to_decimal())
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize(item) for item in value]
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    return value


def collection_name(resource: str) -> str:
    """Map a public resource name to its MongoDB collection name."""
    return {
        "order": "orders",
        "product": "products",
        "container": "containers",
        "tax-rate": "taxRates",
        "country-document": "countryDocuments",
        "contact-us": "contacts",
        "country": "countries",
        "state": "states",
        "city": "cities",
        "global-settings": "globalSettings",
        "shipping-type": "shippingTypes",
        "tracking": "orderTracking",
    }.get(resource, resource)


async def database(request: Request) -> AsyncIOMotorDatabase:
    """Return the database attached to the current application lifespan."""
    return request.app.state.database


async def find_many(db: AsyncIOMotorDatabase, resource: str, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Fetch active documents for a resource, capped for API safety.

    Args:
        db: The active MongoDB database.
        resource: Public resource name used by the API.
        query: Optional MongoDB filter.

    Returns:
        Serialized active documents, limited to 500 records.
    """
    return [serialize(item) async for item in db[collection_name(resource)].find({"$and": [query or {}, {"archived": {"$ne": True}}]}).limit(500)]


async def find_from_collections(db: AsyncIOMotorDatabase, names: tuple[str, ...], query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    for name in names:
        documents = [serialize(item) async for item in db[name].find({"$and": [query or {}, {"archived": {"$ne": True}}]}).limit(500)]
        if documents:
            return documents
    return []


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def issue_token(user: dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user["_id"]), "ver": user.get("sessionVersion", 0), "iat": now, "exp": now + timedelta(seconds=JWT_EXPIRY_SECONDS)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: AsyncIOMotorDatabase = Depends(database)) -> dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"require": ["sub", "exp", "iat", "ver"]})
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if user and (payload["ver"] != user.get("sessionVersion", 0) or user.get("status", "active") != "active"):
            user = None
    except (jwt.PyJWTError, KeyError, TypeError, ValueError, InvalidId):
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return user


async def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("password")
    @classmethod
    def valid_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


class Registration(Credentials):
    password: str = Field(min_length=15, max_length=72)
    name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9]+$")
    countryCode: str = Field(min_length=2, max_length=3, pattern=r"^[A-Za-z]+$")
    mobile: str = Field(min_length=5, max_length=25, pattern=r"^\+?[0-9 ()-]+$")

    @field_validator("name", "username", "countryCode", "mobile", mode="before")
    @classmethod
    def trim_fields(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        if value.lower() in {"root", "admin", "administrator"}:
            raise ValueError("This username is reserved")
        return value.lower()


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return serialize({key: user[key] for key in ("_id", "email", "name", "username", "countryCode", "mobile", "role") if key in user})


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(password, hashed)
    except (ValueError, TypeError):
        return False


async def optional_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: AsyncIOMotorDatabase = Depends(database)):
    return await current_user(credentials, db) if credentials else None


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    countryCode: str = Field(pattern=r"^[A-Za-z]{2,3}$")
    mobile: str = Field(min_length=5, max_length=25, pattern=r"^\+?[0-9 ()-]+$")


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    currentPassword: str = Field(min_length=1, max_length=72)
    newPassword: str = Field(min_length=15, max_length=72)

    @field_validator("currentPassword", "newPassword")
    @classmethod
    def valid_bytes(cls, value: str) -> str:
        return Credentials.valid_password_bytes(value)


async def throttle(request: Request, db: AsyncIOMotorDatabase):
    # Shared Mongo counters work across API workers; do not trust forwarded IP headers here.
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp()) // 900
    address = request.client.host if request.client else "unknown"
    key = hashlib.sha256(f"{address}:{bucket}".encode()).hexdigest()
    counter = await db.auth_attempts.find_one_and_update(
        {"_id": key}, {"$inc": {"count": 1}, "$setOnInsert": {"expiresAt": now + timedelta(minutes=30)}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    if counter["count"] > 30:
        raise HTTPException(status_code=429, detail="Too many account attempts. Try again in 15 minutes.", headers={"Retry-After": "900"})


@asynccontextmanager
async def lifespan(app: FastAPI):
    if len(JWT_SECRET.encode()) < 32 or JWT_SECRET == "change-this-secret":
        raise RuntimeError("Set JWT_SECRET to a random secret of at least 32 bytes")
    client = AsyncIOMotorClient(mongo_uri(), serverSelectionTimeoutMS=10000)
    app.state.mongo = client
    app.state.database = client[DB_NAME]

    async def ensure_indexes() -> None:
        try:
            db = app.state.database
            await db.auth_attempts.create_index("expiresAt", expireAfterSeconds=0)
            await db.platformServices.create_index("key", unique=True)
            await db.platformRoutes.create_index([("origin", 1), ("destination", 1), ("service", 1)], unique=True)
            for field in ("email", "username"):
                await db.users.create_index(field, unique=True, collation={"locale": "en", "strength": 2}, name=f"unique_{field}_ci")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Index initialization failed: {exc}", flush=True)

    index_task = asyncio.create_task(ensure_indexes())
    try:
        yield
    finally:
        index_task.cancel()
        client.close()


app = FastAPI(title="Miriax Cargo API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FRONTEND_URL", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def private_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/auth/", "/account/")) or request.headers.get("authorization"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
async def health(db: AsyncIOMotorDatabase = Depends(database)):
    await db.command("ping")
    return {"status": "ok", "database": DB_NAME}


@app.get("/site/countries")
async def countries(db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "country", {"isActive": 1})


@app.get("/site/shipping-types")
async def shipping_types(db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "shipping-type")


@app.get("/product/products-list")
async def product_list(db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "product", {"isActive": 1})


@app.get("/container/{country_code}/{shipping_type}")
async def containers(country_code: str, shipping_type: str, db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "container", {"countryCode": country_code.upper(), "shippingType": ObjectId(shipping_type) if ObjectId.is_valid(shipping_type) else None, "isActive": 1})


@app.get("/site/country-documents/{country_code}/{shipping_type}")
async def country_documents(country_code: str, shipping_type: str, db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "country-document", {"countryCode": country_code.upper(), "shippingType": ObjectId(shipping_type) if ObjectId.is_valid(shipping_type) else None})


@app.get("/tax-rate/country/{country_code}")
async def tax_rates(country_code: str, db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "tax-rate", {"countryCode": country_code.upper()})


@app.post("/auth/register")
async def register(payload: Registration, request: Request, db: AsyncIOMotorDatabase = Depends(database)):
    await throttle(request, db)
    if await db.users.find_one({"$or": [{"email": {"$regex": f"^{re.escape(payload.email)}$", "$options": "i"}}, {"username": {"$regex": f"^{re.escape(payload.username)}$", "$options": "i"}}]}):
        raise HTTPException(status_code=409, detail="An account with those details already exists")
    now = datetime.now(timezone.utc)
    user = payload.model_dump(exclude={"password"}) | {"password": await run_in_threadpool(pwd_context.hash, payload.password), "role": "user", "status": "active", "ip": request.client.host if request.client else "", "createdAt": now, "updatedAt": now}
    try:
        result = await db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with those details already exists")
    user["_id"] = result.inserted_id
    return {"token": issue_token(user), "user": public_user(user)}


@app.post("/auth/login")
async def login(payload: Credentials, request: Request, db: AsyncIOMotorDatabase = Depends(database)):
    await throttle(request, db)
    user = await db.users.find_one({"email": {"$regex": f"^{re.escape(payload.email)}$", "$options": "i"}})
    # Perform the same expensive hash verification for unknown addresses.
    valid = await run_in_threadpool(verify_password, payload.password, user.get("password", "") if user else DUMMY_HASH)
    if not user or not valid or user.get("status", "active") != "active":
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"token": issue_token(user), "user": public_user(user)}


DUMMY_HASH = pwd_context.hash(secrets.token_urlsafe(32))


@app.get("/auth/me")
async def me(user: dict[str, Any] = Depends(current_user)):
    return public_user(user)


@app.patch("/auth/me")
async def update_profile(payload: ProfileUpdate, user: dict[str, Any] = Depends(current_user), db: AsyncIOMotorDatabase = Depends(database)):
    changes = payload.model_dump() | {"updatedAt": datetime.now(timezone.utc)}
    await db.users.update_one({"_id": user["_id"]}, {"$set": changes})
    return public_user(user | changes)


@app.post("/auth/password")
async def change_password(payload: PasswordChange, request: Request, user: dict[str, Any] = Depends(current_user), db: AsyncIOMotorDatabase = Depends(database)):
    await throttle(request, db)
    if not await run_in_threadpool(verify_password, payload.currentPassword, user.get("password", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.currentPassword == payload.newPassword:
        raise HTTPException(status_code=400, detail="Choose a different new password")
    password_hash = await run_in_threadpool(pwd_context.hash, payload.newPassword)
    result = await db.users.update_one({"_id": user["_id"], "password": user["password"]}, {"$set": {"password": password_hash, "updatedAt": datetime.now(timezone.utc)}, "$inc": {"sessionVersion": 1}})
    if not result.modified_count:
        raise HTTPException(status_code=409, detail="Your account changed. Sign in and try again.")
    return {"message": "Password changed. Sign in again on all devices."}


@app.post("/auth/logout")
async def logout(user: dict[str, Any] = Depends(current_user), db: AsyncIOMotorDatabase = Depends(database)):
    await db.users.update_one({"_id": user["_id"]}, {"$inc": {"sessionVersion": 1}})
    return {"message": "Signed out on all devices"}


@app.get("/account/orders")
async def account_orders(user: dict[str, Any] = Depends(current_user), db: AsyncIOMotorDatabase = Depends(database)):
    return await find_many(db, "order", {"userId": str(user["_id"])})


@app.get("/site/track-order/{order_id}")
async def track_order(order_id: str, db: AsyncIOMotorDatabase = Depends(database)):
    query: dict[str, Any] = {"trackingNumber": order_id}
    if ObjectId.is_valid(order_id):
        query = {"$or": [query, {"_id": ObjectId(order_id)}]}
    order = await db.orders.find_one({"$and": [query, {"archived": {"$ne": True}}]})
    if not order:
        raise HTTPException(status_code=404, detail="Shipment not found")
    events = await find_many(db, "tracking", {"$or": [{"orderId": order.get("_id")}, {"orderId": str(order.get("_id"))}]})
    public_order = {key: order[key] for key in ("_id", "trackingNumber", "status") if key in order}
    public_events = [{"status": event.get("status"), "description": event.get("comments", event.get("description", "")), "createdAt": event.get("createdAt")} for event in events]
    return serialize({"order": public_order, "tracking": public_events, "orderTracking": public_events, "status": order.get("status")})


@app.post("/contact-us")
async def contact(payload: dict[str, Any], db: AsyncIOMotorDatabase = Depends(database)):
    allowed = {"name", "email", "phone", "subject", "message"}
    if set(payload) - allowed:
        raise HTTPException(422, "Unexpected contact fields")
    try:
        payload = Contact.model_validate(payload).model_dump()
    except Exception:
        raise HTTPException(422, "Enter valid contact details and a message")
    payload["createdAt"] = datetime.now(timezone.utc)
    result = await db.contacts.insert_one(payload)
    return {"_id": str(result.inserted_id), "message": "Message received"}


try:
    from .admin import install as install_admin, present, COLLECTIONS, is_private, Contact
    from .checkout import install as install_checkout
except ImportError:
    from admin import install as install_admin, present, COLLECTIONS, is_private, Contact
    from checkout import install as install_checkout
admin_write = install_admin(app, database, admin_user, serialize)
install_checkout(app, database, optional_user, admin_user)


def legacy_handlers(resource):
    async def listing(db=Depends(database)):
        return [present(item, resource, serialize) for item in await find_many(db, resource)]
    async def create(payload: dict[str, Any], db=Depends(database)):
        return await admin_write(resource, payload, db)
    async def update(item_id: str, payload: dict[str, Any], db=Depends(database)):
        fields = {key: value for key, value in payload.items() if key not in {"_id", "createdAt", "updatedAt", "__v"}}
        return await admin_write(resource, fields, db, item_id)
    return listing, create, update

for resource in COLLECTIONS:
    if resource == "shipping-type":
        continue
    listing, create, update = legacy_handlers(resource)
    app.add_api_route(f"/{resource}", listing, methods=["GET"], dependencies=[Depends(admin_user)])
    if resource != "contact-us":
        app.add_api_route(f"/{resource}", create, methods=["POST"], dependencies=[Depends(admin_user)])
    app.add_api_route(f"/{resource}/{{item_id}}", update, methods=["PUT"], dependencies=[Depends(admin_user)])

@app.get("/site/states/{country_code}")
async def public_states(country_code: str, db=Depends(database)):
    return await find_many(db, "state", {"countryCode": country_code.upper()})

@app.get("/site/cities/{country_code}/{state_code}")
async def public_cities(country_code: str, state_code: str, db=Depends(database)):
    return await find_many(db, "city", {"countryCode": country_code.upper(), "stateCode": state_code.upper()})

@app.get("/site/settings")
async def public_settings(db=Depends(database)):
    return {item["slug"]: item["value"] for item in await find_many(db, "global-settings", {"type": "public"}) if not is_private(item)}

from backend.network import install as install_network
install_network(app, database)
