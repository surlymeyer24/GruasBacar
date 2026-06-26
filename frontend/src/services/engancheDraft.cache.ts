import { DatosFormFields } from "../components/enganche/DatosForm";

export type PasoEngancheDraft = "DATOS" | "CONFIRMACION" | "FOTOS";

export interface EngancheDraft {
  formValues: DatosFormFields;
  paso: PasoEngancheDraft;
  pasosVisitados: PasoEngancheDraft[];
}

let draft: EngancheDraft | null = null;

export function getEngancheDraft(): EngancheDraft | null {
  return draft;
}

export function setEngancheDraft(next: EngancheDraft): void {
  draft = next;
}

export function patchEngancheDraft(patch: Partial<EngancheDraft>): void {
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
        inspector: "",
      },
      paso: patch.paso ?? "DATOS",
      pasosVisitados: patch.pasosVisitados ?? ["DATOS"],
    };
    return;
  }
  draft = { ...draft, ...patch };
}

export function clearEngancheDraft(): void {
  draft = null;
}
