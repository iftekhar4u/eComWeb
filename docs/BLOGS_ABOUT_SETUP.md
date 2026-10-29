# About page and blog publishing

This update adds an editable About page and exposes blog creation in the existing Admin Studio. It uses the existing `Page` and `BlogPost` models. No new dependency, database migration, setup reset or seed command is required for these features.

## Apply the update

Use **one** of these options.

### Existing Git project: apply the included patch

Copy only `Aurelia-blogs-about.patch` from this archive into your existing `InternProject` root. Stop the running frontend and backend with Ctrl+C, then run from that root:

```bash
git status --short
git apply --check Aurelia-blogs-about.patch
```

If the check succeeds, apply it:

```bash
git apply Aurelia-blogs-about.patch
npm run test:admin
npm --prefix frontend run build
```

If the check fails, do not force it: the target files may have changed since the supplied ZIP or the update may already be applied. Compare the affected files before merging. The patch contains the source changes, tests and this guide; it does not change credentials or dependency lockfiles.

### Use the complete updated source

Extract this ZIP into a separate folder. Its source files already contain the update: **do not apply the patch again**. Dependencies, generated builds and Git history are omitted from the ZIP. Install the existing lockfiles:

```bash
npm run install:all
```

Existing configuration files from the supplied ZIP are preserved. If your current local settings have changed since that ZIP, retain your current settings when merging into the project.

### Start the application

From the project root, start the backend:

```bash
npm --prefix backend run dev
```

Open another terminal in the project root and start the frontend:

```bash
npm --prefix frontend run dev
```

The existing backend should still report its database connection and ready message. Open `http://localhost:5173/admin` and sign in using your existing administrator account. Complete MFA if your current configuration requires it.

## Publish your About page

1. Open **Admin → About page** (`/admin/about`).
2. If an `about` page already exists, its saved title, content, publishing status and SEO fields load into the editor. Otherwise, editable starter text is shown. Opening this editor does not write a record.
3. Edit **Name / title** and **Content**. Separate paragraphs with a blank line. Review the starter copy and replace it with your own store story.
4. The page address stays `about` so navigation continues to work.
5. Use **Preview content** to check your text. SEO and sharing fields are optional.
6. Select **published** under **Publishing status**, then click **Save changes**.
7. Open **View About page** or `http://localhost:5173/pages/about`.

The page appears in desktop navigation, the mobile menu and the footer. `/about` redirects to `/pages/about`; the existing page SEO and sitemap handling use `/pages/about`.

The page uses the storefront's existing colors and typography, with a brand monogram and links to Shop and Contact. Its title, story text, publishing status and SEO fields are editable; the decorative layout and CTA labels are part of the frontend code.

Save as **draft** or **archived** to hide the content from visitors. Until a page is published, the public URL shows that the page is unavailable. Updates are stored through the existing admin API in the `pages` collection. Refresh an already-open visitor tab to see newly saved content.

## Create a new blog

1. Open **Admin → Blogs** (`/admin/blogs`) and click **New blog**.
2. Enter the title and click **Generate page address from name**, or enter a unique lowercase slug such as `summer-care-guide`.
3. Add the optional **Short introduction** and article image. You can enter an HTTPS image URL or use the existing **Upload image to Cloudinary** control after configuring Cloudinary in Admin Settings. Uploads accept JPEG, PNG, WebP or GIF up to 5 MB.
4. Write **Content** and preview it. Content is plain text with paragraph breaks; HTML is displayed as text, not executed. An image is optional.
5. Choose **draft** to save privately, or **published** to show the article immediately. Click **Save changes**.
6. Open `/blog` or `/blog/your-slug` to check the published article.

The Blogs screen supports title search, status filters, pagination, editing, archiving and restoring. **Archive** hides an article without deleting its stored record. To restore it, choose **Edit / restore**, select **published** and save. The public journal displays 12 published articles per page. Drafts and archived posts are not returned by the public content endpoints.

Saved articles use the `blog_posts` collection. The editor sends the last saved timestamp on updates; if another editor changed the record, it asks you to reload instead of silently overwriting that version. Keep published slugs stable because changing a blog slug changes its public URL.

## Verify with your database

1. Save a draft blog and confirm it is absent from `/blog`.
2. Publish it, open the article, refresh, and confirm its content remains available.
3. Publish the About page, reopen `/admin/about`, and confirm your saved content loads.
4. In your existing MongoDB database, check `pages` for `{ "slug": "about" }` and `blog_posts` for your article slug. Confirm their `status`, `content` and `updatedAt` values.
5. Change a record back to draft and confirm the public URL no longer exposes its content.

Local automated checks use isolated data and browser API fixtures. They do not connect to your Atlas database or verify a real Cloudinary upload. Your configured database must be reachable for real saves.

## Changed files

`A` means added and `M` means modified, relative to the latest supplied ZIP. No existing source file is deleted.

```text
A backend/admin-ready/tests/content-management.test.js
A frontend/src/admin-ready/ContentManagement.jsx
A frontend/src/pages/About.jsx
A frontend/src/content.css
A frontend/tests/e2e/content.spec.js
A docs/BLOGS_ABOUT_SETUP.md

M backend/routes/adminRoutes.js
M backend/routes/contentRoutes.js
M backend/seo/routes.js
M frontend/src/App.jsx
M frontend/src/components/Layout.jsx
M frontend/src/admin-ready/ReadyAdmin.jsx
M frontend/src/admin-ready/ExistingEditors.jsx
M frontend/src/pages/BlogPages.jsx
M frontend/tests/serve-production.mjs
M shared/seo.mjs
```

`Aurelia-blogs-about.patch` is also included as a delivery file. It is not included inside its own patch.

The earlier request-IP fix, Nodemailer update, payment implementation and unrelated source files are retained. Package manifests, lockfiles and existing configuration files are unchanged.

## Automated checks

Validation completed for this update: **78/78 backend tests passed**, **4/4 content browser tests passed**, lint completed with no errors, and the production frontend build succeeded. About layout checks cover 1280, 1024, 768 and 390 pixel widths. Existing lint warnings and the large-bundle build warning remain.

Run from the project root:

```bash
node --test backend/admin-ready/tests/*.test.js backend/email/tests/*.test.js backend/seo/tests/*.test.js
npm --prefix frontend run lint
npm --prefix frontend run build
```

For the four content browser tests, use a separate terminal:

```bash
cd frontend
npx playwright install chromium
npm run test:browser -- content.spec.js
```

The browser tests use the production app and a local fixture server on port 5300, with mocked API responses. The backend tests exercise the real Express handlers and Mongoose validation with isolated collection adapters, including login/role/MFA/CSRF enforcement, duplicate slugs, publication visibility and stale-editor conflicts.
