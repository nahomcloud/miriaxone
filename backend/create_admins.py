from __future__ import annotations

import json
import os
from getpass import getpass
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from passlib.context import CryptContext
from pymongo import MongoClient

try:
    from .main import DB_NAME, mongo_uri, Credentials
except ImportError:
    from main import DB_NAME, mongo_uri, Credentials


load_dotenv(Path(__file__).resolve().parents[1] / ".env")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def account(email: str, password: str, name: str, username: str, role: str) -> dict:
    if not email or not password:
        raise ValueError(f"Missing credentials for {role} account")
    email = Credentials(email=email, password=password).email
    if len(password) < 15:
        raise ValueError("Administrator passwords must contain at least 15 characters")
    return {
        "email": email,
        "password": pwd_context.hash(password),
        "name": name or username,
        "username": (username or email.split("@", 1)[0]).strip().lower(),
        "countryCode": os.getenv("ADMIN_COUNTRY_CODE", "US"),
        "mobile": os.getenv("ADMIN_MOBILE", ""),
        "role": "admin",
        "status": "active",
        "ip": "",
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }


def main() -> None:
    root_email = os.getenv("ROOT_EMAIL") or input("Root email: ").strip()
    root_password = os.getenv("ROOT_PASSWORD") or getpass("Root password: ")
    root = account(
        root_email,
        root_password,
        os.getenv("ROOT_NAME", "Root Administrator"),
        os.getenv("ROOT_USERNAME", "root"),
        "root",
    )
    admins = [
        account(item["email"], item["password"], item.get("name", "Administrator"), item.get("username", ""), "admin")
        for item in json.loads(os.getenv("ADMIN_ACCOUNTS", "[]"))
    ]
    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=10000)
    users = client[DB_NAME].users
    for item in [root, *admins]:
        identity = {"email": item["email"]}
        created_at = item.pop("createdAt")
        users.update_one(identity, {"$set": item, "$setOnInsert": {"createdAt": created_at}, "$inc": {"sessionVersion": 1}}, upsert=True)
        print(f"upserted {item['role']}: {item['email']}")
    client.close()


if __name__ == "__main__":
    main()
