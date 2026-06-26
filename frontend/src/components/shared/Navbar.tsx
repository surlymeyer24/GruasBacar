import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { esOperador, rutaInicioPorRoles, esSoloSupervisor, labelRolUsuario } from "@gruasbacar/shared";
import { LogOut, User, Shield, Truck, Menu, X } from "lucide-react";

export const Navbar: React.FC = () => {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Error signing out", err);
    }
  };

  if (!userData) return null;

  const isAdmin = userData.roles?.includes("ADMIN");
  const isSupervisorOnly = esSoloSupervisor(userData.roles);
  const homePath = rutaInicioPorRoles(userData.roles);
  const mainRole = userData.roles?.includes("ADMIN")
    ? "ADMIN"
    : userData.roles?.includes("SUPERVISOR")
      ? "SUPERVISOR"
      : userData.roles?.includes("ENGANCHADOR")
        ? "ENGANCHADOR"
        : userData.roles?.[0] || "ENGANCHADOR";

  return (
    <header className="sticky top-0 z-40 w-full bg-brand-purply border-b border-brand-cornflower/30 shadow-md text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2">
            <Link to={homePath} className="flex items-center gap-2 group">
              <div className="p-1.5 bg-brand-cta/15 rounded-lg text-brand-cta group-hover:bg-brand-cta/25 transition-colors border border-brand-cta/30">
                <Truck className="w-5 h-5 text-brand-cta" />
              </div>
              <span className="font-sans font-bold text-lg text-white tracking-tight">
                Gruas<span className="text-brand-cta font-extrabold">Bacar</span>
              </span>
            </Link>
          </div>

          {/* Desktop Right Info */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-brand-seashell/80">
              <User className="w-4 h-4 text-brand-pale" />
              <span className="font-medium text-white">
                {userData.nombre}
              </span>
            </div>

            {mainRole === "ADMIN" ? (
              <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-brand-cta/15 text-brand-cta rounded-lg border border-brand-cta/30">
                <Shield className="w-3.5 h-3.5 text-brand-cta" />
                Administrador
              </span>
            ) : mainRole === "SUPERVISOR" ? (
              <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-brand-cornflower/15 text-brand-seashell rounded-lg border border-brand-cornflower/30">
                <Shield className="w-3.5 h-3.5 text-brand-pale" />
                {labelRolUsuario("SUPERVISOR")}
              </span>
            ) : mainRole === "CHOFER" ? (
              <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-brand-cornflower/15 text-brand-seashell rounded-lg border border-brand-cornflower/30">
                <Truck className="w-3.5 h-3.5 text-brand-pale" />
                Chofer
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-brand-cornflower/15 text-brand-seashell rounded-lg border border-brand-cornflower/30">
                <Truck className="w-3.5 h-3.5 text-brand-pale" />
                Enganchador
              </span>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm font-semibold text-brand-seashell/90 hover:text-white hover:bg-white/10 transition-all cursor-pointer py-1.5 px-3 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>

          {/* Mobile Right Controls */}
          <div className="flex items-center md:hidden gap-3">
            {/* Quick mini role indicator */}
            {mainRole === "ADMIN" ? (
              <span className="text-[10px] font-extrabold bg-brand-cta/20 text-brand-cta px-2 py-0.5 rounded-full border border-brand-cta/30">
                ADMIN
              </span>
            ) : mainRole === "SUPERVISOR" ? (
              <span className="text-[10px] font-extrabold bg-brand-cornflower/20 text-brand-pale px-2 py-0.5 rounded-full border border-brand-cornflower/30">
                SUPV
              </span>
            ) : mainRole === "CHOFER" ? (
              <span className="text-[10px] font-extrabold bg-brand-cornflower/20 text-brand-pale px-2 py-0.5 rounded-full border border-brand-cornflower/30">
                CHOF
              </span>
            ) : (
              <span className="text-[10px] font-extrabold bg-brand-cornflower/20 text-brand-pale px-2 py-0.5 rounded-full border border-brand-cornflower/30">
                ENG
              </span>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-brand-seashell/90 hover:text-white p-1.5 rounded-lg focus:outline-none cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-brand-seashell" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-brand-cornflower/30 bg-brand-purply px-4 pt-3 pb-4 space-y-3">
          <div className="p-3 bg-white/5 rounded-xl border border-white/5">
            <p className="text-xs text-brand-pale/80 font-mono tracking-wider uppercase">Usuario Activo</p>
            <p className="text-sm font-bold text-white mt-0.5">{userData.nombre}</p>
          </div>
          
          <div className="grid grid-cols-1 gap-2">
            {userData && esOperador(userData.roles) && (
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
              >
                Dashboard Operador
              </Link>
            )}
            {isAdmin && (
              <>
                <Link
                  to="/admin-dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Dashboard Admin
                </Link>
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Configuración
                </Link>
                <Link
                  to="/reportes"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Reportes
                </Link>
              </>
            )}
            {isSupervisorOnly && (
              <>
                <Link
                  to="/supervisor-dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/supervisor/nueva-acta"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Cargar acta manual
                </Link>
                <Link
                  to="/historial"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Historial
                </Link>
                <Link
                  to="/reportes"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  Reportes
                </Link>
              </>
            )}
            {!isSupervisorOnly && (
              <Link
                to="/historial"
                onClick={() => setMobileMenuOpen(false)}
                className="text-center py-2.5 text-sm font-medium border border-brand-cornflower/20 text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
              >
                Historial
              </Link>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-2 py-3 px-4 bg-brand-cta hover:bg-brand-cta-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-brand-cta/20"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión (Salir)
          </button>
        </div>
      )}
    </header>
  );
};

export default Navbar;
