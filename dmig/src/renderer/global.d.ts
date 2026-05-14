import type { DmigAPI } from '../preload/index.js';

declare global {
  interface Window {
    dmig: DmigAPI;
  }
}

export {};
