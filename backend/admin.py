"""Validated administration workflows for the ten management sections."""
from datetime import datetime, timezone
import json
import re
import hashlib
from pathlib import Path
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, Response
from backend.storage import save_upload, read_upload
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, OperationFailure


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False, strict=True)


class Product(Record):
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    depth: float = Field(gt=0)
    weight: float = Field(gt=0)
    isActive: Literal[0, 1] = 1


class Container(Record):
    countryCode: str = Field(min_length=2, max_length=3)
    shippingType: str
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    depth: float = Field(gt=0)
    price: float = Field(ge=0)
    image: str = ""
    description: str = Field(default="", max_length=2000)
    serviceCharge: float = Field(default=0, ge=0)
    otherCharge: float = Field(default=0, ge=0)
    otherChargeDescription: str = Field(default="", max_length=2000)
    isActive: Literal[0, 1] = 1


class Tax(Record):
    name: str = Field(min_length=1, max_length=200)
    countryCode: str = Field(min_length=2, max_length=3)
    rate: float = Field(ge=0, le=100)


class Document(Record):
    name: str = Field(min_length=1, max_length=200)
    countryCode: str = Field(min_length=2, max_length=3)
    shippingType: str
    description: str = Field(min_length=1, max_length=2000)


class Country(Record):
    canSendFrom: Literal[0, 1] = 1
    canDeliverTo: Literal[0, 1] = 1
    isoCode: str = Field(pattern=r"^[A-Za-z]{2,3}$")
    name: str = Field(min_length=1, max_length=200)
    phonecode: str = Field(min_length=1, max_length=20)
    flag: str = Field(min_length=1, max_length=100)
    currency: str = Field(min_length=1, max_length=10)
    latitude: str | None = ""
    longitude: str | None = ""
    isActive: Literal[0, 1] = 1


class State(Record):
    isoCode: str = Field(min_length=1, max_length=10)
    name: str = Field(min_length=1, max_length=200)
    countryCode: str = Field(min_length=2, max_length=3)
    latitude: str | None = ""
    longitude: str | None = ""


class City(Record):
    name: str = Field(min_length=1, max_length=200)
    countryCode: str = Field(min_length=2, max_length=3)
    stateCode: str = Field(min_length=1, max_length=10)
    latitude: str | None = ""
    longitude: str | None = ""


class Contact(Record):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    phone: str = Field(min_length=1, max_length=40)
    subject: str = Field(min_length=1, max_length=300)
    message: str = Field(min_length=1, max_length=10000)
    status: Literal["new", "in-progress", "resolved"] = "new"
    notes: str = Field(default="", max_length=5000)


class Setting(Record):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=100)
    value: str = Field(max_length=10000)
    type: Literal["public", "private"] = "private"


class Service(Record):
    key: Literal['container', 'ship-items']
    name: str = Field(min_length=1, max_length=200)
    status: Literal['active', 'unavailable', 'coming-soon', 'suspended'] = 'active'
    visibility: Literal['visible', 'hidden'] = 'visible'


class NetworkRoute(Record):
    name: str = Field(min_length=1, max_length=200)
    origin: str = Field(pattern=r'^[A-Za-z]{2,3}$')
    destination: str = Field(pattern=r'^[A-Za-z]{2,3}$')
    service: Literal['container', 'ship-items']
    status: Literal['active', 'unavailable', 'coming-soon', 'suspended'] = 'active'
    visibility: Literal['visible', 'hidden'] = 'visible'


class Order(Record):
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0)
    cart: dict[str, Any] | str = Field(default_factory=dict)
    notes: str = Field(default="", max_length=5000)


MODELS = {"order": Order, "product": Product, "container": Container, "tax-rate": Tax,
          "country-document": Document, "contact-us": Contact, "country": Country,
          "state": State, "city": City, "global-settings": Setting, "service": Service, "network-route": NetworkRoute}
COLLECTIONS = {"order": "orders", "product": "products", "container": "containers", "tax-rate": "taxRates",
               "country-document": "countryDocuments", "contact-us": "contacts", "country": "countries",
               "state": "states", "city": "cities", "global-settings": "globalSettings", "shipping-type": "shippingTypes", "service": "platformServices", "network-route": "platformRoutes"}
SENSITIVE_SLUGS = {"square_payment_access_token", "square_access_token", "square_payment_location_id", "recaptcha_secret_key", "captcha_secret_key"}
ORDER_STATUSES = {"pending", "confirmed", "in-transit", "delivered"}


def is_private(document):
    slug = document.get("slug", "").lower()
    return document.get("type") == "private" or slug in SENSITIVE_SLUGS or any(word in slug for word in ("secret", "password", "access_token", "private_key"))


def present(document, resource, serialize):
    result = serialize(document)
    if resource == "global-settings" and is_private(document):
        result["value"] = ""
        result["hasValue"] = bool(document.get("value"))
        result["type"] = "private"
    return result


def identity(value):
    if not ObjectId.is_valid(value):
        raise HTTPException(422, "Invalid record ID")
    return ObjectId(value)


def resource_collection(resource):
    if resource not in COLLECTIONS:
        raise HTTPException(404, "Unknown admin section")
    return COLLECTIONS[resource]


async def validate(resource, payload, db, existing=None):
    model = MODELS[resource]
    unknown = set(payload) - set(model.model_fields)
    if unknown:
        raise HTTPException(422, "Uneditable fields: " + ", ".join(sorted(unknown)))
    merged = {key: value for key, value in (existing or {}).items() if key in model.model_fields}
    if isinstance(merged.get("shippingType"), ObjectId):
        merged["shippingType"] = str(merged["shippingType"])
    merged.update(payload)
    if resource == "global-settings" and existing and is_private(existing) and not payload.get("value"):
        merged["value"] = existing.get("value", "")
    try:
        fields = model.model_validate(merged).model_dump()
    except ValidationError as error:
        raise HTTPException(422, "; ".join(f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors()))
    for key in ("countryCode", "isoCode", "stateCode", "currency", "origin", "destination"):
        if key in fields:
            fields[key] = fields[key].upper()
    if resource in {'service', 'network-route'}:
        keys = ('key',) if resource == 'service' else ('origin', 'destination', 'service')
        if existing and any(fields[k] != existing.get(k) for k in keys):
            raise HTTPException(422, 'Service and route identifiers cannot be renamed; create a new record instead')
        other = await db[COLLECTIONS[resource]].find_one({k: fields[k] for k in keys})
        if other and (not existing or other['_id'] != existing['_id']):
            raise HTTPException(409, 'This configuration already exists; edit or restore it')
        for key in ('origin', 'destination') if resource == 'network-route' else ():
            if not await db.countries.find_one({'isoCode': fields[key], 'archived': {'$ne': True}}):
                raise HTTPException(422, 'Select an existing country')
    if resource == "tax-rate":
        fields["name"] = fields["name"].upper()
    if "countryCode" in fields and not await db.countries.find_one({"isoCode": fields["countryCode"], "archived": {"$ne": True}}):
        raise HTTPException(422, "Select an existing country")
    if resource == "city" and not await db.states.find_one({"isoCode": fields["stateCode"], "countryCode": fields["countryCode"], "archived": {"$ne": True}}):
        raise HTTPException(422, "Select a state belonging to this country")
    if "shippingType" in fields:
        fields["shippingType"] = identity(fields["shippingType"])
        if not await db.shippingTypes.find_one({"_id": fields["shippingType"]}):
            raise HTTPException(422, "Select an existing shipping type")
    if resource == "container" and fields["image"] and not fields["image"].startswith(("https://", "/media/")):
        raise HTTPException(422, "Image must be an HTTPS URL or an uploaded media URL")
    if resource == "global-settings":
        if (existing and is_private(existing)) or is_private(fields):
            fields["type"] = "private"
        if existing and fields["slug"] != existing.get("slug"):
            raise HTTPException(422, "Setting slugs cannot be renamed")
    if resource == "order" and isinstance(fields["cart"], str):
        try:
            fields["cart"] = json.loads(fields["cart"])
            if not isinstance(fields["cart"], dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(422, "Order details must contain a JSON object")
    if resource == "order" and existing and existing.get("isPaid") == 1 and fields["price"] != existing.get("price"):
        raise HTTPException(409, "The amount of a paid order cannot be edited")
    if existing and resource in {"country", "state"}:
        for key in ("isoCode", "countryCode"):
            if key in fields and fields[key] != existing.get(key):
                raise HTTPException(422, "Geographic codes cannot be renamed; create a new record instead")
    return fields


def install(app, database, admin_user, serialize):
    router = APIRouter(prefix="/admin", dependencies=[Depends(admin_user)])

    @router.post("/uploads/container-image")
    async def upload_image(file: UploadFile = File(...), db=Depends(database)):
        content = await file.read(5 * 1024 * 1024 + 1)
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(413, "Image must be at most 5 MB")
        extension = "png" if content.startswith(b"\x89PNG\r\n\x1a\n") else "jpg" if content.startswith(b"\xff\xd8\xff") else "webp" if content.startswith(b"RIFF") and content[8:12] == b"WEBP" else None
        if not extension:
            raise HTTPException(422, "Upload a PNG, JPEG, or WebP image")
        filename = hashlib.sha256(content).hexdigest() + "." + extension
        await save_upload(db, "media/" + filename, content)
        return {"url": "/media/" + filename}

    @app.get("/media/{filename}")
    async def media(filename: str, db=Depends(database)):
        if not re.fullmatch(r"[a-f0-9]{64}\.(png|jpg|webp)", filename):
            raise HTTPException(404, "Image not found")
        content = await read_upload(db, "media/" + filename)
        if content is not None:
            media_type = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[filename.rsplit(".", 1)[1]]
            return Response(content, media_type=media_type, headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"})
        # Existing standalone installations can still serve older local uploads.
        path = Path(__file__).resolve().parent / "media" / filename
        if not path.is_file():
            raise HTTPException(404, "Image not found")
        return FileResponse(path, headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"})

    @router.get("/{resource}")
    async def listing(resource: str, page: int = Query(1, ge=1), perPage: int = Query(25, ge=1, le=250),
                      q: str = Query("", max_length=200), sort: str = "-createdAt", countryCode: str = "",
                      stateCode: str = "", status: str = "", archived: bool = False, db=Depends(database)):
        collection = db[resource_collection(resource)]
        query: dict[str, Any] = {"archived": True if archived else {"$ne": True}}
        if q:
            query["$or"] = [{key: {"$regex": re.escape(q), "$options": "i"}} for key in ("name", "email", "subject", "slug", "isoCode", "description")]
        for key, value in (("countryCode", countryCode), ("stateCode", stateCode)):
            if value:
                query[key] = value.upper()
        if status:
            if status in {"active", "inactive"}:
                query["isActive"] = 1 if status == "active" else 0
            else:
                query["status"] = status
        field = sort.lstrip("-")
        if field not in {"createdAt", "updatedAt", "name", "price", "rate", "isoCode", "status"}:
            raise HTTPException(422, "Unsupported sort field")
        count = await collection.count_documents(query)
        records = [present(item, resource, serialize) async for item in collection.find(query).sort([(field, -1 if sort.startswith("-") else 1), ("_id", 1)]).skip((page - 1) * perPage).limit(perPage)]
        return {"items": records, "totalRecords": count, "page": page, "pageSize": perPage}

    @router.get("/{resource}/{item_id}")
    async def detail(resource: str, item_id: str, db=Depends(database)):
        record = await db[resource_collection(resource)].find_one({"_id": identity(item_id)})
        if not record:
            raise HTTPException(404, "Record not found")
        result = present(record, resource, serialize)
        if resource == "order":
            result["tracking"] = [serialize(item) async for item in db.orderTracking.find({"orderId": record["_id"]}).sort("createdAt", 1)]
        return result

    async def write(resource, payload, db, item_id=None):
        resource_collection(resource)
        if resource not in MODELS:
            raise HTTPException(405, "This section is read-only")
        collection = db[COLLECTIONS[resource]]
        existing = await collection.find_one({"_id": identity(item_id), "archived": {"$ne": True}}) if item_id else None
        if item_id and not existing:
            raise HTTPException(404, "Active record not found")
        fields = await validate(resource, payload, db, existing)
        fields["updatedAt"] = datetime.now(timezone.utc)
        try:
            if existing:
                record = await collection.find_one_and_update({"_id": existing["_id"], "archived": {"$ne": True}}, {"$set": fields}, return_document=ReturnDocument.AFTER)
                if not record:
                    raise HTTPException(409, "Record changed. Refresh and try again.")
            else:
                fields["createdAt"] = fields["updatedAt"]
                if resource == "order":
                    fields.update(status="pending", files={}, isPaid=0, txnId="")
                result = await collection.insert_one(fields)
                record = fields | {"_id": result.inserted_id}
        except DuplicateKeyError:
            raise HTTPException(409, "A record with those details already exists, possibly in the archive")
        except OperationFailure as error:
            if error.code == 121:
                raise HTTPException(422, "Record does not satisfy database requirements")
            raise
        return present(record, resource, serialize)

    @router.post("/{resource}")
    async def create(resource: str, payload: dict[str, Any], db=Depends(database)):
        return await write(resource, payload, db)

    @router.put("/{resource}/{item_id}")
    async def update(resource: str, item_id: str, payload: dict[str, Any], db=Depends(database)):
        return await write(resource, payload, db, item_id)

    @router.delete("/{resource}/{item_id}")
    async def archive(resource: str, item_id: str, db=Depends(database)):
        resource_collection(resource)
        if resource not in MODELS:
            raise HTTPException(405, "This section is read-only")
        record = await db[COLLECTIONS[resource]].find_one({"_id": identity(item_id)})
        if not record:
            raise HTTPException(404, "Record not found")
        # Do not orphan active geography or shipping configuration.
        dependents = []
        if resource == "country":
            dependents = [(name, {"countryCode": record["isoCode"]}) for name in ("states", "cities", "containers", "taxRates", "countryDocuments")]
        elif resource == "state":
            dependents = [("cities", {"countryCode": record["countryCode"], "stateCode": record["isoCode"]})]
        for name, query in dependents:
            if await db[name].find_one(query | {"archived": {"$ne": True}}):
                raise HTTPException(409, "Archive the dependent records first, or deactivate this country")
        await db[COLLECTIONS[resource]].update_one({"_id": record["_id"]}, {"$set": {"archived": True, "updatedAt": datetime.now(timezone.utc)}})
        return {"message": "Record archived. It can be restored from the archive."}

    @router.post("/{resource}/{item_id}/restore")
    async def restore(resource: str, item_id: str, db=Depends(database)):
        collection = db[resource_collection(resource)]
        if resource not in MODELS:
            raise HTTPException(405, "This section is read-only")
        existing = await collection.find_one({"_id": identity(item_id)})
        if not existing:
            raise HTTPException(404, "Record not found")
        await validate(resource, {}, db, existing)
        await collection.update_one({"_id": existing["_id"]}, {"$set": {"archived": False, "updatedAt": datetime.now(timezone.utc)}})
        return {"message": "Record restored"}

    class Tracking(Record):
        status: Literal["pending", "confirmed", "in-transit", "delivered"]
        comments: str = Field(default="", max_length=2000)

    @router.post("/order/{item_id}/tracking")
    async def tracking(item_id: str, payload: Tracking, db=Depends(database)):
        order_id = identity(item_id)
        now = datetime.now(timezone.utc)
        # Keep the order status and its history together, including concurrent changes.
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                order = await db.orders.find_one({"_id": order_id, "archived": {"$ne": True}}, session=session)
                if not order:
                    raise HTTPException(404, "Order not found")
                event = payload.model_dump() | {"orderId": order_id, "createdAt": now}
                await db.orderTracking.insert_one(event, session=session)
                await db.orders.update_one({"_id": order_id}, {"$set": {"status": payload.status, "updatedAt": now}}, session=session)
        return {"message": "Tracking event added and order status updated"}

    app.include_router(router)
    return write
