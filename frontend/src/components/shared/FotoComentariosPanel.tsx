import React, { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { ComentarioFoto, Foto } from "@gruasbacar/shared";
import { formatFechaHora } from "../../utils/formatters";

interface FotoComentariosPanelProps {
  foto: Foto;
  puedeComentar: boolean;
  onAgregarComentario?: (texto: string) => Promise<void>;
}

export const FotoComentariosPanel: React.FC<FotoComentariosPanelProps> = ({
  foto,
  puedeComentar,
  onAgregarComentario,
}) => {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comentarios = foto.comentarios ?? [];
  const tieneContenido = Boolean(foto.observacion?.trim()) || comentarios.length > 0 || puedeComentar;

  if (!tieneContenido) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAgregarComentario || !texto.trim() || enviando) return;

    setEnviando(true);
    setError(null);
    try {
      await onAgregarComentario(texto.trim());
      setTexto("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el comentario.");
    } finally {
      setEnviando(false);
    }
  };

  const mostrarEncabezado = Boolean(foto.observacion?.trim()) || comentarios.length > 0;

  return (
    <div className="mt-1.5 rounded-md border border-brand-seashell bg-white/70 p-1.5 text-left space-y-1.5">
      {mostrarEncabezado && (
        <p className="text-[8px] font-bold uppercase tracking-wide text-brand-purply/75 flex items-center gap-1 border-b border-brand-seashell/60 pb-1">
          <MessageSquare className="w-2.5 h-2.5 shrink-0" />
          Comentarios
        </p>
      )}

      {foto.observacion?.trim() && (
        <p className="text-[9px] text-gray-500 italic leading-tight px-0.5">
          <span className="font-bold not-italic text-gray-600">Operador:</span> "{foto.observacion.trim()}"
        </p>
      )}

      {comentarios.length > 0 && (
        <ul className="space-y-1">
          {comentarios.map((c: ComentarioFoto) => (
            <li
              key={c.id}
              className="text-[9px] text-gray-650 leading-tight rounded px-1.5 py-1 bg-brand-bg/80 border border-brand-seashell/50"
            >
              <p className="font-bold text-brand-purply truncate">{c.autorNombre}</p>
              <p className="italic">"{c.texto}"</p>
              <p className="text-[8px] text-gray-400 mt-0.5">{formatFechaHora(c.creadoEn)}</p>
            </li>
          ))}
        </ul>
      )}

      {puedeComentar && comentarios.length === 0 && !foto.observacion?.trim() && (
        <p className="text-[8px] text-gray-400 flex items-center gap-1 px-0.5">
          <MessageSquare className="w-2.5 h-2.5 shrink-0" />
          Sin comentarios
        </p>
      )}

      {puedeComentar && onAgregarComentario && (
        <form
          onSubmit={handleSubmit}
          className={`space-y-1 ${mostrarEncabezado ? "pt-1 border-t border-brand-seashell/60" : ""}`}
        >
          <label className="sr-only" htmlFor={`comentario-foto-${foto.etiqueta}`}>
            Agregar comentario
          </label>
          <div className="flex gap-1">
            <input
              id={`comentario-foto-${foto.etiqueta}`}
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Agregar comentario..."
              maxLength={500}
              disabled={enviando}
              className="flex-1 min-w-0 text-[9px] px-1.5 py-1 border border-brand-seashell rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-brand-orange/50"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="shrink-0 p-1 rounded-md bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20 disabled:opacity-40 cursor-pointer"
              title="Enviar comentario"
            >
              {enviando ? (
                <span className="text-[8px] font-bold px-0.5">...</span>
              ) : (
                <Send className="w-3 h-3" />
              )}
            </button>
          </div>
          {error && <p className="text-[8px] text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
};

export default FotoComentariosPanel;
