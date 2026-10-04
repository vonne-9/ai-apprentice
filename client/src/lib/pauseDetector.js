// Decides when the worker has paused long enough for the agent to ask one question.
// A "speaking" flag older than maxSpeakingMs is treated as stale (e.g. a turn that ended without a mode change).
export function createPauseDetector({ quietMs = 4000, eventCooldownMs = 3000, maxSpeakingMs = 20000, now = () => Date.now() } = {}) {
  let lastActivity = now()
  let lastEvent = -Infinity
  let pending = 0
  let agentSpeaking = false
  let speakingSince = 0
  return {
    activity() { lastActivity = now() },
    event() { lastEvent = now(); pending++ },
    setAgentSpeaking(v) {
      if (v && !agentSpeaking) speakingSince = now()
      agentSpeaking = v
      if (!v) lastActivity = now()
    },
    tick() {
      const t = now()
      if (agentSpeaking && t - speakingSince < maxSpeakingMs) return false
      if (pending === 0) return false
      if (t - lastActivity < quietMs || t - lastEvent < eventCooldownMs) return false
      pending = 0
      return true
    },
  }
}
