import { onBeforeUnmount, ref } from 'vue'

export function useMicrophoneMeter() {
  const level = ref(0)
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let frame = 0
  let lastUpdate = 0
  let watchedTrack: MediaStreamTrack | null = null
  let trackEndHandler: (() => void) | null = null

  async function start(deviceId?: string, onDisconnected?: () => void) {
    stop()
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    })
    watchedTrack = stream.getAudioTracks()[0] ?? null
    trackEndHandler = () => {
      if (!stream) return
      stop()
      onDisconnected?.()
    }
    watchedTrack?.addEventListener('ended', trackEndHandler, { once: true })
    context = new AudioContext({ latencyHint: 'interactive' })
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.76
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.frequencyBinCount)
    const update = (time: number) => {
      frame = requestAnimationFrame(update)
      if (time - lastUpdate < 33) return
      lastUpdate = time
      analyser.getByteFrequencyData(samples)
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length / 255
      level.value = Math.min(1, average * 3.2)
    }
    frame = requestAnimationFrame(update)
  }

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
    if (watchedTrack && trackEndHandler) watchedTrack.removeEventListener('ended', trackEndHandler)
    watchedTrack = null
    trackEndHandler = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    void context?.close()
    context = null
    level.value = 0
  }

  onBeforeUnmount(stop)
  return { level, start, stop }
}
