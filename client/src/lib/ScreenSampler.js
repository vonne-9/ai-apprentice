import { meanAbsDiff, shouldSend } from './frameDiff.js'

function draw(video, w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)
  return { canvas, ctx }
}

// Samples the shared screen; sends a frame only when it changed (or as a slow heartbeat).
// At most one frame is in flight, so events arrive in order.
export class ScreenSampler {
  constructor({ onFrame, onEnded, intervalMs = 1500, maxIntervalMs = 10000, threshold = 0.4 }) {
    Object.assign(this, { onFrame, onEnded, intervalMs, maxIntervalMs, threshold })
    this.paused = false
    this.busy = false
    this.lastSent = 0
    this.lastThumb = null
    this.lastFull = null
  }

  async start() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false })
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true })
    Object.assign(this.video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
    document.body.appendChild(this.video)
    this.video.srcObject = this.stream
    await this.video.play()
    this.stream.getVideoTracks()[0].addEventListener('ended', () => this.stop())
    this.timer = setInterval(() => this.sample(), this.intervalMs)
  }

  sample() {
    const v = this.video
    if (this.paused || this.busy || !v?.videoWidth) return
    const thumb = draw(v, 160, 90).ctx.getImageData(0, 0, 160, 90).data
    const now = Date.now()
    const diff = meanAbsDiff(thumb, this.lastThumb)
    if (!shouldSend({ diff, threshold: this.threshold, msSinceLast: now - this.lastSent, maxIntervalMs: this.maxIntervalMs })) return
    const scale = Math.min(1, 1280 / v.videoWidth)
    const curr = draw(v, Math.round(v.videoWidth * scale), Math.round(v.videoHeight * scale)).canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
    const prev = this.lastFull
    Object.assign(this, { lastThumb: thumb, lastFull: curr, lastSent: now, busy: true })
    Promise.resolve(this.onFrame({ prev, curr }))
      .catch(e => console.warn('frame failed', e))
      .finally(() => { this.busy = false })
  }

  pause(p) { this.paused = p }

  stop() {
    clearInterval(this.timer)
    this.stream?.getTracks().forEach(t => t.stop())
    this.video?.remove()
    this.onEnded?.()
  }
}
