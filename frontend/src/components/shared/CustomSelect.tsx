import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LucideIcon } from "lucide-react";

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  ariaLabel?: string;
  icon?: LucideIcon;
  className?: string;
  placeholder?: string;
  size?: "md" | "sm" | "filter";
  disabled?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel,
  icon: Icon,
  className = "w-full",
  placeholder,
  size = "md",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const label = selectedOption?.label ?? placeholder ?? options[0]?.label ?? "";
  const hasValue = Boolean(selectedOption);
  const isSm = size === "sm";
  const isFilter = size === "filter";

  const menuClassName = `bg-white border border-brand-seashell shadow-xl overflow-hidden max-h-60 overflow-y-auto ${
    isSm ? "py-1 rounded-xl" : isFilter ? "py-1 rounded-xl" : "py-1.5 rounded-2xl"
  }`;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
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

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const gap = size === "sm" || size === "filter" ? 6 : 8;

    const updatePosition = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const menuMaxHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuMaxHeight && rect.top > spaceBelow;

      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, size]);

  const menuList = (
    <ul
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      style={menuStyle}
      className={menuClassName}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <li key={option.value} role="option" aria-selected={selected}>
            <button
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full text-left transition-colors ${
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
              {option.label}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`w-full flex items-center bg-brand-bg border transition-all text-left ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${
          isSm
            ? `${Icon ? "pl-8" : "pl-3"} pr-8 py-2 rounded-xl text-xs`
            : isFilter
              ? `${Icon ? "pl-7" : "pl-3"} pr-7 py-2 rounded-xl text-[13px] leading-tight`
              : `${Icon ? "pl-9" : "pl-4"} pr-9 py-2.5 rounded-2xl text-sm`
        } ${hasValue ? "text-brand-purply" : "text-brand-pale"} ${
          open && !disabled
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

      {open && typeof document !== "undefined" && createPortal(menuList, document.body)}
    </div>
  );
};
