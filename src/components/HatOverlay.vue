<script setup lang="ts">
import { ref, watch } from 'vue'
import { hatPlacement, type HatId } from './hats'

const props = defineProps<{
  hat: HatId
  /** Live body silhouette path (viewBox units), from the BloubBot hat slot. */
  bodyPath?: string
  bodyAlpha?: number
}>()

/** Probe path: measures the body's real bounds so the hat tracks it exactly. */
const probe = ref<SVGPathElement | null>(null)
const placement = ref({ tx: 0, ty: -4, scale: 1 })
const opacity = ref(1)

watch(
  [() => props.bodyPath, probe],
  () => {
    const path = probe.value
    // getBBox is unavailable in some test/headless DOMs; fall back to the
    // resting placement (hat sits on the full-size ball) rather than failing.
    if (!path || typeof path.getBBox !== 'function') return
    const bbox = path.getBBox()
    if (bbox.width === 0 || bbox.height === 0) return
    placement.value = hatPlacement(bbox)
  }
)
watch(
  () => props.bodyAlpha,
  (alpha) => { opacity.value = alpha ?? 1 }
)
</script>

<!--
  Hat wardrobe rendered inside the avatar's SVG, pinned to the live body
  bounding box: translate + scale track the blob's morphs, squashes, and
  glides. Pointer-events none; the tap target lives on the avatar container.
-->
<template>
  <path
    ref="probe"
    :d="bodyPath"
    fill="none"
    stroke="none"
    visibility="hidden"
    aria-hidden="true"
  />
  <g
    v-if="hat !== 'none'"
    class="hat"
    :transform="`translate(${placement.tx} ${placement.ty}) scale(${placement.scale})`"
    :opacity="opacity"
    aria-hidden="true"
  >
    <!-- Top hat: tapered crown, blue band, wide brim, light outline. -->
    <g v-if="hat === 'top-hat'">
      <ellipse cx="0" cy="-95" rx="62" ry="9" fill="#0a0a0c" stroke="#F2F1ED" stroke-width="2" />
      <path
        d="M -44 -96 L -36 -150 L 36 -150 L 44 -96 Z"
        fill="#0a0a0c"
        stroke="#F2F1ED"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <rect x="-40" y="-118" width="80" height="20" rx="3" fill="#0A5CFF" />
      <ellipse cx="0" cy="-146" rx="29" ry="4" fill="#F2F1ED" opacity="0.12" />
    </g>

    <!-- Party hat: striped cone with a pompom. -->
    <g v-if="hat === 'party-hat'">
      <path d="M -46 -98 L 0 -152 L 46 -98 Z" fill="#0A5CFF" />
      <path d="M -33 -98 L 0 -131 L 33 -98 Z" fill="#F2F1ED" />
      <path d="M -15 -98 L 0 -114 L 15 -98 Z" fill="#0a0a0c" />
      <circle cx="0" cy="-152" r="9" fill="#F2F1ED" />
      <rect x="-48" y="-101" width="96" height="7" rx="3" fill="#0a0a0c" />
    </g>

    <!-- Beanie: snug dome, blue fold, pompom. -->
    <g v-if="hat === 'beanie'">
      <path d="M -55 -96 A 55 55 0 0 1 55 -96 Z" fill="#242424" />
      <rect x="-55" y="-110" width="110" height="16" rx="7" fill="#0A5CFF" />
      <circle cx="0" cy="-146" r="10" fill="#F2F1ED" />
    </g>

    <!-- Crown: zigzag points, blue gems. -->
    <g v-if="hat === 'crown'">
      <path
        d="M -48 -106 L -40 -145 L -24 -120 L -12 -145 L 0 -122 L 12 -145 L 24 -120 L 40 -145 L 48 -106 Z"
        fill="#F2F1ED"
      />
      <rect x="-48" y="-108" width="96" height="12" rx="3" fill="#F2F1ED" />
      <circle cx="-24" cy="-121" r="4" fill="#0A5CFF" />
      <circle cx="0" cy="-123" r="4" fill="#0A5CFF" />
      <circle cx="24" cy="-121" r="4" fill="#0A5CFF" />
    </g>

    <!-- Halo: floating ring, soft glow. -->
    <g v-if="hat === 'halo'">
      <ellipse cx="0" cy="-138" rx="52" ry="13" fill="none" stroke="#F2F1ED" stroke-width="16" opacity="0.14" transform="rotate(-8)" />
      <ellipse cx="0" cy="-138" rx="52" ry="13" fill="none" stroke="#F2F1ED" stroke-width="5" opacity="0.95" transform="rotate(-8)" />
    </g>

    <!-- Propeller beanie: dome, stem, spinning blades. -->
    <g v-if="hat === 'propeller-beanie'">
      <path d="M -46 -96 A 46 46 0 0 1 46 -96 Z" fill="#242424" />
      <rect x="-46" y="-107" width="92" height="13" rx="5" fill="#0A5CFF" />
      <rect x="-3" y="-146" width="6" height="10" fill="#F2F1ED" />
      <g transform="rotate(12)">
        <ellipse cx="-24" cy="-148" rx="22" ry="6" fill="#0A5CFF" />
        <ellipse cx="24" cy="-148" rx="22" ry="6" fill="#0A5CFF" />
      </g>
      <circle cx="0" cy="-148" r="5" fill="#F2F1ED" />
    </g>
  </g>
</template>
