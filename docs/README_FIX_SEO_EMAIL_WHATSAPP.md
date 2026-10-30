# AURELIA: SEO, Email and WhatsApp diagnosis and repair

Reviewed against the latest uploaded `InternProject(4).zip` on 17 October 2026.
This patch is for that project version. It restores the existing features alongside
the WhatsApp, cloudinary and Atlas additions.

## What caused the errors

### SEO and Email returned 404

The SEO and Email modules and their admin screens exist in this ZIP, but several
shared files came from an earlier version. The running Express app did not mount
their routes. The shared frontend loader displays “This admin API is unavailable”
for any HTTP 404; its suggested start command cannot restore missing route mounts.

The incomplete merge also removed:

- Email service injection, event binding and the background delivery worker.
- Startup provisioning for the existing SEO validators and email collections.
- Email/SMTP environment fields, including the dedicated email encryption key.
- Nodemailer from `backend/package.json`, although the supplied lockfile already
  contains Nodemailer 10.0.15 and its dependency declaration.
- Production HTML metadata rendering and the dynamic sitemap/robots routes.
- The existing SEO fields from the shared product/category/content editor.

Contact and newsletter requests also failed when they tried to access the absent
email service. Before the repair, 11 of the 28 targeted existing tests failed.

### WhatsApp number needs its country code

The uploaded saved settings enable the WhatsApp button, and the encrypted settings
can be read with the existing key. The saved phone contains only 10 digits.
For an Indian mobile, save `91` followed by the full 10-digit mobile number.

Example format only: `919876543210`. Replace this with your own WhatsApp number.
Do not add a leading domestic `0`. The admin form accepts and removes spaces,
parentheses, hyphens and `+` before saving.

The current validation checks digit format and length. It cannot establish that
a country code is correct or that the number has a WhatsApp account. A local
10-digit number can therefore pass that check and produce the wrong chat link.
No telephone number or credential from your upload is included in this patch.

Use **Admin > Settings > WhatsApp enquiries**:

1. Keep “Show the WhatsApp button” checked.
2. Enter your country code and full mobile number.
3. Click “Save WhatsApp settings”.
4. Open or refresh the public homepage/shop and try the button yourself.

The button is intentionally outside the admin/login screens. It opens a
`wa.me` click-to-chat link with an encoded message; the visitor chooses whether
to send it. This feature does not require a WhatsApp API key. It is not a bot or
WhatsApp Cloud API integration. Its appearance and placement are unchanged.

## Apply this patch

1. Stop the running backend and frontend terminals with Ctrl+C.
2. Keep a backup of your current source.
3. Extract the patch ZIP. Merge the contents of its `InternProject` folder into
   your existing `InternProject` folder, replacing only the six listed files.
   Do not replace your whole project with this small patch.
4. Keep your existing `backend/.env` and private integration settings directory.
   Do not change `SESSION_SECRET`, `MFA_ENCRYPTION_KEY` or an existing
   `EMAIL_ENCRYPTION_KEY`. Do not replace `.env` with `.env.example`.
5. From the project root (the folder containing `backend`, `frontend` and
   `admin-tools`), run:

   ```bash
   npm install --prefix backend
   npm run dev
   ```

6. Open `/admin/seo` and `/admin/email`, then correct the WhatsApp number as above.

No source file needs to be deleted. No setup, seed, database reset or Atlas
migration is needed for this repair. Your existing backend lockfile is already
consistent with the restored Nodemailer declaration and does not need replacing.
The patch does not contain dependencies, build output, `.env`, Git history or
the encrypted integration vault.

The existing startup helpers add the missing optional SEO validator properties
and provision email collections/indexes. They preserve business records. The
database account needs the privileges described in `docs/SEO_SETUP.md` and
`docs/EMAIL_SETUP.md`; these guides remain applicable.

For production, rebuild after merging with `npm run build`, then use your existing
production launch process. Email delivery still depends on your saved SMTP
configuration. The restored worker processes queued jobs when delivery is enabled.

## Exact file changes

| Action | File | Purpose |
| --- | --- | --- |
| Update | `backend/admin-ready/app.js` | Mount existing SEO/Email APIs, attach the email service, restore crawler routes and production metadata, and retain all integration routes. |
| Update | `backend/admin-ready/server.js` | Restore additive SEO/email provisioning, bind email events, start and stop the worker, and preserve Atlas configuration selection. |
| Update | `backend/config/env.js` | Preserve email/SMTP defaults and the dedicated email encryption key during configuration parsing. |
| Update | `backend/package.json` | Restore the exact Nodemailer 10.0.15 dependency already in the supplied lockfile. |
| Update | `backend/.env.example` | Document optional email defaults without changing the real environment. |
| Update | `frontend/src/admin-ready/ExistingEditors.jsx` | Restore the existing SEO fields and include them in saves while retaining cloudinary upload controls. |
| Add | `backend/admin-ready/tests/module-wiring.test.js` | Check SEO, Email and WhatsApp through the actual assembled Express app, plus email configuration parsing. |
| Add | `README_FIX_SEO_EMAIL_WHATSAPP.md` | Explain the diagnosis, repair, file list, setup and verification. |

All other source files and all existing CSS files remain unchanged. The storefront,
admin navigation, SEO/Email screens, WhatsApp icon, cloudinary controls and Atlas
settings retain their existing designs. The shared editor regains its pre-existing
SEO section; this is a restoration of the earlier feature.

## Verification and limits

- All 58 existing email, SEO and admin/integration tests pass after the repair.
- Three added tests pass against the assembled app, covering authenticated
  SEO/Email settings, public metadata/email status, crawler routes, WhatsApp
  save/read with CSRF and country-code normalization, and email configuration.
- The Vite production build passes. It reports the existing kind of advisory
  about a JavaScript chunk over 500 kB; this does not block the build.
- The edited JSX has no lint errors. Its existing state-in-effect warning remains
  in the unrelated store settings form.
- Browser checks with controlled local API fixtures pass for SEO/Email loading
  and saving, product saves with SEO and cloudinary controls, encoded WhatsApp
  links, mobile placement, hiding the disabled button and absence of JavaScript
  errors. These checks do not send WhatsApp messages or external emails.

Run the checks from the project root:

```bash
node --test backend/email/tests/*.test.js backend/seo/tests/*.test.js backend/admin-ready/tests/*.test.js
npm run build
```

Backend tests use isolated collection fixtures. They do not connect to your actual
MongoDB/Atlas database. The email suite includes a local SMTP sink and does not
send to external recipients. Your production database privileges, real SMTP
delivery and the destination WhatsApp account still need checking in your own
running project. This repair does not alter your saved phone number remotely.
