import { CAPTURE_INVOICES, TEACH_INVOICES } from './seed.js'

export function initialErpState(teach) {
  return { invoices: (teach ? TEACH_INVOICES : CAPTURE_INVOICES).map(i => ({ ...i })), selectedId: null }
}

const patch = (state, id, fields) => ({
  ...state,
  invoices: state.invoices.map(i => (i.id === id ? { ...i, ...fields } : i)),
})

export function erpReducer(state, action) {
  switch (action.type) {
    case 'select': return { ...state, selectedId: action.id }
    case 'edit': return patch(state, action.id, { [action.field]: action.value })
    case 'setStatus': return patch(state, action.id, { status: action.status })
    default: return state
  }
}
