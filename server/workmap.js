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

const norm = s => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

// Blank any quote that the expert did not actually say (verbatim, ignoring case/punctuation/whitespace).
// live/debrief: arrays of expert utterance texts; omit one to skip that source.
export function verifyQuotes(workMap, { live, debrief }) {
  const hay = { live: live && ` ${norm(live.join(' '))} `, debrief: debrief && ` ${norm(debrief.join(' '))} ` }
  const ok = (quote, source) => {
    if (!quote) return true
    const q = ` ${norm(quote)} `
    const srcs = source === 'live' || source === 'debrief' ? [source] : ['live', 'debrief']
    return srcs.some(k => hay[k] && hay[k].includes(q))
  }
  return {
    ...workMap,
    steps: workMap.steps.map(s => (s.reason ? { ...s, reason: { ...s.reason, quote: ok(s.reason.quote, s.reason.source) ? s.reason.quote : '' } } : s)),
    guardrails: workMap.guardrails.map(g => ({ ...g, quote: ok(g.quote) ? g.quote : '' })),
  }
}
