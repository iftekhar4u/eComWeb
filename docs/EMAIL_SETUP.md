# AURELIA — Nodemailer setup

This delivery contains the completed SEO version plus the requested email features. Use this guide for the combined update; the dependency and verification notes in older SEO/admin documents describe their earlier delivery only.

## Ek baar mein update apply karein

1. Stop the running app and keep a copy of your current project. Copy the contents of the ZIP's `InternProject` folder into your project, matching `backend`, `frontend`, `shared`, `admin-tools` and root files. This includes SEO and email together.
2. Keep your existing `backend/.env`, MongoDB database, `SESSION_SECRET` and `MFA_ENCRYPTION_KEY`. The ZIP contains examples, not your real credentials or database. Existing accounts and product records remain in your current database.
3. From the project root, install the supplied lockfiles and start:

   ```bash
   npm run install:all
   npm run dev
   ```

   The install helper's generic output mentions setup. For an existing project with its `.env`, go directly to `npm run dev`; a new setup/seed/reset is not needed. Nodemailer is the new backend dependency; frontend dependencies remain those of the completed SEO version.
4. Open **Admin → Email** (`/admin/email`) and configure the fields below. Delivery starts disabled unless enabled through the backend environment or saved admin settings.
5. Save settings, click **Check SMTP connection**, then **Send test email to me**. The test goes to the signed-in administrator's email. Open **Delivery history** and refresh to see its result.

The existing MongoDB replica set / Atlas configuration is required. The email worker starts with the existing backend process; there is no additional terminal or worker command. Production keeps the existing commands:

```bash
npm run build
node admin-tools/production.mjs
```

## Credentials and sender configuration

| Admin field | What to enter |
| --- | --- |
| Enable email delivery | Turn on after entering your provider's settings |
| SMTP host | Your provider's SMTP hostname |
| SMTP port | The provider's port, commonly 587 or 465 |
| Use TLS from connection start | Normally enabled for 465; disabled for 587, which uses STARTTLS |
| SMTP username | Your provider's SMTP login |
| SMTP password / app password | The provider's SMTP credential; an app password if the provider requires one |
| Sender name | The name customers see, initially AURELIA |
| Sender email | A sender address authorized by your provider |
| Support inbox | Inbox receiving contact enquiries; also the reply address on customer emails |
| Public website URL | Your React website origin, e.g. `https://your-domain.com`; blank uses backend `CLIENT_URL` |

Production requires HTTPS action links and encrypted SMTP transport. Use the provider's hostname so TLS certificates can be checked. Configure the sending domain's authentication records with your provider to support inbox delivery.

**Save first, then test:** both test buttons use saved configuration. SMTP verification checks connection/authentication; the test message also checks sender acceptance. “Sent” in history means the SMTP server accepted the message. Inbox placement and subsequent bounces remain provider-side; this app does not process bounce webhooks.

Saved SMTP passwords are encrypted with AES-256-GCM. The admin API never returns the password or encrypted value, only whether one is configured. Leave the password field blank to retain it; enter a new value to rotate it. The explicit removal checkbox clears it. SMTP credentials and templates can be changed without restarting the backend; each worker batch reloads saved settings.

Email encryption uses `EMAIL_ENCRYPTION_KEY` if set, otherwise the existing `SESSION_SECRET`. An optional separate key must have at least 32 random characters and must be configured **before saving email credentials**. Keep this key stable across restarts and backend instances, and back it up with your environment configuration. Changing it makes saved passwords, queued encrypted payloads and existing unsubscribe links unreadable/invalid. Restore the original key to retain those records; saving a new SMTP password alone does not recover old queued messages or links. MFA continues to use its existing separate key.

Environment configuration is an alternative before saving settings in admin:

```env
EMAIL_ENABLED=false
EMAIL_ENCRYPTION_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
MAIL_SUPPORT=
```

Actual values belong in `backend/.env` or your host's backend environment. Admin-saved email settings take precedence over these SMTP defaults. Environment edits require a backend restart. Keep `CLIENT_URL` correct for the existing frontend/API deployment.

## When emails are sent

| Feature | Trigger and behavior |
| --- | --- |
| Forgot password | Existing `/forgot-password` requests a link. Eligible local-password accounts receive a single-use, 30-minute token. Unknown and Google-only accounts get the same public request response, without receiving a local password-reset link. |
| Signup verification | Local signup queues a 24-hour verification link. Resend from the profile notice or `/signup#resend`. Verification is nonblocking: existing login and checkout access are retained. |
| Welcome | Sent after email verification, or for a newly created verified Google account. Repeated confirmations do not create repeated welcomes. |
| Password changed | Queued after profile/admin password changes and forgot-password completion. Existing sessions and outstanding reset links are invalidated. MFA enrollment remains intact. |
| Order confirmation | COD: after successful order creation. Online payment: after the backend confirms payment and commits inventory. An unpaid online checkout does not receive a paid confirmation. |
| Shipped / delivered / cancelled | Queued when the existing fulfillment status actually changes. Shipped messages include the recorded tracking number. Re-saving the same status does not send another notification. |
| Refund update | Queued when payment reconciliation confirms an increased cumulative refunded amount. Includes the total refunded so far. Refunds still use the existing Razorpay flow; email does not initiate a refund. |
| Contact form | Existing contact form saves the enquiry, queues a team email to the support inbox, and queues a customer receipt. Replying to the team email addresses the customer. |
| Newsletter confirmation | Existing newsletter form saves a pending subscription and sends a 24-hour confirmation link. Only confirmed subscribers receive campaigns. |
| Newsletter welcome | Sent after confirmation and includes unsubscribe access. |
| Newsletter campaign | An administrator saves a draft, reviews it, checks the confirmation box, and clicks Send newsletter. It is never sent automatically just because a draft was saved. |

Order emails use the order's historical item and amount snapshots. Existing payment, shipping and cancellation eligibility rules still determine which transitions are allowed. Partial refund notices show the cumulative total and do not claim the bank has already credited the customer's account.

## Templates, newsletter and delivery history

**Templates:** edit the subject and plain-text message independently for each email type, or enable/disable a type. Preview uses sample data. Supported `{{placeholders}}` are listed in the editor; use the ones appropriate to that email. Required action links, order details and newsletter unsubscribe links are appended by the server. Customer values and text are escaped in the HTML version.

**Newsletter:** create a draft, preview, save, review and explicitly send. New subscribers confirmed after the campaign start are excluded from that campaign. Each subscriber has a separate job; addresses are not exposed through a shared To/CC list. Existing historical subscriber rows are not automatically treated as confirmed: their owners can use the existing signup form to receive a confirmation link. Unsubscribe requires the signed link and an explicit confirmation button; it stops marketing emails and leaves account/order notifications available. Rejoining starts a fresh confirmation cycle.

**Delivery history:** shows pending, processing, sent, failed and cancelled jobs, sanitized error messages and attempt counts. The worker processes up to five jobs per ten-second batch per backend instance. Temporary failures retry with increasing delays, up to five attempts. Failed unexpired messages can be retried from admin. Expired account links need a fresh request. Payloads are encrypted while queued; sent/cancelled payloads are removed. Terminal job metadata is automatically removed after about 30 days by MongoDB TTL. Failed encrypted payloads are retained only until retry or that expiry.

Turning delivery off pauses pending jobs; enabling it later resumes them. Turning off a specific template cancels applicable queued messages when examined by the worker. Campaign cancellation stops remaining queued campaign messages; an already in-flight SMTP message may finish. Unique event keys prevent ordinary duplicate order/refund/campaign jobs. Like other SMTP queues, a crash after SMTP acceptance but before recording success can cause a duplicate retry; exactly-once inbox delivery is not guaranteed.

## Backend access

The service is available as `req.app.locals.email` inside Express. Domain hooks are bound to it at server startup:

```js
import { emailEvent } from './email/events.js'

// Use the active MongoDB transaction where the business write needs atomicity.
await emailEvent('welcome', {
  userId: user._id,
  email: user.email,
  name: user.name,
}, { session })
```

Choose the import path relative to your controller. Existing signup, password, commerce, contact and fulfillment hooks are already wired. `orderEmailSnapshot()` and `orderEmailEvents()` handle order transitions. `enqueue(kind, recipient, payload, eventKey, options)` is available to trusted backend code for an existing template kind; provide a stable business event key. `shared/email.mjs` defines the templates and permitted kinds.

| Endpoint group | Operations |
| --- | --- |
| `GET /api/email/status` | Public availability flags |
| `POST /api/email/password/request`, `/password/reset` | Request / consume reset link |
| `POST /api/email/verification/request`, `/verification/confirm` | Request / consume verification link |
| `POST /api/email/newsletter/confirm`, `/newsletter/unsubscribe` | Confirm / unsubscribe |
| Existing `POST /api/content/contact`, `/newsletter` | Contact and subscription submission |
| `/api/admin/email/settings` | GET sanitized settings; PUT validated settings with `version` |
| `/api/admin/email/verify`, `/test`, `/preview` | POST connection check, self-addressed test, or preview |
| `/api/admin/email/jobs`, `/subscribers`, `/campaigns` | GET history, subscribers and campaign list |
| `/api/admin/email/jobs/:id/retry` | POST retry a failed eligible job |
| `/api/admin/email/campaigns` and `/:id` | POST draft / PUT draft with `version` |
| `/api/admin/email/campaigns/:id/send`, `/:id/cancel` | POST explicit send / cancellation |

All writes use the existing CSRF session token; admin endpoints retain the existing administrator/MFA rules. Public email requests have rate limits. Action tokens are stored hashed for validation and delivered in URL fragments on existing routes, with an explicit POST action on the page. A mail scanner opening a GET URL cannot reset a password, confirm an account or unsubscribe a customer.

## Database and source preservation

Startup adds `email_settings`, `email_jobs` and `email_campaigns` collections and their indexes. It extends existing subscribers with optional consent/confirmation fields and auth tokens with an optional session-version field. Existing records are not rewritten during startup. MongoDB's strict validators are extended additively; the database account needs collection/index creation and `collMod` privileges. A privilege error requires an authorized database account, not dropping collections or disabling validation.

The complete SEO implementation is retained. Dedicated SEO source, routes, schema, sitemap files, SEO admin editors and all stylesheets match the completed SEO ZIP. Email additions reuse existing UI classes; email settings are loaded separately when the new admin section is opened. SMTP secrets live in a separate private collection, not the public storefront settings.

See `EMAIL_CHANGES.md` for the exact source file list against the SEO ZIP.

## Verification and remaining deployment check

Run from the project root:

```bash
npm run test:email
node --test backend/email/tests/*.test.js backend/seo/tests/*.test.js backend/admin-ready/tests/*.test.js
npm run build
```

50 automated checks passed: 16 email checks plus the 34 existing SEO/admin checks. Email HTTP tests execute the actual Express routes and Mongoose casting/validation with isolated collection fixtures. Coverage includes encrypted credentials/redaction, authorization/CSRF, hashed single-use expiring tokens, session revocation, Google-only reset behavior, signup verification/welcome, password alerts, contact messages, order/refund deduplication, double opt-in/unsubscribe/rejoin, explicit campaign send/cancellation, bounded retries, template safety and additive schema provisioning. A real Nodemailer connection and MIME message were tested against an isolated local SMTP sink.

Browser checks with controlled data passed for admin credentials save/reload, template preview/save, test controls, delivery history, password reset, verification, newsletter draft/send, confirmation and unsubscribe. The new screens fit desktop and 390px mobile widths without horizontal overflow or JavaScript errors. Existing SEO editor/metadata workflows also passed; unchanged product-page screenshots were compared at desktop/mobile widths.

A live MongoDB process could not run in this verification environment (`Operation not permitted`), so replica-set transaction/index behavior still needs checking on your existing local or staging database. No private database or real SMTP credentials were used, and no external email was sent. After configuring your provider, use the admin self-test, then verify signup/reset and one test order using accounts and addresses you control. Successful local SMTP tests do not establish production inbox delivery.

Nodemailer transport reference: https://nodemailer.com/smtp (TLS options and the scope of `verify()`).
