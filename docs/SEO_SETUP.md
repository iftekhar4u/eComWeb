# AURELIA: admin-managed SEO

## Use it locally

1. Keep a backup of your current project. Copy the updated source files into the matching folders of your project.
2. Keep your existing `backend/.env`, database, `.git` and local credentials. They are not included in this delivery. Do not run setup/seed/reset commands to apply this SEO update.
3. No new npm dependency was added. If you already have dependencies installed, use the existing installation. For a fresh extraction, run `npm run install:all` from the project root.
4. Restart the project with `npm run dev`.
5. Open `/admin/seo`, or open Products → Edit → **SEO & sharing**. The same optional fields are included in category, collection, page and blog editors.

Existing pages continue to get automatic metadata when SEO fields are empty. You do not need to edit every existing product to make its SEO tags work.

## What the administrator can edit

| Setting | Result |
| --- | --- |
| SEO title | The page's `<title>` |
| Meta description | Description supplied to search engines |
| Canonical URL | Preferred page URL; defaults to this page's public URL |
| Main image alt text | Product, category-card or blog-image alt text, where that image exists |
| Gallery image alt text | Product main-gallery image alt text by image position |
| Exclude from search results | `noindex` and exclusion from the sitemap |
| Social title, description, image and alt | Open Graph sharing metadata |
| Twitter/X title, description and image | Twitter card overrides, falling back to social fields |

The existing product **Save changes** button saves the product details and its SEO fields together. The separate `/admin/seo` screen can update only SEO fields, including for products with multiple variants; it does not update price, stock, orders or product descriptions.

The new admin screen has Website pages, Products, Categories, Collections, Content pages, Blog articles and Site defaults. Existing admin classes are reused; no stylesheet was changed.

Website pages include the homepage, shop, contact, blog index and collections index. Login, signup, password reset, account, wishlist, cart, checkout, orders and admin pages also have editable generic titles/descriptions, but their `noindex` protection cannot be switched off. Their metadata never includes customer or order details.

## Set the public domain before deployment

In **Admin → SEO → Site defaults**, enter your actual domain, for example `https://your-domain.com`. This is the public React storefront domain, not the API domain. You can also set a default sharing image and fallback description.

Leaving the domain blank uses the existing backend `CLIENT_URL`. Keep `CLIENT_URL` correct for your deployment's existing CORS/authentication configuration as well. Localhost defaults are for development; do not submit localhost URLs to Google.

## Production delivery

From the project root:

```bash
npm run build
node admin-tools/production.mjs
```

These are the project's existing build/production commands. They build and serve `frontend/dist-admin` through Express. Production credentials and database settings must already be configured in `backend/.env` or the hosting environment.

Express inserts metadata into the original HTML `<head>` on the first response. React updates those same tags during client-side navigation. Social crawlers therefore receive the sharing tags without running JavaScript.

This is server-rendered **metadata**, not a conversion of the whole React application to SSR. Product page content still uses the existing React/API flow; Google must render JavaScript to read that body content. No framework migration or storefront redesign was introduced.

If frontend and backend are hosted separately, configure the public domain so HTML page requests are served through this Express application, and route `/sitemap.xml`, `/sitemaps/*` and `/robots.txt` to it. Simply uploading the static `dist-admin` folder does not run server metadata or dynamic sitemap generation. Existing static XML/text files are only neutral fallbacks; they contain no hardcoded localhost product URLs.

In Vite development, `/api`, `/sitemap.xml`, `/sitemaps` and `/robots.txt` are proxied to the backend. React applies metadata after the API response in development.

## Sitemap and structured data

- `/sitemap.xml` is a sitemap index.
- `/sitemaps/fixed.xml` lists indexable fixed public pages.
- Resource sitemaps, such as `/sitemaps/products-1.xml`, contain up to 1,000 records each and are generated from current database data.
- Draft, archived, hidden-category and `noindex` records are excluded. Records pointing at a different canonical URL are excluded from their original URL's sitemap entry.
- URLs use the public domain. Dates come from stored updates, not the time Google requests the sitemap.
- Product JSON-LD uses existing variant price in rupees, INR currency and actual available stock. Review totals are emitted only when existing rating/count values are positive; no reviews are invented.
- Basic WebSite, BlogPosting and breadcrumb data are automatic. No raw script/HTML field is exposed to admins.
- Search/filter results are `noindex`. Paginated shop/category pages keep their own `?page=2` canonical URL.
- Missing dynamic records return HTTP 404 and `noindex` when served through Express.

After deployment, submit the public `/sitemap.xml` URL to Google Search Console and inspect a product URL. A sitemap, metadata or structured data does not guarantee indexing, ranking or a rich result.

## Database compatibility

The optional SEO fields extend the existing product/category/collection/page/blog documents and site settings. No new database or collection is introduced.

At backend startup, `ensureSeoDatabase()` adds the optional SEO properties to those six collections' existing strict MongoDB validators. It preserves the other validation rules, required fields, validation level/action and indexes. It does not rewrite any record, seed sample products, delete data or reset the database. It is safe to rerun.

The database user needs MongoDB's `collMod` privilege for this one-time schema extension. If startup reports a `collMod` authorization error, have your database administrator apply this additive schema update with an authorized account. Do not drop collections or disable validation.

SEO APIs reuse the project's existing admin authorization, MFA behavior and CSRF protection. Inputs are validated, HTML/XML is escaped, and public endpoints return only metadata. Concurrent saves in the standalone SEO screen reject stale versions instead of silently overwriting newer changes.

## Verification

```bash
node --test backend/seo/tests/*.test.js backend/admin-ready/tests/*.test.js
npm run build
```

The 34 automated checks passed, including the existing admin/security tests, new SEO input/model tests, HTTP save/read tests, metadata escaping, sitemap filtering, missing-page status and additive-validator tests. HTTP persistence tests use controlled model fixtures, not a live MongoDB database.

Browser checks also passed with controlled API/model fixtures: product-editor SEO save/reload, unchanged product name/price, fixed-page SEO save/reload, standalone product SEO updates, image alt text, noindex persistence and metadata cleanup during page navigation. Each rendered page has a single description/canonical/social-title tag. The new SEO editor fits a 390px mobile viewport, and no browser JavaScript errors were observed in these flows. Original and updated product-page screenshots were pixel-for-pixel identical at desktop and mobile widths before entering custom SEO values.

Production build passed. Existing CSS files and npm package/lock files are byte-for-byte unchanged. The original source files are all retained. Authentication, payment, cart, order, inventory and other business logic were not edited for this addition.

A real MongoDB process could not start in the verification environment (`Operation not permitted`), so live MongoDB writes still need to be checked in your existing local database: save one product's SEO, reload it, and verify its public metadata and sitemap entry. No connection was made to your private database and no `.env` credentials were used.

## Main code additions

| Location | Purpose |
| --- | --- |
| `shared/seo.mjs` | Shared page defaults, metadata/schema generation and escaping |
| `backend/seo/schema.js` | Mongoose, request and MongoDB SEO field definitions |
| `backend/seo/database.js` | Additive extension of existing strict validators |
| `backend/seo/service.js` | Public page resolution and dynamic sitemaps |
| `backend/seo/routes.js` | Protected admin SEO APIs, public metadata and HTML-head rendering |
| `frontend/src/components/SiteSeo.jsx` | Metadata updates and cleanup during React navigation |
| `frontend/src/admin-ready/SeoFields.jsx` | Reusable fields in existing admin forms |
| `frontend/src/admin-ready/SeoAdmin.jsx` | Per-page/per-record SEO management screen |
| `backend/seo/tests/` | SEO and schema-migration tests |

Small integration edits connect these additions to the existing app, editors, schemas and public API projections. Existing hardcoded Helmet blocks were replaced by the shared metadata component to avoid competing tags; visible page markup was preserved except for the requested image-alt wiring.

References: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).
