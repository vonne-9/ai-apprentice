import { describe, it, expect } from 'vitest'
import { erpReducer, initialErpState } from '../client/src/erp/erpReducer.js'
import { CAPTURE_INVOICES, TEACH_INVOICES } from '../client/src/erp/seed.js'

describe('erpReducer', () => {
  it('seeds capture vs teach invoices as independent copies', () => {
    const s = initialErpState(false)
    expect(s.invoices.map(i => i.id)).toEqual(['INV-4471', 'INV-4472', 'INV-4473'])
    s.invoices[0].costCenter = 'x'
    expect(CAPTURE_INVOICES[0].costCenter).toBe('4711')
    expect(initialErpState(true).invoices[0]).toMatchObject({ id: 'INV-5120', amount: 7200 })
    expect(TEACH_INVOICES).toHaveLength(1)
  })
  it('selects, edits a field, and sets status', () => {
    let s = initialErpState(false)
    s = erpReducer(s, { type: 'select', id: 'INV-4471' })
    s = erpReducer(s, { type: 'edit', id: 'INV-4471', field: 'costCenter', value: '0400' })
    s = erpReducer(s, { type: 'setStatus', id: 'INV-4471', status: 'approved' })
    expect(s.selectedId).toBe('INV-4471')
    expect(s.invoices[0]).toMatchObject({ costCenter: '0400', status: 'approved' })
    expect(s.invoices[1].status).toBe('open')
  })
})
