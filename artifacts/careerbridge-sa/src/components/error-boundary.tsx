import React, {
  Component,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  errorInfo?: ErrorInfo | null;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

export function DefaultFallback({ error, errorInfo, resetError }: ErrorFallbackProps) {
  const [copyStatus, setCopyStatus] = useState('');
  const log = `${error.name}: ${error.message}\n\n${errorInfo?.componentStack || 'Component stack unavailable.'}`;
  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(log);
      setCopyStatus('Error log copied.');
    } catch {
      setCopyStatus('Copy unavailable. Select the error details below and copy them manually.');
    }
  };
  return (
    <div role="alert" className="min-h-screen min-w-0 w-full max-w-full box-border overflow-x-hidden flex items-center justify-center bg-gray-50 p-4 sm:p-6">
      <div className="min-w-0 max-w-lg w-full text-center break-words">
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          This part of the app hit an error. The rest of the app is still
          running.
        </p>
        <button
          type="button"
          onClick={resetError}
          className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
        >
          Try again
        </button>
        {/* Temporary production diagnostics: never append profile, tokens or API payloads. */}
        <details className="mt-6 w-full min-w-0 rounded-md border border-red-200 bg-red-50 p-4 text-left">
          <summary className="cursor-pointer text-xs font-semibold text-red-800">Show Technical Error Details</summary>
          <p className="mt-3 text-xs text-red-800">Review this log before sharing; exception messages can contain sensitive information.</p>
          <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-xs text-red-700 [overflow-wrap:anywhere]">{log}</pre>
          <button type="button" onClick={() => { void copyLog(); }} className="mt-3 rounded border border-red-300 px-3 py-2 text-xs font-medium text-red-800 hover:bg-red-100">Copy Error Log</button>
          <p role="status" className="mt-2 text-xs text-red-800">{copyStatus}</p>
        </details>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error), errorInfo: null };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.setState({ errorInfo: info });
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} errorInfo={this.state.errorInfo} resetError={this.resetError} />;
  }
}
