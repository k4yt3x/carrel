import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * The last line of defence: an error that escapes a component would otherwise unmount the
 * whole app and leave a blank page. This shows what happened and a way back instead.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Carrel stopped because of an error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center bg-surface p-8">
        <div className="max-w-sm text-center" role="alert">
          <p className="text-lg font-semibold text-fg">Something went wrong</p>
          <p className="mt-2 text-sm text-fg-secondary">
            Carrel ran into an error it couldn’t recover from. Your books and settings are still in
            this browser.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-8"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
