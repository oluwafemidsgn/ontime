import { useEffect, useMemo, useRef, useState } from 'react'
import { Snapshot, Cue, Program, TimerMode, Settings as SettingsType, MessageFont } from '../../../main/types'
import { DisplayInfo } from '../global'
import { formatDuration, formatClock, scheduledStarts } from '../lib/format'
import { readableOn, MESSAGE_FONT_STACKS, MESSAGE_FONT_LABELS } from '../lib/theme'

const QUICK_MESSAGES = [
  { text: 'Please wrap up', style: 'flash' as const, autoClearMs: 6000 },
  { text: '2 minutes left', style: 'flash' as const, autoClearMs: 6000 },
  { text: "Time's up", style: 'flash' as const, autoClearMs: 6000 },
  { text: "We'll begin shortly", style: 'normal' as const, autoClearMs: 0 },
]

const api = () => window.api

interface Draft {
  title: string
  minutes: number
}

export function Control({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const { timer, remainingMs, program, activeTitle, message, blackout, settings, phase, upNext } =
    snapshot

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ title: '', minutes: 5 })
  const [adding, setAdding] = useState(false)
  const [newCue, setNewCue] = useState<Draft>({ title: '', minutes: 5 })
  const [customMsg, setCustomMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [displayOpen, setDisplayOpen] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    window.displays.getAll().then(setDisplays)
    const off1 = window.displays.onChange((d) => setDisplays(d as DisplayInfo[]))
    const off2 = api().onDisplayState(setDisplayOpen)
    return () => {
      off1()
      off2()
    }
  }, [])

  // window-scoped shortcuts — these never leak to other apps (no globalShortcut)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
        return
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          timer.running ? api().pauseTimer() : api().startTimer()
          break
        case 'r':
          api().resetTimer()
          break
        case 'n':
          api().advanceCue()
          break
        case 'p':
          api().previousCue()
          break
        case 'b':
          api().setBlackout(!blackout)
          break
        case 'arrowup':
          e.preventDefault()
          api().nudgeTimer(60000)
          break
        case 'arrowdown':
          e.preventDefault()
          api().nudgeTimer(-60000)
          break
        case 'escape':
          api().setMessage(null)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [timer.running, blackout])

  const activeCue = program.cues.find((c) => c.id === timer.activeCueId)
  const activeIdx = program.cues.findIndex((c) => c.id === timer.activeCueId)
  const isTransition = phase === 'transition'
  const isTimeUp = phase === 'timeup'
  const isWarn = phase === 'warning'

  const totalDuration = useMemo(
    () => program.cues.reduce((s, c) => s + c.durationMs, 0),
    [program.cues]
  )
  const starts = useMemo(
    () => scheduledStarts(program.cues, program.startTimeOfDay),
    [program.cues, program.startTimeOfDay, now.getMinutes()]
  )

  const nextCue = activeIdx >= 0 ? program.cues[activeIdx + 1] : program.cues[0]
  const nextStartIdx = nextCue ? program.cues.indexOf(nextCue) : -1

  const readout =
    timer.mode === 'clock'
      ? formatClock(now, true)
      : isTransition
        ? formatDuration(upNext?.countdownMs ?? 0)
        : formatDuration(remainingMs)

  const stateLabel = isTransition
    ? 'UP NEXT'
    : isTimeUp
      ? 'TIME UP'
      : !timer.activeCueId
        ? 'READY'
        : timer.running
          ? 'ON AIR'
          : 'HOLD'
  const stateTone = isTransition ? 'next' : isTimeUp ? 'over' : timer.running ? 'live' : 'hold'

  // ---- program mutations ----
  const commit = (cues: Cue[]): void => api().updateProgram({ ...program, cues } as Program)

  const addCue = (): void => {
    if (!newCue.title.trim()) return
    commit([
      ...program.cues,
      {
        id: `${Date.now()}`,
        title: newCue.title.trim(),
        durationMs: Math.max(1, newCue.minutes) * 60000,
        autoAdvance: false,
      },
    ])
    setNewCue({ title: '', minutes: 5 })
    setAdding(false)
  }

  const saveEdit = (id: string): void => {
    commit(
      program.cues.map((c) =>
        c.id === id
          ? { ...c, title: draft.title.trim() || c.title, durationMs: Math.max(1, draft.minutes) * 60000 }
          : c
      )
    )
    setEditingId(null)
  }

  const deleteCue = (id: string): void => commit(program.cues.filter((c) => c.id !== id))
  const toggleAuto = (id: string): void =>
    commit(program.cues.map((c) => (c.id === id ? { ...c, autoAdvance: !c.autoAdvance } : c)))
  const moveCue = (index: number, dir: -1 | 1): void => {
    const next = [...program.cues]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
  }
  const beginEdit = (cue: Cue): void => {
    setEditingId(cue.id)
    setDraft({ title: cue.title, minutes: Math.round(cue.durationMs / 60000) })
  }

  const sendCustom = (): void => {
    const text = customMsg.trim()
    if (!text) return
    api().setMessage({ text, style: 'normal', visible: true, autoClearMs: 0 })
    setCustomMsg('')
  }

  // ---- save / load program ----
  const exportProgram = (): void => {
    const blob = new Blob([JSON.stringify(program, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(program.name || 'program').replace(/\s+/g, '-').toLowerCase()}.ontime.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importProgram = (file: File): void => {
    const reader = new FileReader()
    reader.onload = (): void => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (parsed && Array.isArray(parsed.cues)) {
          api().updateProgram({
            name: parsed.name ?? 'Imported program',
            startTimeOfDay: parsed.startTimeOfDay ?? program.startTimeOfDay,
            cues: parsed.cues,
          })
        }
      } catch {
        /* ignore invalid file */
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">ontime</span>
          <span className="brand-sub">stage timer</span>
        </div>

        <div className="topbar-meta">
          <label className="meta-field">
            <span>Program starts</span>
            <input
              type="time"
              value={program.startTimeOfDay ?? ''}
              onChange={(e) => api().updateProgram({ ...program, startTimeOfDay: e.target.value })}
            />
          </label>
          <div className="meta-field">
            <span>Total runtime</span>
            <strong className="tnum">{formatDuration(totalDuration)}</strong>
          </div>
          <div className="meta-field">
            <span>Time of day</span>
            <strong className="tnum">{formatClock(now, true)}</strong>
          </div>
        </div>

        <div className="display-controls">
          <select
            className="select"
            value={displays.find((d) => !d.internal)?.id ?? displays[0]?.id ?? ''}
            onChange={(e) => api().setDisplayMonitor(Number(e.target.value))}
            title="Output monitor"
          >
            {displays.map((d, i) => (
              <option key={d.id} value={d.id}>
                {d.internal ? `Laptop (${d.size.width}×${d.size.height})` : `Monitor ${i + 1} (${d.size.width}×${d.size.height})`}
              </option>
            ))}
          </select>
          {displayOpen ? (
            <>
              <button className="btn ghost" onClick={() => api().toggleFullscreen()}>⛶ Fullscreen</button>
              <button className="btn ghost" onClick={() => api().closeDisplay()}>Close output</button>
            </>
          ) : (
            <button className="btn accent" onClick={() => api().openDisplay()}>Open output</button>
          )}
        </div>
      </header>

      <main className="grid">
        {/* Rundown */}
        <section className="panel rundown">
          <div className="panel-head">
            <h2>Rundown</h2>
            <div className="head-actions">
              <button className="icon-btn always" onClick={exportProgram} title="Save program to file">⤓</button>
              <button className="icon-btn always" onClick={() => fileInputRef.current?.click()} title="Load program from file">⤒</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && importProgram(e.target.files[0])}
              />
              <button
                className="btn small"
                onClick={() => {
                  setAdding(true)
                  setTimeout(() => addInputRef.current?.focus(), 0)
                }}
              >
                + Segment
              </button>
            </div>
          </div>

          <div className="cue-list">
            {program.cues.length === 0 && !adding && (
              <p className="empty">No segments yet. Add one to build your rundown.</p>
            )}

            {program.cues.map((cue, i) => {
              const isActive = timer.activeCueId === cue.id
              if (editingId === cue.id) {
                return (
                  <div key={cue.id} className="cue editing">
                    <input
                      className="cue-input"
                      value={draft.title}
                      autoFocus
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(cue.id)}
                    />
                    <div className="stepper">
                      <button onClick={() => setDraft((d) => ({ ...d, minutes: Math.max(1, d.minutes - 1) }))}>−</button>
                      <input
                        type="number"
                        min={1}
                        value={draft.minutes}
                        onChange={(e) => setDraft((d) => ({ ...d, minutes: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                      <button onClick={() => setDraft((d) => ({ ...d, minutes: d.minutes + 1 }))}>+</button>
                      <span className="unit">min</span>
                    </div>
                    <div className="cue-edit-actions">
                      <button className="btn small accent" onClick={() => saveEdit(cue.id)}>Save</button>
                      <button className="btn small ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={cue.id} className={`cue ${isActive ? 'active' : ''}`} onDoubleClick={() => beginEdit(cue)}>
                  <div className="cue-order">
                    <button onClick={() => moveCue(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                    <button onClick={() => moveCue(i, 1)} disabled={i === program.cues.length - 1} aria-label="Move down">▼</button>
                  </div>
                  <button className="cue-main" onClick={() => api().loadCue(cue.id)} title="Load this segment">
                    <span className="cue-index tnum">{String(i + 1).padStart(2, '0')}</span>
                    <span className="cue-title">{cue.title}</span>
                    {starts[i] && <span className="cue-start tnum">{formatClock(starts[i]!)}</span>}
                  </button>
                  <span className="cue-dur tnum">{formatDuration(cue.durationMs)}</span>
                  <button
                    className={`icon-btn auto ${cue.autoAdvance ? 'on' : ''}`}
                    onClick={() => toggleAuto(cue.id)}
                    title={cue.autoAdvance ? 'Auto-advance on' : 'Auto-advance off'}
                  >
                    ↻
                  </button>
                  <button className="icon-btn" onClick={() => beginEdit(cue)} title="Edit">✎</button>
                  <button className="icon-btn danger" onClick={() => deleteCue(cue.id)} title="Delete">×</button>
                </div>
              )
            })}

            {adding && (
              <div className="cue editing new">
                <input
                  ref={addInputRef}
                  className="cue-input"
                  placeholder="Segment title"
                  value={newCue.title}
                  onChange={(e) => setNewCue((d) => ({ ...d, title: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addCue()}
                />
                <div className="stepper">
                  <button onClick={() => setNewCue((d) => ({ ...d, minutes: Math.max(1, d.minutes - 1) }))}>−</button>
                  <input
                    type="number"
                    min={1}
                    value={newCue.minutes}
                    onChange={(e) => setNewCue((d) => ({ ...d, minutes: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                  <button onClick={() => setNewCue((d) => ({ ...d, minutes: d.minutes + 1 }))}>+</button>
                  <span className="unit">min</span>
                </div>
                <div className="cue-edit-actions">
                  <button className="btn small accent" onClick={addCue}>Add</button>
                  <button className="btn small ghost" onClick={() => setAdding(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Timer + transport */}
        <section className="panel stage">
          <div className="panel-head">
            <h2>Timer</h2>
            <select className="select" value={timer.mode} onChange={(e) => api().setTimerMode(e.target.value as TimerMode)}>
              <option value="countdown">Countdown</option>
              <option value="countup">Count up</option>
              <option value="clock">Clock</option>
            </select>
          </div>

          <div className="readout-wrap">
            <div className="cue-now">
              {isTransition ? `Up next · ${upNext?.title ?? ''}` : activeTitle || activeCue?.title || 'No segment loaded'}
            </div>
            <div className={`readout tnum ${isWarn ? 'warn' : ''} ${isTimeUp ? 'over' : ''} ${isTransition ? 'next' : ''}`}>
              {readout}
            </div>
            <div className={`state-pill ${stateTone}`}>
              <span className="pip" />
              {stateLabel}
            </div>
            {nextCue && !isTransition && (
              <div className="upnext-hint">
                Up next: <strong>{nextCue.title}</strong>
                {nextStartIdx >= 0 && starts[nextStartIdx] && <span className="tnum"> · {formatClock(starts[nextStartIdx]!)}</span>}
              </div>
            )}
          </div>

          <div className="transport">
            <button
              className={`btn xl ${timer.running ? 'hold' : 'go'}`}
              onClick={() => (timer.running ? api().pauseTimer() : api().startTimer())}
            >
              {timer.running ? '⏸ Pause' : '▶ Start'}
            </button>
            <button className="btn lg ghost reset" onClick={() => api().resetTimer()}>⏹ Reset</button>
          </div>

          <div className="nav-grid">
            <button className="btn lg ghost" onClick={() => api().nudgeTimer(-60000)}>−1 min</button>
            <button className="btn lg ghost" onClick={() => api().nudgeTimer(60000)}>+1 min</button>
            <button className="btn lg ghost" onClick={() => api().previousCue()}>◀ Prev</button>
            <button className="btn lg ghost" onClick={() => api().advanceCue()}>Next ▶</button>
          </div>

          <div className="shortcuts">
            <span><kbd>Space</kbd> start/pause</span>
            <span><kbd>R</kbd> reset</span>
            <span><kbd>N</kbd>/<kbd>P</kbd> next/prev</span>
            <span><kbd>↑</kbd>/<kbd>↓</kbd> ±1 min</span>
            <span><kbd>B</kbd> blackout</span>
          </div>
        </section>

        {/* Preview + messages */}
        <section className="panel side">
          <div className="preview-wrap">
            <div className="preview-label">
              Live output preview {displayOpen && <span className="live-tag">● live</span>}
            </div>
            <Preview snapshot={snapshot} now={now} />
          </div>

          <div className="panel-head tight">
            <h2>{showSettings ? 'Settings' : 'Messages'}</h2>
            <button className="btn small ghost" onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? 'Done' : '⚙ Settings'}
            </button>
          </div>

          {showSettings ? (
            <Settings settings={settings} />
          ) : (
            <div className="messages">
              <div className="quick-grid">
                {QUICK_MESSAGES.map((qm) => {
                  const on = message?.visible && message.text === qm.text
                  return (
                    <button
                      key={qm.text}
                      className={`chip ${qm.style} ${on ? 'on' : ''}`}
                      onClick={() => api().setMessage({ text: qm.text, style: qm.style, visible: true, autoClearMs: qm.autoClearMs })}
                    >
                      {qm.text}
                    </button>
                  )
                })}
              </div>
              <div className="custom-row">
                <input
                  className="text-input"
                  placeholder="Custom message…"
                  value={customMsg}
                  onChange={(e) => setCustomMsg(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendCustom()}
                />
                <button className="btn accent" onClick={sendCustom}>Send</button>
              </div>
              <div className="msg-actions">
                <button className="btn ghost block" onClick={() => api().setMessage(null)} disabled={!message?.visible}>
                  Clear message
                </button>
                <button className={`btn block ${blackout ? 'danger-solid' : 'danger'}`} onClick={() => api().setBlackout(!blackout)}>
                  {blackout ? '● Blackout on' : '○ Blackout'}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live preview — mirrors the Display output exactly (phase-aware)
// ---------------------------------------------------------------------------
function Preview({ snapshot, now }: { snapshot: Snapshot; now: Date }): JSX.Element {
  const { timer, remainingMs, program, activeTitle, message, blackout, settings, phase, overMs, upNext } =
    snapshot

  if (blackout) return <div className="preview" style={{ background: '#000' }} />

  const isColored = phase === 'warning' || phase === 'timeup'
  const bg = phase === 'warning' ? settings.warnBg : phase === 'timeup' ? settings.overBg : settings.bg
  const fg = isColored ? readableOn(bg) : settings.digitColor
  const showChrome = timer.mode !== 'clock'
  const readout = timer.mode === 'clock' ? formatClock(now, true) : formatDuration(remainingMs)
  const durationMs = program.cues.find((c) => c.id === timer.activeCueId)?.durationMs ?? 1
  const progress = timer.mode === 'countdown' ? Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) : 0

  const messageStyle: React.CSSProperties = {
    fontFamily: MESSAGE_FONT_STACKS[settings.msgFont],
    color: settings.msgColor,
    ['--msg-scale' as string]: settings.msgScale,
  }
  const messageEl =
    settings.showMessage && message?.visible && message.text ? (
      <div className={`pv-message ${message.style === 'flash' ? 'flash' : ''}`} style={messageStyle}>
        {message.text}
      </div>
    ) : null

  if (phase === 'transition') {
    return (
      <div className="preview" style={{ background: settings.bg, color: settings.digitColor }}>
        <div className="pv-transition">
          <span className="pv-t-label">Up next</span>
          <span className="pv-t-title">{upNext?.title ?? ''}</span>
          <span className="pv-t-count tnum">{Math.ceil((upNext?.countdownMs ?? 0) / 1000)}s</span>
        </div>
        {messageEl}
      </div>
    )
  }

  return (
    <div className={`preview phase-${phase}`} style={{ background: bg, color: fg }}>
      {showChrome && (settings.showTitle || settings.showClock) && (
        <div className="pv-head">
          {settings.showTitle && <span className="pv-title">{activeTitle || program.cues[0]?.title || 'Ready'}</span>}
          {settings.showClock && <span className="pv-clock tnum">{formatClock(now)}</span>}
        </div>
      )}
      {phase === 'timeup' ? (
        <div className="pv-timeup">
          <span className="pv-timeup-word">TIME UP</span>
          {overMs > 0 && <span className="pv-timeup-over tnum">+{formatDuration(overMs)}</span>}
        </div>
      ) : (
        <div className="pv-timer tnum" style={{ color: fg }}>{readout}</div>
      )}
      {showChrome && settings.showProgress && timer.mode === 'countdown' && timer.activeCueId && phase !== 'timeup' && (
        <div className="pv-progress" style={{ background: `color-mix(in srgb, ${fg} 18%, transparent)` }}>
          <div className="pv-progress-fill" style={{ width: `${progress * 100}%`, background: fg }} />
        </div>
      )}
      {messageEl}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings drawer
// ---------------------------------------------------------------------------
function Settings({ settings }: { settings: SettingsType }): JSX.Element {
  const set = (partial: Partial<SettingsType>): void => window.api.updateSettings(partial)
  const toggles: [keyof SettingsType, string][] = [
    ['showTitle', 'Show title'],
    ['showClock', 'Show clock'],
    ['showProgress', 'Show progress bar'],
    ['showMessage', 'Show messages'],
    ['overtime', 'Count into overtime'],
  ]
  return (
    <div className="settings">
      <div className="set-group">Warning &amp; time-up</div>
      <label className="set-row">
        <span>Warning at {Math.round(settings.warningPct * 100)}%</span>
        <input type="range" min={0.05} max={0.5} step={0.05} value={settings.warningPct} onChange={(e) => set({ warningPct: parseFloat(e.target.value) })} />
      </label>
      <div className="set-row">
        <span>Warning background</span>
        <input type="color" value={settings.warnBg} onChange={(e) => set({ warnBg: e.target.value })} />
      </div>
      <div className="set-row">
        <span>Time-up background</span>
        <input type="color" value={settings.overBg} onChange={(e) => set({ overBg: e.target.value })} />
      </div>
      <label className="set-row">
        <span>“Time up” holds for {settings.timeUpSec}s</span>
        <input type="range" min={0} max={30} step={1} value={settings.timeUpSec} onChange={(e) => set({ timeUpSec: Number(e.target.value) })} />
      </label>
      <label className="set-row">
        <span>Up-next countdown {settings.transitionSec}s</span>
        <input type="range" min={5} max={60} step={5} value={settings.transitionSec} onChange={(e) => set({ transitionSec: Number(e.target.value) })} />
      </label>

      <div className="set-group">Messages</div>
      <div className="set-row">
        <span>Message font</span>
        <select className="select" value={settings.msgFont} onChange={(e) => set({ msgFont: e.target.value as MessageFont })}>
          {(Object.keys(MESSAGE_FONT_LABELS) as MessageFont[]).map((f) => (
            <option key={f} value={f}>{MESSAGE_FONT_LABELS[f]}</option>
          ))}
        </select>
      </div>
      <label className="set-row">
        <span>Message size {Math.round(settings.msgScale * 100)}%</span>
        <input type="range" min={0.6} max={2} step={0.1} value={settings.msgScale} onChange={(e) => set({ msgScale: parseFloat(e.target.value) })} />
      </label>
      <div className="set-row">
        <span>Message color</span>
        <input type="color" value={settings.msgColor} onChange={(e) => set({ msgColor: e.target.value })} />
      </div>

      <div className="set-group">Display</div>
      <div className="set-row">
        <span>Background</span>
        <input type="color" value={settings.bg} onChange={(e) => set({ bg: e.target.value })} />
      </div>
      <div className="set-row">
        <span>Digits</span>
        <input type="color" value={settings.digitColor} onChange={(e) => set({ digitColor: e.target.value })} />
      </div>
      {toggles.map(([key, label]) => (
        <label key={key} className="set-row switch">
          <span>{label}</span>
          <input type="checkbox" checked={settings[key] as boolean} onChange={(e) => set({ [key]: e.target.checked } as Partial<SettingsType>)} />
        </label>
      ))}
    </div>
  )
}
