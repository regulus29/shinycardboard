import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../ui';

interface Props {
  children: ReactNode;
  /** When this value changes (for example the route), a caught error is cleared. */
  resetKey?: unknown;
  /** "app" wraps the whole tree and offers a reload; "page" wraps one route. */
  scope?: 'page' | 'app';
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken page cannot blank the whole shell. Raw error text is
 * logged for developers and never shown to users.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI crashed:', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    if (this.props.scope === 'app') {
      return (
        <div className="boot-screen">
          <ErrorState
            title="Shiny Cardboard hit a problem"
            message="Something unexpected stopped the app. Your data on this device is safe. Reloading usually fixes it."
            retryLabel="Reload"
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return (
      <ErrorState
        title="This page hit a problem"
        message="Something went wrong while showing this page. Your data is safe."
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}
