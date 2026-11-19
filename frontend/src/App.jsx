import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Activity, BarChart3, CheckCircle2, ChevronRight, FileCheck2, FileText, Gauge, GitCompareArrows, History, LayoutDashboard, LoaderCircle, Network, Settings, Upload, XCircle } from 'lucide-react'
import { api } from './api'

const navItems = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/summarize', 'Summarize & Verify', FileCheck2],
  ['/results', 'Verification Results', CheckCircle2],
  ['/attention', 'Attention Explorer', Network],
  ['/comparison', 'Comparison', GitCompareArrows],
  ['/evaluation', 'Evaluation', BarChart3],
  ['/history', 'History & Settings', Settings],
]

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—')
const activeReport = (run) => run?.reports?.[run.chosen_cand_id ?? 0]
const verdict = (run, index) => {
  const report = activeReport(run)
  const nli = report?.nli?.find((item) => item.summary_sent_idx === index)
  if (report?.facts?.issues?.some((item) => item.summary_sent_idx === index) || nli?.label === 'contradiction') return 'flagged'
  if (nli && nli.entailment < 0.5) return 'weak'
  return 'supported'
}

function App() {
  const [run, setRun] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')

  const refreshHistory = async () => {
    try {
      const rows = await api.runs()
      setHistory(rows)
      return rows
    } catch (err) {
      setError(err.message)
      return []
    }
  }

  const loadRun = async (id) => {
    try {
      const loaded = await api.run(id)
      setRun(loaded)
      return loaded
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  useEffect(() => {
    refreshHistory().then((rows) => rows[0] && loadRun(rows[0].run_id))
  }, [])

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="border-b border-rule bg-paper-2 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center gap-3 border-b border-rule px-6">
          <div className="grid h-8 w-8 place-items-center rounded-pill bg-ink text-sm font-bold text-paper-2 shadow-moulded-dark">
            E
          </div>
          <div>
            <div className="font-semibold text-ink">EquiSumm</div>
            <div className="text-xs text-muted">Verified summarization</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-auto p-3 lg:block">
          {navItems.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-pill px-3 py-2 text-sm transition-[background-color,color,transform] active:translate-y-[1px] ${
                  isActive
                    ? 'border border-accent/40 bg-accent-soft font-semibold text-ink shadow-sm'
                    : 'text-muted hover:bg-paper-3 hover:text-ink'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-6 pt-6 text-xs text-muted lg:block">
          BART-base + LoRA<br />
          RoBERTa-large-MNLI
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex min-h-16 items-center justify-between border-b border-rule bg-paper-2 px-6">
          <div className="text-sm text-muted">
            {run ? (
              <>
                Current run <span className="rounded-pill border border-rule bg-paper-3 px-2 py-0.5 font-mono text-xs font-medium text-ink">{run.run_id}</span>
              </>
            ) : (
              'No active run'
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Activity size={14} className="text-green" />
            <span>API connected</span>
          </div>
        </header>

        {error && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-pill border border-alert-rule bg-alert-soft px-4 py-3 text-sm text-alert-ink">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error" className="text-alert-ink hover:opacity-80">
              <XCircle size={16} />
            </button>
          </div>
        )}

        <div className="mx-auto max-w-7xl p-6">
          <Routes>
            <Route path="/" element={<Dashboard run={run} history={history} />} />
            <Route path="/summarize" element={<Summarize setRun={setRun} refreshHistory={refreshHistory} setError={setError} />} />
            <Route path="/results" element={<Results run={run} />} />
            <Route path="/attention" element={<Attention run={run} />} />
            <Route path="/comparison" element={<Comparison run={run} />} />
            <Route path="/evaluation" element={<Evaluation setError={setError} />} />
            <Route path="/history" element={<HistorySettings history={history} refreshHistory={refreshHistory} loadRun={loadRun} setRun={setRun} setError={setError} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function Page({ title, children, action }) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </>
  )
}

function Empty({ message = 'Run a verification first to view this data.' }) {
  return (
    <div className="card py-12 text-center text-sm text-muted">
      <FileText className="mx-auto mb-3 text-muted" />
      <p>{message}</p>
    </div>
  )
}

function Badge({ value }) {
  const style = value?.includes('ACCEPT')
    ? 'bg-green-soft text-green border border-green/30'
    : value?.includes('FALLBACK') || value?.includes('PRUNED')
    ? 'bg-accent-soft text-ink border border-accent/40'
    : 'bg-alert-soft text-alert-ink border border-alert-rule'
  return <span className={`num rounded-pill px-2.5 py-1 text-xs font-semibold ${style}`}>{value}</span>
}

function Metric({ label, value, note }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-2 text-2xl font-semibold text-ink">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  )
}

function Dashboard({ run, history }) {
  return (
    <Page
      title="Dashboard"
      action={
        <NavLink className="btn btn-primary" to="/summarize">
          New verification <ChevronRight size={16} />
        </NavLink>
      }
    >
      <p className="mb-6 max-w-3xl text-sm leading-6 text-muted">
        Generate BART-base + LoRA summaries and audit them with source alignment, RoBERTa MNLI, and strict numeric and entity checks.
      </p>
      {run ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Decision" value={<Badge value={run.decision} />} />
            <Metric label="Summary sentences" value={run.chosen_sentences?.length ?? 0} />
            <Metric label="Source sentences" value={run.n_sentences} />
            <Metric label="Processing time" value={`${run.execution_time_seconds?.toFixed(1)}s`} />
          </div>
          <div className="card mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Current verified summary</h2>
              <NavLink to="/results" className="text-sm font-medium text-ink hover:text-accent">
                Inspect verified result
              </NavLink>
            </div>
            <p className="leading-7 text-ink">{run.chosen_summary || 'No safe summary was produced.'}</p>
            <p className="mt-4 text-sm text-muted">{run.decision_reason}</p>
          </div>
        </>
      ) : (
        <Empty message="No saved verification run is selected. Start with a document or a built-in sample." />
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-ink">Recent runs</h2>
        {history.length ? (
          <div className="overflow-hidden rounded-panel border border-rule bg-paper-2 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule bg-paper-3/60 text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">Run</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="hidden px-4 py-3 md:table-cell">Created</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 5).map((item) => (
                  <tr key={item.run_id} className="border-t border-rule hover:bg-paper-3/40 transition-colors">
                    <td className="num px-4 py-3 text-xs">{item.run_id}</td>
                    <td className="px-4 py-3 capitalize text-ink">{item.domain}</td>
                    <td className="px-4 py-3">
                      <Badge value={item.decision} />
                    </td>
                    <td className="num hidden px-4 py-3 text-muted md:table-cell">{formatDate(item.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No run history yet.</p>
        )}
      </section>
    </Page>
  )
}

function Progress({ job }) {
  if (!job) return null
  const failed = job.status === 'failed'
  return (
    <div className={`mb-5 rounded-panel border p-4 shadow-sm ${failed ? 'border-alert-rule bg-alert-soft' : 'border-rule bg-paper-2'}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        {job.status === 'completed' ? (
          <CheckCircle2 className="text-green" size={18} />
        ) : failed ? (
          <XCircle className="text-alert-ink" size={18} />
        ) : (
          <LoaderCircle className="motion-safe:animate-spin motion-reduce:animate-none text-accent" size={18} />
        )}
        {job.message}
      </div>
      {!failed && (
        <div className="mt-3 h-2 overflow-hidden rounded-pill border border-rule bg-paper-3">
          <div
            className="h-full w-full bg-accent transition-transform duration-300 ease-out origin-left"
            style={{ transform: `scaleX(${job.progress})` }}
          />
        </div>
      )}
      {failed && <p className="mt-2 text-sm text-alert-ink">{job.error}</p>}
    </div>
  )
}

function Summarize({ setRun, refreshHistory, setError }) {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [domain, setDomain] = useState('financial')
  const [candidates, setCandidates] = useState(4)
  const [file, setFile] = useState(null)
  const [samples, setSamples] = useState([])
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.samples().then(setSamples).catch((err) => setError(err.message))
  }, [setError])

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return
    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.job_id)
        setJob(next)
        if (next.status === 'completed') {
          setRun(next.result.run)
          await refreshHistory()
          setBusy(false)
          nav('/results')
        }
        if (next.status === 'failed') setBusy(false)
      } catch (err) {
        setBusy(false)
        setError(err.message)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [job, nav, refreshHistory, setError, setRun])

  const loadSample = async (id) => {
    try {
      const sample = await api.sample(id)
      setText(sample.text)
      setDomain(sample.domain)
      setFile(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!file && !text.trim()) return setError('Provide source text or upload a .txt or .pdf document.')
    try {
      setBusy(true)
      const next = file ? await api.uploadJob(file, domain, candidates) : await api.createJob({ text, domain, n_candidates: candidates })
      setJob(next)
    } catch (err) {
      setBusy(false)
      setError(err.message)
    }
  }

  return (
    <Page title="Summarize & Verify">
      <p className="mb-6 text-sm text-muted">
        The source is summarized, aligned through teacher-forced cross-attention, verified sentence by sentence, and reranked using the existing hard constraints.
      </p>
      <Progress job={job} />
      <div className="mb-4 flex flex-wrap gap-2">
        {samples.map((sample) => (
          <button key={sample.id} className="btn btn-secondary text-xs" onClick={() => loadSample(sample.id)}>
            {sample.name}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="card">
          <label className="label" htmlFor="document">Source document</label>
          <textarea
            id="document"
            className="field min-h-80 resize-y font-body text-sm leading-relaxed"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setFile(null)
            }}
            placeholder="Paste a legal, financial, or general document…"
          />
          <div className="num mt-3 text-xs text-muted">{text.length.toLocaleString()} characters</div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <label className="label">Document domain</label>
            <select className="field" value={domain} onChange={(event) => setDomain(event.target.value)}>
              <option value="financial">Financial</option>
              <option value="legal">Legal</option>
              <option value="general">General</option>
            </select>
            <label className="label mt-4 block">Beam candidates</label>
            <input
              className="field num"
              type="number"
              min="1"
              max="8"
              value={candidates}
              onChange={(event) => setCandidates(Number(event.target.value))}
            />
          </div>
          <div className="card">
            <label className="label">Upload document</label>
            <input
              className="mt-2 block w-full text-xs text-muted file:mr-2 file:rounded-pill file:border file:border-rule file:bg-paper-3 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-paper-3/80"
              type="file"
              accept=".txt,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            {file && <p className="mt-2 text-xs text-muted">{file.name} selected; pasted text will be ignored.</p>}
          </div>
          <button disabled={busy} className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed" type="submit">
            <Upload size={16} />
            {busy ? 'Processing…' : 'Summarize & Verify'}
          </button>
        </div>
      </form>
    </Page>
  )
}

function Results({ run }) {
  const [audit, setAudit] = useState([])
  const [selected, setSelected] = useState(0)
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    if (run) api.factAudit(run.run_id).then((data) => setAudit(data.rows)).catch(() => setAudit([]))
  }, [run])

  if (!run) return <Page title="Verification Results"><Empty /></Page>

  const report = activeReport(run)
  const nli = report?.nli?.find((item) => item.summary_sent_idx === selected)
  const issues = report?.facts?.issues?.filter((item) => item.summary_sent_idx === selected) || []
  const premises = new Set(nli?.premise_sent_idxs || [])
  const rows = filter === 'All' ? audit : audit.filter((row) => row.status === filter)
  const statuses = ['All', ...new Set(audit.map((row) => row.status))]

  return (
    <Page
      title="Verification Results"
      action={
        <div className="flex gap-2">
          <a className="btn btn-secondary text-xs" href={api.exportUrl(run.run_id, 'markdown')}>Export MD</a>
          <a className="btn btn-secondary text-xs" href={api.exportUrl(run.run_id, 'json')}>Export JSON</a>
          <a className="btn btn-secondary text-xs" href={api.exportUrl(run.run_id, 'csv')}>Export CSV</a>
        </div>
      }
    >
      {run.n_truncated_sentences > 0 && (
        <div className="mb-4 rounded-pill border border-accent/40 bg-accent-soft p-3 text-sm text-ink">
          Source truncation: {run.n_truncated_sentences} trailing sentence(s) were outside the model token budget.
        </div>
      )}
      <div className="mb-6 rounded-panel border-l-4 border-ink bg-paper-2 p-4 shadow-sm">
        <Badge value={run.decision} />
        <p className="mt-2 text-sm text-ink">{run.decision_reason}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="font-semibold text-ink">Verified summary</h2>
          <p className="mt-1 text-sm text-muted">Select a sentence for its supporting evidence.</p>
          <div className="mt-4 space-y-2">
            {run.chosen_sentences.map((sentence, index) => (
              <button
                key={index}
                onClick={() => setSelected(index)}
                className={`w-full rounded-entry border-l-4 p-3.5 text-left text-sm transition-[transform,background-color,border-color] active:translate-y-[1px] hover:-translate-y-[1px] ${
                  selected === index ? 'bg-paper-3 shadow-sm ring-1 ring-ink/20' : 'bg-paper-2 hover:bg-paper-3/40'
                } ${
                  verdict(run, index) === 'supported'
                    ? 'border-green'
                    : verdict(run, index) === 'weak'
                    ? 'border-accent'
                    : 'border-alert'
                }`}
              >
                <span className="num mr-2 text-xs font-semibold text-muted">
                  {verdict(run, index)} · {index + 1}
                </span>
                <span className="text-ink">{sentence}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold text-ink">Evidence & audit</h2>
          {run.chosen_sentences[selected] && (
            <>
              <blockquote className="mt-3 border-l-2 border-rule pl-3 text-sm italic text-muted">
                {run.chosen_sentences[selected]}
              </blockquote>
              {nli && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ['Entailment', nli.entailment],
                    ['Neutral', nli.neutral],
                    ['Contradiction', nli.contradiction],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-panel border border-rule bg-paper-3/50 p-3">
                      <div className="text-xs font-medium text-muted">{label}</div>
                      <div className="num mt-1 font-semibold text-ink">{(value * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 text-sm">
                {issues.length ? (
                  issues.map((issue, index) => (
                    <p key={index} className="mb-2 rounded-panel border border-alert-rule bg-alert-soft p-2.5 text-alert-ink">
                      <b>{issue.kind.replaceAll('_', ' ')}:</b> {issue.detail}
                    </p>
                  ))
                ) : (
                  <p className="rounded-panel border border-green/30 bg-green-soft p-2.5 text-green">
                    No numeric, entity, or direction issue detected.
                  </p>
                )}
              </div>
              <h3 className="mt-5 text-sm font-semibold text-ink">Source context</h3>
              <div className="mt-2 max-h-72 space-y-1.5 overflow-auto text-sm">
                {run.source_sentences.map((sentence, index) => (
                  <p
                    key={index}
                    className={`rounded-pill p-2 transition-colors ${
                      premises.has(index) ? 'border border-accent/40 bg-accent-soft text-ink font-medium' : 'text-muted'
                    }`}
                  >
                    <b className="num">#{index + 1}</b> {sentence}
                  </p>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="card mt-6 overflow-auto">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Numeric & entity audit</h2>
          <select className="field mt-0 w-52" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
        {rows.length ? (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-y border-rule bg-paper-3/60 text-xs font-medium text-muted">
              <tr>
                {['Sentence', 'Type', 'Summary token', 'Source match', 'Status'].map((item) => (
                  <th key={item} className="px-3 py-2">{item}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-rule hover:bg-paper-3/40 transition-colors">
                  <td className="num px-3 py-2">{row.sentence}</td>
                  <td className="px-3 py-2 text-muted">{row.type}</td>
                  <td className="num px-3 py-2 font-medium text-ink">{row.summary_token}</td>
                  <td className="num px-3 py-2 text-muted">{row.source_match}</td>
                  <td className={`num px-3 py-2 font-medium ${row.status === 'Verified' ? 'text-green' : 'text-alert-ink'}`}>
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No numbers or named entities were detected in the chosen summary.</p>
        )}
      </section>
    </Page>
  )
}

function Attention({ run }) {
  const [selected, setSelected] = useState(0)
  const [embedding, setEmbedding] = useState(null)

  useEffect(() => {
    if (run) api.embeddings(run.run_id).then(setEmbedding).catch(() => setEmbedding({ points: [], message: 'Projection could not be generated.' }))
  }, [run])

  if (!run) return <Page title="Attention Explorer"><Empty /></Page>
  const attention = run.attentions?.[run.chosen_cand_id ?? 0]
  if (!attention) return <Page title="Attention Explorer"><Empty message="No cross-attention data is available for this run." /></Page>

  const support = attention.support[selected] || []
  const ranked = support.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value)
  const bounds = embedding?.points?.length
    ? {
        minX: Math.min(...embedding.points.map((p) => p.x)),
        maxX: Math.max(...embedding.points.map((p) => p.x)),
        minY: Math.min(...embedding.points.map((p) => p.y)),
        maxY: Math.max(...embedding.points.map((p) => p.y)),
      }
    : null

  const pointPosition = (point) => ({
    cx: 12 + ((point.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1)) * 576,
    cy: 288 - ((point.y - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1)) * 276,
  })

  return (
    <Page title="Attention Explorer">
      <p className="mb-6 text-sm text-muted">
        Teacher-forced decoder cross-attention is aggregated across decoder layers to attribute each summary sentence to the source.
      </p>
      <div className="card">
        <label className="label">Summary sentence</label>
        <select className="field" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
          {attention.summary_sentences.map((sentence, index) => (
            <option key={index} value={index}>
              Summary {index + 1}: {sentence.slice(0, 120)}
            </option>
          ))}
        </select>
        <blockquote className="mt-4 border-l-2 border-rule pl-3 text-sm italic text-muted">
          {attention.summary_sentences[selected]}
        </blockquote>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {ranked.slice(0, 3).map((item, index) => (
            <div className="rounded-panel border border-rule bg-paper-3/50 p-3" key={item.index}>
              <div className="text-xs font-medium text-muted">Rank {index + 1} · Source {item.index + 1}</div>
              <div className="num mt-1 text-lg font-semibold text-ink">{(item.value * 100).toFixed(1)}%</div>
              <p className="mt-2 text-xs leading-5 text-muted">{run.source_sentences[item.index]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card overflow-auto">
          <h2 className="font-semibold text-ink">Cross-attention support matrix</h2>
          <p className="mt-1 text-xs text-muted">Rows are summary sentences; columns are source sentences.</p>
          <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: `80px repeat(${run.source_sentences.length}, minmax(28px, 1fr))` }}>
            <span></span>
            {run.source_sentences.map((_, index) => (
              <span key={index} className="num text-center text-[10px] text-muted">S{index + 1}</span>
            ))}
            {attention.support.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="contents">
                <span className="num text-xs text-muted">Sum {rowIndex + 1}</span>
                {row.map((value, columnIndex) => (
                  <span
                    title={`Summary ${rowIndex + 1} → Source ${columnIndex + 1}: ${(value * 100).toFixed(2)}%`}
                    key={`${rowIndex}-${columnIndex}`}
                    className="h-7 rounded-sm border border-rule/50"
                    style={{ backgroundColor: `color-mix(in oklab, var(--color-ink) ${(Math.max(0.06, value) * 100).toFixed(0)}%, var(--color-paper-2))` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold text-ink">Source coverage</h2>
          <div className="mt-4 space-y-3">
            {attention.source_coverage.map((value, index) => (
              <div key={index}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-ink">Source {index + 1}</span>
                  <span className="num text-muted">{(value * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-pill border border-rule bg-paper-3">
                  <div
                    className="h-full w-full rounded-pill bg-accent transition-transform duration-300 ease-out origin-left"
                    style={{ transform: `scaleX(${value})` }}
                  />
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted">{run.source_sentences[index]}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mt-6">
        <h2 className="font-semibold text-ink">Attention focus and token entropy</h2>
        <p className="mt-1 text-xs text-muted">Lower values indicate more focused attention.</p>
        <div className="mt-4 flex h-36 items-end gap-px rounded-panel border border-rule bg-paper-3/30 p-2">
          {attention.token_entropy.map((value, index) => (
            <span
              title={`Token ${index + 1}: ${value.toFixed(3)}`}
              key={index}
              className="min-w-[2px] flex-1 bg-accent/90 hover:bg-accent transition-colors"
              style={{ height: `${Math.max(4, value * 100)}%` }}
            />
          ))}
        </div>
      </section>

      <section className="card mt-6">
        <h2 className="font-semibold text-ink">Sentence embeddings (2D t-SNE)</h2>
        <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
          <span>Source (grey)</span>
          <span>Supported summary (green)</span>
          <span>Flagged summary (red)</span>
        </div>
        {embedding?.message ? (
          <p className="mt-4 text-sm text-muted">{embedding.message}</p>
        ) : bounds ? (
          <svg className="mt-4 h-[320px] w-full rounded-panel border border-rule bg-paper-3/40" viewBox="0 0 600 300">
            {embedding.points.map((point, index) => {
              const pos = pointPosition(point)
              const color = point.kind === 'source' ? 'var(--color-muted)' : point.kind === 'flagged' ? 'var(--color-alert)' : 'var(--color-green)'
              return (
                <circle key={index} cx={pos.cx} cy={pos.cy} r={point.kind === 'source' ? 3 : 5} fill={color}>
                  <title>{`${point.kind} ${point.index}: ${point.text}`}</title>
                </circle>
              )
            })}
          </svg>
        ) : (
          <p className="mt-4 text-sm text-muted">Computing projection…</p>
        )}
      </section>
    </Page>
  )
}

function Comparison({ run }) {
  if (!run) return <Page title="Candidate Comparison"><Empty /></Page>
  const scores = run.rerank?.scores || []

  return (
    <Page title="Candidate Comparison">
      <div className="card">
        <h2 className="font-semibold text-ink">Reranker decision</h2>
        <p className="mt-2 text-sm text-ink">{run.rerank?.why_not_first || run.decision_reason}</p>
      </div>

      <section className="card mt-6 overflow-auto">
        <h2 className="mb-3 font-semibold text-ink">Quality signals</h2>
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-y border-rule bg-paper-3/60 text-xs font-medium text-muted">
            <tr>
              {['Candidate', 'Logprob', 'Entailment', 'Numeric', 'Entity', 'Flagged', 'Issues', 'Feasible', 'Soft score'].map((item) => (
                <th className="px-3 py-2" key={item}>{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map((score) => (
              <tr key={score.cand_id} className="border-b border-rule hover:bg-paper-3/40 transition-colors">
                <td className="num px-3 py-2 font-medium text-ink">
                  #{score.cand_id}{score.cand_id === run.chosen_cand_id ? ' · selected' : ''}
                </td>
                <td className="num px-3 py-2">{score.seq_logprob.toFixed(3)}</td>
                <td className="num px-3 py-2">{(score.entailment_mean * 100).toFixed(1)}%</td>
                <td className="num px-3 py-2">{(score.numeric_precision * 100).toFixed(1)}%</td>
                <td className="num px-3 py-2">{(score.entity_precision * 100).toFixed(1)}%</td>
                <td className="num px-3 py-2">{score.n_flagged}</td>
                <td className="num px-3 py-2">{score.n_fact_issues}</td>
                <td className={`num px-3 py-2 font-medium ${score.is_feasible ? 'text-green' : 'text-alert-ink'}`}>
                  {score.is_feasible ? 'PASS' : 'FAIL'}
                </td>
                <td className="num px-3 py-2">{score.soft_score.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 space-y-4">
        {run.candidates.map((candidate) => {
          const score = scores.find((item) => item.cand_id === candidate.cand_id)
          return (
            <div className="card" key={candidate.cand_id}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">Candidate #{candidate.cand_id}</h2>
                {candidate.cand_id === run.chosen_cand_id && <Badge value="SELECTED" />}
              </div>
              <p className="mt-3 leading-7 text-ink">{candidate.text}</p>
              {score?.rejection_reasons?.length > 0 && (
                <div className="mt-3 text-sm text-alert-ink">
                  {score.rejection_reasons.map((reason) => (
                    <p key={reason}>• {reason}</p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </Page>
  )
}

function Evaluation({ setError }) {
  const [maxSamples, setMaxSamples] = useState(5)
  const [file, setFile] = useState(null)
  const [job, setJob] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return
    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.job_id)
        setJob(next)
        if (next.status === 'completed') {
          setReport(next.result)
          setBusy(false)
        }
        if (next.status === 'failed') setBusy(false)
      } catch (err) {
        setBusy(false)
        setError(err.message)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [job, setError])

  const submit = async (event) => {
    event.preventDefault()
    try {
      setBusy(true)
      setReport(null)
      setJob(file ? await api.uploadEvaluation(file, maxSamples, 'interactive_eval') : await api.evaluate({ dataset: 'builtin', max_samples: maxSamples, run_name: 'interactive_eval' }))
    } catch (err) {
      setBusy(false)
      setError(err.message)
    }
  }

  const metrics = report && [
    ['ROUGE-1', report.mean_rouge1],
    ['ROUGE-2', report.mean_rouge2],
    ['ROUGE-L', report.mean_rougeL],
    ['NLI entailment', report.mean_nli_entailment],
    ['Numeric precision', report.mean_numeric_precision],
    ['Entity precision', report.mean_entity_precision],
  ]

  return (
    <Page title="Benchmark Evaluation">
      <p className="mb-6 text-sm text-muted">
        ROUGE and factuality calculations are executed by the original evaluator. Custom datasets require JSONL records with <code>text</code> and <code>summary</code>.
      </p>
      <Progress job={job} />
      <form className="card flex flex-wrap items-end gap-4" onSubmit={submit}>
        <div>
          <label className="label">Maximum samples</label>
          <input
            className="field num w-36"
            type="number"
            min="1"
            max="100"
            value={maxSamples}
            onChange={(event) => setMaxSamples(Number(event.target.value))}
          />
        </div>
        <div>
          <label className="label">Custom JSONL (optional)</label>
          <input
            className="mt-2 block text-xs text-muted file:mr-2 file:rounded-pill file:border file:border-rule file:bg-paper-3 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-paper-3/80"
            type="file"
            accept=".jsonl"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </div>
        <button className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy} type="submit">
          {busy ? 'Evaluating…' : file ? 'Evaluate upload' : 'Run built-in benchmark'}
        </button>
      </form>

      {report && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {metrics.map(([label, value]) => (
              <Metric key={label} label={label} value={label.includes('ROUGE') ? value.toFixed(3) : `${(value * 100).toFixed(1)}%`} />
            ))}
          </div>

          <section className="card mt-6">
            <h2 className="font-semibold text-ink">Lexical vs factuality metrics</h2>
            <div className="mt-5 space-y-3">
              {metrics.map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-ink">{label}</span>
                    <span className="num text-muted">{(value * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2.5 rounded-pill border border-rule bg-paper-3">
                    <div
                      className="h-full w-full rounded-pill bg-accent transition-transform duration-300 ease-out origin-left"
                      style={{ transform: `scaleX(${value})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card mt-6">
            <h2 className="font-semibold text-ink">High ROUGE / low factuality cases</h2>
            {report.high_rouge_low_fact_cases?.length ? (
              report.high_rouge_low_fact_cases.map((item) => (
                <div className="mt-3 rounded-panel border border-alert-rule bg-alert-soft p-3 text-sm" key={item.doc_id}>
                  <b className="num text-alert-ink">{item.doc_id}</b> · ROUGE-L <span className="num">{item.rougeL.toFixed(2)}</span> · numeric precision <span className="num">{(item.numeric_precision * 100).toFixed(1)}%</span>
                  {item.fact_issues.map((issue, index) => (
                    <p className="mt-1 text-alert-ink" key={index}>• {issue.kind}: {issue.detail}</p>
                  ))}
                </div>
              ))
            ) : (
              <p className="mt-2 text-sm text-green">No divergence cases were detected.</p>
            )}
          </section>

          <section className="card mt-6 overflow-auto">
            <h2 className="mb-3 font-semibold text-ink">All evaluated samples ({report.n_samples})</h2>
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-y border-rule bg-paper-3/60 text-xs font-medium text-muted">
                <tr>
                  {['Document', 'R1', 'R2', 'RL', 'NLI', 'Numeric', 'Entity', 'Issues'].map((label) => (
                    <th className="px-3 py-2" key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.all_results.map((item) => (
                  <tr key={item.doc_id} className="border-b border-rule hover:bg-paper-3/40 transition-colors">
                    <td className="num px-3 py-2 font-medium text-ink">{item.doc_id}</td>
                    <td className="num px-3 py-2">{item.rouge1.toFixed(3)}</td>
                    <td className="num px-3 py-2">{item.rouge2.toFixed(3)}</td>
                    <td className="num px-3 py-2">{item.rougeL.toFixed(3)}</td>
                    <td className="num px-3 py-2">{(item.nli_entailment_mean * 100).toFixed(1)}%</td>
                    <td className="num px-3 py-2">{(item.numeric_precision * 100).toFixed(1)}%</td>
                    <td className="num px-3 py-2">{(item.entity_precision * 100).toFixed(1)}%</td>
                    <td className="num px-3 py-2">{item.fact_issues_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </Page>
  )
}

function HistorySettings({ history, refreshHistory, loadRun, setRun, setError }) {
  const nav = useNavigate()
  const [system, setSystem] = useState(null)
  const [values, setValues] = useState(null)
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    try {
      const [machine, config] = await Promise.all([api.system(), api.settings()])
      setSystem(machine)
      setValues(config)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const modify = (key, value) => setValues((current) => ({ ...current, [key]: value }))

  const save = async (event) => {
    event.preventDefault()
    try {
      const response = await api.saveSettings(values)
      setNotice(response.message)
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (id) => {
    if (!window.confirm(`Delete saved run ${id}?`)) return
    try {
      await api.deleteRun(id)
      await refreshHistory()
      setNotice(`Deleted run ${id}.`)
    } catch (err) {
      setError(err.message)
    }
  }

  const reopen = async (id) => {
    const next = await loadRun(id)
    if (next) {
      setRun(next)
      nav('/results')
    }
  }

  return (
    <Page title="History & Settings">
      <div className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
        <section className="space-y-6">
          <div className="card">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <Gauge size={18} /> System
            </h2>
            {system ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Engine" value={system.cuda_available ? system.gpu_name : 'CPU mode'} />
                <Metric label="Device" value={system.device} />
                <Metric label="Precision" value={system.precision} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Loading system state…</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                className="btn btn-secondary text-xs"
                onClick={async () => {
                  try {
                    const response = await api.flush()
                    setNotice(response.message)
                    refresh()
                  } catch (err) {
                    setError(err.message)
                  }
                }}
              >
                Flush cache
              </button>
              <button
                className="btn btn-secondary text-xs"
                onClick={async () => {
                  try {
                    const response = await api.selfTest()
                    setNotice(response.message)
                  } catch (err) {
                    setError(err.message)
                  }
                }}
              >
                Run self-test
              </button>
            </div>
          </div>

          <form className="card" onSubmit={save}>
            <h2 className="font-semibold text-ink">Verification settings</h2>
            {values && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Beam candidates</label>
                  <input
                    className="field num"
                    type="number"
                    min="1"
                    max="8"
                    value={values.n_candidates}
                    onChange={(e) => modify('n_candidates', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">Entailment threshold</label>
                  <input
                    className="field num"
                    type="number"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={values.entailment_threshold}
                    onChange={(e) => modify('entailment_threshold', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">Top-K premises</label>
                  <input
                    className="field num"
                    type="number"
                    min="1"
                    max="6"
                    value={values.top_k_premise}
                    onChange={(e) => modify('top_k_premise', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label">Device</label>
                  <select className="field" value={values.device} onChange={(e) => modify('device', e.target.value)}>
                    <option>auto</option>
                    <option>cuda</option>
                    <option>cpu</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Cache root (non-C:)</label>
                  <input className="field" value={values.cache_root} onChange={(e) => modify('cache_root', e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-rule text-accent focus:ring-accent"
                    checked={values.fp16}
                    onChange={(e) => modify('fp16', e.target.checked)}
                  />
                  <span>FP16 inference</span>
                </label>
              </div>
            )}
            <button className="btn btn-primary mt-5 disabled:opacity-50 disabled:cursor-not-allowed" type="submit">
              Save settings
            </button>
          </form>

          {notice && <p className="rounded-panel border border-rule bg-paper-3 p-3 text-sm text-ink">{notice}</p>}
        </section>

        <section className="card">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <History size={18} /> Saved runs
          </h2>
          {history.length ? (
            <div className="mt-4 space-y-3">
              {history.map((item) => (
                <div key={item.run_id} className="rounded-panel border border-rule bg-paper-2 p-3.5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="num font-mono text-xs font-semibold text-ink">{item.run_id}</span>
                      <span className="ml-2 capitalize text-sm text-muted">{item.domain}</span>
                    </div>
                    <Badge value={item.decision} />
                  </div>
                  <p className="mt-2 text-sm text-muted">{item.summary_snippet || 'No summary'}</p>
                  <p className="num mt-2 text-xs text-muted">{formatDate(item.timestamp)}</p>
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-secondary text-xs" onClick={() => reopen(item.run_id)}>Reopen</button>
                    <a className="btn btn-secondary text-xs" href={api.exportUrl(item.run_id, 'json')}>Export</a>
                    <button className="btn btn-secondary text-xs text-alert-ink hover:opacity-80" onClick={() => remove(item.run_id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No saved runs.</p>
          )}
        </section>
      </div>
    </Page>
  )
}

export default App
