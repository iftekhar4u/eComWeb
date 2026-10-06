# Admin password-only local login update

3 October 2026. Apply AFTER AURELIA-Clean-Local.zip. This update supersedes earlier documentation that says MFA is mandatory during local development.

## Apply

Stop the running app with Ctrl+C. Extract this patch ZIP separately. Copy its files to the SAME relative paths in your existing InternProject folder, replacing the two existing runtime files and test file. Do not replace the entire backend folder.

| Patch source | Existing project destination | Purpose |
| --- | --- | --- |
| backend/middleware/authMiddleware.js | backend/middleware/authMiddleware.js | Shared development MFA policy; keeps account/session/admin-role validation |
| backend/routes/authRoutes.js | backend/routes/authRoutes.js | Login and session responses use the same policy, so the UI opens the dashboard |
| backend/admin-ready/tests/security.test.js | backend/admin-ready/tests/security.test.js | Regression coverage for password-only development access |
| docs/ADMIN_PASSWORD_LOGIN.md | docs/ADMIN_PASSWORD_LOGIN.md | Add this change/context guide |

In your EXISTING backend/.env ensure this line is present once:

```env
NODE_ENV=development
```

Keep all other existing values, particularly the database URI, SESSION_SECRET and MFA_ENCRYPTION_KEY. No npm installation, migration, seed, admin recreation or Compass record editing is needed.

Start from the project root:

```bash
npm run dev
```

Open http://localhost:5173/admin. Refresh the page after restart. If a customer account is already signed in, return to the store and sign out, then log in with the existing ADMIN email and password. An old pending admin session can now proceed without an authenticator code in development. Existing sign-in rate limits are retained; if already limited, wait for the displayed window.

## Behavior and reason

The server now uses its validated NODE_ENV configuration to decide whether MFA is required. In development, correct admin credentials grant access to the admin panel and its protected APIs without authenticator enrollment or a code. Both the frontend session response and backend authorization use this policy; merely hiding the MFA screen would leave API calls blocked.

Password verification, active-account checks, admin role, session-version revocation, CSRF protection and rate limiting remain. Customer accounts cannot access the admin API. All existing admin sections are available subject to their existing implementation and integration requirements; this patch does not add missing payment/provider functionality.

MFA remains required outside development (including production). No existing encrypted MFA secrets, recovery codes, passwords or user records are changed or deleted. Existing MFA code remains available for that environment. Stored enrollment may still be shown in Settings; it does not block local login.

## Verification

18 isolated admin tests passed, including password-only development login/session responses, successful admin authorization without MFA, rejected customer access, suspended accounts, incorrect passwords and missing CSRF. Existing MFA and password-revocation tests also pass outside development. Tests use mocked user records and local HTTP servers, not your live MongoDB database. Browser login on your laptop is still to be checked after applying these files. Frontend source/style and dependencies are unchanged by this patch.
