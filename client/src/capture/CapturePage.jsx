import { useState } from 'react'
import { useWatch, describeEvent } from '../session/useWatch.js'
import { fmtTime } from '../lib/format.js'

const stubAgent = { status: 'disconnected', isSpeaking: false }

export default function CapturePage() {
  const [expert, setExpert] = useState('Sabine')
  const [error, setError] = useState('')
  const watch = useWatch({ mode: 'capture', expert, agent: stubAgent })

  async function start() {
    try { await watch.start() } catch (e) { setError(e.message) }
  }

  return (
    <main className="panel">
      <h1>Capture</h1>
      {!watch.sessionId ? (
        <>
          <label>Expert name <input value={expert} onChange={e => setExpert(e.target.value)} /></label>
          <button className="primary" onClick={start}>Start — share the ERP window</button>
        </>
      ) : <p className="badge">session {watch.sessionId}</p>}
      {error && <p className="error">{error}</p>}
      <h3>Screen events</h3>
      <div className="feed">{watch.events.map((e, i) => <p key={i}><span className="muted">{fmtTime(e.t)}</span> {describeEvent(e)}</p>)}</div>
    </main>
  )
}
