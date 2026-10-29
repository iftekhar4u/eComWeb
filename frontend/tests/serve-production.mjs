// Dev-only browser harness. Mocks metadata reads; API behaviour is mocked by
// Playwright. Uses the actual production app/CSP and compiled frontend.
import { fileURLToPath } from 'node:url'
import { createReadyApp } from '../../backend/admin-ready/app.js'
import { SiteSettings, Page, BlogPost } from '../../backend/models/domainModels.js'
SiteSettings.findOne = () => ({ select: () => ({ lean: async () => ({ brandName: 'AURELIA' }) }) })
// Content API responses are supplied by each browser fixture. Metadata lookups
// must also be isolated, including direct navigation to dynamic article pages.
Page.findOne = BlogPost.findOne = () => ({ lean: async () => null })
const app = createReadyApp({ config: { NODE_ENV:'production', CLIENT_URL:'http://127.0.0.1:5300', TRUST_PROXY:0, SESSION_SECRET:'browser-fixture-session-secret-32-characters', MFA_ENCRYPTION_KEY:'browser-fixture-encryption-key-32-characters', INTEGRATIONS_DIRECTORY:fileURLToPath(new URL('./.fixture-integrations/',import.meta.url)) }, staticDirectory:fileURLToPath(new URL('../dist-admin/',import.meta.url)) })
app.listen(5300,'127.0.0.1',()=>console.log('Production browser fixture ready on 5300'))
