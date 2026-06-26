import React from "react";

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  fullScreen = false, 
  message = "Cargando..." 
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center p-6 space-y-4">
      <div className="relative w-12 h-12">
        <div className="absolute top-0 left-0 w-full h-full rounded-full border-4 border-brand-seashell border-t-brand-cta animate-spin" />
      </div>
      <p className="text-sm font-mono text-brand-pale tracking-wider uppercase animate-pulse">
        {message}
      </p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-bg/95 transition-all">
        {content}
      </div>
    );
  }

  return content;
};

export default LoadingSpinner;
