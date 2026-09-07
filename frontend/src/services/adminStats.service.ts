import { collection, doc, getDoc, getDocs, getCountFromServer, query, where, Timestamp } from 'firebase/firestore';
import { db, esEntornoTest } from '../firebase';
import { Servicio, Usuario, Grua, turnoSigueVigente } from '@gruasbacar/shared';
import { esActaDePrueba, filtrarActasPorEntorno } from '../utils/actasEntorno';

export interface AdminDashboardStats {
  actasEnEnganche: number;
  actasEnTraslado: number;
  actasFinalizadas: number;
  actasHoy: number;
  actasEsteMes: number;
  hoyLabel: string;
  mesActualLabel: string;
  gruasActivas: number;
  gruasEnOperacion: number;
  serviciosActivos: Servicio[];
  usuariosEnTurno: Usuario[];
}

function periodosArgentina(): {
  inicioHoy: Timestamp;
  finHoy: Timestamp;
  inicioMes: Timestamp;
  hoyLabel: string;
  mesActualLabel: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  const inicioHoy = Timestamp.fromDate(new Date(`${year}-${month}-${day}T00:00:00-03:00`));
  const finHoy = Timestamp.fromMillis(inicioHoy.toMillis() + 24 * 60 * 60 * 1000);
  const inicioMes = Timestamp.fromDate(new Date(`${year}-${month}-01T00:00:00-03:00`));
  const hoyLabel = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'long',
  }).format(now);
  const mesActualLabel = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return { inicioHoy, finHoy, inicioMes, hoyLabel, mesActualLabel };
}

function enrichGruaDescripcion(u: Usuario, gruasCatalog: Grua[]): void {
  if (u.asignacionDiaria && !u.asignacionDiaria.gruaDescripcion) {
    const grua = gruasCatalog.find(
      (g) => g.patente === u.asignacionDiaria!.gruaPatente || g.id === u.asignacionDiaria!.gruaPatente
    );
    if (grua?.descripcion?.trim()) {
      u.asignacionDiaria.gruaDescripcion = grua.descripcion.trim();
    }
  }
}

export async function obtenerEstadisticasAdmin(): Promise<AdminDashboardStats> {
  const serviciosCol = collection(db, 'servicios');
  const { inicioHoy, finHoy, inicioMes, hoyLabel, mesActualLabel } = periodosArgentina();

  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const [
    enganchadosSnap,
    enTrasladoSnap,
    desenganchadosCount,
    desenganchadosTestCount,
    hoyCount,
    hoyTestCount,
    esteMesCount,
    esteMesTestCount,
    gruasSnap,
    usuariosTurnoHoySnap,
  ] = await Promise.all([
    // Listas del dashboard: siguen necesitando docs (no solo counts)
    getDocs(query(serviciosCol, where('estado', '==', 'ENGANCHADO'))),
    getDocs(query(serviciosCol, where('estado', '==', 'EN_TRASLADO'))),
    getCountFromServer(query(serviciosCol, where('estado', '==', 'DESENGANCHADO'))),
    getCountFromServer(
      query(serviciosCol, where('estado', '==', 'DESENGANCHADO'), where('esTest', '==', true))
    ),
    getCountFromServer(
      query(serviciosCol, where('creadoEn', '>=', inicioHoy), where('creadoEn', '<', finHoy))
    ),
    getCountFromServer(
      query(
        serviciosCol,
        where('creadoEn', '>=', inicioHoy),
        where('creadoEn', '<', finHoy),
        where('esTest', '==', true)
      )
    ),
    getCountFromServer(query(serviciosCol, where('creadoEn', '>=', inicioMes))),
    getCountFromServer(
      query(serviciosCol, where('creadoEn', '>=', inicioMes), where('esTest', '==', true))
    ),
    getDocs(query(collection(db, 'gruas'), where('activa', '==', true))),
    // Evita escanear toda la colección usuarios/
    getDocs(query(collection(db, 'usuarios'), where('asignacionDiaria.fecha', '==', hoy))),
  ]);

  const serviciosActivosRaw: Servicio[] = [];

  enganchadosSnap.forEach((docSnap) => {
    serviciosActivosRaw.push({ ...(docSnap.data() as Servicio), id: docSnap.id });
  });
  enTrasladoSnap.forEach((docSnap) => {
    serviciosActivosRaw.push({ ...(docSnap.data() as Servicio), id: docSnap.id });
  });

  const serviciosActivos = filtrarActasPorEntorno(serviciosActivosRaw);

  const actasEnEnganche = serviciosActivos.filter((s) => s.estado === 'ENGANCHADO').length;
  const actasEnTraslado = serviciosActivos.filter((s) => s.estado === 'EN_TRASLADO').length;

  // En prod restamos las de prueba (solo docs con esTest:true). En test mostramos el total real.
  const actasFinalizadas = esEntornoTest
    ? desenganchadosCount.data().count
    : Math.max(0, desenganchadosCount.data().count - desenganchadosTestCount.data().count);
  const actasHoy = esEntornoTest
    ? hoyCount.data().count
    : Math.max(0, hoyCount.data().count - hoyTestCount.data().count);
  const actasEsteMes = esEntornoTest
    ? esteMesCount.data().count
    : Math.max(0, esteMesCount.data().count - esteMesTestCount.data().count);

  const gruasCatalog: Grua[] = [];
  gruasSnap.forEach((d) => gruasCatalog.push({ ...(d.data() as Grua), id: d.id }));

  const byUid = new Map<string, Usuario>();
  usuariosTurnoHoySnap.forEach((docSnap) => {
    const u = { ...(docSnap.data() as Usuario), uid: docSnap.id };
    byUid.set(u.uid, u);
  });

  // Operadores con servicio activo visible pero sin asignación de hoy: fetch puntual
  const missingActivos = new Set<string>();
  for (const s of serviciosActivos) {
    if (s.creadoPor && !byUid.has(s.creadoPor)) {
      missingActivos.add(s.creadoPor);
    }
  }
  if (missingActivos.size > 0) {
    const extras = await Promise.all(
      [...missingActivos].map(async (uid) => {
        const snap = await getDoc(doc(db, 'usuarios', uid));
        if (!snap.exists()) return null;
        return { ...(snap.data() as Usuario), uid: snap.id };
      })
    );
    for (const u of extras) {
      if (u) byUid.set(u.uid, u);
    }
  }

  const gruasEnOperacion = new Set<string>();
  const usuariosEnTurno: Usuario[] = [];

  byUid.forEach((u) => {
    const enTurnoHoy =
      u.asignacionDiaria?.fecha === hoy &&
      turnoSigueVigente(u.asignacionDiaria);
    if (enTurnoHoy && u.asignacionDiaria?.gruaPatente) {
      gruasEnOperacion.add(u.asignacionDiaria.gruaPatente.trim());
    }
    const activoVisible =
      !!u.servicioActivoId &&
      (esEntornoTest
        ? esActaDePrueba(u.servicioActivoResumen)
        : !esActaDePrueba(u.servicioActivoResumen));
    if (enTurnoHoy || activoVisible) {
      enrichGruaDescripcion(u, gruasCatalog);
      usuariosEnTurno.push(u);
    }
  });

  return {
    actasEnEnganche,
    actasEnTraslado,
    actasFinalizadas,
    actasHoy,
    actasEsteMes,
    hoyLabel,
    mesActualLabel,
    gruasActivas: gruasSnap.size,
    gruasEnOperacion: gruasEnOperacion.size,
    serviciosActivos,
    usuariosEnTurno,
  };
}
