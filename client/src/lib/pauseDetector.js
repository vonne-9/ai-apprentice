// Decides when the worker has paused long enough for the agent to ask one question.
export function createPauseDetector({ quietMs = 4000, eventCooldownMs = 3000, now = () => Date.now() } = {}) {
  let lastActivity = now()
  let lastEvent = -Infinity
  let pending = 0
  let agentSpeaking = false
  return {
    activity() { lastActivity = now() },
    event() { lastEvent = now(); pending++ },
    setAgentSpeaking(v) { agentSpeaking = v; if (!v) lastActivity = now() },
    tick() {
      const t = now()
      if (agentSpeaking || pending === 0) return false
      if (t - lastActivity < quietMs || t - lastEvent < eventCooldownMs) return false
      pending = 0
      return true
    },
  }
}
