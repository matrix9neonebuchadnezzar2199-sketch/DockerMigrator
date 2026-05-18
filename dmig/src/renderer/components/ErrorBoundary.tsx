import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorCodes, ErrorMessages } from '@shared/codes.js';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * 描画例外を捕捉し、真っ暗な画面（#root 空）を避ける。
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info });
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-boundary-fallback">
        <h1>
          [{ErrorCodes.UI_RENDER_FAILED}] {ErrorMessages[ErrorCodes.UI_RENDER_FAILED]}
        </h1>
        <pre className="error-boundary-stack">{error.stack ?? String(error)}</pre>
        {info?.componentStack && (
          <pre className="error-boundary-stack">{info.componentStack}</pre>
        )}
      </div>
    );
  }
}
