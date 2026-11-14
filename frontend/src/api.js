const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, options)
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || `Request failed (${response.status})`)
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  health: () => request('/health'), samples: () => request('/samples'), sample: (id) => request(`/samples/${id}`),
  runs: () => request('/runs'), run: (id) => request(`/runs/${id}`), deleteRun: (id) => request(`/runs/${id}`, { method: 'DELETE' }),
  createJob: (payload) => request('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  uploadJob: (file, domain, nCandidates) => { const body = new FormData(); body.append('file', file); body.append('domain', domain); if (nCandidates) body.append('n_candidates', nCandidates); return request('/jobs/upload', { method: 'POST', body }) },
  job: (id) => request(`/jobs/${id}`), factAudit: (id) => request(`/runs/${id}/fact-audit`), embeddings: (id) => request(`/runs/${id}/embeddings`),
  evaluate: (payload) => request('/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  uploadEvaluation: (file, maxSamples, runName) => { const body = new FormData(); body.append('file', file); body.append('max_samples', maxSamples); body.append('run_name', runName); return request('/evaluations/upload', { method: 'POST', body }) },
  system: () => request('/system'), flush: () => request('/system/flush-cache', { method: 'POST' }), selfTest: () => request('/system/self-test', { method: 'POST' }),
  settings: () => request('/settings'), saveSettings: (payload) => request('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  exportUrl: (id, format) => `${API_ROOT}/runs/${id}/exports/${format}`,
}
