/**
 * COMPOSIÇÃO POR PEÇA (E9.2 do roadmap de incêndio, 01/10/2026) — o cadastro
 * da organização, dentro do painel de Orçamento, logo abaixo do de-para.
 *
 * Uma peça (disciplina + tipo, e a especificação quando importa) vira N itens
 * do catálogo com a quantidade por peça: hidrante simples = abrigo + válvula +
 * 2 mangueiras + esguicho + adaptador + chave + placa. O orçamento expande as
 * peças SEM código próprio; a peça com código fica com a sua linha.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DISCIPLINAS_DO_PONTO_HIDRAULICO, TIPOS_DE_PONTO_HIDRAULICO, type DisciplinaDeRede, type TipoDePontoHidraulico } from '../../utils/blueprintKernel';
import { ROTULO_DO_PONTO_HIDRAULICO } from '../../utils/blueprintHidraulica';
import { ROTULO_DA_DISCIPLINA } from '../../utils/blueprintRede';
import { apagarComposicao, listarComposicoes, salvarComposicao, type ComposicaoDaOrganizacao } from '../../services/blueprintComposicaoService';

// E9.2 (climatização, 07/10/2026): o kit do split (evaporadora/condensadora), o do dreno e o do terminal de ar.
const REDES: DisciplinaDeRede[] = ['INCENDIO', 'AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO', 'PLUVIAL', 'FRIGORIGENA', 'DRENO_AC', 'MECANICA'];

interface ItemEditavel {
  codigo: string;
  quantidade: string;
  descricao: string;
}
const ITEM_VAZIO: ItemEditavel = { codigo: '', quantidade: '1', descricao: '' };
const numero = (s: string) => Number(s.replace(',', '.'));
/** Os tipos da rede, os PRÓPRIOS dela primeiro (o ponto de espera, que serve a todas, vai para o fim). */
const tiposDa = (d: DisciplinaDeRede) => {
  const da = TIPOS_DE_PONTO_HIDRAULICO.filter((t) => DISCIPLINAS_DO_PONTO_HIDRAULICO[t].includes(d));
  return [...da.filter((t) => DISCIPLINAS_DO_PONTO_HIDRAULICO[t].length === 1), ...da.filter((t) => DISCIPLINAS_DO_PONTO_HIDRAULICO[t].length > 1)];
};

export default function PainelComposicoesDePeca({ organizationId, onMudou, onContagem }: { organizationId: string; onMudou: () => void; onContagem?: (n: number) => void }) {
  const [composicoes, setComposicoes] = useState<ComposicaoDaOrganizacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [disciplina, setDisciplina] = useState<DisciplinaDeRede>('INCENDIO');
  const tiposDaRede = tiposDa(disciplina);
  const [tipo, setTipo] = useState<TipoDePontoHidraulico>(tiposDaRede[0]);
  const [especificacao, setEspecificacao] = useState('');
  const [itens, setItens] = useState<ItemEditavel[]>([{ ...ITEM_VAZIO }]);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await listarComposicoes(organizationId);
      setComposicoes(lista);
      onContagem?.(lista.length);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao carregar as composições');
    } finally {
      setCarregando(false);
    }
  }, [organizationId, onContagem]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const trocarRede = (d: DisciplinaDeRede) => {
    setDisciplina(d);
    const primeiro = tiposDa(d)[0];
    if (primeiro) setTipo(primeiro);
  };
  const validos = itens.filter((i) => i.codigo.trim() !== '' && numero(i.quantidade) > 0);
  const motivo = ocupado ? 'Aguarde a gravação anterior' : validos.length === 0 ? 'Informe ao menos um item com código e quantidade maior que zero' : undefined;

  async function salvar() {
    if (motivo) return;
    setOcupado(true);
    try {
      const existente = composicoes.find((c) => c.disciplina === disciplina && c.tipo === tipo && (c.especificacao ?? '') === especificacao.trim());
      await salvarComposicao(organizationId, {
        id: existente?.id,
        disciplina,
        tipo,
        especificacao: especificacao.trim() || null,
        itens: validos.map((i) => ({ codigo: i.codigo, quantidade: numero(i.quantidade), descricao: i.descricao })),
      });
      setItens([{ ...ITEM_VAZIO }]);
      setEspecificacao('');
      onMudou();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao salvar a composição');
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    setOcupado(true);
    try {
      await apagarComposicao(id, organizationId);
      onMudou();
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao apagar a composição');
    } finally {
      setOcupado(false);
    }
  }

  const mudarItem = (i: number, patch: Partial<ItemEditavel>) => setItens((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="border-b border-slate-200 px-4 py-3" data-testid="composicoes-de-peca">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Composição por peça</h3>
      <p className="mt-1 text-[11px] text-slate-500">
        A peça sem código próprio vira uma linha por item: peças × quantidade por peça, na unidade do item. A especificação (ex.: “PQS_ABC · 4 kg”) é
        opcional; a composição com especificação vence a genérica.
      </p>

      {carregando ? (
        <p className="mt-2 text-xs text-slate-500">Carregando…</p>
      ) : composicoes.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhuma composição cadastrada nesta organização.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {composicoes.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded border border-slate-200 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">
                  {ROTULO_DO_PONTO_HIDRAULICO[c.tipo as TipoDePontoHidraulico] ?? c.tipo} · {ROTULO_DA_DISCIPLINA[c.disciplina as DisciplinaDeRede] ?? c.disciplina}
                  {c.especificacao ? ` · ${c.especificacao}` : ''}
                </p>
                {c.itens.map((i, k) => (
                  <p key={k} className="truncate text-[11px] text-slate-500">
                    {String(i.quantidade).replace('.', ',')} × {i.codigo}
                    {i.descricao ? ` — ${i.descricao}` : ''}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void remover(c.id)}
                disabled={ocupado}
                title={ocupado ? 'Aguarde a gravação anterior' : undefined}
                aria-label={`Remover composição de ${c.tipo}`}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-1.5">
        <div className="flex gap-1.5">
          <select value={disciplina} onChange={(e) => trocarRede(e.target.value as DisciplinaDeRede)} aria-label="Rede da peça" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
            {REDES.map((d) => (
              <option key={d} value={d}>
                {ROTULO_DA_DISCIPLINA[d] ?? d}
              </option>
            ))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDePontoHidraulico)} aria-label="Tipo da peça" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
            {tiposDaRede.map((t) => (
              <option key={t} value={t}>
                {ROTULO_DO_PONTO_HIDRAULICO[t]}
              </option>
            ))}
          </select>
        </div>
        <input
          value={especificacao}
          onChange={(e) => setEspecificacao(e.target.value)}
          placeholder="Especificação (opcional) — ex.: PQS_ABC · 4 kg"
          aria-label="Especificação da peça"
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
        />
        {itens.map((i, k) => (
          <div key={k} className="flex gap-1.5">
            <input value={i.codigo} onChange={(e) => mudarItem(k, { codigo: e.target.value })} placeholder="Código" aria-label={`Código do item ${k + 1}`} className="w-24 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input value={i.quantidade} onChange={(e) => mudarItem(k, { quantidade: e.target.value })} inputMode="decimal" aria-label={`Quantidade por peça do item ${k + 1}`} className="w-14 shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums" />
            <input value={i.descricao} onChange={(e) => mudarItem(k, { descricao: e.target.value })} placeholder="Descrição (opcional)" aria-label={`Descrição do item ${k + 1}`} className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs" />
          </div>
        ))}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setItens((l) => [...l, { ...ITEM_VAZIO }])}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3 w-3" />
            Item
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!!motivo}
            title={motivo}
            className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Salvar composição
          </button>
        </div>
        {erro && <p className="text-[11px] text-red-700">{erro}</p>}
      </div>
    </div>
  );
}
