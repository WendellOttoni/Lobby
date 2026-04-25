import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <h1>Algo quebrou</h1>
          <p>O app encontrou um erro inesperado.</p>
          <details>
            <summary>Detalhes técnicos</summary>
            <pre>{this.state.error.message}</pre>
          </details>
          <div className="error-boundary-actions">
            <button onClick={this.handleRetry}>Tentar novamente</button>
            <button className="btn-secondary" onClick={this.handleReload}>Recarregar app</button>
          </div>
        </div>
      </div>
    );
  }
}
