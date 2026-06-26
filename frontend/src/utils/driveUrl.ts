import { Foto } from '@gruasbacar/shared';

export function extraerDriveFileId(url?: string): string | null {
  if (!url) return null;
  const match =
    url.match(/\/file\/d\/([^/?#]+)/) ??
    url.match(/[?&]id=([^&]+)/);
  return match?.[1] ?? null;
}

export function driveFileIdDeFoto(foto: Pick<Foto, 'url' | 'driveFileId'>): string | null {
  return foto.driveFileId ?? extraerDriveFileId(foto.url);
}

export function urlFotoPreview(foto: Pick<Foto, 'url' | 'driveFileId'>): string {
  const id = driveFileIdDeFoto(foto);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
  return foto.url ?? '';
}

export function urlFotoDrive(foto: Pick<Foto, 'url' | 'driveFileId'>): string {
  const id = driveFileIdDeFoto(foto);
  if (id) return `https://drive.google.com/file/d/${id}/view`;
  return foto.url ?? '#';
}

const ETIQUETAS: Record<string, string> = {
  DELANTERA: 'Foto delantera',
  LADO_DERECHO: 'Foto lado copiloto',
  LADO_IZQUIERDO: 'Foto lado piloto',
  TRASERA: 'Foto trasera',
  OBSERVACION: 'Foto adicional',
};

export function etiquetaFotoLegible(etiqueta: string): string {
  return ETIQUETAS[etiqueta] ?? etiqueta.replace(/_/g, ' ');
}
