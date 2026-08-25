import {
  GOOGLE_PAGE_HEIGHT_PT,
  GOOGLE_PAGE_WIDTH_PT,
  GOOGLE_TO_OS_X,
  GOOGLE_TO_OS_Y,
} from './constants';
import type { GooglePresentation, GoogleSlidePage } from './types';

function googleToOsX(pt: number): number {
  return pt * GOOGLE_TO_OS_X;
}

function googleToOsY(pt: number): number {
  return pt * GOOGLE_TO_OS_Y;
}

function escapeJsx(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function pageComponentName(index: number): string {
  return `Page${index + 1}`;
}

export function generateSlideModuleSource(presentation: GooglePresentation): string {
  const title = presentation.title.replace(/"/g, '\\"');
  const pageNames = presentation.slides.map((_, i) => pageComponentName(i));
  const notes = presentation.slides.map((s) => s.speakerNotes ?? undefined);

  const pagesSource = presentation.slides
    .map((slide, i) => generatePageComponent(slide, i))
    .join('\n\n');

  const notesLiteral =
    notes.length > 0
      ? `export const notes = ${JSON.stringify(notes)} satisfies (string | undefined)[];`
      : '';

  return `import type { Page, SlideMeta } from '@open-slide/core';

export const meta: SlideMeta = {
  title: '${title}',
  createdAt: '${new Date().toISOString().slice(0, 10)}',
};

${notesLiteral}

const fill = {
  width: '100%',
  height: '100%',
  background: '#ffffff',
  color: '#111111',
  fontFamily: 'system-ui, sans-serif',
  position: 'relative' as const,
  overflow: 'hidden',
};

${pagesSource}

export default [${pageNames.join(', ')}] satisfies Page[];
`;
}

function generatePageComponent(slide: GoogleSlidePage, index: number): string {
  const name = pageComponentName(index);
  const elements = slide.elements
    .map((el) => {
      const styleParts = [
        `position: 'absolute'`,
        `left: ${Math.round(googleToOsX(el.x))}`,
        `top: ${Math.round(googleToOsY(el.y))}`,
        `width: ${Math.round(googleToOsX(el.width))}`,
        `height: ${Math.round(googleToOsY(el.height))}`,
      ];
      if (el.backgroundColor) styleParts.push(`background: '${el.backgroundColor}'`);
      if (el.color) styleParts.push(`color: '${el.color}'`);
      if (el.fontSize) styleParts.push(`fontSize: ${Math.round(el.fontSize * GOOGLE_TO_OS_X)}`);

      if (el.kind === 'image' && el.imageUrl) {
        return `    <img src="${el.imageUrl}" alt="" style={{ ${styleParts.join(', ')} }} />`;
      }

      if (el.text) {
        return `    <div style={{ ${styleParts.join(', ')}, display: 'flex', alignItems: 'center', padding: 8 }}>${escapeJsx(el.text)}</div>`;
      }

      return `    <div style={{ ${styleParts.join(', ')} }} />`;
    })
    .join('\n');

  return `const ${name}: Page = () => (
  <div style={fill}>
${elements}
  </div>
);`;
}

export function googlePresentationIdFromUrl(url: string): string | null {
  const m = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

export { GOOGLE_PAGE_HEIGHT_PT, GOOGLE_PAGE_WIDTH_PT };
