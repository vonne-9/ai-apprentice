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
    finalize: async args => { calls.final = args; return { workMap: { task: 'AP', steps: [{ n: 1, t: 1, title: 'Code', decision: 'capex', reason: { quote: 'over 5k', source: 'live', t: 2 } }, { n: 2, t: 2, title: 'Check', decision: 'ok', reason: { quote: 'invented line', source: 'live', t: 2 } }], guardrails: [{ id: 'g1', stepN: 1, rule: 'r', kind: 'limit', quote: 'always capex', t: 2 }, { id: 'g2', stepN: 1, rule: 'r2', kind: 'limit', quote: 'never said', t: 2 }] } } },
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
  it('keeps events inside off-record ranges away from synthesis', async () => {
    const s = await session()
    await request(app).post(`/api/sessions/${s.id}/frame`).send({ t: 3.2, prev: null, curr: JPEG })
    await request(app).post(`/api/sessions/${s.id}/frame`).send({ t: 9, prev: null, curr: JPEG })
    await request(app).post(`/api/sessions/${s.id}/offrecord`).send({ t0: 3, t1: 4 })
    await request(app).post(`/api/sessions/${s.id}/synthesize`)
    expect(calls.synth.events.map(e => e.t)).toEqual([9])
  })
  it('finalizes into the latest work map with frames and expert', async () => {
    const s = await session()
    await request(app).post(`/api/sessions/${s.id}/frame`).send({ t: 0.5, prev: null, curr: JPEG })
    await request(app).post(`/api/sessions/${s.id}/transcript`).send({ utterances: [{ t: 1, speaker: 'expert', text: 'Anything over 5k is capex.' }] })
    await request(app).post(`/api/sessions/${s.id}/synthesize`)
    const res = await request(app).post(`/api/sessions/${s.id}/finalize`).send({ debrief: [{ t: 1, speaker: 'expert', text: 'Yes, always capex. Mail me at max@example.com' }] })
    expect(res.body).toMatchObject({ expert: 'Sabine', sessionId: s.id })
    expect(res.body.steps[0].reason.quote).toBe('over 5k')
    expect(res.body.steps[1].reason.quote).toBe('')
    expect(res.body.guardrails.map(g => g.quote)).toEqual(['always capex', ''])
    expect(calls.final.debrief[0].text).not.toContain('max@example.com')
    expect((await request(app).get(`/api/sessions/${s.id}`)).body.debrief[0].text).not.toContain('max@example.com')
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
