/** Hat wardrobe for the avatar. Draw order = tap order; 'none' is the first state. */
export const HATS = [
  { id: 'none', label: 'no hat' },
  { id: 'top-hat', label: 'top hat' },
  { id: 'party-hat', label: 'party hat' },
  { id: 'beanie', label: 'beanie' },
  { id: 'crown', label: 'crown' },
  { id: 'halo', label: 'halo' },
  { id: 'propeller-beanie', label: 'propeller beanie' }
] as const

export type HatId = (typeof HATS)[number]['id']
export type Hat = (typeof HATS)[number]

/**
 * Pins a hat to the top-center of the body's bounding box. Hat art is drawn
 * with its base at local y=-96 (resting on a full-size ball, R=100): scaling
 * by bbox.height/200 keeps the hat proportional as the body morphs, and the
 * translate offsets the base so it lands exactly on the body's top edge.
 */
export function hatPlacement(bbox: { x: number; y: number; width: number; height: number }) {
  const scale = bbox.height / 200
  return {
    tx: bbox.x + bbox.width / 2,
    ty: bbox.y + 96 * scale,
    scale
  }
}
