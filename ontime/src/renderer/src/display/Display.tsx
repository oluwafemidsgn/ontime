import { useEffect, useState } from 'react'
import { Snapshot } from '../../main/types'

export function Display({ snapshot }: { snapshot: Snapshot }) {
  const { timer, remainingMs, program, activeTitle, message, blackout, settings } = snapshot
  const [currentTime, setCurrentTime] = useState(new Date())
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])
  
  if (blackout) {
    return (
      <div className="display-layout display-blackout">
        <div className="blackout-indicator">BLACKOUT</div>
      </div>
    )
  }

  const activeCue = program.cues.find(c => c.id === timer.activeCueId)
  const totalDuration = activeCue?.durationMs || 1
  const progress = timer.mode === 'countdown' 
    ? Math.max(0, Math.min(1, (totalDuration - remainingMs) / totalDuration))
    : timer.mode === 'countup' && timer.startTimestamp
      ? Math.min(1, (Date.now() - timer.startTimestamp) / (timer.startTimestamp + 3600000)) // arbitrary for countup
      : 0

  const isWarning = timer.mode === 'countdown' && remainingMs > 0 && remainingMs / totalDuration <= settings.warningPct
  const isOvertime = timer.mode === 'countdown' && remainingMs <= 0
  const isCountUp = timer.mode === 'countup'

  const formatMs = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(Math.abs(ms) / 1000))
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatClock = () => {
    return currentTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatCountUp = () => {
    if (!timer.startTimestamp) return '0:00'
    const elapsed = Date.now() - timer.startTimestamp
    return formatMs(elapsed)
  }

  const formatClockMode = () => {
    return currentTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    })
  }

  let timerDisplay: string
  let showNegative = false
  if (timer.mode === 'countdown') {
    timerDisplay = formatMs(remainingMs)
    showNegative = remainingMs <= 0
  } else if (timer.mode === 'countup') {
    timerDisplay = formatCountUp()
  } else {
    timerDisplay = formatClockMode()
  }

  return (
    <div className="display-layout">
      {(settings.showTitle || settings.showClock) && timer.mode !== 'clock' && (
        <header className="display-header">
          {settings.showTitle && (
            <h1 className="session-title">{activeTitle || (program.cues[0]?.title || 'Ready')}</h1>
          )}
          {settings.showClock && timer.mode !== 'clock' && (
            <div className="clock">{formatClock()}</div>
          )}
        </header>
      )}
      
      <div className="timer-container">
        <div className={`timer-digits ${isWarning ? 'warning' : ''} ${isOvertime ? 'overtime' : ''} ${timer.mode === 'clock' ? 'clock-mode' : ''}`}>
          {showNegative ? '−' : ''}
          {timerDisplay}
        </div>
      </div>

      {settings.showProgress && timer.mode === 'countdown' && timer.activeCueId && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className={`progress-fill ${isWarning ? 'warning' : ''} ${isOvertime ? 'overtime' : ''}`}
              style={{ width: `${Math.min(100, progress * 100)}%` }}
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
  )
}