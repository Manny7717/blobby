import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BloubBot from './components/BloubBot.vue'

const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

afterEach(() => {
  vi.restoreAllMocks()
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
})

describe('Bloub display lifecycle', () => {
  it('stops sampling while the document is hidden and resumes when visible', async () => {
    let hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 41)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const host = document.createElement('div')
    const app = createApp(BloubBot, { size: 120 })
    app.mount(host)
    expect(request).toHaveBeenCalled()

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(cancel).toHaveBeenCalledWith(41)

    request.mockClear()
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(request).toHaveBeenCalled()
    app.unmount()
  })
})
