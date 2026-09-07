import { esEntornoTest } from "../../firebase";

/** Cinta fija en el site de prueba para no confundir con producción. */
export default function EntornoTestBanner() {
  if (!esEntornoTest) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] bg-amber-500 text-amber-950 text-center text-xs sm:text-sm font-semibold tracking-wide px-3 py-1.5 shadow-sm"
    >
      ENTORNO DE PRUEBA — las actas que crees no aparecen en producción
    </div>
  );
}
