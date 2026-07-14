import { DatosFormFields } from "../components/enganche/DatosForm";

export type PasoEngancheDraft = "DATOS" | "CONFIRMACION" | "FOTOS";

export interface EngancheDraft {
  formValues: DatosFormFields;
  paso: PasoEngancheDraft;
  pasosVisitados: PasoEngancheDraft[];
}

const STORAGE_KEY = "gruasbacar_enganche_draft";

let draft: EngancheDraft | null = null;
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) draft = JSON.parse(raw);
  } catch {
    // corrupted or unavailable
  }
}

function persist(): void {
  try {
    if (draft) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // quota or unavailable
  }
}

export function getEngancheDraft(): EngancheDraft | null {
  hydrate();
  return draft;
}

export function setEngancheDraft(next: EngancheDraft): void {
  draft = next;
  persist();
}

export function patchEngancheDraft(patch: Partial<EngancheDraft>): void {
  hydrate();
  if (!draft) {
    draft = {
      formValues: patch.formValues ?? {
        numeroInfraccion: "",
        patente: "",
        grua: "",
        gruaPatente: "",
        gruaDescripcion: "",
        dupla: "",
        duplaChofer: "",
        duplaEnganchador: "",
      },
      paso: patch.paso ?? "DATOS",
      pasosVisitados: patch.pasosVisitados ?? ["DATOS"],
    };
    persist();
    return;
  }
  draft = { ...draft, ...patch };
  persist();
}

export function clearEngancheDraft(): void {
  draft = null;
  persist();
}
