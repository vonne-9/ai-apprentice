import 'dotenv/config'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { createApp } from './app.js'
import { createStore } from './store.js'
import { createAi } from './ai.js'

const app = createApp({
  store: createStore(path.resolve('server/data')),
  ai: createAi(new Anthropic(process.env.ANTHROPIC_WORKSPACE_ID
    ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } }
    : {})),
  eleven: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agents: { interviewer: process.env.ELEVENLABS_INTERVIEWER_AGENT_ID, tutor: process.env.ELEVENLABS_TUTOR_AGENT_ID },
    fetch,
  },
})
app.listen(3001, () => console.log('api on :3001'))
