export function meanAbsDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 255
  let sum = 0
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    n += 3
  }
  return sum / n
}

export function shouldSend({ diff, threshold, msSinceLast, maxIntervalMs }) {
  return diff >= threshold || msSinceLast >= maxIntervalMs
}
