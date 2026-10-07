# Cleanup verification — 3 October 2026

| Check | Result |
| --- | --- |
| `node --test backend/admin-ready/tests/*.test.js` | PASS: 17 tests, 0 failures, 0 skipped |
| `npm run build` at root | PASS after retaining the active ContentSettings editor export |
| Source/archive comparison | Exact changed/new/deleted path inventory in CHANGES.md |

Admin tests cover database preservation and empty initialization, standalone rejection, storefront drafts, validation, inactive discounts, authorization, metrics, CSV escaping, CSRF, MFA enrollment/verification/recovery, encryption-key errors, password session revocation, and production SPA/API routing. They use mocked database collections and local test HTTP servers; they do not prove compatibility with every existing record in your actual database.

Build validation used the available cached Vite 8.0.13 runtime. The supplied frontend package manifest and lockfile were preserved (the user's environment reported Vite 8.2.2); a fresh dependency installation and build on that exact locked environment were not performed here. Dependency versions were not upgraded by this cleanup.

Not verified here: Windows command execution/service startup, actual MongoDB transactions against your local records, live browser login/MFA, Google sign-in, Razorpay or email delivery. No real database was seeded or modified by these checks. No production deployment is claimed.

## Short laptop check

1. Apply CHANGES.md, retaining your existing backend/.env and MongoDB database.
2. Ensure the existing MongoDB service is running; run `npm run dev` from the project root.
3. Open the storefront and `/admin`. Sign in using the admin account from this local database and its authenticator code.
4. Confirm existing catalog/content/orders display. If access fails, copy the exact displayed error without passwords, setup keys, recovery codes or cookies.
5. Use a harmless draft edit to check administration before publishing changes. Do not reseed existing data for this check.
