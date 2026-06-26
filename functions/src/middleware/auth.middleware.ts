import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { RolUsuario, esOperador, esSupervisor } from '@gruasbacar/shared';

export interface AuthContext {
  uid: string;
  roles: RolUsuario[];
  nombre: string;
}

export async function verificarAuth(authData: { uid: string } | undefined): Promise<AuthContext> {
  if (!authData?.uid) {
    throw new HttpsError('unauthenticated', 'Se requiere autenticación.');
  }

  const userDoc = await admin.firestore().collection('usuarios').doc(authData.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'Usuario no registrado en el sistema.');
  }

  const data = userDoc.data()!;
  const rolFromData = data.rol as string | undefined;
  const rolesFromData = data.roles as any[] | undefined;
  
  let userRoles: RolUsuario[] = [];
  if (rolesFromData && Array.isArray(rolesFromData) && rolesFromData.length > 0) {
    userRoles = rolesFromData as RolUsuario[];
  } else if (rolFromData) {
    userRoles = [rolFromData as RolUsuario];
  } else {
    userRoles = ['ENGANCHADOR'];
  }

  return {
    uid: authData.uid,
    roles: userRoles,
    nombre: data.nombre as string,
  };
}

export async function verificarAdmin(authData: { uid: string } | undefined): Promise<AuthContext> {
  const ctx = await verificarAuth(authData);
  if (!ctx.roles.includes('ADMIN')) {
    throw new HttpsError('permission-denied', 'Se requiere rol de administrador.');
  }
  return ctx;
}

/** Editar o anular actas: administrador o supervisor. */
export async function verificarGestionActas(authData: { uid: string } | undefined): Promise<AuthContext> {
  const ctx = await verificarAuth(authData);
  if (!ctx.roles.includes('ADMIN') && !esSupervisor(ctx.roles)) {
    throw new HttpsError('permission-denied', 'Se requiere rol de administrador o supervisor.');
  }
  return ctx;
}

export async function verificarEnganchador(authData: { uid: string } | undefined): Promise<AuthContext> {
  const ctx = await verificarAuth(authData);
  if (!esOperador(ctx.roles)) {
    throw new HttpsError('permission-denied', 'Se requiere rol de operador (enganchador o chofer).');
  }
  return ctx;
}

/** Enganche / traslado / desenganche: operadores de campo y admins (demo o supervisión). */
export async function verificarOperador(authData: { uid: string } | undefined): Promise<AuthContext> {
  const ctx = await verificarAuth(authData);
  if (!ctx.roles.includes('ADMIN') && !esOperador(ctx.roles)) {
    throw new HttpsError(
      'permission-denied',
      'Se requiere rol ENGANCHADOR o CHOFER en tu cuenta de login (Admin → Usuarios del Sistema). Las duplas operativas no son cuentas de usuario.'
    );
  }
  return ctx;
}
