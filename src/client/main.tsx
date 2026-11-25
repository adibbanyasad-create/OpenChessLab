import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-mono/400.css';
import { App } from './App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OpenChessLab UI error', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <div className="fatal-error">
          <h1>Let's get you back to the board.</h1>
          <p>
            The workspace ran into an unexpected error. Your last game is saved in this browser when
            storage is available.
          </p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload workspace
          </button>
          <button
            className="button secondary"
            onClick={() => {
              try {
                localStorage.removeItem('ocl-workspace-v1');
              } catch {
                /* Storage is unavailable. */
              }
              location.reload();
            }}
          >
            Reset workspace
          </button>
        </div>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
