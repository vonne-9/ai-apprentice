async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  createSession: (mode, expert) => call('POST', '/api/sessions', { mode, expert }),
  getSession: id => call('GET', `/api/sessions/${id}`),
  postFrame: (id, body) => call('POST', `/api/sessions/${id}/frame`, body),
  postTranscript: (id, utterances) => call('POST', `/api/sessions/${id}/transcript`, { utterances }),
  postOffRecord: (id, body) => call('POST', `/api/sessions/${id}/offrecord`, body),
  synthesize: id => call('POST', `/api/sessions/${id}/synthesize`, {}),
  finalize: (id, body) => call('POST', `/api/sessions/${id}/finalize`, body),
  latestWorkMap: () => call('GET', '/api/workmaps/latest'),
  saveWorkMap: wm => call('PUT', '/api/workmaps/latest', wm),
  signedUrl: role => call('GET', `/api/signed-url?role=${role}`),
}
