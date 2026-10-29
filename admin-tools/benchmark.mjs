import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { launch } from 'chrome-launcher'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './run.mjs'
const server = spawn(process.execPath, ['admin-tools/benchmark-server.mjs'], { cwd: root, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] })
const results = []; let chrome
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Benchmark server exited')
    ready = await fetch('http://127.0.0.1:5301/api/content/storefront').then(response => response.ok).catch(() => false)
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error('Benchmark fixture did not start')
  for (const mode of ['mobile', 'desktop']) {
    chrome = await launch({ chromePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, chromeFlags: ['--headless=new', ...JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]')] })
    const { lhr } = await lighthouse('http://127.0.0.1:5301/', { port: chrome.port, logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, mode === 'desktop' ? desktopConfig : undefined)
    if (lhr.runtimeError) throw new Error(lhr.runtimeError.message)
    results.push({ mode, formFactor: lhr.configSettings.formFactor, lighthouseVersion: lhr.lighthouseVersion, scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, value.score === null ? null : Math.round(value.score * 100)])), metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'].map(id => [id, lhr.audits[id].numericValue])), diagnostics: Object.fromEntries(['layout-shifts', 'errors-in-console'].map(id => [id, lhr.audits[id]?.details?.items || []])), auditErrors: Object.values(lhr.audits).filter(audit => audit.errorMessage).map(({ id, errorMessage }) => ({ id, errorMessage })), failedAudits: Object.values(lhr.audits).filter(audit => audit.score !== null && audit.score < 1).map(({ id, title, displayValue }) => ({ id, title, displayValue })) })
    await chrome.kill(); chrome = null
  }
  await mkdir(path.join(root, 'reports'), { recursive: true })
  const file = path.join(root, 'reports', process.env.BENCHMARK_PROJECT_ROOT ? 'lighthouse-baseline.json' : 'lighthouse-production.json')
  await writeFile(file, JSON.stringify({ scope: 'Desktop/mobile lab runs with deterministic fixtures and local images; not live hosting, actual photos, provider payments or field Core Web Vitals.', results }, null, 2) + '\n')
  console.log(JSON.stringify(results.map(({ diagnostics, ...result }) => result), null, 2))
  if (results.some(result => result.auditErrors.length || result.scores.performance === null)) { console.error('Incomplete Lighthouse run; no score claimed for missing audits. See report.'); process.exitCode = 1 }
} catch (error) { console.error(error); process.exitCode = 1 }
finally { await chrome?.kill(); server.kill('SIGTERM') }
