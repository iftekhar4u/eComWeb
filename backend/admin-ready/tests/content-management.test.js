import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import User from '../../models/User.js'
import { BlogPost, Page, AuditLog } from '../../models/domainModels.js'
import adminRoutes from '../../routes/adminRoutes.js'
import contentRoutes from '../../routes/contentRoutes.js'
import { crawlRoutes } from '../../seo/routes.js'
import { requireCsrf } from '../../middleware/csrfMiddleware.js'
import { errorHandler } from '../../middleware/errorMiddleware.js'
import { buildMetadata } from '../../../shared/seo.mjs'

// Real Express handlers and Mongoose validation, with isolated collection
// adapters. These tests never connect to Atlas or use environment credentials.
const rows = new Map([[BlogPost, []], [Page, []], [AuditLog, []]])
const restores = []
const clone = value => value instanceof Date ? new Date(value) : value instanceof mongoose.Types.ObjectId ? new mongoose.Types.ObjectId(String(value)) : Array.isArray(value) ? value.map(clone) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) : value
const equal = (a, b) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : String(a) === String(b)
function matches(row, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$regex' in value) return new RegExp(value.$regex, value.$options).test(row[key])
    return equal(row[key], value)
  })
}
function project(row, projection = {}) {
  if (!row) return null
  const included = Object.entries(projection).filter(([, value]) => value).map(([key]) => key)
  const result = included.length ? Object.fromEntries(['_id', ...included].filter(key => row[key] !== undefined).map(key => [key, clone(row[key])])) : clone(row)
  for (const [key, value] of Object.entries(projection)) if (!value) delete result[key]
  return result
}
function patch(target, key, value) { const original = target[key]; restores.push(() => { target[key] = original }); target[key] = value }
for (const [Model, records] of rows) {
  function unique(record, previous) {
    if (record.slug && records.some(row => row !== previous && row.slug === record.slug)) throw Object.assign(new Error('duplicate fixture slug'), { code: 11000 })
  }
  function update(filter, change) {
    const row = records.find(value => matches(value, filter))
    if (!row) return null
    const next = { ...row, ...clone(change.$set) }
    for (const [key, value] of Object.entries(change.$inc || {})) next[key] = (next[key] || 0) + value
    unique(next, row); Object.assign(row, next)
    return clone(row)
  }
  patch(Model.collection, 'insertOne', async record => { unique(record); records.push(clone(record)); return { acknowledged: true, insertedId: record._id } })
  patch(Model.collection, 'findOne', async (filter, options = {}) => project(records.find(row => matches(row, filter)), options.projection))
  patch(Model.collection, 'find', (filter = {}, options = {}) => ({ toArray: async () => {
    const selected = records.filter(row => matches(row, filter)).sort((a, b) => {
      for (const [key, direction] of Object.entries(options.sort || {})) {
        if (a[key] > b[key]) return direction
        if (a[key] < b[key]) return -direction
      }
      return 0
    })
    return selected.slice(options.skip || 0, options.limit ? (options.skip || 0) + options.limit : undefined).map(row => project(row, options.projection))
  } }))
  patch(Model.collection, 'countDocuments', async filter => records.filter(row => matches(row, filter)).length)
  patch(Model.collection, 'findOneAndUpdate', async (filter, change) => update(filter, change))
  patch(Model.collection, 'updateOne', async (filter, change) => ({ acknowledged: true, modifiedCount: update(filter, change) ? 1 : 0 }))
}
const adminId = new mongoose.Types.ObjectId()
patch(User, 'findById', async id => ({ _id: adminId, role: id === 'customer' ? 'customer' : 'admin', status: 'active', sessionVersion: 0 }))
const app = express()
app.locals.config = { NODE_ENV: 'test' }
app.use(express.json())
app.use((req, _res, next) => {
  req.session = { ...(req.get('x-auth') !== 'none' && { userId: req.get('x-auth') === 'customer' ? 'customer' : String(adminId) }), sessionVersion: 0, csrfToken: 'content-test-token', mfaVerified: req.get('x-mfa') !== 'pending' }
  next()
})
app.use('/api/admin', requireCsrf, adminRoutes)
app.use('/api/content', contentRoutes)
app.use(crawlRoutes)
app.use(errorHandler)
const server = app.listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
const api = request(server)
const input = { title: 'A simple care routine', slug: 'a-simple-care-routine', content: 'First paragraph.\n\nSecond paragraph.', excerpt: 'Everyday care.', image: '', status: 'draft', seo: {} }
const createBlog = payload => api.post('/api/admin/blogs').set('x-csrf-token', 'content-test-token').send({ ...input, ...payload })
test.beforeEach(() => { for (const records of rows.values()) records.length = 0 })
test.after(async () => { await new Promise(resolve => server.close(resolve)); for (const restore of restores.reverse()) restore() })

test('blog and About administration require login, administrator role, MFA and CSRF', async () => {
  for (const path of ['/api/admin/blogs', '/api/admin/pages/by-slug/about']) {
    assert.equal((await api.get(path).set('x-auth', 'none')).status, 401)
    assert.equal((await api.get(path).set('x-auth', 'customer')).status, 403)
    assert.equal((await api.get(path).set('x-mfa', 'pending')).status, 403)
  }
  assert.equal((await api.post('/api/admin/blogs').send(input)).status, 403)
  assert.equal((await api.post('/api/admin/pages').send({ title: 'About', slug: 'about', content: 'Story', status: 'published' })).status, 403)
  assert.equal(rows.get(BlogPost).length, 0)
  assert.equal(rows.get(Page).length, 0)
})

test('a new blog persists as a hidden draft, publishes, edits and archives', async () => {
  const created = await createBlog()
  assert.equal(created.status, 200, JSON.stringify(created.body))
  assert.equal(rows.get(BlogPost).length, 1)
  assert.equal(created.body.item.status, 'draft')
  assert.equal((await api.get(`/api/content/blogs/${input.slug}`)).status, 404)
  const id = created.body.item._id
  const published = await api.put(`/api/admin/blogs/${id}`).set('x-csrf-token', 'content-test-token').send({ ...input, status: 'published', updatedAt: created.body.item.updatedAt })
  assert.equal(published.status, 200, JSON.stringify(published.body))
  const firstPublishedAt = published.body.item.publishedAt
  assert.ok(firstPublishedAt)
  const publicPost = await api.get(`/api/content/blogs/${input.slug}`)
  assert.equal(publicPost.status, 200)
  assert.equal(publicPost.body.content, input.content)
  assert.equal(publicPost.body.author, undefined)
  const edited = await api.put(`/api/admin/blogs/${id}`).set('x-csrf-token', 'content-test-token').send({ ...input, content: 'Updated story', status: 'published', updatedAt: published.body.item.updatedAt })
  assert.equal(edited.status, 200, JSON.stringify(edited.body))
  assert.equal(edited.body.item.publishedAt, firstPublishedAt)
  assert.equal((await api.delete(`/api/admin/blogs/${id}`).set('x-csrf-token', 'content-test-token')).status, 200)
  assert.equal((await api.get(`/api/content/blogs/${input.slug}`)).status, 404)
  assert.equal(rows.get(BlogPost).length, 1, 'archive retains the stored article')
})

test('duplicate slugs, unsafe images and malformed content fail without extra records', async () => {
  assert.equal((await createBlog()).status, 200)
  assert.equal((await createBlog()).status, 409)
  for (const change of [{ slug: 'Invalid slug!' }, { image: 'javascript:alert(1)' }, { content: '' }, { unexpected: true }]) {
    assert.equal((await createBlog({ ...change })).status, 400)
  }
  assert.equal(rows.get(BlogPost).length, 1)
})

test('stale editors cannot overwrite a blog or its SEO metadata', async () => {
  const created = await createBlog()
  const response = await api.put(`/api/admin/blogs/${created.body.item._id}`).set('x-csrf-token', 'content-test-token').send({ ...input, content: 'Overwrite attempt', updatedAt: '2000-01-01T00:00:00.000Z' })
  assert.equal(response.status, 409)
  assert.equal(rows.get(BlogPost)[0].content, input.content)
})

test('admin blog search treats regex characters literally and filters status', async () => {
  await createBlog({ title: 'A+B guide', slug: 'a-plus-b', status: 'published' })
  await createBlog({ title: 'AAB guide', slug: 'aab', status: 'published' })
  await createBlog({ title: 'A+B draft', slug: 'a-plus-b-draft' })
  const result = await api.get('/api/admin/blogs').query({ search: 'A+B', status: 'published' })
  assert.equal(result.status, 200)
  assert.equal(result.body.total, 1)
  assert.equal(result.body.items[0].slug, 'a-plus-b')
})

test('public journal pagination includes only published articles', async () => {
  for (let i = 0; i < 13; i += 1) await createBlog({ slug: `article-${i}`, status: 'published' })
  await createBlog({ slug: 'private-draft' })
  await createBlog({ slug: 'archived-article', status: 'archived' })
  const first = await api.get('/api/content/blogs?page=1')
  const second = await api.get('/api/content/blogs?page=2')
  assert.equal(first.body.total, 13)
  assert.equal(first.body.pages, 2)
  assert.equal(first.body.items.length, 12)
  assert.equal(second.body.items.length, 1)
  assert.equal(new Set([...first.body.items, ...second.body.items].map(row => row._id)).size, 13)
  assert.equal((await api.get('/api/content/blogs?page=-1')).status, 400)
  const metadata = buildMetadata({ path: '/blog', search: '?page=2', origin: 'https://shop.example' })
  assert.equal(metadata.canonical, 'https://shop.example/blog?page=2')
})

test('About content uses the existing pages collection and obeys publishing visibility', async () => {
  const empty = await api.get('/api/admin/pages/by-slug/about')
  assert.equal(empty.status, 200)
  assert.equal(empty.body.item, null)
  assert.equal(rows.get(Page).length, 0, 'opening the editor does not write or seed data')
  const body = { title: 'About our store', slug: 'about', content: 'Our story.\n\nContact us for help.', status: 'published', seo: { title: 'Our story | AURELIA' } }
  const saved = await api.post('/api/admin/pages').set('x-csrf-token', 'content-test-token').send(body)
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.equal(rows.get(Page).length, 1)
  const publicPage = await api.get('/api/content/pages/about')
  assert.equal(publicPage.status, 200)
  assert.equal(publicPage.body.content, body.content)
  const adminPage = await api.get('/api/admin/pages/by-slug/about')
  assert.equal(adminPage.body.item._id, saved.body.item._id)
  assert.equal((await api.post('/api/admin/pages').set('x-csrf-token', 'content-test-token').send(body)).status, 409)
  const hidden = await api.put(`/api/admin/pages/${saved.body.item._id}`).set('x-csrf-token', 'content-test-token').send({ ...body, status: 'draft', updatedAt: saved.body.item.updatedAt })
  assert.equal(hidden.status, 200)
  assert.equal((await api.get('/api/content/pages/about')).status, 404)
  const redirect = await api.get('/about')
  assert.equal(redirect.status, 301)
  assert.equal(redirect.headers.location, '/pages/about')
})
