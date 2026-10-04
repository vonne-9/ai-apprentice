// Composes the demo video: ERP window (left) + apprentice page (right) + ElevenLabs conversation audio,
// under a banner that labels the run as simulated.
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PANE = { w: 960, h: 640 }
const BANNER_H = 80

async function fetchConversationAudio(id, file) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}/audio`, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    })
    if (res.ok) { await fs.writeFile(file, Buffer.from(await res.arrayBuffer())); return true }
    await sleep(4000) // audio becomes available shortly after the conversation ends
  }
  console.log(`[compose] no audio for ${id}`)
  return false
}

async function renderBanner(file, executablePath) {
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: PANE.w * 2, height: BANNER_H } })
  await page.setContent(`<body style="margin:0;background:#1d1d1b;color:#f7f6f2;font:600 26px system-ui;display:flex;
    align-items:center;justify-content:center;height:${BANNER_H}px">AI Apprentice — simulated run: AI personas play the expert (Sabine) and the new hire (Lena)</body>`)
  await page.screenshot({ path: file })
  await browser.close()
}

export async function compose(m, out) {
  const sec = ms => (ms / 1000).toFixed(3)
  const duration = sec(m.mainEnd - m.mainStart)

  const audio = []
  for (const [i, c] of m.conversations.entries()) {
    const file = path.join(out, `conversation-${i + 1}.mp3`)
    if (await fetchConversationAudio(c.id, file)) audio.push({ file, delayMs: Math.max(0, c.at - m.mainStart) })
  }

  const banner = path.join(out, 'banner.png')
  await renderBanner(banner, process.env.CHROME_PATH ||
    `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)

  const inputs = ['-i', m.main, ...m.erps.flatMap(e => ['-i', e.path]), '-i', banner, ...audio.flatMap(a => ['-i', a.file])]
  const bannerIdx = 1 + m.erps.length
  const scale = `scale=${PANE.w}:${PANE.h}:force_original_aspect_ratio=decrease,pad=${PANE.w}:${PANE.h}:(ow-iw)/2:(oh-ih)/2:color=0xf7f6f2,setsar=1,fps=25`

  const f = [`[0:v]${scale}[right]`, `color=c=0xf7f6f2:s=${PANE.w}x${PANE.h}:r=25:d=${duration}[bg0]`]
  m.erps.forEach((e, i) => {
    const offset = sec(e.start - m.mainStart)
    f.push(`[${i + 1}:v]${scale},tpad=start_duration=${offset}:color=0xf7f6f2[e${i}]`)
    f.push(`[bg${i}][e${i}]overlay=eof_action=pass:enable='gte(t,${offset})'[bg${i + 1}]`)
  })
  f.push(`[bg${m.erps.length}][right]hstack=inputs=2[stage]`)
  f.push(`[${bannerIdx}:v][stage]vstack=inputs=2[v]`)
  const maps = ['-map', '[v]']
  if (audio.length) {
    audio.forEach((a, i) => f.push(`[${bannerIdx + 1 + i}:a]adelay=${a.delayMs}:all=1[a${i}]`))
    f.push(`${audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest[a]`)
    maps.push('-map', '[a]')
  }

  // Banner image is a single frame; loop it for the whole video.
  const bannerArg = inputs.indexOf(banner)
  inputs.splice(bannerArg - 1, 0, '-loop', '1')

  const file = path.join(out, 'ai-apprentice-demo.mp4')
  await run('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', f.join(';'), ...maps,
    '-t', duration, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', file],
  { maxBuffer: 1 << 26 })
  return file
}

// Allows re-running composition alone: node demo/compose.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  await import('dotenv/config')
  const out = path.resolve('demo/out')
  const m = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8'))
  console.log(await compose(m, out))
}
