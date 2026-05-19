import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WelcomeWizard } from './WelcomeWizard.js';

describe('WelcomeWizard', () => {
  afterEach(() => cleanup());

  const handlers = () => ({
    onSelectSource: vi.fn(),
    onSelectTarget: vi.fn(),
    onSkip: vi.fn(),
    onComplete: vi.fn().mockResolvedValue(undefined),
  });

  it('タイトル・選択ボタン2枚・あとで決めるが表示される', () => {
    const h = handlers();
    render(<WelcomeWizard {...h} />);
    expect(screen.getByRole('heading', { name: 'DockerMigrator へようこそ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /移行元の作業をする/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /移行先の作業をする/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'あとで決める' })).toBeInTheDocument();
  });

  it('移行元クリック → onSelectSource と onComplete', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<WelcomeWizard {...h} />);
    await user.click(screen.getByRole('button', { name: /移行元の作業をする/ }));
    expect(h.onSelectSource).toHaveBeenCalled();
    expect(h.onComplete).toHaveBeenCalled();
    expect(h.onSelectTarget).not.toHaveBeenCalled();
  });

  it('移行先クリック → onSelectTarget と onComplete', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<WelcomeWizard {...h} />);
    await user.click(screen.getByRole('button', { name: /移行先の作業をする/ }));
    expect(h.onSelectTarget).toHaveBeenCalled();
    expect(h.onComplete).toHaveBeenCalled();
  });

  it('あとで決める → onSkip と onComplete（onSelect* は呼ばれない）', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<WelcomeWizard {...h} />);
    await user.click(screen.getByRole('button', { name: 'あとで決める' }));
    expect(h.onSkip).toHaveBeenCalled();
    expect(h.onComplete).toHaveBeenCalled();
    expect(h.onSelectSource).not.toHaveBeenCalled();
    expect(h.onSelectTarget).not.toHaveBeenCalled();
  });

  it('Escape キーでは onComplete は呼ばれない', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<WelcomeWizard {...h} />);
    await user.keyboard('{Escape}');
    expect(h.onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('背景オーバーレイクリックでは onComplete は呼ばれない', async () => {
    const user = userEvent.setup();
    const h = handlers();
    const { container } = render(<WelcomeWizard {...h} />);
    const overlay = container.querySelector('.welcome-wizard-overlay');
    expect(overlay).toBeTruthy();
    await user.click(overlay!);
    expect(h.onComplete).not.toHaveBeenCalled();
  });

  it('role=dialog aria-modal=true', () => {
    render(<WelcomeWizard {...handlers()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
