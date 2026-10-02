/**
 * TELA "Alternativas" — Design Options (19/09/2026, E6.1). As alternativas do
 * estudo são RAMOS (`blueprint_branches`): nome, descrição, principal, origem
 * (versão de onde nasceu), revisão publicada, rascunho. Abrir troca o modelo
 * carregado (o editor remonta com o ramo); "Nova alternativa a partir desta"
 * copia o conteúdo editável atual; "Tornar principal" promove; excluir só as
 * não principais. COMPARAR: duas miniaturas na mesma escala e enquadramento
 * (`MiniPlanta` com a caixa da união), o diff semântico (`blueprintDiff`) e a
 * tabela de indicadores da avaliação (E5.2) lado a lado, com o delta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, GitBranch, Plus, Star, Trash2 } from 'lucide-react';
import type { BlueprintBranch } from '../../types/blueprint';
import type { BlueprintModel, ObjectId } from '../../utils/blueprintKernel';
import { diffSnapshots } from '../../utils/blueprintDiff';
import { CHAVES_DOS_INDICADORES, ROTULO_DO_INDICADOR, type Avaliacao } from '../../utils/blueprintAvaliacao';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import MiniPlanta, { caixaDosModelos } from './MiniPlanta';
import { NotaGeral } from './TelaAvaliacao';

import { destaquesDoComparador, formatarDoComparador, LINHAS_DO_COMPARADOR, type CenarioDeMassa } from '../../utils/blueprintComparadorDeMassa';

interface Props {
  ramos: BlueprintBranch[];
  ramoAtualId: string;
  model: BlueprintModel;
  avaliacaoAtual: Avaliacao;
  carregando: boolean;
  erro: string | null;
  onAbrir: (branchId: string) => void;
  onCriar: (nome: string, descricao: string) => Promise<void>;
  onRenomear: (branchId: string, nome: string, descricao: string | null) => Promise<void>;
  onPromover: (branchId: string) => Promise<void>;
  onExcluir: (branchId: string) => Promise<void>;
  carregarModelo: (branchId: string) => Promise<BlueprintModel | null>;
  avaliarModelo: (m: BlueprintModel) => Avaliacao;
  /**
   * ESTUDO DE MASSA (M4): mede um modelo como cenário de massa, com a régua do
   * estudo (zona, produto, CUB); e o nome sugerido "EM-00N — X pav / Y un" para
   * a próxima alternativa. Ausente = estudo sem massa, o comparador não aparece.
   */
  massa?: { cenario: (m: BlueprintModel) => CenarioDeMassa | null; nomeSugerido: string | null };
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Alternativa', width: 240 },
  { key: 'descricao', label: 'O que explora', width: 260, sortable: false },
  { key: 'estado', label: 'Estado', width: 130 },
  { key: 'revisao', label: 'Publicada', width: 110 },
  { key: 'rascunho', label: 'Rascunho salvo', width: 160 },
  { key: 'criada', label: 'Criada em', width: 120 },
];

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function TelaAlternativas({ ramos, ramoAtualId, model, avaliacaoAtual, carregando, erro, onAbrir, onCriar, onRenomear, onPromover, onExcluir, carregarModelo, avaliarModelo, massa }: Props) {
  /** M4: os cenários de massa de TODAS as alternativas, na ordem da tabela; carregados sob comando. */
  const [cenarios, setCenarios] = useState<{ ramo: BlueprintBranch; cenario: CenarioDeMassa | null }[] | null>(null);
  const [comparandoTodas, setComparandoTodas] = useState(false);
  const confirmar = useConfirm();
  const [novoNome, setNovoNome] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [comparandoId, setComparandoId] = useState<string | null>(null);
  const [outro, setOutro] = useState<{ id: string; model: BlueprintModel; avaliacao: Avaliacao } | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [nivelIdx, setNivelIdx] = useState(0);
  const atual = ramos.find((r) => r.id === ramoAtualId) ?? null;

  useEffect(() => {
    let vivo = true;
    if (!comparandoId) {
      setOutro(null);
      return;
    }
    (async () => {
      try {
        const m = await carregarModelo(comparandoId);
        if (!vivo) return;
        if (!m) {
          setErroLocal('A alternativa escolhida está vazia (sem rascunho nem versão).');
          setOutro(null);
          return;
        }
        setOutro({ id: comparandoId, model: m, avaliacao: avaliarModelo(m) });
        setErroLocal(null);
      } catch (e) {
        if (vivo) setErroLocal(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [comparandoId, carregarModelo, avaliarModelo]);

  const rodar = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setErroLocal(null);
    try {
      await fn();
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const criar = () =>
    rodar(async () => {
      if (!novoNome.trim()) throw new Error('Dê um nome à alternativa.');
      await onCriar(novoNome, novaDescricao);
      setNovoNome('');
      setNovaDescricao('');
    });

  /** Carrega cada alternativa (a aberta é o modelo em memória, com o que ainda não foi salvo) e mede. */
  const compararTodas = async () => {
    if (!massa) return;
    setComparandoTodas(true);
    setErroLocal(null);
    try {
      const lista = await Promise.all(
        ramos.map(async (r) => {
          const m = r.id === ramoAtualId ? model : await carregarModelo(r.id);
          return { ramo: r, cenario: m ? massa.cenario(m) : null };
        }),
      );
      setCenarios(lista);
    } catch (e) {
      setErroLocal(e instanceof Error ? e.message : String(e));
    } finally {
      setComparandoTodas(false);
    }
  };
  // A aberta muda a cada gesto: a coluna dela acompanha sem recarregar as outras.
  const cenariosVivos = useMemo(
    () => (cenarios && massa ? cenarios.map((c) => (c.ramo.id === ramoAtualId ? { ...c, cenario: massa.cenario(model) } : c)) : null),
    [cenarios, massa, ramoAtualId, model],
  );
  const destaques = useMemo(() => (cenariosVivos ? destaquesDoComparador(cenariosVivos.map((c) => c.cenario)) : {}), [cenariosVivos]);

  const comparacao = useMemo(() => {
    if (!outro) return null;
    const diff = diffSnapshots(outro.model, model);
    const caixa = caixaDosModelos([model, outro.model]);
    const destaque = new Set(diff.alteracoes.map((a) => a.uid).filter((u): u is string => !!u));
    return { diff, caixa, destaque };
  }, [outro, model]);

  const niveis = model.levels;
  const nivelAtual = niveis[Math.min(nivelIdx, Math.max(0, niveis.length - 1))]?.id ?? null;
  const nivelDoOutro = (m: BlueprintModel): ObjectId | null => {
    const nome = niveis[nivelIdx]?.name;
    return m.levels.find((l) => l.name === nome)?.id ?? m.levels[Math.min(nivelIdx, Math.max(0, m.levels.length - 1))]?.id ?? null;
  };

  return (
    <div className="space-y-4" data-testid="tela-alternativas">
      <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700" data-testid="resumo-alternativas">
        <p>
          <strong className="text-gray-900">{ramos.length} alternativa(s)</strong> · aberta: <strong>{atual?.name ?? '—'}</strong>
          {atual?.principal && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">principal</span>}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Cada alternativa é um ramo do estudo, com rascunho, versões e histórico próprios. A <strong>principal</strong> é a que o orçamento e a obra citam. Abrir outra troca o modelo carregado no editor; comparar põe as duas na mesma
          escala, lista o que muda e confronta os indicadores da avaliação.
        </p>
        {(erro || erroLocal) && (
          <p className="mt-2 flex items-center gap-1 text-xs text-red-700" role="alert">
            <AlertTriangle className="h-3.5 w-3.5" /> {erro ?? erroLocal}
          </p>
        )}
      </div>

      <StandardTable<BlueprintBranch>
        columns={COLUNAS}
        storageKey="blueprint:alternativas"
        rows={ramos}
        rowKey={(r) => r.id}
        loading={carregando}
        toolbarRight={
          <div className="flex items-center gap-2">
            {massa?.nomeSugerido && (
              <button type="button" onClick={() => setNovoNome(massa.nomeSugerido!)} className="h-9 rounded-[6px] px-2 text-sm font-medium text-blue-600 hover:bg-blue-50" title="Nome no padrão do estudo de massa: número do cenário, pavimentos e unidades da alternativa aberta" data-testid="nome-sugerido">
                {massa.nomeSugerido.split(' — ')[0]}
              </button>
            )}
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void criar()} placeholder="Nome (ex.: Suíte ao norte)" aria-label="Nome da nova alternativa" className="h-9 w-48 rounded-[6px] border border-slate-300 px-2 text-sm" />
            <input value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="O que explora (opcional)" aria-label="Descrição da nova alternativa" className="h-9 w-56 rounded-[6px] border border-slate-300 px-2 text-sm" />
            <button type="button" onClick={() => void criar()} disabled={ocupado || !novoNome.trim()} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="nova-alternativa" title="Copia o conteúdo editável da alternativa aberta para um ramo novo">
              <Plus className="h-4 w-4" /> Nova a partir desta
            </button>
          </div>
        }
        sortValue={(key, r) => {
          switch (key) {
            case 'nome':
              return r.name;
            case 'estado':
              return (r.id === ramoAtualId ? 0 : 1) + (r.principal ? 0 : 2);
            case 'revisao':
              return r.base_revision;
            case 'rascunho':
              return r.draft_saved_at ?? '';
            case 'criada':
              return r.created_at;
            default:
              return null;
          }
        }}
        searchText={(r) => `${r.name} ${r.descricao ?? ''}`}
        searchPlaceholder="Buscar alternativa…"
        rowClassName={(r) => (r.id === ramoAtualId ? 'bg-blue-50/40' : '')}
        renderCell={(key, r) => {
          switch (key) {
            case 'nome':
              return (
                <input
                  key={`${r.id}-${r.name}`}
                  defaultValue={r.name}
                  aria-label={`Nome da alternativa ${r.name}`}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && void rodar(() => onRenomear(r.id, e.target.value, r.descricao))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-gray-900 hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                />
              );
            case 'descricao':
              return (
                <input
                  key={`${r.id}-${r.descricao ?? ''}`}
                  defaultValue={r.descricao ?? ''}
                  placeholder="—"
                  aria-label={`Descrição da alternativa ${r.name}`}
                  onBlur={(e) => (e.target.value.trim() || null) !== (r.descricao ?? null) && void rodar(() => onRenomear(r.id, r.name, e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-gray-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white"
                />
              );
            case 'estado':
              return (
                <span className="flex flex-wrap items-center gap-1 text-xs">
                  {r.id === ramoAtualId && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">aberta</span>}
                  {r.principal && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">principal</span>}
                </span>
              );
            case 'revisao':
              return <span className="text-sm text-gray-700">{r.base_revision > 0 ? `rev. ${r.base_revision}` : <span className="text-slate-400">nunca</span>}</span>;
            case 'rascunho':
              return <span className="text-xs text-gray-600">{data(r.draft_saved_at)}</span>;
            case 'criada':
              return <span className="text-xs text-gray-600">{data(r.created_at)}</span>;
            default:
              return null;
          }
        }}
        actions={{
          width: 190,
          render: (r) => (
            <span className="flex items-center gap-1">
              {r.id !== ramoAtualId && (
                <button type="button" onClick={() => onAbrir(r.id)} className="h-7 rounded-[6px] border border-slate-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-slate-50" aria-label={`Abrir a alternativa ${r.name}`}>
                  Abrir
                </button>
              )}
              {r.id !== ramoAtualId && (
                <button type="button" onClick={() => setComparandoId(comparandoId === r.id ? null : r.id)} className={`h-7 rounded-[6px] border px-2 text-xs font-medium ${comparandoId === r.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-gray-700 hover:bg-slate-50'}`} aria-label={`Comparar com a alternativa ${r.name}`}>
                  Comparar
                </button>
              )}
              {!r.principal && (
                <ActionIconButton kind="edit" icon={<Star className="h-4 w-4" />} title={`Tornar ${r.name} a principal`} aria-label={`Tornar principal a alternativa ${r.name}`} disabled={ocupado} onClick={() => void rodar(() => onPromover(r.id))} />
              )}
              {!r.principal && r.id !== ramoAtualId && (
                <ActionIconButton
                  kind="delete"
                  title={`Excluir a alternativa ${r.name}`}
                  aria-label={`Excluir a alternativa ${r.name}`}
                  disabled={ocupado}
                  onClick={() =>
                    void rodar(async () => {
                      const ok = await confirmar({ title: `Excluir a alternativa "${r.name}"?`, message: 'O ramo e o rascunho somem. Versões publicadas dela continuam existindo (podem estar citadas).', confirmLabel: 'Excluir', variant: 'danger' });
                      if (ok) await onExcluir(r.id);
                    })
                  }
                />
              )}
            </span>
          ),
        }}
        empty={{ title: 'Sem alternativas', subtitle: 'Crie uma a partir da atual para explorar outra solução sem perder esta.' }}
      />

      {massa && (
        <div className="space-y-3 rounded-[10px] border border-gray-100 bg-white px-5 py-4 shadow-sm" data-testid="comparador-de-massa">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Comparador de cenários de massa</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Todas as alternativas medidas com a mesma zona, o mesmo produto e o mesmo CUB. Cada linha destaca quem ganha <em>nela</em> — não há vencedor geral: o critério é seu.
              </p>
            </div>
            <button type="button" onClick={() => void compararTodas()} disabled={comparandoTodas || ramos.length < 2} title={ramos.length < 2 ? 'Crie outra alternativa ("Nova a partir desta") para ter o que comparar' : 'Carrega e mede todas as alternativas'} className="h-9 rounded-[6px] bg-blue-600 px-3.5 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {comparandoTodas ? 'Medindo…' : cenarios ? 'Medir de novo' : 'Comparar todas'}
            </button>
          </div>
          {cenariosVivos && (
            <>
              {/* Tabela à mão, e não StandardTable: é matriz TRANSPOSTA (linha = indicador,
                  coluna = alternativa), com colunas que nascem e somem com os ramos; ordenar
                  por uma coluna misturaria m², R$ e % na mesma ordem. */}
              <div className="overflow-x-auto rounded-[10px] border border-gray-100">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500">
                      <th className="border-r border-gray-100 px-6 py-2">Indicador</th>
                      {cenariosVivos.map((c) => (
                        <th key={c.ramo.id} className="border-r border-gray-100 px-6 py-2 text-right last:border-r-0">
                          {c.ramo.name}
                          {c.ramo.id === ramoAtualId ? ' (aberta)' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {LINHAS_DO_COMPARADOR.map((l) => (
                      <tr key={l.chave}>
                        <td className="border-r border-gray-100 px-6 py-2.5 text-sm font-normal text-gray-700">{l.rotulo}</td>
                        {cenariosVivos.map((c, i) => {
                          const ganha = (destaques[l.chave] ?? []).includes(i);
                          const v = c.cenario ? (c.cenario[l.chave] as number | null) : null;
                          return (
                            <td key={c.ramo.id} className={`border-r border-gray-100 px-6 py-2.5 text-right text-sm font-normal tabular-nums last:border-r-0 ${ganha ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600'}`} title={ganha ? l.destaque : undefined}>
                              {c.cenario ? formatarDoComparador(v, l.formato) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-0.5 text-xs text-gray-600" data-testid="destaques-do-comparador">
                {LINHAS_DO_COMPARADOR.filter((l) => l.destaque && destaques[l.chave]).map((l) => (
                  <li key={l.chave}>
                    <span className="text-emerald-700">{l.destaque}</span>: {destaques[l.chave]!.map((i) => cenariosVivos[i].ramo.name).join(', ')}
                  </li>
                ))}
                {cenariosVivos.some((c) => !c.cenario) && <li className="text-gray-500">Alternativa sem bloco de massa aparece com "—".</li>}
                <li className="text-gray-500">Complexidade construtiva = blocos + 2 por pavimento de subsolo + 1 por bloco apoiado em outro (transição). Índice de pré-projeto, não orçamento.</li>
              </ul>
            </>
          )}
        </div>
      )}

      {comparandoId && outro && comparacao && (
        <div className="space-y-4 rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="comparacao">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              <GitBranch className="mr-1 inline h-4 w-4 text-slate-400" />
              {atual?.name ?? 'Atual'} × {ramos.find((r) => r.id === outro.id)?.name ?? 'outra'}
            </p>
            {niveis.length > 1 && (
              <select value={nivelIdx} onChange={(e) => setNivelIdx(Number(e.target.value))} aria-label="Pavimento comparado" className="h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs">
                {niveis.map((l, i) => (
                  <option key={l.id} value={i}>{l.name}</option>
                ))}
              </select>
            )}
          </div>
          {comparacao.caixa && (
            <div className="grid gap-3 md:grid-cols-2">
              <MiniPlanta model={model} levelId={nivelAtual} caixa={comparacao.caixa} destaque={comparacao.destaque} titulo={`${atual?.name ?? 'Atual'} (aberta)`} />
              <MiniPlanta model={outro.model} levelId={nivelDoOutro(outro.model)} caixa={comparacao.caixa} destaque={comparacao.destaque} titulo={ramos.find((r) => r.id === outro.id)?.name ?? 'outra'} />
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div data-testid="diff-alternativas">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">O que muda (da outra para a aberta)</p>
              {comparacao.diff.identicos ? (
                <p className="text-sm text-slate-500">Idênticas — nada mudou entre as duas.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-600">
                    Paredes {comparacao.diff.resumo.paredesAntes} → {comparacao.diff.resumo.paredesDepois} · ambientes {comparacao.diff.resumo.ambientesAntes} → {comparacao.diff.resumo.ambientesDepois} · piso {comparacao.diff.resumo.areaPisoAntesM2.toFixed(2).replace('.', ',')} → {comparacao.diff.resumo.areaPisoDepoisM2.toFixed(2).replace('.', ',')} m² ({comparacao.diff.resumo.deltaAreaM2 >= 0 ? '+' : ''}
                    {comparacao.diff.resumo.deltaAreaM2.toFixed(2).replace('.', ',')})
                  </p>
                  <ul className="mt-1 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-gray-700">
                    {comparacao.diff.alteracoes.slice(0, 40).map((a, k) => (
                      <li key={k}>{a.descricao}</li>
                    ))}
                    {comparacao.diff.alteracoes.length > 40 && <li className="text-slate-500">… e mais {comparacao.diff.alteracoes.length - 40}</li>}
                  </ul>
                </>
              )}
            </div>
            <div data-testid="indicadores-comparados">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Indicadores (E5.2)</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-0.5 pr-2 font-medium">Indicador</th>
                    <th className="py-0.5 pr-2 text-right font-medium">Aberta</th>
                    <th className="py-0.5 pr-2 text-right font-medium">Outra</th>
                    <th className="py-0.5 pr-2 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Nota geral</td>
                    <td className="py-1 pr-2 text-right"><NotaGeral nota={avaliacaoAtual.notaGeral} /></td>
                    <td className="py-1 pr-2 text-right"><NotaGeral nota={outro.avaliacao.notaGeral} /></td>
                    <td className="py-1 pr-2 text-right tabular-nums"><Delta a={avaliacaoAtual.notaGeral} b={outro.avaliacao.notaGeral} /></td>
                  </tr>
                  {CHAVES_DOS_INDICADORES.map((k) => {
                    const a = avaliacaoAtual.indicadores.find((i) => i.chave === k)!;
                    const b = outro.avaliacao.indicadores.find((i) => i.chave === k)!;
                    if (a.nota == null && b.nota == null) return null;
                    return (
                      <tr key={k} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2 text-gray-700">{ROTULO_DO_INDICADOR[k]}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">{a.nota ?? '—'}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums">{b.nota ?? '—'}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums"><Delta a={a.nota} b={b.nota} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Δ = aberta − outra. A outra é avaliada com o mesmo programa, as mesmas regras e as mesmas hipóteses; custo só entra na aberta (a prévia do orçamento é dela).</p>
            </div>
          </div>
          {!atual?.principal && (
            <p className="flex items-center gap-1 text-xs text-slate-600">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Gostou da aberta? "Tornar principal" na tabela promove esta alternativa; a antiga continua como ramo.
            </p>
          )}
        </div>
      )}
      {comparandoId && !outro && !erroLocal && <p className="text-sm text-slate-500">Carregando a outra alternativa…</p>}
    </div>
  );
}

function Delta({ a, b }: { a: number | null; b: number | null }) {
  if (a == null || b == null) return <span className="text-slate-400">—</span>;
  const d = a - b;
  return <span className={d > 0 ? 'text-emerald-700' : d < 0 ? 'text-red-700' : 'text-slate-500'}>{d > 0 ? `+${d}` : d}</span>;
}
