import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"] as const;
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
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

function normalizeRange(from: string, to: string): { from: string; to: string } {
  if (!from || !to) return { from, to };
  return from <= to ? { from, to } : { from: to, to: from };
}

function rangeLabel(from: string, to: string): string {
  if (!from && !to) return "Todas las fechas";
  if (from && !to) return `Desde ${formatDisplay(from)}`;
  const { from: a, to: b } = normalizeRange(from, to);
  if (a === b) return formatDisplay(a);
  return `${formatDisplay(a)} – ${formatDisplay(b)}`;
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

function isBetween(ymd: string, start: string, end: string): boolean {
  const [a, b] = start <= end ? [start, end] : [end, start];
  return ymd >= a && ymd <= b;
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  ariaLabel?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  from,
  to,
  onChange,
  className = "w-full sm:w-60 shrink-0",
  ariaLabel = "Filtrar por rango de fechas",
}) => {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = from ? parseYmd(from) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [hoverYmd, setHoverYmd] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const label = rangeLabel(from, to);
  const hasRange = Boolean(from || to);

  const calendarDays = useMemo(
    () => getCalendarDays(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth]
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectingEnd(false);
        setHoverYmd(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSelectingEnd(false);
        setHoverYmd(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && from) {
      const base = parseYmd(from);
      setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    }
  }, [open, from]);

  const handleDayClick = (date: Date) => {
    const ymd = toYmd(date);

    if (!selectingEnd || !from) {
      onChange(ymd, "");
      setSelectingEnd(true);
      setHoverYmd(null);
      return;
    }

    const { from: start, to: end } = normalizeRange(from, ymd);
    onChange(start, end);
    setSelectingEnd(false);
    setHoverYmd(null);
    setOpen(false);
  };

  const previewEnd = selectingEnd && from && hoverYmd ? hoverYmd : to;
  const rangeStart = from;
  const rangeEnd = previewEnd;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`w-full flex items-center pl-7 pr-7 py-2 bg-brand-bg border rounded-xl text-[13px] leading-tight cursor-pointer transition-all text-left ${
          hasRange ? "text-brand-purply" : "text-brand-pale"
        } ${
          open
            ? "border-brand-cta/40 ring-2 ring-brand-cta/25"
            : "border-brand-seashell hover:border-brand-pale/50"
        }`}
      >
        <span className="truncate">{label}</span>
      </button>
      <Calendar className="w-3.5 h-3.5 text-brand-pale absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <ChevronDown
        className={`w-3.5 h-3.5 text-brand-pale absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />

      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel}
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

          <p className="text-[10px] text-brand-pale mb-2">
            {selectingEnd && from
              ? "Elegí la fecha de fin del rango"
              : "Elegí la fecha de inicio del rango"}
          </p>

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
              if (!date) {
                return <span key={`empty-${idx}`} />;
              }

              const ymd = toYmd(date);
              const isStart = ymd === rangeStart;
              const isEnd = Boolean(rangeEnd) && ymd === rangeEnd;
              const inRange =
                rangeStart &&
                rangeEnd &&
                isBetween(ymd, rangeStart, rangeEnd) &&
                !isStart &&
                !isEnd;
              const isToday = ymd === toYmd(new Date());

              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => handleDayClick(date)}
                  onMouseEnter={() => selectingEnd && from && setHoverYmd(ymd)}
                  onMouseLeave={() => setHoverYmd(null)}
                  className={`h-8 text-xs rounded-lg transition-colors ${
                    isStart || isEnd
                      ? "bg-brand-cta text-white font-bold"
                      : inRange
                        ? "bg-brand-cta/15 text-brand-purply font-medium"
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

          {hasRange && (
            <button
              type="button"
              onClick={() => {
                onChange("", "");
                setSelectingEnd(false);
                setHoverYmd(null);
              }}
              className="mt-3 w-full py-2 text-xs font-bold text-brand-pale hover:text-brand-purply border border-brand-seashell rounded-xl hover:bg-brand-bg transition-colors"
            >
              Limpiar fechas
            </button>
          )}
        </div>
      )}
    </div>
  );
};
