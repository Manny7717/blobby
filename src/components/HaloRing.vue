<script setup lang="ts">
defineProps<{ level: number; active: boolean; reducedMotion: boolean }>()
</script>

<template>
  <svg class="halo" viewBox="0 0 420 420" aria-hidden="true">
    <circle
      class="halo__arc"
      :class="{ 'halo__arc--active': active, 'halo__arc--reduced': reducedMotion }"
      cx="210"
      cy="210"
      r="194"
      pathLength="100"
      :style="{ '--mic-level': level }"
    />
  </svg>
</template>

<style scoped>
.halo { position: absolute; inset: -9.6%; width: 119.2%; height: 119.2%; overflow: visible; transform: rotate(-66deg); }
.halo__arc {
  fill: none;
  stroke: #0a5cff;
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-dasharray: 71 29;
  opacity: .46;
  filter: drop-shadow(0 0 5px rgba(10, 92, 255, .3));
  transform-origin: 50% 50%;
}
.halo__arc--active {
  opacity: calc(.58 + var(--mic-level) * .3);
  stroke-width: calc(1.25px + var(--mic-level) * 1.35px);
  transform: scale(calc(1 + var(--mic-level) * .012));
}
.halo__arc--reduced { transition: none; transform: none; }
</style>
