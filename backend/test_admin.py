"""Admin workflow tests using an isolated in-memory database, never Atlas."""
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from bson import ObjectId
from fastapi.testclient import TestClient
from backend.test_auth import Database
from backend import main
from backend.admin import COLLECTIONS


class AdminTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        main.app.dependency_overrides[main.database] = lambda: self.db
        self.client = TestClient(main.app)
        self.admin = {'_id': ObjectId(), 'email': 'admin@example.com', 'role': 'admin'}
        self.db.users.records.append(self.admin)
        self.headers = {'Authorization': 'Bearer ' + main.issue_token(self.admin)}
        self.country = {'_id': ObjectId(), 'name': 'Ethiopia', 'isoCode': 'ET', 'phonecode': '251', 'flag': 'ET', 'currency': 'ETB', 'isActive': 1}
        self.db.countries.records.append(self.country)
        self.state = {'_id': ObjectId(), 'name': 'Addis Ababa', 'isoCode': 'AA', 'countryCode': 'ET'}
        self.db.states.records.append(self.state)
        self.shipping = {'_id': ObjectId(), 'name': 'Air'}
        self.db.shippingTypes.records.append(self.shipping)
        self.payloads = {
            'order': {'name': 'Shipment', 'price': 100, 'cart': {'formData': {'name': 'Sender'}, 'cartData': {'cartItems': []}}},
            'product': {'name': 'Box', 'price': 12, 'width': 2, 'height': 3, 'depth': 4, 'weight': 5, 'isActive': 1},
            'container': {'countryCode': 'ET', 'shippingType': str(self.shipping['_id']), 'width': 2, 'height': 3, 'depth': 4, 'price': 50},
            'tax-rate': {'name': 'VAT', 'countryCode': 'ET', 'rate': 15},
            'country-document': {'name': 'Invoice', 'countryCode': 'ET', 'shippingType': str(self.shipping['_id']), 'description': 'Upload invoice'},
            'contact-us': {'name': 'Sender', 'email': 'sender@example.com', 'phone': '123456789', 'subject': 'Shipment question', 'message': 'Where is my parcel?'},
            'country': {'name': 'Canada', 'isoCode': 'CA', 'phonecode': '1', 'flag': 'CA', 'currency': 'CAD', 'isActive': 1},
            'state': {'name': 'Amhara', 'isoCode': 'AM', 'countryCode': 'ET'},
            'city': {'name': 'Addis Ababa', 'countryCode': 'ET', 'stateCode': 'AA'},
            'global-settings': {'name': 'Support email', 'slug': 'support_email', 'type': 'public', 'value': 'support@example.com'},
        }

    def tearDown(self):
        self.client.close()
        main.app.dependency_overrides.clear()

    def create(self, resource, **changes):
        response = self.client.post('/admin/' + resource, headers=self.headers, json=self.payloads[resource] | changes)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_all_ten_sections_create_list_view_edit_archive_restore(self):
        for resource in self.payloads:
            with self.subTest(resource=resource):
                item = self.create(resource)
                path = f'/admin/{resource}/{item["_id"]}'
                self.assertEqual(self.client.get(path, headers=self.headers).status_code, 200)
                listing = self.client.get('/admin/' + resource, headers=self.headers).json()
                self.assertIn(item['_id'], [row['_id'] for row in listing['items']])
                field = 'description' if resource == 'container' else 'name'
                response = self.client.put(path, headers=self.headers, json={field: 'Updated'})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()[field], 'UPDATED' if resource == 'tax-rate' else 'Updated')
                self.assertEqual(self.client.delete(path, headers=self.headers).status_code, 200)
                self.assertIsNotNone(next((row for row in self.db[COLLECTIONS[resource]].records if str(row['_id']) == item['_id']), None))
                archived = self.client.get('/admin/' + resource + '?archived=true', headers=self.headers).json()['items']
                self.assertIn(item['_id'], [row['_id'] for row in archived])
                self.assertEqual(self.client.put(path, headers=self.headers, json={field: 'Blocked'}).status_code, 404)
                self.assertEqual(self.client.post(path + '/restore', headers=self.headers).status_code, 200)

    def test_admin_authorization_for_every_resource_and_operation(self):
        for role, expected in [('user', 403), (None, 401)]:
            self.admin['role'] = role
            headers = self.headers if role else {}
            for resource, payload in self.payloads.items():
                path = '/admin/' + resource
                for method, target in [('GET', path), ('GET', path + '/' + str(ObjectId())), ('POST', path), ('PUT', path + '/' + str(ObjectId())), ('DELETE', path + '/' + str(ObjectId())), ('POST', path + '/' + str(ObjectId()) + '/restore')]:
                    self.assertEqual(self.client.request(method, target, headers=headers, json=payload).status_code, expected, target)

    def test_pagination_search_sort_and_country_filter(self):
        for index in range(32):
            self.create('city', name=f'City {index:02}')
        response = self.client.get('/admin/city?perPage=10&page=2&sort=name&countryCode=ET&q=City', headers=self.headers).json()
        self.assertEqual(response['totalRecords'], 32)
        self.assertEqual(len(response['items']), 10)
        self.assertEqual(response['items'][0]['name'], 'City 10')
        self.assertEqual(self.client.get('/admin/city?sort=$where', headers=self.headers).status_code, 422)
        self.assertEqual(self.client.get('/admin/city?perPage=1000', headers=self.headers).status_code, 422)

    def test_canonical_collection_names_and_objectid_relationships(self):
        for resource in ['container', 'country-document', 'tax-rate', 'global-settings']:
            self.create(resource)
            self.assertEqual(len(self.db[COLLECTIONS[resource]].records), 1)
        self.assertIsInstance(self.db.containers.records[0]['shippingType'], ObjectId)
        self.assertIsInstance(self.db.countryDocuments.records[0]['shippingType'], ObjectId)

    def test_public_catalog_filters_both_route_and_shipping_method(self):
        self.create('container')
        self.create('container', isActive=0)
        self.db.shippingTypes.records.append({'_id': ObjectId(), 'name': 'Cargo'})
        self.create('container', shippingType=str(self.db.shippingTypes.records[-1]['_id']))
        records = self.client.get('/container/ET/' + str(self.shipping['_id'])).json()
        self.assertEqual(len(records), 1)
        self.assertEqual(self.client.get('/container/XX/' + str(self.shipping['_id'])).json(), [])
        self.create('product'); self.create('product', name='Inactive box', isActive=0)
        self.assertEqual(len(self.client.get('/product/products-list').json()), 1)

    def test_geography_validation_and_archive_dependency_checks(self):
        self.assertEqual(self.client.post('/admin/city', headers=self.headers, json=self.payloads['city'] | {'stateCode': 'missing'}).status_code, 422)
        self.assertEqual(self.client.post('/admin/state', headers=self.headers, json=self.payloads['state'] | {'countryCode': 'XX'}).status_code, 422)
        self.assertEqual(self.client.delete('/admin/country/' + str(self.country['_id']), headers=self.headers).status_code, 409)
        self.assertEqual(self.client.put('/admin/state/' + str(self.state['_id']), headers=self.headers, json={'isoCode': 'RENAME'}).status_code, 422)
        self.create('city')
        self.assertEqual(self.client.delete('/admin/state/' + str(self.state['_id']), headers=self.headers).status_code, 409)

    def test_public_geography_and_availability(self):
        self.create('city')
        self.assertEqual(len(self.client.get('/site/states/ET').json()), 1)
        self.assertEqual(len(self.client.get('/site/cities/ET/AA').json()), 1)
        self.assertEqual(self.client.get('/site/cities/ET/OTHER').json(), [])
        response = self.client.put('/admin/country/' + str(self.country['_id']), headers=self.headers, json={'isActive': 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/site/countries').json(), [])

    def test_private_setting_is_never_returned_and_blank_preserves_value(self):
        item = self.create('global-settings', slug='square_payment_access_token', type='public', value='test-secret-never-display')
        self.assertEqual(item['type'], 'private')
        self.assertEqual(item['value'], '')
        for path in ['/admin/global-settings', '/admin/global-settings/' + item['_id'], '/global-settings', '/site/settings']:
            self.assertNotIn('test-secret-never-display', self.client.get(path, headers=self.headers).text)
        response = self.client.put('/admin/global-settings/' + item['_id'], headers=self.headers, json={'value': '', 'type': 'public'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.globalSettings.records[0]['value'], 'test-secret-never-display')
        self.assertEqual(self.db.globalSettings.records[0]['type'], 'private')
        self.client.put('/admin/global-settings/' + item['_id'], headers=self.headers, json={'value': 'rotated-secret'})
        self.assertEqual(self.db.globalSettings.records[0]['value'], 'rotated-secret')
        self.assertEqual(self.client.get('/site/settings').json(), {})

    def test_public_setting_visibility_and_archive(self):
        item = self.create('global-settings')
        self.assertEqual(self.client.get('/site/settings').json()['support_email'], 'support@example.com')
        self.client.delete('/admin/global-settings/' + item['_id'], headers=self.headers)
        self.assertEqual(self.client.get('/site/settings').json(), {})

    def test_order_tracking_updates_status_and_history_atomically(self):
        item = self.create('order')
        path = '/admin/order/' + item['_id']
        response = self.client.post(path + '/tracking', headers=self.headers, json={'status': 'in-transit', 'comments': 'Departed hub'})
        self.assertEqual(response.status_code, 200, response.text)
        order = self.client.get(path, headers=self.headers).json()
        self.assertEqual(order['status'], 'in-transit')
        self.assertEqual(order['tracking'][0]['comments'], 'Departed hub')
        public = self.client.get('/site/track-order/' + item['_id']).json()
        self.assertEqual(public['tracking'][0]['description'], 'Departed hub')
        self.assertEqual(public['status'], 'in-transit')
        self.assertEqual(self.client.put(path, headers=self.headers, json={'isPaid': 1}).status_code, 422)
        self.assertEqual(self.client.put(path, headers=self.headers, json={'status': 'delivered'}).status_code, 422)

    def test_invalid_tracking_and_transaction_failure_leave_order_unchanged(self):
        item = self.create('order')
        path = '/admin/order/' + item['_id'] + '/tracking'
        self.assertEqual(self.client.post(path, headers=self.headers, json={'status': 'invented'}).status_code, 422)
        with patch.object(self.db.orders, 'update_one', side_effect=RuntimeError('Simulated write failure')):
            with self.assertRaises(RuntimeError):
                self.client.post(path, headers=self.headers, json={'status': 'confirmed'})
        self.assertEqual(len(self.db.orderTracking.records), 0)
        self.assertEqual(self.db.orders.records[0]['status'], 'pending')

    def test_contacts_can_be_resolved_without_sending_a_message(self):
        item = self.create('contact-us')
        response = self.client.put('/admin/contact-us/' + item['_id'], headers=self.headers, json={'status': 'resolved', 'notes': 'Called sender'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'resolved')
        self.assertEqual(self.client.get('/admin/contact-us?status=resolved', headers=self.headers).json()['totalRecords'], 1)

    def test_resource_and_field_injection_rejected(self):
        self.assertEqual(self.client.get('/admin/users', headers=self.headers).status_code, 404)
        self.assertEqual(self.client.post('/admin/users', headers=self.headers, json={}).status_code, 404)
        self.assertEqual(self.client.post('/admin/tax-rate', headers=self.headers, json=self.payloads['tax-rate'] | {'$set': {}}).status_code, 422)
        self.assertEqual(self.client.post('/admin/container', headers=self.headers, json=self.payloads['container'] | {'image': 'javascript:alert(1)'}).status_code, 422)
        self.assertEqual(self.client.get('/admin/order/invalid', headers=self.headers).status_code, 422)

    def test_upload_rejects_scripts_and_oversized_files(self):
        self.assertEqual(self.client.post('/admin/uploads/container-image', headers=self.headers, files={'file': ('image.svg', b'<svg/>', 'image/svg+xml')}).status_code, 422)
        self.assertEqual(self.client.post('/admin/uploads/container-image', headers=self.headers, files={'file': ('image.jpg', b'x' * (5 * 1024 * 1024 + 1), 'image/jpeg')}).status_code, 413)
        self.assertEqual(self.client.get('/media/invalid.jpg').status_code, 404)

    def test_checkout_stores_documents_privately_and_uses_server_quote(self):
        product = self.create('product')
        container = self.create('container', serviceCharge=5, otherCharge=3)
        self.create('tax-rate')
        self.create('country-document')
        data={'name':'Sender','email':'sender@example.com','phone':'1234567','fromCountry':'ET','toCountry':'ET','shippingType':str(self.shipping['_id']),'containerId':container['_id'],'productId':product['_id'],'weight':'2','itemsCount':'1','description':'Books','price':'0','isPaid':'1'}
        self.assertEqual(self.client.post('/site/checkout',data=data).status_code,422)
        with tempfile.TemporaryDirectory() as directory, patch('backend.checkout.STORAGE',Path(directory)):
            response=self.client.post('/site/checkout',data=data,files={'document_0':('invoice.pdf',b'%PDF-1.4 test document','application/pdf')})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['total'],80.5)
            order=self.db.orders.records[-1]
            self.assertEqual(order['isPaid'],0)
            document=next(iter(order['files'].values()))[0]
            url=f"/admin/order/{order['_id']}/documents/{document['storageKey']}"
            self.assertEqual(self.client.get(url).status_code,401)
            self.assertEqual(self.client.get(url,headers=self.headers).content,b'%PDF-1.4 test document')
            self.assertEqual(self.client.get(f"/admin/order/{ObjectId()}/documents/{document['storageKey']}",headers=self.headers).status_code,404)

    def test_gift_checkout_creates_server_order_and_rejects_tampered_price(self):
        payload = {'items': [{'productId': 'roses12', 'name': 'Red Roses (12 stems)', 'qty': 2, 'price': 45, 'sizeLabel': 'Classic', 'delivery': 'Same Day'}],
                   'address': {'recipient': 'Family', 'city': 'Addis Ababa', 'address': 'Bole', 'phone': '+251'}, 'instructions': 'Call first', 'submittedTotal': 90}
        response = self.client.post('/site/gift-checkout', headers=self.headers, json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 90)
        order = self.db.orders.records[-1]
        self.assertEqual(order['status'], 'pending')
        self.assertEqual(order['isPaid'], 0)
        self.assertEqual(order['cart']['formData']['serviceKey'], 'express-gifts')
        tampered = payload | {'items': [payload['items'][0] | {'price': 1}], 'submittedTotal': 2}
        self.assertEqual(self.client.post('/site/gift-checkout', headers=self.headers, json=tampered).status_code, 422)

    def test_public_contact_validates_and_initializes_handling_status(self):
        response=self.client.post('/contact-us',json=self.payloads['contact-us'])
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.db.contacts.records[0]['status'],'new')
        self.assertEqual(self.client.post('/contact-us',json=self.payloads['contact-us']|{'status':'resolved'}).status_code,422)


if __name__ == '__main__':
    unittest.main()
