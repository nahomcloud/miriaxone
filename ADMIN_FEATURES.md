# Admin workflows

The `/admin` screen now uses structured forms and validated APIs for all ten sections. The selected section is stored in the URL. Lists support server-side search, sorting, filters, pagination, and an archive view. Archiving preserves the record and supports restoration; there are no permanent-delete operations.

| Section | Available workflows |
| --- | --- |
| Orders | List/search/filter, manual creation, customer and receiver fields, amount and notes editing, historical shipment detail view, payment-state display, tracking history, transactional status updates, private document download, archive/restore. Paid amounts cannot be edited. |
| Products | Create/edit name, price, dimensions and weight; activate/deactivate; archive/restore. Only active, unarchived products appear in public checkout. |
| Containers | Create/edit destination and shipping method, dimensions, price, service/other charges and descriptions; upload PNG/JPEG/WebP image or use an HTTPS image URL; activate/deactivate; archive/restore. Public selection matches destination AND shipping method. |
| Tax rates | Create/edit country, name and percentage (0–100); search/filter; archive/restore. Checkout totals use these server-side rates. |
| Documents | Create/edit document requirements by country and shipping method; description; archive/restore. Checkout enforces the matching requirements. |
| Contacts | View/create/edit inquiries; new/in-progress/resolved status and internal notes; search/filter; archive/restore. No email or SMS is sent by these actions. |
| Countries | Create/edit metadata; activate/deactivate; archive/restore. Referenced countries cannot be archived while dependent records remain. Country codes are immutable after creation. |
| States | Create/edit country-linked states/provinces; search/filter; archive/restore. Codes and parent country are immutable after creation; dependent cities prevent archival. |
| Cities | Create/edit using dependent country/state dropdowns; search/filter; archive/restore. Parent relationships are validated on the server. |
| Settings | Create/edit name, slug, value and public/private visibility; archive/restore. Private values are never returned by list/detail/save APIs. Leave the replacement field blank to preserve an existing private value. Sensitive keys remain private; slugs cannot be renamed. |

## Storage and compatibility

The API now uses the actual Atlas collections: `taxRates`, `countryDocuments`, `globalSettings`, `shippingTypes`, and `orderTracking`, alongside `orders`, `products`, `containers`, `contacts`, `countries`, `states`, and `cities`. Container/document shipping references are written as ObjectIds. No records were copied, reseeded, or removed during this work.

`GET/POST /admin/{resource}` and `GET/PUT/DELETE /admin/{resource}/{id}` implement the management interface. DELETE archives; `POST /admin/{resource}/{id}/restore` restores. All require a current admin account. Existing legacy list/create/update paths remain available through the same validated write logic.

Order status changes use `POST /admin/order/{id}/tracking`. MongoDB transactions update `orders` and `orderTracking` together. MongoDB Atlas supports the transaction requirement; a standalone development MongoDB server must be configured as a replica set.

New checkout orders contain the required cart/files/payment/timestamp fields. Prices come from stored catalog prices, container charges, and tax rates. User-supplied totals and payment flags do not determine the saved amount or payment state. Historical carts stored as JSON strings are readable and preserved when editing.

Container images are stored in `backend/media/` and served through `/media/{filename}`. Private order documents are stored in `backend/order_files/`; only the authenticated order admin download route serves them. Upload limits are 5 MB per file, and 20 MB combined for order documents. Both directories are ignored by Git and need persistent storage/backups when deploying. Old upload metadata can be viewed, but missing historical files are not recreated or fetched from unknown legacy locations.

## Verification

- Frontend: `npm test` — 33 tests cover account behavior and all ten admin forms, archive/restore, search/filter requests, private settings, and tracking.
- Backend: `python -m unittest backend.test_auth backend.test_admin -v` — 39 isolated tests cover authentication, every section's create/read/update/archive/restore workflows, permissions, pagination, field and relationship validation, settings privacy, transaction rollback, server-priced checkout and private document retrieval.
- Build: `npm run build` checks TypeScript and production assets.
- Atlas collection validators and indexes were inspected read-only. Business writes in tests use an isolated in-memory database and temporary file storage.
- Full browser automation remains unavailable with the installed Node 20 runtime; the browser tool requires Node >=22.22.0. UI validation uses component tests, not a live browser session.

## External-service boundaries

Square charging/refunds/webhooks, automatic shipping labels, outbound inquiry replies, and email notifications are not implemented by these admin workflows. Payment state is displayed, not forged by an editor. Settings can be configured, but saving a setting does not enable an unimplemented integration. Do not reuse secrets from the old migrations.

Archives preserve historical order snapshots. Restoring geography requires valid unarchived parents. Existing duplicate unique keys, including archived records, must be resolved before a conflicting record can be created. No new business prices, taxes or shipping rules were invented or seeded.
