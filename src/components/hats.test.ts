import { describe, expect, it } from 'vitest'
import { hatPlacement } from './hats'

describe('hatPlacement', () => {
  it('rests the hat base on the full-size ball top edge', () => {
    expect(hatPlacement({ x: -100, y: -100, width: 200, height: 200 })).toEqual({ tx: 0, ty: -4, scale: 1 })
  })

  it('shrinks with a collapsed body (thinking dot)', () => {
    const p = hatPlacement({ x: -16.5, y: -16.5, width: 33, height: 33 })
    expect(p.scale).toBeCloseTo(0.165)
    expect(p.ty).toBeCloseTo(-0.66)
  })

  it('tracks a shifted/squashed body', () => {
    const p = hatPlacement({ x: -80, y: -70, width: 160, height: 140 })
    expect(p.tx).toBe(0)
    expect(p.scale).toBeCloseTo(0.7)
    expect(p.ty).toBeCloseTo(-70 + 96 * 0.7)
  })
})
