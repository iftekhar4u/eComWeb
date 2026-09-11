# AURELIA Beauty & Skincare

A premium, responsive MERN beauty-commerce foundation for AURELIA: Nature's Care. Your Radiance.

## Current foundation

- React 19 + Vite frontend
- Bootstrap 5 dependency and custom editorial design system
- Express + Mongoose product API with search, category, price, sorting, and pagination
- SEO metadata, robots.txt, sitemap.xml, semantic sections, accessible labels, lazy-loaded imagery
- Responsive navigation with mobile menu and bottom navigation
- Working search, wishlist toggles, and cart count interactions

## Run locally

1. Copy `backend/.env.example` to `backend/.env`.
2. Keep `MONGO_DEV_URI` pointed at `mongodb://127.0.0.1:27017/aurelia_dev` and `MONGO_TEST_URI` pointed at `mongodb://127.0.0.1:27017/aurelia_test` for the detected local MongoDB setup. Do not set either URI to production.
3. Set `SESSION_SECRET` and `MFA_ENCRYPTION_KEY` to locally generated random values of at least 32 characters. `MONGO_URI` is a compatibility override for development and should normally remain unset. Google sign-in is disabled by default; set `GOOGLE_AUTH_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact `GOOGLE_CALLBACK_URL` only after registering the OAuth client.
4. Install frontend dependencies with `npm install --prefix frontend`.
5. Install backend dependencies with `npm install --prefix backend`.
6. Start the frontend with `npm run dev --prefix frontend`.
7. Start the API with `npm run dev --prefix backend`.

The frontend runs at `http://localhost:5173`; the API health check is `http://localhost:5000/api/health`.

### Customer profile frontend

The protected customer profile is available at `http://localhost:5173/profile`. It uses the existing `/api/auth/me` session check and redirects signed-out users to `/login` with a safe internal return destination. To preview the new design without an authenticated session, start the frontend in development mode and open `http://localhost:5173/__dev/profile-preview`. The preview route is guarded by Vite's `import.meta.env.DEV`, uses synthetic data only, makes no account mutation requests, and is absent from production builds.

The profile currently displays the safe fields returned by the existing current-user endpoint. Email remains read-only, unsupported orders and address destinations are disabled, and profile saving is disabled with an explanation because no secure profile-update endpoint exists yet. Google is not shown as connected because the current account response does not provide verified connection status. Signup/login remain unresolved and were not weakened or bypassed for this page.

The backend now uses Argon2id password hashes, Mongo-backed server sessions, HttpOnly cookies, CSRF tokens for cookie-authenticated writes, strict request validation, Helmet, bounded rate limiting, account suspension checks, and an app/server split for integration testing. Versioned authentication routes are mounted at `/api/v1` (for example, `/api/v1/me`); the existing `/api/auth`, `/api/products`, `/api/cart`, and `/api/wishlist` routes remain compatibility routes for the storefront.

Create the first administrator from the backend directory with `npm run create-admin`. The command prompts for credentials and never contains a default password. After signing in, call `GET /api/auth/csrf-token`, then use the authenticated `POST /api/auth/mfa/setup` and `POST /api/auth/mfa/verify` flow. Store the one-time recovery codes outside the application.

Authentication uses Passport Local and Passport Google OIDC over the existing Mongo-backed session store. Local routes are `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me`. Google routes are `GET /api/v1/auth/google`, `GET /api/v1/auth/google/callback`, `GET /api/v1/auth/google/status`, and the authenticated collision-link completion route `POST /api/v1/auth/google/link`. The existing `/api/auth` routes remain compatibility aliases.

Run all backend tests with `npm test --prefix backend`, or only the real-Mongo suite with `npm run test:database --prefix backend`. Run the existing frontend checks with `npm run lint --prefix frontend` and `npm run build --prefix frontend`.

## API

`GET /api/products?page=1&limit=12&search=serum&category=Skin%20care&minPrice=300&maxPrice=1500&sort=price-low`

`GET /api/products/:slug`

The secure foundation is implemented, but orders, reviews, product administration, CMS content, uploads, checkout, payment-provider webhooks, and the responsive admin UI remain follow-on implementation phases. No live payments, emails, or production data are touched by the local setup.

## MongoDB database layer

The local database layer uses MongoDB 8.2.6, Mongoose 8.24.4, and two isolated databases:

- `aurelia_dev` for local development.
- `aurelia_test` for automated database tests.
- `aurelia_prod` is intentionally not created or contacted by project scripts.

The detected Windows service is a standalone, unauthenticated MongoDB instance listening on loopback. This implementation did not restart the service, enable authentication, create MongoDB users, or convert it to a replica set. Those changes affect other local projects and require explicit approval. Standalone MongoDB cannot provide multi-document transactions; checkout must refuse transaction-dependent work until a separately configured development replica set is available.

### Database commands

From PowerShell, after `cd` to `backend`:

```powershell
npm run db:diagnose
npm run db:migrate
npm run db:verify
npm run db:migrate:test
npm run db:verify:test
npm run test:database
```

`db:migrate` is repeatable and non-destructive. It reports duplicate groups before unique indexes, never drops collections, and is restricted to `aurelia_dev` or `aurelia_test`. `db:seed` requires the explicit `--confirm-seed` script flag and refuses to seed a non-empty product collection.

The migration creates 22 application-owned collections, the library-compatible `sessions` collection used by `connect-mongo`, and `schema_migrations`: 24 collections total after the first session migration. The `rate_limits` baseline collection is intentionally absent because the current application uses `express-rate-limit`'s in-process store; a shared multi-instance limiter must be added with a compatible store before horizontal scaling. `sessions` is not treated as an application-owned document schema; its observed `{ _id, expires, session }` format is validated only for BSON shape and its TTL index is precreated.

Application collections use strict Mongoose schemas and MongoDB validators with `validationLevel: strict` and `validationAction: error`. Unique normalized email, slug, SKU, order, idempotency, provider-event, coupon, review, cart, wishlist, and media indexes are created by migration. Prices, stock, reservations, quantities, totals, and fixed discounts are integer paise/counts with bounded ranges. TTL is used for disposable auth tokens, sessions, and reservations; reservation release still requires an explicit worker and is never delegated to TTL deletion.

### MongoDB access accounts

`npm run setup-mongo-access` is intentionally not provided as an automatic startup action. After reviewing the impact and approving MongoDB user changes, set `MONGO_ADMIN_URI` in the process environment and run `node scripts/setup-mongo-access.js --confirm` from `backend`. It prompts for passwords and does not reset existing users. It prepares separate development/test runtime users, separate migration users, and a bootstrap user. The runtime role is collection-scoped, but the current script grants the migration users `dbAdmin`; that is broader than the requested least-privilege migration role and must be narrowed before using the script for a hardened deployment. Migration credentials are not application startup credentials.

After authentication is enabled, configure separate authenticated URIs in `backend/.env` using different development and test users, for example:

```text
MONGO_DEV_URI=mongodb://aurelia_runtime_dev:REDACTED@127.0.0.1:27017/aurelia_dev?authSource=aurelia_dev
MONGO_TEST_URI=mongodb://aurelia_runtime_test:REDACTED@127.0.0.1:27017/aurelia_test?authSource=aurelia_test
```

Do not put real passwords in `.env.example`, documentation, Git, or shell command history. Enabling access control requires a reviewed bootstrap order: create and verify the administrative/bootstrap account, create the migration/runtime accounts, test authenticated connections, then update the service configuration and restart it. A replica set additionally requires a separate data directory/port plan, internal member authentication, and protected keyfile handling; none of that was changed locally.

### Backup and restore

Back up only an approved database with `mongodump --uri "$env:MONGO_DEV_URI" --out .\backups\aurelia-dev-<timestamp>`. Restore only to a disposable, separately named test target with `mongorestore --uri "$env:MONGO_TEST_RESTORE_URI" --drop .\backups\...`; never use `--drop` against development or production. Verify the restored target with `npm run db:diagnose:test` and `npm run db:verify:test`. Production still requires encrypted backups, tested restoration, TLS/private networking, secret rotation, and least-privilege credentials, none of which can be verified on this local standalone service.

## Development Updates & Decisions

These entries are retrospective records of changes verified in the current repository and conversation. Dates are marked as retrospective where the original implementation date was not recorded. Future changes must update this section in the same task and update the relevant setup or usage instructions.

- **2026-09-16 / Protected customer profile frontend and development preview:**
	- **What changed:** Added the protected `/profile` route, a responsive Aurelia account surface with breadcrumb, blush welcome panel, account navigation, safe profile summary, read-only/editing form states, validation feedback, disabled unsupported destinations, sign-out handling, and security links. Added retryable authentication-check errors and safe internal return routing after login. Added the development-only `/__dev/profile-preview` route with clearly labelled synthetic data.
	- **Reason:** The storefront needed a customer profile experience while preserving the server-controlled authentication boundary and documenting the current incomplete account-management API.
	- **Why this approach:** The page consumes only the existing `safeUser` response from `/api/auth/me`; presentation is separated from mutation because the backend has no secure profile update endpoint. Vite development gating keeps synthetic preview data out of production and avoids creating fake sessions or fallback account state.
	- **Files affected:** `frontend/src/App.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/AuthPages.jsx`, `frontend/src/pages/Profile.jsx`, `frontend/src/profile.css`, `README.md`.
	- **Resulting behavior:** Signed-out users are redirected to login, authentication-check failures can be retried, profile details are never fabricated on the real route, unsupported account features are visibly disabled, and preview edits are explicitly temporary.
	- **Security impact:** No tokens, password fields, hashes, localStorage auth flags, MongoDB access, or invented success responses were added. Existing cookie and CSRF handling remains authoritative.
	- **Verification:** `npm run lint --prefix frontend` completed with warnings only: existing Fast Refresh warnings plus React effect-style warnings in the auth/profile components. `npm run build --prefix frontend` completed successfully. Browser desktop/mobile interaction checks were not run in this environment.
	- **Required action / Limitations:** Repair and verify signup/login separately. Add a protected, allowlisted profile-update API before enabling Save Changes or displaying Google connection status. Orders and saved addresses remain unavailable because their routes/API are not implemented.

- **2026-09-16 / MongoDB schema, migration, and local database layer (retrospective):**
	- **What changed:** Added isolated `aurelia_dev` and `aurelia_test` configuration, 22 application-owned collections, strict Mongoose domain schemas, MongoDB `$jsonSchema` validators, cross-field checks for stock/reservations/orders/coupons/media, unique/query indexes, TTL indexes, migration metadata, diagnostics, verification, opt-in development seeding, and database integration tests. Existing `connect-mongo` `sessions` storage is handled separately with its observed `{ _id, expires, session }` format.
	- **Reason:** The project needed a working MongoDB persistence layer with database-level enforcement, repeatable setup, safe test isolation, and explicit handling of the detected standalone local server.
	- **Why this approach:** Migrations use `createCollection`/`collMod` and preserve existing data, while preflight detects duplicate unique-key values before index creation. Separate development and test database names avoid cross-environment data mixing. A standalone server is documented rather than treated as transaction-capable. The rationale for some collection names is inferred from the requested database baseline and existing model names.
	- **Files affected:** `backend/config/env.js`, `backend/db/collectionDefinitions.js`, `backend/db/migrate.js`, `backend/models/User.js`, `backend/models/Product.js`, `backend/models/domainModels.js`, `backend/scripts/diagnose-database.js`, `backend/scripts/migrate-database.js`, `backend/scripts/verify-database.js`, `backend/scripts/seed-development.js`, `backend/scripts/setup-mongo-access.js`, `backend/tests/database.test.js`, `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`.
	- **Resulting behavior:** Developers can migrate and verify isolated local/test databases without dropping collections. Invalid raw MongoDB writes, fractional money, negative stock, excessive reservations, duplicate emails/SKUs, and incompatible schema changes are rejected. Development seeding requires explicit opt-in.
	- **Security impact:** Database validators enforce types, bounds, enums, bounded arrays, unique identifiers, and selected cross-field invariants independently of the API. Secrets are represented only by placeholders in documentation. Runtime/migration account setup is approval-gated and unexecuted.
	- **Verification:** MongoDB 8.2.6 standalone was detected on loopback; `npm run db:migrate`, `db:verify`, and their test equivalents passed. `npm run test:database` passed all 6 tests. Final diagnostics showed 24 collections with strict/error validation. Transaction tests were intentionally not exercised because the instance is standalone.
	- **Required action / Limitations:** Do not enable MongoDB authentication, restart the Windows service, or convert it to a replica set without reviewing the impact on other projects. The access setup script currently grants migration users `dbAdmin` and needs narrowing before hardened use. Production TLS, private networking, backups/restoration, secret rotation, and transaction-capable deployment remain unverified.

- **Retrospective, date not recorded / Secure backend foundation and authentication:**
	- **What changed:** Replaced the original JWT-cookie flow with server-side sessions, Argon2id password hashing, session regeneration, account status/session-version checks, CSRF protection, strict Zod request validation, Helmet, CORS configuration, bounded rate limiting, safe error handling, admin MFA setup/verification, and a controlled admin bootstrap CLI. Added an app/server split for integration testing.
	- **Reason:** The original implementation used a hardcoded JWT fallback secret, had no server-side revocation, accepted unvalidated registration fields, and had no CSRF or MFA boundary.
	- **Why this approach:** Server-side sessions support revocation and current-account checks without putting session secrets in browser storage. Argon2id is used for password hashing; Mongo-backed sessions are appropriate for the existing Mongoose stack. Compatibility routes preserve existing storefront calls while the versioned API is introduced.
	- **Files affected:** `backend/app.js`, `backend/server.js`, `backend/config/env.js`, `backend/middleware/authMiddleware.js`, `backend/middleware/csrfMiddleware.js`, `backend/middleware/errorMiddleware.js`, `backend/routes/authRoutes.js`, `backend/models/User.js`, `backend/scripts/create-admin.js`, `backend/tests/security.test.js`, `backend/package.json`, `backend/package-lock.json`.
	- **Resulting behavior:** Registration always creates a customer, login establishes a regenerated server session, logout destroys it, suspended or stale-version accounts lose access, and administrators must complete MFA before privileged access. Admin creation is CLI-only.
	- **Security impact:** HttpOnly cookies, CSRF tokens, Argon2id, session invalidation, strict field allowlists, safe production errors, and MFA reduce session theft, privilege escalation, and request-forgery risks. The in-process rate limiter is not suitable for multi-instance deployment.
	- **Verification:** Backend security checks passed: 4 tests covering CSRF issuance/enforcement, unauthenticated access denial, malicious query-field rejection, and production secret validation. Editor diagnostics reported no errors in the changed backend files.
	- **Required action / Limitations:** Copy `backend/.env.example`, provide local secrets, run `npm run create-admin --prefix backend`, and complete MFA enrollment. Password reset, email verification, recovery-code login, account management endpoints, and the full admin API are not implemented in the current repository.

- **Retrospective, date not recorded / Frontend authentication integration:**
	- **What changed:** Updated the Axios client to obtain and send CSRF headers for state-changing requests, consume CSRF tokens returned by authentication responses, and use cookie-backed session state. Updated `AuthContext` to load the current user from `/auth/me` instead of persisting user/session state in `localStorage`.
	- **Reason:** Authentication secrets and authoritative user state should remain server-controlled; the frontend needed to match the new session and CSRF contract.
	- **Why this approach:** Axios interceptors centralize CSRF behavior across existing calls, while the context performs a server session check on startup. This preserves the existing React/Vite routing and visual design without adding a parallel client-side auth store.
	- **Files affected:** `frontend/src/services/api.js`, `frontend/src/context/AuthContext.jsx`.
	- **Resulting behavior:** Browser authentication is represented by the HttpOnly session cookie, and protected writes obtain a CSRF header automatically. Reloading the app checks the backend session rather than trusting cached user JSON.
	- **Security impact:** User/session data is no longer stored in `localStorage`, and cookie-authenticated writes include CSRF protection. Frontend state remains advisory; backend authorization is authoritative.
	- **Verification:** `npm run lint --prefix frontend` completed with three existing Fast Refresh warnings, and `npm run build --prefix frontend` completed successfully.
	- **Required action / Limitations:** The storefront still contains hardcoded product/content data in its existing pages and contexts. Storefront-to-database replacement, customer carts/wishlists backed by the new collections, and the responsive admin UI remain unfinished.

- **Retrospective, date not recorded / Public product API hardening:**
	- **What changed:** Added strict query parsing, bounded pagination and prices, regex escaping, explicit public-field projection, and `status: 'published'` filtering to product list/detail routes.
	- **Reason:** Public reads must not expose drafts or private fields and must reject MongoDB query operators and unbounded query values.
	- **Why this approach:** Zod validates the request boundary, explicit filter construction prevents operator injection, and projections keep the public response contract narrow without changing the existing storefront route shape.
	- **Files affected:** `backend/routes/productRoutes.js`, `backend/models/Product.js`.
	- **Resulting behavior:** Product listing and detail endpoints return only published products, accept bounded allowlisted filters, and reject unknown query fields.
	- **Security impact:** Draft exposure, NoSQL operator injection, uncontrolled pagination, and accidental sensitive-field disclosure are reduced at the API boundary.
	- **Verification:** The security suite rejected an unexpected `$where` query field; public routes were included in the backend app checks. Full product API integration coverage is not yet present.
	- **Required action / Limitations:** Product administration, variants in the storefront, media upload verification, cache invalidation, and CMS publishing workflows remain unimplemented.

- **2026-09-16 / Passport Local and Google OIDC authentication (retrospective):**
	- **What changed:** Integrated Passport `0.7.0` into the existing Express session architecture with `passport-local` `1.0.0` for email/password authentication and `passport-google-oidc` `0.1.0` for Google authorization-code login. Added Google configuration/status routes, session serialization/deserialization, session-bound single-use Passport state, OIDC nonce validation, short-lived callback state, Google ID-token signature verification through `google-auth-library` `11.0.2`, verified issuer/audience/expiry/email claims, customer-only Google account creation, explicit authenticated Google linking after local reauthentication, and frontend Google buttons/error states on both auth pages.
	- **Reason:** The authentication layer needed Passport integration without replacing Argon2id, persistent sessions, CSRF protection, MFA enforcement, account restrictions, or the existing storefront design. Google identity collisions must not silently take over password accounts.
	- **Why this approach:** Passport strategies reuse the existing session middleware and keep authentication provider logic server-side. `passport-google-oidc` supplies the authorization-code/OIDC flow and built-in session state/nonce checks; because the installed strategy line does not expose PKCE controls, PKCE is not claimed or configured. `google-auth-library` supplements the strategy with cryptographic ID-token verification. Google access/refresh tokens are not persisted.
	- **Files affected:** `backend/config/passport.js`, `backend/config/env.js`, `backend/app.js`, `backend/routes/authRoutes.js`, `backend/models/User.js`, `backend/db/collectionDefinitions.js`, `backend/db/migrate.js`, `backend/tests/security.test.js`, `backend/tests/database.test.js`, `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`, `frontend/src/context/AuthContext.jsx`, `frontend/src/pages/AuthPages.jsx`, `README.md`.
	- **Resulting behavior:** Local registration/login continues to create and authenticate customer accounts with Argon2id passwords. Google sign-in redirects the browser to Google with only `openid email profile`; first-time verified identities create customer accounts, returning identities reuse their linked account, and an email collision requires local login followed by an explicit protected link request. Google-only users have no dummy password and cannot log in through Local strategy. Admin accounts still require completed MFA after either authentication path.
	- **Security impact:** Passport sessions serialize only the user ID/session version and reload current account state. Suspended or revoked-version accounts remain blocked. Google callback state is session-bound, expiring, and consumed by Passport; OIDC nonce is checked; ID-token signature, issuer, audience, expiry, subject, and verified email claims are enforced. CSRF remains required for ordinary writes and Google linking; OAuth callbacks are protected by state/nonce instead of a normal CSRF header. No provider tokens or application sessions are placed in redirect URLs.
	- **Verification:** Backend tests passed: `npm test` reported 14 passing tests, including disabled/enabled Google initiation, minimal scopes/nonce, local registration/session/logout, Google-only schema writes, duplicate Google identity rejection, CSRF, and existing security checks. `npm run db:migrate`, `db:verify`, and test equivalents passed. Frontend lint passed with the existing three Fast Refresh warnings, and the production build passed. Real Google browser authentication is unverified because no provider credentials were used.
	- **Required action / Limitations:** In Google Cloud, configure an OAuth consent screen, add test users as needed, create a Web OAuth client, and register exactly `http://localhost:5000/api/v1/auth/google/callback` for local testing. Copy only placeholder variables into `backend/.env`; keep the client secret backend-only. Google auth stays disabled until all four Google variables are valid. PKCE remains unavailable with the selected `passport-google-oidc` dependency line and must be revisited if PKCE becomes mandatory.

### Current limitations and unresolved findings

- The admin panel, admin product/content/order/customer/review/coupon screens, checkout, payment provider adapter/webhooks, email flows, and background reservation-release worker are not implemented.
- The local MongoDB service is standalone and unauthenticated. Transaction-dependent commerce behavior must not be enabled until a separately configured replica set is available.
- The current migration-account bootstrap script uses `dbAdmin`; it is not yet a least-privilege production account setup.
- `express-rate-limit` currently uses an in-process store; multi-instance deployment requires a shared limiter store.
- `npm audit --omit=dev --audit-level=high` reports unresolved `multer` high and `qs` moderate advisories.
- The existing frontend lint warnings concern Fast Refresh exports in `AuthContext`, `CartContext`, and `WishlistContext`; the production build still passes.

- Real Google browser sign-in has not been verified because no Google OAuth client credentials were provided or used. Google remains disabled unless explicitly configured.
