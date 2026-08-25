import type { DomExportElement, GoogleSlidesSyncMeta } from '../../google-slides/types';

export type GwsAuthStatus = {
  connected: boolean;
  account?: string;
  method?: 'gws';
  error?: string;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchGwsAuthStatus(): Promise<GwsAuthStatus> {
  const res = await fetch('/__google/auth/status');
  if (!res.ok) return { connected: false, error: await readError(res) };
  return res.json() as Promise<GwsAuthStatus>;
}

export async function exportToGoogleViaGws(opts: {
  title: string;
  pages: DomExportElement[][];
  presentationId?: string;
}): Promise<{
  presentationId: string;
  url: string;
  title: string;
  modifiedTime?: string;
}> {
  const res = await fetch('/__google/slides/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{
    presentationId: string;
    url: string;
    title: string;
    modifiedTime?: string;
  }>;
}

export async function importFromGoogleViaGws(presentationIdOrUrl: string): Promise<{
  source: string;
  meta: Omit<GoogleSlidesSyncMeta, 'slideId' | 'lastSyncAt'>;
}> {
  const res = await fetch('/__google/slides/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presentationIdOrUrl }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{
    source: string;
    meta: Omit<GoogleSlidesSyncMeta, 'slideId' | 'lastSyncAt'>;
  }>;
}

export async function syncCheckFromGoogleViaGws(opts: {
  presentationId: string;
  modifiedTime?: string;
}): Promise<{
  changed: boolean;
  source?: string;
  meta?: Omit<GoogleSlidesSyncMeta, 'slideId' | 'lastSyncAt'>;
}> {
  const res = await fetch('/__google/slides/sync-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<{
    changed: boolean;
    source?: string;
    meta?: Omit<GoogleSlidesSyncMeta, 'slideId' | 'lastSyncAt'>;
  }>;
}
