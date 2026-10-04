// Simulated end-to-end demo: AI personas play the expert (Sabine) and the new hire (Lena).
// Drives Capture → Debrief → Work Map → Teach in a real browser, then composes a video with
// the ElevenLabs conversation audio. Requires `npm run dev` running.
//
//   node demo/run-demo.mjs            (BASE_URL defaults to http://localhost:5173)
import 'dotenv/config'
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { personaReply, SABINE, LENA } from './personas.mjs'
import { synth, voiceEngine } from './voice.mjs'
import { compose } from './compose.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = path.resolve('demo/out')
const SIZE = { width: 1200, height: 800 }
const CHROME = process.env.CHROME_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

const sleep = ms => new Promise(r => setTimeout(r, ms))
// Named moments in the run, used by demo/highlight.mjs to cut the short version.
const marks = []
const mark = name => { marks.push({ name, at: Date.now() }); log(`mark: ${name}`) }
const t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
const log = (...a) => console.log(`[${stamp()}s]`, ...a)

// ---- conversation state fed by page events ----
const state = { transcript: [], mode: 'listening', modeSince: Date.now(), conversations: [], status: 'idle' }
function onEvent({ type, data }) {
  if (type === 'utterance') {
    if (!/\w/.test(data.text)) return // ElevenLabs logs silence as "..."
    state.transcript.push({ ...data, at: Date.now() })
    log(data.speaker === 'agent' ? 'AI  :' : 'USER:', data.text)
  } else if (type === 'mode') {
    state.mode = data.mode
    state.modeSince = Date.now()
  } else if (type === 'connect') {
    state.status = 'connected'
    state.conversations.push({ id: data.conversationId, at: Date.now() })
    log('connected', data.conversationId)
  } else if (type === 'disconnect') {
    state.status = 'disconnected'
  } else if (type === 'error') {
    log('AGENT ERROR', data.message)
  }
}

async function waitFor(pred, timeoutMs, label) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) { if (await pred()) return true; await sleep(250) }
  if (label) log(`timeout waiting for ${label}`)
  return false
}

const agentQuiet = () => state.mode === 'listening' && Date.now() - state.modeSince > 900
const agentCount = () => state.transcript.filter(u => u.speaker === 'agent').length

// Persona speaks a line into the fake mic and waits until the agent has transcribed it.
async function speak(page, who, text) {
  await waitFor(agentQuiet, 20000, 'agent to finish before speaking')
  const before = state.transcript.filter(u => u.speaker === 'user').length
  log(`${who.toUpperCase()} says:`, text)
  const audio = await synth(text, who)
  await page.evaluate(b64 => window.__personaSpeak(b64), audio.toString('base64'))
  await waitFor(() => state.transcript.filter(u => u.speaker === 'user').length > before, 10000, 'transcript of persona line')
}

// Answers whatever the agent asks until `done()` or until `maxTurns` replies; returns replies made.
async function converse(page, { who, persona, selfLabel, situation, done, maxTurns = 20, idleMs = 30000, extra, handledFrom }) {
  let handled = handledFrom ?? agentCount()
  let replies = 0
  let idleSince = Date.now()
  while (replies < maxTurns) {
    if (done && await done()) break
    if (agentCount() > handled && agentQuiet()) {
      handled = agentCount()
      idleSince = Date.now()
      const sit = typeof situation === 'function' ? situation() : situation
      const reply = await personaReply({ persona, selfLabel, transcript: state.transcript, situation: sit })
      if (reply) { await speak(page, who, reply); replies++; extra?.onReply?.(reply) }
      continue
    }
    if (state.mode === 'speaking') idleSince = Date.now() // long turns (e.g. the teach-back) aren't idle time
    if (Date.now() - idleSince > idleMs) break
    await sleep(300)
  }
  return replies
}

// Streams screenshots of the ERP window into the apprentice page's stand-in screen share.
function pumpFrames(erp, page) {
  let running = true
  ;(async () => {
    while (running && !erp.isClosed()) {
      try {
        const shot = await erp.screenshot({ type: 'jpeg', quality: 80 })
        await page.evaluate(b64 => window.__pushFrame(b64), shot.toString('base64'))
      } catch { /* page navigating or closing */ }
      await sleep(700)
    }
  })()
  return () => { running = false }
}

async function openErp(context, page, url) {
  const [erp] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate(u => window.open(u, 'erp', 'popup,width=1200,height=800,left=0,top=0'), url),
  ])
  await erp.waitForLoadState('domcontentloaded')
  await erp.setViewportSize(SIZE)
  const stopPump = pumpFrames(erp, page)
  return { erp, openedAt: Date.now(), stopPump }
}

async function main() {
  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(OUT, { recursive: true })

  const browser = await chromium.launch({
    headless: false,
    executablePath: CHROME,
    args: [
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  })
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } })
  await context.addInitScript({ path: path.resolve('demo/page-shims.js') })
  await context.exposeBinding('__demoEvent', (_src, ev) => onEvent(ev))

  const page = await context.newPage()
  const timeline = { mainStart: Date.now(), erps: [] }

  // ================= CAPTURE =================
  log('--- capture ---')
  await page.goto(`${BASE}/capture`)
  let { erp, openedAt, stopPump } = await openErp(context, page, `${BASE}/erp`)
  await sleep(1500)
  timeline.erps.push({ page: erp, start: openedAt })
  await page.bringToFront()
  await page.getByRole('button', { name: /Start — share the ERP window/ }).click()
  await waitFor(() => state.status === 'connected', 20000, 'interviewer connection')
  await waitFor(() => agentCount() > 0 && agentQuiet(), 20000, 'greeting')

  const sabine = { who: 'sabine', persona: SABINE, selfLabel: 'Sabine' }
  // Waits (up to 45 s) for the apprentice's question about the step just done, answers it, then allows one follow-up.
  const askWindow = async situation => {
    const before = agentCount()
    await waitFor(() => agentCount() > before, 45000, 'apprentice question')
    await converse(page, { ...sabine, situation, maxTurns: 2, idleMs: 9000, handledFrom: before })
  }

  await speak(page, 'sabine', 'Right, three invoices left before close. Kessler first.')
  await erp.getByText('INV-4471').first().click()
  await sleep(3500)
  mark('recode')
  await erp.locator('select').selectOption('0400')
  await sleep(1500)
  await erp.getByPlaceholder('—').fill('A-2291')
  await askWindow('You just recoded INV-4471 (Kessler, €6,850 CNC spindle) from 4711 opex to 0400 capex and typed asset number A-2291. You are now pausing.')
  await erp.getByRole('button', { name: 'Approve' }).click()
  await sleep(2500)

  await erp.getByText('INV-4472').first().click()
  await sleep(2500)
  await speak(page, 'sabine', 'Brandt again. December, of course.')
  await erp.getByRole('button', { name: 'Hold' }).click()
  await askWindow('You just put INV-4472 (Brandt Office Supplies, €312 toner, December) on hold. You are pausing.')

  await erp.getByText('INV-4473').first().click()
  await sleep(3000)
  await erp.getByRole('button', { name: 'Escalate' }).click()
  await askWindow('You just escalated INV-4473 (Strojírny Plzeň, the Czech subsidiary, €2,140) for a second approval. You are pausing.')

  await speak(page, 'sabine', "That's the three. Done for today.")
  await sleep(2000)
  await page.getByRole('button', { name: /Task done/ }).click()
  stopPump()
  await erp.close()
  timeline.erps[0].end = Date.now()

  // ================= DEBRIEF =================
  log('--- debrief ---')
  state.status = 'idle'
  await page.waitForURL(/\/map/)
  await page.getByRole('button', { name: 'Start debrief' }).click()
  // Synthesis can fail or time out; the page then offers Retry.
  await waitFor(async () => {
    if (state.status === 'connected') return true
    const retry = page.getByRole('button', { name: 'Retry' })
    if (await retry.count()) { log('synthesis failed; clicking Retry'); await retry.click() }
    return false
  }, 180000, 'debrief connection')
  let teachbacks = 0
  // If the agent goes quiet mid-debrief (e.g. skipped its turn), Sabine nudges it on.
  const nudge = setInterval(async () => {
    const last = state.transcript[state.transcript.length - 1]
    if (state.status === 'connected' && agentQuiet() && last && last.speaker === 'user' && Date.now() - last.at > 12000) {
      last.at = Date.now()
      await speak(page, 'sabine', "Go on, what's next?").catch(() => {})
    }
  }, 2000)
  await converse(page, {
    ...sabine,
    maxTurns: 14,
    idleMs: 45000,
    done: async () => (await page.locator('.workmap').count()) > 0,
    situation: () => {
      const last = [...state.transcript].reverse().find(u => u.speaker === 'agent')?.text || ''
      const isTeachback = /how it works\?/i.test(last)
      if (isTeachback) teachbacks++
      if (isTeachback && teachbacks === 1) {
        return 'Debrief after the task. The apprentice just explained the whole process back. Correct exactly ONE detail: if it got everything right, add that the asset number must be in place before you approve a capex invoice — not afterwards. Do not confirm yet.'
      }
      if (isTeachback) return 'Debrief. The apprentice restated the corrected process. It is right now — confirm it clearly: "Yes, that\'s how it works."'
      return 'Debrief after the task. The apprentice is asking follow-up questions about what it could not see. Answer each one from your rules, briefly.'
    },
  })
  await waitFor(async () => (await page.locator('.workmap').count()) > 0, 180000, 'work map')
  clearInterval(nudge)
  mark('workmap')
  await sleep(3000)
  for (const li of (await page.locator('.timeline li').all()).slice(0, 4)) { await li.click(); await sleep(2200) }

  // ================= TEACH =================
  log('--- teach ---')
  state.status = 'idle'
  await page.goto(`${BASE}/teach`)
  ;({ erp, openedAt, stopPump } = await openErp(context, page, `${BASE}/erp?mode=teach`))
  await sleep(1500)
  timeline.erps.push({ page: erp, start: openedAt })
  await page.bringToFront()
  await page.getByRole('button', { name: /Start — share the training ERP window/ }).click()
  await waitFor(() => state.status === 'connected', 20000, 'tutor connection')
  await waitFor(() => agentCount() > 0 && agentQuiet(), 20000, 'tutor greeting')

  const lena = { who: 'lena', persona: LENA, selfLabel: 'Lena' }
  await erp.getByText('INV-5120').first().click()
  await converse(page, { ...lena, situation: 'You just opened INV-5120 (Kessler, €7,200 hydraulic press, cost center still 4711). You are looking at it.', maxTurns: 1, idleMs: 14000 })

  log('new hire approves on opex 4711 (expected veto)')
  mark('wrong-approve')
  await erp.getByRole('button', { name: 'Approve' }).click()
  await waitFor(async () => (await erp.getByText(/Held by tutor/).count()) > 0, 8000, 'veto')
  await converse(page, {
    ...lena, maxTurns: 3, idleMs: 16000,
    situation: 'You tried to approve INV-5120 on cost center 4711 and the tutor blocked the save. Answer the tutor.',
  })

  mark('fix')
  await erp.locator('select').selectOption('0400')
  await sleep(1500)
  await erp.getByPlaceholder('—').fill('A-3310')
  await sleep(1000)
  await speak(page, 'lena', "Okay — capex, 0400, and I've added the asset number.")
  await erp.getByRole('button', { name: 'Approve' }).click()
  await converse(page, { ...lena, maxTurns: 1, idleMs: 12000, situation: 'You fixed the invoice and it was approved. Respond briefly if the tutor says something.' })

  await page.getByRole('button', { name: 'Finish session' }).click()
  mark('mastery')
  stopPump()
  await sleep(5000)
  timeline.erps[1].end = Date.now()
  timeline.mainEnd = Date.now()

  // ================= FINISH =================
  const mainVideo = page.video()
  const erpVideos = timeline.erps.map(e => ({ video: e.page.video(), start: e.start, end: e.end }))
  await context.close()
  await browser.close()

  const manifest = {
    voice: voiceEngine(),
    mainStart: timeline.mainStart,
    mainEnd: timeline.mainEnd,
    main: await mainVideo.path(),
    erps: await Promise.all(erpVideos.map(async e => ({ path: await e.video.path(), start: e.start, end: e.end }))),
    conversations: state.conversations,
    transcript: state.transcript,
    marks,
  }
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  log('recording done; composing video')
  const file = await compose(manifest, OUT)
  log('VIDEO:', file)
}

main().catch(e => { console.error(e); process.exit(1) })
