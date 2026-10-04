export function openBus(onMessage) {
  const ch = new BroadcastChannel('apprentice')
  if (onMessage) ch.onmessage = e => onMessage(e.data)
  return { post: msg => ch.postMessage(msg), close: () => ch.close() }
}
