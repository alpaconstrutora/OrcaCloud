import React from 'react';
import { AlertTriangle, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  DIMENSAO_POR_TIPO,
  camadas,
  codigoDeItemAvulso,
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

export interface CamposDoItem {
  itemCode?: string | null;
  itemNome?: string | null;
  itemPreco?: number | null;
  camada?: string;
}

/**
 * Painel das formas medidas.
 *
 * A separação entre MEDIDO e DERIVADO aparece já aqui, no cabeçalho — não só na
 * linha de orçamento. Quem traça precisa saber que está afirmando um número, não
 * calculando um; é a diferença entre este painel e o de Quantitativos.
 *
 * `formas` é o que está VISÍVEL (prancha ativa, camadas ligadas) e `todas` é o
 * levantamento inteiro do nível. As duas listas existem porque esconder não é
 * apagar: o total e o envio ao orçamento contam tudo, inclusive o que a tela
 * está ocultando neste momento.
 */
export default function PainelMedicoes({
  formas,
  todas,
  selecionada,
  temFundo,
  ocupado,
  camadasOcultas,
  camadaAtiva,
  onAlternarCamada,
  onCamadaAtiva,
  onSelecionar,
  onRenomear,
  onEditarItem,
  onRemover,
  onEnviarOrcamento,
  aviso,
  erro,
}: {
  formas: FormaMedida[];
  todas: FormaMedida[];
  selecionada: string | null;
  temFundo: boolean;
  ocupado: boolean;
  camadasOcultas: Set<string>;
  camadaAtiva: string;
  onAlternarCamada: (camada: string) => void;
  onCamadaAtiva: (camada: string) => void;
  onSelecionar: (id: string | null) => void;
  onRenomear: (id: string, nome: string) => void;
  onEditarItem: (id: string, campos: CamposDoItem) => void;
  onRemover: (id: string) => void;
  onEnviarOrcamento: () => void;
  aviso: string | null;
  erro: string | null;
}) {
  const totais = totaisPorItem(todas);
  const pendentes = semItem(todas);
  const listaCamadas = camadas(todas);
  const ocultas = todas.length - formas.length;

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

      {/* Camadas. A visibilidade fica no estado da TELA, não no banco: é
          preferência de quem está olhando, não fato do levantamento. Uma tabela
          de camadas traria três colunas de estado por estudo para resolver o que
          um `Set` em memória resolve. */}
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Camadas
        </h3>

        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
          Novas medições em
          <input
            list="camadas-existentes"
            value={camadaAtiva}
            onChange={(e) => onCamadaAtiva(e.target.value || 'Geral')}
            aria-label="Camada em que as novas medições nascem"
            className="w-32 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
          />
          <datalist id="camadas-existentes">
            {listaCamadas.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        {listaCamadas.length > 0 && (
          <ul className="mt-2 space-y-1">
            {listaCamadas.map((c) => {
              const oculta = camadasOcultas.has(c);
              const quantas = todas.filter((f) => (f.camada || 'Geral') === c).length;
              return (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => onAlternarCamada(c)}
                    aria-pressed={!oculta}
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-slate-50 ${
                      oculta ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    {oculta ? (
                      <EyeOff className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-left">{c}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">{quantas}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {ocultas > 0 && (
        <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
          {/* Sumir sem explicação parece defeito. E o total abaixo continua
              contando estas — esconder não é apagar. */}
          {ocultas} medição(ões) fora da lista: de outra prancha ou de camada
          desligada. Elas continuam no total e no envio ao orçamento.
        </p>
      )}

      {formas.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-500">
          Nenhuma medição ainda. Use <strong>Área</strong>, <strong>Linha</strong> ou{' '}
          <strong>Contar</strong> na barra: clique os vértices e feche no primeiro
          ponto, ou dê duplo clique para encerrar.
        </p>
      ) : (
        <ul
          aria-label="Medições traçadas"
          className="divide-y divide-slate-100 border-b border-slate-200"
        >
          {formas.map((f) => {
            const m = medir(f);
            const sel = f.id === selecionada;
            const rotulo = f.nome || ROTULO_TIPO[f.tipo];
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
                      aria-label={`Nome da medição ${rotulo}`}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-blue-400"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-slate-700">
                      {formatar(m.valor, m.unidade)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemover(f.id)}
                      disabled={ocupado}
                      aria-label={`Remover medição ${rotulo}`}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 pl-4">
                    <input
                      value={f.itemCode ?? ''}
                      onChange={(e) => onEditarItem(f.id, { itemCode: e.target.value })}
                      placeholder="Código do item"
                      aria-label={`Item de orçamento da medição ${rotulo}`}
                      className="w-32 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
                    />
                    <input
                      list="camadas-existentes"
                      value={f.camada || 'Geral'}
                      onChange={(e) =>
                        onEditarItem(f.id, { camada: e.target.value || 'Geral' })
                      }
                      aria-label={`Camada da medição ${rotulo}`}
                      className="w-24 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
                    />
                    <span className="text-[11px] text-slate-400">
                      {DIMENSAO_POR_TIPO[f.tipo] === 'M2'
                        ? 'm²'
                        : DIMENSAO_POR_TIPO[f.tipo] === 'M'
                          ? 'm'
                          : 'un'}
                    </span>
                    {/* Sem prancha, ela aparece em TODAS — e sem dizer isso, o
                        usuário concluiria que a mesma medição foi traçada
                        quatro vezes, uma por prancha. */}
                    {temFundo && !f.underlayId && (
                      <span
                        title="Traçada sem planta de fundo, por isso aparece em qualquer prancha"
                        className="shrink-0 text-[11px] text-amber-600"
                      >
                        sem prancha
                      </span>
                    )}
                  </div>

                  {/* ITEM AVULSO — só sem código de catálogo.
                      "Demolição de alvenaria, R$ 45/m²" não existe no SINAPI, e
                      era a lacuna que segurava a aposentadoria do Medição.
                      Mostrar os dois caminhos ao mesmo tempo convidaria a
                      preencher os dois e deixaria ambíguo qual vale. */}
                  {!f.itemCode && (
                    <div className="mt-1 flex items-center gap-1.5 pl-4">
                      <input
                        value={f.itemNome ?? ''}
                        onChange={(e) => onEditarItem(f.id, { itemNome: e.target.value })}
                        placeholder="…ou item avulso"
                        aria-label={`Nome do item avulso da medição ${rotulo}`}
                        className="min-w-0 flex-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={f.itemPreco ?? ''}
                        onChange={(e) =>
                          onEditarItem(f.id, {
                            itemPreco: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        placeholder="R$/un"
                        aria-label={`Preço unitário do item avulso da medição ${rotulo}`}
                        className="w-20 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] tabular-nums"
                      />
                    </div>
                  )}

                  {!f.itemCode && f.itemNome?.trim() && (
                    <p className="mt-1 pl-4 text-[11px] text-slate-400">
                      {/* O código sai do NOME, e mostrá-lo é o que explica por que
                          reexportar não duplica a linha. */}
                      Irá ao orçamento como{' '}
                      <span className="tabular-nums">{codigoDeItemAvulso(f.itemNome)}</span>
                    </p>
                  )}
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
            {pendentes.length} medição(ões) sem item — elas medem, mas não chegam ao
            orçamento. Informe um código de catálogo ou um nome de item avulso.
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
