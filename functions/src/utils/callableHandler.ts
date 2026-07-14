import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

/**
 * Firebase sanea cualquier excepción que no sea HttpsError a un genérico
 * {code:'internal', message:'internal'} antes de mandarla al cliente, ocultando
 * la causa real. Este wrapper garantiza que siempre se relance como HttpsError
 * con un mensaje útil, para que el frontend pueda mostrarlo.
 */
export function withHttpsErrorHandling<T = any, R = any>(
  nombreOperacion: string,
  handler: (request: CallableRequest<T>) => Promise<R>
): (request: CallableRequest<T>) => Promise<R> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error(`[callable ${nombreOperacion}]`, err);
      const detalle = err instanceof Error ? err.message : String(err);
      throw new HttpsError('internal', `Error inesperado en ${nombreOperacion}: ${detalle}`);
    }
  };
}
