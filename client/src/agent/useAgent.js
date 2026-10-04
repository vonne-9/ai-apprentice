import { useConversation } from '@elevenlabs/react'
import { api } from '../lib/api.js'

// Lets an automated demo driver (demo/run-demo.mjs) follow the conversation; no-op otherwise.
const emit = (type, data) => window.__apprentice?.emit?.(type, data)

export function useAgent({ onUtterance }) {
  const conversation = useConversation({
    onMessage: ({ source, message }) => {
      const speaker = source === 'ai' ? 'agent' : 'user'
      emit('utterance', { speaker, text: message })
      onUtterance({ speaker, text: message })
    },
    onConnect: ({ conversationId }) => emit('connect', { conversationId }),
    onDisconnect: () => emit('disconnect', {}),
    onModeChange: ({ mode }) => emit('mode', { mode }),
    onError: e => { emit('error', { message: String(e) }); console.error('agent error', e) },
  })

  async function start({ role, prompt, firstMessage, clientTools }) {
    await navigator.mediaDevices.getUserMedia({ audio: true })
    const { signedUrl } = await api.signedUrl(role)
    await conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      overrides: { agent: { prompt: { prompt }, firstMessage } },
      clientTools,
    })
  }

  return { ...conversation, start }
}
