# Production release: added and modified files

Compared with the source files in your uploaded `InternProject(7).zip`, before this production work. `A` = added, `M` = modified. No original application source files were deleted. Real `.env`/vault files were excluded from processing and delivery; keep your originals.

The original repository was supplied as a ZIP, so these labels describe the release delta, not the temporary workspace's Git staging state. Generated validation reports are listed separately because `reports/` is ignored by Git.

## What changed

- Deployment: Node 24 production entry, persistent encrypted-vault storage templates, Render Blueprint and GitHub verification workflow. Existing Docker/Caddy files are not used or required by the Render deployment.
- Runtime: readiness/liveness, request correlation, sanitized errors, graceful HTTP/worker shutdown, bounded database pools and compressed/immutable static assets.
- Commerce correctness: atomic address saving avoids the immutable-role failure; legacy MFA endpoints use the tested secure implementation; migration dry-runs cannot auto-create model collections.
- Performance/UI: lazy route loading, selective Bootstrap CSS, shared blog card, hero priority, stable initial layout, contrast and mobile drawer semantics. Existing storefront/admin functionality remains, including dynamic blog/About editing.
- Validation: isolated real MongoDB tests, actual HTTPS COD checkout and stock/session assertions, accessibility/browser regressions, dependency audits and measurable bundle budgets.

The original request-IP fix, raw Razorpay webhook handling, payment reconciliation, admin MFA/CSRF controls and database-preservation guard remain. No customer database or saved credentials were changed.

## Git-style file list

**32 added, 32 modified, 0 deleted source/documentation files.**

```text
A  .dockerignore
A  .github/workflows/verify.yml
A  Dockerfile
A  admin-tools/benchmark-server.mjs
A  admin-tools/benchmark.mjs
A  admin-tools/bundle-budget.mjs
A  admin-tools/deploy-check.mjs
A  admin-tools/deploy-smoke.mjs
A  admin-tools/run.mjs
A  admin-tools/test-database.mjs
A  admin-tools/test-live.mjs
A  admin-tools/test.mjs
A  backend/production/health.js
A  backend/production/lifecycle.js
A  backend/production/tests/production.test.js
A  backend/tests/migration-dry-run.test.js
A  compose.production.yml
A  deploy/Caddyfile
A  deploy/compose.env.example
A  deploy/production.env.example
A  docs/DEPLOYMENT.md
A  docs/PRODUCTION_CHANGES.md
A  docs/PRODUCTION_VALIDATION.md
A  frontend/playwright.live.config.js
A  frontend/src/bootstrap.scss
A  frontend/src/components/BlogCard.jsx
A  frontend/src/components/RouteBoundary.jsx
A  frontend/tests/browser-options.mjs
A  frontend/tests/e2e/production.spec.js
A  frontend/tests/live/commerce.spec.js
A  frontend/tests/storefront-fixture.mjs
A  render.yaml
M  .gitignore
M  README.md
M  admin-tools/install.mjs
M  backend/admin-ready/app.js
M  backend/admin-ready/server.js
M  backend/config/env.js
M  backend/db/migrate.js
M  backend/middleware/errorMiddleware.js
M  backend/package-lock.json
M  backend/package.json
M  backend/routes/authRoutes.js
M  backend/scripts/run-db-tests.js
M  backend/services/catalog.js
M  backend/tests/commerce.test.js
M  backend/tests/payments.test.js
M  frontend/package-lock.json
M  frontend/package.json
M  frontend/playwright.config.js
M  frontend/src/App.css
M  frontend/src/App.jsx
M  frontend/src/components/Layout.jsx
M  frontend/src/main.jsx
M  frontend/src/pages/AuthPages.jsx
M  frontend/src/pages/BlogPages.jsx
M  frontend/src/pages/ForgotPassword.jsx
M  frontend/src/pages/Home.jsx
M  frontend/src/pages/Profile.jsx
M  frontend/tests/e2e/content.spec.js
M  frontend/tests/e2e/payments.spec.js
M  frontend/vite.config.js
M  package-lock.json
M  package.json
```

## Included evidence (generated, ignored by Git)

```text
reports/audit-backend.json
reports/audit-frontend.json
reports/audit-tooling.json
reports/bundles.json
reports/lighthouse-baseline.json
reports/lighthouse-production.json
reports/live-commerce.json
reports/verification.json
```

These reports contain fixture measurements, not production secrets or customer data. Screenshots are internal QA and are not part of the release.

## Apply the release

Back up or commit your current changes first. Either copy the source files from `InternProject/` into your checkout, preserving `.env` and the vault, or apply the included patch from your project root:

```bash
git apply --check /path/to/AURELIA-production.patch
git apply /path/to/AURELIA-production.patch
git status --short
```

Use one method; do not copy files and then apply the same patch. The patch targets exactly the supplied ZIP version and was checked against it. If you have changed those files since, review conflicts instead of forcing the patch. Generated reports are in the full ZIP but are not in the source patch.

Then install lockfile dependencies and verify:

```bash
npm run install:all
cd frontend
npx playwright install chromium
cd ..
npm run verify
```

For deployment, follow `DEPLOYMENT.md`; for measured checks and untested host/provider behavior, read `PRODUCTION_VALIDATION.md`. Do not run database setup/seed/migration merely to apply source changes. Use an explicit backed-up migration only when the existing schema guard requires it.
