import React from "react";
import {
  BarChart3,
  Calendar,
  Clock,
  Filter,
  RotateCcw,
  Truck,
  Users,
  Building2,
  Tag,
  UserCheck,
  FileDown,
} from "lucide-react";
import { CustomSelect } from "../shared/CustomSelect";
import { DateRangePicker } from "../shared/DateRangePicker";
import LoadingSpinner from "../shared/LoadingSpinner";
import { useReportesData } from "../../hooks/useReportesData";
import { ReportesCharts } from "./ReportesCharts";
import type { ReportesFilterState } from "../../utils/reportesFilters";

function exportCsv(
  rows: {
    patente: string;
    acta: string;
    estado: string;
    dupla: string;
    corralon: string;
    grua: string;
    duracion: string;
    fecha: string;
  }[]
) {
  const headers = ["Patente", "Acta", "Estado", "Dupla", "Corralón", "Grúa", "Duración", "Fecha"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [r.patente, r.acta, r.estado, r.dupla, r.corralon, r.grua, r.duracion, r.fecha]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-gruas-bacar-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface FilterFieldProps {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function FilterField({ label, icon, children }: FilterFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

export const ReportesPanel: React.FC = () => {
  const {
    loading,
    filters,
    setFilters,
    filterOptions,
    tipoOptions,
    tiempoOptions,
    generated,
    generarReporte,
    limpiarFiltros,
    kpis,
    aggregations,
    totalServicios,
  } = useReportesData();

  const patchFilter = <K extends keyof ReportesFilterState>(key: K, value: ReportesFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <LoadingSpinner message="Cargando datos para reportes..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-brand-cta text-xs font-mono tracking-wider uppercase font-semibold">
            Análisis operacional
          </p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-brand-cta" />
            Reportes avanzados
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalServicios} actas en base · Filtrá por fecha, personal, flota y tiempos
          </p>
        </div>
        {generated && aggregations.tablaResumen.length > 0 && (
          <button
            type="button"
            onClick={() => exportCsv(aggregations.tablaResumen)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
          >
            <FileDown className="w-4 h-4" />
            Descargar CSV
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-brand-cta" />
          <h2 className="text-sm font-bold text-gray-800">Filtros del reporte</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterField label="Rango de fecha" icon={<Calendar className="w-3 h-3" />}>
            <DateRangePicker
              from={filters.dateFrom}
              to={filters.dateTo}
              onChange={(from, to) => {
                setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }));
              }}
            />
          </FilterField>

          <FilterField label="Enganchador" icon={<Users className="w-3 h-3" />}>
            <CustomSelect
              value={filters.enganchador}
              onChange={(v) => patchFilter("enganchador", v)}
              options={filterOptions.enganchador}
              icon={Users}
              size="filter"
            />
          </FilterField>

          <FilterField label="Chofer" icon={<Truck className="w-3 h-3" />}>
            <CustomSelect
              value={filters.chofer}
              onChange={(v) => patchFilter("chofer", v)}
              options={filterOptions.chofer}
              icon={Truck}
              size="filter"
            />
          </FilterField>

          <FilterField label="Dupla" icon={<Users className="w-3 h-3" />}>
            <CustomSelect
              value={filters.dupla}
              onChange={(v) => patchFilter("dupla", v)}
              options={filterOptions.dupla}
              icon={Users}
              size="filter"
            />
          </FilterField>

          <FilterField label="Tipo" icon={<Tag className="w-3 h-3" />}>
            <CustomSelect
              value={filters.tipo}
              onChange={(v) => patchFilter("tipo", v)}
              options={tipoOptions}
              icon={Tag}
              size="filter"
            />
          </FilterField>

          <FilterField label="Inspector" icon={<UserCheck className="w-3 h-3" />}>
            <CustomSelect
              value={filters.inspector}
              onChange={(v) => patchFilter("inspector", v)}
              options={filterOptions.inspector}
              icon={UserCheck}
              size="filter"
            />
          </FilterField>

          <FilterField label="Corralón" icon={<Building2 className="w-3 h-3" />}>
            <CustomSelect
              value={filters.corralon}
              onChange={(v) => patchFilter("corralon", v)}
              options={filterOptions.corralon}
              icon={Building2}
              size="filter"
            />
          </FilterField>

          <FilterField label="Tiempos" icon={<Clock className="w-3 h-3" />}>
            <CustomSelect
              value={filters.tiempo}
              onChange={(v) => patchFilter("tiempo", v as ReportesFilterState["tiempo"])}
              options={tiempoOptions}
              icon={Clock}
              size="filter"
            />
          </FilterField>

          <FilterField label="Grúa" icon={<Truck className="w-3 h-3" />}>
            <CustomSelect
              value={filters.grua}
              onChange={(v) => patchFilter("grua", v)}
              options={filterOptions.grua}
              icon={Truck}
              size="filter"
            />
          </FilterField>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={limpiarFiltros}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl border border-gray-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Limpiar
          </button>
          <button
            type="button"
            onClick={generarReporte}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white text-sm font-semibold rounded-xl shadow-sm shadow-brand-cta/15 transition-colors cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
            Generar reporte
          </button>
        </div>
      </div>

      <ReportesCharts kpis={kpis} aggregations={aggregations} generated={generated} />
    </div>
  );
};

export default ReportesPanel;
