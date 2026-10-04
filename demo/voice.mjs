// Text-to-speech for the personas: ElevenLabs if the key allows it, otherwise macOS `say`.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)
const KEY = process.env.ELEVENLABS_API_KEY

// ElevenLabs premade voices, and the macOS fallback voice for each persona.
const VOICES = {
  sabine: { eleven: process.env.SABINE_VOICE_ID || 'XrExE9yKIg1WjnnlVkGX', say: 'Anna' },
  lena: { eleven: process.env.LENA_VOICE_ID || 'pFZP5JQG7iQjIQuC4Bku', say: 'Samantha' },
}

let useEleven = null

async function eleven(text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  })
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return Buffer.from(await res.arrayBuffer())
}

async function macSay(text, voice) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'say-'))
  const aiff = path.join(dir, 'a.aiff')
  const wav = path.join(dir, 'a.wav')
  await run('say', ['-v', voice, '-o', aiff, text])
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, '-ar', '48000', '-ac', '1', wav])
  const buf = await fs.readFile(wav)
  await fs.rm(dir, { recursive: true, force: true })
  return buf
}

export async function synth(text, who) {
  const v = VOICES[who]
  if (useEleven === null) {
    try { const buf = await eleven(text, v.eleven); useEleven = true; return buf } catch (e) {
      useEleven = false
      console.log(`[voice] ElevenLabs TTS unavailable (${e.message.slice(0, 120)}); using macOS say`)
    }
  }
  return useEleven ? eleven(text, v.eleven) : macSay(text, v.say)
}

export const voiceEngine = () => (useEleven ? 'elevenlabs' : 'macos-say')
