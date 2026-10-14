import React from 'react';
import { ChevronRight } from 'lucide-react';
import { usePersistedState } from '../ui/TableUtils';

/**
 * As hipóteses de uma gaveta de lançamento automático (14/10/2026), recolhidas
 * por padrão: a gaveta abre no RESULTADO (o que vai ser lançado), e a linha do
 * título mostra os valores em vigor — dá para conferir sem abrir. Abrir mostra
 * as regras e os campos. Mesmo desenho das "Hipóteses do pré-dimensionamento".
 *
 * Aberto/fechado é conveniência de quem está vendo → navegador, por gaveta.
 */
interface Props {
  /** Chave da gaveta (ex.: 'esgoto') — cada uma lembra se ficou aberta. */
  id: string;
  titulo?: string;
  /** Os valores em vigor, numa linha. */
  resumo: string;
  /** As regras de cálculo, em itens. */
  regras: React.ReactNode;
  /** Os campos editáveis. */
  children: React.ReactNode;
}

export default function BlocoDeHipoteses({ id, titulo = 'Hipóteses do lançamento', resumo, regras, children }: Props) {
  const [aberto, setAberto] = usePersistedState<boolean>(`blueprint:hipotesesAbertas:${id}`, false);
  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 text-xs text-slate-600" data-testid={`hipoteses-${id}`}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-1.5 rounded-[10px] px-3 py-2 text-left hover:bg-slate-100"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-90' : ''}`} />
        <span className="shrink-0 font-semibold text-slate-700">{titulo}</span>
        <span className="ml-auto min-w-0 truncate pl-2 text-slate-500" title={resumo}>
          {resumo}
        </span>
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-slate-200 px-3 pb-3 pt-2">
          <ul className="list-disc space-y-0.5 pl-4">{regras}</ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>
        </div>
      )}
    </div>
  );
}
