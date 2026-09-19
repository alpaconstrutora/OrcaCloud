/**
 * TELA "Verificar legislação" (19/09/2026, E3.2). Molde `TelaQuantitativos`:
 * `TabsBar` + `StandardTable`. Duas abas: **Resultados** — cada regra × alvo
 * com o estado (violada / conforme / não avaliada), agrupável por fonte e
 * filtrável por estado; clique leva ao elemento — e **Regras** — a semente
 * (só leitura) e as regras da organização, com o formulário para acrescentar
 * uma (validado pelo motor: escopo, expressão e variáveis).
 *
 * A NBR 5410 continua no painel do ambiente; aqui entra como fonte da lista,
 * pelas linhas que o editor adapta das conferências de tomadas e iluminação.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Plus, Trash2 } from 'lucide-react';
import {
  ESCOPOS_DA_REGRA,
  problemasDaRegra,
  REGRAS_SEMENTE,
  resumirRegras,
  ROTULO_DO_ESCOPO,
  VARIAVEIS_DO_ESCOPO,
  type EscopoDaRegra,
  type EstadoDaRegra,
  type Regra,
  type ResultadoDeRegra,
  type SeveridadeDaRegra,
} from '../../utils/blueprintRegras';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';

interface Props {
  resultados: ResultadoDeRegra[];
  /** As regras da organização em vigor (todas as fontes fora a semente). */
  regrasDaOrganizacao: Regra[];
  /** Nome do pavimento por id, para a coluna. */
  nomeDoPavimento: (levelId: string | null) => string;
  onSelecionar: (id: string) => void;
  /** `null` = sem organização para gravar ("Todas") ou persistência indisponível. */
  onSalvarRegra: ((regra: Regra) => Promise<void>) | null;
  onRemoverRegra: ((regraId: string) => Promise<void>) | null;
  carregando?: boolean;
  avisoDePersistencia?: string | null;
}

type Aba = 'resultados' | 'regras';
type FiltroDeEstado = 'TODOS' | EstadoDaRegra;

const COLUNAS: StandardTableColumn[] = [
  { key: 'estado', label: 'Estado', width: 130 },
  { key: 'fonte', label: 'Fonte', width: 220 },
  { key: 'regra', label: 'Regra', width: 260 },
  { key: 'escopo', label: 'Escopo', width: 100 },
  { key: 'alvo', label: 'Alvo', width: 160 },
  { key: 'pavimento', label: 'Pavimento', width: 120 },
  { key: 'valores', label: 'Valores', width: 300, sortable: false },
  { key: 'severidade', label: 'Severidade', width: 100 },
];

const COLUNAS_REGRAS: StandardTableColumn[] = [
  { key: 'fonte', label: 'Fonte', width: 220 },
  { key: 'nome', label: 'Regra', width: 240 },
  { key: 'escopo', label: 'Escopo', width: 100 },
  { key: 'quando', label: 'Quando', width: 220, sortable: false },
  { key: 'expressao', label: 'Conforme se', width: 240, sortable: false },
  { key: 'severidade', label: 'Severidade', width: 100 },
];

function Estado({ estado, severidade }: { estado: EstadoDaRegra; severidade: SeveridadeDaRegra }) {
  if (estado === 'CONFORME') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Conforme
      </span>
    );
  }
  if (estado === 'NAO_AVALIADA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        <HelpCircle className="h-3.5 w-3.5" /> Não avaliada
      </span>
    );
  }
  const tom = severidade === 'ERRO' ? 'bg-red-50 text-red-700' : severidade === 'AVISO' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-700';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tom}`}>
      <AlertTriangle className="h-3.5 w-3.5" /> Violada
    </span>
  );
}

export default function TelaLegislacao({ resultados, regrasDaOrganizacao, nomeDoPavimento, onSelecionar, onSalvarRegra, onRemoverRegra, carregando = false, avisoDePersistencia = null }: Props) {
  const [aba, setAba] = usePersistedState<Aba>('blueprint:legislacao:aba', 'resultados');
  const [filtro, setFiltro] = useState<FiltroDeEstado>('TODOS');
  const [fonte, setFonte] = useState<string>('');
  const resumo = useMemo(() => resumirRegras(resultados), [resultados]);
  const fontes = useMemo(() => [...new Set(resultados.map((r) => r.regra.fonte))].sort(), [resultados]);
  const visiveis = useMemo(
    () => resultados.filter((r) => (filtro === 'TODOS' || r.estado === filtro) && (!fonte || r.regra.fonte === fonte)),
    [resultados, filtro, fonte],
  );
  const abas: TabsBarItem[] = [
    { id: 'resultados', label: 'Resultados', badge: resultados.length },
    { id: 'regras', label: 'Regras', badge: REGRAS_SEMENTE.length + regrasDaOrganizacao.length },
  ];
  const ordemDoEstado: Record<EstadoDaRegra, number> = { VIOLADA: 0, NAO_AVALIADA: 1, CONFORME: 2 };

  return (
    <div className="space-y-4" data-testid="tela-legislacao">
      <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700" data-testid="resumo-legislacao">
        <strong className={resumo.erros > 0 ? 'text-red-700' : 'text-gray-900'}>{resumo.violadas} violada(s)</strong>
        {resumo.violadas > 0 && <span className="text-slate-500"> ({resumo.erros} erro(s), {resumo.avisos} aviso(s))</span>} ·{' '}
        <strong className="text-emerald-700">{resumo.conformes} conforme(s)</strong> · <span className="text-slate-500">{resumo.naoAvaliadas} não avaliada(s)</span>
        <p className="mt-1 text-xs text-slate-500">
          Regra declarativa avaliada contra cada alvo do escopo (lote, edificação, pavimento, unidade, ambiente, porta) com o motor de fórmulas. "Não avaliada" é falta de dado (a zona não
          disse, a frente não está marcada, o ambiente não tem tipo) — nunca vira conforme em silêncio. Nada aqui trava o desenho.
        </p>
      </div>

      {aba === 'resultados' ? (
        <StandardTable<ResultadoDeRegra>
          columns={COLUNAS}
          storageKey="blueprint:legislacaoResultados"
          rows={visiveis}
          rowKey={(r) => `${r.regraId}:${r.alvoId ?? '-'}`}
          toolbarTop={<TabsBar tabs={abas} value={aba} onChange={(id) => setAba(id as Aba)} bare />}
          filters={
            <>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroDeEstado)} aria-label="Filtrar por estado" className="h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm">
                <option value="TODOS">Todos os estados</option>
                <option value="VIOLADA">Violadas</option>
                <option value="CONFORME">Conformes</option>
                <option value="NAO_AVALIADA">Não avaliadas</option>
              </select>
              <select value={fonte} onChange={(e) => setFonte(e.target.value)} aria-label="Filtrar por fonte" className="h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm">
                <option value="">Todas as fontes</option>
                {fontes.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </>
          }
          sortValue={(key, r) => {
            switch (key) {
              case 'estado':
                return ordemDoEstado[r.estado];
              case 'fonte':
                return r.regra.fonte;
              case 'regra':
                return r.regra.nome;
              case 'escopo':
                return ROTULO_DO_ESCOPO[r.regra.escopo];
              case 'alvo':
                return r.alvoRotulo;
              case 'pavimento':
                return nomeDoPavimento(r.levelId);
              case 'severidade':
                return r.regra.severidade;
              default:
                return null;
            }
          }}
          searchText={(r) => `${r.regra.fonte} ${r.regra.nome} ${r.alvoRotulo} ${r.valores}`}
          searchPlaceholder="Buscar regra, fonte ou alvo…"
          onRowClick={(r) => r.selecionarId && onSelecionar(r.selecionarId)}
          rowClassName={(r) => (r.selecionarId ? 'cursor-pointer' : '')}
          renderCell={(key, r) => {
            switch (key) {
              case 'estado':
                return <Estado estado={r.estado} severidade={r.regra.severidade} />;
              case 'fonte':
                return <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.regra.fonte}</span>;
              case 'regra':
                return (
                  <span className="text-sm text-gray-800" title={r.regra.descricao ?? r.regra.expressao}>
                    {r.regra.nome}
                    {r.regra.artigo ? <span className="text-slate-400"> · {r.regra.artigo}</span> : null}
                    {r.estado === 'NAO_AVALIADA' && r.motivo ? <span className="block text-xs text-slate-500">{r.motivo}</span> : null}
                  </span>
                );
              case 'escopo':
                return <span className="text-sm text-gray-600">{ROTULO_DO_ESCOPO[r.regra.escopo]}</span>;
              case 'alvo':
                return <span className={`text-sm ${r.selecionarId ? 'text-blue-700 underline-offset-2 hover:underline' : 'text-gray-700'}`}>{r.alvoRotulo}</span>;
              case 'pavimento':
                return <span className="text-sm text-gray-600">{nomeDoPavimento(r.levelId)}</span>;
              case 'valores':
                return <span className="font-mono text-xs text-gray-600">{r.valores || '—'}</span>;
              case 'severidade':
                return <span className="text-xs text-gray-600">{r.regra.severidade}</span>;
              default:
                return null;
            }
          }}
          empty={{ title: resultados.length === 0 ? 'Nada a verificar ainda' : 'Nenhum resultado com este filtro', subtitle: resultados.length === 0 ? 'Desenhe paredes que fechem ambientes, classifique-os (tipo NBR 5410) e aplique uma zona.' : undefined }}
        />
      ) : (
        <Regras
          abas={abas}
          aba={aba}
          onAba={setAba}
          regrasDaOrganizacao={regrasDaOrganizacao}
          onSalvarRegra={onSalvarRegra}
          onRemoverRegra={onRemoverRegra}
          carregando={carregando}
          avisoDePersistencia={avisoDePersistencia}
        />
      )}
    </div>
  );
}

function Regras({
  abas,
  aba,
  onAba,
  regrasDaOrganizacao,
  onSalvarRegra,
  onRemoverRegra,
  carregando,
  avisoDePersistencia,
}: {
  abas: TabsBarItem[];
  aba: Aba;
  onAba: (a: Aba) => void;
  regrasDaOrganizacao: Regra[];
  onSalvarRegra: Props['onSalvarRegra'];
  onRemoverRegra: Props['onRemoverRegra'];
  carregando: boolean;
  avisoDePersistencia: string | null;
}) {
  const [nova, setNova] = useState<Regra>({ id: '', nome: '', escopo: 'AMBIENTE', quando: '', expressao: '', severidade: 'ERRO', fonte: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const problemas = problemasDaRegra(nova).concat(nova.fonte.trim() ? [] : ['Diga a fonte (lei, decreto, norma).']);
  const todas: (Regra & { semente: boolean })[] = [...REGRAS_SEMENTE.map((r) => ({ ...r, semente: true })), ...regrasDaOrganizacao.map((r) => ({ ...r, semente: false }))];
  const salvar = async () => {
    if (!onSalvarRegra || problemas.length > 0) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvarRegra({ ...nova, id: `org-${Date.now().toString(36)}`, quando: nova.quando?.trim() || null, nome: nova.nome.trim(), fonte: nova.fonte.trim() });
      setNova({ id: '', nome: '', escopo: nova.escopo, quando: '', expressao: '', severidade: 'ERRO', fonte: nova.fonte });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };
  const campo = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm';
  return (
    <>
      <StandardTable<Regra & { semente: boolean }>
        columns={COLUNAS_REGRAS}
        storageKey="blueprint:legislacaoRegras"
        rows={todas}
        rowKey={(r) => r.id}
        toolbarTop={<TabsBar tabs={abas} value={aba} onChange={(id) => onAba(id as Aba)} bare />}
        searchText={(r) => `${r.fonte} ${r.nome} ${r.expressao}`}
        searchPlaceholder="Buscar regra…"
        loading={carregando}
        renderCell={(key, r) => {
          switch (key) {
            case 'fonte':
              return <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.fonte}</span>;
            case 'nome':
              return (
                <span className="text-sm text-gray-800">
                  {r.nome}
                  {r.descricao ? <span className="block text-xs text-slate-500">{r.descricao}</span> : null}
                </span>
              );
            case 'escopo':
              return <span className="text-sm text-gray-600">{ROTULO_DO_ESCOPO[r.escopo]}</span>;
            case 'quando':
              return <span className="font-mono text-xs text-gray-600">{r.quando || 'sempre'}</span>;
            case 'expressao':
              return <span className="font-mono text-xs text-gray-800">{r.expressao}</span>;
            case 'severidade':
              return <span className="text-xs text-gray-600">{r.severidade}</span>;
            default:
              return null;
          }
        }}
        actions={{
          render: (r) =>
            r.semente || !onRemoverRegra ? (
              <span className="text-[11px] text-slate-400">{r.semente ? 'semente' : ''}</span>
            ) : (
              <button type="button" onClick={() => void onRemoverRegra(r.id)} aria-label={`Remover a regra ${r.nome}`} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" />
              </button>
            ),
        }}
        empty={{ title: 'Sem regras' }}
      />

      <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-4" data-testid="nova-regra">
        <p className="text-sm font-semibold text-gray-900">Nova regra da organização</p>
        <p className="mt-0.5 text-xs text-slate-500">
          A expressão é verdadeira quando o alvo está conforme; "quando" diz a quais alvos a regra se aplica. Variáveis do escopo{' '}
          <strong>{ROTULO_DO_ESCOPO[nova.escopo]}</strong>: {VARIAVEIS_DO_ESCOPO[nova.escopo].map((v) => v.nome).join(', ')}.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-slate-600 md:col-span-2">
            Nome
            <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} aria-label="Nome da regra" placeholder="ex.: Dormitório: área mínima do município" className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Escopo
            <select value={nova.escopo} onChange={(e) => setNova({ ...nova, escopo: e.target.value as EscopoDaRegra })} aria-label="Escopo da regra" className={campo}>
              {ESCOPOS_DA_REGRA.map((e) => (
                <option key={e} value={e}>{ROTULO_DO_ESCOPO[e]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Severidade
            <select value={nova.severidade} onChange={(e) => setNova({ ...nova, severidade: e.target.value as SeveridadeDaRegra })} aria-label="Severidade da regra" className={campo}>
              <option value="ERRO">Erro</option>
              <option value="AVISO">Aviso</option>
              <option value="INFO">Info</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 md:col-span-2">
            Quando (opcional)
            <input value={nova.quando ?? ''} onChange={(e) => setNova({ ...nova, quando: e.target.value })} aria-label="Condição da regra" placeholder="ex.: tipo == 'SALA_DORMITORIO'" className={`${campo} font-mono`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 md:col-span-2">
            Conforme se
            <input value={nova.expressao} onChange={(e) => setNova({ ...nova, expressao: e.target.value })} aria-label="Expressão da regra" placeholder="ex.: area >= 9" className={`${campo} font-mono`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 md:col-span-2">
            Fonte (lei, decreto, norma)
            <input value={nova.fonte} onChange={(e) => setNova({ ...nova, fonte: e.target.value })} aria-label="Fonte da regra" placeholder="ex.: Código de Obras — Lei 9.725/2009 (Belo Horizonte)" className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 md:col-span-2">
            Artigo (opcional)
            <input value={nova.artigo ?? ''} onChange={(e) => setNova({ ...nova, artigo: e.target.value })} aria-label="Artigo da regra" className={campo} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void salvar()} disabled={!onSalvarRegra || problemas.length > 0 || salvando} className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white disabled:bg-slate-300">
            <Plus className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Adicionar regra'}
          </button>
          {problemas.length > 0 && (nova.nome || nova.expressao) && <span className="text-xs text-amber-700">{problemas.join(' ')}</span>}
          {!onSalvarRegra && <span className="text-xs text-slate-500">{avisoDePersistencia ?? 'Escolha uma organização no topo para gravar regras.'}</span>}
          {erro && <span className="text-xs text-red-700">{erro}</span>}
        </div>
      </div>
    </>
  );
}
