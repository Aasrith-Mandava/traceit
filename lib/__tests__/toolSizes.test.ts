import { describe, expect, it } from 'vitest';
import { buildStroke, splitStrokeByEraser } from '../ink';
import { BASE_WIDTH, drawStroke, widthFor } from '../render';
import { ERASER_RADIUS, ERASER_SIZES, PEN_SIZES, eraserRadius, penScale } from '../toolSizes';
import type { Point, Stroke } from '../types';
import { isStroke } from '../validate';

// Pen sizes are saved per stroke (Stroke.size, absent = Medium) and drawn with that width; eraser
// sizes are only the eraser's hit radius.

function line(x0: number, x1: number, y: number, step = 5): Point[] {
  const pts: Point[] = [];
  for (let x = x0; x <= x1; x += step) pts.push([x, y, 0.5, 1000 + x]);
  return pts;
}

const base = (over: Partial<Stroke> = {}): Stroke => ({ ...buildStroke('k_1', 's1', line(0, 200, 50), 'pen'), ...over });

describe('tool sizes', () => {
  it('Medium is today’s look, Fine is thinner, Bold thicker; Small is today’s eraser, Large ~2-2.5x', () => {
    expect(PEN_SIZES.map((s) => s.label)).toEqual(['Fine', 'Medium', 'Bold']);
    expect(penScale('medium')).toBe(1);
    expect(penScale('fine')).toBeLessThan(1);
    expect(penScale('bold')).toBeGreaterThan(1.5);
    expect(ERASER_SIZES.map((s) => s.label)).toEqual(['Small', 'Large']);
    expect(eraserRadius('small')).toBe(ERASER_RADIUS);
    expect(ERASER_RADIUS).toBe(12);
    const ratio = eraserRadius('large') / eraserRadius('small');
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThanOrEqual(2.5);
  });
});

describe('isStroke size', () => {
  it('accepts no size, null and sane sizes', () => {
    expect(isStroke(base())).toBe(true);
    expect(isStroke({ ...base(), size: null })).toBe(true);
    for (const s of PEN_SIZES) expect(isStroke(base({ size: s.scale }))).toBe(true);
  });

  it('rejects non-finite, non-numeric and out-of-range sizes', () => {
    for (const size of [Number.NaN, Infinity, -1, 0, 0.1, 3.5, 100, '2', true]) {
      expect(isStroke({ ...base(), size })).toBe(false);
    }
  });
});

describe('buildStroke / eraser pieces keep the pen size', () => {
  it('stores Medium as absent and other sizes on the stroke', () => {
    expect('size' in buildStroke('a', 's', line(0, 20, 0), 'pen')).toBe(false);
    expect('size' in buildStroke('a', 's', line(0, 20, 0), 'pen', 1)).toBe(false);
    expect(buildStroke('a', 's', line(0, 20, 0), 'pen', 2).size).toBe(2);
  });

  it('pieces cut by the eraser carry their parent’s size', () => {
    const s = { ...buildStroke('k_bold', 's1', line(0, 200, 50), 'pen', 2) };
    const res = splitStrokeByEraser(s, [[100, 40], [100, 60]], ERASER_RADIUS, 5000, (() => { let n = 0; return () => `p${++n}`; })())!;
    expect(res.pieces.length).toBe(3);
    for (const p of res.pieces) expect(p.size).toBe(2);
  });
});

describe('eraser radius parameter', () => {
  /** Length of the erased band when the eraser touches the middle of a 0..400 line once. */
  const erasedBand = (radius: number) => {
    const s = buildStroke('k_line', 's1', line(0, 400, 50, 1), 'pen');
    let n = 0;
    const res = splitStrokeByEraser(s, [[200, 50]], radius, 5000, () => `p${++n}`)!;
    const gone = res.pieces.filter((p) => p.erased);
    expect(gone).toHaveLength(1);
    const [x0, , x1] = gone[0].bbox;
    return x1 - x0;
  };

  it('a Large eraser removes a wider band than a Small one', () => {
    const small = erasedBand(eraserRadius('small'));
    const large = erasedBand(eraserRadius('large'));
    expect(small).toBeGreaterThan(2 * eraserRadius('small') - 4);
    expect(small).toBeLessThan(2 * eraserRadius('small') + 4);
    expect(large).toBeGreaterThan(small * 2);
  });
});

describe('render width', () => {
  it('scales the line width by the pen size, with pen pressure on top', () => {
    expect(widthFor([0, 0, 0.5, 0], 'mouse')).toBe(BASE_WIDTH);
    expect(widthFor([0, 0, 0.5, 0], 'mouse', 2)).toBe(BASE_WIDTH * 2);
    expect(widthFor([0, 0, 0.5, 0], 'pen', 0.6)).toBeCloseTo(BASE_WIDTH * 0.6);
    expect(widthFor([0, 0, 1, 0], 'pen', 2)).toBeCloseTo(BASE_WIDTH * 2 * 1.5);
  });

  /** A canvas context stub that records every lineWidth set while drawing. */
  function recordWidths(s: Stroke, ghost: boolean): number[] {
    const widths: number[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) => (prop === 'lineWidth' ? widths.at(-1) : () => {}),
        set: (_t, prop, value) => {
          if (prop === 'lineWidth') widths.push(value as number);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    drawStroke(ctx, s, ghost);
    return widths;
  }

  it('draws ink and ghost ink with the stroke’s own size (absent = Medium)', () => {
    const mouse = (size?: number) => base({ pointerType: 'mouse', ...(size ? { size } : {}) });
    expect(new Set(recordWidths(mouse(), false))).toEqual(new Set([BASE_WIDTH]));
    expect(new Set(recordWidths(mouse(2), false))).toEqual(new Set([BASE_WIDTH * 2]));
    expect(new Set(recordWidths(mouse(0.6), false))).toEqual(new Set([BASE_WIDTH * 0.6]));
    expect(recordWidths(mouse(), true)).toEqual([BASE_WIDTH]);
    expect(recordWidths(mouse(2), true)).toEqual([BASE_WIDTH * 2]);
  });
});
