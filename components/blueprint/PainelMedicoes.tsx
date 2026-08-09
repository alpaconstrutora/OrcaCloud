import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  DIMENSAO_POR_TIPO,
  medir,
  semItem,
  totaisPorItem,
  type FormaMedida,
} from '../../utils/blueprintMedicoes';

const ROTULO_TIPO = {
  POLIGONO: 'Área',
  LINHA: 'Linha',
  PONTO: 'Contagem',
} as const;

function formatar(valor: number, unidade: 'M2' | 'M' | 'UN'): string {
  if (unidade === 'UN') return `${valor} un`;
  return `${valor.toFixed(2).replace('.', ',')} ${unidade === 'M2' ? 'm²' : 'm'}`;
}

/**
 * Painel das formas medidas.
 *
 * A separação entre MEDIDO e DERIVADO aparece já aqui, no cabeçalho — não só na
 * linha de orçamento. Quem traça precisa saber que está afirmando um número, não
 * calculando um; é a diferença entre este painel e o de Quantitativos.
 */
export default function PainelMedicoes({
  formas,
  selecionada,
  temFundo,
  ocupado,
  onSelecionar,
  onRenomear,
  onLigarItem,
  onRemover,
  onEnviarOrcamento,
  aviso,
  erro,
}: {
  formas: FormaMedida[];
  selecionada: string | null;
  temFundo: boolean;
  ocupado: boolean;
  onSelecionar: (id: string | null) => void;
  onRenomear: (id: string, nome: string) => void;
  onLigarItem: (id: string, itemCode: string) => void;
  onRemover: (id: string) => void;
  onEnviarOrcamento: () => void;
  aviso: string | null;
  erro: string | null;
}) {
  const totais = totaisPorItem(formas);
  const pendentes = semItem(formas);

  return (
    <div className="overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Medições</h2>
        <p className="text-xs text-slate-500">
          Traçadas à mão sobre a planta de fundo. O número é <strong>afirmado</strong>,
          não derivado da geometria — e a linha de orçamento diz isso.
        </p>
      </div>

      {!temFundo && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Sem planta de fundo, medir é traçar no vazio. Importe uma planta e afira a
          escala antes.
        </p>
      )}

      {formas.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-500">
          Nenhuma medição ainda. Use <strong>Área</strong>, <strong>Linha</strong> ou{' '}
          <strong>Contar</strong> na barra: clique os vértices e feche no primeiro
          ponto, ou dê duplo clique para encerrar.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 border-b border-slate-200">
          {formas.map((f) => {
            const m = medir(f);
            const sel = f.id === selecionada;
            return (
              <li key={f.id} className={sel ? 'bg-blue-50' : ''}>
                <div className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: f.cor }}
                      aria-hidden
                    />
                    <input
                      value={f.nome}
                      onChange={(e) => onRenomear(f.id, e.target.value)}
                      onFocus={() => onSelecionar(f.id)}
                      placeholder={ROTULO_TIPO[f.tipo]}
                      aria-label={`Nome da medição ${f.nome || ROTULO_TIPO[f.tipo]}`}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-blue-400"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-slate-700">
                      {formatar(m.valor, m.unidade)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemover(f.id)}
                      disabled={ocupado}
                      aria-label={`Remover medição ${f.nome || ROTULO_TIPO[f.tipo]}`}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 pl-4">
                    <input
                      value={f.itemCode ?? ''}
                      onChange={(e) => onLigarItem(f.id, e.target.value)}
                      placeholder="Código do item"
                      aria-label={`Item de orçamento da medição ${f.nome || ROTULO_TIPO[f.tipo]}`}
                      className="w-40 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
                    />
                    <span className="text-[11px] text-slate-400">
                      {ROTULO_TIPO[f.tipo]} · {DIMENSAO_POR_TIPO[f.tipo]}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendentes.length > 0 && (
        <p className="flex items-start gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {/* Sumir do total em silêncio seria pior que aparecer como pendência. */}
          <span>
            {pendentes.length} medição(ões) sem item ligado — elas medem, mas não chegam
            ao orçamento.
          </span>
        </p>
      )}

      {totais.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total por item
          </h3>
          <table className="mt-1.5 w-full text-[11px]">
            <caption className="sr-only">Soma das medições por item de orçamento</caption>
            <thead>
              <tr className="text-left text-slate-500">
                <th scope="col" className="pb-1 font-medium">Item</th>
                <th scope="col" className="pb-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {totais.map((t) => (
                <tr key={`${t.itemCode}-${t.unidade}`}>
                  <td className="py-1 pr-2 text-slate-700">
                    {t.itemCode}
                    <span className="text-slate-400"> · {t.formas} forma(s)</span>
                  </td>
                  <td className="py-1 text-right tabular-nums text-slate-700">
                    {formatar(t.total, t.unidade)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={onEnviarOrcamento}
            disabled={ocupado}
            className="mt-3 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Enviar medições ao orçamento
          </button>
          <p className="mt-1 text-[11px] text-slate-500">
            As linhas vão marcadas como <strong>MEDIDO</strong> — quem revisa o
            orçamento vê que dependem do traçado, não da geometria.
          </p>
        </div>
      )}

      {aviso && <p className="px-4 pb-3 text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="px-4 pb-3 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
