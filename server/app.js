import express from 'express'
import { redactDeep } from './pii.js'
import { attachFrames, validateWorkMap, inRanges, verifyQuotes } from './workmap.js'

const withTimeout = async (p, ms) => {
  let timer
  try { return await Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms) })]) }
  finally { clearTimeout(timer) }
}
const expertLines = list => list.filter(u => u.speaker === 'expert').map(u => u.text)

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
      const out = await withTimeout(ai.describeFrameChange({ prevB64: prev, currB64: curr, recentEvents: recent }), 15000)
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
    const events = s.events.filter(e => !inRanges(e.t, s.offRecord))
    const out = await ai.synthesize({ events, transcript })
    const errs = validateWorkMap(out?.workMap)
    if (errs.length) return res.status(502).json({ error: errs.join('; ') })
    out.workMap = verifyQuotes(out.workMap, { live: expertLines(transcript) })
    await store.update(s.id, x => { x.draft = out })
    res.json(out)
  })

  app.post('/api/sessions/:id/finalize', async (req, res) => {
    const s = await store.read(req.params.id)
    if (!s.draft) return res.status(409).json({ error: 'synthesize first' })
    const debrief = redactDeep(req.body.debrief || [])
    await store.update(s.id, x => { x.debrief = debrief })
    const out = await ai.finalize({ draft: s.draft.workMap, debrief })
    const errs = validateWorkMap(out?.workMap)
    if (errs.length) return res.status(502).json({ error: errs.join('; ') })
    const live = expertLines(s.transcript.filter(u => !u.offRecord && !inRanges(u.t, s.offRecord)))
    const verified = verifyQuotes(out.workMap, { live, debrief: expertLines(debrief) })
    const wm = attachFrames({ ...verified, id: `wm-${s.id}`, sessionId: s.id, expert: s.expert, confirmedAt: Date.now() }, s.frames)
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
