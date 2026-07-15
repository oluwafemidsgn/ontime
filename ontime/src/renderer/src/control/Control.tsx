import { Snapshot, Cue, Program, TimerMode, Settings } from '../../main/types'
import { useState, useEffect, useMemo } from 'react'

export function Control({ snapshot, onAction }: { snapshot: Snapshot; onAction: any }) {
  const { timer, remainingMs, program, activeTitle, message, blackout, settings } = snapshot
  const [editingCueId, setEditingCueId] = useState<string | null>(null)
  const [newCueTitle, setNewCueTitle] = useState('')
  const [newCueDuration, setNewCueDuration] = useState(5)
  const [showSettings, setShowSettings] = useState(false)
  const [displays, setDisplays] = useState<Array<{ id: number; bounds: any; size: any; workArea: any }>>([])

  const formatMs = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const totalDuration = useMemo(() => 
    program.cues.reduce((sum, c) => sum + c.durationMs, 0), [program.cues])

  const handleAddCue = () => {
    if (!newCueTitle.trim()) return
    const newProgram: Program = {
      ...program,
      cues: [
        ...program.cues,
        { id: Date.now().toString(), title: newCueTitle, durationMs: newCueDuration * 60 * 1000, autoAdvance: false }
      ]
    }
    onAction('update-program', newProgram)
    setNewCueTitle('')
  }

  const handleUpdateCue = (cue: Cue) => {
    const newProgram: Program = {
      ...program,
      cues: program.cues.map(c => c.id === cue.id ? cue : c)
    }
    onAction('update-program', newProgram)
    setEditingCueId(null)
  }

  const handleDeleteCue = (id: string) => {
    const newProgram: Program = {
      ...program,
      cues: program.cues.filter(c => c.id !== id)
    }
    onAction('update-program', newProgram)
  }

  const nudgeDuration = (id: string, deltaMs: number) => {
    const cue = program.cues.find(c => c.id === id)
    if (!cue) return
    handleUpdateCue({ ...cue, durationMs: Math.max(60000, cue.durationMs + deltaMs) })
  }

  useEffect(() => {
    window.displays?.getAll().then(setDisplays).catch(() => {})
  }, [])

  const openDisplay = () => window.api.openDisplay()
  const closeDisplay = () => window.api.closeDisplay()
  const setDisplayMonitor = (displayId: number) => window.api.send?.('display:set-monitor', displayId)

  const quickMessages = [
    { text: 'Wrap up', style: 'flash' as const, autoClearMs: 5000 },
    { text: '2 min left', style: 'flash' as const, autoClearMs: 5000 },
    { text: "Time's up", style: 'flash' as const, autoClearMs: 5000 },
    { text: 'We\'ll start soon', style: 'normal' as const, autoClearMs: 0 },
  ]

  return (
    <div className="control-layout">
      {/* LEFT PANEL - Rundown */}
      <div className="panel rundown-panel">
        <div className="panel-header">
          <h2>Rundown</h2>
          <button className="btn-add" onClick={() => setEditingCueId('new')}>
            + Add Segment
          </button>
        </div>
        <div className="cues-list">
          {program.cues.map((cue, idx) => {
            const isActive = timer.activeCueId === cue.id
            const isEditing = editingCueId === cue.id
            
            if (isEditing) {
              return (
                <div key={cue.id} className="cue-item editing">
                  <input
                    type="text"
                    value={cue.title}
                    onChange={e => setEditingCueId(cue.id)}
                    onBlur={() => handleUpdateCue({ ...cue, title: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateCue({ ...cue, title: e.target.value })}
                    className="cue-title edit"
                    autoFocus
                  />
                  <div className="duration-edit">
                    <button className="btn-duration" onClick={() => nudgeDuration(cue.id, -60000)}>-1m</button>
                    <input
                      type="number"
                      value={Math.round(cue.durationMs / 60000)}
                      onChange={e => handleUpdateCue({ ...cue, durationMs: Math.max(1, parseInt(e.target.value) || 1) * 60000 })}
                      className="cue-duration edit"
                      min="1"
                    />
                    <button className="btn-duration" onClick={() => nudgeDuration(cue.id, 60000)}>+1m</button>
                    <span className="cue-unit">min</span>
                  </div>
                  <div className="cue-actions">
                    <button className="btn-save" onClick={() => handleUpdateCue(cue)}>Save</button>
                    <button className="btn-cancel" onClick={() => setEditingCueId(null)}>Cancel</button>
                    <button className="btn-delete" onClick={() => handleDeleteCue(cue.id)}>Delete</button>
                  </div>
                </div>
              )
            }
            
            return (
              <div key={cue.id} className={`cue-item ${isActive ? 'active' : ''}`}>
                <div className="cue-drag">⋮⋮</div>
                <span className="cue-title-display" onClick={() => setEditingCueId(cue.id)}>
                  {cue.title}
                </span>
                <span className="cue-duration-display">{formatMs(cue.durationMs)}</span>
                <label className="auto-toggle" title={cue.autoAdvance ? 'Auto-advance ON' : 'Auto-advance OFF'}>
                  <input
                    type="checkbox"
                    checked={cue.autoAdvance || false}
                    onChange={e => handleUpdateCue({ ...cue, autoAdvance: e.target.checked })}
                  />
                  <span className="auto-label">↷</span>
                </label>
                <button className="btn-edit" onClick={() => setEditingCueId(cue.id)}>✎</button>
                <button className="btn-delete" onClick={() => handleDeleteCue(cue.id)}>×</button>
              </div>
            )
          })}
          {editingCueId === 'new' && (
            <div className="cue-item new-cue">
              <input
                type="text"
                value={newCueTitle}
                onChange={e => setNewCueTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCue()}
                placeholder="Segment title"
                className="cue-title edit"
                autoFocus
              />
              <div className="duration-edit">
                <button className="btn-duration" onClick={() => setNewCueDuration(Math.max(1, newCueDuration - 1))}>-1m</button>
                <input
                  type="number"
                  value={newCueDuration}
                  onChange={e => setNewCueDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  className="cue-duration edit"
                  min="1"
                />
                <button className="btn-duration" onClick={() => setNewCueDuration(newCueDuration + 1)}>+1m</button>
                <span className="cue-unit">min</span>
              </div>
              <div className="cue-actions">
                <button className="btn-save" onClick={handleAddCue}>Add</button>
                <button className="btn-cancel" onClick={() => setEditingCueId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER PANEL - Timer Controls */}
      <div className="panel timer-panel">
        <div className="panel-header">
          <h2>Timer</h2>
          <select
            value={timer.mode}
            onChange={e => onAction('set-timer-mode', e.target.value as TimerMode)}
            className="mode-select"
          >
            <option value="countdown">Countdown</option>
            <option value="countup">Count Up</option>
            <option value="clock">Clock</option>
          </select>
        </div>
        
        <div className="timer-display">
          <div className={`timer-value ${timer.mode === 'countdown' && remainingMs <= 0 ? 'overtime' : ''} ${remainingMs > 0 && timer.mode === 'countdown' && program.cues.find(c => c.id === timer.activeCueId)?.durationMs && remainingMs / (program.cues.find(c => c.id === timer.activeCueId)?.durationMs || 1) <= settings.warningPct ? 'warning' : ''}`}>
            {formatMs(remainingMs)}
            {timer.mode === 'countdown' && remainingMs <= 0 && '−'}
          </div>
          <div className="timer-meta">
            {timer.activeCueId && <span>Current: {activeTitle}</span>}
            <span>State: <span className={timer.running ? 'running' : 'paused'}>{timer.running ? '▶ RUNNING' : '⏸ PAUSED'}</span></span>
          </div>
        </div>

        <div className="transport-controls">
          <button className="btn btn-primary btn-lg" onClick={() => timer.running ? onAction('pause-timer') : onAction('start-timer')}>
            {timer.running ? '⏸ Pause' : '▶ Start'}
          </button>
          <button className="btn btn-secondary" onClick={() => onAction('reset-timer')}>⏹ Reset</button>
          <button className="btn btn-secondary" onClick={() => onAction('nudge-timer', 60000)}>+1m</button>
          <button className="btn btn-secondary" onClick={() => onAction('nudge-timer', -60000)}>−1m</button>
        </div>

        <div className="cue-navigation">
          <button className="btn btn-secondary" onClick={() => onAction('previous-cue')} disabled={!timer.activeCueId || program.cues[0]?.id === timer.activeCueId}>
            ◀ Previous
          </button>
          <button className="btn btn-secondary" onClick={() => onAction('advance-cue')} disabled={!timer.activeCueId || program.cues[program.cues.length - 1]?.id === timer.activeCueId}>
            Next ▶
          </button>
          <button className="btn btn-primary" onClick={() => timer.activeCueId ? onAction('advance-cue') : onAction('start-timer')}>
            Load & Start
          </button>
        </div>
      </div>

      {/* RIGHT PANEL - Preview + Messages (stacked vertically) */}
      <div className="panel preview-panel">
        {/* 16:9 Preview Display */}
        <div className="preview-display-container">
          <div className="preview-display-label">PREVIEW (16:9)</div>
          <div className="preview-display" style={{background: settings.bg}}>
            {(settings.showTitle || settings.showClock) && (
              <header className="display-header">
                {settings.showTitle && (
                  <h1 className="session-title">{activeTitle || (program.cues[0]?.title || 'Ready')}</h1>
                )}
                {settings.showClock && (
                  <div className="clock">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                )}
              </header>
            )}
            
            <div className="timer-container">
              <div className={`timer-digits ${timer.mode === 'countdown' && remainingMs <= 0 ? 'overtime' : ''} ${remainingMs > 0 && timer.mode === 'countdown' && program.cues.find(c => c.id === timer.activeCueId)?.durationMs && remainingMs / (program.cues.find(c => c.id === timer.activeCueId)?.durationMs || 1) <= settings.warningPct ? 'warning' : ''}`} style={{color: settings.digitColor}}>
                {timer.mode === 'countdown' && remainingMs <= 0 ? '−' : ''}
                {formatMs(remainingMs)}
              </div>
            </div>

            {settings.showProgress && timer.mode === 'countdown' && timer.activeCueId && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className={`progress-fill ${remainingMs > 0 && timer.mode === 'countdown' && program.cues.find(c => c.id === timer.activeCueId)?.durationMs && remainingMs / (program.cues.find(c => c.id === timer.activeCueId)?.durationMs || 1) <= settings.warningPct ? 'warning' : ''} ${timer.mode === 'countdown' && remainingMs <= 0 ? 'overtime' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(0, (1 - remainingMs / (program.cues.find(c => c.id === timer.activeCueId)?.durationMs || 1))) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {settings.showMessage && message?.visible && message.text && (
              <div className={`message-banner ${message.style === 'flash' ? 'flash' : ''}`}>
                <div className="message-text">{message.text}</div>
              </div>
            )}
          </div>
        </div>

        {/* Messages Section */}
        <div className="messages-panel">
          <div className="panel-header">
            <h2>Messages</h2>
            <button className="btn-add" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? '⚙ Hide Settings' : '⚙ Settings'}
            </button>
          </div>
          
          {!showSettings && (
            <>
              <div className="quick-messages">
                {quickMessages.map((qm, i) => {
                  const isActive = message?.visible && message.text === qm.text;
                  return (
                    <button
                      key={i}
                      className={`btn-quick ${isActive ? 'active-message' : ''}`}
                      onClick={() => onAction('set-message', { text: qm.text, style: qm.style, visible: true, autoClearMs: qm.autoClearMs })}
                      style={isActive ? { animation: 'pulse-highlight 1s ease-in-out infinite' } : {}}
                    >
                      {qm.text}
                    </button>
                  );
                })}
              </div>
              <div className="custom-message">
                <input
                  type="text"
                  placeholder="Custom message..."
                  onKeyDown={e => e.key === 'Enter' && e.target.value && onAction('set-message', { text: e.target.value, style: 'normal', visible: true, autoClearMs: 0 }) && (e.target.value = '')}
                  className="message-input"
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={message?.visible}
                    onChange={e => onAction('set-message', e.target.checked ? { text: message?.text || '', style: 'normal' as const, visible: true, autoClearMs: 0 } : null)}
                  />
                  Keep on screen
                </label>
              </div>
              <div className="blackout-control">
                <label className="checkbox-label">
                  <input type="checkbox" checked={blackout} onChange={e => onAction('set-blackout', e.target.checked)} />
                  🌑 Blackout
                </label>
              </div>
            </>
          )}

          {showSettings && (
            <div className="settings-panel">
              <h3>Display Settings</h3>
              <div className="setting-row">
                <label>Warning at %</label>
                <div className="setting-control">
                  <input type="range" min="0" max="1" step="0.05" value={settings.warningPct} onChange={e => onAction('update-settings', { warningPct: parseFloat(e.target.value) })} />
                  <span>{Math.round(settings.warningPct * 100)}%</span>
                </div>
              </div>
              <div className="setting-row">
                <label>Overtime count-up</label>
                <div className="setting-control">
                  <input type="checkbox" checked={settings.overtime} onChange={e => onAction('update-settings', { overtime: e.target.checked })} />
                </div>
              </div>
              <div className="setting-row">
                <label>Show Title</label>
                <div className="setting-control">
                  <input type="checkbox" checked={settings.showTitle} onChange={e => onAction('update-settings', { showTitle: e.target.checked })} />
                </div>
              </div>
              <div className="setting-row">
                <label>Show Clock</label>
                <div className="setting-control">
                  <input type="checkbox" checked={settings.showClock} onChange={e => onAction('update-settings', { showClock: e.target.checked })} />
                </div>
              </div>
              <div className="setting-row">
                <label>Show Progress Bar</label>
                <div className="setting-control">
                  <input type="checkbox" checked={settings.showProgress} onChange={e => onAction('update-settings', { showProgress: e.target.checked })} />
                </div>
              </div>
              <div className="setting-row">
                <label>Show Messages</label>
                <div className="setting-control">
                  <input type="checkbox" checked={settings.showMessage} onChange={e => onAction('update-settings', { showMessage: e.target.checked })} />
                </div>
              </div>
              <div className="setting-row">
                <label>Background Color</label>
                <div className="setting-control">
                  <input type="color" value={settings.bg} onChange={e => onAction('update-settings', { bg: e.target.value })} />
                </div>
              </div>
              <div className="setting-row">
                <label>Digit Color</label>
                <div className="setting-control">
                  <input type="color" value={settings.digitColor} onChange={e => onAction('update-settings', { digitColor: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          <div className="footer-controls">
            <div className="monitor-select">
              <label>Output Display:</label>
              <select 
                value={displays.length > 1 ? displays[1]?.id : displays[0]?.id}
                onChange={e => setDisplayMonitor(parseInt(e.target.value))}
                className="footer-select"
              >
                {displays.map((d, i) => (
                  <option key={d.id} value={d.id}>
                    {i === 0 ? 'Primary (Laptop)' : `Display ${d.id} (${d.size.width}x${d.size.height})`}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary" onClick={openDisplay}>Open Display</button>
              <button className="btn btn-secondary" onClick={closeDisplay}>Close Display</button>
            </div>
          </div>
        </div>
      </div>

      <footer className="footer-bar">
        <div className="footer-left">
          <span className="footer-info">
            Starts: {program.startTimeOfDay || '--:--'} · 
            Total: {formatMs(totalDuration)}
          </span>
        </div>
        <div className="footer-center">
          <span className="footer-info">
            Output: {displays.length > 1 ? `Display ${displays[1]?.id} (${displays[1]?.size?.width}x${displays[1]?.size?.height})` : 'Single display'}
          </span>
        </div>
        <div className="footer-right">
          <button className="btn btn-fullscreen" onClick={() => displayWindow?.setFullScreen?.(!displayWindow?.isFullScreen?.())}>
            ⛶ Fullscreen
          </button>
        </div>
      </footer>
    </div>
  )
}