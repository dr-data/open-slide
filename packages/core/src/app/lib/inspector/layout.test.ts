import { describe, expect, it } from 'vitest';
import { clampLayoutToCanvas, type LayoutSnapshot } from './layout';

describe('clampLayoutToCanvas', () => {
  it('keeps elements inside the 1920×1080 canvas', () => {
    const layout: LayoutSnapshot = {
      x: 2000,
      y: 2000,
      width: 400,
      height: 300,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      position: 'absolute',
    };
    const clamped = clampLayoutToCanvas(layout);
    expect(clamped.x).toBeLessThanOrEqual(1920 - clamped.width);
    expect(clamped.y).toBeLessThanOrEqual(1080 - clamped.height);
    expect(clamped.width).toBeGreaterThanOrEqual(8);
    expect(clamped.height).toBeGreaterThanOrEqual(8);
  });
});
