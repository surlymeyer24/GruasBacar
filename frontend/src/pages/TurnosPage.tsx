import React, { useState } from "react";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import AdminTurnosPanel from "../components/admin/AdminTurnosPanel";
import AdminDuplasPanel from "../components/admin/AdminDuplasPanel";
import { useAdminCatalog } from "../hooks/useAdminCatalog";
import { LayoutGrid, Clock, UserPlus } from "lucide-react";

type DiagramacionTab = "DUPLAS" | "TURNOS";

const TABS: { id: DiagramacionTab; label: string; icon: React.ReactNode }[] = [
  { id: "DUPLAS", label: "Duplas", icon: <UserPlus className="w-4 h-4" /> },
  { id: "TURNOS", label: "Turnos del día", icon: <Clock className="w-4 h-4" /> },
];

export const TurnosPage: React.FC = () => {
  const { data, loading, sync } = useAdminCatalog();
  const [activeTab, setActiveTab] = useState<DiagramacionTab>("DUPLAS");

  if (loading || !data) {
    return <LoadingSpinner fullScreen message="Cargando diagramación..." />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <LayoutGrid className="w-7 h-7 text-brand-cta" />
            Diagramación
          </h1>
          <p className="text-sm text-brand-pale mt-1">
            Configurá duplas, grúas asignadas y el orden de rotación. Revisá y ajustá los turnos activos del día.
          </p>
        </div>

        <div className="border border-brand-seashell rounded-2xl shadow-sm overflow-hidden bg-white">
          <div className="bg-gray-100/80 px-2 pt-2 border-b border-brand-seashell/50">
            <nav className="grid grid-cols-2 gap-0.5" role="tablist" aria-label="Secciones de diagramación">
              {TABS.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-t-xl border border-b-0 transition-colors cursor-pointer min-w-0 ${
                      selected
                        ? "bg-white text-red-700 border-brand-seashell shadow-sm relative z-10 -mb-px"
                        : "bg-transparent text-brand-pale border-transparent hover:text-gray-700 hover:bg-white/50"
                    }`}
                  >
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className={activeTab === "DUPLAS" ? "" : "hidden"}>
            <AdminDuplasPanel
              duplas={data.duplas}
              gruas={data.gruas}
              onDuplasChange={(next) => sync({ ...data, duplas: next })}
              usuarios={data.usuarios}
            />
          </div>

          <div className={activeTab === "TURNOS" ? "" : "hidden"}>
            <AdminTurnosPanel
              usuarios={data.usuarios}
              gruas={data.gruas}
              duplas={data.duplas}
              onUsuariosChange={(next) => sync({ ...data, usuarios: next })}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TurnosPage;
