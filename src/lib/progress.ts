// The progress ring in the panel. It shows how much of the work is done: the share of the
// issues found so far that are now fixed. Fixing one issue always moves it, however many
// there were to start with. (The old score was 100 minus 8 per issue, which sat at 0 for any
// document with 13 or more issues until almost all of them were gone.)

/**
 * 0 to 100: how many of the `peak` issues seen in this session are no longer outstanding.
 * A document with no issues is 100 (nothing left to do).
 */
export function progressScore(remaining: number, peak: number): number {
  if (peak <= 0 || remaining <= 0) return 100
  const share = 1 - Math.min(remaining, peak) / peak
  return Math.round(share * 100)
}
