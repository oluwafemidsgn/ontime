import { contextBridge, ipcRenderer } from 'electron';
import { Snapshot, Program, Settings, Message, TimerState } from '../main/types';

contextBridge.exposeInMainWorld('api', {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  onSnapshot: (callback: (snapshot: Snapshot) => void) => {
    ipcRenderer.on('snapshot', (_e, snapshot: Snapshot) => callback(snapshot));
    return () => ipcRenderer.off('snapshot', callback);
  },
  
  startTimer: () => ipcRenderer.send('start-timer'),
  pauseTimer: () => ipcRenderer.send('pause-timer'),
  resetTimer: () => ipcRenderer.send('reset-timer'),
  advanceCue: () => ipcRenderer.send('advance-cue'),
  previousCue: () => ipcRenderer.send('previous-cue'),
  nudgeTimer: (ms: number) => ipcRenderer.send('nudge-timer', ms),
  setMessage: (msg: Message | null) => ipcRenderer.send('set-message', msg),
  setBlackout: (enabled: boolean) => ipcRenderer.send('set-blackout', enabled),
  updateSettings: (partial: Partial<Settings>) => ipcRenderer.send('update-settings', partial),
  updateProgram: (program: Program) => ipcRenderer.send('update-program', program),
  setTimerMode: (mode: TimerState['mode']) => ipcRenderer.send('set-timer-mode', mode),
  
  openStage: () => ipcRenderer.send('open-stage'),
  openDisplay: () => ipcRenderer.send('open-display'),
  closeStage: () => ipcRenderer.send('close-stage'),
  closeDisplay: () => ipcRenderer.send('close-display'),
  setDisplayMonitor: (displayId: number) => ipcRenderer.send('display:set-monitor', displayId),
});

contextBridge.exposeInMainWorld('displays', {
  getAll: () => ipcRenderer.invoke('displays:get-all'),
});