import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FlowStepSection } from './FlowStepSection.js';

describe('FlowStepSection', () => {
  it('完了ステップは折りたたみ要約と ▲ を表示', () => {
    render(
      <FlowStepSection
        step={1}
        title="出力先"
        summary="E:\\backup"
        status="done"
        expanded={false}
        onToggle={vi.fn()}
      >
        <p>本文</p>
      </FlowStepSection>,
    );
    expect(screen.getByRole('button', { name: /出力先/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/backup/)).toBeInTheDocument();
    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.queryByText('本文')).not.toBeInTheDocument();
  });

  it('locked のときトグルは無効', () => {
    render(
      <FlowStepSection
        step={2}
        title="プロジェクト"
        status="locked"
        expanded={false}
        onToggle={vi.fn()}
      >
        <p>本文</p>
      </FlowStepSection>,
    );
    expect(screen.getByRole('button', { name: /プロジェクト/ })).toBeDisabled();
  });

  it('展開時は本文を表示し onToggle が呼ばれる', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <FlowStepSection
        step={3}
        title="確認"
        status="active"
        expanded
        onToggle={onToggle}
      >
        <p>ドライラン</p>
      </FlowStepSection>,
    );
    expect(screen.getByText('ドライラン')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /確認/ }));
    expect(onToggle).toHaveBeenCalled();
  });
});
