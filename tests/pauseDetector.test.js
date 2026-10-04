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
  it('ignores a speaking flag that has been stuck longer than maxSpeakingMs', () => {
    const { d, at } = setup()
    at(0); d.event()
    d.setAgentSpeaking(true)
    at(19000); expect(d.tick()).toBe(false)
    at(21000); expect(d.tick()).toBe(true)
  })
})
