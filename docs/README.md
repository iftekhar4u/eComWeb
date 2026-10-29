# AURELIA

Existing storefront, dynamic admin panel, blog/About editing and commerce API, prepared for a persistent Node.js 24 deployment with MongoDB Atlas or a replica set.

**Start with [the deployment guide](./DEPLOYMENT.md).** See [validation results](./PRODUCTION_VALIDATION.md) and [the new/modified file list](./PRODUCTION_CHANGES.md). No live hosting or provider account has been deployed by this source update.

## Preserve your configuration

Keep your original `backend/.env`, `backend/.private/integrations.enc` (or custom vault directory), encryption/session keys and database. They are intentionally excluded from the release ZIP. Do not rerun setup or seed an existing database. Normal startup preserves existing business records; explicit migrations require a backup and database confirmation.

## Local development

From the project root:

```bash
npm run install:all
```

With your existing development environment restored, keep two terminals open:

```bash
# Terminal 1
npm --prefix backend start
```

```bash
# Terminal 2
npm --prefix frontend run dev
```

Store: http://localhost:5173/ · Admin: http://localhost:5173/admin · API: http://localhost:5000/api/health

Alternatively use `npm run dev` for the combined launcher. MongoDB Atlas or a running local replica set must be reachable; Compass is a database client. Local settings use `NODE_ENV=development`, `CLIENT_URL=http://localhost:5173`, `TRUST_PROXY=0`.

## Build and verify

```bash
cd frontend
npx playwright install chromium
cd ..
npm run verify
npm run benchmark
```

`verify` runs all test groups, lint, the production build, bundle budgets and dependency audits. DB tests own disposable local replica sets. Browser/MongoDB downloads and audits need network access. Lighthouse benchmarks use lab fixtures and need Chrome/Chromium; see the validation report for scope and remaining host/provider checks.

`npm run build` creates `frontend/dist-admin`. With a correct production environment, `npm start` serves frontend/admin/API from one service; do not run Vite in production. Use `npm run deploy:check -- --database` before opening traffic and `npm run deploy:smoke -- https://YOUR_DOMAIN` afterward.

## Documentation

| File | Purpose |
| --- | --- |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Render-only setup, credentials, migrations, launch checks and backups |
| [PRODUCTION_VALIDATION.md](./PRODUCTION_VALIDATION.md) | Tests, before/after benchmarks and limits |
| [PRODUCTION_CHANGES.md](./PRODUCTION_CHANGES.md) | Git-style added/modified files for this release |
| [BLOGS_ABOUT_SETUP.md](./BLOGS_ABOUT_SETUP.md) | Blog creation and dynamic About content |
| [PAYMENTS_SETUP.md](./PAYMENTS_SETUP.md) | Razorpay, credentials, webhooks and recovery |
| [EMAIL_SETUP.md](./EMAIL_SETUP.md) | Admin email settings and delivery |
| [SEO_SETUP.md](./SEO_SETUP.md) | SEO settings and metadata |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Application architecture |

Older change/setup documents describe earlier updates. Use the production documents for deployment and this release's file list.
