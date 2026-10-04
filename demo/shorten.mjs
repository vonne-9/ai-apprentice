// Makes a tighter cut of a demo video by trimming long silences (agent waiting, model thinking) to a short gap.
//   node demo/shorten.mjs <in.mp4> <out.mp4> [minSilenceSec=1.8] [keepSec=0.7]
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const [input, output, minSilence = '1.8', keep = '0.7'] = process.argv.slice(2)
if (!input || !output) { console.error('usage: node demo/shorten.mjs <in.mp4> <out.mp4> [minSilenceSec] [keepSec]'); process.exit(1) }

const { stdout: dur } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input])
const total = Number(dur)

const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', input, '-af', `silencedetect=noise=-38dB:d=${minSilence}`, '-f', 'null', '-'],
  { maxBuffer: 1 << 26 })
const silences = []
let start = null
for (const line of stderr.split('\n')) {
  const s = line.match(/silence_start: ([\d.]+)/)
  const e = line.match(/silence_end: ([\d.]+)/)
  if (s) start = Number(s[1])
  if (e && start !== null) { silences.push([start, Number(e[1])]); start = null }
}
if (start !== null) silences.push([start, total])

// Keep everything except the middle of each silence, leaving keep/2 seconds on each side.
const half = Number(keep) / 2
const segments = []
let cursor = 0
for (const [a, b] of silences) {
  const cutFrom = a + half
  const cutTo = b - half
  if (cutTo - cutFrom < 0.3) continue
  segments.push([cursor, cutFrom])
  cursor = cutTo
}
segments.push([cursor, total])

const expr = segments.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')
await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', input,
  '-vf', `select='${expr}',setpts=N/FRAME_RATE/TB`,
  '-af', `aselect='${expr}',asetpts=N/SR/TB`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', output],
{ maxBuffer: 1 << 26 })

const kept = segments.reduce((s, [a, b]) => s + (b - a), 0)
console.log(`${silences.length} silences found; ${total.toFixed(0)}s → ${kept.toFixed(0)}s → ${output}`)
