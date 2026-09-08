"""Operator-only password recovery; never promotes a customer to administrator."""
import argparse
from datetime import datetime, timezone
from getpass import getpass
import re

from pymongo import MongoClient
from backend.main import Credentials, DB_NAME, mongo_uri, pwd_context


def main():
    parser = argparse.ArgumentParser(description="Reset a verified user's password and revoke all sessions")
    parser.add_argument("email")
    args = parser.parse_args()
    password = getpass("New password (at least 15 characters): ")
    if len(password) < 15:
        raise SystemExit("Password must contain at least 15 characters")
    if password != getpass("Confirm new password: "):
        raise SystemExit("Passwords do not match")
    credentials = Credentials(email=args.email, password=password)
    with MongoClient(mongo_uri(), serverSelectionTimeoutMS=10000) as client:
        result = client[DB_NAME].users.update_one(
            {"email": {"$regex": f"^{re.escape(credentials.email)}$", "$options": "i"}},
            {"$set": {"password": pwd_context.hash(password), "updatedAt": datetime.now(timezone.utc)}, "$inc": {"sessionVersion": 1}},
        )
        if not result.matched_count:
            raise SystemExit("Account not found; no account was created")
    print("Password reset; existing sessions revoked. Account role unchanged.")


if __name__ == "__main__":
    main()
