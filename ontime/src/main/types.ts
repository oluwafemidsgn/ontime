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

export type MessageFont = 'sans' | 'serif' | 'mono' | 'condensed';

/** High-level visual phase, computed by the main process. */
export type Phase = 'normal' | 'warning' | 'timeup' | 'transition';

export type Settings = {
  bg: string;
  digitColor: string;
  warnBg: string;        // background color during the warning window
  overBg: string;        // background color once time is up
  warningPct: number;
  overtime: boolean;
  timeUpSec: number;     // how long "TIME UP" holds before the transition
  transitionSec: number; // "up next" countdown length before auto-advancing
  msgFont: MessageFont;
  msgScale: number;      // message size multiplier
  msgColor: string;
  showTitle: boolean;
  showClock: boolean;
  showProgress: boolean;
  showMessage: boolean;
};

export type UpNext = { title: string; countdownMs: number } | null;

export type Snapshot = {
  timer: TimerState;
  remainingMs: number;
  program: Program;
  activeTitle: string;
  message: Message | null;
  blackout: boolean;
  settings: Settings;
  phase: Phase;
  overMs: number;   // ms elapsed past zero (>= 0)
  upNext: UpNext;   // populated during the transition phase
};

export const DEFAULT_SETTINGS: Settings = {
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