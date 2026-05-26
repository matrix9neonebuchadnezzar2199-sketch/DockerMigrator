import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ErrorBox } from './ErrorBox.js';

describe('ErrorBox', () => {
  it('E2075 のときコード別タイトルを表示する', () => {
    render(
      <ErrorBox
        error={{
          code: 'E2075',
          message: 'manifest 1.1: partialState 構造不正',
          detail: 'reason=empty_pending_chunks',
        }}
      />,
    );
    expect(screen.getByText('パッケージの再開情報が破損しています')).toBeInTheDocument();
    expect(screen.queryByText(/\[E2075\].*manifest/)).not.toBeInTheDocument();
  });

  it('E2071 のときコード別タイトルを表示する', () => {
    render(
      <ErrorBox
        error={{
          code: 'E2071',
          message: 'manifest 1.1: 完了パッケージを再開対象として開こうとした',
        }}
      />,
    );
    expect(screen.getByText('完了済みパッケージを再開しようとしました')).toBeInTheDocument();
  });

  it('未登録コードは従来の汎用表示になる', () => {
    render(
      <ErrorBox
        error={{
          code: 'E9999',
          message: '未知のエラー',
        }}
      />,
    );
    expect(screen.getByText(/\[E9999\]/)).toBeInTheDocument();
    expect(screen.getByText(/未知のエラー/)).toBeInTheDocument();
  });

  it('code 未指定相当（空文字）は汎用表示になる', () => {
    render(
      <ErrorBox
        error={{
          code: '',
          message: 'フォールバック',
        }}
      />,
    );
    expect(screen.getByText(/フォールバック/)).toBeInTheDocument();
  });
});
