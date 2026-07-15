import { useEffect, useState } from 'react'
import { Control } from './control/Control'
import { Display } from './display/Display'
import { Snapshot, Program, Cue, TimerState, Settings, Message } from '../../main/types'

type WindowMode = 'control' | 'display' | 'stage'

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    timer: { mode: 'countdown', running: false, endTimestamp: null, startTimestamp: null, pausedRemainingMs: null, activeCueId: null },
    remainingMs: 300000,
    program: { name: 'New Program', startTimeOfDay: '10:00', cues: [] },
    activeTitle: '',
    message: null,
    blackout: false,
    settings: {
      bg: '#000000',
      digitColor: '#F5F5F5',
      warningPct: 0.2,
      overtime: true,
      showTitle: true,
      showClock: true,
      showProgress: true,
      showMessage: true,
    }
  })

  const [mode, setMode] = useState<WindowMode>('control')

  useEffect(() => {
    const hash = window.location.hash.slice(1) || '/control'
    if (hash === '/display' || hash === '/stage') setMode('display')
    else setMode('control')
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onSnapshot((snap: Snapshot) => setSnapshot(snap))
    window.api.getSnapshot().then((snap: Snapshot) => setSnapshot(snap))
    return unsubscribe
  }, [])

  const dispatch = (action: string, payload?: any) => {
    switch (action) {
      case 'start-timer':
        window.api.startTimer()
        break
      case 'pause-timer':
        window.api.pauseTimer()
        break
      case 'reset-timer':
        window.api.resetTimer()
        break
      case 'advance-cue':
        window.api.advanceCue()
        break
      case 'previous-cue':
        window.api.previousCue()
        break
      case 'set-message':
        window.api.setMessage(payload)
        break
      case 'set-blackout':
        window.api.setBlackout(payload)
        break
      case 'update-settings':
        window.api.updateSettings(payload)
        break
      case 'update-program':
        window.api.updateProgram(payload)
        break
      case 'set-timer-mode':
        window.api.setTimerMode(payload)
        break
      case 'nudge-timer':
        window.api.nudgeTimer(payload)
        break
    }
  }

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(Math.abs(ms) / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${ms < 0 ? '−' : ''}${m}:${s.toString().padStart(2, '0')}`
  }

  if (mode === 'display') {
    return <Display snapshot={snapshot} />
  }

  return (
    <Control 
      snapshot={snapshot}
      formatMs={formatMs}
      onAction={dispatch}
    />
  )
}

export default App