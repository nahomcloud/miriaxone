"""Container replacement and transaction regressions; never connects to Atlas."""
import unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path
from fastapi.testclient import TestClient
from backend import main
from backend import test_admin


class StorageTests(unittest.TestCase):
    setUp = test_admin.AdminTests.setUp
    tearDown = test_admin.AdminTests.tearDown
    create = test_admin.AdminTests.create

    def checkout_data(self):
        product = self.create('product')
        container = self.create('container')
        self.create('country-document')
        return {
            'name': 'Sender', 'email': 'sender@example.com', 'phone': '1234567',
            'fromCountry': 'ET', 'toCountry': 'ET', 'shippingType': str(self.shipping['_id']),
            'containerId': container['_id'], 'productId': product['_id'],
            'weight': '2', 'itemsCount': '1', 'description': 'Books',
        }

    def test_image_available_on_a_fresh_server_without_disk(self):
        content = b'\x89PNG\r\n\x1a\ncontainer-persistence-test'
        with patch.object(Path, 'write_bytes', side_effect=AssertionError('No local writes')):
            response = self.client.post('/admin/uploads/container-image', headers=self.headers,
                                        files={'file': ('image.png', content, 'image/png')})
        self.assertEqual(response.status_code, 200, response.text)
        url = response.json()['url']
        fresh = TestClient(main.app)
        try:
            with patch.object(Path, 'is_file', return_value=False):
                fetched = fresh.get(url)
                self.assertEqual(fetched.content, content)
                self.assertEqual(fetched.headers['Content-Type'], 'image/png')
        finally:
            fresh.close()

    def test_private_document_survives_fresh_client_and_cannot_be_read_as_media(self):
        data = self.checkout_data()
        content = b'%PDF-1.4 private container document'
        with patch.object(Path, 'write_bytes', side_effect=AssertionError('No local writes')):
            response = self.client.post('/site/checkout', data=data,
                                        files={'document_0': ('invoice.pdf', content, 'application/pdf')})
        self.assertEqual(response.status_code, 200, response.text)
        order = self.db.orders.records[-1]
        document = next(iter(order['files'].values()))[0]
        url = f"/admin/order/{order['_id']}/documents/{document['storageKey']}"
        fresh = TestClient(main.app)
        try:
            with patch.object(Path, 'is_file', return_value=False):
                self.assertEqual(fresh.get(url).status_code, 401)
                download = fresh.get(url, headers=self.headers)
                self.assertEqual(download.content, content)
                self.assertEqual(download.headers['Cache-Control'], 'no-store')
                self.assertEqual(fresh.get('/media/' + document['storageKey']).status_code, 404)
        finally:
            fresh.close()

    def test_failed_order_write_rolls_back_uploaded_documents(self):
        data = self.checkout_data()
        before = len(self.db.orders.records)
        with patch.object(self.db.orders, 'insert_one', AsyncMock(side_effect=RuntimeError('write failed'))):
            with self.assertRaisesRegex(RuntimeError, 'write failed'):
                self.client.post('/site/checkout', data=data,
                                 files={'document_0': ('invoice.pdf', b'%PDF-1.4 test', 'application/pdf')})
        self.assertEqual(len(self.db.uploads.records), 0)
        self.assertEqual(len(self.db.orders.records), before)


if __name__ == '__main__':
    unittest.main()
