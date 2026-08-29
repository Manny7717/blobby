import type { CameraProvider } from './contracts'

export class BrowserCameraProvider implements CameraProvider {
  private stream: MediaStream | null = null

  async start(deviceId?: string) {
    this.stop()
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    })
    return this.stream
  }

  capture(video: HTMLVideoElement) {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Camera capture is unavailable.')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.86)
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
  }
}
