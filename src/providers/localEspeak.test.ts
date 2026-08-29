import { describe, expect, it } from 'vitest'
import { pcmAmplitudeAt } from './localEspeak'

function wav(samples: number[]) {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0) })
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, 30, true); view.setUint32(28, 60, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true))
  return bytes
}

describe('local speech waveform envelope', () => {
  it('tracks PCM energy and rejects invalid audio', () => {
    expect(pcmAmplitudeAt(wav([0, 0, 0]), 0)).toBe(0)
    expect(pcmAmplitudeAt(wav([12000, -12000, 12000]), 0)).toBeGreaterThan(0.9)
    expect(pcmAmplitudeAt(new Uint8Array([1, 2, 3]), 0)).toBe(0)
  })
})
