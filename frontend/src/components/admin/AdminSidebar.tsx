import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Home, Settings, History, LayoutDashboard, Menu, FilePlus, BarChart3 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { esOperador, esSoloSupervisor } from "@gruasbacar/shared";

const STORAGE_KEY = "gruasbacar_admin_sidebar_collapsed";

export const AdminSidebar: React.FC = () => {
  const { userData } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center py-2.5 text-sm font-semibold rounded-xl transition-colors ${
      collapsed ? "justify-center px-2" : "gap-3 px-4"
    } ${
      isActive
        ? "bg-brand-cta/10 text-brand-cta border-l-2 border-l-brand-cta border border-brand-cta/20"
        : "text-gray-600 hover:bg-brand-seashell/30 hover:text-gray-900 border border-transparent"
    }`;

  const hasAdmin = userData?.roles?.includes("ADMIN");
  const hasOperador = userData ? esOperador(userData.roles) : false;
  const isSupervisorOnly = userData ? esSoloSupervisor(userData.roles) : false;

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 border-r border-brand-seashell bg-white/80 backdrop-blur-sm sticky top-16 h-[calc(100vh-4rem)] transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b border-gray-100 ${
          collapsed ? "justify-center p-3" : "p-3"
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1.5 rounded-lg text-brand-pale hover:text-brand-purply hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
          aria-expanded={!collapsed}
        >
          <Menu className="w-5 h-5" />
        </button>

        {!collapsed && (
          <div className="flex items-center gap-1.5">
            <LayoutDashboard className="w-4 h-4 text-brand-pale shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-pale truncate">
              Navegación
            </p>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-1 p-2 flex-grow overflow-y-auto">
        {hasOperador && (
          <div className="mb-2">
            {!collapsed && <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Panel Operador</p>}
            <NavLink to="/" end className={linkClass} title={collapsed ? "Inicio" : undefined}>
              <Home className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Inicio</span>}
            </NavLink>
          </div>
        )}

        {hasAdmin && (
          <div className="mb-2">
            {!collapsed && <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Panel Admin</p>}
            <NavLink to="/admin-dashboard" className={linkClass} title={collapsed ? "Dashboard Admin" : undefined}>
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Dashboard</span>}
            </NavLink>
            <NavLink to="/admin" className={linkClass} title={collapsed ? "Configuración" : undefined}>
              <Settings className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Configuración</span>}
            </NavLink>
            <NavLink to="/reportes" className={linkClass} title={collapsed ? "Reportes" : undefined}>
              <BarChart3 className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Reportes</span>}
            </NavLink>
          </div>
        )}

        {isSupervisorOnly && (
          <div className="mb-2">
            {!collapsed && (
              <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Panel Supervisor
              </p>
            )}
            <NavLink
              to="/supervisor-dashboard"
              className={linkClass}
              title={collapsed ? "Dashboard" : undefined}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Dashboard</span>}
            </NavLink>
            <NavLink
              to="/supervisor/nueva-acta"
              className={linkClass}
              title={collapsed ? "Nueva acta" : undefined}
            >
              <FilePlus className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Nueva acta</span>}
            </NavLink>
            <NavLink to="/historial" className={linkClass} title={collapsed ? "Historial" : undefined}>
              <History className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Historial</span>}
            </NavLink>
            <NavLink to="/reportes" className={linkClass} title={collapsed ? "Reportes" : undefined}>
              <BarChart3 className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Reportes</span>}
            </NavLink>
          </div>
        )}

        {!isSupervisorOnly && (
          <div className="mb-2">
            {!collapsed && <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">General</p>}
            <NavLink to="/historial" className={linkClass} title={collapsed ? "Historial" : undefined}>
              <History className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Historial</span>}
            </NavLink>
          </div>
        )}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
