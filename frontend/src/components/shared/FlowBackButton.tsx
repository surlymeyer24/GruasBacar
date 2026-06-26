import React from "react";
import { ArrowLeft } from "lucide-react";

interface FlowBackButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const FlowBackButton: React.FC<FlowBackButtonProps> = ({
  onClick,
  label = "Volver",
  disabled = false,
  className = "",
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full sm:w-auto px-4 py-2.5 border border-brand-seashell hover:bg-brand-bg disabled:opacity-50 text-brand-purply font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${className}`}
  >
    <ArrowLeft className="w-4 h-4 shrink-0" />
    {label}
  </button>
);

export default FlowBackButton;
