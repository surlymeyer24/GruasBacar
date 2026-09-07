import * as admin from 'firebase-admin';
import { crearNotificacion } from './notification.service';
import { anularServicioAutomaticamente } from './servicio.service';

const db = () => admin.firestore();

const TIMEOUT_AVISO_MS = 7 * 60 * 1000;
const TIMEOUT_ANULACION_MS = 15 * 60 * 1000;

export async function verificarTimeoutEnganches(): Promise<void> {
  const ahora = Date.now();
  const umbralAviso = admin.firestore.Timestamp.fromDate(
    new Date(ahora - TIMEOUT_AVISO_MS)
  );

  const snap = await db()
    .collection('servicios')
    .where('estado', '==', 'ENGANCHADO')
    .where('creadoEn', '<=', umbralAviso)
    .get();

  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      if (data.esTest === true) continue;

      const operadorUid = data.creadoPor as string;
      const patente = (data.patente as string) || doc.id;
      const creadoEn = data.creadoEn?.toDate?.() as Date | undefined;
      const elapsed = creadoEn ? ahora - creadoEn.getTime() : TIMEOUT_AVISO_MS;

      if (elapsed >= TIMEOUT_ANULACION_MS) {
        const anulado = await anularServicioAutomaticamente(doc.id);
        if (anulado) {
          await crearNotificacion({
            destinatarioUid: operadorUid,
            tipo: 'ENGANCHE_TIMEOUT_ANULADO',
            titulo: `Enganche anulado — ${patente}`,
            cuerpo: `Tu enganche de ${patente} fue anulado automáticamente por inactividad (más de 15 minutos). Podés deshacerlo desde la app durante los próximos 10 minutos.`,
            claveDedup: `enganche_timeout_anulado:${doc.id}`,
            datos: { servicioId: doc.id, patente },
          });
        }
      } else {
        await crearNotificacion({
          destinatarioUid: operadorUid,
          tipo: 'ENGANCHE_TIMEOUT_AVISO',
          titulo: `Enganche abierto — ${patente}`,
          cuerpo: `Tu enganche de ${patente} lleva más de 7 minutos abierto. ¿Seguís con el servicio?`,
          claveDedup: `enganche_timeout:${doc.id}`,
          datos: { servicioId: doc.id, patente },
        });
      }
    } catch (err) {
      console.error(`[servicioTimeout] Error procesando ${doc.id}:`, err);
    }
  }
}
