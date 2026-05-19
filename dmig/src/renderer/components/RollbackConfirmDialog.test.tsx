import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RollbackConfirmDialog } from './RollbackConfirmDialog.js';

describe('RollbackConfirmDialog', () => {
  afterEach(() => cleanup());

  it('directory 件数を warn 表示する', () => {
    render(
      <RollbackConfirmDialog
        packageDir="/pack.dmig"
        kind="import"
        createdAt="2026-01-01T00:00:00.000Z"
        entries={[
          { id: 'img-001', type: 'docker-image', target: 'sha256:abc' },
          { id: 'dir-001', type: 'directory', target: '/dest', hint: 'ホストファイルが削除されます' },
        ]}
        busy={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/ディレクトリ 1 件/)).toBeInTheDocument();
    expect(screen.getByText(/ホスト上のファイルが削除される場合があります/)).toBeInTheDocument();
  });

  it('確認で onConfirm が呼ばれる', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <RollbackConfirmDialog
        packageDir="/pack.dmig"
        kind="export"
        createdAt="2026-01-01T00:00:00.000Z"
        entries={[{ id: 'pack-001', type: 'directory', target: '/pack.dmig' }]}
        busy={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'ロールバック実行' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
