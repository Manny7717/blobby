import { describe, expect, it } from 'vitest'
import { downsampleTo16Khz } from './wakeWord'

describe('wake audio downsampling', () => {
  it('converts 48 kHz float samples to 16 kHz PCM', () => {
    const result = downsampleTo16Khz(new Float32Array([1, 1, 1, 0, 0, 0, -1, -1, -1]), 48000)
    expect(Array.from(result)).toEqual([32767, 0, -32768])
  })

  it('rejects sample rates below the wake model rate', () => {
    expect(() => downsampleTo16Khz(new Float32Array(10), 8000)).toThrow()
  })
})
