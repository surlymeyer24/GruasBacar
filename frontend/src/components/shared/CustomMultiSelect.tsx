import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LucideIcon } from "lucide-react";

export interface CustomMultiSelectOption {
  value: string;
  label: string;
}

interface CustomMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: CustomMultiSelectOption[];
  ariaLabel?: string;
  icon?: LucideIcon;
  className?: string;
  placeholder?: string;
  size?: "md" | "sm" | "filter";
}

function summaryLabel(
  value: string[],
  options: CustomMultiSelectOption[],
  placeholder: string
): string {
  if (value.length === 0) return placeholder;
  const labels = value
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean) as string[];
  return labels.join(", ");
}

export const CustomMultiSelect: React.FC<CustomMultiSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  icon: Icon,
  className = "w-full",
  placeholder = "Seleccioná una o más opciones",
  size = "md",
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isSm = size === "sm";
  const isFilter = size === "filter";
  const label = summaryLabel(value, options, placeholder);
  const hasValue = value.length > 0;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`w-full flex items-center bg-brand-bg border cursor-pointer transition-all text-left ${
          isSm
            ? `${Icon ? "pl-8" : "pl-3"} pr-8 py-2 rounded-xl text-xs`
            : isFilter
              ? `${Icon ? "pl-7" : "pl-3"} pr-7 py-2 rounded-xl text-[13px] leading-tight`
              : `${Icon ? "pl-9" : "pl-4"} pr-9 py-2.5 rounded-2xl text-sm`
        } ${hasValue ? "text-brand-purply" : "text-brand-pale"} ${
          open
            ? "border-brand-cta/40 ring-2 ring-brand-cta/25"
            : "border-brand-seashell hover:border-brand-pale/50"
        }`}
      >
        <span className="truncate">{label}</span>
      </button>
      {Icon && (
        <Icon
          className={`text-brand-pale absolute top-1/2 -translate-y-1/2 pointer-events-none ${
            isSm || isFilter ? "w-3.5 h-3.5 left-2.5" : "w-4 h-4 left-3.5"
          }`}
        />
      )}
      <ChevronDown
        className={`text-brand-pale absolute top-1/2 -translate-y-1/2 pointer-events-none transition-transform ${
          isSm || isFilter ? "w-3.5 h-3.5 right-2.5" : "w-4 h-4 right-3.5"
        } ${open ? "rotate-180" : ""}`}
      />

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
          className={`absolute z-20 w-full bg-white border border-brand-seashell shadow-lg overflow-hidden ${
            isSm ? "mt-1.5 py-1 rounded-xl" : isFilter ? "mt-1 py-1 rounded-xl" : "mt-2 py-1.5 rounded-2xl"
          }`}
        >
          {options.map((option) => {
            const selected = value.includes(option.value);
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={`w-full flex items-center gap-2.5 text-left transition-colors ${
                    isSm
                      ? "px-3 py-2 text-xs"
                      : isFilter
                        ? "px-3 py-2 text-[13px] leading-tight"
                        : "px-4 py-2.5 text-sm"
                  } ${
                    selected
                      ? "bg-brand-cta/10 text-red-800 font-semibold"
                      : "text-brand-purply hover:bg-brand-bg"
                  }`}
                >
                  <span
                    className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                      selected
                        ? "bg-brand-cta border-brand-cta text-white"
                        : "border-brand-seashell bg-white"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
