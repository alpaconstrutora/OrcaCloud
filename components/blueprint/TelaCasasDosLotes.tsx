/**
 * TELA "Casas dos lotes" (26/10/2026, etapa 2 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): na planta
 * do LOTEAMENTO, gera a casa automática de cada lote escolhido numa PLANTA PRÓPRIA (decisão do usuário: "uma planta
 * por lote"), lote a lote, com o programa comum (o da tela Casa automática) e o que a unidade do lote tiver de
 * dormitórios/suítes/banheiros/vagas. Lote que já tem planta não é gerado de novo sem pedir.
 *
 * Apresentacional: a geração (worker, gravação) é do editor; a tela lista, escolhe e mostra o andamento.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Home, Play, Square } from 'lucide-react';
import Button from '../ui/Button';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { useConfirm } from '../ui/confirm';
import { ROTULO_DO_PADRAO_DA_CASA, type ProgramaCurtoDaCasa } from '../../utils/blueprintPrograma';
import type { LoteParaCasa } from '../../utils/blueprintCasasDoLoteamento';

export type ResultadoDoLote = { ok: true; studyId: string; nome: string; avisos: string[] } | { ok: false; motivo: string };

interface Props {
  lotes: LoteParaCasa[];
  /** `uid do lote → planta que já existe`; `null` = carregando. */
  plantas: Map<string, { studyId: string; nome: string }> | null;
  /** As unidades do Empreendimento ainda carregando: o programa de cada lote depende delas — o botão espera. */
  carregandoUnidades?: boolean;
  programa: ProgramaCurtoDaCasa;
  onEditarPrograma: () => void;
  /** O lote em curso; `null` = parado. */
  gerando: { rotulo: string; indice: number; total: number; etapa: string | null } | null;
  resultados: Record<string, ResultadoDoLote>;
  onGerar: (loteUids: string[]) => void;
  onParar: () => void;
  onAbrir: (studyId: string) => void;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'lote', label: 'Lote', sortable: true, width: 220 },
  { key: 'area', label: 'Área (m²)', sortable: true, width: 110, align: 'right' },
  { key: 'unidade', label: 'Unidade do Empreendimento', sortable: true, width: 240 },
  { key: 'situacao', label: 'Situação', sortable: true, width: 360 },
];

const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TelaCasasDosLotes({ lotes, plantas, carregandoUnidades = false, programa, onEditarPrograma, gerando, resultados, onGerar, onParar, onAbrir }: Props) {
  const confirmar = useConfirm();
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  // Ao carregar as plantas: escolhidos de saída = os elegíveis que ainda não têm planta.
  useEffect(() => {
    if (!plantas) return;
    setEscolhidos(new Set(lotes.filter((l) => l.elegivel && !plantas.has(l.loteUid)).map((l) => l.loteUid)));
  }, [plantas, lotes]);
  // Lote que acabou de ganhar planta sai da escolha: gerar de novo é a exceção (e pede confirmação).
  useEffect(() => {
    const prontos = Object.entries(resultados).filter(([, r]) => r.ok).map(([uid]) => uid);
    if (prontos.length === 0) return;
    setEscolhidos((atual) => {
      if (!prontos.some((u) => atual.has(u))) return atual;
      const proximo = new Set(atual);
      for (const u of prontos) proximo.delete(u);
      return proximo;
    });
  }, [resultados]);

  const plantaDe = (l: LoteParaCasa): { studyId: string; nome: string } | null => {
    const r = resultados[l.loteUid];
    if (r?.ok) return { studyId: r.studyId, nome: r.nome };
    return plantas?.get(l.loteUid) ?? null;
  };
  const situacao = (l: LoteParaCasa): { texto: string; cor: string } => {
    if (!l.elegivel) return { texto: l.motivo ?? 'Fora', cor: 'text-gray-500' };
    if (gerando && gerando.rotulo === l.rotulo) return { texto: `Gerando… ${gerando.etapa ?? ''}`.trim(), cor: 'text-blue-700' };
    const r = resultados[l.loteUid];
    if (r && !r.ok) return { texto: `Falhou: ${r.motivo}`, cor: 'text-red-700' };
    if (r?.ok) return { texto: `Planta criada${r.avisos.length > 0 ? ` — ${r.avisos.join(' ')}` : ''}`, cor: 'text-emerald-700' };
    if (plantas?.has(l.loteUid)) return { texto: 'Já tem planta', cor: 'text-gray-700' };
    return { texto: plantas ? 'Sem planta' : 'Conferindo…', cor: 'text-gray-600' };
  };

  const elegiveis = useMemo(() => lotes.filter((l) => l.elegivel), [lotes]);
  const selecionados = lotes.filter((l) => escolhidos.has(l.loteUid) && l.elegivel);
  const motivoDoGerar = elegiveis.length === 0
    ? 'O loteamento não tem lotes de casa (só remanescentes ou encravados).'
    : !plantas
      ? 'Aguarde: conferindo quais lotes já têm planta.'
      : carregandoUnidades
        ? 'Aguarde: carregando as unidades do Empreendimento (o programa de cada lote depende delas).'
      : selecionados.length === 0
        ? 'Escolha pelo menos um lote na tabela.'
        : null;

  const gerar = async () => {
    const jaTem = selecionados.filter((l) => plantaDe(l));
    if (jaTem.length > 0) {
      const ok = await confirmar({
        title: 'Gerar outra planta?',
        message: `${jaTem.length} lote(s) escolhido(s) já têm planta de casa (${jaTem.map((l) => l.rotulo).join(', ')}). Gerar cria OUTRA planta para cada um — a que existe fica.`,
        variant: 'warning',
        confirmLabel: 'Gerar outra',
      });
      if (!ok) return;
    }
    onGerar(selecionados.map((l) => l.loteUid));
  };

  return (
    <div className="space-y-6" data-testid="tela-casas-dos-lotes">
      <section className="space-y-4 rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm">
        <SecaoTitulo
          icon={Home}
          titulo="Programa comum"
          resumo="o da tela Casa automática desta planta"
          acoes={
            <Button variant="secondary" onClick={onEditarPrograma}>
              Editar o programa
            </Button>
          }
        />
        <p className="text-sm text-gray-700" data-testid="programa-comum">
          {programa.dormitorios} dormitório(s), {programa.suites} suíte(s), {programa.banheiros} banheiro(s), {programa.vagas} vaga(s){programa.areaAlvoM2 ? `, área alvo ${m2(programa.areaAlvoM2)} m²` : ''} · {ROTULO_DO_PADRAO_DA_CASA[programa.padrao]}
        </p>
        <ul className="space-y-1 text-xs text-gray-600">
          <li>Dormitórios, suítes, banheiros e vagas cadastrados na unidade do lote valem para ela; a área da unidade (a do lote) é ignorada.</li>
          <li>Cada casa vai para uma planta nova, com as divisas do lote, a zona desta planta e a casa já lançada. Esta planta não muda.</li>
          <li>O platô de terraplenagem não vai junto (a planta nova não tem a topografia do loteamento): abra a planta da casa para definir a terraplenagem.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Lotes</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {gerando ? `Lote ${gerando.indice} de ${gerando.total}: ${gerando.rotulo}${gerando.etapa ? ` — ${gerando.etapa}` : ''}` : `${selecionados.length} de ${elegiveis.length} lote(s) de casa escolhido(s).`}
            </p>
          </div>
          {gerando ? (
            <Button variant="secondary" onClick={onParar} className="border-red-200 text-red-700 hover:bg-red-50" data-testid="parar-casas-dos-lotes">
              <Square className="h-4 w-4" /> Parar
            </Button>
          ) : (
            <span title={motivoDoGerar ?? undefined}>
              <Button onClick={() => void gerar()} disabled={!!motivoDoGerar} data-testid="gerar-casas-dos-lotes">
                <Play className="h-4 w-4" /> Gerar casas ({selecionados.length})
              </Button>
            </span>
          )}
        </div>
        {/* Sem busca: um loteamento tem poucas dezenas de lotes, e a tabela ordena por coluna. */}
        <StandardTable<LoteParaCasa>
          storageKey="blueprint:casas-dos-lotes"
          columns={COLUNAS}
          rows={lotes}
          rowKey={(l) => l.loteUid}
          dense
          selection={{ selected: escolhidos, onChange: setEscolhidos, canSelect: (l) => l.elegivel && !gerando }}
          sortValue={(k, l) => (k === 'area' ? l.areaM2 : k === 'unidade' ? (l.unidade?.name ?? '') : k === 'situacao' ? situacao(l).texto : l.rotulo)}
          renderCell={(k, l) => {
            if (k === 'lote') return <span className="text-sm font-normal text-gray-700">{l.rotulo}</span>;
            if (k === 'area') return <span className="text-sm font-normal text-gray-600 tabular-nums">{m2(l.areaM2)}</span>;
            if (k === 'unidade')
              return (
                <span className="block truncate text-sm font-normal text-gray-700" title={l.unidade?.name ?? undefined}>
                  {l.unidade ? `${l.unidade.name}${l.unidade.bedrooms ? ` · ${l.unidade.bedrooms} dorm.` : ''}` : '—'}
                </span>
              );
            const s = situacao(l);
            return (
              <span className={`block truncate text-sm font-normal ${s.cor}`} title={s.texto} data-testid={`situacao-${l.loteUid}`}>
                {s.texto}
              </span>
            );
          }}
          actions={{
            width: 110,
            render: (l) => {
              const p = plantaDe(l);
              return p ? (
                <button type="button" onClick={() => onAbrir(p.studyId)} title={`Abrir ${p.nome}`} className="inline-flex items-center gap-1 rounded-lg p-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-800">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </button>
              ) : null;
            },
          }}
          empty={{ title: 'Nenhum lote', subtitle: 'Desenhe os lotes do loteamento em Terreno › Loteamento.' }}
        />
      </section>
    </div>
  );
}
