import { describe, it, expect } from 'vitest'
import { checkGuardrails, evalCond } from '../client/src/lib/guardrails.js'

const capex = {
  id: 'g1', stepN: 4, rule: 'Equipment over €5,000 is capex', kind: 'limit',
  check: {
    when: [
      { field: 'amount', op: '>', value: 5000 },
      { field: 'category', op: '==', value: 'equipment' },
      { field: 'action', op: '==', value: 'approve' },
    ],
    require: { field: 'cost_center', op: '==', value: '0400' },
  },
}
const asset = {
  id: 'g2', stepN: 4, rule: 'No asset number, no capex booking', kind: 'limit',
  check: { when: [{ field: 'cost_center', op: '==', value: '0400' }, { field: 'action', op: '==', value: 'approve' }], require: { field: 'asset_no', op: 'not_empty' } },
}
const prose = { id: 'g3', stepN: 2, rule: 'Unknown supplier: ask the controller', kind: 'stop_and_ask' }
const press = { id: 'INV-5120', supplier: 'Kessler', amount: 7200, date: '2026-12-09', category: 'equipment', costCenter: '4711', assetNo: '' }

describe('guardrails', () => {
  it('flags capex violation on approve with opex code', () => {
    expect(checkGuardrails(press, 'approve', [capex, asset, prose]).map(g => g.id)).toEqual(['g1'])
  })
  it('flags missing asset number once recoded to capex', () => {
    expect(checkGuardrails({ ...press, costCenter: '0400' }, 'approve', [capex, asset]).map(g => g.id)).toEqual(['g2'])
  })
  it('passes a correct booking and ignores guardrails without checks', () => {
    expect(checkGuardrails({ ...press, costCenter: '0400', assetNo: 'A-1' }, 'approve', [capex, asset, prose])).toEqual([])
  })
  it('does not fire when the action does not match', () => {
    expect(checkGuardrails(press, 'hold', [capex])).toEqual([])
  })
  it('supports month, in, empty and !=', () => {
    expect(evalCond(press, 'approve', { field: 'month', op: '==', value: 12 })).toBe(true)
    expect(evalCond(press, 'approve', { field: 'supplier', op: 'in', value: ['Kessler', 'Brandt'] })).toBe(true)
    expect(evalCond(press, 'approve', { field: 'asset_no', op: 'empty' })).toBe(true)
    expect(evalCond(press, 'approve', { field: 'cost_center', op: '!=', value: '0400' })).toBe(true)
  })
  it('skips guardrails with malformed checks instead of throwing', () => {
    const noRequire = { id: 'b1', stepN: 1, rule: 'x', kind: 'limit', check: { when: [{ field: 'amount', op: '>', value: 1 }] } }
    const noWhen = { id: 'b2', stepN: 1, rule: 'y', kind: 'limit', check: { require: { field: 'asset_no', op: 'not_empty' } } }
    const badTypes = { id: 'b3', stepN: 1, rule: 'z', kind: 'limit', check: { when: 'amount', require: 'x' } }
    expect(checkGuardrails(press, 'approve', [noRequire, noWhen, badTypes, capex]).map(g => g.id)).toEqual(['g1'])
  })
})
