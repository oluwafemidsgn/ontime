export type TimerMode = 'countdown' | 'countup' | 'clock';

export type Cue = {
  id: string;
  title: string;
  durationMs: number;
  autoAdvance?: boolean;
};

export type Program = {
  name: string;
  startTimeOfDay?: string;
  cues: Cue[];
};

export type TimerState = {
  mode: TimerMode;
  running: boolean;
  endTimestamp: number | null;
  startTimestamp: number | null;
  pausedRemainingMs: number | null;
  activeCueId: string | null;
};

export type Message = {
  text: string;
  style: 'normal' | 'flash';
  visible: boolean;
  autoClearMs?: number | null;
};

export type Settings = {
  bg: string;
  digitColor: string;
  warningPct: number;
  overtime: boolean;
  showTitle: boolean;
  showClock: boolean;
  showProgress: boolean;
  showMessage: boolean;
};

export type Snapshot = {
  timer: TimerState;
  remainingMs: number;
  program: Program;
  activeTitle: string;
  message: Message | null;
  blackout: boolean;
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = {
  bg: '#000000',
  digitColor: '#F5F5F5',
  warningPct: 0.2,
  overtime: true,
  showTitle: true,
  showClock: true,
  showProgress: true,
  showMessage: true,
};

export const DEFAULT_PROGRAM: Program = {
  name: 'New Program',
  startTimeOfDay: '10:00',
  cues: [
    { id: '1', title: 'Welcome', durationMs: 5 * 60 * 1000 },
    { id: '2', title: 'Worship', durationMs: 20 * 60 * 1000 },
    { id: '3', title: 'Sermon', durationMs: 35 * 60 * 1000 },
    { id: '4', title: 'Altar', durationMs: 10 * 60 * 1000 },
  ],
};

export const DEFAULT_TIMER_STATE: TimerState = {
  mode: 'countdown',
  running: false,
  endTimestamp: null,
  startTimestamp: null,
  pausedRemainingMs: null,
  activeCueId: null,
};

export const DEFAULT_MESSAGE: Message | null = null;