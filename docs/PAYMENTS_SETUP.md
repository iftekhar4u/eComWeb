# AURELIA payment upgrade — setup and operations

This source upgrade adds dynamic Razorpay settings, durable webhook/refund jobs, a 24-hour cancellation hold, separate COD collection and return evidence, and customer/admin payment screens. Review the validation limits below before deployment.

## Install and migrate

Keep a database backup and a secure copy of existing environment files and the integration vault. Stop application writers during migration. Install dependencies using `npm ci --prefix backend` and `npm ci --prefix frontend`. Do not seed or reset an existing database.

Set a separate stable `PAYMENT_ENCRYPTION_KEY` (at least 32 characters) in the backend deployment environment. Generate a value locally with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Back it up securely; losing it prevents credential decryption. Do not rotate it by simply changing the variable: existing profiles must first be decrypted with the old key and re-encrypted under a controlled maintenance procedure.

Set `PAYMENT_PUBLIC_ORIGIN` to the externally reachable HTTPS backend origin. Preserve existing session, MFA, email, integration and database secrets. No payment secret belongs in a VITE variable.

Run `npm --prefix backend run db:migrate -- --dry-run`, inspect conflicts, then `npm --prefix backend run db:migrate`. The new marker is `003_recoverable_payments`. The migration adds compatible fields, backfills known environments and creates explicit indexes/jobs. Unknown legacy environments remain unknown; historical COD paid records remain unverified collection. Existing orders receive a deadline based on original creation time, never a fresh 24 hours. Re-run the migration to check repeatability in staging first.

Rollback requires a coordinated database backup restore and old application version while writers are stopped. Do not run the old application against new payment records or discard unresolved provider operations. Reconcile provider activity since the backup before reopening checkout.

Run `npm run build`, then use existing root startup commands. Diagnose `/api/health` and backend database logs before changing the frontend proxy. This delivery does not verify your Atlas TLS connection or resolve the earlier ECONNREFUSED symptom on your laptop.

## Administrator configuration

Open `/admin/payments`. Configure separate Test and Live credentials, the exact Razorpay merchant account ID, and independent webhook secrets. Saved secrets are write-only; blank inputs retain existing values. Changes require the current administrator password, existing MFA policy and revision matching. Credential validation makes a read-only API request; verify merchant identity and activated payment methods separately in the Razorpay Dashboard.

Configure automatic capture in Razorpay. Authorized payments remain pending and are never fulfilled; cancellation does not manually capture money. Supported cards/UPI use hosted Standard Checkout, with optional merchant-enabled netbanking/wallets. The application does not collect card numbers, CVV, OTP or UPI PIN.

Use the generated profile webhook URL and subscribe to payment.authorized, payment.captured, payment.failed, order.paid, refund.created, refund.processed and refund.failed. The compatibility URL is `/api/payments/razorpay/webhook`. Use a public HTTPS tunnel for local Test-mode verification. Configure its origin explicitly and restart; localhost alone cannot receive provider callbacks.

Environment credentials are fallback only before the first persisted settings revision. Import existing environment credentials by saving settings before changing/removing them. Keep account/environment associations stable for old transactions. Rotation retains signature material and permits API recovery through usable credentials for the same account/environment. Old webhook secrets expire after the configured overlap; revoked API keys do not become usable merely because they are retained.

COD can operate with prepaid disabled and no Razorpay credentials. Select the intended Test/Live reporting mode, fee, eligible pincodes/SKUs and open-order limit. Routine policy edits do not shorten existing cancellation entitlements.

## Lifecycle and operations

Customers may cancel while server time is strictly earlier than their snapshotted deadline. All shipping paths enforce that hold. Paid cancellations persist refund intent while retaining cancellation even during provider outages. Pre-dispatch committed stock is restored once. Generic refunds never prove goods were returned.

COD delivery does not mark payment paid. In order detail, record full collection with courier/bank reference and evidence, then record full remittance separately. Reimbursement requires collected money and cancellation or received return. Record failed/refused/returning stages; stock restoration after dispatch requires physically received and inspected goods.

Refunds reserve captured balances before provider calls. Pending, submitting, unknown and review commitments remain reserved. Retries reuse the original request and X-Refund-Idempotency key. An accepted refund is not bank-credit confirmation. The local 24-hour unknown-submission cutoff is a conservative application policy, not a claimed provider retention guarantee. Review unresolved operations in the provider Dashboard before an explicit new operation; never make a new key merely to escape an uncertain result.

The server starts/stops the payment worker. Durable leases coordinate instances; worker health, failed events/jobs and refunds appear in Payment Settings. Review-state retries retain identity. Restore provider access or mapping before retrying. Notification intent uses the existing durable email system; SMTP failures cannot reverse financial state. Delivery is not claimed exactly once.

Checkout stores a durable intent before submission. Recover the existing order after refresh/dismissal. A new purchase requires an explicit action. Purchased-cart cleanup is version-aware and preserves a newer cart rather than subtracting quantities repeatedly.

## Verification and release gate

Executed during implementation: 60 backend unit tests and 66 existing admin/email/SEO Node tests passed; frontend production build passed; lint reported warnings but no errors. These results use mocks where applicable and precede the final small credential-fallback/cart snapshot fixes; rerun commands below.

Real MongoDB transaction tests could not run here: disposable mongod exited with Operation not permitted. Browser tests could not launch because Chromium download was incomplete. Neither is a passing integration result. No real Razorpay Test-mode credentials, merchant activation, mobile UPI device or public webhook endpoint was exercised. Run these checks before accepting production traffic.

Commands:

- `npm --prefix backend run test:unit`
- `npm run test:admin`
- `npm run test:email`
- `node --test backend/seo/tests/*.test.js`
- `npm --prefix frontend run lint`
- `npm run build`
- `npx --prefix frontend playwright install chromium`
- `npm --prefix frontend run test:browser` (mocked provider, production CSP server)
- `npm --prefix backend run test:integration` ONLY with an isolated disposable replica set named aurelia_test; this clears collections.

Before release, validate populated old-schema migration and repeat migration, real database write contention/rollback, cancellation-versus-shipping/capture races, worker restart/lease expiry, provider lost responses, credential rotation, real Checkout CSP resources, Test-mode refund/webhook delivery, mobile UPI return and cross-tab cart behavior. The automated suites are not exhaustive proof of financial concurrency safety.

## Requirement map

| Area | Implementation | Evidence |
|---|---|---|
| Dynamic settings and encryption | backend/payments/settings.js, crypto.js; PaymentSettings.jsx | payment-upgrade unit suite; real rotation pending |
| Captured evidence and duplicate effects | commerce.js; payments/models.js | reconciliation and commerce suites |
| Durable webhook inbox and worker | webhookRoutes.js; payments/worker.js | unit ingestion/claim tests; real restart checks pending |
| Refund commitments and recovery | payments/refunds.js | mocked regression tests; real transaction checks pending |
| Cancellation, COD and stock | payments/lifecycle.js, policy.js | boundary unit tests; commerce database suite |
| Strict schema migration | payments/database.js; db/migrate.js | database suite; populated upgrade validation pending |
| Customer recovery and cart | Checkout.jsx, Orders.jsx, checkoutIntent.js, cartRoutes.js | authored Playwright suite; launch blocked |
| Admin operations/reporting | payments/adminRoutes.js; OrderPaymentActions.jsx; admin route aggregates | existing admin tests; new browser forms pending |
| CSP and email | admin-ready/app.js; payments/outbox.js | CSP unit and existing email tests; real Checkout pending |

Official implementation references: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/ ; https://razorpay.com/docs/webhooks/validate-test/ ; https://razorpay.com/docs/api/refunds/normal-refunds-idempotent/ ; https://razorpay.com/docs/api/orders/fetch-all/ .
