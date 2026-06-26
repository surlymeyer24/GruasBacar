import React from "react";
import { useAuth } from "../../context/AuthContext";
import Navbar from "./Navbar";
import AdminSidebar from "../admin/AdminSidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { userData } = useAuth();
  const isAdmin = userData?.roles?.includes("ADMIN");

  return (
    <div className="min-h-screen flex flex-col bg-brand-bg text-brand-purply transition-colors duration-200">
      <Navbar />

      <div className="flex flex-grow w-full">
        <AdminSidebar />

        <div className="flex flex-col flex-grow min-w-0">
          <main className="flex-grow flex flex-col w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex-grow flex flex-col w-full">{children}</div>
          </main>

          <footer className="py-4 border-t border-brand-seashell bg-brand-seashell/30">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <p className="text-[11px] font-mono text-brand-pale tracking-wider">
                GRUAS BACAR • CONTROL DE OPERACIONES FLOTA
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Layout;
