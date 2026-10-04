import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useAgent } from '../agent/useAgent.js'
import { debriefPrompt } from '../agent/prompts.js'
import { WorkMapView } from './WorkMapView.jsx'

export default function MapPage() {
  const sessionId = new URLSearchParams(window.location.search).get('session')
  const [phase, setPhase] = useState('loading') // loading | empty | ready | synth | debrief | finalizing | done | error
  const [wm, setWm] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answered, setAnswered] = useState([])
  const [lines, setLines] = useState([])
  const [error, setError] = useState('')
  const st = useRef({ startedAt: 0, lines: [], answered: new Set(), questions: [] })

  const agent = useAgent({
    onUtterance: u => {
      st.current.lines.push({ t: (Date.now() - st.current.startedAt) / 1000, speaker: u.speaker === 'agent' ? 'agent' : 'expert', text: u.text })
      setLines([...st.current.lines])
    },
  })

  useEffect(() => {
    api.latestWorkMap().then(w => {
      if (w && (!sessionId || w.sessionId === sessionId)) { setWm(w); setPhase('done') }
      else setPhase(sessionId ? 'ready' : 'empty')
    })
  }, [])

  async function finish() {
    setPhase('finalizing')
    setTimeout(() => agent.endSession(), 5000)
    try {
      setWm(await api.finalize(sessionId, { debrief: st.current.lines }))
      setPhase('done')
    } catch (e) { setError(e.message); setPhase('error') }
  }

  async function startDebrief() {
    setPhase('synth')
    try {
      const [{ workMap: draft, openQuestions }, session] = await Promise.all([api.synthesize(sessionId), api.getSession(sessionId)])
      st.current.questions = openQuestions
      setQuestions(openQuestions)
      st.current.startedAt = Date.now()
      await agent.start({
        role: 'interviewer',
        prompt: debriefPrompt({ expert: session.expert, draft, questions: openQuestions }),
        firstMessage: `Thanks, ${session.expert}. I have ${openQuestions.length} questions about things I couldn't see, then I'll explain it back to you.`,
        clientTools: {
          mark_answered: ({ index }) => {
            st.current.answered.add(Number(index))
            setAnswered([...st.current.answered])
            return 'ok'
          },
          confirm_teachback: () => {
            const missing = st.current.questions.map((_, i) => i + 1).filter(i => !st.current.answered.has(i))
            if (missing.length) return `Not done: question(s) ${missing.join(', ')} are still unanswered. Ask them first.`
            finish()
            return 'Confirmed. Thank the expert in one sentence.'
          },
        },
      })
      setPhase('debrief')
    } catch (e) { setError(e.message); setPhase('error') }
  }

  async function update(next) {
    setWm(next)
    await api.saveWorkMap(next)
  }

  if (phase === 'done') return <WorkMapView workMap={wm} onChange={update} />

  return (
    <main className="panel">
      <h1>Debrief</h1>
      {phase === 'loading' && <p className="muted">Loading…</p>}
      {phase === 'empty' && <p>No Work Map yet. <a href="/capture">Capture a session first.</a></p>}
      {phase === 'ready' && <button className="primary" onClick={startDebrief}>Start debrief</button>}
      {phase === 'synth' && <p className="muted">Reviewing the session and finding gaps…</p>}
      {phase === 'finalizing' && <p className="muted">Teach-back confirmed. Building the Work Map…</p>}
      {phase === 'error' && <p className="error">{error} <button onClick={() => (st.current.lines.length ? finish() : startDebrief())}>Retry</button></p>}
      {questions.length > 0 && (
        <>
          <h3>Open questions</h3>
          <ol>{questions.map((q, i) => <li key={i} className={answered.includes(i + 1) ? 'muted' : ''}>{answered.includes(i + 1) ? '✓ ' : ''}{q}</li>)}</ol>
        </>
      )}
      <div className="feed">{lines.map((l, i) => <p key={i}><b>{l.speaker === 'agent' ? 'Apprentice' : 'Expert'}:</b> {l.text}</p>)}</div>
    </main>
  )
}
