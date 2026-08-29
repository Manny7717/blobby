<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { PhCamera as Camera, PhX as X } from '@phosphor-icons/vue'
import type { CameraProvider } from '@/providers/contracts'

const props = defineProps<{ provider: CameraProvider }>()
const emit = defineEmits<{ close: []; captured: [dataUrl: string] }>()
const video = ref<HTMLVideoElement | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    const stream = await props.provider.start()
    if (video.value) video.value.srcObject = stream
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'Camera unavailable.'
  }
})

onBeforeUnmount(() => props.provider.stop())

function capture() {
  if (!video.value) return
  try { emit('captured', props.provider.capture(video.value)) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'Capture failed.' }
}
</script>

<template>
  <section class="camera-overlay" aria-label="Camera preview">
    <div class="camera-overlay__top">
      <span><i /> Camera on</span>
      <button class="icon-button" aria-label="Close camera" @click="emit('close')"><X :size="25" /></button>
    </div>
    <div class="camera-overlay__preview">
      <video ref="video" autoplay muted playsinline />
      <p v-if="error">{{ error }}</p>
    </div>
    <button class="capture" :disabled="Boolean(error)" @click="capture">
      <Camera :size="25" weight="regular" />
      Capture for next question
    </button>
  </section>
</template>

<style scoped>
.camera-overlay { position: fixed; inset: 0; z-index: 20; display: grid; grid-template-rows: auto 1fr auto; gap: 18px; padding: 24px 30px 28px; background: #050505; }
.camera-overlay__top { display: flex; align-items: center; justify-content: space-between; color: #f2f1ed; font-size: 14px; }
.camera-overlay__top span { display: flex; align-items: center; gap: 9px; }
.camera-overlay__top i { width: 7px; height: 7px; border-radius: 50%; background: #0a5cff; box-shadow: 0 0 8px rgba(10,92,255,.7); }
.camera-overlay__preview { min-height: 0; display: grid; place-items: center; overflow: hidden; border: 1px solid #242424; background: #090909; }
.camera-overlay__preview video { width: 100%; height: 100%; object-fit: contain; }
.camera-overlay__preview p { color: #8e8e93; }
.capture { justify-self: center; min-height: 58px; display: inline-flex; align-items: center; gap: 10px; padding: 0 22px; border: 1px solid #0a5cff; border-radius: 30px; color: #f2f1ed; background: #0a5cff; font: inherit; }
.capture:disabled { border-color: #242424; color: #8e8e93; background: #111; }
.icon-button { width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid #242424; border-radius: 50%; color: #f2f1ed; background: transparent; }
</style>
