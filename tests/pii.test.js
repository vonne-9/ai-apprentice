import { describe, it, expect } from 'vitest'
import { redact, redactDeep } from '../server/pii.js'

describe('pii', () => {
  it('replaces IBANs and emails but leaves dates, amounts and invoice ids', () => {
    expect(redact('Pay DE89 3704 0044 0532 0130 00 now')).toBe('Pay [IBAN] now')
    expect(redact('mail s.weber@kessler.de')).toBe('mail [EMAIL]')
    expect(redact('INV-4471 on 2026-12-03 for 6850')).toBe('INV-4471 on 2026-12-03 for 6850')
  })
  it('walks nested objects and arrays', () => {
    expect(redactDeep([{ note: 'x@y.com', n: 3 }])).toEqual([{ note: '[EMAIL]', n: 3 }])
  })
})
