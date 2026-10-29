import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { root } from './run.mjs'
import { fixtureResponse, about } from '../frontend/tests/storefront-fixture.mjs'
// Separate lab harness, never enabled on the production server.
const project = process.env.BENCHMARK_PROJECT_ROOT || root
const require = createRequire(path.join(project, 'backend/package.json')), express = require('express')
const { createReadyApp } = await import(pathToFileURL(path.join(project, 'backend/admin-ready/app.js')))
const { SiteSettings, Page } = await import(pathToFileURL(path.join(project, 'backend/models/domainModels.js')))
SiteSettings.findOne = () => ({ select: () => ({ lean: async () => ({ brandName: 'AURELIA' }) }) })
Page.findOne = () => ({ lean: async () => about })
const app = express()
app.get('/fixture/hero.png', (_req, res) => res.sendFile(path.join(project, 'frontend/src/assets/hero.png')))
app.use('/api', (req, res) => {
  const url = new URL(req.originalUrl, 'http://localhost:5301'), { status = 200, data } = fixtureResponse(url.pathname, url.searchParams)
  res.status(status).set('Cache-Control', 'no-store').json(data)
})
app.use(createReadyApp({ config: { NODE_ENV: 'production', CLIENT_URL: 'http://127.0.0.1:5301', TRUST_PROXY: 0, SESSION_SECRET: 'isolated-benchmark-fixture-session-secret' }, staticDirectory: path.join(project, 'frontend/dist-admin') }))
app.listen(5301, '127.0.0.1', () => console.log('Isolated benchmark fixture ready on 5301'))
