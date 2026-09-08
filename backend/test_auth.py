"""Account API regression tests. Uses an in-memory database; never connects to Atlas."""
import copy
import os
import re
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

os.environ["JWT_SECRET"] = "test-only-secret-32-bytes-do-not-deploy"

import jwt
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError
from backend import main


def matches(document, query):
    for key, value in query.items():
        if key == "$and":
            if not all(matches(document, branch) for branch in value):
                return False
        elif key == "$or":
            if not any(matches(document, branch) for branch in value):
                return False
        elif isinstance(value, dict) and "$ne" in value:
            if document.get(key) == value['$ne']:
                return False
        elif isinstance(value, dict) and "$regex" in value:
            if not re.search(value["$regex"], str(document.get(key, "")), re.I):
                return False
        elif document.get(key) != value:
            return False
    return True


class Cursor:
    def __init__(self, records):
        self.records = records

    def limit(self, count):
        self.records = self.records[:count]
        return self

    def skip(self, count):
        self.records = self.records[count:]
        return self

    def sort(self, fields, direction=None):
        for key, order in reversed(fields if isinstance(fields, list) else [(fields, direction)]):
            self.records.sort(key=lambda item: str(item.get(key, '')), reverse=order == -1)
        return self

    def __aiter__(self):
        async def iterate():
            for record in self.records:
                yield copy.deepcopy(record)
        return iterate()


class Collection:
    def __init__(self):
        self.records = []

    async def find_one(self, query, **kwargs):
        return next((copy.deepcopy(d) for d in self.records if matches(d, query)), None)

    def find(self, query):
        return Cursor([d for d in self.records if matches(d, query)])

    async def count_documents(self, query):
        return sum(matches(d, query) for d in self.records)

    async def insert_one(self, document, **kwargs):
        document = copy.deepcopy(document)
        document.setdefault("_id", ObjectId())
        self.records.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    async def update_one(self, query, changes, **kwargs):
        for document in self.records:
            if matches(document, query):
                document.update(changes.get("$set", {}))
                for key, value in changes.get("$inc", {}).items():
                    document[key] = document.get(key, 0) + value
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def find_one_and_update(self, query, changes, **kwargs):
        if not await self.find_one(query):
            if not kwargs.get('upsert'):
                return None
            await self.insert_one(query | changes.get("$setOnInsert", {}))
        await self.update_one(query, changes)
        return await self.find_one(query)


class Database:
    def __init__(self):
        self.collections = {}
        self.client = FakeClient(self)

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())

    def __getattr__(self, name):
        return self[name]


class FakeSession:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        self.snapshot = copy.deepcopy(self.db.collections)
        return self

    async def __aexit__(self, kind, value, traceback):
        if kind:
            self.db.collections = self.snapshot

    def start_transaction(self):
        return FakeSession(self.db)


class FakeClient:
    def __init__(self, db):
        self.db = db

    async def start_session(self):
        return FakeSession(self.db)


class AccountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = "Test-password-123!"
        cls.hashed = main.pwd_context.hash(cls.password)

    def setUp(self):
        self.db = Database()
        main.app.dependency_overrides[main.database] = lambda: self.db
        self.client = TestClient(main.app)  # Intentionally does not enter the Mongo lifespan.
        self.user = {"_id": ObjectId(), "email": "customer@example.com", "username": "customer", "name": "Customer", "role": "user", "countryCode": "US", "mobile": "123456789", "password": self.hashed}
        self.db.users.records.append(self.user)
        self.db.countries.records.append({'_id': ObjectId(), 'isoCode': 'ET', 'name': 'Ethiopia', 'phonecode': '251', 'flag': 'ET', 'currency': 'ETB', 'isActive': 1})
        self.headers = {"Authorization": f"Bearer {main.issue_token(self.user)}"}

    def tearDown(self):
        self.client.close()
        main.app.dependency_overrides.clear()

    def registration(self, **changes):
        return {"email": "new@example.com", "password": self.password, "username": "newuser", "name": "New User", "countryCode": "US", "mobile": "123456789"} | changes

    def test_login_normalizes_email_and_never_returns_hash(self):
        response = self.client.post('/auth/login', json={"email": " CUSTOMER@Example.com ", "password": self.password})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('password', response.json()['user'])
        self.assertNotIn(self.hashed, response.text)

    def test_bad_password_unknown_email_and_malformed_hash(self):
        for email, password in [('customer@example.com', 'wrong'), ('absent@example.com', self.password)]:
            self.assertEqual(self.client.post('/auth/login', json={"email": email, "password": password}).status_code, 401)
        self.user['password'] = 'legacy-unsupported-hash'
        self.assertEqual(self.client.post('/auth/login', json={"email": self.user['email'], "password": self.password}).status_code, 401)

    def test_registration_safe_response_and_default_role(self):
        response = self.client.post('/auth/register', json=self.registration())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user']['role'], 'user')
        self.assertNotIn('password', response.json()['user'])
        self.assertNotEqual(self.db.users.records[-1]['password'], self.password)

    def test_registration_validation_and_privilege_injection(self):
        for changes in ({'password': 'short'}, {'password': '😀' * 30}, {'email': 'bad'}, {'name': '   '}, {'username': 'Root'}, {'role': 'admin'}, {'sessionVersion': 99}):
            with self.subTest(changes=list(changes)):
                self.assertEqual(self.client.post('/auth/register', json=self.registration(**changes)).status_code, 422)

    def test_case_insensitive_duplicate(self):
        self.assertEqual(self.client.post('/auth/register', json=self.registration(email='CUSTOMER@example.com')).status_code, 409)
        self.assertEqual(self.client.post('/auth/register', json=self.registration(username='CUSTOMER')).status_code, 409)

    def test_duplicate_race_returns_conflict(self):
        with patch.object(self.db.users, 'insert_one', side_effect=DuplicateKeyError('duplicate')):
            self.assertEqual(self.client.post('/auth/register', json=self.registration()).status_code, 409)

    def test_protected_routes_reject_anonymous_and_customers(self):
        for route in ('/order', '/product', '/container', '/tax-rate', '/country-document', '/contact-us', '/country', '/state', '/city', '/global-settings'):
            self.assertEqual(self.client.get(route).status_code, 401, route)
            self.assertEqual(self.client.get(route, headers=self.headers).status_code, 403, route)
        for route in ('/auth/me', '/account/orders'):
            self.assertEqual(self.client.get(route).status_code, 401)

    def test_admin_access_uses_current_database_role(self):
        self.user['role'] = 'admin'
        self.assertEqual(self.client.get('/order', headers=self.headers).status_code, 200)
        self.user['role'] = 'user'
        self.assertEqual(self.client.get('/order', headers=self.headers).status_code, 403)

    def test_admin_cannot_override_collection(self):
        self.user['role'] = 'admin'
        self.assertEqual(self.client.get('/order?resource=users', headers=self.headers).json(), [])

    def test_invalid_expired_and_missing_claims(self):
        now = datetime.now(timezone.utc)
        for claims in ({'sub': 'invalid', 'exp': now + timedelta(hours=1), 'iat': now, 'ver': 0}, {'sub': str(self.user['_id']), 'exp': now - timedelta(seconds=1), 'iat': now, 'ver': 0}, {'sub': str(self.user['_id'])}):
            token = jwt.encode(claims, main.JWT_SECRET, algorithm='HS256')
            self.assertEqual(self.client.get('/auth/me', headers={'Authorization': f'Bearer {token}'}).status_code, 401)
        self.assertEqual(self.client.get('/auth/me', headers={'Authorization': 'Bearer nonsense'}).status_code, 401)

    def test_disabled_and_deleted_accounts(self):
        self.user['status'] = 'disabled'
        self.assertEqual(self.client.get('/auth/me', headers=self.headers).status_code, 401)
        self.assertEqual(self.client.post('/auth/login', json={'email': self.user['email'], 'password': self.password}).status_code, 401)
        self.db.users.records.clear()
        self.assertEqual(self.client.get('/auth/me', headers=self.headers).status_code, 401)

    def test_logout_revokes_tokens_on_server(self):
        self.assertEqual(self.client.post('/auth/logout', headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers=self.headers).status_code, 401)
        response = self.client.post('/auth/login', json={'email': self.user['email'], 'password': self.password})
        self.assertEqual(self.client.get('/auth/me', headers={'Authorization': 'Bearer ' + response.json()['token']}).status_code, 200)

    def test_order_history_is_scoped_to_owner(self):
        self.db.orders.records.extend([{'_id': ObjectId(), 'userId': str(self.user['_id'])}, {'_id': ObjectId(), 'userId': str(ObjectId())}, {'_id': ObjectId(), 'email': self.user['email']}])
        response = self.client.get('/account/orders?userId=someone-else', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    def test_checkout_ownership_cannot_be_spoofed(self):
        shipping_id, container_id, product_id = ObjectId(), ObjectId(), ObjectId()
        self.db.containers.records.append({'_id':container_id, 'shippingType':shipping_id, 'countryCode':'ET', 'price':20, 'isActive':1})
        self.db.products.records.append({'_id':product_id, 'price':10, 'isActive':1})
        data={'name':'Customer','email':'customer@example.com','phone':'1234567','fromCountry':'ET','toCountry':'ET','shippingType':str(shipping_id),'containerId':str(container_id),'productId':str(product_id),'weight':'1','itemsCount':'1','description':'Books','userId':'other','status':'paid','price':'0'}
        self.assertEqual(self.client.post('/site/checkout', data=data, headers=self.headers).status_code, 200)
        order = self.db.orders.records[-1]
        self.assertEqual(order['userId'], str(self.user['_id']))
        self.assertEqual(order['status'], 'pending')
        self.assertEqual(order['price'], 30)
        self.assertEqual(order['isPaid'], 0)
        self.client.post('/site/checkout', data=data)
        self.assertNotIn('userId', self.db.orders.records[-1])

    def test_profile_cannot_change_privileges(self):
        data = {'name': 'Updated Name', 'countryCode': 'US', 'mobile': '1234567'}
        self.assertEqual(self.client.patch('/auth/me', json=data | {'role': 'admin'}, headers=self.headers).status_code, 422)
        response = self.client.patch('/auth/me', json=data, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['name'], 'Updated Name')
        self.assertNotIn('password', response.json())

    def test_public_tracking_does_not_expose_account_details(self):
        order_id = ObjectId()
        self.db.orders.records.append({'_id': order_id, 'status': 'pending', 'userId': str(self.user['_id']), 'email': self.user['email'], 'checkoutData': 'private address', 'files': ['private-document']})
        response = self.client.get(f'/site/track-order/{order_id}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()['order']), {'_id', 'status'})
        self.assertNotIn('private', response.text)

    def test_password_change_checks_old_password_and_revokes_sessions(self):
        data = {'currentPassword': 'wrong', 'newPassword': 'Replacement-password-456!'}
        self.assertEqual(self.client.post('/auth/password', json=data, headers=self.headers).status_code, 400)
        data['currentPassword'] = self.password
        self.assertEqual(self.client.post('/auth/password', json=data, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers=self.headers).status_code, 401)
        self.assertEqual(self.client.post('/auth/login', json={'email': self.user['email'], 'password': self.password}).status_code, 401)
        self.assertEqual(self.client.post('/auth/login', json={'email': self.user['email'], 'password': data['newPassword']}).status_code, 200)

    def test_rate_limit(self):
        with patch.object(main, 'verify_password', return_value=False):
            for _ in range(30):
                self.assertEqual(self.client.post('/auth/login', json={'email': 'absent@example.com', 'password': 'wrong'}).status_code, 401)
            self.assertEqual(self.client.post('/auth/login', json={'email': 'absent@example.com', 'password': 'wrong'}).status_code, 429)

    def test_admin_creates_and_edits_tax_rate(self):
        self.user['role'] = 'admin'
        response = self.client.post('/tax-rate', json={'name': 'VAT', 'countryCode': 'ET', 'rate': 15}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        created = response.json()
        response = self.client.put('/tax-rate/' + created['_id'], json=created | {'rate': 10, 'createdAt': 'tampered'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['rate'], 10)
        self.assertEqual(response.json()['createdAt'], created['createdAt'])
        self.assertEqual(self.client.get('/tax-rate', headers=self.headers).json()[0]['rate'], 10)

    def test_tax_writes_require_admin(self):
        for headers, status in (({}, 401), (self.headers, 403)):
            self.assertEqual(self.client.post('/tax-rate', json={'rate': 15}, headers=headers).status_code, status)
            self.assertEqual(self.client.put('/tax-rate/' + str(ObjectId()), json={'rate': 15}, headers=headers).status_code, status)

    def test_admin_edits_each_existing_collection_without_creating_missing_records(self):
        self.user['role'] = 'admin'
        for resource in ('order',):
            item_id = ObjectId()
            self.db[main.collection_name(resource)].records.append({'_id': item_id, 'name': 'Original', 'price': 10, 'cart': {}})
            response = self.client.put(f'/{resource}/{item_id}', json={'name': 'Updated'}, headers=self.headers)
            self.assertEqual(response.status_code, 200, resource)
            self.assertEqual(response.json()['name'], 'Updated')
            self.assertEqual(self.client.put(f'/{resource}/{ObjectId()}', json={'name': 'Missing'}, headers=self.headers).status_code, 404)

    def test_invalid_admin_payloads_are_rejected(self):
        self.user['role'] = 'admin'
        for payload in ({'rate': -1}, {'rate': 101}, {'rate': '15'}, {'rate': True}, {'$set': {'rate': 15}}, {'nested': {'a.b': 1}}, {}):
            self.assertEqual(self.client.post('/tax-rate', json=payload, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.put('/tax-rate/not-an-id', json={'rate': 15}, headers=self.headers).status_code, 422)

    def test_no_admin_delete_endpoint_added(self):
        self.user['role'] = 'admin'
        self.assertEqual(self.client.delete('/tax-rate/' + str(ObjectId()), headers=self.headers).status_code, 405)


if __name__ == '__main__':
    unittest.main()
