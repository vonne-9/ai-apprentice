// Quick check of the browser plumbing used by run-demo.mjs: tab-capture auto-select, fake mic, agent connect.
import 'dotenv/config'
import { chromium } from 'playwright'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const CHROME = process.env.CHROME_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch({
  headless: false,
  executablePath: CHROME,
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
await context.addInitScript({ path: path.resolve('demo/page-shims.js') })
await context.exposeBinding('__demoEvent', (_s, ev) => console.log('EVENT', JSON.stringify(ev)))
const page = await context.newPage()
page.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 300)))
page.on('pageerror', e => console.log('PAGEERROR', e.message))
await page.goto(`${BASE}/capture`)
const [erp] = await Promise.all([context.waitForEvent('page'),
  page.evaluate(u => window.open(u, 'erp', 'popup,width=1200,height=800'), `${BASE}/erp`)])
await erp.waitForLoadState('domcontentloaded')
await sleep(1000)
console.log('erp title:', await erp.title())
const pump = setInterval(async () => { try { const b = await erp.screenshot({ type: 'jpeg', quality: 80 }); await page.evaluate(x => window.__pushFrame(x), b.toString('base64')) } catch {} }, 700)
await sleep(1500)
await page.bringToFront()
await page.getByRole('button', { name: /Start — share the ERP window/ }).click()
await sleep(12000)
console.log('PAGE TEXT:', (await page.locator('main').innerText()).slice(0, 600))
await erp.getByText('INV-4471').first().click()
await sleep(9000)
console.log('PAGE TEXT 2:', (await page.locator('main').innerText()).slice(0, 900))
clearInterval(pump)
await page.screenshot({ path: 'demo/out/diagnose.png' })
await browser.close()
