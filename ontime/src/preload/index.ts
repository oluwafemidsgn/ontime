import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { Snapshot, Program, Settings, Message, TimerMode } from '../main/types'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  onSnapshot: (cb: (snapshot: Snapshot) => void) => subscribe('snapshot', cb),
  onDisplayState: (cb: (open: boolean) => void) => subscribe('display-state', cb),

  startTimer: () => ipcRenderer.send('start-timer'),
  pauseTimer: () => ipcRenderer.send('pause-timer'),
  resetTimer: () => ipcRenderer.send('reset-timer'),
  advanceCue: () => ipcRenderer.send('advance-cue'),
  previousCue: () => ipcRenderer.send('previous-cue'),
  loadCue: (id: string) => ipcRenderer.send('load-cue', id),
  nudgeTimer: (ms: number) => ipcRenderer.send('nudge-timer', ms),
  setMessage: (msg: Message | null) => ipcRenderer.send('set-message', msg),
  setBlackout: (enabled: boolean) => ipcRenderer.send('set-blackout', enabled),
  updateSettings: (partial: Partial<Settings>) => ipcRenderer.send('update-settings', partial),
  updateProgram: (program: Program) => ipcRenderer.send('update-program', program),
  setTimerMode: (mode: TimerMode) => ipcRenderer.send('set-timer-mode', mode),

  openDisplay: () => ipcRenderer.send('open-display'),
  closeDisplay: () => ipcRenderer.send('close-display'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  setDisplayMonitor: (displayId: number) => ipcRenderer.send('display:set-monitor', displayId),
})

contextBridge.exposeInMainWorld('displays', {
  getAll: () => ipcRenderer.invoke('displays:get-all'),
  onChange: (cb: (displays: unknown[]) => void) => subscribe('displays-changed', cb),
})
