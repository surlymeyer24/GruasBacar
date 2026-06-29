import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-brand-bg px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-cta/10 flex items-center justify-center mb-5">
          <AlertCircle className="w-7 h-7 text-brand-cta" />
        </div>
        <h1 className="text-xl font-extrabold text-brand-purply mb-2">
          Algo salió mal
        </h1>
        <p className="text-sm text-brand-pale max-w-xs mb-6">
          Ocurrió un error inesperado. Intentá recargar la aplicación.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-3 bg-brand-cta hover:bg-brand-cta-hover text-white font-bold text-sm rounded-2xl shadow-lg shadow-brand-cta/15 transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Recargar aplicación
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
