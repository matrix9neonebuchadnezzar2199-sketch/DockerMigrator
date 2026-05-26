import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

import { PROD_RENDERER_CONTENT_SECURITY_POLICY } from './src/shared/rendererCsp';

const root = dirname(fileURLToPath(import.meta.url));

/** 本番ビルドの index.html のみ CSP meta を注入（dev では Vite HMR を阻害しない） */
function prodRendererCspMetaPlugin(): Plugin {
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${PROD_RENDERER_CONTENT_SECURITY_POLICY}" />`;
  return {
    name: 'dmig-prod-renderer-csp-meta',
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html;
      }
      return html.replace('<head>', `<head>\n    ${metaTag}`);
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
        '@main': resolve(root, 'src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // サンドボックス上の preload はトップレベル import が使えないため CJS 1 ファイルに束ねる
    build: {
      lib: {
        entry: resolve(root, 'src/preload/index.ts'),
        formats: ['cjs'],
      },
    },
  },
  renderer: {
    plugins: [react(), prodRendererCspMetaPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(root, 'src/shared'),
        '@renderer': resolve(root, 'src/renderer'),
      },
    },
    root: resolve(root, 'src/renderer'),
    build: {
      rollupOptions: {
        input: resolve(root, 'src/renderer/index.html'),
      },
    },
  },
});
