import { useEffect, useState } from 'react'
import { Snapshot } from '../../../main/types'
import { formatDuration, formatClock } from '../lib/format'
import { readableOn, MESSAGE_FONT_STACKS } from '../lib/theme'

export function Display({ snapshot }: { snapshot: Snapshot }): JSX.Element {
  const { timer, remainingMs, program, activeTitle, message, blackout, settings, phase, overMs, upNext } =
    snapshot
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    document.body.style.cursor = 'none'
    return () => {
      document.body.style.cursor = ''
    }
  }, [])

  if (blackout) {
    return <div className="stage-out" style={{ background: '#000' }} />
  }

  const isColored = phase === 'warning' || phase === 'timeup'
  const bg = phase === 'warning' ? settings.warnBg : phase === 'timeup' ? settings.overBg : settings.bg
  const fg = isColored ? readableOn(bg) : settings.digitColor
  const showChrome = timer.mode !== 'clock'

  const readout = timer.mode === 'clock' ? formatClock(now, true) : formatDuration(remainingMs)

  const messageStyle: React.CSSProperties = {
    fontFamily: MESSAGE_FONT_STACKS[settings.msgFont],
    color: settings.msgColor,
    ['--msg-scale' as string]: settings.msgScale,
  }

  const header =
    showChrome && (settings.showTitle || settings.showClock) ? (
      <header className="stage-head" style={{ color: fg }}>
        {settings.showTitle ? (
          <h1 className="stage-title">{activeTitle || program.cues[0]?.title || ''}</h1>
        ) : (
          <span />
        )}
        {settings.showClock && <div className="stage-clock tnum">{formatClock(now)}</div>}
      </header>
    ) : null

  const messageEl =
    settings.showMessage && message?.visible && message.text ? (
      <div className={`stage-message ${message.style === 'flash' ? 'flash' : ''}`} style={messageStyle}>
        {message.text}
      </div>
    ) : null

  // ---- Up-next transition screen ------------------------------------------
  if (phase === 'transition') {
    const secs = Math.ceil((upNext?.countdownMs ?? 0) / 1000)
    return (
      <div className="stage-out" style={{ background: settings.bg, color: settings.digitColor }}>
        <div className="stage-center transition">
          <div className="transition-label">Up next</div>
          <div className="transition-title">{upNext?.title ?? ''}</div>
          <div className="transition-count">
            <span className="tnum transition-secs">{secs}</span>
            <span className="transition-secs-label">seconds</span>
          </div>
        </div>
        {messageEl}
      </div>
    )
  }

  // ---- Time-up screen ------------------------------------------------------
  if (phase === 'timeup') {
    return (
      <div className="stage-out phase-timeup" style={{ background: bg, color: fg }}>
        {header}
        <div className="stage-center timeup">
          <div className="timeup-word">TIME&nbsp;UP</div>
          {overMs > 0 && <div className="timeup-over tnum">+{formatDuration(overMs)} over</div>}
        </div>
        {messageEl}
      </div>
    )
  }

  // ---- Normal + warning ----------------------------------------------------
  const durationMs = program.cues.find((c) => c.id === timer.activeCueId)?.durationMs ?? 1
  const progress =
    timer.mode === 'countdown' ? Math.min(1, Math.max(0, 1 - remainingMs / durationMs)) : 0

  return (
    <div className={`stage-out phase-${phase}`} style={{ background: bg, color: fg }}>
      {header}
      <div className="stage-center">
        <div className="stage-digits tnum" style={{ color: fg }}>
          {readout}
        </div>
      </div>
      {showChrome && settings.showProgress && timer.mode === 'countdown' && timer.activeCueId && (
        <div className="stage-progress" style={{ background: `color-mix(in srgb, ${fg} 16%, transparent)` }}>
          <div className="stage-progress-fill" style={{ width: `${progress * 100}%`, background: fg }} />
        </div>
      )}
      {messageEl}
    </div>
  )
}
