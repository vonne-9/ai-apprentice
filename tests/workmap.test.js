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
