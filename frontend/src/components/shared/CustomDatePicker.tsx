import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"] as const;
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplay(ymd: string): string {
  return parseYmd(ymd).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const days: (Date | null)[] = Array.from({ length: startPad }, () => null);
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

interface CustomDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  required?: boolean;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  placeholder = "Seleccionar fecha...",
  className = "w-full",
  size = "sm",
  required = false,
}) => {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value ? parseYmd(value) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const ref = useRef<HTMLDivElement>(null);

  const label = value ? formatDisplay(value) : placeholder;
  const hasValue = Boolean(value);

  const calendarDays = useMemo(
    () => getCalendarDays(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth]
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
    if (open && value) {
      const base = parseYmd(value);
      setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    }
  }, [open, value]);

  const handleDayClick = (date: Date) => {
    onChange(toYmd(date));
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setOpen(false);
  };

  const isSm = size === "sm";

  return (
    <div ref={ref} className={`relative ${className}`}>
      {required && !value && (
        <input
          tabIndex={-1}
          className="absolute opacity-0 w-0 h-0"
          value={value}
          onChange={() => {}}
          required
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`w-full flex items-center bg-brand-bg border transition-all text-left cursor-pointer ${
          isSm
            ? "pl-8 pr-8 py-2 rounded-xl text-xs"
            : "pl-9 pr-9 py-2.5 rounded-2xl text-sm"
        } ${hasValue ? "text-brand-purply" : "text-brand-pale"} ${
          open
            ? "border-brand-cta/40 ring-2 ring-brand-cta/25"
            : "border-brand-seashell hover:border-brand-pale/50"
        }`}
      >
        <span className="truncate">{label}</span>
      </button>
      <Calendar
        className={`text-brand-pale absolute top-1/2 -translate-y-1/2 pointer-events-none ${
          isSm ? "w-3.5 h-3.5 left-2.5" : "w-4 h-4 left-3"
        }`}
      />
      <ChevronDown
        className={`text-brand-pale absolute top-1/2 -translate-y-1/2 pointer-events-none transition-transform ${
          isSm ? "w-3.5 h-3.5 right-2.5" : "w-4 h-4 right-3"
        } ${open ? "rotate-180" : ""}`}
      />

      {open && (
        <div
          role="dialog"
          className="absolute z-30 mt-2 w-[min(100vw-2rem,18.5rem)] p-4 bg-white border border-brand-seashell rounded-2xl shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() =>
                setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
              }
              className="p-1.5 rounded-lg hover:bg-brand-bg text-brand-pale hover:text-brand-purply transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-brand-purply capitalize">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </p>
            <button
              type="button"
              onClick={() =>
                setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
              }
              className="p-1.5 rounded-lg hover:bg-brand-bg text-brand-pale hover:text-brand-purply transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className="text-[10px] font-bold text-brand-pale text-center py-1"
              >
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((date, idx) => {
              if (!date) return <span key={`empty-${idx}`} />;

              const ymd = toYmd(date);
              const isSelected = ymd === value;
              const isToday = ymd === toYmd(new Date());

              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => handleDayClick(date)}
                  className={`h-8 text-xs rounded-lg transition-colors ${
                    isSelected
                      ? "bg-brand-cta text-white font-bold"
                      : isToday
                        ? "border border-brand-cta/40 text-brand-purply hover:bg-brand-bg"
                        : "text-brand-purply hover:bg-brand-bg"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {hasValue && !required && (
            <button
              type="button"
              onClick={handleClear}
              className="mt-3 w-full py-2 text-xs font-bold text-brand-pale hover:text-brand-purply border border-brand-seashell rounded-xl hover:bg-brand-bg transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
};
