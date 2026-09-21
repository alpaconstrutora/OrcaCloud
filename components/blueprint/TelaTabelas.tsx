/**
 * TABELAS PERSONALIZADAS (21/09/2026, backlog P2 — P2.16) — Analisar › Tabelas.
 *
 * Os "schedules": o usuário escolhe a família, as colunas (as variáveis das
 * fórmulas), um filtro na linguagem das fórmulas, agrupamento, ordenação e
 * totais; a tela monta a tabela sobre o modelo aberto e exporta em .xlsx. A
 * definição é da organização (`blueprint_table_definitions`). Tela em fluxo,
 * como as demais telas do editor — nunca `fixed inset-0`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Sprout, Table2 } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { BlueprintModel, FamiliaComParametros } from '../../utils/blueprintKernel';
import type { Valor } from '../../utils/blueprintFormulas';
import {
  celula,
  colunasDisponiveis,
  faltamSementesDeTabela,
  FAMILIAS_DE_TABELA,
  montarTabela,
  ROTULO_DA_FAMILIA_DE_TABELA,
  ROTULO_DO_TOTAL,
  TOTAIS_DA_COLUNA,
  validarDefinicao,
  type ColunaDeTabela,
  type DefinicaoDeTabela,
  type LinhaDaTabela,
  type TabelaSalva,
  type TotalDaColuna,
} from '../../utils/blueprintTabelas';

interface Props {
  model: BlueprintModel;
  tabelas: TabelaSalva[];
  carregando: boolean;
  indisponivel?: boolean;
  /** As definições de parâmetro da organização — viram colunas possíveis. */
  definicoesDeParametro: readonly { chave: string; familia: FamiliaComParametros | null; unidade?: string | null }[];
  /** Valores calculados por fórmula, por uid (`parametrosCalculadosDoModelo`). */
  calculados?: Map<string, Record<string, Valor>>;
  mostrarOrg: boolean;
  nomeDaOrg: (id: string) => string;
  onCriar: (d: DefinicaoDeTabela) => Promise<void>;
  onAtualizar: (id: string, d: DefinicaoDeTabela) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
  onSemear: (lista: DefinicaoDeTabela[]) => Promise<void>;
  onExportar: (nome: string, linhas: (string | number | null)[][]) => void;
  onSelecionarPeca?: (id: string) => void;
}

const NOVA: DefinicaoDeTabela = { nome: '', familia: 'wall', colunas: [{ chave: 'comprimento', total: 'SOMA' }], filtro: '', agruparPor: null, ordenarPor: null, ordem: 'ASC' };

export default function TelaTabelas({ model, tabelas, carregando, indisponivel, definicoesDeParametro, calculados, mostrarOrg, nomeDaOrg, onCriar, onAtualizar, onExcluir, onSemear, onExportar, onSelecionarPeca }: Props) {
  const confirm = useConfirm();
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<DefinicaoDeTabela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** A tabela salva que o rascunho edita; null = criando. */
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // A primeira tabela salva abre sozinha; some com ela, a próxima.
  useEffect(() => {
    if (ativaId && tabelas.some((t) => t.id === ativaId)) return;
    setAtivaId(tabelas[0]?.id ?? null);
  }, [tabelas, ativaId]);

  const ativa = tabelas.find((t) => t.id === ativaId) ?? null;
  /** O que se vê: o rascunho em edição (ao vivo) ou a tabela salva ativa. */
  const definicao: DefinicaoDeTabela | null = rascunho ?? ativa;
  const montada = useMemo(() => (definicao && definicao.colunas.length > 0 ? montarTabela(model, definicao, calculados) : null), [model, definicao, calculados]);
  const disponiveis = useMemo(() => (definicao ? colunasDisponiveis(model, definicao.familia, definicoesDeParametro) : []), [model, definicao, definicoesDeParametro]);
  const sementes = useMemo(() => faltamSementesDeTabela(tabelas), [tabelas]);
  const problemas = rascunho ? validarDefinicao(rascunho) : [];

  const campo = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-800';

  const salvar = async () => {
    if (!rascunho) return;
    const erros = validarDefinicao(rascunho);
    if (erros.length) {
      setErro(erros.join(' '));
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (editandoId) await onAtualizar(editandoId, rascunho);
      else await onCriar(rascunho);
      setAviso(editandoId ? `Tabela "${rascunho.nome}" atualizada.` : `Tabela "${rascunho.nome}" criada.`);
      setRascunho(null);
      setEditandoId(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };
  const rascunhoDe = (t: TabelaSalva | null): DefinicaoDeTabela | null => (t ? { nome: t.nome, familia: t.familia, colunas: t.colunas.map((c) => ({ ...c })), filtro: t.filtro, agruparPor: t.agruparPor, ordenarPor: t.ordenarPor, ordem: t.ordem } : null);
  const editar = (t: TabelaSalva) => {
    setAtivaId(t.id);
    setEditandoId(t.id);
    setRascunho(rascunhoDe(t));
    setErro(null);
    setAviso(null);
  };
  const nova = () => {
    setEditandoId(null);
    setRascunho({ ...NOVA, colunas: NOVA.colunas.map((c) => ({ ...c })) });
    setErro(null);
    setAviso(null);
  };
  const excluir = async (t: TabelaSalva) => {
    const ok = await confirm({ title: 'Excluir tabela', message: `Excluir a tabela "${t.nome}" da organização? As peças não mudam — só a definição some.`, confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    try {
      await onExcluir(t.id);
      if (editandoId === t.id) {
        setRascunho(null);
        setEditandoId(null);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const alternarColuna = (chave: string) => {
    if (!rascunho) return;
    const tem = rascunho.colunas.some((c) => c.chave === chave);
    setRascunho({ ...rascunho, colunas: tem ? rascunho.colunas.filter((c) => c.chave !== chave) : [...rascunho.colunas, { chave, total: null }] });
  };
  const mudarColuna = (chave: string, patch: Partial<ColunaDeTabela>) => {
    if (!rascunho) return;
    setRascunho({ ...rascunho, colunas: rascunho.colunas.map((c) => (c.chave === chave ? { ...c, ...patch } : c)) });
  };

  const colunasDaGrade: StandardTableColumn[] = useMemo(
    () => [{ key: 'peca', label: 'Peça', width: 90 }, ...(montada?.colunas ?? []).map((c) => ({ key: c.chave, label: c.rotulo, width: 130, align: 'right' as const }))],
    [montada],
  );

  const exportar = async () => {
    if (!montada) return;
    const { tabelaParaPlanilha } = await import('../../utils/blueprintTabelas');
    onExportar(montada.definicao.nome || 'tabela', tabelaParaPlanilha(montada));
  };

  return (
    <div className="space-y-4" data-testid="tela-tabelas">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="como-funcionam-as-tabelas">
        <p>
          <strong>Tabelas personalizadas</strong> — escolha a família, as colunas (as mesmas variáveis das fórmulas de parâmetro: nativas, do pavimento e os parâmetros da organização), um filtro na linguagem das fórmulas (ex.: <code>tipo == "porta" e largura &gt;= 0.8</code>), o agrupamento e os totais. A definição é da organização; a tabela é montada sobre o desenho aberto e sai em .xlsx.
        </p>
      </div>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">O catálogo de tabelas está indisponível neste ambiente (migração não aplicada). A montagem ao vivo continua funcionando com o rascunho.</p>}
      {erro && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="erro-de-tabelas">{erro}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="aviso-de-tabelas">{aviso}</p>}

      {/* As tabelas da organização. */}
      <StandardTable<TabelaSalva>
        columns={[
          { key: 'nome', label: 'Tabela', width: 240 },
          { key: 'familia', label: 'Família', width: 160 },
          { key: 'colunas', label: 'Colunas', width: 320 },
          { key: 'filtro', label: 'Filtro', width: 220 },
          ...(mostrarOrg ? [{ key: 'org', label: 'Organização', width: 170 }] : []),
        ]}
        storageKey="blueprint:tabelas-personalizadas"
        rows={tabelas}
        rowKey={(t) => t.id}
        loading={carregando}
        onRowClick={(t) => {
          setAtivaId(t.id);
          setRascunho(null);
          setEditandoId(null);
        }}
        rowClassName={(t) => (t.id === ativaId ? 'bg-blue-50/60' : '')}
        empty={{ title: 'Nenhuma tabela ainda', subtitle: 'Crie uma ("Nova tabela") ou semeie as prontas: quadro de esquadrias, paredes por pavimento, pontos elétricos, pilares e vigas.' }}
        toolbarRight={
          <span className="flex items-center gap-2">
            {sementes.length > 0 && (
              <button
                type="button"
                onClick={() => void onSemear(sementes).catch((e) => setErro(e instanceof Error ? e.message : String(e)))}
                className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                data-testid="semear-tabelas"
              >
                <Sprout className="h-3.5 w-3.5" /> Semear {sementes.length} pronta(s)
              </button>
            )}
            <button type="button" onClick={nova} className="inline-flex h-8 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700" data-testid="nova-tabela">
              <Plus className="h-3.5 w-3.5" /> Nova tabela
            </button>
          </span>
        }
        actions={{
          label: 'Ações',
          width: 90,
          render: (t) => (
            <span className="flex items-center gap-1">
              <ActionIconButton kind="edit" icon={<Pencil className="h-4 w-4" />} title={`Editar ${t.nome}`} onClick={() => editar(t)} />
              <ActionIconButton kind="delete" title={`Excluir ${t.nome}`} onClick={() => void excluir(t)} />
            </span>
          ),
        }}
        renderCell={(key, t) => {
          switch (key) {
            case 'nome':
              return <span className="text-sm font-medium text-gray-800">{t.nome}</span>;
            case 'familia':
              return <span className="text-xs text-gray-600">{ROTULO_DA_FAMILIA_DE_TABELA[t.familia]}</span>;
            case 'colunas':
              return <span className="text-xs text-gray-600">{t.colunas.map((c) => c.rotulo || c.chave).join(' · ')}</span>;
            case 'filtro':
              return t.filtro ? <code className="text-xs text-slate-600">{t.filtro}</code> : <span className="text-xs text-gray-400">todas as peças</span>;
            case 'org':
              return <span className="text-xs text-gray-600">{nomeDaOrg(t.organizationId)}</span>;
            default:
              return null;
          }
        }}
      />

      {/* O editor da definição. */}
      {rascunho && (
        <div className="rounded-[10px] border border-blue-200 bg-blue-50/40 p-4" data-testid="form-tabela">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{editandoId ? 'Editar tabela' : 'Nova tabela'}</h4>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Nome
              <input value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} aria-label="Nome da tabela" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Família
              <select
                value={rascunho.familia}
                onChange={(e) => setRascunho({ ...rascunho, familia: e.target.value as FamiliaComParametros, colunas: [], agruparPor: null, ordenarPor: null })}
                aria-label="Família da tabela"
                className={campo}
              >
                {FAMILIAS_DE_TABELA.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_DA_FAMILIA_DE_TABELA[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Filtro (vazio = todas)
              <input value={rascunho.filtro} onChange={(e) => setRascunho({ ...rascunho, filtro: e.target.value })} aria-label="Filtro da tabela" placeholder='ex.: tipo == "porta" e largura >= 0.8' className={`${campo} font-mono`} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Agrupar por
              <select value={rascunho.agruparPor ?? ''} onChange={(e) => setRascunho({ ...rascunho, agruparPor: e.target.value || null })} aria-label="Agrupar a tabela por" className={campo}>
                <option value="">sem grupos</option>
                {disponiveis.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.chave}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Ordenar por
              <select value={rascunho.ordenarPor ?? ''} onChange={(e) => setRascunho({ ...rascunho, ordenarPor: e.target.value || null })} aria-label="Ordenar a tabela por" className={campo}>
                <option value="">pela peça</option>
                {disponiveis.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.chave}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Ordem
              <select value={rascunho.ordem} onChange={(e) => setRascunho({ ...rascunho, ordem: e.target.value as 'ASC' | 'DESC' })} aria-label="Ordem da tabela" className={campo}>
                <option value="ASC">crescente</option>
                <option value="DESC">decrescente</option>
              </select>
            </label>
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-600">Colunas ({rascunho.colunas.length}) — marque as variáveis; o total é por coluna</p>
            <div className="mt-1 flex flex-wrap gap-1.5" data-testid="colunas-disponiveis">
              {disponiveis.map((c) => {
                const marcada = rascunho.colunas.some((x) => x.chave === c.chave);
                return (
                  <button
                    key={c.chave}
                    type="button"
                    onClick={() => alternarColuna(c.chave)}
                    aria-pressed={marcada}
                    title={`${c.unidade || 'texto'} · ${c.origem === 'NATIVA' ? 'nativa' : c.origem === 'PAVIMENTO' ? 'do pavimento' : 'parâmetro'}`}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${marcada ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    {c.chave}
                  </button>
                );
              })}
            </div>
            {rascunho.colunas.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3" data-testid="colunas-escolhidas">
                {rascunho.colunas.map((c) => (
                  <div key={c.chave} className="flex items-center gap-2 rounded-[6px] border border-slate-200 bg-white px-2 py-1 text-xs">
                    <code className="text-slate-700">{c.chave}</code>
                    <input value={c.rotulo ?? ''} onChange={(e) => mudarColuna(c.chave, { rotulo: e.target.value || undefined })} placeholder="rótulo" aria-label={`Rótulo da coluna ${c.chave}`} className="h-7 w-28 rounded border border-slate-300 px-1.5 text-xs" />
                    <select value={c.total ?? ''} onChange={(e) => mudarColuna(c.chave, { total: (e.target.value || null) as TotalDaColuna | null })} aria-label={`Total da coluna ${c.chave}`} className="h-7 rounded border border-slate-300 px-1 text-xs">
                      <option value="">sem total</option>
                      {TOTAIS_DA_COLUNA.map((t) => (
                        <option key={t} value={t}>
                          {ROTULO_DO_TOTAL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
          {problemas.length > 0 && <p className="mt-2 text-xs text-amber-800" data-testid="problemas-da-tabela">{problemas.join(' ')}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => void salvar()} disabled={salvando || problemas.length > 0} className="h-8 rounded-[6px] bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="salvar-tabela">
              {editandoId ? 'Salvar alterações' : 'Criar tabela'}
            </button>
            <button type="button" onClick={() => { setRascunho(null); setEditandoId(null); }} className="h-8 rounded-[6px] border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* A tabela montada sobre o desenho aberto. */}
      {montada && (
        <div className="space-y-3" data-testid="tabela-montada">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Table2 className="h-4 w-4 text-slate-500" />
              {montada.definicao.nome || 'Tabela (rascunho)'}
              <span className="text-xs font-normal text-slate-500" data-testid="resumo-da-tabela">
                {montada.linhas} de {montada.pecas} peça(s) · {ROTULO_DA_FAMILIA_DE_TABELA[montada.definicao.familia]}
                {montada.definicao.agruparPor ? ` · ${montada.grupos.length} grupo(s) por ${montada.definicao.agruparPor}` : ''}
              </span>
            </h4>
            <button type="button" onClick={() => void exportar()} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50" data-testid="exportar-tabela">
              <Download className="h-3.5 w-3.5" /> Exportar .xlsx
            </button>
          </div>
          {montada.erroDoFiltro && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="erro-do-filtro">Filtro com erro em alguma peça: {montada.erroDoFiltro}</p>}
          {montada.grupos.map((g, gi) => (
            <div key={gi} data-testid="grupo-da-tabela">
              {montada.definicao.agruparPor && <p className="mb-1 text-xs font-semibold text-slate-600">{montada.definicao.agruparPor}: {g.rotulo} <span className="font-normal text-slate-400">· {g.linhas.length} peça(s)</span></p>}
              <StandardTable<LinhaDaTabela>
                columns={colunasDaGrade}
                storageKey={`blueprint:tabela:${montada.definicao.familia}:${montada.colunas.map((c) => c.chave).join(',')}`}
                rows={g.linhas}
                rowKey={(l) => l.id}
                dense
                onRowClick={onSelecionarPeca ? (l) => onSelecionarPeca(l.id) : undefined}
                empty={{ title: 'Nenhuma peça', subtitle: montada.definicao.filtro ? 'Nenhuma peça da família passa no filtro.' : 'O desenho não tem peça desta família.' }}
                renderCell={(key, l) => {
                  if (key === 'peca') return <span className="text-xs font-medium text-gray-800">{l.rotulo}</span>;
                  const i = montada.colunas.findIndex((c) => c.chave === key);
                  return <span className="text-xs tabular-nums text-gray-700">{i >= 0 ? celula(l.valores[i]) : ''}</span>;
                }}
                sortValue={(key, l) => {
                  if (key === 'peca') return l.rotulo;
                  const i = montada.colunas.findIndex((c) => c.chave === key);
                  const v = i >= 0 ? l.valores[i] : null;
                  return typeof v === 'boolean' ? Number(v) : v ?? null;
                }}
                renderTotals={
                  montada.colunas.some((c) => c.total)
                    ? (n) => (
                        <tr className="bg-gray-50 text-xs font-semibold text-gray-700" data-testid="totais-do-grupo">
                          <td colSpan={n} className="px-6 py-2">
                            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span>{montada.definicao.agruparPor ? 'Subtotal' : 'Total'}</span>
                              {montada.colunas.map((c, i) => (c.total ? <span key={c.chave} className="tabular-nums">{c.rotulo}: {ROTULO_DO_TOTAL[c.total].toLowerCase()} {celula(g.totais[i])}</span> : null))}
                            </span>
                          </td>
                        </tr>
                      )
                    : undefined
                }
              />
            </div>
          ))}
          {montada.definicao.agruparPor && montada.colunas.some((c) => c.total) && (
            <p className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700" data-testid="total-geral">
              Total geral · {montada.colunas.map((c, i) => (c.total ? `${c.rotulo}: ${ROTULO_DO_TOTAL[c.total].toLowerCase()} ${celula(montada.totais[i])}` : null)).filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
