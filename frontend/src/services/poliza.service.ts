import { httpsCallable } from "firebase/functions";
import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import {
  AdjuntoPoliza,
  GruaPoliza,
  PolizaSeguro,
} from "@gruasbacar/shared";
import { auth, functions, isMock, storage } from "../firebase";
import { getFirebaseErrorMessage } from "../utils/firebaseError";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export interface CrearPolizaPayload {
  numeroPoliza?: string;
  aseguradora: string;
  titular?: string;
  cobertura?: string;
  vigenciaDesde: string;
  fechaVencimiento: string;
  gruas: GruaPoliza[];
  adjunto?: AdjuntoPoliza;
  polizaAnteriorId?: string;
}

function nombreSeguro(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-120);
}

export async function subirAdjuntoPoliza(file: File): Promise<AdjuntoPoliza> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Tenés que iniciar sesión para adjuntar la póliza.");
  if (!CONTENT_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new Error("El adjunto debe ser una imagen o PDF de hasta 10 MB.");
  }

  const uploadId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `polizas/${uid}/${uploadId}/${nombreSeguro(file.name) || "poliza"}`;

  if (!isMock) {
    await uploadBytes(ref(storage, storagePath), file, {
      contentType: file.type,
      customMetadata: { uid },
    });
  }

  return {
    storagePath,
    nombre: file.name,
    contentType: file.type,
    size: file.size,
  };
}

export async function eliminarAdjuntoPoliza(storagePath: string): Promise<void> {
  if (isMock) return;
  await deleteObject(ref(storage, storagePath));
}

export async function abrirAdjuntoPoliza(adjunto: AdjuntoPoliza): Promise<void> {
  if (isMock) return;
  const preview = window.open("about:blank", "_blank");
  if (!preview) {
    throw new Error("El navegador bloqueó la apertura del archivo.");
  }
  preview.opener = null;
  try {
    const blob = await getBlob(ref(storage, adjunto.storagePath), MAX_FILE_SIZE);
    const objectUrl = URL.createObjectURL(blob);
    preview.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    preview.close();
    throw err;
  }
}

export async function listarPolizas(): Promise<PolizaSeguro[]> {
  if (isMock) return [];
  try {
    const fn = httpsCallable<void, PolizaSeguro[]>(functions, "listarPolizas");
    const result = await fn();
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error al cargar las pólizas."));
  }
}

export async function crearPoliza(data: CrearPolizaPayload): Promise<{ id: string }> {
  if (isMock) return { id: "POLIZA-000001" };
  try {
    const fn = httpsCallable<CrearPolizaPayload, { id: string }>(functions, "crearPoliza");
    const result = await fn(data);
    return result.data;
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error al registrar la póliza."));
  }
}

export async function desactivarPoliza(polizaId: string): Promise<void> {
  if (isMock) return;
  try {
    const fn = httpsCallable<{ polizaId: string }, { ok: boolean }>(
      functions,
      "desactivarPoliza"
    );
    await fn({ polizaId });
  } catch (err) {
    throw new Error(getFirebaseErrorMessage(err, "Error al dar de baja la póliza."));
  }
}
