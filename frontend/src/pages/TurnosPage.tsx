import React from "react";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import AdminTurnosPanel from "../components/admin/AdminTurnosPanel";
import { useAdminCatalog } from "../hooks/useAdminCatalog";
import { Clock } from "lucide-react";

export const TurnosPage: React.FC = () => {
  const { data, loading, sync } = useAdminCatalog();

  if (loading || !data) {
    return <LoadingSpinner fullScreen message="Cargando turnos..." />;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Clock className="w-7 h-7 text-brand-cta" />
            Turnos del día
          </h1>
          <p className="text-sm text-brand-pale mt-1">
            Resumen de turnos activos. Editá grúa, dupla o inspector para ajustes puntuales del día.
          </p>
        </div>

        <div className="border border-brand-seashell rounded-2xl shadow-sm overflow-hidden">
          <AdminTurnosPanel
            usuarios={data.usuarios}
            gruas={data.gruas}
            duplas={data.duplas}
            onUsuariosChange={(next) => sync({ ...data, usuarios: next })}
          />
        </div>
      </div>
    </Layout>
  );
};

export default TurnosPage;
