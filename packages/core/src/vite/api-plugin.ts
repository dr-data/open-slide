import chalk from 'chalk';
import type { Plugin } from 'vite';
import { getGwsAuthStatus } from '../google-slides/gws-auth-server.ts';
import { registerAssetRoutes } from './routes/assets.ts';
import { registerCommentRoutes } from './routes/comments.ts';
import { type ApiPluginOptions, makeContext } from './routes/context.ts';
import { registerEditRoutes } from './routes/edit.ts';
import { registerFolderRoutes } from './routes/folders.ts';
import { registerGoogleSlidesRoutes } from './routes/google-slides.ts';
import { registerRestartRoutes } from './routes/restart.ts';
import { registerSlideRoutes } from './routes/slides.ts';
import { registerSvglRoutes } from './routes/svgl.ts';
import { registerUpdateRoutes } from './routes/update.ts';
import { registerWatchers } from './routes/watchers.ts';

// All open-slide dev-server endpoints in one plugin. To see the routes
// owned by a group, open the matching file under `routes/` — each file
// leads with a comment-block manifest of its endpoints.
export function apiPlugin(opts: ApiPluginOptions): Plugin {
  return {
    name: 'open-slide:api',
    apply: 'serve',
    configureServer(server) {
      const ctx = makeContext(opts);
      registerWatchers(server, ctx);
      registerEditRoutes(server, ctx);
      registerCommentRoutes(server, ctx);
      registerSlideRoutes(server, ctx);
      registerGoogleSlidesRoutes(server, ctx);
      registerAssetRoutes(server, ctx);
      registerSvglRoutes(server);
      registerFolderRoutes(server, ctx);
      registerUpdateRoutes(server, ctx);
      registerRestartRoutes(server);

      return async () => {
        const status = await getGwsAuthStatus();
        if (status.connected) {
          const who = status.account ?? 'Google account';
          process.stdout.write(
            `${chalk.green('●')} Google Slides ${chalk.dim('(gws)')}: ${chalk.bold(who)}\n`,
          );
        } else {
          process.stdout.write(
            `${chalk.yellow('○')} Google Slides ${chalk.dim('(gws)')}: ${chalk.dim('not connected')} — ${status.error ?? 'gws auth login -s slides,drive'}\n`,
          );
        }
      };
    },
  };
}
