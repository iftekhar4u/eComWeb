# AURELIA — WhatsApp, Cloudinary and MongoDB Atlas update

Prepared for the supplied `InternProject(4).zip` on 17 October 2026.
Read this alongside the existing README files. It documents the new integrations;
the original store, admin navigation, authentication and commerce implementation
remain in place.

## 1. What was implemented

| Task | Delivered behaviour | Where to manage it |
| --- | --- | --- |
| WhatsApp enquiries | Green floating WhatsApp button at the bottom-right of store pages; opens a chat with an editable message. On mobile it sits above the existing bottom navigation. | Admin → Settings → WhatsApp enquiries |
| Cloudinary | Encrypted backend credentials, connection test, signed backend image uploads, and upload controls beside existing image URL fields. | Admin → Settings → Cloudinary images; Products, Categories and Storefront editors |
| MongoDB Atlas | Encrypted saved URI, connection/transaction check, separate selection for the next backend restart, migration helper, and recovery to the original environment database. | Admin → Settings → MongoDB Atlas |

The features start unconfigured/disabled. No phone number or provider credentials
were invented. No Cloudinary upload or Atlas data migration was performed against
a real account while preparing this update.

**The source ZIP does not contain your running MongoDB database.** Existing data
must be copied from your actual local MongoDB instance on your own computer.

### WhatsApp scope

The reference image shows a click-to-chat button. This uses WhatsApp's `wa.me`
link format and needs a WhatsApp number, **not an API key or paid messaging API**.
The customer opens WhatsApp/Web, edits the message if wanted, and presses Send.
The website does not send messages automatically, record the conversation, or
provide an inbox/bot. WhatsApp Cloud API messaging and webhooks are a separate
integration and are not represented by unused credential fields here.

## 2. Apply the update without replacing your settings

1. Back up your current project and local MongoDB database.
2. Stop both frontend and backend terminals.
3. Extract this ZIP. Copy the contents of its `InternProject` folder into your
   current project folder and allow the matching **source files** to be updated.
4. **Keep your existing `backend/.env`.** Keep the same `SESSION_SECRET` and
   `MFA_ENCRYPTION_KEY`. Do not run setup to regenerate these keys.
5. The archive intentionally excludes `.env`, `.git`, `node_modules`, old build
   output, private integration settings, logs and backups. Your existing local
   copies are not removed by copying these files.
6. No npm dependency versions were changed and no new runtime packages were
   added. If using a freshly extracted folder, restore your original `.env` and
   install the existing dependencies:

   ```bash
   npm run install:all
   ```

7. Start the project using your normal command:

   ```bash
   npm run dev
   ```

   The existing two-terminal flow also works: `npm run dev` inside `backend`,
   and `npm run dev` inside `frontend`.

8. Open `http://localhost:5173/admin`, sign in, and open **Settings**. The existing
   settings and profile forms remain; the integration cards are appended below.

For production, rebuild after applying the source changes:

```bash
npm run build
```

This writes the existing `frontend/dist-admin` target. Follow your current
production start/deployment instructions. Do not serve a stale build from the
previous project ZIP. Use the project's existing Node 24 environment.

## 3. Configure WhatsApp

1. Open **Admin → Settings → WhatsApp enquiries**.
2. Enable **Show the WhatsApp button**.
3. Enter your business WhatsApp number with its country code. For an Indian
   number use `91` followed by the ten-digit number. Leading `+`, spaces, hyphens
   and parentheses are normalized; the stored value is international digits.
4. Edit the pre-filled message and accessible button label.
5. Optionally include the current public product/catalog page link.
6. Save and refresh a storefront page, or return focus to the storefront tab.

The public endpoint exposes only the enabled button's number, message, label and
link preference. It never includes Cloudinary or MongoDB fields. Query strings,
URL fragments, order pages and account pages are not added to a message.

The widget is part of the existing storefront layout, so it appears on pages
that use that layout. The independent admin, login, signup and password-reset
screens keep their original layouts. A missing/disabled configuration or failed
settings request hides the widget without blocking the store. A number must
actually be registered with WhatsApp; the application checks its format only.

## 4. Configure Cloudinary and upload images

1. Create/open your Cloudinary product environment.
2. Copy its **Cloud name**, **API key**, and **API secret** from its console.
3. Open **Admin → Settings → Cloudinary images**.
4. Enter the credentials, choose a folder such as `aurelia`, enable uploads, and
   enter your current administrator password.
5. Click **Test Cloudinary connection**, then **Save Cloudinary settings**.
   Saving an enabled configuration also tests it before applying the change.
6. Open an existing product, category or homepage section. Select an
   image using its Cloudinary upload control. The resulting HTTPS URL fills the
   existing image field. **Save the entry** (and publish the homepage when
   appropriate) to make it visible on the site.

The shared article editor also supports the upload control; this update does not
add a new Blogs navigation item to the original admin menu. Main product images
and gallery images have separate controls. Gallery uploads
append one URL per upload and stop at the existing twelve-image limit. Existing
URL fields are still editable. Existing image URLs are not rewritten or moved.

Supported uploads: JPEG, PNG, WebP and GIF, maximum **5 MiB per image**. The server
checks MIME type and file signatures; Cloudinary then processes the actual image.
SVG, arbitrary URLs and other file types are not accepted by the upload endpoint.
One file is sent at a time; credentials never pass to Cloudinary from the browser.

The server signs the upload parameters with SHA-256, uses HTTPS, assigns a unique
asset ID, and disables overwriting an existing asset. Provider errors are
sanitized. The browser receives an image URL and limited asset metadata only.
No unsigned upload preset is required.

Blank API key/secret fields preserve the saved values. They are never filled
back into the form. Change them by entering replacement values and saving.
Disabling uploads keeps saved credentials and existing images available. Removing
an image from an editor does not delete the Cloudinary asset; manage unused assets
in Cloudinary. An upload followed by cancelling an edit can leave an unused asset.

## 5. Configure Atlas and migrate existing data

### A. Prepare the Atlas connection

1. Create a MongoDB Atlas cluster that supports transactions (replica set/sharded
   cluster). The checkout already depends on transactions.
2. Create a **database user** with `readWrite` access to your intended application
   database. This is separate from your Atlas website login.
3. Add the backend computer/server's public IP to the project's IP access list.
   On deployment, allow the deployed backend's address rather than only your
   laptop. Ensure outbound MongoDB connections and DNS SRV lookups are available.
4. Copy the **Drivers** connection string, supply the database user/password,
   and include an explicit application database name:

   ```text
   mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@cluster0.example.mongodb.net/aurelia_cloud?retryWrites=true&w=majority
   ```

   This is a placeholder. Use your real cluster hostname. Percent-encode special
   characters in the username/password. Never paste real credentials into source
   code, frontend environment variables, screenshots or this README.
5. Open **Admin → Settings → MongoDB Atlas**. Enter the URI and your current
   administrator password. Test the connection and save it.

The panel accepts Atlas SRV URIs ending in `.mongodb.net`, with credentials and
an explicit non-system database. It allows the usual `retryWrites`, `w`, `appName`,
`authSource`, `readPreference` and `maxPoolSize` options. TLS-disabling/unsafe
options, standard local MongoDB URIs and arbitrary hostnames are rejected in this
Atlas-specific form. Existing local database support in `.env` is unchanged.

Saving a URI only **stages credentials**. It does not change the current database,
copy records, modify `.env`, or switch an already-selected Atlas connection.
Atlas administration API keys are not required for this driver connection.

### B. Back up and copy the data

Keep the target database **completely empty**, including empty collections. Do
not run a seed command against it first. The helper deliberately refuses to merge
into or overwrite an existing database.

1. Take a database backup using MongoDB Database Tools (`mongodump`) or your
   established backup process. For example, substituting your current source URI
   and a private backup destination:

   ```bash
   mongodump --uri="YOUR_CURRENT_SOURCE_URI" --archive="aurelia-before-atlas.archive" --gzip
   ```

   Keep credential-bearing commands out of shared terminal logs. Prefer the
   database tool's protected configuration option when your source needs a password.
   Back up `backend/.env` securely too.
2. From the project root, inspect the copy plan:

   ```bash
   npm run db:atlas --prefix backend -- --dry-run
   ```

   This reads the **original `.env` database as the source** and the **saved Atlas
   URI as the destination**. The dry run makes no writes. It prints collection
   names and document counts, never credentials or document contents.
3. Close customer access, stop the backend, and stop every other process that can
   write to the source database. Leave the MongoDB service itself running.
4. With the source paused, run:

   ```bash
   npm run db:atlas --prefix backend -- --confirm-copy --source-paused
   ```

   The flags are your explicit assertion that writers are stopped and the backup
   is ready; the helper cannot independently stop other apps or external writers.

The helper copies ordinary application collections, preserving document IDs, BSON
types, collection validators and indexes. It batches documents, compares counts
and SHA-256 hashes of ordered BSON records, and reports each verified collection.
`sessions` and MongoDB system collections are excluded. The source is read-only.
No drop, overwrite, automatic cleanup or live dual-write operation is performed.

Views, time-series and capped collections need MongoDB Database Tools instead.
If the copy fails, the destination may contain a partial copy. Keep the original
source active; inspect the failure and choose a new empty destination for retry.
The script intentionally does not delete the partial destination. Keep the source
paused throughout copying and verification; this is not a live migration service.

### C. Select Atlas and restart

1. Keep customer access closed. Start the backend privately on the original
   source database so you can sign in to the admin panel.
2. Enter your current administrator password in the Atlas card, check the backup
   and migration confirmation, then select **Select saved Atlas for next restart**.
3. Activation rechecks connectivity and requires the target to contain the same
   active administrator, password hash, session version and MFA enrollment.
   This blocks selecting an empty target that would lock you out of the admin panel.
4. Stop and restart the backend. Models and the MongoDB session store now use the
   selected Atlas URI together. No connection is swapped during an in-flight order.
5. Sign in again, inspect products/categories/homepage and order data, test your
   normal store flows, and only then reopen customer access.

Keep payment/reconciliation writers quiescent during the cutover, including the
existing background payment reconciler. For a local development migration, ensure
there are no in-flight checkouts/payments. Starting the source backend can resume
those writers, so coordinate the private admin step and final verification before
reopening. This update does not add a new maintenance mode to existing checkout.

New writes go to the selected database only. There is no ongoing synchronization
between local MongoDB and Atlas. Switching back without reconciling newer writes
would show older data.

Existing maintenance/seed scripts retain their original `.env` database selection;
they do not automatically follow the new runtime override. Do not run them
assuming they target Atlas. This avoids silently redirecting old scripts.

### D. Recovery

- When the admin panel is available, enter your current password and select
  **Use .env database on next restart**, then restart. Reconcile any Atlas writes
  before using an older local database for customers.
- If an Atlas outage/credential change prevents startup, temporarily add
  `INTEGRATIONS_IGNORE_DATABASE=true` to `backend/.env`, then restart. The backend
  uses the original environment URI. Keep customer access closed while repairing
  the saved configuration. Remove/set the override to `false` and restart before
  selecting Atlas again.
- A changed encryption key or damaged vault fails explicitly. Restore the
  original key and encrypted file; do not replace them with fresh empty settings.
  The recovery override bypasses Atlas selection only; it does not decrypt a vault
  using the wrong key.
- The app never silently falls back to another database when Atlas cannot connect.

## 6. Credential storage and backend design

New configuration lives in `backend/.private/integrations.enc`, encrypted with
AES-256-GCM, a fresh random IV, authenticated context and a separate key derived
from the existing `MFA_ENCRYPTION_KEY`. It is deliberately outside MongoDB: storing
the only Atlas URI in Atlas would require the URI before it could be read.

The master key remains a backend environment secret. Keep it stable and private.
The vault directory is excluded from Git and public/static paths. New directories
and files use restrictive Unix permissions; configure equivalent filesystem access
permissions on Windows and on your hosting platform.

Writes use a temporary file, flush, atomic rename, exclusive file lock and a
revision check. Concurrent/stale edits are rejected instead of overwriting newer
settings. A small encrypted history keeps the most recent 30 action names,
administrator IDs and timestamps; it does not record submitted passwords or keys.
After an abrupt process termination, a stale `integrations.enc.lock` can remain.
Only remove that lock after stopping every backend process and verifying that no
settings write is active. Do not delete `integrations.enc`.

For deployment, set an absolute `INTEGRATIONS_DIRECTORY` to a **persistent private
volume**, and back up that directory and the encryption key separately. Ephemeral
filesystem hosting would lose saved settings on redeploy. This file-backed approach
targets the existing single backend process. Multiple independent servers require
a shared, appropriately locked configuration store or a managed secrets solution;
independent local files are not synchronized automatically.

Sensitive connection tests/changes require a fresh administrator password in
addition to the existing session, role and CSRF checks. Existing development
password-only admin access and production MFA behaviour are unchanged. Uploads
require the existing authenticated administrator session and CSRF token. Connection
changes/tests and uploads have separate rate limits and bounded request timeouts.

## 7. New API endpoints

All admin routes use the `/api/admin-ready/integrations` prefix. Admin GET responses
have `Cache-Control: no-store`, return secret-presence flags, and never reveal stored
keys or database URIs. Credential inputs are only sent to the backend over your
normal authenticated connection; use HTTPS for deployed admin access.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/integrations/whatsapp` | Public safe button settings only |
| GET | `/api/admin-ready/integrations` | Masked admin configuration and status |
| PUT | `…/whatsapp` | Save visibility, number, label, message and public-page option |
| POST | `…/cloudinary/test` | Test entered/saved credentials without persisting |
| PUT | `…/cloudinary` | Save encrypted credentials and upload settings |
| POST | `…/cloudinary/upload` | One multipart field named `image`, max 5 MiB |
| POST | `…/mongodb/test` | Test the entered/saved Atlas URI |
| PUT | `…/mongodb` | Stage an encrypted Atlas URI |
| POST | `…/mongodb/activate` | Select staged Atlas for the next restart |
| POST | `…/mongodb/use-environment` | Select original environment database for next restart |

Configuration writes include the current `revision`. Sensitive actions additionally
include `currentPassword`; Atlas activation requires `confirmMigration: true`.

## 8. Files and implementation approach

### New files

| File | Responsibility |
| --- | --- |
| `backend/integrations/store.js` | Encrypted vault, atomic updates, revision checks and response filtering |
| `backend/integrations/routes.js` | Validated/admin-protected settings, provider tests, uploads and database selection |
| `backend/integrations/cloudinary.js` | MIME/signature validation, SHA-256 upload signing, provider requests and safe errors |
| `backend/integrations/atlas.js` | Atlas URI validation, isolated test connection, admin-target checks and startup selection |
| `backend/integrations/migrate.js` | Empty-target copy, BSON preservation, indexes/validators and verification |
| `backend/scripts/migrate-to-atlas.js` | Explicit dry-run/copy command using saved Atlas credentials |
| `backend/admin-ready/tests/integrations.test.js` | Isolated regression/security/provider-contract/migration tests |
| `frontend/src/integrations/WhatsAppButton.jsx` | Storefront click-to-chat component |
| `frontend/src/integrations/whatsapp.css` | Scoped button styles and mobile/safe-area positioning |
| `frontend/src/admin-ready/IntegrationSettings.jsx` | Three new cards inside existing Settings |
| `frontend/src/admin-ready/CloudinaryUpload.jsx` | Reusable file upload control filling existing URL fields |
| `README_INTEGRATIONS.md` | This setup, architecture, change and validation record |

### Minimal edits to existing files

| File | Change |
| --- | --- |
| `backend/admin-ready/app.js` | Mount new public/admin routes; allow the vault instance to be supplied |
| `backend/admin-ready/server.js` | Load the selected Atlas URI before connecting; pass the same runtime configuration to sessions; sanitize initial connection errors |
| `backend/config/env.js` | Accept optional private-directory and database-recovery environment settings |
| `backend/package.json` | Add `db:atlas` script; dependencies unchanged |
| `backend/.env.example` | Document the two optional environment settings |
| `.gitignore` | Exclude the private integration settings directory |
| `frontend/src/components/Layout.jsx` | Import/render the floating WhatsApp component |
| `frontend/src/admin-ready/Management.jsx` | Append integration settings and add homepage image upload controls |
| `frontend/src/admin-ready/ExistingEditors.jsx` | Add upload controls beside product, gallery, category and article image fields |
| `frontend/src/admin-ready/studio.css` | Append scoped spacing styles for the new controls |

No existing feature was removed. Existing page source files, cart/checkout/order
logic, product models, collection definitions, payment integration, original
README files, dependency versions and package lockfiles are unchanged. Existing
image URLs and store content are preserved. The intended UI additions are the
requested floating button, settings cards and upload controls.

## 9. Validation and limits

Executed successfully in an isolated workspace:

```bash
node --test backend/admin-ready/tests/*.test.js
node admin-tools/build.mjs
```

- **26 tests passed:** 18 existing admin tests plus 8 integration tests.
- Checked encrypted persistence, tamper/wrong-key rejection, stale revisions,
  public/admin secret filtering, role/MFA/CSRF/password gates, preserved blank
  secrets, staged versus selected database behaviour, recovery override, Atlas
  target-admin checks, multipart limits, file types, server-side signing and
  sanitized provider errors.
- Migration tests check refusal of non-empty targets, required confirmations,
  preserved BSON data/indexes/validators, verification and unchanged source data.
- Frontend production build passed using the original Vite configuration.
- Lint passed for the three newly added JSX components.
- Browser smoke checks passed in Chromium 133 using test data: desktop/mobile
  button placement, correct encoded WhatsApp link, no overlap with mobile navigation,
  hidden widget in admin, settings saves with CSRF, cleared secret/password fields,
  mobile admin layout and product upload populating the existing image URL.
- With the new WhatsApp widget disabled, the tested 1440-pixel-wide homepage
  screenshot matched the original build pixel-for-pixel (same fixture data). This
  is a scoped visual regression check, not a claim that every page was screenshot-tested.
- Compared original and updated files to confirm the explicit change list above;
  no original source file was removed and the original `.env` was not edited.

Provider calls and database migration in automated tests use isolated doubles;
these checks do **not** prove connectivity to your real Cloudinary account or
Atlas cluster. No real credentials were used, no real customer records were
modified, and no website was deployed. Use the panel's connection tests and follow
the migration checklist on your machine before production use.

## 10. Official references

- WhatsApp click-to-chat: https://faq.whatsapp.com/5913398998672934
- Cloudinary Upload API: https://cloudinary.com/documentation/image_upload_api_reference
- Cloudinary authentication signatures: https://cloudinary.com/documentation/authentication_signatures
- Cloudinary Admin API / ping: https://cloudinary.com/documentation/admin_api
- Atlas connection prerequisites: https://www.mongodb.com/docs/atlas/connect-to-database-deployment/
- Atlas import with Database Tools: https://www.mongodb.com/docs/atlas/import/mongorestore/

The implementation uses the documented click-to-chat URL, server-side signed
Cloudinary uploads, and the MongoDB driver with Atlas IP access/database-user
requirements. Provider account creation, billing and network permissions remain
managed in the respective provider consoles.
