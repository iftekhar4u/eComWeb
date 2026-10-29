# Email update file list

Compared with the completed SEO ZIP (`seo-base` checkpoint). The combined ZIP contains all original source files plus these additions. No source file was deleted. `EMAIL_SETUP.md` covers installation and verification.

## Added

- `backend/email/adminRoutes.js`
- `backend/email/crypto.js`
- `backend/email/database.js`
- `backend/email/events.js`
- `backend/email/models.js`
- `backend/email/publicRoutes.js`
- `backend/email/service.js`
- `backend/email/settings.js`
- `backend/email/templates.js`
- `backend/email/tests/fixture.js`
- `backend/email/tests/flows.test.js`
- `backend/email/tests/safety.test.js`
- `docs/EMAIL_SETUP.md`
- `frontend/src/admin-ready/EmailAdmin.jsx`
- `frontend/src/email/EmailActions.jsx`
- `shared/email.mjs`
- `docs/EMAIL_CHANGES.md` (this list)

## Updated for email integration

- `README.md`
- `backend/.env.example`
- `backend/admin-ready/app.js`
- `backend/admin-ready/security.js`
- `backend/admin-ready/server.js`
- `backend/config/env.js`
- `backend/config/passport.js`
- `backend/db/collectionDefinitions.js`
- `backend/middleware/authMiddleware.js`
- `backend/models/domainModels.js`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/routes/adminRoutes.js`
- `backend/routes/authRoutes.js`
- `backend/routes/contentRoutes.js`
- `backend/services/commerce.js`
- `frontend/src/admin-ready/ReadyAdmin.jsx`
- `frontend/src/pages/AuthPages.jsx`
- `frontend/src/pages/ContentPages.jsx`
- `frontend/src/pages/ForgotPassword.jsx`
- `frontend/src/pages/Profile.jsx`
- `package.json`

## Scope

The new backend module owns private SMTP settings, encryption, templates, persisted delivery jobs, account actions and newsletter campaigns. Existing routes contain the email hooks; order/contact jobs share their existing business transaction. The profile password writer now uses an atomic field update to avoid the existing immutable-role document-save failure. The new admin section, account notice and action forms reuse existing styles.

All dedicated SEO files, the completed SEO guide, all existing CSS and frontend dependency files are byte-for-byte unchanged. The backend manifest/lockfile add only Nodemailer; existing locked dependency records are retained. Product, cart, checkout, pricing, stock and refund eligibility rules are preserved.

Existing real `.env`, dependency directories, build output and Git history are excluded. Merge the source into the matching folders and retain your existing private environment/database.
