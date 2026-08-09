import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BlueprintStudy } from '../../types/blueprint';
import { MEDIDAS, MEDIDA_POR_ID, type MapeamentoOrcamento } from '../../utils/blueprintBudget';
import { listSnapshots } from '../../services/blueprintService';
import {
  aplicarNoProjeto,
  deleteMapping,
  listMappings,
  preverLancamentos,
  saveMapping,
  type PreviaOrcamento,
} from '../../services/blueprintBudgetService';

/**
 * RF-122 — de-para e envio para o orçamento da obra.
 *
 * Duas etapas separadas de propósito: PREVER e depois APLICAR. Mandar linha para
 * o orçamento de uma obra não se desfaz com um clique, e a divergência que mais
 * importa — unidade do item incompatível com a dimensão da medida — precisa
 * aparecer ANTES, não depois. Por isso a prévia dá às recusas o mesmo destaque
 * que dá às linhas geradas.
 */
export default function PainelOrcamento({
  study,
  revisao,
  dirty,
}: {
  study: BlueprintStudy;
  revisao: number;
  dirty: boolean;
}) {
  const [mapeamentos, setMapeamentos] = useState<MapeamentoOrcamento[]>([]);
  const [previa, setPrevia] = useState<PreviaOrcamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novaMedida, setNovaMedida] = useState(MEDIDAS[0].id);
  const [novoCodigo, setNovoCodigo] = useState('');

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setMapeamentos(await listMappings(study.organization_id));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao carregar o de-para');
    } finally {
      setCarregando(false);
    }
  }, [study.organization_id]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function adicionar() {
    if (!novoCodigo.trim()) return;
    setOcupado(true);
    try {
      await saveMapping({
        organization_id: study.organization_id,
        medida: novaMedida,
        item_code: novoCodigo,
        phase: '',
        budget_group: 'Planta Inteligente',
        agrupamento: 'TOTAL',
        filtro_ambiente: [],
        active: true,
      });
      setNovoCodigo('');
      // A prévia antiga passa a mentir assim que o de-para muda.
      setPrevia(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao salvar');
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    setOcupado(true);
    try {
      await deleteMapping(id);
      setPrevia(null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao excluir');
    } finally {
      setOcupado(false);
    }
  }

  async function prever() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const snaps = await listSnapshots(study.id);
      if (snaps.length === 0) {
        setErro('Publique uma versão antes — quantitativo não sai de rascunho.');
        return;
      }
      setPrevia(await preverLancamentos(snaps[0].id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao gerar a prévia');
    } finally {
      setOcupado(false);
    }
  }

  async function aplicar() {
    if (!previa || !study.project_id) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await aplicarNoProjeto(study.project_id, previa.entries, previa.contexto);
      setAviso(
        `${r.adicionadas} linha(s) no orçamento` +
          (r.removidas > 0
            ? `, substituindo ${r.removidas} que esta planta havia gerado antes.`
            : '.'),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao aplicar');
    } finally {
      setOcupado(false);
    }
  }

  const definicao = MEDIDA_POR_ID.get(novaMedida);

  return (
    <div className="overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Orçamento</h2>
        <p className="text-xs text-slate-500">
          De-para entre a medida geométrica e o item do catálogo. A unidade do item tem
          de bater com a dimensão da medida.
        </p>
      </div>

      {!study.project_id && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Este estudo não está vinculado a uma obra. Dá para montar o de-para e ver a
          prévia, mas não há orçamento onde aplicar.
        </p>
      )}

      {dirty && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Há alterações não publicadas. A prévia usa a versão {revisao} — não o que está
          na tela.
        </p>
      )}

      {/* ── De-para ────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Medidas mapeadas
        </h3>

        {carregando ? (
          <p className="mt-2 text-xs text-slate-500">Carregando…</p>
        ) : mapeamentos.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Nenhuma medida mapeada. Sem de-para, o quantitativo não vira linha de
            orçamento.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {mapeamentos.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-2 rounded border border-slate-200 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700">
                    {MEDIDA_POR_ID.get(m.medida)?.rotulo ?? m.medida}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {m.item_code} · {m.agrupamento === 'TOTAL' ? 'total' : 'por elemento'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remover(m.id)}
                  disabled={ocupado}
                  aria-label={`Remover mapeamento de ${m.medida}`}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 space-y-1.5">
          <select
            value={novaMedida}
            onChange={(e) => setNovaMedida(e.target.value)}
            aria-label="Medida"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {MEDIDAS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rotulo} ({m.dimensao})
              </option>
            ))}
          </select>
          {definicao && <p className="text-[11px] text-slate-500">{definicao.descricao}</p>}

          <div className="flex gap-1.5">
            <input
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              placeholder="Código do item"
              aria-label="Código do item no catálogo"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => void adicionar()}
              disabled={ocupado || !novoCodigo.trim()}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Adicionar
            </button>
          </div>
        </div>
      </div>

      {/* ── Prévia ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => void prever()}
          disabled={ocupado || mapeamentos.length === 0}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {ocupado ? 'Calculando…' : 'Ver prévia da versão publicada'}
        </button>

        {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
        {aviso && <p className="mt-2 text-xs text-emerald-700">{aviso}</p>}

        {previa && (
          <>
            {previa.divergencias.length > 0 && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 p-2">
                <p className="text-xs font-semibold text-red-800">
                  {previa.divergencias.length} mapeamento(s) recusado(s)
                </p>
                <ul className="mt-1 space-y-1">
                  {previa.divergencias.map((d) => (
                    <li key={d.mapeamentoId} className="text-[11px] text-red-700">
                      {d.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {previa.entries.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Nenhuma linha gerada.</p>
            ) : (
              <>
                <table className="mt-3 w-full text-[11px]">
                  <caption className="sr-only">
                    Linhas que serão enviadas ao orçamento
                  </caption>
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th scope="col" className="pb-1 font-medium">
                        Item
                      </th>
                      <th scope="col" className="pb-1 text-right font-medium">
                        Qtd.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previa.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1 pr-2 text-slate-700">
                          {e.sinapiItem.code}
                          {e.location?.room ? ` · ${e.location.room}` : ''}
                        </td>
                        <td className="py-1 text-right tabular-nums text-slate-700">
                          {e.quantity.toFixed(2)} {e.sinapiItem.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mt-2 text-xs text-slate-600">
                  Total estimado{' '}
                  <span className="font-semibold text-slate-800">
                    {previa.totalEstimado.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </p>

                <button
                  type="button"
                  onClick={() => void aplicar()}
                  disabled={ocupado || !study.project_id}
                  title={
                    study.project_id
                      ? 'Substitui as linhas que esta planta já havia gerado'
                      : 'O estudo precisa estar vinculado a uma obra'
                  }
                  className="mt-2 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Aplicar no orçamento da obra
                </button>
                <p className="mt-1 text-[11px] text-slate-500">
                  Substitui o que esta planta já havia gerado. Linha digitada à mão não é
                  tocada.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
