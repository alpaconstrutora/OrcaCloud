import React from 'react';
import { X } from 'lucide-react';

/**
 * A metade de baixo do painel lateral do editor de Planta Inteligente: ou as
 * PROPRIEDADES da seleção, ou uma TAREFA aberta pelo ribbon (importar IFC,
 * gerar paredes do PDF, dados do lote…). Um slot só, porque as duas coisas
 * disputam a mesma atenção — e o Revit resolve igual: Properties de um lado,
 * diálogo de comando quando há um.
 *
 * Quando há tarefa aberta E uma peça selecionada, a linha `selecionado` mostra
 * o que está selecionado e oferece "Propriedades" (que fecha a tarefa). Sem
 * isso, clicar numa parede com uma tarefa aberta não teria resposta visível —
 * o defeito que o comentário antigo de `SECOES_ABERTAS_PADRAO` já temia.
 */
export default function PainelDeTarefa({
  titulo,
  subtitulo,
  onFechar,
  selecionado,
  onVerPropriedades,
  children,
}: {
  titulo: string;
  subtitulo?: string | null;
  /** Só a tarefa fecha; Propriedades não tem × — some quando se desseleciona. */
  onFechar?: () => void;
  /** Rótulo da peça selecionada enquanto uma tarefa está aberta. */
  selecionado?: string | null;
  onVerPropriedades?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section role="region" aria-label={titulo} className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5">
        <h2 className="truncate text-sm font-medium text-slate-700">{titulo}</h2>
        {subtitulo && <span className="truncate text-xs text-slate-500">{subtitulo}</span>}
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            aria-label={`Fechar ${titulo}`}
            className="ml-auto rounded-[6px] p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {selecionado && onVerPropriedades && (
        <div className="flex shrink-0 items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-1 text-xs text-blue-800">
          <span className="truncate">Selecionado: {selecionado}</span>
          <button
            type="button"
            onClick={onVerPropriedades}
            className="ml-auto shrink-0 rounded-[6px] border border-blue-300 bg-white px-1.5 py-0.5 font-medium hover:bg-blue-100"
          >
            Propriedades
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
