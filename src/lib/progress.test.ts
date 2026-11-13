import { describe, it, expect } from 'vitest'
import { progressScore } from './progress'

describe('progressScore', () => {
  it('starts at 0 and rises with every single fix, however many issues there were', () => {
    const peak = 20
    const scores = [20, 19, 18, 10, 1, 0].map((remaining) => progressScore(remaining, peak))
    expect(scores).toEqual([0, 5, 10, 50, 95, 100])
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('is 100 when nothing is left, including a document that never had issues', () => {
    expect(progressScore(0, 8)).toBe(100)
    expect(progressScore(0, 0)).toBe(100)
  })

  it('never goes outside 0 to 100', () => {
    expect(progressScore(30, 20)).toBe(0)
    expect(progressScore(-3, 20)).toBe(100)
  })
})
