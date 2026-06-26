import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Servicio, Usuario, turnoSigueVigente } from '@gruasbacar/shared';
import { fechaDiaServicio } from '../utils/formatters';

export interface AdminDashboardStats {
  actasEnEnganche: number;
  actasEnTraslado: number;
  actasFinalizadas: number;
  actasEsteMes: number;
  mesActualLabel: string;
  gruasActivas: number;
  gruasEnOperacion: number;
  serviciosActivos: Servicio[];
  usuariosEnTurno: Usuario[];
}

function mesActualArgentina(): { prefijo: string; label: string } {
  const now = new Date();
  const prefijo = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const label = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return { prefijo, label };
}

export async function obtenerEstadisticasAdmin(): Promise<AdminDashboardStats> {
  const [serviciosSnap, gruasSnap, usuariosSnap] = await Promise.all([
    getDocs(collection(db, 'servicios')),
    getDocs(query(collection(db, 'gruas'), where('activa', '==', true))),
    getDocs(collection(db, 'usuarios')),
  ]);

  const gruasEnOperacion = new Set<string>();
  const serviciosActivos: Servicio[] = [];
  let actasEnEnganche = 0;
  let actasEnTraslado = 0;
  let actasFinalizadas = 0;
  let actasEsteMes = 0;
  const { prefijo: mesPrefijo, label: mesActualLabel } = mesActualArgentina();

  serviciosSnap.forEach((docSnap) => {
    const servicio = docSnap.data() as Servicio;
    const dia = fechaDiaServicio(servicio);
    if (dia?.startsWith(mesPrefijo)) actasEsteMes += 1;

    if (servicio.estado === 'ENGANCHADO') {
      actasEnEnganche += 1;
      if (servicio.grua) gruasEnOperacion.add(servicio.grua);
      serviciosActivos.push(servicio);
    } else if (servicio.estado === 'EN_TRASLADO') {
      actasEnTraslado += 1;
      if (servicio.grua) gruasEnOperacion.add(servicio.grua);
      serviciosActivos.push(servicio);
    } else if (servicio.estado === 'DESENGANCHADO') {
      actasFinalizadas += 1;
    }
  });

  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const usuariosEnTurno: Usuario[] = [];
  usuariosSnap.forEach((docSnap) => {
    const u = docSnap.data() as Usuario;
    if (u.activo !== false) {
      const turnoHoy =
        u.asignacionDiaria?.fecha === hoy &&
        turnoSigueVigente(u.asignacionDiaria);
      if (turnoHoy || u.servicioActivoId) {
        usuariosEnTurno.push(u);
      }
    }
  });

  return {
    actasEnEnganche,
    actasEnTraslado,
    actasFinalizadas,
    actasEsteMes,
    mesActualLabel,
    gruasActivas: gruasSnap.size,
    gruasEnOperacion: gruasEnOperacion.size,
    serviciosActivos,
    usuariosEnTurno,
  };
}
