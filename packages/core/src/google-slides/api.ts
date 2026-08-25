import { googleFetch } from './auth-store';
import {
  GOOGLE_API_BASE,
  GOOGLE_PAGE_HEIGHT_PT,
  GOOGLE_PAGE_WIDTH_PT,
  OS_TO_GOOGLE_X,
  OS_TO_GOOGLE_Y,
} from './constants';
import type { DomExportElement, GooglePresentation, GoogleSlidePage } from './types';

type BatchRequest = Record<string, unknown>;

function osToGooglePtX(px: number): number {
  return px * OS_TO_GOOGLE_X;
}

function osToGooglePtY(px: number): number {
  return px * OS_TO_GOOGLE_Y;
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createPresentation(
  accessToken: string,
  title: string,
): Promise<{ presentationId: string; url: string }> {
  const data = await googleFetch<{ presentationId: string }>(
    `${GOOGLE_API_BASE}/presentations`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    },
  );
  return {
    presentationId: data.presentationId,
    url: `https://docs.google.com/presentation/d/${data.presentationId}/edit`,
  };
}

export async function getPresentation(
  accessToken: string,
  presentationId: string,
): Promise<GooglePresentation> {
  const data = await googleFetch<{
    presentationId: string;
    title?: string;
    slides?: Array<{
      objectId: string;
      pageElements?: Array<Record<string, unknown>>;
      slideProperties?: { notesPage?: { pageElements?: Array<Record<string, unknown>> } };
    }>;
  }>(`${GOOGLE_API_BASE}/presentations/${presentationId}`, accessToken);

  const slides: GoogleSlidePage[] = (data.slides ?? []).map((slide) => ({
    objectId: slide.objectId,
    elements: parsePageElements(slide.pageElements ?? []),
    speakerNotes: extractSpeakerNotes(slide.slideProperties?.notesPage?.pageElements),
  }));

  return {
    presentationId: data.presentationId,
    title: data.title ?? presentationId,
    slides,
  };
}

export async function exportElementsToGoogle(
  accessToken: string,
  presentationId: string,
  pages: DomExportElement[][],
  title: string,
): Promise<{ presentationId: string; url: string }> {
  let presId = presentationId;
  if (!presId) {
    const created = await createPresentation(accessToken, title);
    presId = created.presentationId;
  }

  const pres = await googleFetch<{
    slides?: Array<{ objectId: string }>;
  }>(`${GOOGLE_API_BASE}/presentations/${presId}`, accessToken);

  const existingSlides = pres.slides ?? [];
  const requests: BatchRequest[] = [];

  for (let i = 0; i < pages.length; i++) {
    let slideObjectId: string;
    if (i < existingSlides.length) {
      slideObjectId = existingSlides[i].objectId;
    } else {
      slideObjectId = randomId('slide');
      requests.push({
        createSlide: {
          objectId: slideObjectId,
          insertionIndex: i,
          slideLayoutReference: { predefinedLayout: 'BLANK' },
        },
      });
    }

    const resolved = await resolveExportElements(accessToken, pages[i]);
    for (const el of resolved) {
      requests.push(...elementToRequests(slideObjectId, el));
    }
  }

  for (let i = pages.length; i < existingSlides.length; i++) {
    requests.push({ deleteObject: { objectId: existingSlides[i].objectId } });
  }

  if (requests.length > 0) {
    await batchUpdate(accessToken, presId, requests);
  }

  return {
    presentationId: presId,
    url: `https://docs.google.com/presentation/d/${presId}/edit`,
  };
}

async function resolveExportElements(
  accessToken: string,
  elements: DomExportElement[],
): Promise<DomExportElement[]> {
  const out: DomExportElement[] = [];
  for (const el of elements) {
    if (el.kind === 'image' && el.imageUrl) {
      const url = await resolveImageUrl(accessToken, el.imageUrl);
      if (!url) continue;
      out.push({ ...el, imageUrl: url });
    } else {
      out.push(el);
    }
  }
  return out;
}

async function resolveImageUrl(accessToken: string, src: string): Promise<string | null> {
  if (src.startsWith('https://')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    const uploaded = await uploadImageBlob(accessToken, blob);
    return uploaded;
  } catch {
    return null;
  }
}

async function uploadImageBlob(accessToken: string, blob: Blob): Promise<string | null> {
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=media&fields=id,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': blob.type || 'image/png',
      },
      body: blob,
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { webContentLink?: string };
  return data.webContentLink ?? null;
}

async function batchUpdate(
  accessToken: string,
  presentationId: string,
  requests: BatchRequest[],
): Promise<void> {
  await googleFetch(`${GOOGLE_API_BASE}/presentations/${presentationId}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

function elementToRequests(slideId: string, el: DomExportElement): BatchRequest[] {
  const objectId = randomId('el');
  const x = osToGooglePtX(el.x);
  const y = osToGooglePtY(el.y);
  const width = osToGooglePtX(el.width);
  const height = osToGooglePtY(el.height);

  if (el.kind === 'image' && el.imageUrl) {
    return [
      {
        createImage: {
          objectId,
          url: el.imageUrl,
          elementProperties: {
            pageObjectId: slideId,
            size: ptSize(width, height),
            transform: ptTransform(x, y),
          },
        },
      },
    ];
  }

  const shapeType = el.kind === 'text' ? 'TEXT_BOX' : 'RECTANGLE';
  const requests: BatchRequest[] = [
    {
      createShape: {
        objectId,
        shapeType,
        elementProperties: {
          pageObjectId: slideId,
          size: ptSize(width, height),
          transform: ptTransform(x, y),
        },
      },
    },
  ];

  if (el.backgroundColor) {
    requests.push({
      updateShapeProperties: {
        objectId,
        shapeProperties: {
          shapeBackgroundFill: {
            solidFill: { color: { rgbColor: hexToRgb(el.backgroundColor) } },
          },
        },
        fields: 'shapeBackgroundFill',
      },
    });
  }

  if (el.text) {
    requests.push({
      insertText: {
        objectId,
        insertionIndex: 0,
        text: el.text,
      },
    });
    if (el.fontSize || el.color || el.textAlign) {
      requests.push({
        updateTextStyle: {
          objectId,
          style: {
            fontSize: el.fontSize
              ? { magnitude: el.fontSize * OS_TO_GOOGLE_X, unit: 'PT' }
              : undefined,
            foregroundColor: el.color
              ? { opaqueColor: { rgbColor: hexToRgb(el.color) } }
              : undefined,
          },
          textRange: { type: 'ALL' },
          fields: buildTextStyleFields(el),
        },
      });
    }
  }

  return requests;
}

function buildTextStyleFields(el: DomExportElement): string {
  const fields: string[] = [];
  if (el.fontSize) fields.push('fontSize');
  if (el.color) fields.push('foregroundColor');
  return fields.join(',');
}

function ptSize(width: number, height: number) {
  return {
    width: { magnitude: width, unit: 'PT' },
    height: { magnitude: height, unit: 'PT' },
  };
}

function ptTransform(x: number, y: number) {
  return {
    scaleX: 1,
    scaleY: 1,
    translateX: x,
    translateY: y,
    unit: 'PT',
  };
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { red: 0, green: 0, blue: 0 };
  const n = Number.parseInt(m[1], 16);
  return {
    red: ((n >> 16) & 255) / 255,
    green: ((n >> 8) & 255) / 255,
    blue: (n & 255) / 255,
  };
}

function parsePageElements(elements: Array<Record<string, unknown>>): GoogleSlidePage['elements'] {
  const out: GoogleSlidePage['elements'] = [];
  for (const el of elements) {
    const objectId = String(el.objectId ?? '');
    const size = el.size as { width?: { magnitude?: number }; height?: { magnitude?: number } };
    const transform = el.transform as {
      translateX?: number;
      translateY?: number;
      scaleX?: number;
      scaleY?: number;
    };
    const width = (size?.width?.magnitude ?? 0) * (transform?.scaleX ?? 1);
    const height = (size?.height?.magnitude ?? 0) * (transform?.scaleY ?? 1);
    const x = transform?.translateX ?? 0;
    const y = transform?.translateY ?? 0;

    const image = el.image as { contentUrl?: string; sourceUrl?: string } | undefined;
    if (image) {
      out.push({
        objectId,
        kind: 'image',
        x,
        y,
        width,
        height,
        imageUrl: image.contentUrl ?? image.sourceUrl,
      });
      continue;
    }

    const shape = el.shape as Record<string, unknown> | undefined;
    if (shape) {
      const text = extractShapeText(shape);
      const bg = extractShapeBackground(shape);
      out.push({
        objectId,
        kind: text ? 'text' : 'shape',
        x,
        y,
        width,
        height,
        text,
        backgroundColor: bg,
      });
    }
  }
  return out;
}

function extractShapeText(shape: Record<string, unknown>): string | undefined {
  const text = shape.text as
    | { textElements?: Array<{ textRun?: { content?: string } }> }
    | undefined;
  if (!text?.textElements) return undefined;
  const content = text.textElements.map((t) => t.textRun?.content ?? '').join('');
  return content.trim() || undefined;
}

function extractShapeBackground(shape: Record<string, unknown>): string | undefined {
  const props = shape.shapeProperties as
    | { shapeBackgroundFill?: { solidFill?: { color?: { rgbColor?: Record<string, number> } } } }
    | undefined;
  const rgb = props?.shapeBackgroundFill?.solidFill?.color?.rgbColor;
  if (!rgb) return undefined;
  return rgbToHex(rgb);
}

function rgbToHex(rgb: Record<string, number>): string {
  const r = Math.round((rgb.red ?? 0) * 255);
  const g = Math.round((rgb.green ?? 0) * 255);
  const b = Math.round((rgb.blue ?? 0) * 255);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function extractSpeakerNotes(elements?: Array<Record<string, unknown>>): string | undefined {
  if (!elements) return undefined;
  for (const el of elements) {
    const shape = el.shape as Record<string, unknown> | undefined;
    const text = extractShapeText(shape ?? {});
    if (text) return text;
  }
  return undefined;
}

export function presentationModifiedTime(data: Record<string, unknown>): string | undefined {
  return typeof data.modifiedTime === 'string' ? data.modifiedTime : undefined;
}

export async function fetchPresentationMeta(
  accessToken: string,
  presentationId: string,
): Promise<{ title: string; modifiedTime?: string }> {
  const data = await googleFetch<{ name?: string; modifiedTime?: string }>(
    `https://www.googleapis.com/drive/v3/files/${presentationId}?fields=name,modifiedTime`,
    accessToken,
  );
  return { title: data.name ?? presentationId, modifiedTime: data.modifiedTime };
}

export { GOOGLE_PAGE_HEIGHT_PT, GOOGLE_PAGE_WIDTH_PT };
