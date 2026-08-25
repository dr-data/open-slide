import { hasOnlyInlineTextChildren } from '../app/lib/inspector/inline-text';
import { readLayoutSnapshot } from '../app/lib/inspector/layout';
import type { DomExportElement } from './types';

function rgbToHex(color: string): string | undefined {
  const m = color.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return color.startsWith('#') ? color : undefined;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length < 3) return undefined;
  const r = Math.round(Number(parts[0]));
  const g = Math.round(Number(parts[1]));
  const b = Math.round(Number(parts[2]));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function isSignificantElement(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  if (el.tagName === 'IMG') return true;
  if (hasOnlyInlineTextChildren(el) && el.textContent?.trim()) return true;
  const cs = getComputedStyle(el);
  if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;
  return rect.width * rect.height > 4000;
}

function isContainedBy(other: HTMLElement, el: HTMLElement): boolean {
  if (other === el) return false;
  if (!other.contains(el)) return false;
  const oRect = other.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  return (
    eRect.left >= oRect.left - 2 &&
    eRect.top >= oRect.top - 2 &&
    eRect.right <= oRect.right + 2 &&
    eRect.bottom <= oRect.bottom + 2
  );
}

export function collectDomExportElements(root: HTMLElement): DomExportElement[] {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[data-slide-loc]')).filter(
    isSignificantElement,
  );

  const selected: HTMLElement[] = [];
  for (const el of candidates) {
    const covered = selected.some((parent) => isContainedBy(parent, el));
    if (!covered) selected.push(el);
  }

  return selected.map((el) => elementToExport(el));
}

export function collectPageExportElements(frame: HTMLElement): DomExportElement[] {
  return collectDomExportElements(frame);
}

function elementToExport(el: HTMLElement): DomExportElement {
  const layout = readLayoutSnapshot(el);
  const cs = getComputedStyle(el);

  if (el.tagName === 'IMG') {
    const img = el as HTMLImageElement;
    return {
      kind: 'image',
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      imageUrl: img.currentSrc || img.src,
    };
  }

  if (hasOnlyInlineTextChildren(el) && el.textContent?.trim()) {
    return {
      kind: 'text',
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      text: el.textContent.trim(),
      color: rgbToHex(cs.color),
      fontSize: parseFloat(cs.fontSize) || 16,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      textAlign: cs.textAlign,
      backgroundColor: rgbToHex(cs.backgroundColor),
    };
  }

  return {
    kind: 'shape',
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
    backgroundColor: rgbToHex(cs.backgroundColor),
  };
}
