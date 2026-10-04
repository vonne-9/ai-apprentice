import { FRAME_SYSTEM, SYNTH_SYSTEM, FINALIZE_SYSTEM } from './prompts.js'

const VISION_MODEL = process.env.VISION_MODEL || 'claude-sonnet-5-5'
const SYNTH_MODEL = process.env.SYNTH_MODEL || 'claude-opus-5-5'

export function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse((fenced ? fenced[1] : text).trim())
}

const image = b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })

export function createAi(client) {
  async function askJson({ model, system, content, maxTokens, extra }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const msg = attempt ? [...content, { type: 'text', text: 'Respond with valid JSON only, no prose.' }] : content
      const res = await client.messages.create({ model, max_tokens: maxTokens, ...extra, system, messages: [{ role: 'user', content: msg }] })
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
      return askJson({ model: VISION_MODEL, system: FRAME_SYSTEM, content, maxTokens: 2000, extra: { output_config: { effort: 'low' } } })
    },
    synthesize({ events, transcript }) {
      const text = `EVENTS:\n${JSON.stringify(events.map(({ frame, ...e }) => e))}\n\nTRANSCRIPT:\n${transcript.map(u => `[t=${u.t.toFixed(1)}] ${u.speaker}: ${u.text}`).join('\n')}`
      return askJson({ model: SYNTH_MODEL, system: SYNTH_SYSTEM, content: [{ type: 'text', text }], maxTokens: 8000, extra: { output_config: { effort: 'medium' } } })
    },
    finalize({ draft, debrief }) {
      const text = `DRAFT:\n${JSON.stringify(draft)}\n\nDEBRIEF:\n${debrief.map(u => `[t=${u.t.toFixed(1)}] ${u.speaker}: ${u.text}`).join('\n')}`
      return askJson({ model: SYNTH_MODEL, system: FINALIZE_SYSTEM, content: [{ type: 'text', text }], maxTokens: 10000, extra: { output_config: { effort: 'medium' } } })
    },
  }
}
