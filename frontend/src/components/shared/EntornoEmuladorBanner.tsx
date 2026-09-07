import { usandoEmuladores } from "../../firebase";

/** Cinta fija cuando Auth/Firestore/Functions son los emuladores locales. */
export default function EntornoEmuladorBanner() {
  if (!usandoEmuladores) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] bg-cyan-600 text-white text-center text-xs sm:text-sm font-semibold tracking-wide px-3 py-1.5 shadow-sm"
    >
      EMULADOR LOCAL — datos en tu máquina, no hay contacto con producción
    </div>
  );
}
