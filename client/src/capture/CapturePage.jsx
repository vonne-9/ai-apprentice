import { useRef, useState } from 'react'
import { useWatch, describeEvent } from '../session/useWatch.js'
import { useAgent } from '../agent/useAgent.js'
import { interviewerPrompt } from '../agent/prompts.js'
import { fmtTime } from '../lib/format.js'

export default function CapturePage() {
  const [expert, setExpert] = useState('Sabine')
  const [error, setError] = useState('')
  const watchRef = useRef(null)
  const agent = useAgent({ onUtterance: u => watchRef.current?.addUtterance(u.speaker === 'agent' ? 'agent' : 'expert', u.text) })
  const watch = useWatch({ mode: 'capture', expert, agent })
  watchRef.current = watch
  const questions = watch.transcript.filter(u => u.speaker === 'agent' && u.text.includes('?')).length

  async function start() {
    try {
      await watch.start()
      await agent.start({
        role: 'interviewer',
        prompt: interviewerPrompt(expert),
        firstMessage: `Hi ${expert}, I'll watch quietly and ask a few questions when you pause. Go ahead whenever you're ready.`,
      })
    } catch (e) { setError(e.message) }
  }

  async function done() {
    await agent.endSession()
    watch.stop()
    window.location.href = `/map?session=${watch.sessionId}`
  }

  return (
    <main className="panel">
      <h1>Capture</h1>
      {!watch.sessionId ? (
        <>
          <label>Expert name <input value={expert} onChange={e => setExpert(e.target.value)} /></label>
          <button className="primary" onClick={start}>Start — share the ERP window</button>
        </>
      ) : (
        <>
          <p>
            <span className="badge">{agent.status}</span>{' '}
            {agent.isSpeaking ? <span className="badge">apprentice speaking</span> : <span className="muted">listening</span>}{' '}
            <span className="muted">· {questions} questions asked</span>{' '}
            {watch.offRecord && <span className="badge off">off the record</span>}
          </p>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button onClick={watch.toggleOffRecord}>{watch.offRecord ? 'Back on the record' : 'Go off the record'}</button>
            <button className="primary" onClick={done}>Task done → debrief</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <h3>Conversation</h3>
      <div className="feed">{watch.transcript.map((u, i) => <p key={i} className={u.offRecord ? 'muted' : ''}><b>{u.speaker === 'agent' ? 'Apprentice' : expert}:</b> {u.text}</p>)}</div>
      <h3>Screen events</h3>
      <div className="feed">{watch.events.map((e, i) => <p key={i}><span className="muted">{fmtTime(e.t)}</span> {describeEvent(e)}</p>)}</div>
    </main>
  )
}
