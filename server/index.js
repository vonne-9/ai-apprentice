import 'dotenv/config'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createApp } from './app.js'
import { createStore } from './store.js'
import { createAi } from './ai.js'

const app = createApp({
  store: createStore(path.resolve('server/data')),
  // Fail fast (90 s, 2 retries) instead of the SDK's 10-minute default so a hung call surfaces as a Retry in the UI.
  ai: createAi(new Anthropic({
    timeout: 90_000,
    maxRetries: 2,
    ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
  })),
  eleven: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agents: { interviewer: process.env.ELEVENLABS_INTERVIEWER_AGENT_ID, tutor: process.env.ELEVENLABS_TUTOR_AGENT_ID },
    fetch,
  },
})
app.listen(3001, () => console.log('api on :3001'))
