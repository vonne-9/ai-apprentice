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
