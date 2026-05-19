import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepIndicator } from './StepIndicator.js';

describe('StepIndicator', () => {
  afterEach(() => cleanup());

  it('compose: 移行元 3 ステップ、1 が current', () => {
    render(<StepIndicator page="compose" />);
    const nav = screen.getByRole('navigation', { name: '移行元の作業フロー' });
    const items = within(nav).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(within(items[0]!).getByText('プロジェクトを選ぶ')).toBeInTheDocument();
  });

  it('export: ステップ 2 が current', () => {
    render(<StepIndicator page="export" />);
    const nav = screen.getByRole('navigation', { name: '移行元の作業フロー' });
    const items = within(nav).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('resume: ステップ 3 が current', () => {
    render(<StepIndicator page="resume" />);
    const nav = screen.getByRole('navigation', { name: '移行元の作業フロー' });
    const items = within(nav).getAllByRole('listitem');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
  });

  it('import: 移行先 2 ステップで 2 が current', () => {
    render(<StepIndicator page="import" />);
    const nav = screen.getByRole('navigation', { name: '移行先の作業フロー' });
    const items = within(nav).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
  });

  it('ステップクリックで onNavigate', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<StepIndicator page="export" onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: /プロジェクトを選ぶ/ }));
    expect(onNavigate).toHaveBeenCalledWith('compose');
  });

  it('source-overview / help: 非表示', () => {
    const { rerender } = render(<StepIndicator page="source-overview" />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    rerender(<StepIndicator page="help" />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('target-overview: 移行先 step 1 が current', () => {
    render(<StepIndicator page="target-overview" />);
    const nav = screen.getByRole('navigation', { name: '移行先の作業フロー' });
    expect(within(nav).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step');
  });
});
