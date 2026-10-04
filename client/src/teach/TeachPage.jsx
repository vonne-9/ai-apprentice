import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useWatch, describeEvent } from '../session/useWatch.js'
import { useAgent } from '../agent/useAgent.js'
import { tutorPrompt, formatWorkMap, violationMessage } from '../agent/prompts.js'
import { checkGuardrails } from '../lib/guardrails.js'
import { fmtTime } from '../lib/format.js'

export default function TeachPage() {
  const [wm, setWm] = useState(null)
  const [replay, setReplay] = useState(null)
  const [outcomes, setOutcomes] = useState({})
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const wmRef = useRef(null)
  const watchRef = useRef(null)

  useEffect(() => { api.latestWorkMap().then(w => { setWm(w); wmRef.current = w }) }, [])

  const agent = useAgent({ onUtterance: u => watchRef.current?.addUtterance(u.speaker === 'agent' ? 'agent' : 'learner', u.text) })

  const watch = useWatch({
    mode: 'teach',
    expert: wm?.expert,
    agent,
    onBusMessage: (msg, bus) => {
      if (msg.type !== 'save_attempt' || !wmRef.current) return
      const w = wmRef.current
      const [g] = checkGuardrails(msg.invoice, msg.action, w.guardrails)
      if (!g) { bus.post({ type: 'save_verdict', id: msg.invoice.id, ok: true }); return }
      bus.post({ type: 'save_verdict', id: msg.invoice.id, ok: false, reason: g.rule })
      setReplay(g)
      setOutcomes(o => ({ ...o, [g.stepN]: 'practice' }))
      if (agent.status === 'connected') agent.sendUserMessage(violationMessage({ expert: w.expert, invoice: msg.invoice, action: msg.action, guardrail: g }))
    },
  })
  watchRef.current = watch

  async function start() {
    try {
      await watch.start()
      await agent.start({
        role: 'tutor',
        prompt: tutorPrompt({ expert: wm.expert, workMapText: formatWorkMap(wm) }),
        firstMessage: `Hi! I'll coach you through this the way ${wm.expert} does it. Open the first invoice whenever you're ready.`,
        clientTools: {
          record_outcome: ({ step, result }) => {
            setOutcomes(o => ({ ...o, [step]: o[step] === 'practice' ? 'practice' : result }))
            return 'ok'
          },
        },
      })
    } catch (e) { setError(e.message) }
  }

  async function end() {
    await agent.endSession()
    watch.stop()
    setFinished(true)
  }

  if (!wm) return <main className="panel"><p>No Work Map yet. <a href="/capture">Capture</a> and <a href="/map">debrief</a> first.</p></main>

  if (finished) {
    const label = { mastered: 'Mastered', practice: 'Practice next' }
    return (
      <main className="panel">
        <h1>Your progress</h1>
        <ul>{wm.steps.map(s => <li key={s.n}><b>{label[outcomes[s.n]] || 'Not practiced yet'}</b> — Step {s.n}: {s.title}</li>)}</ul>
      </main>
    )
  }

  return (
    <main className="panel">
      <h1>Teach — learning from {wm.expert}</h1>
      {!watch.sessionId
        ? <button className="primary" onClick={start}>Start — share the training ERP window</button>
        : <p><span className="badge">{agent.status}</span> {agent.isSpeaking && <span className="badge">tutor speaking</span>} <button onClick={end}>Finish session</button></p>}
      {error && <p className="error">{error}</p>}
      {replay && (
        <section>
          <h3>{wm.expert} at this moment ({fmtTime(wm.steps.find(s => s.n === replay.stepN)?.t)})</h3>
          {replay.frame && <img style={{ width: '100%', borderRadius: 8 }} src={`/frames/${wm.sessionId}/${replay.frame}`} alt={`${wm.expert}'s screen`} />}
          <p><span className="badge">{replay.kind.replace(/_/g, ' ')}</span> {replay.rule}</p>
          {replay.quote && <p><q>{replay.quote}</q> — {wm.expert}</p>}
          <button onClick={() => setReplay(null)}>Close</button>
        </section>
      )}
      <h3>Conversation</h3>
      <div className="feed">{watch.transcript.map((u, i) => <p key={i}><b>{u.speaker === 'agent' ? 'Tutor' : 'You'}:</b> {u.text}</p>)}</div>
      <h3>Screen events</h3>
      <div className="feed">{watch.events.map((e, i) => <p key={i}><span className="muted">{fmtTime(e.t)}</span> {describeEvent(e)}</p>)}</div>
    </main>
  )
}
