import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../sdk';

export type BoxSides = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type LayoutSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  margin: BoxSides;
  padding: BoxSides;
  position: string;
};

export type LayoutStyleKeys = {
  position: string;
  left: string | null;
  top: string | null;
  width: string | null;
  height: string | null;
  marginTop: string | null;
  marginRight: string | null;
  marginBottom: string | null;
  marginLeft: string | null;
  paddingTop: string | null;
  paddingRight: string | null;
  paddingBottom: string | null;
  paddingLeft: string | null;
};

export function getCanvasElement(el: HTMLElement): HTMLElement | null {
  return el.closest('[data-osd-canvas]');
}

export function getCanvasScale(canvas: HTMLElement): number {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return 1;
  return rect.width / CANVAS_WIDTH;
}

export function readLayoutSnapshot(el: HTMLElement): LayoutSnapshot {
  const canvas = getCanvasElement(el);
  const cs = getComputedStyle(el);
  const elRect = el.getBoundingClientRect();
  const canvasRect = canvas?.getBoundingClientRect();

  let scale = 1;
  let x = 0;
  let y = 0;
  if (canvas && canvasRect) {
    scale = getCanvasScale(canvas);
    x = (elRect.left - canvasRect.left) / scale;
    y = (elRect.top - canvasRect.top) / scale;
  }

  const width = elRect.width / scale;
  const height = elRect.height / scale;

  return {
    x: roundLayout(x),
    y: roundLayout(y),
    width: roundLayout(width),
    height: roundLayout(height),
    margin: parseBoxSides(cs, 'margin'),
    padding: parseBoxSides(cs, 'padding'),
    position: cs.position,
  };
}

export function layoutStyleOpsFromSnapshot(
  layout: LayoutSnapshot,
  prev?: LayoutSnapshot,
): Array<{ key: string; value: string | null }> {
  const ops: Array<{ key: string; value: string | null }> = [];

  const setPx = (key: string, value: number, prevValue?: number) => {
    const rounded = roundLayout(value);
    if (prevValue !== undefined && roundLayout(prevValue) === rounded) return;
    ops.push({ key, value: `${rounded}px` });
  };

  const setSide = (key: string, value: number, prevValue?: number, zeroDefault = true) => {
    const rounded = roundLayout(value);
    if (prevValue !== undefined && roundLayout(prevValue) === rounded) return;
    ops.push({
      key,
      value: zeroDefault && rounded === 0 ? null : `${rounded}px`,
    });
  };

  const positionChanged =
    !prev ||
    prev.x !== layout.x ||
    prev.y !== layout.y ||
    prev.width !== layout.width ||
    prev.height !== layout.height;

  if (positionChanged) {
    if (layout.position === 'static' || layout.position === 'relative') {
      ops.push({ key: 'position', value: 'absolute' });
    }
    setPx('left', layout.x, prev?.x);
    setPx('top', layout.y, prev?.y);
    setPx('width', layout.width, prev?.width);
    setPx('height', layout.height, prev?.height);
  }

  setSide('marginTop', layout.margin.top, prev?.margin.top);
  setSide('marginRight', layout.margin.right, prev?.margin.right);
  setSide('marginBottom', layout.margin.bottom, prev?.margin.bottom);
  setSide('marginLeft', layout.margin.left, prev?.margin.left);

  setSide('paddingTop', layout.padding.top, prev?.padding.top);
  setSide('paddingRight', layout.padding.right, prev?.padding.right);
  setSide('paddingBottom', layout.padding.bottom, prev?.padding.bottom);
  setSide('paddingLeft', layout.padding.left, prev?.padding.left);

  return ops;
}

export function applyLayoutPreview(el: HTMLElement, layout: LayoutSnapshot): void {
  const styles = layoutToInlineStyles(layout);
  for (const [key, value] of Object.entries(styles)) {
    if (value === null) el.style.removeProperty(camelToCss(key));
    else el.style.setProperty(camelToCss(key), value);
  }
}

export function layoutToInlineStyles(layout: LayoutSnapshot): LayoutStyleKeys {
  const px = (n: number) => `${roundLayout(n)}px`;
  const side = (n: number) => (n === 0 ? null : px(n));

  const position =
    layout.position === 'static' || layout.position === 'relative'
      ? layout.position === 'relative'
        ? 'relative'
        : 'absolute'
      : 'absolute';

  return {
    position,
    left: px(layout.x),
    top: px(layout.y),
    width: px(layout.width),
    height: px(layout.height),
    marginTop: side(layout.margin.top),
    marginRight: side(layout.margin.right),
    marginBottom: side(layout.margin.bottom),
    marginLeft: side(layout.margin.left),
    paddingTop: side(layout.padding.top),
    paddingRight: side(layout.padding.right),
    paddingBottom: side(layout.padding.bottom),
    paddingLeft: side(layout.padding.left),
  };
}

export function clampLayoutToCanvas(layout: LayoutSnapshot): LayoutSnapshot {
  const minSize = 8;
  const width = Math.max(minSize, Math.min(layout.width, CANVAS_WIDTH));
  const height = Math.max(minSize, Math.min(layout.height, CANVAS_HEIGHT));
  const x = Math.max(0, Math.min(layout.x, CANVAS_WIDTH - width));
  const y = Math.max(0, Math.min(layout.y, CANVAS_HEIGHT - height));
  return { ...layout, x, y, width, height };
}

function parseBoxSides(cs: CSSStyleDeclaration, prefix: 'margin' | 'padding'): BoxSides {
  const top = parseFloat(cs[`${prefix}Top`]) || 0;
  const right = parseFloat(cs[`${prefix}Right`]) || 0;
  const bottom = parseFloat(cs[`${prefix}Bottom`]) || 0;
  const left = parseFloat(cs[`${prefix}Left`]) || 0;
  return {
    top: roundLayout(top),
    right: roundLayout(right),
    bottom: roundLayout(bottom),
    left: roundLayout(left),
  };
}

function roundLayout(n: number): number {
  return Math.round(n * 10) / 10;
}

function camelToCss(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
