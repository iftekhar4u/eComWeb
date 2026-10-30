# Deploy AURELIA

This release prepares the existing storefront, admin and API for one persistent Node.js 24 service. It serves `frontend/dist-admin` and `/api` from one HTTPS origin. MongoDB must support transactions: use Atlas or a replica set. Payment/email workers run inside this service.

No hosting account, domain or live payment account has been deployed or changed. See `PRODUCTION_VALIDATION.md` for measured results and limits, and `PRODUCTION_CHANGES.md` for the file list.

## 1. Preserve existing configuration

Back up MongoDB, your original `backend/.env`, your Git changes and `backend/.private/integrations.enc` if present. If you already use a custom `INTEGRATIONS_DIRECTORY`, back up its `integrations.enc` instead. The release excludes actual credentials, dependencies, build output and database files; it is not a database backup. Apply the source without deleting your private files, or restore them into the extracted project.

Keep the original `SESSION_SECRET`, `MFA_ENCRYPTION_KEY` and any existing `PAYMENT_ENCRYPTION_KEY` / `EMAIL_ENCRYPTION_KEY`. Replacing them can invalidate sessions or make stored credentials/MFA secrets unreadable. If email previously used the `SESSION_SECRET` fallback, keep `EMAIL_ENCRYPTION_KEY` unset. Generate new secrets only for a genuinely new database. Do not run setup or seeding against existing data.

An active MongoDB URI saved in Admin > Integrations takes precedence over the environment URI. Verify that selection before moving hosts. `INTEGRATIONS_IGNORE_DATABASE=true` deliberately pins the environment database for recovery; it is not the normal default. Remove it when normal admin database selection is needed.

## 2. Install and verify locally

Use Node.js 24. From the folder containing `backend`, `frontend` and `admin-tools`:

```bash
npm run install:all
cd frontend
npx playwright install chromium
cd ..
npm run verify
```

On Linux, use `npx playwright install --with-deps chromium` if browser system packages are missing. `verify` runs lint, Node/Vitest unit and route tests, isolated MongoDB tests, a production build, browser tests, a real local production checkout, bundle budgets and dependency audits. The root DB test commands own disposable MongoDB 8.0.15 replica sets; they do not use your live Atlas database. The first run downloads MongoDB; browser installation and audits also require network access.

With Chrome/Chromium installed, `npm run benchmark` writes Lighthouse lab results to `reports/`. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` selects an existing browser binary. The benchmark uses deterministic data/local images rather than customer data.

For normal local development, preserve your development `.env` with `NODE_ENV=development`, `CLIENT_URL=http://localhost:5173` and `TRUST_PROXY=0`. Keep both terminals running:

```bash
# Terminal 1, project root
npm --prefix backend start
```

```bash
# Terminal 2, project root
npm --prefix frontend run dev
```

Wait for backend readiness before opening the frontend. `ECONNREFUSED 127.0.0.1:5000` means Vite could not reach the backend. Alternatively use the combined `npm run dev` launcher; do not run both launch methods simultaneously.

## 3. Render service architecture

Use one Render Node web service for the API, storefront, and admin UI. The backend serves the production frontend from one HTTPS origin, so no separate static site is needed. The encrypted integration vault is a file and rate-limit counters are in process memory; use one instance. Render's persistent disk requires a paid web service, prevents zero-downtime deployments, and adds storage cost. Review current Render pricing before creating the service. The Blueprint omits a fixed compute plan; Render's current docs say new web services default to `0.5c-512mb` (0.5 CPU/512 MB). Confirm that default's price, disk eligibility and memory capacity for your workload before creating the service, and choose a different currently supported plan ID if needed.

### Render

1. Commit the reviewed source and all three lockfiles to your GitHub repository. Keep `.env`, vaults and secrets out of Git.
2. Create a Render Blueprint from `render.yaml`. It defines one Node service, a 1 GB disk mounted at `/var/data/aurelia`, build/start commands and `/readyz` health checks. Review the billable plan before submitting.
   
   The exact commands in the Blueprint are:

   ```text
   Build:  npm --prefix frontend ci --include=dev --no-audit --no-fund && npm --prefix backend ci --omit=dev --no-audit --no-fund && npm run build
   Start:  npm run deploy:check && npm start
   ```

3. Set the required secret environment values using your originals. Set `CLIENT_URL` to the exact public HTTPS origin, e.g. `https://your-service.onrender.com`, without a path/query/credentials. If online payments are enabled, set `PAYMENT_PUBLIC_ORIGIN` to that same origin. Use the intended Atlas database and a database user restricted to that application; allow the host's documented outbound addresses in Atlas.
4. Preserve provider environment values you already use. The blueprint supplies `INTEGRATIONS_DIRECTORY=/var/data/aurelia` and `TRUST_PROXY=1`, assuming Render is the single ingress. It does not generate replacement encryption keys.
5. If there is an existing vault, use authenticated Render shell/SSH transfer to restore `integrations.enc` into `/var/data/aurelia/integrations.enc`, restrict access to the service user, and restart before opening to customers. Disk contents are unavailable during build/pre-deploy commands; restoration must use the runtime disk. Confirm the selected database and settings after restart.
6. Build installs frontend build dependencies/backend runtime dependencies and builds the UI. Startup runs `deploy:check`, then the production server. The GitHub workflow verifies pushes/PRs; automatic deployment is disabled in the Blueprint. After CI passes, review and manually deploy from Render.
7. Add the custom domain and verify HTTPS. Update `CLIENT_URL`, `PAYMENT_PUBLIC_ORIGIN`, saved public URLs and provider callbacks when changing domains, then restart.

Render persistent disks require one instance and prevent zero-downtime deployments. Schedule a short maintenance window. An initial healthy boot before restoring the vault does not prove that original settings were migrated.

### Render environment variables

The Blueprint sets `NODE_VERSION=24`, `NODE_ENV=production`, `TRUST_PROXY=1`, and `INTEGRATIONS_DIRECTORY=/var/data/aurelia`. These are non-secret service/runtime settings. Configure the following in the Render service; preserve existing values rather than generating replacements:

| Variable | Required | Secret? | Purpose |
| --- | --- | --- | --- |
| `CLIENT_URL` | Yes | No | Public HTTPS origin for CORS, callbacks and site links. |
| `MONGO_URI` | Yes | Yes | Intended MongoDB Atlas connection string and database. |
| `SESSION_SECRET` | Yes | Yes | Stable session signing key; replacing it invalidates sessions. |
| `MFA_ENCRYPTION_KEY` | Yes | Yes | Stable MFA and encrypted integration-vault key; replacing it can make saved settings unreadable. |
| `ADMIN_MFA_ENABLED` | No | No | Defaults to `false` for temporary email/password-only admin login. Set `true` to restore authenticator enrollment and verification. |
| `PAYMENT_PUBLIC_ORIGIN` | When online payments are enabled | No | Public HTTPS origin used to verify payment webhook URLs. |
| `PAYMENT_ENCRYPTION_KEY` | Before saving payment credentials | Yes | Stable key used for stored payment credentials. |

Other optional provider variables (Google OAuth, SMTP, Razorpay, email, and checkout settings) are documented in [`backend/.env.example`](../backend/.env.example). This single-origin service does not need a frontend `VITE_API_URL` in production; the frontend uses `/api`. Values saved in the Admin integration/payment settings may take precedence over environment defaults as described above.

## 4. Configuration and migration checks

On a Node host, from the project root with the production environment available:

```bash
npm run deploy:check -- --database
```

This checks production configuration, built frontend, vault decryption/writability, MongoDB connectivity, replica-set support and the migration marker. It does not change the database; it briefly creates/deletes a private storage write-check file. The normal server can initialize an empty application's collections/indexes without sample business records. Startup blocks an existing database missing the required payment migration.

Only if migration is required: take a restorable backup, pause traffic/workers and confirm the target database. From `backend`, replace `YOUR_DATABASE` with its exact name:

```bash
npm run db:migrate -- --production --confirm-database=YOUR_DATABASE --dry-run
# Review conflicts: 0, the backup and the database target before proceeding.
npm run db:migrate -- --production --confirm-database=YOUR_DATABASE
```

Then restart and repeat checks. Production migrations are not automatic build/deploy steps. Dry-run now disables Mongoose collection auto-creation and is tested not to create collections/indexes. A zero-conflict result does not replace a backup or review of migration errors.

For a Render migration, use the service's authenticated Shell after taking and verifying a restorable backup. The command must target the intended production database explicitly; the regular deploy/start lifecycle never runs a migration.

Existing admin accounts/passwords remain unchanged. For a new database only, temporarily set `ADMIN_EMAIL`, `ADMIN_NAME` and a unique `ADMIN_PASSWORD` of 12–128 characters, start the server, complete authenticator enrollment and save recovery codes. Remove `ADMIN_PASSWORD` after creation. Production admin MFA remains required.

## 5. Public smoke test and provider acceptance

From a source checkout, against the deployed origin:

```bash
npm run deploy:smoke -- https://your-domain.example
```

This reads health/readiness, API health, a missing API route, storefront/admin HTML and basic security headers. It creates no orders, payments or emails. `/healthz` checks the process; `/readyz` checks database availability and draining state. They do not prove provider availability.

Before accepting real orders, use your own accounts to complete these checks:

- Admin login with MFA; correct database, products, variants, stock, pricing, shipping/taxes and enabled payment methods.
- Create/publish a disposable blog or About edit, reload, restart the service and verify persistence. Check actual images/content and mobile layout.
- Update saved SEO/email public URLs, logo URLs and canonicals from localhost/test domains. Check sitemap/robots. Database settings can override environment defaults.
- If Google sign-in is enabled, register `https://YOUR_DOMAIN/api/v1/auth/google/callback` in Google and `GOOGLE_CALLBACK_URL`; test login/account linking.
- Restore SMTP, cloudinary and WhatsApp settings as used. Send email to an inbox you control, verify sender-domain authentication with the provider and test an admin image upload.
- Configure Razorpay **test-mode** credentials first in Admin > Payments, with the exact webhook URL/events shown there and in `PAYMENTS_SETUP.md`. Keep the payment encryption key stable. Verify capture, failure/dismissal, pending status/reload, duplicate-event handling, inventory changes and refund reconciliation. Inspect the resulting order/payment records in admin and MongoDB.
- If COD is enabled, place a disposable order, verify stored address/items/totals, cancel it, and confirm stock returns once. Review payment worker heartbeat/retries and email delivery status.
- Switch to live provider credentials only after tests and account activation; confirm live-mode webhooks separately. Real charges/refunds require your business decision.

The included end-to-end test uses the actual production API, secure cookies and isolated MongoDB for COD. Online payment contract tests use controlled doubles. Real Razorpay capture/refund, SMTP delivery, Atlas latency, host TLS/domain routing and provider activation remain deployment-specific acceptance checks.

## 6. Operations and rollback

Back up MongoDB, the vault and original keys securely; test restoration into an isolated environment. Monitor `/readyz`, host logs, database capacity and payment/email worker state. Request errors include an `X-Request-Id` correlation value and sanitized production logs. Avoid logging secrets or full customer/payment payloads.

SIGTERM/SIGINT drains HTTP requests and workers, closes sessions/database connections and has a 25-second deadline. Forced termination still relies on reconciliation/retry behavior; verify worker recovery after maintenance. On Windows, the local process launcher uses an IPC shutdown message because Windows `SIGTERM` forcibly terminates child processes instead of invoking Node's graceful handler. Proxy trust must match the actual ingress hop count and Node must not be directly reachable by untrusted clients.

Hashed static assets are compressed/cached for one year; HTML/API responses remain uncached. A stale tab that cannot load a retired route chunk gets a manual reload action. After checkout, check order status before placing another order; page reloads never automatically resubmit payment.

Keep the last known-good Git commit and use Render's Deploys page to redeploy that version if a release must be rolled back. Database changes need a separately reviewed restore/forward-fix plan; do not overwrite newer orders or blindly downgrade the database. Single-instance restarts have a short interruption. Use the Render service's Logs and Events views to inspect builds, startup failures, restarts and health-check results.

## Official references

- [Render Node deployment](https://render.com/docs/deploy-node-express-app), [Blueprint specification](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks)
- [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/)
- [Bootstrap Sass configuration](https://getbootstrap.com/docs/5.3/customize/sass/)
