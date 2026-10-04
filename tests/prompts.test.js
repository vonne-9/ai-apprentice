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
