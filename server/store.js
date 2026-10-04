import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

// Write to a temp file then rename so concurrent readers never see a truncated file.
async function atomicWrite(target, data) {
  const tmp = `${target}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, target)
}

export function createStore(root) {
  const dir = id => path.join(root, 'sessions', id)
  const file = id => path.join(dir(id), 'session.json')
  let chain = Promise.resolve()

  async function read(id) { return JSON.parse(await fs.readFile(file(id), 'utf8')) }
  async function write(s) {
    await fs.mkdir(dir(s.id), { recursive: true })
    await atomicWrite(file(s.id), JSON.stringify(s, null, 2))
  }
  // Serialize read-modify-write so concurrent frame/transcript posts don't drop updates.
  function update(id, fn) {
    const p = chain.then(async () => { const s = await read(id); const r = await fn(s); await write(s); return r })
    chain = p.catch(() => {})
    return p
  }

  return {
    async create(mode, expert) {
      const s = { id: crypto.randomUUID().replace(/-/g, '').slice(0, 8), mode, expert: expert || 'the expert', startedAt: Date.now(), events: [], transcript: [], frames: [], offRecord: [] }
      await write(s)
      return s
    },
    read,
    update,
    async saveFrame(id, t, buf) {
      const name = `f${String(Math.round(t * 10)).padStart(6, '0')}.jpg`
      await fs.mkdir(dir(id), { recursive: true })
      await fs.writeFile(path.join(dir(id), name), buf)
      return name
    },
    framePath: (id, name) => path.resolve(dir(id), name),
    async saveWorkMap(wm) {
      await fs.mkdir(root, { recursive: true })
      await atomicWrite(path.join(root, 'workmap-latest.json'), JSON.stringify(wm, null, 2))
    },
    async latestWorkMap() {
      try { return JSON.parse(await fs.readFile(path.join(root, 'workmap-latest.json'), 'utf8')) } catch { return null }
    },
  }
}
