import type {
  Snapshot,
  Program,
  Settings,
  Message,
  TimerMode,
} from '../../main/types'

export interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  size: { width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  internal: boolean
  rotation: number
}

export interface OntimeApi {
  getSnapshot: () => Promise<Snapshot>
  onSnapshot: (callback: (snapshot: Snapshot) => void) => () => void

  startTimer: () => void
  pauseTimer: () => void
  resetTimer: () => void
  advanceCue: () => void
  previousCue: () => void
  loadCue: (id: string) => void
  nudgeTimer: (ms: number) => void
  setMessage: (msg: Message | null) => void
  setBlackout: (enabled: boolean) => void
  updateSettings: (partial: Partial<Settings>) => void
  updateProgram: (program: Program) => void
  setTimerMode: (mode: TimerMode) => void

  openDisplay: () => void
  closeDisplay: () => void
  toggleFullscreen: () => void
  setDisplayMonitor: (displayId: number) => void
  onDisplayState: (callback: (open: boolean) => void) => () => void
}

export interface DisplaysApi {
  getAll: () => Promise<DisplayInfo[]>
  onChange: (callback: (displays: DisplayInfo[]) => void) => () => void
}

declare global {
  interface Window {
    api: OntimeApi
    displays: DisplaysApi
  }
}
