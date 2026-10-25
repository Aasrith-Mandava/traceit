// Pen and eraser sizes for the writing screen. The pen size is saved on every stroke (Stroke.size,
// a multiplier on the base line width; absent = 1 = Medium) so it redraws identically everywhere;
// the eraser size only sets the hit radius of the eraser on this device and is never stored.

export type PenSizeId = "fine" | "medium" | "bold";
export type EraserSizeId = "small" | "large";

export const PEN_SIZES: ReadonlyArray<{ id: PenSizeId; label: string; scale: number }> = [
  { id: "fine", label: "Fine", scale: 0.6 },
  { id: "medium", label: "Medium", scale: 1 },
  { id: "bold", label: "Bold", scale: 2 },
];

/** Small is the eraser radius TraceIt always had (CSS px); Large is about 2.3x wider. */
export const ERASER_SIZES: ReadonlyArray<{ id: EraserSizeId; label: string; radius: number }> = [
  { id: "small", label: "Small", radius: 12 },
  { id: "large", label: "Large", radius: 28 },
];

export const DEFAULT_PEN_SIZE: PenSizeId = "medium";
export const DEFAULT_ERASER_SIZE: EraserSizeId = "small";
export const ERASER_RADIUS = ERASER_SIZES[0].radius;

/** Stored stroke sizes outside this range are rejected (lib/validate isStroke). */
export const MIN_STROKE_SIZE = 0.25;
export const MAX_STROKE_SIZE = 3;

export const penScale = (id: PenSizeId): number => PEN_SIZES.find((s) => s.id === id)?.scale ?? 1;
export const eraserRadius = (id: EraserSizeId): number =>
  ERASER_SIZES.find((s) => s.id === id)?.radius ?? ERASER_RADIUS;

/** Per-device memory of the chosen sizes (localStorage keys). */
export const PEN_SIZE_KEY = "traceit.penSize";
export const ERASER_SIZE_KEY = "traceit.eraserSize";
