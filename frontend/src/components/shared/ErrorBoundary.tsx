import React from "react";
import { AlertCircle, Copy, RefreshCw, Share2 } from "lucide-react";
import { logger } from "../../utils/logger";

interface State {
  hasError: boolean;
  reportStatus: string | null;
}

function supportsNativeShare(): boolean {
  return typeof (navigator as unknown as { share?: unknown }).share === "function";
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { hasError: false, reportStatus: null };

  static getDerivedStateFromError(): State {
    return { hasError: true, reportStatus: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const errorWithComponentStack = new Error(error.message);
    errorWithComponentStack.stack = [error.stack, info.componentStack].filter(Boolean).join("\n");
    logger.error("render", "Error al renderizar la aplicación", errorWithComponentStack);
  }

  private copyReport = async () => {
    try {
      await navigator.clipboard.writeText(logger.exportText());
      this.setState({ reportStatus: "Reporte copiado" });
    } catch {
      this.setState({ reportStatus: "No se pudo copiar el reporte" });
    }
  };

  private shareReport = async () => {
    if (!supportsNativeShare()) {
      await this.copyReport();
      return;
    }
    try {
      await navigator.share({
        title: "Reporte de error - Grúas Bacar",
        text: logger.exportText(),
      });
      this.setState({ reportStatus: "Reporte compartido" });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.setState({ reportStatus: "No se pudo compartir el reporte" });
      }
    }
  };

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
        <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm justify-center">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-brand-cta hover:bg-brand-cta-hover text-white font-bold text-sm rounded-2xl shadow-lg shadow-brand-cta/15 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Recargar
          </button>
          <button
            onClick={this.shareReport}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-brand-purply border border-brand-seashell font-bold text-sm rounded-2xl transition-all cursor-pointer"
          >
            {supportsNativeShare() ? (
              <Share2 className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {supportsNativeShare() ? "Compartir reporte" : "Copiar reporte"}
          </button>
        </div>
        {this.state.reportStatus && (
          <p className="mt-3 text-xs font-semibold text-brand-pale" role="status">
            {this.state.reportStatus}
          </p>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
