import { describe, it, expect } from 'vitest'
import { nearestFrame, attachFrames, validateWorkMap, inRanges, verifyQuotes } from '../server/workmap.js'

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
  it('blanks quotes that are not verbatim in their source', () => {
    const wm = {
      steps: [
        { n: 1, reason: { quote: 'Over 5k, always capex!', source: 'live' } },
        { n: 2, reason: { quote: 'made up line', source: 'live' } },
        { n: 3, reason: { quote: 'only said in debrief', source: 'live' } },
        { n: 4 },
      ],
      guardrails: [
        { id: 'g1', quote: 'only said in the debrief' },
        { id: 'g2', quote: 'invented' },
      ],
    }
    const out = verifyQuotes(wm, { live: ['over 5k,  ALWAYS capex'], debrief: ['Yes, only said in the   debrief.'] })
    expect(out.steps.map(s => s.reason?.quote)).toEqual(['Over 5k, always capex!', '', '', undefined])
    expect(out.guardrails.map(g => g.quote)).toEqual(['only said in the debrief', ''])
    expect(wm.steps[1].reason.quote).toBe('made up line')
  })
  it('keeps debrief-sourced step quotes only when said in the debrief', () => {
    const wm = { steps: [{ n: 1, reason: { quote: 'said live', source: 'debrief' } }], guardrails: [] }
    expect(verifyQuotes(wm, { live: ['said live'], debrief: [] }).steps[0].reason.quote).toBe('')
  })
})
