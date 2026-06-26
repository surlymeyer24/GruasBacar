import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportesAggregations, ReportesKpis } from "../../hooks/useReportesData";

const CHART_COLORS = {
  purple: "#7C3AED",
  green: "#10B981",
  blue: "#3B82F6",
  orange: "#F59E0B",
  red: "#BA1814",
  gray: "#9CA3AF",
  teal: "#14B8A6",
};

const ESTADO_COLORS: Record<string, string> = {
  ENGANCHADO: CHART_COLORS.orange,
  EN_TRASLADO: CHART_COLORS.blue,
  DESENGANCHADO: CHART_COLORS.green,
  ANULADO: CHART_COLORS.red,
};

interface ReportesChartsProps {
  kpis: ReportesKpis;
  aggregations: ReportesAggregations;
  generated: boolean;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-56 text-sm text-gray-400">
      {message}
    </div>
  );
}

export const ReportesCharts: React.FC<ReportesChartsProps> = ({
  kpis,
  aggregations,
  generated,
}) => {
  if (!generated) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-gray-500 text-sm">
          Presioná <strong>Generar reporte</strong> para actualizar los gráficos con los filtros seleccionados.
        </p>
      </div>
    );
  }

  if (kpis.total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-gray-500 text-sm">No hay actas que coincidan con los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total actas", value: kpis.total, color: "text-brand-purply" },
          { label: "Finalizadas", value: kpis.finalizadas, color: "text-emerald-600" },
          { label: "En curso", value: kpis.enCurso, color: "text-blue-600" },
          { label: "Anuladas", value: kpis.anuladas, color: "text-brand-cta" },
          { label: "Tiempo prom.", value: kpis.duracionPromedioLabel, color: "text-violet-600", isText: true },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              {kpi.label}
            </p>
            <p className={`text-2xl font-bold ${kpi.color}`}>
              {"isText" in kpi && kpi.isText ? kpi.value : kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Actas por hora */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 text-center">
          Actas por hora del día
        </h3>
        {aggregations.porHora.some((h) => h.actas > 0) ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={aggregations.porHora} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="areaBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="actas"
                name="Actas"
                stroke={CHART_COLORS.blue}
                fill="url(#areaBlue)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Sin datos horarios" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por estado */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 text-center">Actas por estado</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={aggregations.porEstado}
                dataKey="value"
                nameKey="name"
                cx="40%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {aggregations.porEstado.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={ESTADO_COLORS[entry.key] ?? CHART_COLORS.gray}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Por tipo */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 text-center">Actas por tipo</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={aggregations.porTipo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="actas" name="Actas" fill={CHART_COLORS.teal} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top corralones */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 text-center">Top corralones</h3>
          {aggregations.porCorralon.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={aggregations.porCorralon}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="actas" name="Actas" fill={CHART_COLORS.purple} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Sin datos de corralones" />
          )}
        </div>

        {/* Por grúa */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 text-center">Actas por grúa</h3>
          {aggregations.porGrua.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={aggregations.porGrua}
                margin={{ top: 8, right: 8, left: 0, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="actas" name="Actas" fill={CHART_COLORS.teal} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Sin datos de grúas" />
          )}
        </div>
      </div>

      {/* Rendimiento por dupla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 text-center">
          Rendimiento por dupla
        </h3>
        {aggregations.porDupla.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={aggregations.porDupla}
              margin={{ top: 8, right: 8, left: 0, bottom: 50 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Legend />
              <Bar dataKey="total" name="Total" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="finalizadas"
                name="Finalizadas"
                fill={CHART_COLORS.blue}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Sin datos de duplas" />
        )}
      </div>

      {/* Tabla inspector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-800 mb-4">
          Tiempo de resolución por inspector
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Inspector
              </th>
              <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Actas
              </th>
              <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Tiempo prom. (hs)
              </th>
            </tr>
          </thead>
          <tbody>
            {aggregations.porInspector.map((row) => (
              <tr key={row.inspector} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2.5 px-3 text-gray-800">{row.inspector}</td>
                <td className="py-2.5 px-3 text-right font-mono text-gray-700">{row.actas}</td>
                <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                  {row.promedioHoras !== null ? `${row.promedioHoras} hs` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla resumen */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Detalle de actas</h3>
        <p className="text-xs text-gray-400 mb-4">Mostrando hasta 50 registros del resultado filtrado</p>
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-gray-100">
              {["Patente", "Acta", "Estado", "Dupla", "Corralón", "Grúa", "Duración", "Fecha"].map(
                (col) => (
                  <th
                    key={col}
                    className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    {col}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {aggregations.tablaResumen.map((row, i) => (
              <tr key={`${row.patente}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2 px-3 font-mono text-gray-800">{row.patente}</td>
                <td className="py-2 px-3 text-gray-700">{row.acta}</td>
                <td className="py-2 px-3 text-gray-700">{row.estado}</td>
                <td className="py-2 px-3 text-gray-700">{row.dupla}</td>
                <td className="py-2 px-3 text-gray-700">{row.corralon}</td>
                <td className="py-2 px-3 font-mono text-gray-700">{row.grua}</td>
                <td className="py-2 px-3 text-gray-700">{row.duracion}</td>
                <td className="py-2 px-3 text-gray-700">{row.fecha}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportesCharts;
