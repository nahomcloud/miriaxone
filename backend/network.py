"""Miriax One service availability, shared by discovery and checkout."""
from fastapi import Depends, HTTPException

SERVICE_NAMES = {'container': 'Fill a Container', 'ship-items': 'Ship My Items'}


async def configuration(db):
    # Archived rules remain deny rules: archiving must never reopen a route.
    services = [dict(key=key, name=name, status='active', visibility='visible') for key, name in SERVICE_NAMES.items()]
    for rule in [r async for r in db.platformServices.find({})]:
        for service in services:
            if service['key'] == rule.get('key'):
                service.update({k: rule[k] for k in ('name', 'status', 'visibility') if k in rule})
                if rule.get('archived'):
                    service.update(status='unavailable', visibility='hidden')
    countries = [dict(iso=c['isoCode'], name=c['name'], canSendFrom=c.get('canSendFrom', 1), canDeliverTo=c.get('canDeliverTo', 1))
                 async for c in db.countries.find({'isActive': 1, 'archived': {'$ne': True}})]
    routes = [{k: r.get(k) for k in ('origin', 'destination', 'service', 'status', 'visibility', 'archived')}
              async for r in db.platformRoutes.find({})]
    return dict(services=services, countries=countries, routes=routes, managedNetwork=bool(routes))


def resolve(config, origin, destination, key):
    service = next((s for s in config['services'] if s['key'] == key), None)
    if not service or service['status'] != 'active' or service['visibility'] != 'visible':
        return 'This service is not currently available.'
    source = next((c for c in config['countries'] if c['iso'] == origin), None)
    target = next((c for c in config['countries'] if c['iso'] == destination), None)
    if not source or not source['canSendFrom']:
        return 'Select an available origin country.'
    if not target or not target['canDeliverTo']:
        return 'Select an available destination country.'
    if config['managedNetwork']:
        matches = [r for r in config['routes'] if r['origin'] == origin and r['destination'] == destination and r['service'] == key]
        if not matches or any(r['archived'] or r['status'] != 'active' or r['visibility'] != 'visible' for r in matches):
            return 'This service is not available on the selected route.'
    return ''


async def require_available(db, origin, destination, key):
    reason = resolve(await configuration(db), origin, destination, key)
    if reason:
        raise HTTPException(422, reason)


def install(app, database):
    @app.get('/site/platform-config')
    async def platform_config(db=Depends(database)):
        return await configuration(db)

    @app.get('/site/availability')
    async def availability(origin: str, destination: str, db=Depends(database)):
        config = await configuration(db)
        return [dict(**s, available=not (reason := resolve(config, origin.upper(), destination.upper(), s['key'])), reason=reason)
                for s in config['services'] if s['visibility'] == 'visible']
