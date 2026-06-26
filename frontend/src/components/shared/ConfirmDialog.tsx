import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="alertdialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className={`bg-white w-full rounded-2xl shadow-2xl z-10 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 ${
          danger ? "max-w-lg border-2 border-red-200" : "max-w-lg border border-brand-seashell"
        }`}
      >
        {danger && <div className="h-1.5 bg-brand-cta" />}

        <div className="relative px-6 pt-7 pb-5 sm:px-8 sm:pt-8 text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-brand-pale hover:bg-brand-bg transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          <div
            className={`mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center ${
              danger ? "bg-red-50 text-brand-cta" : "bg-amber-50 text-amber-600"
            }`}
          >
            <AlertTriangle className="w-8 h-8" strokeWidth={2} />
          </div>

          <h3
            id="confirm-dialog-title"
            className="text-brand-purply font-extrabold text-lg sm:text-xl tracking-tight mb-3"
          >
            {title}
          </h3>

          <p
            id="confirm-dialog-message"
            className="text-brand-pale text-sm sm:text-base leading-relaxed max-w-sm mx-auto"
          >
            {message}
          </p>
        </div>

        <div className="px-6 pb-6 sm:px-8 sm:pb-8 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 px-5 bg-white text-brand-purply border-2 border-brand-seashell hover:bg-brand-bg rounded-xl text-sm font-bold cursor-pointer transition-colors"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex-1 py-3.5 px-5 text-white rounded-xl text-sm font-extrabold cursor-pointer shadow-md transition-all focus:ring-2 focus:ring-offset-2 ${
              danger
                ? "bg-brand-cta hover:bg-brand-cta-hover focus:ring-brand-cta/40 shadow-brand-cta/20"
                : "bg-brand-cta hover:bg-brand-cta-hover focus:ring-brand-cta/40 shadow-brand-cta/20"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
