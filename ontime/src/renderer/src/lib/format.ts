import { Cue } from '../../../main/types'

/** Format a duration as [-]h:mm:ss (hours omitted when zero). */
export function formatDuration(ms: number, signed = false): string {
  const negative = ms < 0
  const totalSec = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const core =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  const sign = negative ? '−' : signed ? '+' : ''
  return `${sign}${core}`
}

/** Wall-clock time of day, e.g. "10:42 AM". */
export function formatClock(date: Date, withSeconds = false): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  })
}

/** Compute the scheduled clock time each cue begins, given a "HH:MM" start. */
export function scheduledStarts(cues: Cue[], startTimeOfDay?: string): (Date | null)[] {
  if (!startTimeOfDay) return cues.map(() => null)
  const [h, m] = startTimeOfDay.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return cues.map(() => null)
  const base = new Date()
  base.setHours(h, m, 0, 0)
  let acc = base.getTime()
  return cues.map((cue) => {
    const at = new Date(acc)
    acc += cue.durationMs
    return at
  })
}
