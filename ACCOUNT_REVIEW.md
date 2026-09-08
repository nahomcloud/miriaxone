# Account review — September 5, 2026

Reviewed the React client and the FastAPI backend in this repository. The legacy Express User schema was read to check password compatibility. No Atlas records were accessed or modified by the tests.

## Findings corrected

| Finding | Result |
| --- | --- |
| Password hashes returned by login and registration | User responses use an explicit safe-field allowlist. |
| Missing account/admin route guards | Session verification through `/auth/me`; account routes require authentication and `/admin` requires the server-reported admin role. API authorization remains authoritative. |
| Logout only deleted local storage | `/auth/logout` increments a persisted session version, invalidating all existing tokens. Browser tabs synchronize logout. Failed server revocation remains retryable. |
| Expired, malformed, or revoked tokens left stale UI | Authenticated 401 responses clear the session. Missing JWT claims, invalid subject IDs, disabled users, deleted users, and revoked versions are rejected. |
| Customer dashboard called the admin order list | `/account/orders` restricts results to the authenticated user's ID. Checkout assigns that ID server-side and rejects client ownership overrides. Guest orders remain unassigned. |
| Admin list accepted a collection query override | Resource names are closed over by route handlers and cannot be replaced through query parameters. Removed duplicate `/order` registration. |
| Weak registration and duplicate races | Normalized identities, validated fields, reserved admin usernames, a 15-character password minimum, explicit bcrypt byte limits, rejected extra fields, and case-insensitive unique indexes. |
| No protection against repeated login attempts | Shared MongoDB counters limit account attempts to 30 per source address per 15-minute bucket. Configure trusted proxy handling at deployment; clients behind one proxy may share the limit. |
| Missing profile/password settings | Authenticated profile editing and current-password-verified password changes. Password changes revoke all sessions; role/email/username changes cannot be injected. |
| Public tracking returned private customer data | Only shipment reference/status and public tracking event fields are returned. |
| Unsafe JWT secret default | API startup requires a configured secret of at least 32 bytes. The local `.env` was updated with a random secret without displaying it. |
| Legacy account recovery promoted users if admin tooling was reused | Added an operator-only password reset command that preserves the user's role. |

## Validation

- `npm test`: **20 passed**, using mocked HTTP responses and jsdom, including admin edit and tax-rate creation flows.
- `python -m unittest backend.test_auth -v`: **23 passed**, using an in-memory database, including admin updates, tax-rate creation, access denial, token expiry/revocation, disabled accounts, duplicate registration, role injection, password changes, throttling, order ownership, and tracking privacy.
- `npm run build`: **passed**, including TypeScript and production asset compilation.
- Live browser checks could not run: the installed browser tool requires Node >=22.22.0; this machine has Node 20.12.1.
- Atlas connectivity, actual MongoDB validators/index creation, and end-to-end behavior against deployed services are not verified by the isolated tests.

## Deployment and remaining boundaries

1. Deploy the updated frontend and FastAPI backend together and restart the API. Tokens from the previous implementation lack required claims and will require a new sign-in. The local secret rotation also invalidates previous tokens.
2. API startup creates case-insensitive unique indexes for email and username. Existing duplicate or missing identities can prevent index creation; inspect and reconcile those records before rollout. Tests exercise duplicate handling but do not simulate MongoDB index construction.
3. Legacy SHA-512 passwords are deliberately not accepted as bcrypt passwords. After verifying an account owner's identity, an operator can run `python -m backend.reset_password user@example.com`. It prompts for a new password and does not create users or change roles. Do not use `create_admins.py` to recover customer accounts.
4. Existing orders without a verified `userId` need an explicit ownership migration. They are not automatically assigned based on an unverified email address.
5. Email verification, self-service forgotten-password email delivery, MFA, account deletion, and email-address changes are not implemented. There is no configured email delivery integration in this backend.
6. Tokens remain in local storage for compatibility with the current bearer-token API. This remains exposed to same-origin script compromise; an HttpOnly-cookie session design would require a coordinated CORS/CSRF and deployment change.
7. Follow-up fix: admin-only updates now support existing management records, and tax rates support creation with numeric range validation. Edit opens and focuses a JSON editor with immutable metadata excluded. Unsupported create/delete controls are hidden. Other creation operations, deletion, tracking writes, payment processing, and upload storage remain unimplemented. Broader delete endpoint expansion was rejected by automatic approval review; no delete endpoints were added.

Security review reference: [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
