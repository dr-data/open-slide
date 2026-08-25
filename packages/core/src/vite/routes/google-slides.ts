import type { ViteDevServer } from 'vite';
import {
  exportElementsToGoogle,
  fetchPresentationMeta,
  getPresentation,
} from '../../google-slides/api.ts';
import { getGwsAuthStatus, requireGwsAccessToken } from '../../google-slides/gws-auth-server.ts';
import {
  generateSlideModuleSource,
  googlePresentationIdFromUrl,
} from '../../google-slides/jsx-generator.ts';
import type { DomExportElement } from '../../google-slides/types.ts';
import { validateMutationRequest } from '../../http/request-guard.ts';
import { type ApiContext, json, readBody } from './context.ts';

// GET  /__google/auth/status
// POST /__google/slides/export
// POST /__google/slides/import
// POST /__google/slides/sync-check

export function registerGoogleSlidesRoutes(server: ViteDevServer, _ctx: ApiContext): void {
  server.middlewares.use('/__google', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const method = req.method ?? 'GET';

    try {
      if (url.pathname === '/auth/status' && method === 'GET') {
        const status = await getGwsAuthStatus();
        return json(res, 200, status);
      }

      if (url.pathname === '/slides/export' && method === 'POST') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }

        const body = (await readBody(req)) as {
          title?: unknown;
          pages?: unknown;
          presentationId?: unknown;
        };

        if (typeof body.title !== 'string' || !Array.isArray(body.pages)) {
          return json(res, 400, { error: 'invalid export payload' });
        }

        const pages = body.pages as DomExportElement[][];
        const accessToken = await requireGwsAccessToken();
        const existingId =
          typeof body.presentationId === 'string' ? body.presentationId.trim() : '';

        const result = await exportElementsToGoogle(accessToken, existingId, pages, body.title);

        const remote = await fetchPresentationMeta(accessToken, result.presentationId);
        return json(res, 200, {
          presentationId: result.presentationId,
          url: result.url,
          title: remote.title,
          modifiedTime: remote.modifiedTime,
        });
      }

      if (url.pathname === '/slides/import' && method === 'POST') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }

        const body = (await readBody(req)) as { presentationIdOrUrl?: unknown };
        if (typeof body.presentationIdOrUrl !== 'string' || !body.presentationIdOrUrl.trim()) {
          return json(res, 400, { error: 'invalid presentationIdOrUrl' });
        }

        const accessToken = await requireGwsAccessToken();
        const presentationId =
          googlePresentationIdFromUrl(body.presentationIdOrUrl) ?? body.presentationIdOrUrl.trim();

        const presentation = await getPresentation(accessToken, presentationId);
        const source = generateSlideModuleSource(presentation);
        const remote = await fetchPresentationMeta(accessToken, presentation.presentationId);

        return json(res, 200, {
          source,
          meta: {
            presentationId: presentation.presentationId,
            presentationUrl: `https://docs.google.com/presentation/d/${presentation.presentationId}/edit`,
            title: presentation.title,
            modifiedTime: remote.modifiedTime ?? new Date().toISOString(),
            lastDirection: 'import',
          },
        });
      }

      if (url.pathname === '/slides/sync-check' && method === 'POST') {
        const requestCheck = validateMutationRequest(req, { requireJsonBody: true });
        if (!requestCheck.ok) {
          return json(res, requestCheck.status, { error: requestCheck.error });
        }

        const body = (await readBody(req)) as {
          presentationId?: unknown;
          modifiedTime?: unknown;
        };

        if (typeof body.presentationId !== 'string' || !body.presentationId.trim()) {
          return json(res, 400, { error: 'invalid presentationId' });
        }

        const accessToken = await requireGwsAccessToken();
        const remote = await fetchPresentationMeta(accessToken, body.presentationId.trim());

        const changed =
          typeof body.modifiedTime !== 'string' ||
          !remote.modifiedTime ||
          remote.modifiedTime !== body.modifiedTime;

        if (!changed) {
          return json(res, 200, { changed: false });
        }

        const presentation = await getPresentation(accessToken, body.presentationId.trim());
        const source = generateSlideModuleSource(presentation);

        return json(res, 200, {
          changed: true,
          source,
          meta: {
            presentationId: presentation.presentationId,
            presentationUrl: `https://docs.google.com/presentation/d/${presentation.presentationId}/edit`,
            title: presentation.title,
            modifiedTime: remote.modifiedTime ?? new Date().toISOString(),
            lastDirection: 'sync',
          },
        });
      }

      return next();
    } catch (err) {
      return json(res, 500, { error: String((err as Error).message ?? err) });
    }
  });
}
