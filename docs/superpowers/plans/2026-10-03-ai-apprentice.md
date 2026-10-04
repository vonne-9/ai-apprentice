# AI Apprentice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A demoable web app where an ElevenLabs voice agent watches an expert work a mock ERP, asks why at pauses, debriefs into a confirmed Work Map, and tutors a new hire who gets stopped before saving a wrong decision.

**Architecture:** Vite + React client with four routes (`/erp`, `/capture`, `/map`, `/teach`). The ERP is screen-shared; the apprentice page samples frames, diff-gates them, and sends them to an Express server that asks Claude vision for structured events, which are pushed into the ElevenLabs conversation. The ERP and apprentice page talk over `BroadcastChannel` for activity pings and the pre-save guardrail check.

**Tech Stack:** Node 20+, Vite, React 18, Express 5, `@anthropic-ai/sdk`, `@elevenlabs/react`, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-03-ai-apprentice-design.md`

## Global Constraints

- Deadline: ~11h45m from 2026-10-03 plan time. Tasks are ordered riskiest-first; if behind, cut per the "Cuts" list at the bottom, never the required demo path.
- API keys live only in `.env` on the server: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_INTERVIEWER_AGENT_ID`, `ELEVENLABS_TUTOR_AGENT_ID`. Never import them in client code.
- Models: `VISION_MODEL` default `claude-sonnet-5-5` (switch to `claude-haiku-4-5-20251001` if a frame round-trip exceeds ~3 s); `SYNTH_MODEL` default `claude-opus-5-5`.
- Server on port 3001; Vite on 5173 proxies `/api` and `/frames`.
- Every Work Map reason/guardrail quote must be verbatim expert speech; never invented.
- Run the ERP and the apprentice page in **two side-by-side windows**, not tabs (background tabs throttle video/timers).
- All stretch goals are out of scope.

## File Structure

```
package.json, vite.config.js, index.html, .env.example, .gitignore
server/
  index.js        boot: env, Anthropic client, createApp, listen
  app.js          createApp({store, ai, eleven}) — all routes
  store.js        createStore(root) — sessions JSON + frames on disk, serialized updates
  ai.js           createAi(client) — describeFrameChange, synthesize, finalize
  prompts.js      FRAME_SYSTEM, SYNTH_SYSTEM, FINALIZE_SYSTEM
  pii.js          redact, redactDeep
  workmap.js      nearestFrame, attachFrames, validateWorkMap, inRanges
client/src/
  main.jsx, App.jsx, app.css
  lib/bus.js            openBus (BroadcastChannel)
  lib/frameDiff.js      meanAbsDiff, shouldSend
  lib/pauseDetector.js  createPauseDetector
  lib/guardrails.js     evalCond, checkGuardrails
  lib/ScreenSampler.js  ScreenSampler class
  lib/api.js            api.* fetch helpers
  lib/format.js         fmtTime
  erp/seed.js, erp/erpReducer.js, erp/ErpApp.jsx, erp/erp.css
  agent/useAgent.js     wraps useConversation + signed URL
  agent/prompts.js      interviewerPrompt, debriefPrompt, tutorPrompt, formatWorkMap, violationMessage
  session/useWatch.js   session + sampler + pause detector + transcript + off-record
  capture/CapturePage.jsx
  map/MapPage.jsx, map/WorkMapView.jsx
  teach/TeachPage.jsx
tests/  *.test.js (Vitest, node environment)
```

---

### Task 0: ElevenLabs agents (manual, ~20 min — do while `npm install` runs)

**Files:** none (dashboard config), `.env`

- [ ] **Step 1: Create agent "Apprentice Interviewer"** at elevenlabs.io → Agents.
  - LLM: a Claude model (latest Sonnet offered). Voice: a calm, warm voice; enable Expressive Mode if offered.
  - System prompt: `You are an apprentice.` (overridden from the client). First message: blank.
  - Tools → Add system tool **Skip turn** (`skip_turn`).
  - Tools → Add **client tool** `mark_answered`, param `index` (number, required), *Wait for response* off.
  - Tools → Add **client tool** `confirm_teachback`, no params, *Wait for response* **on**.
  - Advanced → Turn eagerness: patient (if available).
  - Security → enable overrides for **System prompt** and **First message**. Enable authentication (signed URLs).
- [ ] **Step 2: Create agent "Apprentice Tutor"** with the same settings, but the client tool is `record_outcome` with params `step` (number) and `result` (string, `mastered` | `practice`), *Wait for response* off. No `mark_answered`/`confirm_teachback`.
- [ ] **Step 3: Copy both agent IDs** into `.env` (created in Task 1).

---

### Task 1: Scaffold + mock ERP

**Files:**
- Create: `package.json` (via npm), `vite.config.js`, `index.html`, `.env.example`, `.gitignore`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/app.css`, `client/src/lib/bus.js`, `client/src/erp/seed.js`, `client/src/erp/erpReducer.js`, `client/src/erp/ErpApp.jsx`, `client/src/erp/erp.css`
- Test: `tests/erpReducer.test.js`

**Interfaces:**
- Produces: `openBus(onMessage?) → { post(msg), close() }` on channel `'apprentice'`. Bus messages: `{type:'activity', t}`, `{type:'save_attempt', invoice, action:'approve'|'hold'|'escalate'}`, `{type:'save_verdict', id, ok:boolean, reason?}`.
- Produces: invoice shape `{id, supplier, entity, amount, date:'YYYY-MM-DD', description, category, costCenter, assetNo, status}`.

- [ ] **Step 1: Init project and install**

```bash
npm init -y
npm pkg set type=module scripts.dev="concurrently -k -n web,api \"vite\" \"node --watch server/index.js\"" scripts.test="vitest run"
npm i react react-dom express dotenv @anthropic-ai/sdk @elevenlabs/react
npm i -D vite @vitejs/plugin-react vitest concurrently supertest
```

- [ ] **Step 2: Config files**

`vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001', '/frames': 'http://localhost:3001' } },
  test: { environment: 'node' },
})
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>AI Apprentice</title></head>
  <body><div id="root"></div><script type="module" src="/client/src/main.jsx"></script></body>
</html>
```

`.env.example`:
```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_INTERVIEWER_AGENT_ID=
ELEVENLABS_TUTOR_AGENT_ID=
VISION_MODEL=claude-sonnet-5-5
SYNTH_MODEL=claude-opus-5-5
```

`.gitignore`:
```
node_modules
.env
server/data
dist
```

Copy `.env.example` to `.env` and fill in keys.

- [ ] **Step 3: Write the failing reducer test** — `tests/erpReducer.test.js`

```js
import { describe, it, expect } from 'vitest'
import { erpReducer, initialErpState } from '../client/src/erp/erpReducer.js'
import { CAPTURE_INVOICES, TEACH_INVOICES } from '../client/src/erp/seed.js'

describe('erpReducer', () => {
  it('seeds capture vs teach invoices as independent copies', () => {
    const s = initialErpState(false)
    expect(s.invoices.map(i => i.id)).toEqual(['INV-4471', 'INV-4472', 'INV-4473'])
    s.invoices[0].costCenter = 'x'
    expect(CAPTURE_INVOICES[0].costCenter).toBe('4711')
    expect(initialErpState(true).invoices[0]).toMatchObject({ id: 'INV-5120', amount: 7200 })
    expect(TEACH_INVOICES).toHaveLength(1)
  })
  it('selects, edits a field, and sets status', () => {
    let s = initialErpState(false)
    s = erpReducer(s, { type: 'select', id: 'INV-4471' })
    s = erpReducer(s, { type: 'edit', id: 'INV-4471', field: 'costCenter', value: '0400' })
    s = erpReducer(s, { type: 'setStatus', id: 'INV-4471', status: 'approved' })
    expect(s.selectedId).toBe('INV-4471')
    expect(s.invoices[0]).toMatchObject({ costCenter: '0400', status: 'approved' })
    expect(s.invoices[1].status).toBe('open')
  })
})
```

- [ ] **Step 4: Run — expect FAIL** (`Cannot find module`): `npx vitest run tests/erpReducer.test.js`

- [ ] **Step 5: Implement seed + reducer**

`client/src/erp/seed.js`:
```js
export const COST_CENTERS = [
  { code: '4711', label: '4711 · Opex – general' },
  { code: '0400', label: '0400 · Capex – equipment' },
  { code: '4720', label: '4720 · Opex – services' },
]

export const CAPTURE_INVOICES = [
  { id: 'INV-4471', supplier: 'Kessler Maschinen GmbH', entity: 'DE · Stuttgart', amount: 6850, date: '2026-12-03', description: 'CNC spindle replacement unit', category: 'equipment', costCenter: '4711', assetNo: '', status: 'open' },
  { id: 'INV-4472', supplier: 'Brandt Office Supplies', entity: 'DE · Stuttgart', amount: 312.4, date: '2026-12-04', description: 'Printer toner, December delivery', category: 'supplies', costCenter: '4711', assetNo: '', status: 'open' },
  { id: 'INV-4473', supplier: 'Strojírny Plzeň s.r.o.', entity: 'CZ · Plzeň (subsidiary)', amount: 2140, date: '2026-12-02', description: 'Machined brackets, batch 77', category: 'parts', costCenter: '4711', assetNo: '', status: 'open' },
]

export const TEACH_INVOICES = [
  { id: 'INV-5120', supplier: 'Kessler Maschinen GmbH', entity: 'DE · Stuttgart', amount: 7200, date: '2026-12-09', description: 'Hydraulic press, 20 t', category: 'equipment', costCenter: '4711', assetNo: '', status: 'open' },
]
```

`client/src/erp/erpReducer.js`:
```js
import { CAPTURE_INVOICES, TEACH_INVOICES } from './seed.js'

export function initialErpState(teach) {
  return { invoices: (teach ? TEACH_INVOICES : CAPTURE_INVOICES).map(i => ({ ...i })), selectedId: null }
}

const patch = (state, id, fields) => ({
  ...state,
  invoices: state.invoices.map(i => (i.id === id ? { ...i, ...fields } : i)),
})

export function erpReducer(state, action) {
  switch (action.type) {
    case 'select': return { ...state, selectedId: action.id }
    case 'edit': return patch(state, action.id, { [action.field]: action.value })
    case 'setStatus': return patch(state, action.id, { status: action.status })
    default: return state
  }
}
```

- [ ] **Step 6: Run — expect PASS**: `npx vitest run tests/erpReducer.test.js`

- [ ] **Step 7: Bus, app shell, ERP UI**

`client/src/lib/bus.js`:
```js
export function openBus(onMessage) {
  const ch = new BroadcastChannel('apprentice')
  if (onMessage) ch.onmessage = e => onMessage(e.data)
  return { post: msg => ch.postMessage(msg), close: () => ch.close() }
}
```

`client/src/main.jsx`:
```jsx
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './app.css'

createRoot(document.getElementById('root')).render(<App />)
```

`client/src/App.jsx` (pages from later tasks are added to `routes` as they land; start with ERP only):
```jsx
import ErpApp from './erp/ErpApp.jsx'

const routes = { '/erp': ErpApp }

function Home() {
  return (
    <main className="home">
      <h1>AI Apprentice</h1>
      <ul>
        <li><a href="/erp" target="_blank">Mock ERP (expert)</a> · <a href="/capture">Capture</a></li>
        <li><a href="/map">Work Map</a></li>
        <li><a href="/erp?mode=teach" target="_blank">Mock ERP (new hire)</a> · <a href="/teach">Teach</a></li>
      </ul>
    </main>
  )
}

export default function App() {
  const Page = routes[window.location.pathname] || Home
  return <Page />
}
```

`client/src/app.css`:
```css
:root { --bg: #f7f6f2; --fg: #1d1d1b; --muted: #6b6b66; --accent: #2f5d50; --warn: #b4441c; --card: #fff; --line: #dedbd2; font-family: system-ui, sans-serif; color: var(--fg); background: var(--bg); }
body { margin: 0; }
button { font: inherit; padding: .5rem .9rem; border-radius: 6px; border: 1px solid var(--line); background: var(--card); cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
button.danger { color: var(--warn); }
.home { padding: 2rem; }
.panel { max-width: 560px; padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.feed { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .5rem .75rem; max-height: 30vh; overflow: auto; font-size: .9rem; }
.feed p { margin: .25rem 0; }
.muted { color: var(--muted); }
.badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; background: #e6efe9; color: var(--accent); font-size: .8rem; }
.badge.off { background: #f6e3dc; color: var(--warn); }
.error { color: var(--warn); }
```

`client/src/erp/erp.css`:
```css
.erp { display: grid; grid-template-columns: 300px 1fr; min-height: 100vh; font-size: 18px; }
.erp aside { border-right: 1px solid var(--line); background: var(--card); }
.erp aside h2 { margin: 0; padding: 1rem; font-size: 1.1rem; }
.erp .row { padding: .75rem 1rem; border-top: 1px solid var(--line); cursor: pointer; }
.erp .row.sel { background: #e6efe9; }
.erp .row small { display: block; color: var(--muted); }
.erp .detail { padding: 1.5rem 2rem; }
.erp dl { display: grid; grid-template-columns: 180px 1fr; gap: .6rem 1rem; }
.erp dt { color: var(--muted); }
.erp dd { margin: 0; font-weight: 600; }
.erp select, .erp input { font: inherit; padding: .3rem .5rem; }
.erp .actions { display: flex; gap: .75rem; margin-top: 1.5rem; }
.erp .notice { margin-top: 1rem; font-weight: 600; }
.erp .notice.held { color: var(--warn); }
```

`client/src/erp/ErpApp.jsx`:
```jsx
import { useEffect, useReducer, useRef, useState } from 'react'
import { erpReducer, initialErpState } from './erpReducer.js'
import { COST_CENTERS } from './seed.js'
import { openBus } from '../lib/bus.js'
import './erp.css'

const STATUS = { approve: 'approved', hold: 'on hold', escalate: 'escalated for 2nd approval' }
const eur = n => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export default function ErpApp() {
  const teach = new URLSearchParams(window.location.search).get('mode') === 'teach'
  const [state, dispatch] = useReducer(erpReducer, teach, initialErpState)
  const [notice, setNotice] = useState(null)
  const busRef = useRef(null)
  const pendingRef = useRef(null)

  function commit({ id, action }) {
    dispatch({ type: 'setStatus', id, status: STATUS[action] })
    setNotice({ text: `${id} ${STATUS[action]}`, held: false })
    pendingRef.current = null
  }

  useEffect(() => {
    const bus = openBus(msg => {
      const p = pendingRef.current
      if (msg.type !== 'save_verdict' || !p || msg.id !== p.id) return
      if (msg.ok) commit(p)
      else { setNotice({ text: `Held by tutor: ${msg.reason}`, held: true }); pendingRef.current = null }
    })
    busRef.current = bus
    const ping = () => bus.post({ type: 'activity', t: Date.now() })
    window.addEventListener('keydown', ping)
    window.addEventListener('mousedown', ping)
    return () => {
      window.removeEventListener('keydown', ping)
      window.removeEventListener('mousedown', ping)
      bus.close()
    }
  }, [])

  const inv = state.invoices.find(i => i.id === state.selectedId)

  function attempt(action) {
    if (!inv) return
    pendingRef.current = { id: inv.id, action }
    busRef.current.post({ type: 'save_attempt', invoice: inv, action })
    if (teach) setNotice({ text: 'Saving…', held: false })
    else setTimeout(() => commit({ id: inv.id, action }), 300)
  }

  const edit = field => e => dispatch({ type: 'edit', id: inv.id, field, value: e.target.value })

  return (
    <div className="erp">
      <aside>
        <h2>Open invoices {teach && <span className="badge">training</span>}</h2>
        {state.invoices.map(i => (
          <div key={i.id} className={`row ${i.id === state.selectedId ? 'sel' : ''}`} onClick={() => { dispatch({ type: 'select', id: i.id }); setNotice(null) }}>
            <b>{i.id}</b> · {eur(i.amount)}<small>{i.supplier} — {i.status}</small>
          </div>
        ))}
      </aside>
      <section className="detail">
        {!inv ? <p className="muted">Select an invoice.</p> : (
          <>
            <h1>Invoice {inv.id}</h1>
            <dl>
              <dt>Supplier</dt><dd>{inv.supplier}</dd>
              <dt>Legal entity</dt><dd>{inv.entity}</dd>
              <dt>Invoice date</dt><dd>{inv.date}</dd>
              <dt>Description</dt><dd>{inv.description}</dd>
              <dt>Category</dt><dd>{inv.category}</dd>
              <dt>Amount</dt><dd>{eur(inv.amount)}</dd>
              <dt>Cost center</dt>
              <dd><select value={inv.costCenter} onChange={edit('costCenter')}>{COST_CENTERS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></dd>
              <dt>Asset number</dt><dd><input value={inv.assetNo} onChange={edit('assetNo')} placeholder="—" /></dd>
              <dt>Status</dt><dd>{inv.status}</dd>
            </dl>
            <div className="actions">
              <button className="primary" onClick={() => attempt('approve')}>Approve</button>
              <button onClick={() => attempt('hold')}>Hold</button>
              <button onClick={() => attempt('escalate')}>Escalate</button>
            </div>
            {notice && <p className={`notice ${notice.held ? 'held' : ''}`}>{notice.text}</p>}
          </>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 8: Manual check** — `npx vite`, open `http://localhost:5173/erp`: select INV-4471, change cost center, Approve → "INV-4471 approved". `/erp?mode=teach` shows INV-5120 and Approve shows "Saving…" (no verdict yet — expected).

- [ ] **Step 9: Commit**
```bash
git add -A && git commit -m "feat: scaffold app and mock ERP with bus"
```

---

### Task 2: Pure client logic (frame diff, pause detector, guardrails)

**Files:**
- Create: `client/src/lib/frameDiff.js`, `client/src/lib/pauseDetector.js`, `client/src/lib/guardrails.js`
- Test: `tests/frameDiff.test.js`, `tests/pauseDetector.test.js`, `tests/guardrails.test.js`

**Interfaces:**
- Produces: `meanAbsDiff(a: Uint8ClampedArray|null, b|null) → number` (255 when either missing or lengths differ); `shouldSend({diff, threshold, msSinceLast, maxIntervalMs}) → boolean`.
- Produces: `createPauseDetector({quietMs=4000, eventCooldownMs=3000, now}) → { activity(), event(), setAgentSpeaking(bool), tick() → boolean }`. `tick()` returns true at most once per batch of new events.
- Produces: `evalCond(invoice, action, cond) → boolean`; `checkGuardrails(invoice, action, guardrails) → Guardrail[]` (violated ones).

- [ ] **Step 1: Write failing tests**

`tests/frameDiff.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { meanAbsDiff, shouldSend } from '../client/src/lib/frameDiff.js'

const px = (...vals) => new Uint8ClampedArray(vals)

describe('frameDiff', () => {
  it('is 255 when there is no previous frame', () => {
    expect(meanAbsDiff(px(0, 0, 0, 255), null)).toBe(255)
  })
  it('averages RGB differences and ignores alpha', () => {
    expect(meanAbsDiff(px(10, 20, 30, 255), px(13, 20, 30, 0))).toBe(1)
  })
  it('sends on change or when the heartbeat interval elapses', () => {
    expect(shouldSend({ diff: 1, threshold: 0.4, msSinceLast: 100, maxIntervalMs: 10000 })).toBe(true)
    expect(shouldSend({ diff: 0.1, threshold: 0.4, msSinceLast: 100, maxIntervalMs: 10000 })).toBe(false)
    expect(shouldSend({ diff: 0.1, threshold: 0.4, msSinceLast: 10000, maxIntervalMs: 10000 })).toBe(true)
  })
})
```

`tests/pauseDetector.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { createPauseDetector } from '../client/src/lib/pauseDetector.js'

function setup() {
  let t = 0
  const d = createPauseDetector({ quietMs: 4000, eventCooldownMs: 3000, now: () => t })
  return { d, at: ms => { t = ms } }
}

describe('pauseDetector', () => {
  it('never fires without a new screen event', () => {
    const { d, at } = setup()
    at(20000)
    expect(d.tick()).toBe(false)
  })
  it('fires once after quiet + cooldown, then waits for a new event', () => {
    const { d, at } = setup()
    at(1000); d.event(); d.activity()
    at(4000); expect(d.tick()).toBe(false)   // only 3s since activity
    at(5000); expect(d.tick()).toBe(true)
    at(9000); expect(d.tick()).toBe(false)
    d.event()
    at(13000); expect(d.tick()).toBe(true)
  })
  it('stays quiet while the agent speaks and restarts the window after', () => {
    const { d, at } = setup()
    at(0); d.event()
    d.setAgentSpeaking(true)
    at(10000); expect(d.tick()).toBe(false)
    d.setAgentSpeaking(false)
    at(12000); expect(d.tick()).toBe(false)
    at(14000); expect(d.tick()).toBe(true)
  })
  it('respects the event cooldown', () => {
    const { d, at } = setup()
    at(5000); d.event()
    at(7000); expect(d.tick()).toBe(false)
    at(8000); expect(d.tick()).toBe(true)
  })
})
```

`tests/guardrails.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { checkGuardrails, evalCond } from '../client/src/lib/guardrails.js'

const capex = {
  id: 'g1', stepN: 4, rule: 'Equipment over €5,000 is capex', kind: 'limit',
  check: {
    when: [
      { field: 'amount', op: '>', value: 5000 },
      { field: 'category', op: '==', value: 'equipment' },
      { field: 'action', op: '==', value: 'approve' },
    ],
    require: { field: 'cost_center', op: '==', value: '0400' },
  },
}
const asset = {
  id: 'g2', stepN: 4, rule: 'No asset number, no capex booking', kind: 'limit',
  check: { when: [{ field: 'cost_center', op: '==', value: '0400' }, { field: 'action', op: '==', value: 'approve' }], require: { field: 'asset_no', op: 'not_empty' } },
}
const prose = { id: 'g3', stepN: 2, rule: 'Unknown supplier: ask the controller', kind: 'stop_and_ask' }
const press = { id: 'INV-5120', supplier: 'Kessler', amount: 7200, date: '2026-12-09', category: 'equipment', costCenter: '4711', assetNo: '' }

describe('guardrails', () => {
  it('flags capex violation on approve with opex code', () => {
    expect(checkGuardrails(press, 'approve', [capex, asset, prose]).map(g => g.id)).toEqual(['g1'])
  })
  it('flags missing asset number once recoded to capex', () => {
    expect(checkGuardrails({ ...press, costCenter: '0400' }, 'approve', [capex, asset]).map(g => g.id)).toEqual(['g2'])
  })
  it('passes a correct booking and ignores guardrails without checks', () => {
    expect(checkGuardrails({ ...press, costCenter: '0400', assetNo: 'A-1' }, 'approve', [capex, asset, prose])).toEqual([])
  })
  it('does not fire when the action does not match', () => {
    expect(checkGuardrails(press, 'hold', [capex])).toEqual([])
  })
  it('supports month, in, empty and !=', () => {
    expect(evalCond(press, 'approve', { field: 'month', op: '==', value: 12 })).toBe(true)
    expect(evalCond(press, 'approve', { field: 'supplier', op: 'in', value: ['Kessler', 'Brandt'] })).toBe(true)
    expect(evalCond(press, 'approve', { field: 'asset_no', op: 'empty' })).toBe(true)
    expect(evalCond(press, 'approve', { field: 'cost_center', op: '!=', value: '0400' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run tests/frameDiff.test.js tests/pauseDetector.test.js tests/guardrails.test.js`

- [ ] **Step 3: Implement**

`client/src/lib/frameDiff.js`:
```js
export function meanAbsDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 255
  let sum = 0
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    n += 3
  }
  return sum / n
}

export function shouldSend({ diff, threshold, msSinceLast, maxIntervalMs }) {
  return diff >= threshold || msSinceLast >= maxIntervalMs
}
```

`client/src/lib/pauseDetector.js`:
```js
// Decides when the worker has paused long enough for the agent to ask one question.
export function createPauseDetector({ quietMs = 4000, eventCooldownMs = 3000, now = () => Date.now() } = {}) {
  let lastActivity = now()
  let lastEvent = -Infinity
  let pending = 0
  let agentSpeaking = false
  return {
    activity() { lastActivity = now() },
    event() { lastEvent = now(); pending++ },
    setAgentSpeaking(v) { agentSpeaking = v; if (!v) lastActivity = now() },
    tick() {
      const t = now()
      if (agentSpeaking || pending === 0) return false
      if (t - lastActivity < quietMs || t - lastEvent < eventCooldownMs) return false
      pending = 0
      return true
    },
  }
}
```

`client/src/lib/guardrails.js`:
```js
function fieldValue(invoice, action, field) {
  switch (field) {
    case 'month': return Number(invoice.date.slice(5, 7))
    case 'action': return action
    case 'cost_center': return invoice.costCenter
    case 'asset_no': return invoice.assetNo
    default: return invoice[field]
  }
}

export function evalCond(invoice, action, { field, op, value }) {
  const v = fieldValue(invoice, action, field)
  switch (op) {
    case '>': return Number(v) > Number(value)
    case '<': return Number(v) < Number(value)
    case '==': return String(v) === String(value)
    case '!=': return String(v) !== String(value)
    case 'in': return Array.isArray(value) && value.map(String).includes(String(v))
    case 'empty': return !v
    case 'not_empty': return !!v
    default: return false
  }
}

export function checkGuardrails(invoice, action, guardrails) {
  return guardrails.filter(g =>
    g.check &&
    g.check.when.every(c => evalCond(invoice, action, c)) &&
    !evalCond(invoice, action, g.check.require))
}
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run`

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: frame diff gate, pause detector, guardrail checks"
```

---

### Task 3: Server — store, PII, Work Map helpers, AI, routes

**Files:**
- Create: `server/store.js`, `server/pii.js`, `server/workmap.js`, `server/prompts.js`, `server/ai.js`, `server/app.js`, `server/index.js`
- Test: `tests/pii.test.js`, `tests/workmap.test.js`, `tests/app.test.js`

**Interfaces:**
- Produces store: `createStore(root) → { create(mode, expert), read(id), update(id, fn), saveFrame(id, t, buf) → file, framePath(id, file), saveWorkMap(wm), latestWorkMap() }`.
- Produces ai: `createAi(client) → { describeFrameChange({prevB64, currB64, recentEvents}) → {events}, synthesize({events, transcript}) → {workMap, openQuestions}, finalize({draft, debrief}) → {workMap} }`.
- Produces HTTP API (all JSON):
  - `POST /api/sessions {mode, expert}` → Session
  - `GET /api/sessions/:id` → Session
  - `POST /api/sessions/:id/frame {t, prev|null, curr}` (base64 JPEG, no data: prefix) → `{events: Event[], frame}`
  - `POST /api/sessions/:id/transcript {utterances}` → `{ok}`
  - `POST /api/sessions/:id/offrecord {t0, t1}` → `{ok}`
  - `POST /api/sessions/:id/synthesize` → `{workMap, openQuestions: string[]}`
  - `POST /api/sessions/:id/finalize {debrief: Utterance[]}` → WorkMap (with `frame` on steps/guardrails)
  - `GET /api/workmaps/latest` → WorkMap | null; `PUT /api/workmaps/latest` WorkMap → `{ok}`
  - `GET /api/signed-url?role=interviewer|tutor` → `{signedUrl}`
  - `GET /frames/:id/:file` → JPEG

- [ ] **Step 1: Write failing tests**

`tests/pii.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { redact, redactDeep } from '../server/pii.js'

describe('pii', () => {
  it('replaces IBANs and emails but leaves dates, amounts and invoice ids', () => {
    expect(redact('Pay DE89 3704 0044 0532 0130 00 now')).toBe('Pay [IBAN] now')
    expect(redact('mail s.weber@kessler.de')).toBe('mail [EMAIL]')
    expect(redact('INV-4471 on 2026-12-03 for 6850')).toBe('INV-4471 on 2026-12-03 for 6850')
  })
  it('walks nested objects and arrays', () => {
    expect(redactDeep([{ note: 'x@y.com', n: 3 }])).toEqual([{ note: '[EMAIL]', n: 3 }])
  })
})
```

`tests/workmap.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { nearestFrame, attachFrames, validateWorkMap, inRanges } from '../server/workmap.js'

const frames = [{ t: 0, file: 'f000000.jpg' }, { t: 10, file: 'f000100.jpg' }, { t: 20, file: 'f000200.jpg' }]

describe('workmap helpers', () => {
  it('picks the last frame at or just before t', () => {
    expect(nearestFrame(frames, 12)).toBe('f000100.jpg')
    expect(nearestFrame(frames, 19.8)).toBe('f000200.jpg')
    expect(nearestFrame([], 5)).toBe(null)
  })
  it('attaches step frames and gives guardrails their step frame', () => {
    const wm = attachFrames({ steps: [{ n: 1, t: 11, title: 'a', decision: 'b' }], guardrails: [{ id: 'g1', stepN: 1 }] }, frames)
    expect(wm.steps[0].frame).toBe('f000100.jpg')
    expect(wm.guardrails[0].frame).toBe('f000100.jpg')
  })
  it('validates shape', () => {
    expect(validateWorkMap({ steps: [{ n: 1, title: 'a', decision: 'b' }], guardrails: [] })).toEqual([])
    expect(validateWorkMap({ steps: [] })).toEqual(['steps missing', 'guardrails missing'])
  })
  it('checks off-record ranges', () => {
    expect(inRanges(5, [[3, 8]])).toBe(true)
    expect(inRanges(9, [[3, 8]])).toBe(false)
  })
})
```

`tests/app.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../server/app.js'
import { createStore } from '../server/store.js'

const JPEG = Buffer.from('fakejpeg').toString('base64')
let app, calls

beforeEach(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appr-'))
  calls = {}
  const ai = {
    describeFrameChange: async () => ({ events: [{ kind: 'field_change', invoice: 'INV-4471', field: 'cost_center', from: '4711', to: '0400', note: 'ref DE89 3704 0044 0532 0130 00' }] }),
    synthesize: async args => { calls.synth = args; return { workMap: { task: 'AP', steps: [{ n: 1, t: 1, title: 'Code', decision: 'capex' }], guardrails: [] }, openQuestions: ['Why?'] } },
    finalize: async args => { calls.final = args; return { workMap: { task: 'AP', steps: [{ n: 1, t: 1, title: 'Code', decision: 'capex', reason: { quote: 'over 5k', source: 'live', t: 2 } }], guardrails: [{ id: 'g1', stepN: 1, rule: 'r', kind: 'limit', quote: 'q', t: 2 }] } } },
  }
  app = createApp({ store: createStore(root), ai, eleven: { apiKey: 'k', agents: { interviewer: 'agent_i', tutor: 'agent_t' }, fetch: async url => ({ ok: true, json: async () => ({ signed_url: `wss://x?u=${encodeURIComponent(url)}` }) }) } })
})

async function session() {
  return (await request(app).post('/api/sessions').send({ mode: 'capture', expert: 'Sabine' })).body
}

describe('api', () => {
  it('turns a frame into redacted, timestamped events', async () => {
    const s = await session()
    const res = await request(app).post(`/api/sessions/${s.id}/frame`).send({ t: 3.2, prev: null, curr: JPEG })
    expect(res.status).toBe(200)
    expect(res.body.events[0]).toMatchObject({ to: '0400', t: 3.2, note: 'ref [IBAN]' })
    const img = await request(app).get(`/frames/${s.id}/${res.body.frame}`)
    expect(img.status).toBe(200)
    expect((await request(app).get(`/api/sessions/${s.id}`)).body.events).toHaveLength(1)
  })
  it('excludes off-record speech from synthesis', async () => {
    const s = await session()
    await request(app).post(`/api/sessions/${s.id}/transcript`).send({ utterances: [
      { t: 1, speaker: 'expert', text: 'keep' },
      { t: 5, speaker: 'expert', text: 'secret' },
      { t: 6, speaker: 'expert', text: 'flagged', offRecord: true },
    ] })
    await request(app).post(`/api/sessions/${s.id}/offrecord`).send({ t0: 4, t1: 5.5 })
    const res = await request(app).post(`/api/sessions/${s.id}/synthesize`)
    expect(res.body.openQuestions).toEqual(['Why?'])
    expect(calls.synth.transcript.map(u => u.text)).toEqual(['keep'])
  })
  it('finalizes into the latest work map with frames and expert', async () => {
    const s = await session()
    await request(app).post(`/api/sessions/${s.id}/frame`).send({ t: 0.5, prev: null, curr: JPEG })
    await request(app).post(`/api/sessions/${s.id}/synthesize`)
    const res = await request(app).post(`/api/sessions/${s.id}/finalize`).send({ debrief: [{ t: 1, speaker: 'expert', text: 'yes' }] })
    expect(res.body).toMatchObject({ expert: 'Sabine', sessionId: s.id })
    expect(res.body.steps[0].frame).toMatch(/^f\d+\.jpg$/)
    expect(res.body.guardrails[0].frame).toBe(res.body.steps[0].frame)
    expect((await request(app).get('/api/workmaps/latest')).body.id).toBe(res.body.id)
  })
  it('rejects finalize before synthesize and bad ids', async () => {
    const s = await session()
    expect((await request(app).post(`/api/sessions/${s.id}/finalize`).send({})).status).toBe(409)
    expect((await request(app).get('/api/sessions/..%2Fetc')).status).toBe(400)
  })
  it('returns a signed url for a known role only', async () => {
    const ok = await request(app).get('/api/signed-url?role=tutor')
    expect(ok.body.signedUrl).toContain('agent_t')
    expect((await request(app).get('/api/signed-url?role=x')).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run tests/pii.test.js tests/workmap.test.js tests/app.test.js`

- [ ] **Step 3: Implement helpers**

`server/pii.js`:
```js
const PATTERNS = [
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[IBAN]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
]

export function redact(text) {
  return PATTERNS.reduce((s, [re, token]) => s.replace(re, token), String(text))
}

export function redactDeep(value) {
  if (typeof value === 'string') return redact(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]))
  return value
}
```

`server/workmap.js`:
```js
export function nearestFrame(frames, t) {
  if (t == null || !frames.length) return null
  let best = frames[0]
  for (const f of frames) {
    if (f.t <= t + 0.5) best = f
    else break
  }
  return best.file
}

export function attachFrames(wm, frames) {
  const steps = wm.steps.map(s => ({ ...s, frame: nearestFrame(frames, s.t) }))
  const byN = Object.fromEntries(steps.map(s => [s.n, s]))
  return { ...wm, steps, guardrails: wm.guardrails.map(g => ({ ...g, frame: byN[g.stepN]?.frame ?? null })) }
}

export function validateWorkMap(wm) {
  const errs = []
  if (!wm || !Array.isArray(wm.steps) || !wm.steps.length) errs.push('steps missing')
  else wm.steps.forEach((s, i) => { if (typeof s.n !== 'number' || !s.title || !s.decision) errs.push(`step ${i} incomplete`) })
  if (!Array.isArray(wm?.guardrails)) errs.push('guardrails missing')
  return errs
}

export const inRanges = (t, ranges) => ranges.some(([a, b]) => t >= a && t <= b)
```

`server/store.js`:
```js
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export function createStore(root) {
  const dir = id => path.join(root, 'sessions', id)
  const file = id => path.join(dir(id), 'session.json')
  let chain = Promise.resolve()

  async function read(id) { return JSON.parse(await fs.readFile(file(id), 'utf8')) }
  async function write(s) {
    await fs.mkdir(dir(s.id), { recursive: true })
    await fs.writeFile(file(s.id), JSON.stringify(s, null, 2))
  }
  // Serialize read-modify-write so concurrent frame/transcript posts don't drop updates.
  function update(id, fn) {
    const p = chain.then(async () => { const s = await read(id); const r = await fn(s); await write(s); return r })
    chain = p.catch(() => {})
    return p
  }

  return {
    async create(mode, expert) {
      const s = { id: crypto.randomUUID().replace(/-/g, '').slice(0, 8), mode, expert: expert || 'the expert', startedAt: Date.now(), events: [], transcript: [], frames: [], offRecord: [] }
      await write(s)
      return s
    },
    read,
    update,
    async saveFrame(id, t, buf) {
      const name = `f${String(Math.round(t * 10)).padStart(6, '0')}.jpg`
      await fs.mkdir(dir(id), { recursive: true })
      await fs.writeFile(path.join(dir(id), name), buf)
      return name
    },
    framePath: (id, name) => path.resolve(dir(id), name),
    async saveWorkMap(wm) {
      await fs.mkdir(root, { recursive: true })
      await fs.writeFile(path.join(root, 'workmap-latest.json'), JSON.stringify(wm, null, 2))
    },
    async latestWorkMap() {
      try { return JSON.parse(await fs.readFile(path.join(root, 'workmap-latest.json'), 'utf8')) } catch { return null }
    },
  }
}
```

- [ ] **Step 4: Implement prompts + AI**

`server/prompts.js`:
```js
export const FRAME_SYSTEM = `You watch screenshots of an accounts-payable ERP while a person works.
Compare PREVIOUS and CURRENT and report only what the person changed or did.
Return JSON only: {"events":[{"kind":"open|field_change|action|hold|escalate|other","invoice":"INV-…","field":"cost_center|asset_no|…","from":"…","to":"…","note":"≤12 words"}]}
- Omit keys that don't apply. Return {"events":[]} if nothing meaningful changed (cursor, hover, scrolling don't count).
- Opening an invoice = "open". Status becoming approved = "action"; on hold = "hold"; escalated = "escalate".
- Do not repeat anything listed in Recent events.
- Replace person names with [PERSON], IBANs with [IBAN], emails with [EMAIL]. Supplier and company names are not personal data.`

export const SYNTH_SYSTEM = `You turn an expert's recorded screen session into a draft Work Map.
Input: EVENTS (screen changes, t = seconds) and TRANSCRIPT (expert and apprentice speech, t = seconds).
Return JSON only:
{"workMap":{"task":"short task name","steps":[{"n":1,"title":"…","t":12.5,"decision":"what was decided","reason":{"quote":"verbatim expert words or empty","source":"live","t":15}}],
 "guardrails":[{"id":"g1","stepN":2,"rule":"…","kind":"limit|exception|stop_and_ask","quote":"verbatim or empty","t":16}]},
 "openQuestions":["…"]}
Rules:
- 5-9 steps in order. step.t is the screen moment the decision happened.
- Quotes must be copied verbatim from expert lines in TRANSCRIPT. Never invent a quote; leave it empty instead.
- 3-5 openQuestions about what is still unclear: decisions with no stated reason, rules that may or may not generalize ("every supplier or just this one?"), cases not seen ("what if there is no asset number?"), and who decides or must be asked. Do not ask what the expert already explained.`

export const FINALIZE_SYSTEM = `You finalize a Work Map from a DRAFT and the DEBRIEF transcript in which the expert answered open questions and confirmed a teach-back.
Return JSON only: {"workMap":{"task":"…","steps":[…same shape as draft…],"guardrails":[…same shape plus optional "check"…]}}
- Fill missing reasons and add new guardrails from the debrief, quoting the expert verbatim with "source":"debrief" and the debrief line's t.
- Apply any corrections the expert made. Keep step.t from the draft.
- For every guardrail expressible over a single invoice, add
  "check":{"when":[Cond,…],"require":Cond}
  Cond = {"field":"amount|category|supplier|entity|cost_center|asset_no|month|action","op":">|<|==|!=|in|empty|not_empty","value":…}
  Fields: amount in EUR (number); category: equipment|supplies|parts|services; cost_center: "4711" opex general, "0400" capex equipment, "4720" opex services; asset_no string; month 1-12; supplier and entity as shown on the invoice; action: approve|hold|escalate.
  A violation is: all "when" true and "require" false.
  Example "equipment over €5,000 is always capex":
  {"when":[{"field":"amount","op":">","value":5000},{"field":"category","op":"==","value":"equipment"},{"field":"action","op":"==","value":"approve"}],"require":{"field":"cost_center","op":"==","value":"0400"}}
  Example "never approve Brandt in December, hold it": {"when":[{"field":"supplier","op":"==","value":"Brandt Office Supplies"},{"field":"month","op":"==","value":12}],"require":{"field":"action","op":"==","value":"hold"}}`
```

`server/ai.js`:
```js
import { FRAME_SYSTEM, SYNTH_SYSTEM, FINALIZE_SYSTEM } from './prompts.js'

const VISION_MODEL = process.env.VISION_MODEL || 'claude-sonnet-5-5'
const SYNTH_MODEL = process.env.SYNTH_MODEL || 'claude-opus-5-5'

export function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : text).trim())
}

const image = b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })

export function createAi(client) {
  async function askJson({ model, system, content, maxTokens }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = attempt ? [...content, { type: 'text', text: 'Respond with valid JSON only, no prose.' }] : content
      const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: msg }] })
      const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('')
      try { return parseJson(text) } catch (e) { if (attempt) throw e }
    }
  }

  return {
    describeFrameChange({ prevB64, currB64, recentEvents }) {
      const content = []
      if (prevB64) content.push({ type: 'text', text: 'PREVIOUS frame:' }, image(prevB64))
      content.push({ type: 'text', text: 'CURRENT frame:' }, image(currB64),
        { type: 'text', text: `Recent events: ${JSON.stringify(recentEvents.slice(-5).map(({ t, frame, ...e }) => e))}` })
      return askJson({ model: VISION_MODEL, system: FRAME_SYSTEM, content, maxTokens: 800 })
    },
    synthesize({ events, transcript }) {
      const text = `EVENTS:\n${JSON.stringify(events.map(({ frame, ...e }) => e))}\n\nTRANSCRIPT:\n${transcript.map(u => `[t=${u.t.toFixed(1)}] ${u.speaker}: ${u.text}`).join('\n')}`
      return askJson({ model: SYNTH_MODEL, system: SYNTH_SYSTEM, content: [{ type: 'text', text }], maxTokens: 4000 })
    },
    finalize({ draft, debrief }) {
      const text = `DRAFT:\n${JSON.stringify(draft)}\n\nDEBRIEF:\n${debrief.map(u => `[t=${u.t.toFixed(1)}] ${u.speaker}: ${u.text}`).join('\n')}`
      return askJson({ model: SYNTH_MODEL, system: FINALIZE_SYSTEM, content: [{ type: 'text', text }], maxTokens: 6000 })
    },
  }
}
```

- [ ] **Step 5: Implement routes + boot**

`server/app.js`:
```js
import express from 'express'
import { redactDeep } from './pii.js'
import { attachFrames, validateWorkMap, inRanges } from './workmap.js'

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

export function createApp({ store, ai, eleven }) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.use('/api/sessions/:id', (req, res, next) =>
    /^[a-f0-9]{8}$/.test(req.params.id) ? next() : res.status(400).json({ error: 'bad session id' }))

  app.post('/api/sessions', async (req, res) => res.json(await store.create(req.body.mode || 'capture', req.body.expert)))
  app.get('/api/sessions/:id', async (req, res) => res.json(await store.read(req.params.id)))

  app.post('/api/sessions/:id/frame', async (req, res) => {
    const { id } = req.params
    const { t, prev, curr } = req.body
    const frame = await store.saveFrame(id, t, Buffer.from(curr, 'base64'))
    const { events: recent } = await store.read(id)
    let events = []
    try {
      const out = await withTimeout(ai.describeFrameChange({ prevB64: prev, currB64: curr, recentEvents: recent }), 8000)
      events = redactDeep(out.events || []).map(e => ({ ...e, t, frame }))
    } catch (e) {
      console.warn('frame dropped:', e.message)
    }
    await store.update(id, s => { s.frames.push({ t, file: frame }); s.events.push(...events) })
    res.json({ events, frame })
  })

  app.post('/api/sessions/:id/transcript', async (req, res) => {
    const utterances = redactDeep(req.body.utterances || [])
    await store.update(req.params.id, s => { s.transcript.push(...utterances) })
    res.json({ ok: true })
  })

  app.post('/api/sessions/:id/offrecord', async (req, res) => {
    await store.update(req.params.id, s => { s.offRecord.push([req.body.t0, req.body.t1]) })
    res.json({ ok: true })
  })

  app.post('/api/sessions/:id/synthesize', async (req, res) => {
    const s = await store.read(req.params.id)
    const transcript = s.transcript.filter(u => !u.offRecord && !inRanges(u.t, s.offRecord))
    const out = await ai.synthesize({ events: s.events, transcript })
    const errs = validateWorkMap(out?.workMap)
    if (errs.length) return res.status(502).json({ error: errs.join('; ') })
    await store.update(s.id, x => { x.draft = out })
    res.json(out)
  })

  app.post('/api/sessions/:id/finalize', async (req, res) => {
    const s = await store.read(req.params.id)
    if (!s.draft) return res.status(409).json({ error: 'synthesize first' })
    const out = await ai.finalize({ draft: s.draft.workMap, debrief: req.body.debrief || [] })
    const errs = validateWorkMap(out?.workMap)
    if (errs.length) return res.status(502).json({ error: errs.join('; ') })
    const wm = attachFrames({ ...out.workMap, id: `wm-${s.id}`, sessionId: s.id, expert: s.expert, confirmedAt: Date.now() }, s.frames)
    await store.saveWorkMap(wm)
    res.json(wm)
  })

  app.get('/api/workmaps/latest', async (req, res) => res.json(await store.latestWorkMap()))
  app.put('/api/workmaps/latest', async (req, res) => { await store.saveWorkMap(req.body); res.json({ ok: true }) })

  app.get('/api/signed-url', async (req, res) => {
    const agentId = eleven.agents[req.query.role]
    if (!agentId) return res.status(400).json({ error: 'unknown role' })
    const r = await eleven.fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`, { headers: { 'xi-api-key': eleven.apiKey } })
    if (!r.ok) return res.status(502).json({ error: `elevenlabs ${r.status}` })
    res.json({ signedUrl: (await r.json()).signed_url })
  })

  app.get('/frames/:id/:file', (req, res) => {
    const { id, file } = req.params
    if (!/^[a-f0-9]{8}$/.test(id) || !/^f\d+\.jpg$/.test(file)) return res.status(400).end()
    res.sendFile(store.framePath(id, file))
  })

  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }) })
  return app
}
```

`server/index.js`:
```js
import 'dotenv/config'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createApp } from './app.js'
import { createStore } from './store.js'
import { createAi } from './ai.js'

const app = createApp({
  store: createStore(path.resolve('server/data')),
  ai: createAi(new Anthropic()),
  eleven: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agents: { interviewer: process.env.ELEVENLABS_INTERVIEWER_AGENT_ID, tutor: process.env.ELEVENLABS_TUTOR_AGENT_ID },
    fetch,
  },
})
app.listen(3001, () => console.log('api on :3001'))
```

- [ ] **Step 6: Run — expect PASS**: `npx vitest run`

- [ ] **Step 7: Smoke-test live Claude vision** — start `node server/index.js`, then:
```bash
curl -s -X POST localhost:3001/api/sessions -H 'Content-Type: application/json' -d '{"mode":"capture","expert":"Sabine"}'
```
Take two screenshots of `/erp` (before/after changing INV-4471's cost center) as `a.jpg`/`b.jpg` and post them:
```bash
node -e "const f=require('fs');console.log(JSON.stringify({t:1,prev:f.readFileSync('a.jpg').toString('base64'),curr:f.readFileSync('b.jpg').toString('base64')}))" > /tmp/frame.json
curl -s -X POST localhost:3001/api/sessions/<ID>/frame -H 'Content-Type: application/json' -d @/tmp/frame.json
```
Expected: a `field_change` event with `from` 4711 → `to` 0400. Note the round-trip time; if > 3 s set `VISION_MODEL=claude-haiku-4-5-20251001`.

- [ ] **Step 8: Commit**
```bash
git add -A && git commit -m "feat: server with vision events, synthesis, work map store"
```

---

### Task 4: Screen sampler + live event feed (no voice yet)

**Files:**
- Create: `client/src/lib/ScreenSampler.js`, `client/src/lib/api.js`, `client/src/lib/format.js`, `client/src/session/useWatch.js`, `client/src/capture/CapturePage.jsx`
- Modify: `client/src/App.jsx` (add `/capture`)

**Interfaces:**
- Consumes: `meanAbsDiff`, `shouldSend`, `createPauseDetector`, `openBus`, HTTP API from Task 3.
- Produces: `api.{createSession(mode, expert), getSession, postFrame, postTranscript, postOffRecord, synthesize, finalize, latestWorkMap, saveWorkMap, signedUrl}`.
- Produces: `fmtTime(seconds) → 'mm:ss'`.
- Produces: `useWatch({ mode, expert, agent, onBusMessage }) → { sessionId, events, transcript, offRecord, start() → id, stop(), addUtterance(speaker, text), toggleOffRecord() }`. `agent` must expose `status`, `isSpeaking`, `sendContextualUpdate`, `sendUserMessage`, `sendUserActivity` (Task 5 provides it; this task passes a no-op stub). `onBusMessage(msg, bus)` gets every bus message.
- Produces: `describeEvent(e) → string`.

- [ ] **Step 1: `client/src/lib/format.js`**
```js
export const fmtTime = t => (t == null ? '' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`)
```

- [ ] **Step 2: `client/src/lib/api.js`**
```js
async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  createSession: (mode, expert) => call('POST', '/api/sessions', { mode, expert }),
  getSession: id => call('GET', `/api/sessions/${id}`),
  postFrame: (id, body) => call('POST', `/api/sessions/${id}/frame`, body),
  postTranscript: (id, utterances) => call('POST', `/api/sessions/${id}/transcript`, { utterances }),
  postOffRecord: (id, body) => call('POST', `/api/sessions/${id}/offrecord`, body),
  synthesize: id => call('POST', `/api/sessions/${id}/synthesize`, {}),
  finalize: (id, body) => call('POST', `/api/sessions/${id}/finalize`, body),
  latestWorkMap: () => call('GET', '/api/workmaps/latest'),
  saveWorkMap: wm => call('PUT', '/api/workmaps/latest', wm),
  signedUrl: role => call('GET', `/api/signed-url?role=${role}`),
}
```

- [ ] **Step 3: `client/src/lib/ScreenSampler.js`**
```js
import { meanAbsDiff, shouldSend } from './frameDiff.js'

function draw(video, w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)
  return { canvas, ctx }
}

// Samples the shared screen; sends a frame only when it changed (or as a slow heartbeat).
// At most one frame is in flight, so events arrive in order.
export class ScreenSampler {
  constructor({ onFrame, onEnded, intervalMs = 1500, maxIntervalMs = 10000, threshold = 0.4 }) {
    Object.assign(this, { onFrame, onEnded, intervalMs, maxIntervalMs, threshold })
    this.paused = false
    this.busy = false
    this.lastSent = 0
    this.lastThumb = null
    this.lastFull = null
  }

  async start() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true })
    Object.assign(this.video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
    document.body.appendChild(this.video)
    this.video.srcObject = this.stream
    await this.video.play()
    this.stream.getVideoTracks()[0].addEventListener('ended', () => this.stop())
    this.timer = setInterval(() => this.sample(), this.intervalMs)
  }

  sample() {
    const v = this.video
    if (this.paused || this.busy || !v?.videoWidth) return
    const thumb = draw(v, 160, 90).ctx.getImageData(0, 0, 160, 90).data
    const now = Date.now()
    const diff = meanAbsDiff(thumb, this.lastThumb)
    if (!shouldSend({ diff, threshold: this.threshold, msSinceLast: now - this.lastSent, maxIntervalMs: this.maxIntervalMs })) return
    const scale = Math.min(1, 1280 / v.videoWidth)
    const curr = draw(v, Math.round(v.videoWidth * scale), Math.round(v.videoHeight * scale)).canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
    const prev = this.lastFull
    Object.assign(this, { lastThumb: thumb, lastFull: curr, lastSent: now, busy: true })
    Promise.resolve(this.onFrame({ prev, curr }))
      .catch(e => console.warn('frame failed', e))
      .finally(() => { this.busy = false })
  }

  pause(p) { this.paused = p }

  stop() {
    clearInterval(this.timer)
    this.stream?.getTracks().forEach(t => t.stop())
    this.video?.remove()
    this.onEnded?.()
  }
}
```

- [ ] **Step 4: `client/src/session/useWatch.js`**
```js
import { useEffect, useRef, useState } from 'react'
import { openBus } from '../lib/bus.js'
import { ScreenSampler } from '../lib/ScreenSampler.js'
import { createPauseDetector } from '../lib/pauseDetector.js'
import { api } from '../lib/api.js'

export function describeEvent(e) {
  return [e.kind, e.invoice, e.field && `${e.field}: ${e.from ?? '?'} → ${e.to ?? '?'}`, e.note].filter(Boolean).join(' · ')
}

// Shared by Capture and Teach: session, screen sampling, pause detection, transcript, off-record.
export function useWatch({ mode, expert, agent, onBusMessage }) {
  const [sessionId, setSessionId] = useState(null)
  const [events, setEvents] = useState([])
  const [transcript, setTranscript] = useState([])
  const [offRecord, setOffRecord] = useState(false)
  const r = useRef({ startedAt: Date.now(), sampler: null, detector: createPauseDetector(), offSince: null, sessionId: null, recent: [] })
  const agentRef = useRef(agent)
  agentRef.current = agent
  const onBusRef = useRef(onBusMessage)
  onBusRef.current = onBusMessage
  const elapsed = () => (Date.now() - r.current.startedAt) / 1000

  useEffect(() => {
    const bus = openBus(msg => {
      if (msg.type === 'activity') {
        r.current.detector.activity()
        if (agentRef.current.status === 'connected') agentRef.current.sendUserActivity()
      }
      onBusRef.current?.(msg, bus)
    })
    return () => bus.close()
  }, [])

  useEffect(() => { r.current.detector.setAgentSpeaking(!!agent.isSpeaking) }, [agent.isSpeaking])

  useEffect(() => {
    if (!sessionId) return
    const id = setInterval(() => {
      const a = agentRef.current
      if (r.current.offSince != null || a.status !== 'connected') return
      if (r.current.detector.tick()) {
        const recent = r.current.recent.slice(-3).map(describeEvent).join('; ')
        a.sendUserMessage(`[PAUSE] The ${mode === 'teach' ? 'learner' : 'expert'} has paused. Recent screen events: ${recent}`)
      }
    }, 500)
    return () => clearInterval(id)
  }, [sessionId])

  async function start() {
    const s = await api.createSession(mode, expert)
    Object.assign(r.current, { sessionId: s.id, startedAt: Date.now(), recent: [] })
    const sampler = new ScreenSampler({
      onFrame: async ({ prev, curr }) => {
        const { events: evs } = await api.postFrame(s.id, { t: elapsed(), prev, curr })
        for (const e of evs) {
          r.current.recent.push(e)
          r.current.detector.event()
          if (agentRef.current.status === 'connected') agentRef.current.sendContextualUpdate(`[EVENT t=${Math.round(e.t)}s] ${describeEvent(e)}`)
        }
        if (evs.length) setEvents(prev => [...prev, ...evs])
      },
    })
    await sampler.start()
    r.current.sampler = sampler
    setSessionId(s.id)
    return s.id
  }

  function addUtterance(speaker, text) {
    if (speaker !== 'agent') r.current.detector.activity()
    const u = { t: elapsed(), speaker, text, offRecord: r.current.offSince != null }
    setTranscript(prev => [...prev, u])
    if (r.current.sessionId) api.postTranscript(r.current.sessionId, [u]).catch(console.error)
  }

  async function toggleOffRecord() {
    const a = agentRef.current
    const live = a.status === 'connected'
    if (r.current.offSince == null) {
      r.current.offSince = elapsed()
      r.current.sampler?.pause(true)
      if (live) a.sendContextualUpdate('[OFF RECORD] Do not ask about or remember anything until [ON RECORD].')
      setOffRecord(true)
    } else {
      const t0 = r.current.offSince
      r.current.offSince = null
      r.current.sampler?.pause(false)
      if (live) a.sendContextualUpdate('[ON RECORD]')
      setOffRecord(false)
      await api.postOffRecord(r.current.sessionId, { t0, t1: elapsed() })
    }
  }

  function stop() {
    r.current.sampler?.stop()
    r.current.sampler = null
  }

  return { sessionId, events, transcript, offRecord, start, stop, addUtterance, toggleOffRecord }
}
```

- [ ] **Step 5: First `client/src/capture/CapturePage.jsx` (events only, stub agent)**
```jsx
import { useState } from 'react'
import { useWatch, describeEvent } from '../session/useWatch.js'
import { fmtTime } from '../lib/format.js'

const stubAgent = { status: 'disconnected', isSpeaking: false }

export default function CapturePage() {
  const [expert, setExpert] = useState('Sabine')
  const [error, setError] = useState('')
  const watch = useWatch({ mode: 'capture', expert, agent: stubAgent })

  async function start() {
    try { await watch.start() } catch (e) { setError(e.message) }
  }

  return (
    <main className="panel">
      <h1>Capture</h1>
      {!watch.sessionId ? (
        <>
          <label>Expert name <input value={expert} onChange={e => setExpert(e.target.value)} /></label>
          <button className="primary" onClick={start}>Start — share the ERP window</button>
        </>
      ) : <p className="badge">session {watch.sessionId}</p>}
      {error && <p className="error">{error}</p>}
      <h3>Screen events</h3>
      <div className="feed">{watch.events.map((e, i) => <p key={i}><span className="muted">{fmtTime(e.t)}</span> {describeEvent(e)}</p>)}</div>
    </main>
  )
}
```

Add to `client/src/App.jsx`: `import CapturePage from './capture/CapturePage.jsx'` and `'/capture': CapturePage` in `routes`.

- [ ] **Step 6: Manual check** — `npm run dev`. Window A: `/erp`. Window B: `/capture` → Start → share window A. Open INV-4471, recode to 0400, Approve. Expected within ~3 s each: `open · INV-4471`, `field_change · INV-4471 · cost_center: 4711 → 0400`, `action · INV-4471`. If changes are missed, lower `threshold` to 0.2; if idle frames spam, raise it.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat: screen sampler and live vision event feed"
```

---

### Task 5: Interviewer voice agent (Capture complete)

**Files:**
- Create: `client/src/agent/useAgent.js`, `client/src/agent/prompts.js`
- Modify: `client/src/capture/CapturePage.jsx` (full version below)
- Test: `tests/prompts.test.js`

**Interfaces:**
- Consumes: `useWatch`, `api.signedUrl`.
- Produces: `useAgent({ onUtterance({speaker:'agent'|'user', text}) }) → conversation & { start({ role, prompt, firstMessage, clientTools }) }`.
- Produces from `prompts.js`: `interviewerPrompt(expert)`, `debriefPrompt({ expert, draft, questions })`, `tutorPrompt({ expert, workMapText })`, `formatWorkMap(wm) → string`, `violationMessage({ expert, invoice, action, guardrail }) → string`.

- [ ] **Step 1: Write failing test** — `tests/prompts.test.js`
```js
import { describe, it, expect } from 'vitest'
import { formatWorkMap, debriefPrompt, violationMessage } from '../client/src/agent/prompts.js'

const wm = {
  task: 'Invoice coding', expert: 'Sabine',
  steps: [{ n: 1, title: 'Code cost center', decision: 'capex', reason: { quote: 'Equipment over 5k is capex' } }],
  guardrails: [{ id: 'g1', stepN: 1, kind: 'limit', rule: 'Over €5,000 equipment → 0400', quote: 'always capex' }],
}

describe('prompts', () => {
  it('formats a work map with steps, quotes and guardrails', () => {
    const text = formatWorkMap(wm)
    expect(text).toContain('Step 1: Code cost center')
    expect(text).toContain('"Equipment over 5k is capex"')
    expect(text).toContain('[limit] (step 1) Over €5,000 equipment → 0400')
  })
  it('numbers open questions from 1', () => {
    expect(debriefPrompt({ expert: 'Sabine', draft: wm, questions: ['A?', 'B?'] })).toContain('1. A?\n2. B?')
  })
  it('builds a violation message naming the expert and quote', () => {
    const m = violationMessage({ expert: 'Sabine', invoice: { id: 'INV-5120' }, action: 'approve', guardrail: wm.guardrails[0] })
    expect(m).toMatch(/^\[VIOLATION\]/)
    expect(m).toContain('INV-5120')
    expect(m).toContain('"always capex"')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run tests/prompts.test.js`

- [ ] **Step 3: `client/src/agent/prompts.js`**
```js
export function formatWorkMap(wm) {
  return [
    `Task: ${wm.task}`,
    ...wm.steps.map(s => `Step ${s.n}: ${s.title} — decision: ${s.decision}. ${wm.expert}'s reason: "${s.reason?.quote || ''}"`),
    'Guardrails:',
    ...wm.guardrails.map(g => `- [${g.kind}] (step ${g.stepN}) ${g.rule}. ${wm.expert} said: "${g.quote || ''}"`),
  ].join('\n')
}

export const interviewerPrompt = expert => `You are an apprentice learning how ${expert} processes supplier invoices. You see their screen through [EVENT] context messages.
- Default: stay silent. If ${expert} is narrating, thinking aloud or working, call skip_turn.
- Speak only when you receive a [PAUSE] message or ${expert} asks you something directly.
- On [PAUSE]: ask ONE short question (max 15 words) about the most recent event whose reason is NOT visible on screen — a changed value, a hold, an escalation. Name the invoice or field. Never ask what the screen already shows.
- Prefer guardrails: limits, exceptions, when they would stop and ask someone, what they would never do. At least one of your questions must be about a guardrail.
- Ask at most 5 questions in total. After 5, or if nothing new happened since your last question, call skip_turn.
- After an answer, acknowledge in at most 5 words. No follow-ups now; they wait for the debrief.
- After [OFF RECORD], say nothing and ask nothing until [ON RECORD].`

export const debriefPrompt = ({ expert, draft, questions }) => `You are the apprentice, now debriefing ${expert} after watching them process invoices.
What you understood so far:
${formatWorkMap({ ...draft, expert })}

Open questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Procedure:
1. Ask the open questions one at a time, in order. When one is answered, call mark_answered with its number. Ask one short follow-up only if the answer is vague.
2. When all are answered, explain the whole process back in your own words in under 60 seconds: the steps, the judgment calls, and the guardrails. End with "Is that how it works?"
3. If ${expert} corrects you, restate only the corrected part and ask again.
4. When ${expert} confirms, call confirm_teachback. If it reports unanswered questions, ask those first. Then thank ${expert} in one sentence.`

export const tutorPrompt = ({ expert, workMapText }) => `You are a patient tutor teaching a new hire to process supplier invoices the way ${expert} does. You see their screen through [EVENT] context messages.
${expert}'s Work Map:
${workMapText}

Rules:
- While they work, stay quiet: call skip_turn unless you receive [PAUSE] or [VIOLATION], or they ask you something.
- On [PAUSE]: ask them to predict the next decision for the invoice they are on ("What would you do with the cost center here?"), or explain the relevant step using ${expert}'s own words. Never give the answer before they try.
- On [VIOLATION]: the save was blocked. Say "${expert} would stop here. Why do you think?" Wait for their answer, then explain using ${expert}'s quote, and tell them to fix it and save again.
- When they handle a step correctly on the first try, call record_outcome with that step number and "mastered". After a violation on a step, call record_outcome with "practice".
- Keep every turn under 25 words.`

export const violationMessage = ({ expert, invoice, action, guardrail }) =>
  `[VIOLATION] The learner tried to ${action} ${invoice.id}, but guardrail "${guardrail.rule}" (step ${guardrail.stepN}) applies. ${expert} said: "${guardrail.quote || ''}". The save was blocked.`
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run tests/prompts.test.js`

- [ ] **Step 5: `client/src/agent/useAgent.js`**
```js
import { useConversation } from '@elevenlabs/react'
import { api } from '../lib/api.js'

export function useAgent({ onUtterance }) {
  const conversation = useConversation({
    onMessage: ({ source, message }) => onUtterance({ speaker: source === 'ai' ? 'agent' : 'user', text: message }),
    onError: e => console.error('agent error', e),
  })

  async function start({ role, prompt, firstMessage, clientTools }) {
    await navigator.mediaDevices.getUserMedia({ audio: true })
    const { signedUrl } = await api.signedUrl(role)
    await conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      overrides: { agent: { prompt: { prompt }, firstMessage } },
      clientTools,
    })
  }

  return { ...conversation, start }
}
```

- [ ] **Step 6: Full `client/src/capture/CapturePage.jsx`**
```jsx
import { useRef, useState } from 'react'
import { useWatch, describeEvent } from '../session/useWatch.js'
import { useAgent } from '../agent/useAgent.js'
import { interviewerPrompt } from '../agent/prompts.js'
import { fmtTime } from '../lib/format.js'

export default function CapturePage() {
  const [expert, setExpert] = useState('Sabine')
  const [error, setError] = useState('')
  const watchRef = useRef(null)
  const agent = useAgent({ onUtterance: u => watchRef.current?.addUtterance(u.speaker === 'agent' ? 'agent' : 'expert', u.text) })
  const watch = useWatch({ mode: 'capture', expert, agent })
  watchRef.current = watch
  const questions = watch.transcript.filter(u => u.speaker === 'agent' && u.text.includes('?')).length

  async function start() {
    try {
      await watch.start()
      await agent.start({
        role: 'interviewer',
        prompt: interviewerPrompt(expert),
        firstMessage: `Hi ${expert}, I'll watch quietly and ask a few questions when you pause. Go ahead whenever you're ready.`,
      })
    } catch (e) { setError(e.message) }
  }

  async function done() {
    await agent.endSession()
    watch.stop()
    window.location.href = `/map?session=${watch.sessionId}`
  }

  return (
    <main className="panel">
      <h1>Capture</h1>
      {!watch.sessionId ? (
        <>
          <label>Expert name <input value={expert} onChange={e => setExpert(e.target.value)} /></label>
          <button className="primary" onClick={start}>Start — share the ERP window</button>
        </>
      ) : (
        <>
          <p>
            <span className="badge">{agent.status}</span>{' '}
            {agent.isSpeaking ? <span className="badge">apprentice speaking</span> : <span className="muted">listening</span>}{' '}
            <span className="muted">· {questions} questions asked</span>{' '}
            {watch.offRecord && <span className="badge off">off the record</span>}
          </p>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={watch.toggleOffRecord}>{watch.offRecord ? 'Back on the record' : 'Go off the record'}</button>
            <button className="primary" onClick={done}>Task done → debrief</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <h3>Conversation</h3>
      <div className="feed">{watch.transcript.map((u, i) => <p key={i} className={u.offRecord ? 'muted' : ''}><b>{u.speaker === 'agent' ? 'Apprentice' : expert}:</b> {u.text}</p>)}</div>
      <h3>Screen events</h3>
      <div className="feed">{watch.events.map((e, i) => <p key={i}><span className="muted">{fmtTime(e.t)}</span> {describeEvent(e)}</p>)}</div>
    </main>
  )
}
```

- [ ] **Step 7: Manual check (the Capture requirement)** — run the 3-invoice script while talking. Pass when: the agent stays silent while you type or narrate; asks ≥ 3 questions, each after a pause and about something on screen; ≥ 1 is about a guardrail. Tuning knobs, in order: interviewer prompt wording; `quietMs` (4000 → 5000 if it cuts in); agent turn eagerness in the dashboard.

- [ ] **Step 8: Commit**
```bash
git add -A && git commit -m "feat: interviewer voice agent with pause-timed questions"
```

---

### Task 6: Debrief, teach-back, Work Map view

**Files:**
- Create: `client/src/map/MapPage.jsx`, `client/src/map/WorkMapView.jsx`
- Modify: `client/src/App.jsx` (add `/map`), `client/src/app.css` (append Work Map styles)

**Interfaces:**
- Consumes: `api.synthesize`, `api.finalize`, `api.latestWorkMap`, `api.saveWorkMap`, `useAgent`, `debriefPrompt`, `fmtTime`.
- Produces: `<WorkMapView workMap onChange? />` — omitting `onChange` hides the remove buttons (read-only). Teach does not use it; it renders the guardrail frame directly.

- [ ] **Step 1: `client/src/map/WorkMapView.jsx`**
```jsx
import { useState } from 'react'
import { fmtTime } from '../lib/format.js'

export function WorkMapView({ workMap: wm, onChange }) {
  const [sel, setSel] = useState(wm.steps[0]?.n)
  const step = wm.steps.find(s => s.n === sel)
  const guards = wm.guardrails.filter(g => g.stepN === sel)
  const judgment = wm.steps.filter(s => s.reason?.quote).length

  function removeStep(n) {
    onChange({ ...wm, steps: wm.steps.filter(s => s.n !== n), guardrails: wm.guardrails.filter(g => g.stepN !== n) })
    setSel(wm.steps.find(s => s.n !== n)?.n)
  }
  const removeGuardrail = id => onChange({ ...wm, guardrails: wm.guardrails.filter(g => g.id !== id) })

  return (
    <div className="workmap">
      <header>
        <h1>{wm.task}</h1>
        <p className="muted">{wm.steps.length} steps · {judgment} with reasons · {wm.guardrails.length} guardrails · expert {wm.expert} · confirmed {new Date(wm.confirmedAt).toLocaleString()}</p>
      </header>
      <ol className="timeline">
        {wm.steps.map(s => (
          <li key={s.n} className={s.n === sel ? 'active' : ''} onClick={() => setSel(s.n)}>
            <span className="muted">{fmtTime(s.t)}</span> {s.n}. {s.title} {wm.guardrails.some(g => g.stepN === s.n) && '⚑'}
          </li>
        ))}
      </ol>
      {step && (
        <section className="step">
          {step.frame && <img src={`/frames/${wm.sessionId}/${step.frame}`} alt={`Screen at ${fmtTime(step.t)}`} />}
          <div>
            <h2>Step {step.n} of {wm.steps.length}: {step.title}</h2>
            <dl>
              <dt>Screen moment</dt><dd>{fmtTime(step.t)}</dd>
              <dt>Decision</dt><dd>{step.decision}</dd>
              <dt>Reason</dt>
              <dd>{step.reason?.quote
                ? <>“{step.reason.quote}” — {wm.expert}, {step.reason.source === 'live' ? 'live question' : 'debrief'} at {fmtTime(step.reason.t)}</>
                : <em>no reason recorded</em>}</dd>
            </dl>
            <h3>Guardrails</h3>
            {guards.length ? (
              <ul>{guards.map(g => (
                <li key={g.id}>
                  <span className="badge">{g.kind.replace(/_/g, ' ')}</span> {g.rule} {g.quote && <q>{g.quote}</q>}
                  {onChange && <button className="danger" onClick={() => removeGuardrail(g.id)}>Remove</button>}
                </li>
              ))}</ul>
            ) : <p className="muted">None for this step.</p>}
            {onChange && <button className="danger" onClick={() => removeStep(step.n)}>Remove step from the record</button>}
          </div>
        </section>
      )}
    </div>
  )
}
```

Append to `client/src/app.css`:
```css
.workmap { padding: 1.5rem; }
.timeline { display: flex; gap: .5rem; list-style: none; padding: 0; overflow-x: auto; }
.timeline li { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: .5rem .75rem; cursor: pointer; white-space: nowrap; }
.timeline li.active { border-color: var(--accent); background: #e6efe9; }
.step { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 1.5rem; margin-top: 1rem; }
.step img { width: 100%; border: 1px solid var(--line); border-radius: 8px; }
.step dl { display: grid; grid-template-columns: 130px 1fr; gap: .5rem; }
.step dt { color: var(--muted); }
.step dd { margin: 0; }
.step li { margin-bottom: .5rem; }
```

- [ ] **Step 2: `client/src/map/MapPage.jsx`**
```jsx
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useAgent } from '../agent/useAgent.js'
import { debriefPrompt } from '../agent/prompts.js'
import { WorkMapView } from './WorkMapView.jsx'

export default function MapPage() {
  const sessionId = new URLSearchParams(window.location.search).get('session')
  const [phase, setPhase] = useState('loading') // loading | empty | ready | synth | debrief | finalizing | done | error
  const [wm, setWm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answered, setAnswered] = useState([])
  const [lines, setLines] = useState([])
  const [error, setError] = useState('')
  const st = useRef({ startedAt: 0, lines: [], answered: new Set(), questions: [] })

  const agent = useAgent({
    onUtterance: u => {
      st.current.lines.push({ t: (Date.now() - st.current.startedAt) / 1000, speaker: u.speaker === 'agent' ? 'agent' : 'expert', text: u.text })
      setLines([...st.current.lines])
    },
  })

  useEffect(() => {
    api.latestWorkMap().then(w => {
      if (w && (!sessionId || w.sessionId === sessionId)) { setWm(w); setPhase('done') }
      else setPhase(sessionId ? 'ready' : 'empty')
    })
  }, [])

  async function finish() {
    setPhase('finalizing')
    setTimeout(() => agent.endSession(), 5000)
    try {
      setWm(await api.finalize(sessionId, { debrief: st.current.lines }))
      setPhase('done')
    } catch (e) { setError(e.message); setPhase('error') }
  }

  async function startDebrief() {
    setPhase('synth')
    try {
      const [{ workMap: draft, openQuestions }, session] = await Promise.all([api.synthesize(sessionId), api.getSession(sessionId)])
      st.current.questions = openQuestions
      setQuestions(openQuestions)
      st.current.startedAt = Date.now()
      await agent.start({
        role: 'interviewer',
        prompt: debriefPrompt({ expert: session.expert, draft, questions: openQuestions }),
        firstMessage: `Thanks, ${session.expert}. I have ${openQuestions.length} questions about things I couldn't see, then I'll explain it back to you.`,
        clientTools: {
          mark_answered: ({ index }) => {
            st.current.answered.add(Number(index))
            setAnswered([...st.current.answered])
            return 'ok'
          },
          confirm_teachback: () => {
            const missing = st.current.questions.map((_, i) => i + 1).filter(i => !st.current.answered.has(i))
            if (missing.length) return `Not done: question(s) ${missing.join(', ')} are still unanswered. Ask them first.`
            finish()
            return 'Confirmed. Thank the expert in one sentence.'
          },
        },
      })
      setPhase('debrief')
    } catch (e) { setError(e.message); setPhase('error') }
  }

  async function update(next) {
    setWm(next)
    await api.saveWorkMap(next)
  }

  if (phase === 'done') return <WorkMapView workMap={wm} onChange={update} />

  return (
    <main className="panel">
      <h1>Debrief</h1>
      {phase === 'loading' && <p className="muted">Loading…</p>}
      {phase === 'empty' && <p>No Work Map yet. <a href="/capture">Capture a session first.</a></p>}
      {phase === 'ready' && <button className="primary" onClick={startDebrief}>Start debrief</button>}
      {phase === 'synth' && <p className="muted">Reviewing the session and finding gaps…</p>}
      {phase === 'finalizing' && <p className="muted">Teach-back confirmed. Building the Work Map…</p>}
      {phase === 'error' && <p className="error">{error} <button onClick={() => (st.current.lines.length ? finish() : startDebrief())}>Retry</button></p>}
      {questions.length > 0 && (
        <>
          <h3>Open questions</h3>
          <ol>{questions.map((q, i) => <li key={i} className={answered.includes(i + 1) ? 'muted' : ''}>{answered.includes(i + 1) ? '✓ ' : ''}{q}</li>)}</ol>
        </>
      )}
      <div className="feed">{lines.map((l, i) => <p key={i}><b>{l.speaker === 'agent' ? 'Apprentice' : 'Expert'}:</b> {l.text}</p>)}</div>
    </main>
  )
}
```

Add to `client/src/App.jsx`: `import MapPage from './map/MapPage.jsx'` and `'/map': MapPage`.

- [ ] **Step 3: Manual check (the Map requirement)** — after a capture, click **Task done → debrief → Start debrief**. Pass when: ≥ 3 open questions are asked that weren't answered live; the agent gives a teach-back; you correct one detail; it restates; you confirm; the Work Map renders with steps that have frames, quotes with "live"/"debrief" sources, and guardrails. Open `server/data/workmap-latest.json` and confirm the capex guardrail has a `check`.

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat: spoken debrief with teach-back and clickable work map"
```

---

### Task 7: Tutor with pre-save veto, replay and mastery

**Files:**
- Create: `client/src/teach/TeachPage.jsx`
- Modify: `client/src/App.jsx` (add `/teach`)

**Interfaces:**
- Consumes: `useWatch` (`onBusMessage`), `useAgent`, `tutorPrompt`, `formatWorkMap`, `violationMessage`, `checkGuardrails`, `api.latestWorkMap`, bus messages `save_attempt` / `save_verdict`.

- [ ] **Step 1: `client/src/teach/TeachPage.jsx`**
```jsx
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useWatch, describeEvent } from '../session/useWatch.js'
import { useAgent } from '../agent/useAgent.js'
import { tutorPrompt, formatWorkMap, violationMessage } from '../agent/prompts.js'
import { checkGuardrails } from '../lib/guardrails.js'
import { fmtTime } from '../lib/format.js'

export default function TeachPage() {
  const [wm, setWm] = useState(null)
  const [replay, setReplay] = useState(null)
  const [outcomes, setOutcomes] = useState({})
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const wmRef = useRef(null)
  const watchRef = useRef(null)

  useEffect(() => { api.latestWorkMap().then(w => { setWm(w); wmRef.current = w }) }, [])

  const agent = useAgent({ onUtterance: u => watchRef.current?.addUtterance(u.speaker === 'agent' ? 'agent' : 'learner', u.text) })

  const watch = useWatch({
    mode: 'teach',
    expert: wm?.expert,
    agent,
    onBusMessage: (msg, bus) => {
      if (msg.type !== 'save_attempt' || !wmRef.current) return
      const w = wmRef.current
      const [g] = checkGuardrails(msg.invoice, msg.action, w.guardrails)
      if (!g) { bus.post({ type: 'save_verdict', id: msg.invoice.id, ok: true }); return }
      bus.post({ type: 'save_verdict', id: msg.invoice.id, ok: false, reason: g.rule })
      setReplay(g)
      setOutcomes(o => ({ ...o, [g.stepN]: 'practice' }))
      if (agent.status === 'connected') agent.sendUserMessage(violationMessage({ expert: w.expert, invoice: msg.invoice, action: msg.action, guardrail: g }))
    },
  })
  watchRef.current = watch

  async function start() {
    try {
      await watch.start()
      await agent.start({
        role: 'tutor',
        prompt: tutorPrompt({ expert: wm.expert, workMapText: formatWorkMap(wm) }),
        firstMessage: `Hi! I'll coach you through this the way ${wm.expert} does it. Open the first invoice whenever you're ready.`,
        clientTools: {
          record_outcome: ({ step, result }) => {
            setOutcomes(o => ({ ...o, [step]: o[step] === 'practice' ? 'practice' : result }))
            return 'ok'
          },
        },
      })
    } catch (e) { setError(e.message) }
  }

  async function end() {
    await agent.endSession()
    watch.stop()
    setFinished(true)
  }

  if (!wm) return <main className="panel"><p>No Work Map yet. <a href="/capture">Capture</a> and <a href="/map">debrief</a> first.</p></main>

  if (finished) {
    const label = { mastered: 'Mastered', practice: 'Practice next' }
    return (
      <main className="panel">
        <h1>Your progress</h1>
        <ul>{wm.steps.map(s => <li key={s.n}><b>{label[outcomes[s.n]] || 'Not practiced yet'}</b> — Step {s.n}: {s.title}</li>)}</ul>
      </main>
    )
  }

  return (
    <main className="panel">
      <h1>Teach — learning from {wm.expert}</h1>
      {!watch.sessionId
        ? <button className="primary" onClick={start}>Start — share the training ERP window</button>
        : <p><span className="badge">{agent.status}</span> {agent.isSpeaking && <span className="badge">tutor speaking</span>} <button onClick={end}>Finish session</button></p>}
      {error && <p className="error">{error}</p>}
      {replay && (
        <section>
          <h3>{wm.expert} at this moment ({fmtTime(wm.steps.find(s => s.n === replay.stepN)?.t)})</h3>
          {replay.frame && <img style={{ width: '100%', borderRadius: 8 }} src={`/frames/${wm.sessionId}/${replay.frame}`} alt={`${wm.expert}'s screen`} />}
          <p><span className="badge">{replay.kind.replace(/_/g, ' ')}</span> {replay.rule}</p>
          {replay.quote && <p><q>{replay.quote}</q> — {wm.expert}</p>}
          <button onClick={() => setReplay(null)}>Close</button>
        </section>
      )}
      <h3>Conversation</h3>
      <div className="feed">{watch.transcript.map((u, i) => <p key={i}><b>{u.speaker === 'agent' ? 'Tutor' : 'You'}:</b> {u.text}</p>)}</div>
      <h3>Screen events</h3>
      <div className="feed">{watch.events.map((e, i) => <p key={i}><span className="muted">{fmtTime(e.t)}</span> {describeEvent(e)}</p>)}</div>
    </main>
  )
}
```

Add to `client/src/App.jsx`: `import TeachPage from './teach/TeachPage.jsx'` and `'/teach': TeachPage`.

- [ ] **Step 2: Manual check (the Teach requirement)** — Window A: `/erp?mode=teach`; Window B: `/teach` → Start. Open INV-5120, leave 4711, click Approve. Pass when: ERP shows "Held by tutor: …"; the tutor says "Sabine would stop here. Why do you think?"; Sabine's frame + quote appear; after recoding to 0400 (+ asset number if that guardrail exists) Approve succeeds; Finish shows mastered/practice.
  If the Work Map lacks a `check` for the capex rule, re-run finalize (Retry on `/map` after deleting `workmap-latest.json`) or tighten the FINALIZE_SYSTEM example; do **not** hand-write checks into the demo map.

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "feat: tutor with pre-save guardrail veto, replay, mastery summary"
```

---

### Task 8: Rehearsal, README, demo assets

**Files:**
- Create: `README.md`, `docs/demo-script.md`

- [ ] **Step 1: Full rehearsal on fresh data** — `rm -rf server/data`, then run the judge script end to end twice: capture (3 invoices, talking) → debrief (correct one detail) → teach (INV-5120 wrong code). Fix only what breaks. Run `npm test` — all PASS.

- [ ] **Step 2: `docs/demo-script.md`** — the exact spoken lines and clicks, mapped to the five Apprentice Test questions:
  1. When to ask — point at the pause badge + `[PAUSE]` logic; type while it stays silent.
  2. What to ask — show it asked about the recode, not about visible fields.
  3. When understood — open-question checklist turns green; teach-back confirmed.
  4. New hire learned — INV-5120 veto + replay + mastery screen.
  5. Trust — go off the record mid-task (sampling stops, lines greyed, excluded from map); delete a step; IBAN/email tokenization.

- [ ] **Step 3: `README.md`** — what it is, architecture diagram (copy from spec), setup (`cp .env.example .env`, agent config from Task 0, `npm i`, `npm run dev`), demo steps, and the moonshot: *living company memory* — each Work Map is versioned; when new sessions show steps that differ from the map, the always-on apprentice asks only about the difference; the same machine-checkable guardrails let agents take routine steps and stop where the expert would.

- [ ] **Step 4: Record the demo video** (screen + voice, ≤ the hackathon limit) and make the single moonshot slide.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "docs: README, demo script"
```

---

## Cuts (in this order, if behind schedule)

1. Mastery summary → plain list of steps with a ✓ for each violation-free step (drop `record_outcome`).
2. Delete step / guardrail buttons → keep off-the-record only for the trust story.
3. Diff gate → fixed 2 s interval (set `threshold: 0`).
4. Live question count / speaking badges in the side panel.

Never cut: pause-timed live questions, debrief with confirmed teach-back, pre-save veto with expert quote + frame.

## Time budget

| Task | Est. | Cumulative |
|---|---|---|
| 0 + 1 | 1:00 | 1:00 |
| 2 | 0:30 | 1:30 |
| 3 | 1:30 | 3:00 |
| 4 | 1:00 | 4:00 |
| 5 | 1:30 | 5:30 |
| 6 | 1:45 | 7:15 |
| 7 | 1:30 | 8:45 |
| 8 | 2:00 | 10:45 |
| buffer | 1:00 | 11:45 |
