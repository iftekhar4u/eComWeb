import { test, expect } from '@playwright/test'

async function fixture(page, { admin = true } = {}) {
  let revision = 0
  const state = { blogs: [], about: null, writes: [] }
  const stamp = () => new Date(Date.UTC(2026, 9, 24, 10, 0, ++revision)).toISOString()
  await page.route('https://images.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#ead9d3"/></svg>' }))
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    let data = {}, status = 200
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? request.postDataJSON() : null
    if (path === '/api/auth/session') {
      if (admin) data = { user: { id: '111111111111111111111111', name: 'Content Admin', email: 'admin@example.test', role: 'admin', mfaEnabled: true }, mfaRequired: false }
      else { status = 401; data = { message: 'Authentication required' } }
    } else if (path === '/api/auth/csrf-token') data = { csrfToken: 'fixture-token' }
    else if (path === '/api/auth/google/status') data = { enabled: false }
    else if (path === '/api/cart' || path === '/api/wishlist') data = { items: [], version: 0 }
    else if (path === '/api/integrations/whatsapp') data = { enabled: false }
    else if (path === '/api/content/storefront') data = { categories: [{ name: 'Skincare', slug: 'skincare' }, { name: 'Haircare', slug: 'haircare' }, { name: 'Body care', slug: 'body-care' }], settings: { brandName: 'AURELIA' }, sections: [], collections: [], blogs: state.blogs.filter(item => item.status === 'published') }
    else if (path.startsWith('/api/seo/')) data = { title: 'AURELIA', description: 'Store journal', robots: 'noindex, follow', canonical: url.origin, structuredData: [] }
    else if (path === '/api/admin/blogs' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase(), statusFilter = url.searchParams.get('status')
      const items = state.blogs.filter(item => (!statusFilter || item.status === statusFilter) && item.title.toLowerCase().includes(search))
      data = { items, total: items.length, page: 1, pages: Math.ceil(items.length / 20) }
    } else if (path === '/api/admin/blogs' && method === 'POST') {
      state.writes.push(body)
      const item = { ...body, _id: String(state.blogs.length + 1).padStart(24, '0'), updatedAt: stamp() }
      state.blogs.push(item); data = { item }
    } else if (path.startsWith('/api/admin/blogs/') && method === 'PUT') {
      state.writes.push(body)
      const index = state.blogs.findIndex(item => item._id === path.split('/').at(-1))
      state.blogs[index] = { ...state.blogs[index], ...body, updatedAt: stamp() }; data = { item: state.blogs[index] }
    } else if (path.startsWith('/api/admin/blogs/') && method === 'DELETE') {
      state.blogs.find(item => item._id === path.split('/').at(-1)).status = 'archived'; data = { message: 'Entry archived' }
    } else if (path === '/api/admin/pages/by-slug/about') data = { item: state.about }
    else if ((path === '/api/admin/pages' && method === 'POST') || (path.startsWith('/api/admin/pages/') && method === 'PUT')) {
      state.writes.push(body)
      state.about = { ...body, _id: '222222222222222222222222', updatedAt: stamp() }; data = { item: state.about }
    } else if (path === '/api/content/pages/about') {
      if (state.about?.status === 'published') data = state.about
      else { status = 404; data = { message: 'Page not found' } }
    } else if (path === '/api/content/blogs') {
      const all = state.blogs.filter(item => item.status === 'published'), pageNumber = Number(url.searchParams.get('page') || 1)
      data = { items: all.slice((pageNumber - 1) * 12, pageNumber * 12), total: all.length, page: pageNumber, pages: Math.ceil(all.length / 12) }
    } else if (path.startsWith('/api/content/blogs/')) {
      const item = state.blogs.find(item => item.slug === path.split('/').at(-1) && item.status === 'published')
      if (item) data = item
      else { status = 404; data = { message: 'Article not found' } }
    } else if (path === '/api/health') return route.continue()
    else { status = 404; data = { message: 'Unexpected fixture endpoint' } }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  })
  return state
}

test('admin creates a draft, previews safe content, publishes, edits and archives a blog', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/admin/blogs')
  await page.getByRole('button', { name: 'New blog', exact: true }).click()
  await page.getByLabel('Name / title', { exact: true }).fill('My first beauty guide')
  await page.getByRole('button', { name: 'Generate page address from name' }).click()
  await expect(page.getByLabel('Page address (slug)')).toHaveValue('my-first-beauty-guide')
  await page.getByLabel('Short introduction').fill('A simple guide to your routine.')
  await page.getByLabel('Article image HTTPS URL').fill('https://images.example.test/guide.svg')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('First paragraph.\n\n<script>window.contentInjected=true</script>')
  await page.getByRole('button', { name: 'Preview content' }).click()
  await expect(page.getByRole('article', { name: 'Content preview' })).toContainText('<script>window.contentInjected=true</script>')
  expect(await page.evaluate(() => window.contentInjected)).toBeUndefined()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Blog saved as a draft' })).toBeVisible()
  expect(state.blogs).toHaveLength(1)
  await page.goto('/blog')
  await expect(page.getByText('No articles on this page yet.', { exact: false })).toBeVisible()
  await page.goto('/admin/blogs')
  await page.getByRole('button', { name: 'Edit / restore' }).click()
  await page.getByRole('combobox', { name: 'Publishing status', exact: true }).selectOption('published')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Blog published' })).toBeVisible()
  expect(state.writes.at(-1).updatedAt).toBeTruthy()
  await page.getByRole('link', { name: 'View', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My first beauty guide' })).toBeVisible()
  expect(await page.evaluate(() => window.contentInjected)).toBeUndefined()
  await page.goto('/admin/blogs')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Blog archived' })).toBeVisible()
  expect(state.blogs[0].status).toBe('archived')
  await page.goto('/blog/my-first-beauty-guide')
  await expect(page.getByText('Article not found', { exact: true })).toBeVisible()
})

test('About editor publishes existing-page content, keeps its slug and supports mobile reading', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/admin/about')
  await expect(page.getByLabel('Page address (slug)')).toHaveValue('about')
  await expect(page.getByLabel('Page address (slug)')).toHaveAttribute('readonly', '')
  await page.getByLabel('Name / title', { exact: true }).fill('About AURELIA')
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('A small moment of care, every day.\n\nExplore our store at your own pace.\n\nOur team is here to help with your questions.')
  await page.getByRole('combobox', { name: 'Publishing status', exact: true }).selectOption('published')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'About page published.' })).toBeVisible()
  expect(state.about.slug).toBe('about')
  await page.getByRole('link', { name: 'View About page' }).click()
  await expect(page.getByRole('heading', { name: 'About AURELIA', exact: true })).toBeVisible()
  await expect(page.getByText('A small moment of care, every day.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: 'test-results/about-desktop.png', fullPage: true })
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Horizontal overflow at ${width}px`).toBe(true)
  }
  await page.screenshot({ path: 'test-results/about-mobile.png', fullPage: true })
  await page.goto('/admin/about')
  await page.getByRole('combobox', { name: 'Publishing status', exact: true }).selectOption('draft')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'It is hidden from visitors.' })).toBeVisible()
  await page.goto('/pages/about')
  await expect(page.getByText('Our About page is not available right now.')).toBeVisible()
})

test('journal has working pagination and an image-free article remains readable', async ({ page }) => {
  const state = await fixture(page, { admin: false })
  state.blogs = Array.from({ length: 13 }, (_, index) => ({ _id: String(index + 1), title: `Guide ${index + 1}`, slug: `guide-${index + 1}`, excerpt: 'A guide for your daily routine.', image: '', content: 'A short article.\n\nA second paragraph.', status: 'published' }))
  await page.goto('/blog')
  await expect(page.getByRole('heading', { name: 'Guide 1', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Next →', exact: true }).click()
  await expect(page).toHaveURL(/\/blog\?page=2$/)
  await expect(page.getByRole('heading', { name: 'Guide 13', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Read guide', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Guide 13' })).toBeVisible()
  await expect(page.locator('.blog-hero-image')).toHaveCount(0)
})

test('an anonymous visitor cannot open the blog or About admin editors', async ({ page }) => {
  await fixture(page, { admin: false })
  for (const path of ['/admin/blogs', '/admin/about']) {
    await page.goto(path)
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  }
})
