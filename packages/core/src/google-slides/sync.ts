import { exportElementsToGoogle, fetchPresentationMeta, getPresentation } from './api';
import { readGoogleAuth, readSyncMeta, writeSyncMeta } from './auth-store';
import { generateSlideModuleSource, googlePresentationIdFromUrl } from './jsx-generator';
import type { GoogleSlidesSyncMeta } from './types';

export async function syncOpenSlideToGoogle(
  slideId: string,
  title: string,
  pages: import('./types').DomExportElement[][],
  existingPresentationId?: string,
): Promise<GoogleSlidesSyncMeta> {
  const auth = readGoogleAuth();
  if (!auth) throw new Error('Not connected to Google');

  const meta = readSyncMeta(slideId);
  const presentationId = existingPresentationId ?? meta?.presentationId ?? '';

  const result = await exportElementsToGoogle(auth.accessToken, presentationId, pages, title);
  const remote = await fetchPresentationMeta(auth.accessToken, result.presentationId);

  const syncMeta: GoogleSlidesSyncMeta = {
    presentationId: result.presentationId,
    presentationUrl: result.url,
    title: remote.title,
    modifiedTime: remote.modifiedTime ?? new Date().toISOString(),
    slideId,
    lastSyncAt: new Date().toISOString(),
    lastDirection: existingPresentationId || meta?.presentationId ? 'sync' : 'export',
  };
  writeSyncMeta(slideId, syncMeta);
  return syncMeta;
}

export async function importGooglePresentationToSource(
  presentationIdOrUrl: string,
  slideId: string,
): Promise<{ source: string; meta: GoogleSlidesSyncMeta }> {
  const auth = readGoogleAuth();
  if (!auth) throw new Error('Not connected to Google');

  const presentationId =
    googlePresentationIdFromUrl(presentationIdOrUrl) ?? presentationIdOrUrl.trim();

  const presentation = await getPresentation(auth.accessToken, presentationId);
  const source = generateSlideModuleSource(presentation);

  const syncMeta: GoogleSlidesSyncMeta = {
    presentationId: presentation.presentationId,
    presentationUrl: `https://docs.google.com/presentation/d/${presentation.presentationId}/edit`,
    title: presentation.title,
    modifiedTime: presentation.modifiedTime ?? new Date().toISOString(),
    slideId,
    lastSyncAt: new Date().toISOString(),
    lastDirection: 'import',
  };
  writeSyncMeta(slideId, syncMeta);

  return { source, meta: syncMeta };
}

export async function syncFromGoogleIfChanged(slideId: string): Promise<{
  changed: boolean;
  source?: string;
  meta?: GoogleSlidesSyncMeta;
}> {
  const auth = readGoogleAuth();
  if (!auth) throw new Error('Not connected to Google');

  const local = readSyncMeta(slideId);
  if (!local?.presentationId) throw new Error('No linked Google presentation');

  const remote = await fetchPresentationMeta(auth.accessToken, local.presentationId);
  if (remote.modifiedTime && local.modifiedTime === remote.modifiedTime) {
    return { changed: false };
  }

  const { source, meta } = await importGooglePresentationToSource(local.presentationId, slideId);
  return { changed: true, source, meta };
}

export function getLinkedGooglePresentation(slideId: string): GoogleSlidesSyncMeta | null {
  return readSyncMeta(slideId);
}
