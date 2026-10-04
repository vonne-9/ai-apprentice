// Cuts a ~60 s highlight reel from a full demo run, using the marks and transcript timestamps in
// demo/out/manifest.json and the composed demo/out/ai-apprentice-demo.mp4.
//   node demo/highlight.mjs [targetSec=60]
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const OUT = path.resolve('demo/out')
const target = Number(process.argv[2] || 60)
const m = JSON.parse(await fs.readFile(path.join(OUT, 'manifest.json'), 'utf8'))
const full = path.join(OUT, 'ai-apprentice-demo.mp4')

const sec = at => (at - m.mainStart) / 1000
const markAt = name => { const k = m.marks.find(x => x.name === name); if (!k) throw new Error(`missing mark ${name}`); return sec(k.at) }
const lines = m.transcript.map(u => ({ ...u, t: sec(u.at) }))
const next = (speaker, after, pred = () => true) => lines.find(u => u.speaker === speaker && u.t > after && pred(u))
const prev = (speaker, before) => [...lines].reverse().find(u => u.speaker === speaker && u.t < before)

// Each segment: [start, end, label]. Agent lines are timestamped when speech starts; user lines when
// the transcript arrives (i.e. just after the person finished speaking).
const segments = []
const add = (a, b, label) => { if (b > a) segments.push([Math.max(0, a), b, label]) }

// 1. Capture: the recode on screen, then the apprentice's question and Sabine's answer.
const recode = markAt('recode')
add(recode - 1.5, recode + 4.5, 'expert recodes to capex')
const q = next('agent', recode)
const ans = q && next('user', q.t)
if (q && ans) add(q.t - 0.4, ans.t + 0.6, 'apprentice asks why; expert answers')

// 2. Debrief: end of the teach-back and Sabine's confirmation.
const confirm = next('user', markAt('recode'), u => /how it works/i.test(u.text))
if (confirm) {
  const restate = prev('agent', confirm.t)
  add(Math.max(restate ? restate.t - 0.3 : confirm.t - 7, confirm.t - 8), confirm.t + 1, 'teach-back confirmed')
}

// 3. The Work Map.
const wm = markAt('workmap')
add(wm + 0.3, wm + 8, 'work map')

// 4. Teach: wrong approval → veto → tutor asks why → new hire answers → tutor explains.
const wrong = markAt('wrong-approve')
const tq = next('agent', wrong)
const la = tq && next('user', tq.t)
add(wrong - 1.5, la ? la.t + 0.6 : wrong + 12, 'tutor blocks the save and asks why')
const explain = la && next('agent', la.t)
if (explain) {
  const after = next('user', explain.t)
  add(explain.t - 0.3, Math.min(explain.t + 8, after ? after.t - 1 : explain.t + 8), 'tutor explains in Sabine\'s words')
}

// 5. Fix and approve, then the mastery screen.
const fix = markAt('fix')
add(fix - 0.3, fix + 9, 'new hire fixes and approves')
const mastery = markAt('mastery')
add(mastery + 0.3, mastery + 4.5, 'mastery')

const total = segments.reduce((s, [a, b]) => s + (b - a), 0)
const speed = Math.min(1.2, Math.max(1, total / target))
console.log(segments.map(([a, b, l]) => `${a.toFixed(1)}–${b.toFixed(1)}s  ${l}`).join('\n'))
console.log(`raw ${total.toFixed(1)}s, speed ×${speed.toFixed(2)} → ~${(total / speed).toFixed(0)}s`)

const tmp = path.join(OUT, 'highlight-parts')
await fs.rm(tmp, { recursive: true, force: true })
await fs.mkdir(tmp)
const parts = []
for (const [i, [a, b]] of segments.entries()) {
  const d = b - a
  const file = path.join(tmp, `part-${i}.mp4`)
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-ss', a.toFixed(3), '-t', d.toFixed(3), '-i', full,
    '-vf', `setpts=PTS/${speed},fade=t=in:st=0:d=0.15,fade=t=out:st=${(d / speed - 0.15).toFixed(3)}:d=0.15`,
    '-af', `atempo=${speed},afade=t=in:st=0:d=0.1,afade=t=out:st=${(d / speed - 0.12).toFixed(3)}:d=0.12`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-ar', '44100', '-b:a', '160k', file])
  parts.push(file)
}
const list = path.join(tmp, 'list.txt')
await fs.writeFile(list, parts.map(p => `file '${p}'`).join('\n'))
const outFile = path.join(OUT, 'ai-apprentice-60s.mp4')
await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outFile])
const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outFile])
console.log(`→ ${outFile} (${Number(stdout).toFixed(1)}s)`)
