# Angular-to-React Feature Parity

> Historical Express migration notes. The current repository includes a FastAPI backend; account behavior and current limitations are documented in [ACCOUNT_REVIEW.md](ACCOUNT_REVIEW.md).

This document maps the legacy application documentation and deployed Express code to the React 2.0 client.

## Customer-facing routes

| Legacy capability | React route | Status |
|---|---|---|
| Home | `/`, `/home` | Implemented |
| About | `/about` | Implemented |
| Services | `/services`, `/services/:slug` | Implemented with six service detail pages |
| Place order | `/place-order`, `/ship` | Implemented against the live checkout APIs |
| Track order | `/track` | Implemented against `/site/track-order/:id` |
| Contact | `/contact` | Implemented against `/contact-us` |
| Login | `/login` | Implemented with JWT storage |
| Registration | `/register` | Implemented using the fields required by the actual User schema |
| Customer dashboard | `/dashboard`, `/account` | Implemented with order history, tracking links, and logout |
| Payment return | `/site/process-order/:id` | Implemented |
| Admin console | `/admin` | Implemented |

## Complete shipping workflow

The React order page now performs the legacy flow described in `INTEGRATION_GUIDE.md`:

1. Loads countries from `GET /site/countries`.
2. Loads shipment types from `GET /site/shipping-types`.
3. Loads active packages from `GET /product/products-list`.
4. Loads eligible containers from `GET /container/:country/:shipment`.
5. Loads country requirements from `GET /site/country-documents/:country/:type`.
6. Loads destination taxes from `GET /tax-rate/country/:country`.
7. Calculates the visible quote from package, container, and tax values.
8. Collects required document images.
9. Submits multipart checkout data to `POST /site/checkout`.
10. Redirects to Square when the API returns a payment URL; otherwise displays the order reference.
11. Tracks the order through `GET /site/track-order/:id`.

## Admin coverage

The React admin console exposes the data domains documented by the legacy project:

- Orders and tracking
- Products
- Containers
- Tax rates
- Country documents
- Contact submissions
- Countries
- States/provinces
- Cities
- Global settings
- Order, delivery, and catalog summary metrics

The underlying create/update/delete endpoints remain in the Express application and are not changed by the frontend migration. Payment IPN, email, file storage, database migrations, logging, JWT creation, password hashing, and MongoDB validation are server responsibilities and remain backend-owned.

## Documentation versus deployed-code differences

The guides contain several intended or example contracts that do not exist in the deployed server. React follows the actual source code:

- Public tracking is `/site/track-order/:id`, not `/order/track/:number` or `/order/:id/tracking`.
- The dashboard module is commented out in `routes.js`; React derives current metrics from list endpoints.
- Checkout uses `/site/checkout` with multipart `checkoutData` and document fields.
- The actual User schema requires `name`, `username`, `email`, `countryCode`, `mobile`, and `password`.
- Orders store serialized `cart`, uploaded `files`, `price`, payment state, and status rather than all of the normalized example fields shown in the guides.
- The documentation mentions bcrypt, but the deployed `User.js` hashes passwords with SHA-512. This is an existing backend security issue, not a React behavior.
- The documentation describes rate limiting, but the inspected Express setup does not register a rate-limiting middleware.

## Still backend/configuration dependent

These features require the Express server, MongoDB, and configured environment values to be running:

- Live catalog and location data
- Registration/login and JWT validation
- Order persistence and tracking history
- Square payment checkout and IPN processing
- Email notifications
- Image/document uploads
- Admin data and settings

The Vite development proxy expects the backend at `http://localhost:7576` by default.
