# AURELIA project context

Updated: 3 October 2026. Source of this cleanup: the user's `InternProject(2).zip`, containing the applied `AURELIA-Admin-Ready.zip` extension. The separate `AURELIA-Local-MongoDB-Update.zip` was not applied and is not a prerequisite.

## Owner's objective

Qadir is developing a beauty ecommerce website and a working admin panel locally. Preserve the storefront design, current neutral admin design, products/content and existing users. Keep changes essential and explain every changed/new/deleted file. The revenue overview graph should remain absent. Revenue summary cards are still part of the current dashboard.

## Current environment

- Windows laptop; project folder: `C:\Users\qadir\OneDrive\Desktop\InternProject`.
- User reported Node 24.12.0 and Vite 8.2.2. Dependency files remain the source of package versions.
- Native MongoDB 8.2.6 service named `MongoDB`, port 27017, loopback binding.
- Config: `C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg`.
- Data: `C:\Program Files\MongoDB\Server\8.2\data`.
- Existing development DB: `aurelia_dev`; test DB: `aurelia_test`.
- Native server converted to single-member `rs0`, member `localhost:27017`. Successful `rs.initiate()` and primary prompt were observed.
- User confirmed a stopped-service filesystem backup at `C:\Users\qadir\MongoDB-Backup-20261001-104023`.
- Existing data from other projects shares this server. Do not drop, reseed, move or reconfigure it casually.
- Docker previously hosted a different database on 27018. It is no longer the project's connection. Removing `compose.yaml` does not delete containers or volumes.

## What has been observed versus what remains unverified

The user's API and Vite started successfully against local MongoDB, printing “Existing database records and configuration preserved”. The user reached admin MFA enrollment after email/password sign-in. Admin verification subsequently reported a generic session-expired message and later a 15-minute rate limit. Successful dashboard access has not been confirmed on the user's laptop.

Code inspection found that the UI mapped every 401 response to session expiration. Cleanup fixes that display so an incorrect authenticator code and other server errors can be distinguished. This is not proof that all live login problems are resolved. Do not claim the user's authenticator has been reset or tested.

The user shared an enrollment screenshot showing secrets; do not reproduce them. No real `.env`, credentials, setup keys or recovery codes are included in this deliverable. Preserve existing SESSION_SECRET and MFA_ENCRYPTION_KEY when applying files.

## Working architecture after cleanup

`npm run dev` calls `admin-tools/start.mjs`. The launcher runs `backend/server.js` (watch mode) and Vite. `backend/server.js` delegates to `backend/admin-ready/server.js`; `backend/app.js` re-exports the canonical app for compatibility. `frontend/src/App.jsx` directly imports `admin-ready/ReadyAdmin.jsx`. There is one active admin UI and one API application implementation. Both normal npm commands and the old helper commands reach these same implementations.

Shared backend routes under `routes/adminRoutes.js` and `routes/adminStudioRoutes.js` remain essential: the current UI uses them. Their names alone do not make them obsolete. `admin-ready/ExistingEditors.jsx` also remains essential because Management imports ContentSettings.

## Rules for subsequent work / Copilot

1. Read README, ARCHITECTURE and CHANGES before editing.
2. Preserve UI styling unless the user explicitly requests design changes.
3. Reuse the current route, model and service layers; do not add a second admin implementation.
4. Use local port 27017 and existing `aurelia_dev`. Do not add Docker or a second MongoDB data directory.
5. Never replace the user's `.env`, rotate MFA keys, reset credentials, seed or delete data as part of routine startup.
6. Keep session authentication, administrator role checks, MFA, CSRF, validation and transaction integrity. “Development” does not mean bypass login.
7. Google sign-in is optional and disabled. Google Authenticator/TOTP works independently of OAuth credentials.
8. Razorpay integration remains; credentials and actual gateway verification are future user setup. Do not fake successful payments.
9. Discounts are inactive drafts; do not advertise applied checkout discounts without implementing and testing the pricing/reservation flow.
10. Write each update, reason, affected path and verification result in CHANGES. Report tests that were not run.
11. Production/Atlas migration is deferred. Do not impose unrelated infrastructure work now.

## Next practical checks on the laptop

Apply the file mapping, preserve `.env`, start with `npm run dev`, check storefront content, sign in and complete authenticator verification. If an error persists, report the exact backend message and whether it occurs at password, setup or verification. Test a product edit and storefront draft/publish using noncritical content. Run database integration tests only against a disposable test database.
