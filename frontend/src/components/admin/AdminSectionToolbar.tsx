import React from "react";

interface AdminSectionToolbarProps {
  children: React.ReactNode;
  className?: string;
}

/** Zona de filtros/búsqueda entre las solapas principales y el contenido del panel. */
export const AdminSectionToolbar: React.FC<AdminSectionToolbarProps> = ({
  children,
  className = "",
}) => (
  <div
    className={`bg-gradient-to-b from-slate-50/90 to-white px-5 py-4 border-b border-brand-seashell/80 ${className}`}
    role="toolbar"
    aria-label="Filtros de búsqueda"
  >
    {children}
  </div>
);

export default AdminSectionToolbar;
