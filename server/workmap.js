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
