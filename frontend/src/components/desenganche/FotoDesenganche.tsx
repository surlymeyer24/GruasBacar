import React, { useMemo } from "react";
import { FotoLoteUpload, FotosLoteResult } from "../shared/FotoLoteUpload";
import { claveBorradorDraft } from "../../services/fotoCache.service";

interface FotoDesengancheProps {
  servicioId: string;
  onCompleted: (result: FotosLoteResult) => void;
  onBack?: () => void;
  backLabel?: string;
}

export const FotoDesenganche: React.FC<FotoDesengancheProps> = ({
  servicioId,
  onCompleted,
  onBack,
  backLabel = "Cambiar llegada",
}) => {
  const prefetchUpload = useMemo(
    () => ({ servicioId, carpeta: "desenganche" as const }),
    [servicioId]
  );

  return (
    <FotoLoteUpload
      titulo="Fotos del desenganche"
      descripcion="Tocá el botón principal: te guiamos paso a paso (delantera, copiloto, trasera, piloto)."
      comentarioId="comentario-desenganche"
      comentarioPlaceholder="Ej: entrega con llaves, daño preexistente..."
      prefetchUpload={prefetchUpload}
      draftCacheKey={claveBorradorDraft(servicioId, "desenganche")}
      limpiarCacheAlConfirmar={false}
      permitirGaleria
      maxExtras={5}
      onBack={onBack}
      backLabel={backLabel}
      onConfirm={async (result) => {
        onCompleted(result);
      }}
    />
  );
};

export default FotoDesenganche;
