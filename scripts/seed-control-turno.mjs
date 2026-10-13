/**
 * Carga datos de prueba para el modal de Control de Turno.
 * Crea grúas (con prefijo), duplas, usuarios operadores (con y sin turno),
 * un admin, y un servicio activo para uno de los operadores.
 *
 * Uso: node scripts/seed-control-turno.mjs
 * Solo emulador local. Requiere emuladores corriendo (npm run emu).
 */
import { initEmulatorAdmin } from './lib/initFirebaseAdmin.mjs';

const { db, auth } = initEmulatorAdmin(process.argv);

const TEST_PASSWORD = 'Test1234!';
const HOY = new Date().toISOString().slice(0, 10);
const AHORA = new Date().toISOString();

// ── Grúas ──────────────────────────────────────────────────────

const GRUAS = [
  { id: 'grua-t16', patente: 'AB123CD', descripcion: 'Iveco Daily 70C', prefijo: 'T-16', activa: true, tipo: 'TRANSITO' },
  { id: 'grua-t18', patente: 'EF456GH', descripcion: 'Iveco Daily 50C', prefijo: 'T-18', activa: true, tipo: 'TRANSITO' },
  { id: 'grua-g01', patente: 'IJ789KL', descripcion: 'Mercedes Atego 1726', prefijo: 'G-01', activa: true, tipo: 'TRANSPORTE' },
  { id: 'grua-t20', patente: 'MN012OP', descripcion: 'Iveco Daily 70C', prefijo: 'T-20', activa: true, tipo: 'TRANSITO' },
  {
    id: 'grua-t22', patente: 'QR345ST', descripcion: 'Ford Cargo 1722', prefijo: 'T-22',
    activa: false, tipo: 'TRANSITO',
    fueraDeServicio: {
      categoria: 'TALLER',
      motivo: 'Service de 50.000 km',
      desde: AHORA,
      desactivadaPorUid: 'admin-1',
      desactivadaPorNombre: 'Carolina Rodríguez',
    },
  },
  {
    id: 'grua-g03', patente: 'UV678WX', descripcion: 'Scania P310', prefijo: 'G-03',
    activa: false, tipo: 'TRANSPORTE',
    fueraDeServicio: {
      categoria: 'ROTURA',
      motivo: 'Bomba hidráulica rota',
      desde: AHORA,
      desactivadaPorUid: 'admin-1',
      desactivadaPorNombre: 'Carolina Rodríguez',
    },
  },
];

// ── Duplas ──────────────────────────────────────────────────────

const DUPLAS = [
  { id: 'dupla-01', chofer: 'Pedro Gómez M.', enganchador: 'Lautaro Martínez', tipo: 'TRANSITO', gruaId: 'grua-t16', legajoChofer: '1001', legajoEnganchador: '1002' },
  { id: 'dupla-02', chofer: 'Marcelo Gallardo S.', enganchador: 'Enzo Pérez', tipo: 'TRANSITO', gruaId: 'grua-t18', legajoChofer: '1003', legajoEnganchador: '1004' },
  { id: 'dupla-03', chofer: 'Carlos Tévez P.', enganchador: 'Mateo Díaz', tipo: 'TRANSPORTE', gruaId: 'grua-g01', legajoChofer: '1005', legajoEnganchador: '1006' },
  { id: 'dupla-04', chofer: 'Esteban Gomis', enganchador: 'Julián Álvarez', tipo: 'TRANSITO', gruaId: 'grua-t20', legajoChofer: '1007', legajoEnganchador: '1008' },
];

// ── Usuarios ────────────────────────────────────────────────────

const USUARIOS = [
  // Admin
  {
    uid: 'admin-1',
    nombre: 'Carolina Rodríguez',
    email: 'carolina@test.com',
    roles: ['ADMIN'],
    legajo: '0001',
    activo: true,
    servicioActivoId: null,
  },
  // Operador con turno activo + servicio activo
  {
    uid: 'op-pedro',
    nombre: 'Pedro Gómez M.',
    email: 'pedro@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1001',
    activo: true,
    servicioActivoId: 'srv-activo-1',
    servicioActivoResumen: {
      estado: 'ENGANCHADO',
      patente: 'AA 123 BB',
      descripcionVehiculo: 'VW Gol Trend gris',
      creadoEn: AHORA,
    },
    asignacionDiaria: {
      fecha: HOY,
      gruaPatente: 'AB123CD',
      gruaDescripcion: 'Iveco Daily 70C',
      gruaPrefijo: 'T-16',
      duplaId: 'dupla-01',
      duplaChofer: 'Pedro Gómez M.',
      duplaEnganchador: 'Lautaro Martínez',
      legajoChofer: '1001',
      legajoEnganchador: '1002',
      tipoFlota: 'TRANSITO',
      inicioEn: AHORA,
    },
  },
  // Operador con turno activo, sin servicio
  {
    uid: 'op-marcelo',
    nombre: 'Marcelo Gallardo S.',
    email: 'marcelo@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1003',
    activo: true,
    servicioActivoId: null,
    asignacionDiaria: {
      fecha: HOY,
      gruaPatente: 'EF456GH',
      gruaDescripcion: 'Iveco Daily 50C',
      gruaPrefijo: 'T-18',
      duplaId: 'dupla-02',
      duplaChofer: 'Marcelo Gallardo S.',
      duplaEnganchador: 'Enzo Pérez',
      legajoChofer: '1003',
      legajoEnganchador: '1004',
      tipoFlota: 'TRANSITO',
      inicioEn: AHORA,
    },
  },
  // Operador con turno de transporte
  {
    uid: 'op-carlos',
    nombre: 'Carlos Tévez P.',
    email: 'carlos@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1005',
    activo: true,
    servicioActivoId: null,
    asignacionDiaria: {
      fecha: HOY,
      gruaPatente: 'IJ789KL',
      gruaDescripcion: 'Mercedes Atego 1726',
      gruaPrefijo: 'G-01',
      duplaId: 'dupla-03',
      duplaChofer: 'Carlos Tévez P.',
      duplaEnganchador: 'Mateo Díaz',
      legajoChofer: '1005',
      legajoEnganchador: '1006',
      tipoFlota: 'TRANSPORTE',
      inicioEn: AHORA,
    },
  },
  // Operador SIN turno (disponible para asignar)
  {
    uid: 'op-esteban',
    nombre: 'Esteban Gomis',
    email: 'esteban@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1007',
    activo: true,
    servicioActivoId: null,
  },
  // Enganchadores (compañeros de dupla)
  {
    uid: 'eng-lautaro',
    nombre: 'Lautaro Martínez',
    email: 'lautaro@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1002',
    activo: true,
    servicioActivoId: null,
  },
  {
    uid: 'eng-enzo',
    nombre: 'Enzo Pérez',
    email: 'enzo@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1004',
    activo: true,
    servicioActivoId: null,
  },
  {
    uid: 'eng-mateo',
    nombre: 'Mateo Díaz',
    email: 'mateo@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1006',
    activo: true,
    servicioActivoId: null,
  },
  {
    uid: 'eng-julian',
    nombre: 'Julián Álvarez',
    email: 'julian@test.com',
    roles: ['ENGANCHADOR'],
    legajo: '1008',
    activo: true,
    servicioActivoId: null,
  },
  // Supervisor (para probar login de lectura)
  {
    uid: 'sup-1',
    nombre: 'Roberto Supervisor',
    email: 'roberto@test.com',
    roles: ['SUPERVISOR'],
    legajo: '0050',
    activo: true,
    servicioActivoId: null,
  },
];

// ── Servicio activo de Pedro ────────────────────────────────────

const SERVICIO_ACTIVO = {
  id: 'srv-activo-1',
  estado: 'ENGANCHADO',
  patente: 'AA 123 BB',
  descripcionVehiculo: 'VW Gol Trend gris',
  grua: 'AB123CD',
  gruaDescripcion: 'Iveco Daily 70C',
  operadorUid: 'op-pedro',
  operadorNombre: 'Pedro Gómez M.',
  dupla: { chofer: 'Pedro Gómez M.', enganchador: 'Lautaro Martínez', duplaId: 'dupla-01', legajoChofer: '1001', legajoEnganchador: '1002' },
  tipoFlota: 'TRANSITO',
  creadoEn: AHORA,
  ubicacionEnganche: { lat: -34.6037, lng: -58.3816, direccion: 'Av. 9 de Julio 1200, CABA' },
};

// ── Corralones ──────────────────────────────────────────────────

const CORRALONES = [
  { id: 'corralon-1', nombre: 'Corralón Central', direccion: 'Av. Alcorta 3100', activo: true },
  { id: 'corralon-2', nombre: 'Corralón Norte', direccion: 'Av. Del Libertador 8200', activo: true },
];

// ── Escribir todo ───────────────────────────────────────────────

async function main() {
  const batch = db.batch();

  for (const g of GRUAS) {
    batch.set(db.collection('gruas').doc(g.id), g);
  }

  for (const d of DUPLAS) {
    batch.set(db.collection('duplas').doc(d.id), d);
  }

  for (const u of USUARIOS) {
    const { uid, ...data } = u;
    batch.set(db.collection('usuarios').doc(uid), { uid, ...data });
  }

  batch.set(db.collection('servicios').doc(SERVICIO_ACTIVO.id), SERVICIO_ACTIVO);

  for (const c of CORRALONES) {
    batch.set(db.collection('corralones').doc(c.id), c);
  }

  await batch.commit();

  // Crear usuarios en Auth
  let authCount = 0;
  for (const u of USUARIOS) {
    try {
      await auth.createUser({
        uid: u.uid,
        email: u.email,
        displayName: u.nombre,
        password: TEST_PASSWORD,
        emailVerified: true,
      });
      authCount++;
    } catch (err) {
      if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
        console.log(`  ${u.email}: ya existe, se omite.`);
      } else {
        console.error(`  ${u.email}: error — ${err.message}`);
      }
    }
  }

  console.log(`\nDatos de Control de Turno cargados:`);
  console.log(`  Grúas:      ${GRUAS.length} (${GRUAS.filter(g => g.activa).length} activas, ${GRUAS.filter(g => !g.activa).length} fuera de servicio)`);
  console.log(`  Duplas:     ${DUPLAS.length}`);
  console.log(`  Usuarios:   ${USUARIOS.length} (${authCount} creados en Auth)`);
  console.log(`  Servicios:  1 (activo, estado ENGANCHADO)`);
  console.log(`  Corralones: ${CORRALONES.length}`);
  console.log(`\nOperadores con turno hoy (${HOY}):`);
  console.log(`  Pedro Gómez M.      → T-16 (con servicio activo)`);
  console.log(`  Marcelo Gallardo S.  → T-18 (libre)`);
  console.log(`  Carlos Tévez P.     → G-01 (transporte)`);
  console.log(`\nOperador sin turno: Esteban Gomis`);
  console.log(`\nGrúas fuera de servicio: T-22 (taller), G-03 (rotura)`);
  console.log(`\nContraseña de todos: ${TEST_PASSWORD}`);
  console.log(`Admin: carolina@test.com`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
