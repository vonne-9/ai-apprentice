import { useConversation } from '@elevenlabs/react'
import { api } from '../lib/api.js'

export function useAgent({ onUtterance }) {
  const conversation = useConversation({
    onMessage: ({ source, message }) => onUtterance({ speaker: source === 'ai' ? 'agent' : 'user', text: message }),
    onError: e => console.error('agent error', e),
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
