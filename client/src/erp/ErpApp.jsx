import { useEffect, useReducer, useRef, useState } from 'react'
import { erpReducer, initialErpState } from './erpReducer.js'
import { COST_CENTERS } from './seed.js'
import { openBus } from '../lib/bus.js'
import './erp.css'

const STATUS = { approve: 'approved', hold: 'on hold', escalate: 'escalated for 2nd approval' }
const eur = n => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export default function ErpApp() {
  const teach = new URLSearchParams(window.location.search).get('mode') === 'teach'
  const [state, dispatch] = useReducer(erpReducer, teach, initialErpState)
  const [notice, setNotice] = useState(null)
  const busRef = useRef(null)
  const pendingRef = useRef(null)

  function commit({ id, action }) {
    dispatch({ type: 'setStatus', id, status: STATUS[action] })
    setNotice({ text: `${id} ${STATUS[action]}`, held: false })
    pendingRef.current = null
  }

  useEffect(() => {
    const bus = openBus(msg => {
      const p = pendingRef.current
      if (msg.type !== 'save_verdict' || !p || msg.id !== p.id) return
      if (msg.ok) commit(p)
      else { setNotice({ text: `Held by tutor: ${msg.reason}`, held: true }); pendingRef.current = null }
    })
    busRef.current = bus
    const ping = () => bus.post({ type: 'activity', t: Date.now() })
    window.addEventListener('keydown', ping)
    window.addEventListener('mousedown', ping)
    return () => {
      window.removeEventListener('keydown', ping)
      window.removeEventListener('mousedown', ping)
      bus.close()
    }
  }, [])

  const inv = state.invoices.find(i => i.id === state.selectedId)

  function attempt(action) {
    if (!inv) return
    pendingRef.current = { id: inv.id, action }
    busRef.current.post({ type: 'save_attempt', invoice: inv, action })
    if (teach) setNotice({ text: 'Saving…', held: false })
    else setTimeout(() => commit({ id: inv.id, action }), 300)
  }

  const edit = field => e => dispatch({ type: 'edit', id: inv.id, field, value: e.target.value })

  return (
    <div className="erp">
      <aside>
        <h2>Open invoices {teach && <span className="badge">training</span>}</h2>
        {state.invoices.map(i => (
          <div key={i.id} className={`row ${i.id === state.selectedId ? 'sel' : ''}`} onClick={() => { dispatch({ type: 'select', id: i.id }); setNotice(null) }}>
            <b>{i.id}</b> · {eur(i.amount)}<small>{i.supplier} — {i.status}</small>
          </div>
        ))}
      </aside>
      <section className="detail">
        {!inv ? <p className="muted">Select an invoice.</p> : (
          <>
            <h1>Invoice {inv.id}</h1>
            <dl>
              <dt>Supplier</dt><dd>{inv.supplier}</dd>
              <dt>Legal entity</dt><dd>{inv.entity}</dd>
              <dt>Invoice date</dt><dd>{inv.date}</dd>
              <dt>Description</dt><dd>{inv.description}</dd>
              <dt>Category</dt><dd>{inv.category}</dd>
              <dt>Amount</dt><dd>{eur(inv.amount)}</dd>
              <dt>Cost center</dt>
              <dd><select value={inv.costCenter} onChange={edit('costCenter')}>{COST_CENTERS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></dd>
              <dt>Asset number</dt><dd><input value={inv.assetNo} onChange={edit('assetNo')} placeholder="—" /></dd>
              <dt>Status</dt><dd>{inv.status}</dd>
            </dl>
            <div className="actions">
              <button className="primary" onClick={() => attempt('approve')}>Approve</button>
              <button onClick={() => attempt('hold')}>Hold</button>
              <button onClick={() => attempt('escalate')}>Escalate</button>
            </div>
            {notice && <p className={`notice ${notice.held ? 'held' : ''}`}>{notice.text}</p>}
          </>
        )}
      </section>
    </div>
  )
}
