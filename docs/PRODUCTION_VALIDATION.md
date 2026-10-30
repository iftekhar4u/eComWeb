# Production validation — 26 October 2026

The release passed the checks below in an isolated Linux workspace with Node 24.22.1 and npm 11.9.0. These are observed results, not a guarantee of fault-free live operation. No real customer database, payment credentials or email account was used.

## Test results

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Node: admin, integrations, email, SEO, request IP, production lifecycle | 86 | 0 | 0 |
| Vitest: security, payments, reconciliation and payment upgrade | 60 | 0 | 0 |
| Real MongoDB: database constraints, commerce and migration dry-run | 27 | 0 | 0 |
| Playwright: production frontend, payments UI, blog/About, accessibility | 14 | 0 | 0 |
| Playwright: actual production server + HTTPS + MongoDB COD checkout | 1 | 0 | 0 |
| **Total** | **188** | **0** | **0** |

The production checkout test registers a user, confirms a Secure/HttpOnly/SameSite cookie, adds a real product to cart, submits an address and COD order, reloads to recover the session/order, then cancels. Direct database assertions confirm exactly one order, saved items, persisted sessions and exact stock restoration. Cancelled unpaid COD remains unpaid (`paymentStatus: failed`). The server then exits cleanly on SIGTERM.

The DB suites use disposable MongoDB 8.0.15 replica sets, with validation/indexes enabled. The new dry-run regression confirms that importing models and running the migration dry-run creates neither collections nor indexes. Real DB testing also exposed and fixed the immutable-role error during address saving and legacy MFA enrollment. The legacy MFA URLs now share the tested admin security implementation and rotate session/CSRF state.

Other checks passed: production build; request-ID/error redaction; health/readiness failure and recovery; gzip/immutable static caching; preserved request-IP/proxy/IPv6 rate limiting; graceful HTTP/worker shutdown; catalog result preservation; six deployment smoke requests; read-only database preflight. The Render Blueprint was checked against its official schema in that validation run.

## Dependencies and lint

Root tooling, backend and frontend `npm audit --json` each reported **0 known vulnerabilities** at validation time. This is a time-specific registry result, not a security certification. Exact audit summaries are in `reports/audit-*.json`.

Frontend lint exited successfully with **0 errors and 20 existing advisory warnings**, mainly React Fast Refresh export layout and state updates inside effects, plus one render-time clock warning. They were not hidden or globally disabled. Existing auth/cart/admin behavior was kept rather than performing a broad unrelated component rewrite.

## Build size

The original uploaded source was built with the same installed application dependency versions for comparison. Gzip figures below use the same Node `gzipSync` defaults on both builds, and include all statically imported entry chunks/CSS. Lazy route chunks are excluded from initial transfer. kB means 1,000 bytes.

| Metric | Original | Release | Reduction |
| --- | ---: | ---: | ---: |
| Initial JavaScript, gzip | 153.55 kB | 121.46 kB | 20.9% |
| Initial CSS, gzip | 42.78 kB | 12.10 kB | 71.7% |
| Largest JavaScript chunk, uncompressed | 516.09 kB | 311.78 kB | 39.6% |

The original Vite output reported a 516.08 kB chunk and its 500 kB warning. The release largest chunk is 311.78 kB; it builds without that warning. The warning limit was not increased. Enforced budgets are 125,000 bytes for initial gzip JS, 15,000 for initial gzip CSS and 500,000 for any uncompressed JS chunk. Vite's own gzip display may differ slightly from Node's compression settings; the comparison above uses one measurement method.

Changes include deferred admin/account/checkout/content routes, a shared BlogCard that does not import all blog routes, scoped auth/profile CSS, only the Bootstrap modules actually used, high-priority hero loading and a stable initial content/loading layout. Existing page design and admin editing remain; contrast and mobile drawer semantics were adjusted for accessibility.

## Lighthouse lab comparison

Lighthouse 13.5.0 used separate fresh Chromium 153 processes, the mobile default and an explicit desktop configuration. Both versions used the same eight-product fixture, local SVGs and local hero image. This is one before/after lab sample per mode, not a statistical distribution or field Core Web Vitals. Both runs completed with no missing/error audits.

| Mode | Performance, before → after | Accessibility, before → after | Best practices, after | SEO, after | LCP, after | CLS, after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 35 → 92 | 92 → 100 | 96 | 100 | 2.45 s | 0.0000 |
| Desktop | 71 → 100 | 92 → 100 | 96 | 100 | 0.60 s | 0.0014 |

The best-practices score includes the expected unauthenticated session request returning HTTP 401; the authentication contract was retained. Automated axe WCAG 2/2.1 A/AA checks found no violations on the fixture storefront and mobile About flow. Desktop/mobile About screenshots were visually inspected. These checks do not replace a complete manual accessibility audit, testing every admin page, or testing the real catalog/images.

Raw metrics, diagnostics and failed-audit names are retained in `reports/lighthouse-baseline.json` and `reports/lighthouse-production.json`. Actual CDN images, content, mobile devices, Atlas latency, TLS and host capacity will change results.

## API timing sample

The real production server with disposable MongoDB served **50 catalog requests at concurrency 5 with 0 errors**. Observed latency: p50 **15.0 ms**, p95 **34.9 ms**, p99 **42.8 ms**. This local smoke sample has one product and a warm process; other verification work shared the machine. It is not a load/capacity promise, soak test or production Atlas benchmark. `reports/live-commerce.json` contains the raw summary.

## Reproduce and understand the limits

Run `npm run install:all`, install Playwright Chromium from `frontend`, then `npm run verify`. Run `npm run benchmark` separately to avoid competing CPU load. The verification groups were executed and inspected individually here; the root `verify` chains the same groups for local/CI use.

That Linux validation run used the optional Chromium executable override and one frontend project per case to accommodate its single-process browser. The shipped Playwright configuration uses the standard installed browser without these environment overrides. Lighthouse used a multi-process browser and independent mobile/desktop configs.

The actual Render deployment and GitHub-hosted workflow have not run. Multi-instance scaling, endurance/peak traffic and external penetration testing were not performed.

Online payment tests use controlled provider responses; real Razorpay capture/refund and webhook delivery, SMTP inbox delivery, Google OAuth, cloudinary upload, live Atlas connectivity, host DNS/TLS and domain-specific URLs must be accepted on the deployment account. Follow `DEPLOYMENT.md` before opening real orders. No live transaction, provider message or customer database change was made.

## Additional Windows verification — 29 October 2026

The full `npm run verify` workflow also completed on Windows with Node **v24.12.0** and npm **11.6.2**: Node tests **86/86**, Vitest **60/60**, isolated MongoDB tests **27/27**, browser tests **14/14**, and production-server checkout **1/1**; total **188 passed, 0 failed**. The production checkout uses a disposable MongoDB replica set, verified the persisted order/session and exact stock restoration, and shut down with exit code 0. Windows uses an IPC shutdown message because `child.kill('SIGTERM')` produces an OS termination on Windows rather than exercising Node's signal handler. Linux CI still exercises SIGTERM; the GitHub-hosted workflow has not yet been run in this session.

Frontend lint exited 0 with **20 advisory warnings**. All three npm audit scopes reported **0 known vulnerabilities**. The production build transformed 218 modules. Bundle measurements were **121,459 bytes initial JavaScript gzip**, **12,102 bytes initial CSS gzip**, and **311,776 bytes largest JavaScript chunk**; all existing budgets passed.

A separate Lighthouse 13.5.0 fixture run on this workstation returned performance/accessibility/best-practices/SEO scores of **87/100/96/100** in both mobile and desktop modes. Mobile LCP was **3.26 s**, CLS **0**; desktop LCP was **0.79 s**, CLS **0.247**. The desktop layout shift was attributed to late Google Playfair Display font loads; preserving the requested typography means this was documented rather than changed. The single expected unauthenticated `/api/auth/session` request returned 401 and appeared in Lighthouse's console-error audit. These are one-off local lab values and differ from the separately recorded Linux run; they are not field data.

The final local production verification reached `/readyz` **2.48 s** after process launch with a disposable MongoDB. It then completed **50 catalog requests at concurrency 5 with 0 errors** against one product: p50 **7.91 ms**, p95 **16.51 ms**, p99 **16.94 ms**. This is not a Render/Atlas capacity estimate. The live test's production configuration and database preflight passed with isolated test values. Running `npm run deploy:check -- --database` without production environment variables correctly failed before attempting any external database connection. The final Blueprint was reviewed against the current Render documentation, but this run did not perform a separate schema-tool validation or deploy it. No Render credentials, live Atlas connection, real payment, email provider, or production domain were available or tested here.
