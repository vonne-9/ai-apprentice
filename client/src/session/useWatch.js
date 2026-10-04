import { useEffect, useRef, useState } from 'react'
import { openBus } from '../lib/bus.js'
import { ScreenSampler } from '../lib/ScreenSampler.js'
import { createPauseDetector } from '../lib/pauseDetector.js'
import { api } from '../lib/api.js'

export function describeEvent(e) {
  return [e.kind, e.invoice, e.field && `${e.field}: ${e.from ?? '?'} → ${e.to ?? '?'}`, e.note].filter(Boolean).join(' · ')
}

// Shared by Capture and Teach: session, screen sampling, pause detection, transcript, off-record.
export function useWatch({ mode, expert, agent, onBusMessage }) {
  const [sessionId, setSessionId] = useState(null)
  const [events, setEvents] = useState([])
  const [transcript, setTranscript] = useState([])
  const [offRecord, setOffRecord] = useState(false)
  const r = useRef({ startedAt: Date.now(), sampler: null, detector: createPauseDetector(), offSince: null, sessionId: null, recent: [] })
  const agentRef = useRef(agent)
  agentRef.current = agent
  const onBusRef = useRef(onBusMessage)
  onBusRef.current = onBusMessage
  const elapsed = () => (Date.now() - r.current.startedAt) / 1000

  useEffect(() => {
    const bus = openBus(msg => {
      if (msg.type === 'activity') {
        r.current.detector.activity()
        if (agentRef.current.status === 'connected') agentRef.current.sendUserActivity()
      }
      onBusRef.current?.(msg, bus)
    })
    return () => bus.close()
  }, [])

  useEffect(() => { r.current.detector.setAgentSpeaking(!!agent.isSpeaking) }, [agent.isSpeaking])

  useEffect(() => {
    if (!sessionId) return
    const id = setInterval(() => {
      const a = agentRef.current
      if (r.current.offSince != null || a.status !== 'connected') return
      if (r.current.detector.tick()) {
        const recent = r.current.recent.slice(-3).map(describeEvent).join('; ')
        a.sendUserMessage(`[PAUSE] The ${mode === 'teach' ? 'learner' : 'expert'} has paused. Recent screen events: ${recent}`)
      }
    }, 500)
    return () => clearInterval(id)
  }, [sessionId])

  async function start() {
    const s = await api.createSession(mode, expert)
    Object.assign(r.current, { sessionId: s.id, startedAt: Date.now(), recent: [] })
    const sampler = new ScreenSampler({
      onFrame: async ({ prev, curr }) => {
        const { events: evs } = await api.postFrame(s.id, { t: elapsed(), prev, curr })
        if (r.current.offSince != null) return // went off the record while the frame was in flight
        for (const e of evs) {
          r.current.recent.push(e)
          r.current.detector.event()
          if (agentRef.current.status === 'connected') agentRef.current.sendContextualUpdate(`[EVENT t=${Math.round(e.t)}s] ${describeEvent(e)}`)
        }
        if (evs.length) setEvents(prev => [...prev, ...evs])
      },
    })
    await sampler.start()
    r.current.sampler = sampler
    setSessionId(s.id)
    return s.id
  }

  function addUtterance(speaker, text) {
    if (speaker !== 'agent') r.current.detector.activity()
    const u = { t: elapsed(), speaker, text, offRecord: r.current.offSince != null }
    setTranscript(prev => [...prev, u])
    if (r.current.sessionId) api.postTranscript(r.current.sessionId, [u]).catch(console.error)
  }

  async function toggleOffRecord() {
    const a = agentRef.current
    const live = a.status === 'connected'
    if (r.current.offSince == null) {
      r.current.offSince = elapsed()
      r.current.sampler?.pause(true)
      if (live) a.sendContextualUpdate('[OFF RECORD] Do not ask about or remember anything until [ON RECORD].')
      setOffRecord(true)
    } else {
      const t0 = r.current.offSince
      r.current.offSince = null
      r.current.sampler?.pause(false)
      if (live) a.sendContextualUpdate('[ON RECORD]')
      setOffRecord(false)
      await api.postOffRecord(r.current.sessionId, { t0, t1: elapsed() })
    }
  }

  function stop() {
    r.current.sampler?.stop()
    r.current.sampler = null
  }

  return { sessionId, events, transcript, offRecord, start, stop, addUtterance, toggleOffRecord }
}
