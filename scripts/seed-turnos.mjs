/**
 * Carga datos de prueba en la colección turnos/ para verificar el historial.
 * Uso: node scripts/seed-turnos.mjs
 * Solo emulador local.
 */
import { initEmulatorAdmin } from './lib/initFirebaseAdmin.mjs';

const { db } = initEmulatorAdmin(process.argv);

const TURNOS_SEED = [
  {
    operadorUid: 'seed-op1', operadorNombre: 'Pedro Gómez M.', operadorLegajo: '1234',
    fecha: '2026-07-14', gruaPatente: 'AB123CD', gruaDescripcion: 'Grúa 01',
    duplaId: 'D001-GRBU', duplaChofer: 'Pedro Gómez M.', duplaEnganchador: 'Lautaro Martínez',
    legajoChofer: '1234', legajoEnganchador: '5678',
    tipoFlota: 'TRANSITO', origenAsignacion: 'operador',
    creadoEn: '2026-07-14T08:15:00.000Z',
  },
  {
    operadorUid: 'seed-op2', operadorNombre: 'Marcelo Gallardo S.', operadorLegajo: '2345',
    fecha: '2026-07-14', gruaPatente: 'EF456GH', gruaDescripcion: 'Grúa 02',
    duplaId: 'D002-GRBU', duplaChofer: 'Marcelo Gallardo S.', duplaEnganchador: 'Enzo Pérez',
    legajoChofer: '2345', legajoEnganchador: '6789',
    tipoFlota: 'TRANSITO', origenAsignacion: 'admin',
    asignadoPorUid: 'admin-uid-1', asignadoPorNombre: 'Carolina Admin',
    creadoEn: '2026-07-14T07:45:00.000Z',
  },
  {
    operadorUid: 'seed-op3', operadorNombre: 'Carlos Tévez P.', operadorLegajo: '3456',
    fecha: '2026-07-13', gruaPatente: 'IJ789KL', gruaDescripcion: 'Grúa 03',
    duplaId: '', duplaChofer: 'Carlos Tévez P.', duplaEnganchador: 'Mateo Díaz',
    legajoChofer: '3456', legajoEnganchador: '7890',
    tipoFlota: 'TRANSPORTE', origenAsignacion: 'operador',
    creadoEn: '2026-07-13T08:30:00.000Z',
  },
  {
    operadorUid: 'seed-op1', operadorNombre: 'Pedro Gómez M.', operadorLegajo: '1234',
    fecha: '2026-07-12', gruaPatente: 'AB123CD', gruaDescripcion: 'Grúa 01',
    duplaId: 'D001-GRBU', duplaChofer: 'Pedro Gómez M.', duplaEnganchador: 'Julián Álvarez',
    legajoChofer: '1234', legajoEnganchador: '4567',
    tipoFlota: 'TRANSITO', origenAsignacion: 'operador',
    creadoEn: '2026-07-12T08:00:00.000Z',
  },
  {
    operadorUid: 'seed-op2', operadorNombre: 'Marcelo Gallardo S.', operadorLegajo: '2345',
    fecha: '2026-07-11', gruaPatente: 'AB123CD', gruaDescripcion: 'Grúa 01',
    duplaId: '', duplaChofer: 'Marcelo Gallardo S.', duplaEnganchador: 'Lautaro Martínez',
    legajoChofer: '2345', legajoEnganchador: '5678',
    tipoFlota: 'TRANSITO', origenAsignacion: 'operador',
    creadoEn: '2026-07-11T09:10:00.000Z',
  },
  {
    operadorUid: 'seed-op3', operadorNombre: 'Carlos Tévez P.', operadorLegajo: '3456',
    fecha: '2026-07-10', gruaPatente: 'IJ789KL', gruaDescripcion: 'Grúa 03',
    duplaId: 'D003-GRBU', duplaChofer: 'Carlos Tévez P.', duplaEnganchador: 'Enzo Pérez',
    legajoChofer: '3456', legajoEnganchador: '6789',
    tipoFlota: 'TRANSPORTE', origenAsignacion: 'admin',
    asignadoPorUid: 'admin-uid-1', asignadoPorNombre: 'Carolina Admin',
    creadoEn: '2026-07-10T07:30:00.000Z',
  },
  {
    operadorUid: 'seed-op4', operadorNombre: 'Esteban Gomis', operadorLegajo: '4567',
    fecha: '2026-07-09', gruaPatente: 'MN012OP', gruaDescripcion: 'Grúa 04',
    duplaId: 'D004-GRBU', duplaChofer: 'Esteban Gomis', duplaEnganchador: 'Mateo Díaz',
    legajoChofer: '4567', legajoEnganchador: '7890',
    tipoFlota: 'TRANSITO', origenAsignacion: 'operador',
    creadoEn: '2026-07-09T08:20:00.000Z',
  },
  {
    operadorUid: 'seed-op1', operadorNombre: 'Pedro Gómez M.', operadorLegajo: '1234',
    fecha: '2026-07-08', gruaPatente: 'EF456GH', gruaDescripcion: 'Grúa 02',
    duplaId: '', duplaChofer: 'Pedro Gómez M.', duplaEnganchador: 'Enzo Pérez',
    legajoChofer: '1234', legajoEnganchador: '6789',
    tipoFlota: 'TRANSITO', origenAsignacion: 'operador',
    creadoEn: '2026-07-08T08:45:00.000Z',
  },
];

async function main() {
  const batch = db.batch();
  for (const turno of TURNOS_SEED) {
    const ref = db.collection('turnos').doc();
    batch.set(ref, turno);
  }
  await batch.commit();
  console.log(`Creados ${TURNOS_SEED.length} registros de turno en turnos/ (emulador).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
