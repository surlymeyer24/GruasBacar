import { Usuario, enganchadorDeDuplaServicio, Servicio } from "@gruasbacar/shared";

type UsuarioLegajo = Pick<Usuario, "nombre" | "legajo">;

export function legajoPorNombre(
  nombre: string | undefined,
  usuarios: UsuarioLegajo[]
): string | undefined {
  const buscado = nombre?.trim().toLowerCase();
  if (!buscado) return undefined;
  const found = usuarios.find((u) => u.nombre?.trim().toLowerCase() === buscado);
  return found?.legajo?.trim() || undefined;
}

export function legajosDuplaServicio(
  servicio: Pick<Servicio, "dupla" | "legajoChofer">,
  usuarios: UsuarioLegajo[] = []
): { chofer: string; enganchador: string } {
  const legajoEnganche = servicio.legajoChofer?.trim();
  const enganchadorNombre = enganchadorDeDuplaServicio(servicio.dupla);
  const enganchador =
    legajoPorNombre(enganchadorNombre, usuarios) ||
    legajoEnganche ||
    "—";
  const chofer = legajoPorNombre(servicio.dupla?.chofer, usuarios) || "—";

  return { chofer, enganchador };
}
