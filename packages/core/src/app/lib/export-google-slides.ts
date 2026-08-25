import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readSyncMeta, writeSyncMeta } from '../../google-slides/auth-store';
import { collectPageExportElements } from '../../google-slides/dom-walk';
import type { DomExportElement } from '../../google-slides/types';
import { designToCssVars } from './design';
import { nextPaint, sleep } from './dom';
import { exportToGoogleViaGws } from './google-slides-api';
import { SlidePageProvider } from './page-context';
import { isFrameAnimationSettled, waitForDataWaitfor, waitForFonts } from './print-ready';
import { CANVAS_HEIGHT, CANVAS_WIDTH, type SlideModule } from './sdk';

const ANIMATION_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

export type GoogleSlidesExportProgress = {
  phase: 'processing' | 'uploading' | 'done';
  current: number;
  total: number;
  percent: number;
};

export async function exportSlideToGoogleSlides(
  slide: SlideModule,
  slideId: string,
  onProgress?: (progress: GoogleSlidesExportProgress) => void,
): Promise<{ url: string; presentationId: string }> {
  const pages = slide.default ?? [];
  if (pages.length === 0) throw new Error('No pages to export');

  const total = pages.length;
  onProgress?.({ phase: 'processing', current: 0, total, percent: 0 });

  const exportPages = await capturePagesForExport(slide, pages, (current) => {
    onProgress?.({
      phase: 'processing',
      current,
      total,
      percent: Math.round((current / total) * 80),
    });
  });

  onProgress?.({ phase: 'uploading', current: total, total, percent: 90 });

  const title = slide.meta?.title ?? slideId;
  const linked = readSyncMeta(slideId);
  const result = await exportToGoogleViaGws({
    title,
    pages: exportPages,
    presentationId: linked?.presentationId,
  });

  writeSyncMeta(slideId, {
    presentationId: result.presentationId,
    presentationUrl: result.url,
    title: result.title,
    modifiedTime: result.modifiedTime ?? new Date().toISOString(),
    slideId,
    lastSyncAt: new Date().toISOString(),
    lastDirection: linked?.presentationId ? 'sync' : 'export',
  });

  onProgress?.({ phase: 'done', current: total, total, percent: 100 });
  return { url: result.url, presentationId: result.presentationId };
}

async function capturePagesForExport(
  slide: SlideModule,
  pages: NonNullable<SlideModule['default']>,
  onPage?: (index: number) => void,
): Promise<DomExportElement[][]> {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    position: 'fixed',
    left: '-99999px',
    top: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(container);

  const designVars = slide.design ? designToCssVars(slide.design) : null;
  const reactRoots: Root[] = [];
  const frames: HTMLElement[] = [];

  for (let i = 0; i < pages.length; i++) {
    const Page = pages[i];
    if (!Page) continue;
    const host = document.createElement('div');
    host.setAttribute('data-osd-canvas', '');
    host.style.width = `${CANVAS_WIDTH}px`;
    host.style.height = `${CANVAS_HEIGHT}px`;
    host.style.overflow = 'hidden';
    host.style.background = '#fff';
    host.style.position = 'relative';
    if (designVars) {
      for (const [k, v] of Object.entries(designVars)) host.style.setProperty(k, v);
    }
    container.appendChild(host);
    frames.push(host);
    const r = createRoot(host);
    r.render(
      createElement(SlidePageProvider, { index: i, total: pages.length }, createElement(Page)),
    );
    reactRoots.push(r);
  }

  await nextPaint();

  try {
    await waitForFonts();
    const deadline = performance.now() + ANIMATION_TIMEOUT_MS;
    while (performance.now() < deadline) {
      if (frames.every((frame) => isFrameAnimationSettled(frame))) break;
      await sleep(POLL_INTERVAL_MS);
    }
    await waitForDataWaitfor(container);

    const result: DomExportElement[][] = [];
    for (let i = 0; i < frames.length; i++) {
      result.push(collectPageExportElements(frames[i]));
      onPage?.(i + 1);
    }
    return result;
  } finally {
    for (const r of reactRoots) r.unmount();
    container.remove();
  }
}
