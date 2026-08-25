import { useCallback, useRef, useState } from 'react';
import {
  clampLayoutToCanvas,
  type LayoutSnapshot,
  layoutStyleOpsFromSnapshot,
  readLayoutSnapshot,
} from '@/lib/inspector/layout';
import type { EditOp } from '@/lib/inspector/use-editor';
import type { SelectedTarget } from './inspector-provider';

type RelRect = { left: number; top: number; width: number; height: number };

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

const HANDLE_SIZE = 8;

export function LayoutTransformLayer({
  anchor,
  overlayRef,
  rect,
  selected,
  bufferOps,
  setSelected,
}: {
  anchor: HTMLElement;
  overlayRef: React.RefObject<HTMLDivElement>;
  rect: RelRect;
  selected: SelectedTarget;
  bufferOps: (line: number, column: number, anchor: HTMLElement, ops: EditOp[]) => void;
  setSelected: (t: SelectedTarget) => void;
}) {
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startLayout: LayoutSnapshot;
    scale: number;
  } | null>(null);
  const [previewRect, setPreviewRect] = useState<RelRect | null>(null);

  const getScale = useCallback(() => {
    const canvas = anchor.closest('[data-osd-canvas]');
    if (!canvas) return 1;
    const canvasRect = canvas.getBoundingClientRect();
    return canvasRect.width / 1920;
  }, [anchor]);

  const commitLayout = useCallback(
    (layout: LayoutSnapshot, startLayout: LayoutSnapshot) => {
      const styleOps = layoutStyleOpsFromSnapshot(layout, startLayout);
      if (styleOps.length === 0) return;
      const ops: EditOp[] = styleOps.map((op) => ({
        kind: 'set-style',
        key: op.key,
        value: op.value,
      }));
      bufferOps(selected.line, selected.column, anchor, ops);
      setSelected({ ...selected, anchor });
    },
    [anchor, bufferOps, selected, setSelected],
  );

  const onPointerDown = (handle: Handle, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const scale = getScale();
    const startLayout = readLayoutSnapshot(anchor);
    const positioned: LayoutSnapshot = {
      ...startLayout,
      position: 'absolute',
    };
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startLayout: positioned,
      scale,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = (e.clientX - drag.startX) / drag.scale;
    const dy = (e.clientY - drag.startY) / drag.scale;
    const start = drag.startLayout;
    let next: LayoutSnapshot = { ...start };

    if (drag.handle === 'move') {
      next.x = start.x + dx;
      next.y = start.y + dy;
    } else {
      if (drag.handle.includes('e')) next.width = start.width + dx;
      if (drag.handle.includes('w')) {
        next.width = start.width - dx;
        next.x = start.x + dx;
      }
      if (drag.handle.includes('s')) next.height = start.height + dy;
      if (drag.handle.includes('n')) {
        next.height = start.height - dy;
        next.y = start.y + dy;
      }
    }

    next = clampLayoutToCanvas(next);
    anchor.style.position = 'absolute';
    anchor.style.left = `${next.x}px`;
    anchor.style.top = `${next.y}px`;
    anchor.style.width = `${next.width}px`;
    anchor.style.height = `${next.height}px`;

    const overlay = overlayRef.current;
    const canvas = anchor.closest('[data-osd-canvas]');
    if (overlay && canvas) {
      const overlayRect = overlay.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const scale = drag.scale;
      setPreviewRect({
        left: canvasRect.left - overlayRect.left + next.x * scale,
        top: canvasRect.top - overlayRect.top + next.y * scale,
        width: next.width * scale,
        height: next.height * scale,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = null;
    setPreviewRect(null);

    const endLayout = readLayoutSnapshot(anchor);
    commitLayout({ ...endLayout, position: 'absolute' }, drag.startLayout);
  };

  const displayRect = previewRect ?? rect;

  const handles: Array<{ handle: Handle; style: React.CSSProperties; cursor: string }> = [
    {
      handle: 'nw',
      style: { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 },
      cursor: 'nwse-resize',
    },
    {
      handle: 'n',
      style: { left: '50%', top: -HANDLE_SIZE / 2, transform: 'translateX(-50%)' },
      cursor: 'ns-resize',
    },
    {
      handle: 'ne',
      style: { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 },
      cursor: 'nesw-resize',
    },
    {
      handle: 'e',
      style: { right: -HANDLE_SIZE / 2, top: '50%', transform: 'translateY(-50%)' },
      cursor: 'ew-resize',
    },
    {
      handle: 'se',
      style: { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 },
      cursor: 'nwse-resize',
    },
    {
      handle: 's',
      style: { left: '50%', bottom: -HANDLE_SIZE / 2, transform: 'translateX(-50%)' },
      cursor: 'ns-resize',
    },
    {
      handle: 'sw',
      style: { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 },
      cursor: 'nesw-resize',
    },
    {
      handle: 'w',
      style: { left: -HANDLE_SIZE / 2, top: '50%', transform: 'translateY(-50%)' },
      cursor: 'ew-resize',
    },
  ];

  return (
    <div
      data-inspector-ui
      className="absolute pointer-events-none"
      style={{
        left: displayRect.left,
        top: displayRect.top,
        width: displayRect.width,
        height: displayRect.height,
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="absolute inset-0 pointer-events-auto cursor-move"
        onPointerDown={(e) => onPointerDown('move', e)}
      />
      {handles.map(({ handle, style, cursor }) => (
        <div
          key={handle}
          className="absolute z-10 rounded-[2px] border border-white bg-blue-500 shadow-sm pointer-events-auto"
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            cursor,
            ...style,
          }}
          onPointerDown={(e) => onPointerDown(handle, e)}
        />
      ))}
    </div>
  );
}
