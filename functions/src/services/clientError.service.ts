import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as functionsLogger from 'firebase-functions/logger';
import { HttpsError } from 'firebase-functions/v2/https';
import { AuthContext } from '../middleware/auth.middleware';
import { validarString, validarStringOpcional } from '../utils/validators';

type ClientEnvironment = 'emulator' | 'test' | 'production';

interface ClientErrorInput {
  tag?: unknown;
  message?: unknown;
  stack?: unknown;
  route?: unknown;
  environment?: unknown;
  createdAt?: unknown;
  context?: {
    online?: unknown;
    userAgent?: unknown;
  };
}

const INCIDENTS_COLLECTION = 'erroresCliente';
const RATE_LIMIT_COLLECTION = 'erroresClienteRateLimit';
const RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REPORTS_PER_WINDOW = 10;

function redact(value: string): string {
  return value
    .replace(/(api[_-]?key|token|authorization|password|secret)=([^&\s]+)/gi, '$1=[REDACTADO]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTADO]');
}

function normalizeForFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<uuid>')
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/[A-Za-z0-9_-]{20,}/g, '<id>')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstStackFrame(stack?: string): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ') || line.includes('http')) ?? '';
}

function validateEnvironment(value: unknown): ClientEnvironment {
  if (value === 'emulator' || value === 'test' || value === 'production') return value;
  throw new HttpsError('invalid-argument', 'Entorno de reporte inválido.');
}

function validateInput(input: ClientErrorInput) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Reporte de error inválido.');
  }
  const allowedKeys = new Set(['tag', 'message', 'stack', 'route', 'environment', 'createdAt', 'context']);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new HttpsError('invalid-argument', 'El reporte contiene campos no permitidos.');
  }
  if (input.context !== undefined) {
    if (!input.context || typeof input.context !== 'object' || Array.isArray(input.context)) {
      throw new HttpsError('invalid-argument', 'Contexto de reporte inválido.');
    }
    const allowedContextKeys = new Set(['online', 'userAgent']);
    if (Object.keys(input.context).some((key) => !allowedContextKeys.has(key))) {
      throw new HttpsError('invalid-argument', 'El contexto contiene campos no permitidos.');
    }
  }
  const tag = redact(validarString(input.tag, 'tag', 40)).toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(tag)) {
    throw new HttpsError('invalid-argument', 'Tag de reporte inválido.');
  }
  const message = redact(validarString(input.message, 'message', 500));
  const stackRaw = validarStringOpcional(input.stack, 'stack', 2_000);
  const routeRaw = validarStringOpcional(input.route, 'route', 200);
  const userAgentRaw = validarStringOpcional(input.context?.userAgent, 'context.userAgent', 300);
  const environment = validateEnvironment(input.environment);
  const createdAt =
    typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
      ? Math.min(input.createdAt, Date.now())
      : Date.now();

  return {
    tag,
    message,
    stack: stackRaw ? redact(stackRaw) : undefined,
    route: routeRaw ? redact(routeRaw) : '/',
    environment,
    clientCreatedAt: Timestamp.fromMillis(Math.max(0, createdAt)),
    context: {
      online: input.context?.online === true,
      userAgent: userAgentRaw ? redact(userAgentRaw) : '',
    },
  };
}

function buildFingerprint(input: ReturnType<typeof validateInput>): string {
  const source = [
    input.environment,
    input.tag,
    normalizeForFingerprint(input.message),
    normalizeForFingerprint(firstStackFrame(input.stack)),
  ].join('|');
  return createHash('sha256').update(source).digest('hex').slice(0, 32);
}

export async function reportClientError(rawInput: unknown, ctx: AuthContext): Promise<{ ok: true; fingerprint: string }> {
  const input = validateInput((rawInput ?? {}) as ClientErrorInput);
  const fingerprint = buildFingerprint(input);
  const now = Date.now();
  const windowId = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const db = admin.firestore();
  const rateRef = db.collection(RATE_LIMIT_COLLECTION).doc(`${ctx.uid}_${windowId}`);
  const incidentRef = db.collection(INCIDENTS_COLLECTION).doc(fingerprint);

  await db.runTransaction(async (transaction) => {
    const [rateSnapshot, incidentSnapshot] = await Promise.all([
      transaction.get(rateRef),
      transaction.get(incidentRef),
    ]);
    const currentRate = rateSnapshot.exists ? Number(rateSnapshot.data()?.count ?? 0) : 0;
    if (currentRate >= MAX_REPORTS_PER_WINDOW) {
      throw new HttpsError('resource-exhausted', 'Demasiados reportes de error. Se reintentará luego.');
    }

    transaction.set(rateRef, {
      count: currentRate + 1,
      uid: ctx.uid,
      expiresAt: Timestamp.fromMillis(now + 2 * RATE_LIMIT_WINDOW_MS),
    });

    const incidentData = {
      fingerprint,
      level: 'error',
      tag: input.tag,
      message: input.message,
      environment: input.environment,
      lastStack: input.stack ?? '',
      lastRoute: input.route,
      lastContext: input.context,
      lastClientCreatedAt: input.clientCreatedAt,
      lastUid: ctx.uid,
      lastUserName: ctx.nombre.slice(0, 100),
      lastSeen: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + RETENTION_MS),
    };

    if (incidentSnapshot.exists) {
      transaction.update(incidentRef, {
        ...incidentData,
        count: FieldValue.increment(1),
      });
    } else {
      transaction.create(incidentRef, {
        ...incidentData,
        count: 1,
        firstSeen: FieldValue.serverTimestamp(),
      });
    }
  });

  functionsLogger.error('Error de cliente reportado', {
    fingerprint,
    tag: input.tag,
    environment: input.environment,
    uid: ctx.uid,
    route: input.route,
    message: input.message,
  });
  return { ok: true, fingerprint };
}

function timestampMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

export async function listClientErrors(limit = 200): Promise<Array<Record<string, unknown>>> {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 200;
  const snapshot = await admin.firestore()
    .collection(INCIDENTS_COLLECTION)
    .orderBy('lastSeen', 'desc')
    .limit(safeLimit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      fingerprint: data.fingerprint,
      tag: data.tag,
      level: data.level,
      message: data.message,
      environment: data.environment,
      count: data.count,
      firstSeen: timestampMillis(data.firstSeen),
      lastSeen: timestampMillis(data.lastSeen),
      lastClientCreatedAt: timestampMillis(data.lastClientCreatedAt),
      lastStack: data.lastStack,
      lastRoute: data.lastRoute,
      lastContext: data.lastContext,
      lastUid: data.lastUid,
      lastUserName: data.lastUserName,
    };
  });
}

async function deleteExpiredFromCollection(collectionName: string): Promise<number> {
  const db = admin.firestore();
  let deleted = 0;
  for (let page = 0; page < 10; page += 1) {
    const snapshot = await db.collection(collectionName)
      .where('expiresAt', '<=', Timestamp.now())
      .limit(400)
      .get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < 400) break;
  }
  return deleted;
}

export async function cleanupExpiredClientErrors(): Promise<void> {
  const [incidents, rateLimits] = await Promise.all([
    deleteExpiredFromCollection(INCIDENTS_COLLECTION),
    deleteExpiredFromCollection(RATE_LIMIT_COLLECTION),
  ]);
  functionsLogger.info('Limpieza de errores cliente completada', { incidents, rateLimits });
}
