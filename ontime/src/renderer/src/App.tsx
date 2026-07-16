import { useEffect, useState } from 'react'
import { Control } from './control/Control'
import { Display } from './display/Display'
import { Snapshot } from '../../main/types'

const INITIAL_SNAPSHOT: Snapshot = {
  timer: {
    mode: 'countdown',
    running: false,
    endTimestamp: null,
    startTimestamp: null,
    pausedRemainingMs: null,
    activeCueId: null,
  },
  remainingMs: 300000,
  program: { name: 'New Program', startTimeOfDay: '10:00', cues: [] },
  activeTitle: '',
  message: null,
  blackout: false,
  settings: {
    bg: '#000000',
    digitColor: '#F5F5F5',
    warnBg: '#F5A524',
    overBg: '#E5484D',
    warningPct: 0.2,
    overtime: true,
    timeUpSec: 10,
    transitionSec: 30,
    msgFont: 'sans',
    msgScale: 1,
    msgColor: '#FFFFFF',
    showTitle: true,
    showClock: true,
    showProgress: true,
    showMessage: true,
  },
  phase: 'normal',
  overMs: 0,
  upNext: null,
}

const isDisplay = (): boolean => window.location.hash.replace('#', '').startsWith('/display')

export function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL_SNAPSHOT)

  useEffect(() => {
    const unsubscribe = window.api.onSnapshot(setSnapshot)
    window.api.getSnapshot().then(setSnapshot)
    return unsubscribe
  }, [])

  return isDisplay() ? <Display snapshot={snapshot} /> : <Control snapshot={snapshot} />
}

export default App
