function fieldValue(invoice, action, field) {
  switch (field) {
    case 'month': return Number(invoice.date.slice(5, 7))
    case 'action': return action
    case 'cost_center': return invoice.costCenter
    case 'asset_no': return invoice.assetNo
    default: return invoice[field]
  }
}

const norm = (field, x) => {
  const t = String(x).trim().toLowerCase()
  return field === 'cost_center' ? t.padStart(4, '0') : t
}

export function evalCond(invoice, action, { field, op, value }) {
  const v = fieldValue(invoice, action, field)
  switch (op) {
    case '>': return Number(v) > Number(value)
    case '<': return Number(v) < Number(value)
    case '==': return norm(field, v) === norm(field, value)
    case '!=': return norm(field, v) !== norm(field, value)
    case 'in': return Array.isArray(value) && value.map(x => norm(field, x)).includes(norm(field, v))
    case 'empty': return !v
    case 'not_empty': return !!v
    default: return false
  }
}

export function checkGuardrails(invoice, action, guardrails) {
  return guardrails.filter(g =>
    g.check &&
    Array.isArray(g.check.when) &&
    g.check.require && typeof g.check.require === 'object' &&
    g.check.when.every(c => evalCond(invoice, action, c)) &&
    !evalCond(invoice, action, g.check.require))
}
