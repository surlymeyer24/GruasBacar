import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getFirebaseErrorMessage } from "../utils/firebaseError";
import { destinoPostLogin } from "@gruasbacar/shared";
import { motion } from "motion/react";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  UserCheck,
  Truck,
  MapPin,
  Camera,
  Activity,
} from "lucide-react";

export const LoginPage: React.FC = () => {
  const { user, userData, sessionLoading, profileLoading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [username, setUsername] = useState("");
  const [legajo, setLegajo] = useState("");

  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && userData && !profileLoading) {
      navigate(
        destinoPostLogin(userData.roles, from, userData.servicioActivoResumen),
        { replace: true }
      );
    }
  }, [user, userData, profileLoading, navigate, from]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError("Por favor ingrese su correo electrónico.");
      return;
    }
    if (!password) {
      setError("Por favor ingrese su contraseña.");
      return;
    }

    if (isSignUp) {
      if (!username.trim()) {
        setError("Por favor ingrese su nombre.");
        return;
      }
      if (!legajo.trim()) {
        setError("Por favor ingrese su número de legajo.");
        return;
      }
      if (password !== repeatPassword) {
        setError("Las contraseñas no coinciden.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await register({
          email: email.trim(),
          password,
          nombre: username.trim(),
          legajo: legajo.trim(),
        });
        setIsSignUp(false);
        setSuccess("Cuenta creada. Ya podés iniciar sesión.");
      } else {
        await login(email, password);
        setSuccess("¡Bienvenido/a! Redirigiendo...");
      }
    } catch (err: unknown) {
      setError(
        getFirebaseErrorMessage(
          err,
          "Acceso incorrecto. Verifique sus credenciales."
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-brand-bg">
        <div className="w-12 h-12 rounded-full border-4 border-brand-cta border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-medium text-brand-pale">Cargando...</p>
      </div>
    );
  }

  const inputBase =
    "w-full pl-10 pr-4 py-3 text-sm bg-brand-bg border border-brand-seashell rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-cta/30 focus:border-brand-cta text-brand-purply transition-all font-medium placeholder-brand-pale/60";

  return (
    <div className="min-h-screen w-full font-sans flex bg-brand-bg">
      {/* ─── Left Panel (Desktop) ─── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-dark via-brand-purply to-brand-dark relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-cta/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-brand-pale/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <Link to="/landing" className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-brand-cta rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-white tracking-tight">
              Gruas<span className="text-brand-cta">Bacar</span>
            </span>
          </Link>

          <h2 className="text-3xl font-black text-white tracking-tight leading-tight mb-4">
            Plataforma de control operativo de flota
          </h2>
          <p className="text-brand-pale max-w-md leading-relaxed">
            Gestione remolques, inspectores y evidencias fotográficas con
            trazabilidad completa en tiempo real.
          </p>
        </div>

        {/* Mini dashboard preview */}
        <div className="relative z-10 mt-12">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-white/60 uppercase tracking-wider">
                Estado operativo
              </p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-green-400">
                  En vivo
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { v: "47", l: "Actas", Icon: Activity },
                { v: "12", l: "Grúas", Icon: Truck },
                { v: "8m", l: "T. Resp", Icon: MapPin },
              ].map((s) => (
                <div key={s.l} className="p-3 bg-white/5 rounded-xl">
                  <s.Icon className="w-4 h-4 text-brand-cta mb-2" />
                  <p className="text-xl font-bold text-white">{s.v}</p>
                  <p className="text-[10px] text-white/40 font-medium">
                    {s.l}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {[
                {
                  plate: "ABC-123",
                  status: "Enganchado",
                  color: "bg-green-400",
                },
                {
                  plate: "XYZ-789",
                  status: "En traslado",
                  color: "bg-amber-400",
                },
                {
                  plate: "LMN-456",
                  status: "Completado",
                  color: "bg-brand-pale",
                },
              ].map((s) => (
                <div
                  key={s.plate}
                  className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${s.color}`}
                    />
                    <span className="text-xs font-semibold text-white font-mono">
                      {s.plate}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40">{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/30 mt-8">
          &copy; 2026 gruasBacar &mdash; Control y auditoría de operaciones de
          remolque
        </p>
      </div>

      {/* ─── Right Panel (Form) ─── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[440px]"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-brand-cta rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <span className="font-black text-lg tracking-tight text-brand-purply">
              Gruas<span className="text-brand-cta">Bacar</span>
            </span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-black text-brand-purply tracking-tight">
              {isSignUp ? "Crear cuenta" : "Bienvenido/a"}
            </h1>
            <p className="text-sm text-brand-pale mt-1">
              {isSignUp
                ? "Complete sus datos para registrarse"
                : "Ingrese sus credenciales para acceder"}
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 bg-brand-cta/8 border border-brand-cta/20 rounded-2xl flex items-start gap-2.5 text-sm text-brand-cta"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 bg-green-500/8 border border-green-500/20 rounded-2xl flex items-start gap-2.5 text-sm text-green-700"
            >
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </motion.div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-brand-purply">
                    Nombre completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-pale" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ej. José López"
                      className={inputBase}
                      required={isSignUp}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-brand-purply">
                    Legajo
                  </label>
                  <div className="relative">
                    <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-pale" />
                    <input
                      type="text"
                      value={legajo}
                      onChange={(e) => setLegajo(e.target.value)}
                      placeholder="Número de legajo"
                      className={inputBase}
                      required={isSignUp}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-brand-purply">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-pale" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operario@bacar.com"
                  className={inputBase}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-brand-purply">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-pale" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputBase} !pr-10`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-pale hover:text-brand-cta transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-brand-purply">
                  Repetir contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-pale" />
                  <input
                    type="password"
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputBase}
                    required={isSignUp}
                  />
                </div>
              </div>
            )}

            {!isSignUp && (
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="rememberMe"
                  className="w-4 h-4 text-brand-cta border-brand-seashell rounded-md focus:ring-brand-cta cursor-pointer accent-brand-cta"
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm text-brand-pale select-none cursor-pointer"
                >
                  Recordar sesión
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-brand-cta hover:bg-brand-cta-hover disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all cursor-pointer shadow-lg shadow-brand-cta/15 active:scale-[0.99] mt-2 flex items-center justify-center"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isSignUp ? (
                "Crear cuenta"
              ) : (
                "Iniciar Sesión"
              )}
            </button>
          </form>

          <div className="mt-8 text-center pt-6 border-t border-brand-seashell/50">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccess(null);
              }}
              className="text-sm text-brand-pale hover:text-brand-purply cursor-pointer transition-colors"
            >
              {isSignUp ? (
                <>
                  ¿Ya tiene un usuario?{" "}
                  <span className="text-brand-cta font-semibold">
                    Iniciar Sesión
                  </span>
                </>
              ) : (
                <>
                  ¿No está registrado?{" "}
                  <span className="text-brand-cta font-semibold">
                    Crear Cuenta
                  </span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
