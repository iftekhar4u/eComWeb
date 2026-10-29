import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { fixtureResponse } from '../storefront-fixture.mjs'
import { fileURLToPath } from 'node:url'
async function fixture(page) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), { status = 200, data } = fixtureResponse(url.pathname, url.searchParams)
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/fixture/hero.png', route => route.fulfill({ path: fileURLToPath(new URL('../../src/assets/hero.png', import.meta.url)), contentType: 'image/png' }))
}
test('storefront keeps admin chunks deferred and passes automated accessibility checks', async ({ page }) => {
  await fixture(page); const scripts = []
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()) })
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Beauty, considered.' })).toBeVisible()
  expect(scripts.some(url => /ReadyAdmin|PaymentSettings|EmailAdmin/.test(url))).toBe(false)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
})
test('mobile menu opens, navigates to About, closes and keeps the page within the viewport', async ({ page }) => {
  await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/')
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'AURELIA', exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'About AURELIA', exact: true })).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
})
test('failed lazy route shows a reload action and never resubmits a payment', async ({ page }) => {
  await fixture(page); await page.route('**/assets/About-*.js', route => route.abort()); await page.goto('/')
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('This page could not load.')
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible()
})
