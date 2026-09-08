# Miriax One ZIP review and integration

Source: `C:\Users\nahom\Downloads\Miriax_One_Refactored.zip`, reviewed 2026-09-07.
The archive was extracted separately to `../miriax_zip_review/miriax_work`.
Source backup: `../miriax-source-before-zip.zip` (excludes credentials and uploaded private documents).

## Integrated

- Miriax One branding, cream/navy visual language, serif headlines, and a route-first landing page adapted from the prototype.
- Actual API country and service availability; selected origin, destination, and service pass to the existing booking form through URL parameters.
- Persistent admin **Services** and **Routes** sections with create, edit, archive, restore, validation, authentication, and unique database indexes.
- **Countries** now has independent origin and destination shipping switches.
- Global service status and visibility are enforced before route rules. Hidden, disabled, suspended, coming-soon, or archived rules cannot reactivate a service.
- The server rechecks availability during checkout, including requests made directly to the API and legacy requests without a service key.
- Existing account authentication, session revocation, admin role checks, catalog prices, private attachments, orders, tracking, and all ten management sections remain connected to the backend.

## Operating the network

The initial supported booking workflows are **Fill a Container** (`container`) and **Ship My Items** (`ship-items`), both using the existing cargo booking form. No sample business records, rates, countries, or orders are imported.

Before any route rules exist, the app retains existing country/catalog booking behavior. **Creating the first route switches all new bookings to an explicit allowlist.** Publish each supported origin/destination/service combination. Missing combinations are blocked. Archiving every route continues to block bookings; it does not reset the allowlist. Existing orders are unaffected.

Service entries override the two built-in service labels and availability. Archive a service to hide and disable it, or restore it to reuse its saved status. Service keys and route identities cannot be renamed. Archived configuration retains its unique identity and must be restored rather than duplicated.

The homepage shows network availability; the booking form confirms that a matching active container, shipping method, product, and required documents exist. Prices continue to come from the server. Orders remain unpaid until a payment workflow is implemented.

## Deliberately not imported

- Prototype login accepts mock identities and localStorage grants access to its admin. The real authentication implementation is retained.
- Sample orders, addresses, reviews, revenue, product prices, shopping catalogs, and simulated order confirmations are not business data.
- The ZIP's Shop & Deliver, gift, express, custom cargo pages, recipient/address book, wishlist, and city/service-area overrides need real backend workflows; they are not implemented by this merge. Custom requests link to the existing contact form.
- Prototype service overrides can re-enable disabled parent routes. The integrated resolver uses deny rules before allowing bookings.
- React 19/Vite 8/Tailwind 4 dependencies, Figma deployment hooks, generated agent instructions, and environment settings are not copied over the working React 18/Vite 5 application.
- Branding follow-up: the old support email and sign-in logo were removed from the interface. Contact links use the working contact form until a replacement support address is supplied.

## Verification

Run `npm test`, `npm run build`, and `..\.venv\Scripts\python.exe -m unittest backend.test_auth backend.test_admin backend.test_network -q` from the project directory.
Tests use an isolated in-memory backend and mocked frontend API, never write test records to Atlas.
Validation completed: 37 frontend tests and 43 backend tests passed. Frontend test files run sequentially to avoid concurrent OneDrive module-access errors.
Live browser visual verification remains unavailable with the installed browser-tool Node runtime; component tests and the production build do not replace a visual review.
