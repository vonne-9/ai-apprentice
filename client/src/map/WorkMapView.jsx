import { useState } from 'react'
import { fmtTime } from '../lib/format.js'

export function WorkMapView({ workMap: wm, onChange }) {
  const [sel, setSel] = useState(wm.steps[0]?.n)
  const step = wm.steps.find(s => s.n === sel)
  const guards = wm.guardrails.filter(g => g.stepN === sel)
  const judgment = wm.steps.filter(s => s.reason?.quote).length

  function removeStep(n) {
    onChange({ ...wm, steps: wm.steps.filter(s => s.n !== n), guardrails: wm.guardrails.filter(g => g.stepN !== n) })
    setSel(wm.steps.find(s => s.n !== n)?.n)
  }
  const removeGuardrail = id => onChange({ ...wm, guardrails: wm.guardrails.filter(g => g.id !== id) })

  return (
    <div className="workmap">
      <header>
        <h1>{wm.task}</h1>
        <p className="muted">{wm.steps.length} steps · {judgment} with reasons · {wm.guardrails.length} guardrails · expert {wm.expert} · confirmed {new Date(wm.confirmedAt).toLocaleString()}</p>
      </header>
      <ol className="timeline">
        {wm.steps.map(s => (
          <li key={s.n} className={s.n === sel ? 'active' : ''} onClick={() => setSel(s.n)}>
            <span className="muted">{fmtTime(s.t)}</span> {s.n}. {s.title} {wm.guardrails.some(g => g.stepN === s.n) && '⚑'}
          </li>
        ))}
      </ol>
      {step && (
        <section className="step">
          {step.frame && <img src={`/frames/${wm.sessionId}/${step.frame}`} alt={`Screen at ${fmtTime(step.t)}`} />}
          <div>
            <h2>Step {step.n} of {wm.steps.length}: {step.title}</h2>
            <dl>
              <dt>Screen moment</dt><dd>{fmtTime(step.t)}</dd>
              <dt>Decision</dt><dd>{step.decision}</dd>
              <dt>Reason</dt>
              <dd>{step.reason?.quote
                ? <>"{step.reason.quote}" — {wm.expert}, {step.reason.source === 'live' ? 'live question' : 'debrief'} at {fmtTime(step.reason.t)}</>
                : <em>no reason recorded</em>}</dd>
            </dl>
            <h3>Guardrails</h3>
            {guards.length ? (
              <ul>{guards.map(g => (
                <li key={g.id}>
                  <span className="badge">{g.kind.replace(/_/g, ' ')}</span> {g.rule} {g.quote && <q>{g.quote}</q>}
                  {onChange && <button className="danger" onClick={() => removeGuardrail(g.id)}>Remove</button>}
                </li>
              ))}</ul>
            ) : <p className="muted">None for this step.</p>}
            {onChange && <button className="danger" onClick={() => removeStep(step.n)}>Remove step from the record</button>}
          </div>
        </section>
      )}
    </div>
  )
}
