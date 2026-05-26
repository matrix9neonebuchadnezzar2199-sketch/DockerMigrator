import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

import { injectProdRendererCspMeta } from './src/shared/rendererCsp';

const root = dirname(fileURLToPath(import.meta.url));

/** 本番ビルドの index.html のみ CSP meta を注入（dev では Vite HMR を阻害しない） */
function prodRendererCspMetaPlugin(): Plugin {
  return {
    name: 'dmig-prod-renderer-csp-meta',
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html;
      }
      return injectProdRendererCspMeta(html);
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
