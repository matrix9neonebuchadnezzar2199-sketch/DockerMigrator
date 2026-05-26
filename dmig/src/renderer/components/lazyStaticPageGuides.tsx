import React, { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** ガイド遅延読み込み中の placeholder（レイアウトシフト抑制） */
export function GuideSuspenseFallback(): React.ReactElement {
  return (
    <div className="page-guide-lazy-placeholder" aria-hidden="true">
      ガイドを読み込み中…
    </div>
  );
}

function lazyGuideBody(
  pick: (m: typeof import('./StaticPageGuides.js')) => ComponentType,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => {
    const mod = await import('./StaticPageGuides.js');
    return { default: pick(mod) };
  });
}

export const ExportPageGuideBody = lazyGuideBody((m) => m.ExportPageGuideBody);
export const ImportPageGuideBody = lazyGuideBody((m) => m.ImportPageGuideBody);
export const ComposeExportGuideBody = lazyGuideBody((m) => m.ComposeExportGuideBody);
export const ComposeImportGuideBody = lazyGuideBody((m) => m.ComposeImportGuideBody);
