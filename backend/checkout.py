"""Create schema-compatible orders using server catalog prices and private uploads."""
import json
import math
import secrets
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from bson import ObjectId
from fastapi import Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from starlette.datastructures import UploadFile
from backend.network import require_available
from backend.storage import save_upload, read_upload

STORAGE = Path(__file__).resolve().parent / "order_files"
GIFT_CATALOG = {
    "roses12": {"name": "Red Roses (12 stems)", "price": 45, "variants": {"roses12-classic": 45, "roses12-deluxe": 68}},
    "bouquet": {"name": "Mixed Seasonal Bouquet", "price": 65, "variants": {"bouquet-small": 65, "bouquet-large": 95}},
    "sunflwr": {"name": "Sunflower Bunch (10)", "price": 40, "variants": {}},
    "coffee": {"name": "Ethiopian Coffee Gift Box", "price": 38, "variants": {"coffee-500": 38, "coffee-1kg": 62}},
    "chocolate": {"name": "Premium Chocolate Hamper", "price": 58, "variants": {}},
    "fragrance": {"name": "Signature Fragrance", "price": 78, "variants": {"frag-30": 78, "frag-100": 128}},
    "care-box": {"name": "Family Care Box", "price": 72, "variants": {"care-small": 72, "care-family": 118}},
    "cake": {"name": "Celebration Cake", "price": 52, "variants": {"cake-8": 52, "cake-10": 78}},
}


def gift_unit_price(product, raw_label: str) -> Decimal:
    variants = product["variants"]
    if not raw_label:
        return Decimal(str(product["price"]))
    raw = raw_label.strip().lower()
    compact = raw.replace(" ", "-")
    aliases = {"500g": "500", "30ml": "30", "100ml": "100", "8-inch": "8", "10-inch": "10", "8inch": "8", "10inch": "10"}
    wanted = aliases.get(compact, compact)
    if raw in variants:
        return Decimal(str(variants[raw]))
    for key, value in variants.items():
        suffix = key.split("-", 1)[-1].lower()
        if wanted in {suffix, key.lower()} or raw in {suffix, key.lower(), suffix.replace("-", " ")}:
            return Decimal(str(value))
    raise HTTPException(422, "Selected gift size is no longer available")


def install(app, database, optional_user, admin_user):
    @app.post("/site/gift-checkout")
    async def gift_checkout(request: Request, db=Depends(database), user=Depends(optional_user)):
        payload = await request.json()
        items = payload.get("items") if isinstance(payload, dict) else None
        address = payload.get("address") if isinstance(payload, dict) else None
        if not isinstance(items, list) or not items:
            raise HTTPException(422, "Add at least one gift item")
        if not isinstance(address, dict) or not all(str(address.get(key, "")).strip() for key in ("recipient", "city", "address", "phone")):
            raise HTTPException(422, "Recipient name, city, address, and phone are required")
        lines = []
        total = Decimal("0")
        for item in items:
            if not isinstance(item, dict):
                raise HTTPException(422, "Invalid gift item")
            product = GIFT_CATALOG.get(str(item.get("productId", "")))
            if not product:
                raise HTTPException(422, "A gift item is no longer available")
            try:
                qty = int(item.get("qty", 0))
            except Exception:
                raise HTTPException(422, "Invalid gift quantity")
            if qty <= 0 or qty > 25:
                raise HTTPException(422, "Gift quantities must be between 1 and 25")
            variant_label = str(item.get("variantId") or item.get("sizeLabel") or "").strip()
            price = gift_unit_price(product, variant_label)
            submitted_price = Decimal(str(item.get("price", -1))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if submitted_price != price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP):
                raise HTTPException(422, "Gift price changed. Refresh the cart and try again")
            total += price * qty
            lines.append({"productId": item.get("productId"), "name": product["name"], "qty": qty, "price": float(price), "sizeLabel": variant_label, "delivery": item.get("delivery", "")})
        submitted_total = Decimal(str(payload.get("submittedTotal", -1))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if submitted_total != total:
            raise HTTPException(422, "Gift total changed. Review the cart and try again")
        email = str(user.get("email", "")).strip() if user else str(payload.get("email", "")).strip()
        if "@" not in email or "." not in email.split("@")[-1] or len(email) > 254:
            raise HTTPException(422, "A valid email is required")
        method = str(payload.get("paymentMethod") or "later").strip()
        if method not in {"card", "mobile", "later"}:
            raise HTTPException(422, "Choose a payment method")
        if any(key in payload for key in ("cardNumber", "cvv", "cvc", "pan")):
            raise HTTPException(422, "Card numbers are not accepted on this form")
        provider = str(payload.get("paymentProvider") or "").strip()[:40]
        payment_phone = "".join(ch for ch in str(payload.get("paymentPhone") or "") if ch.isdigit())[:20]
        if method == "mobile" and len(payment_phone) < 7:
            raise HTTPException(422, "Add the mobile money number")
        if method != "mobile":
            provider, payment_phone = "", ""
        occasion = str(payload.get("occasion", "")).strip()[:80]
        surprise_note = str(payload.get("surpriseNote", "")).strip()[:1000]
        now = datetime.now(timezone.utc)
        order = {"name": f"Express Gifts for {address['recipient']}", "email": email, "price": float(total), "status": "pending", "isPaid": 0, "txnId": "",
                 "createdAt": now, "updatedAt": now, "files": {},
                 "cart": {"formData": {"serviceKey": "express-gifts", "recipient": address["recipient"], "city": address["city"], "address": address["address"], "phone": address["phone"], "instructions": payload.get("instructions", ""), "occasion": occasion, "surpriseNote": surprise_note, "paymentMethod": method, "paymentProvider": provider, "paymentPhone": payment_phone}, "cartData": {"cartItems": lines}, "total": float(total)}}
        if user:
            order["userId"] = str(user["_id"])
        result = await db.orders.insert_one(order)
        return {"model": {"_id": str(result.inserted_id)}, "total": float(total), "message": "Gift order created; payment pending"}

    @app.post("/site/service-request")
    async def service_request(request: Request, db=Depends(database), user=Depends(optional_user)):
        payload = await request.json()
        if not isinstance(payload, dict):
            raise HTTPException(422, "Enter the shipment details")
        service_key = str(payload.get("serviceKey", "")).strip()
        if service_key not in {"ship-barrel", "custom-cargo"}:
            raise HTTPException(422, "Choose a barrel or custom cargo request")
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip()
        phone = str(payload.get("phone", "")).strip()
        summary = str(payload.get("summary", "")).strip()
        if not name or not email or "@" not in email or not phone or len(summary) < 8:
            raise HTTPException(422, "Name, email, phone, and shipment details are required")
        try:
            estimate = float(payload.get("estimate", 0))
        except Exception:
            raise HTTPException(422, "Estimate must be a number")
        if not math.isfinite(estimate) or estimate < 0:
            raise HTTPException(422, "Estimate must be a number")
        now = datetime.now(timezone.utc)
        order = {
            "name": name, "email": email, "phone": phone, "price": round(estimate, 2),
            "status": "quote-requested", "isPaid": 0, "txnId": "", "createdAt": now, "updatedAt": now, "files": {},
            "cart": {"formData": {"serviceKey": service_key, "summary": summary[:4000], "origin": str(payload.get("origin", ""))[:80], "destination": str(payload.get("destination", ""))[:80]}, "cartData": {"cartItems": payload.get("items") if isinstance(payload.get("items"), list) else []}, "total": round(estimate, 2)},
        }
        if user:
            order["userId"] = str(user["_id"])
        result = await db.orders.insert_one(order)
        return {"model": {"_id": str(result.inserted_id)}, "message": "Request received"}

    @app.post("/site/checkout")
    async def checkout(request: Request, db=Depends(database), user=Depends(optional_user)):
        form = await request.form()
        fields = {key: value for key, value in form.items() if isinstance(value, str) and key in {
            "name", "email", "phone", "fromCountry", "toCountry", "shippingType", "containerId", "productId", "weight", "itemsCount", "description", "serviceKey"}}
        for key in ("name", "email", "phone", "fromCountry", "toCountry", "shippingType", "containerId", "productId", "weight", "itemsCount", "description"):
            if not fields.get(key, "").strip():
                raise HTTPException(422, f"{key} is required")
        try:
            shipping_id, container_id, product_id = [ObjectId(fields[key]) for key in ("shippingType", "containerId", "productId")]
            weight, count = float(fields["weight"]), int(fields["itemsCount"])
            if not math.isfinite(weight) or weight <= 0 or count <= 0:
                raise ValueError()
        except Exception:
            raise HTTPException(422, "Invalid shipping selections, weight, or item count")
        for key in ("fromCountry", "toCountry"):
            fields[key] = fields[key].upper()
            if not await db.countries.find_one({"isoCode": fields[key], "isActive": 1, "archived": {"$ne": True}}):
                raise HTTPException(422, "Selected country is not available for shipping")
        fields['serviceKey'] = fields.get('serviceKey', 'ship-barrel')
        await require_available(db, fields['fromCountry'], fields['toCountry'], fields['serviceKey'])
        container = await db.containers.find_one({"_id": container_id, "countryCode": fields["toCountry"], "shippingType": shipping_id, "isActive": 1, "archived": {"$ne": True}})
        product = await db.products.find_one({"_id": product_id, "isActive": 1, "archived": {"$ne": True}})
        if not container or not product:
            raise HTTPException(422, "Selected product or container is no longer available")
        taxes = [item async for item in db.taxRates.find({"countryCode": fields["toCountry"], "archived": {"$ne": True}})]
        requirements = [item async for item in db.countryDocuments.find({"countryCode": fields["toCountry"], "shippingType": shipping_id, "archived": {"$ne": True}})]
        subtotal = sum((Decimal(str(container.get(key, 0))) for key in ("price", "serviceCharge", "otherCharge")), Decimal(str(product["price"])))
        tax = sum((subtotal * Decimal(str(item["rate"])) / 100 for item in taxes), Decimal(0))
        total = (subtotal + tax).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        # Read and validate all required documents before creating files or the order.
        uploads = []
        total_bytes = 0
        for index, requirement in enumerate(requirements):
            upload = form.get(f"document_{index}")
            if not isinstance(upload, UploadFile):
                raise HTTPException(422, f"Upload required: {requirement['name']}")
            content = await upload.read(5 * 1024 * 1024 + 1)
            total_bytes += len(content)
            if not content or len(content) > 5 * 1024 * 1024 or total_bytes > 20 * 1024 * 1024:
                raise HTTPException(413, "Documents must be at most 5 MB each and 20 MB combined")
            extension = 'pdf' if content.startswith(b'%PDF-') else 'png' if content.startswith(b'\x89PNG\r\n\x1a\n') else 'jpg' if content.startswith(b'\xff\xd8\xff') else 'webp' if content.startswith(b'RIFF') and content[8:12] == b'WEBP' else None
            if not extension:
                raise HTTPException(422, "Documents must be PDF, PNG, JPEG, or WebP files")
            uploads.append((str(requirement['_id']), requirement['name'], content, extension))
        now = datetime.now(timezone.utc)
        order = {"name": fields["name"], "price": float(total), "status": "pending", "isPaid": 0, "txnId": "",
                 "createdAt": now, "updatedAt": now, "files": {},
                 "cart": {"formData": fields, "cartData": {"container": container, "cartItems": [product], "taxes": taxes}, "total": float(total)}}
        if user:
            order['userId'] = str(user['_id'])
        # Commit the order and private uploads together; failed checkouts leave no files.
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                for key, name, content, extension in uploads:
                    storage_key = secrets.token_hex(24) + '.' + extension
                    await save_upload(db, 'orders/' + storage_key, content, session=session)
                    order['files'][key] = [{"name": name, "storageKey": storage_key, "size": len(content)}]
                result = await db.orders.insert_one(order, session=session)
        return {"model": {"_id": str(result.inserted_id)}, "total": float(total), "message": "Order created; payment pending"}

    @app.get('/admin/order/{item_id}/documents/{storage_key}', dependencies=[Depends(admin_user)])
    async def document(item_id: str, storage_key: str, db=Depends(database)):
        import re
        if not ObjectId.is_valid(item_id) or not re.fullmatch(r'[a-f0-9]{48}\.(pdf|png|jpg|webp)', storage_key):
            raise HTTPException(404, "Document not found")
        order = await db.orders.find_one({'_id': ObjectId(item_id)})
        if not order or not any(item.get('storageKey') == storage_key for items in order.get('files', {}).values() if isinstance(items, list) for item in items if isinstance(item, dict)):
            raise HTTPException(404, "Document not found")
        content = await read_upload(db, 'orders/' + storage_key)
        if content is not None:
            return Response(content, media_type='application/octet-stream', headers={
                'Content-Disposition': f'attachment; filename="{storage_key}"',
                'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            })
        path = STORAGE / storage_key
        if not path.is_file():
            raise HTTPException(404, "Document is unavailable on this API server")
        return FileResponse(path, filename=storage_key, media_type='application/octet-stream', headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
