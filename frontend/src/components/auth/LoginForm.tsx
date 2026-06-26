import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { LogIn, Key, Mail, Truck, AlertTriangle } from "lucide-react";

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Por favor complete todos el correo y su contraseña.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message || "Error al iniciar sesión. Verifique sus credenciales.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-brand-seashell dark:border-zinc-800">
      <div className="flex flex-col items-center mb-6">
        <div className="p-3 bg-brand-purply rounded-xl mb-3 text-white shadow-lg shadow-brand-purply/15">
          <Truck className="w-8 h-8 text-brand-orange" />
        </div>
        <h1 className="text-2xl font-sans font-bold text-gray-900 dark:text-gray-100 tracking-tight text-center">
          gruas<span className="text-brand-orange font-extrabold">Bacar</span>
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider mt-1 uppercase">
          Towing & Hookup Control System
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-350 tracking-wide uppercase mb-1.5 font-mono">
            Correo Electrónico
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <Mail className="w-4 h-4" />
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="chofer@bacar.com"
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purply/20 focus:border-brand-purply text-gray-900 dark:text-gray-100 placeholder:text-gray-450 transition-all font-mono"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-350 tracking-wide uppercase mb-1.5 font-mono">
            Contraseña
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
              <Key className="w-4 h-4" />
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-purply/20 focus:border-brand-purply text-gray-900 dark:text-gray-100 transition-all font-mono"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-4 bg-brand-purply hover:bg-[#0B090A] disabled:bg-brand-purply/50 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-purply/20 cursor-pointer transition-all active:scale-[0.98]"
        >
          {submitting ? "Iniciando Sesión..." : "Ingresar"}
          <LogIn className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
