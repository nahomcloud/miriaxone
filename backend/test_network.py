import copy
import unittest
from backend.network import resolve
from backend.test_admin import AdminTests


class ResolverTests(unittest.TestCase):
    def setUp(self):
        self.config = {'services':[dict(key='ship-barrel',name='Ship a Barrel',status='active',visibility='visible')],
            'countries':[dict(iso='US',canSendFrom=1,canDeliverTo=1),dict(iso='ET',canSendFrom=1,canDeliverTo=1)],
            'managedNetwork':True,'routes':[dict(origin='US',destination='ET',service='ship-barrel',status='active',visibility='visible',archived=False)]}

    def test_valid_route_and_legacy_compatibility(self):
        self.assertEqual(resolve(self.config,'US','ET','ship-barrel'),'')
        self.config.update(managedNetwork=False,routes=[])
        self.assertEqual(resolve(self.config,'US','ET','ship-barrel'),'')

    def test_all_deny_rules_override_active_routes(self):
        for collection,field,value in [('services','status','suspended'),('services','visibility','hidden'),('countries','canSendFrom',0),('routes','archived',True),('routes','status','coming-soon'),('routes','visibility','hidden')]:
            config=copy.deepcopy(self.config)
            config[collection][0][field]=value
            self.assertTrue(resolve(config,'US','ET','ship-barrel'),(collection,field))
        self.assertTrue(resolve(self.config,'ET','US','ship-barrel'))
        self.assertTrue(resolve(self.config,'US','ET','gift'))
        self.config['countries'][1]['canDeliverTo']=0
        self.assertTrue(resolve(self.config,'US','ET','ship-barrel'))


class NetworkApiTests(unittest.TestCase):
    setUp = AdminTests.setUp
    tearDown = AdminTests.tearDown
    create = AdminTests.create

    def test_checkout_cannot_bypass_disabled_service(self):
        product=self.create('product')
        container=self.create('container')
        self.db.platformServices.records.append(dict(key='ship-barrel',name='Ship a Barrel',status='suspended',visibility='visible'))
        data=dict(name='Sender',email='sender@example.com',phone='1234567',fromCountry='ET',toCountry='ET',shippingType=str(self.shipping['_id']),containerId=container['_id'],productId=product['_id'],weight='2',itemsCount='1',description='Books')
        response=self.client.post('/site/checkout',data=data)
        self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(len(self.db.orders.records),0)

    def test_network_persistence_validation_and_public_availability(self):
        service=dict(key='ship-barrel',name='Ship a Barrel',status='suspended',visibility='visible')
        self.assertEqual(self.client.post('/admin/service',json=service).status_code,401)
        created=self.client.post('/admin/service',json=service,headers=self.headers)
        self.assertEqual(created.status_code,200,created.text)
        self.assertEqual(self.client.post('/admin/service',json=service,headers=self.headers).status_code,409)
        self.assertEqual(self.client.put('/admin/service/'+created.json()['_id'],json={'key':'express-gifts'},headers=self.headers).status_code,422)
        availability=self.client.get('/site/availability?origin=ET&destination=ET').json()
        self.assertFalse(next(s for s in availability if s['key']=='ship-barrel')['available'])
        route=dict(name='Test route',origin='ET',destination='ET',service='ship-barrel',status='active',visibility='visible')
        created=self.client.post('/admin/network-route',json=route,headers=self.headers)
        self.assertEqual(created.status_code,200,created.text)
        self.assertTrue(self.client.get('/site/platform-config').json()['managedNetwork'])
        self.assertEqual(self.client.post('/admin/network-route',json=route|{'destination':'ZZ'},headers=self.headers).status_code,422)


del AdminTests

if __name__ == '__main__':
    unittest.main()
