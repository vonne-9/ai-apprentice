// Injected into every page of the simulated demo (see run-demo.mjs).
// 1) Replaces the microphone with a synthetic stream the persona's voice is played into.
// 2) Bridges the app's window.__apprentice.emit(...) events to the Node driver.
(() => {
  let ctx = null
  let dest = null

  function ensureAudio() {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 48000 })
      dest = ctx.createMediaStreamDestination()
    }
    return dest
  }

  const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = async constraints => {
    if (constraints && constraints.audio && !constraints.video) {
      const d = ensureAudio()
      if (ctx.state !== 'running') await ctx.resume()
      // Clone so the SDK stopping its track never kills the shared destination.
      return new MediaStream(d.stream.getAudioTracks().map(t => t.clone()))
    }
    return realGetUserMedia(constraints)
  }

  // Plays base64-encoded audio (mp3/wav) into the fake mic; resolves with its duration in seconds.
  window.__personaSpeak = async b64 => {
    ensureAudio()
    if (ctx.state !== 'running') await ctx.resume()
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const buffer = await ctx.decodeAudioData(bytes.buffer)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(dest)
    return new Promise(resolve => {
      src.onended = () => resolve(buffer.duration)
      src.start()
    })
  }

  // Screen share: the driver pushes screenshots of the ERP window into a canvas, which stands in for
  // getDisplayMedia (no OS screen-recording permission needed).
  const screen = document.createElement('canvas')
  screen.width = 1200
  screen.height = 800
  const realGetDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices)
  navigator.mediaDevices.getDisplayMedia = async constraints => {
    if (window.__demoScreen) return screen.captureStream(5)
    return realGetDisplayMedia(constraints)
  }
  window.__demoScreen = true
  window.__pushFrame = async b64 => {
    const img = new Image()
    img.src = `data:image/jpeg;base64,${b64}`
    await img.decode()
    screen.getContext('2d').drawImage(img, 0, 0, screen.width, screen.height)
  }

  window.__apprentice = {
    emit: (type, data) => { if (window.__demoEvent) window.__demoEvent({ type, data }) },
  }
})()
