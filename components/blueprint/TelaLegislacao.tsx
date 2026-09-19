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
 *
 * Aba **Programa** (E4.3): a conferência do programa de necessidades × desenho
 * — por item (casados, faltam, área/largura/pé-direito/iluminação/ventilação/
 * fachada/percurso), por relação da matriz, circulação e os ambientes fora do
 * programa. As mesmas linhas também entram em Resultados com a fonte
 * "Programa de necessidades".
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
import type { ConferenciaDoPrograma } from '../../utils/blueprintConferenciaDoPrograma';
import { ROTULO_DO_TIPO_DE_RELACAO } from '../../utils/blueprintPrograma';
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
  /** CONFERÊNCIA DO PROGRAMA (E4.3); `null` = estudo sem programa. */
  conferencia?: ConferenciaDoPrograma | null;
  onAbrirPrograma?: () => void;
}

type Aba = 'resultados' | 'regras' | 'programa';
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

export default function TelaLegislacao({ resultados, regrasDaOrganizacao, nomeDoPavimento, onSelecionar, onSalvarRegra, onRemoverRegra, carregando = false, avisoDePersistencia = null, conferencia = null, onAbrirPrograma }: Props) {
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
    { id: 'programa', label: 'Programa', badge: conferencia ? conferencia.resumo.faltas + conferencia.resumo.avisos : undefined },
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
      ) : aba === 'programa' ? (
        <ConferenciaDoProgramaAba abas={abas} aba={aba} onAba={setAba} conferencia={conferencia} nomeDoPavimento={nomeDoPavimento} onSelecionar={onSelecionar} onAbrirPrograma={onAbrirPrograma} />
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

/** Aba Programa (E4.3): por item, por relação, circulação, fora do programa. */
function ConferenciaDoProgramaAba({
  abas,
  aba,
  onAba,
  conferencia,
  nomeDoPavimento,
  onSelecionar,
  onAbrirPrograma,
}: {
  abas: TabsBarItem[];
  aba: Aba;
  onAba: (a: Aba) => void;
  conferencia: ConferenciaDoPrograma | null;
  nomeDoPavimento: (levelId: string | null) => string;
  onSelecionar: (id: string) => void;
  onAbrirPrograma?: () => void;
}) {
  const tom = (estado: EstadoDaRegra, severidade: SeveridadeDaRegra) =>
    estado === 'CONFORME' ? 'text-emerald-700' : estado === 'NAO_AVALIADA' ? 'text-slate-500' : severidade === 'ERRO' ? 'text-red-700' : severidade === 'AVISO' ? 'text-amber-800' : 'text-blue-700';
  const palavra = (estado: EstadoDaRegra) => (estado === 'CONFORME' ? 'atende' : estado === 'NAO_AVALIADA' ? 'não avaliada' : 'falta');
  return (
    <div className="rounded-[6px] border border-gray-200 bg-white" data-testid="conferencia-do-programa">
      <div className="border-b border-gray-200 px-4 py-2">
        <TabsBar tabs={abas} value={aba} onChange={(id) => onAba(id as Aba)} bare />
      </div>
      {!conferencia ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          O estudo ainda não tem programa de necessidades.
          {onAbrirPrograma && (
            <>
              {' '}
              <button type="button" onClick={onAbrirPrograma} className="font-medium text-blue-700 hover:underline">
                Abrir a tela Programa
              </button>
              .
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5 px-5 py-4 text-sm">
          <p className="text-gray-700" data-testid="resumo-da-conferencia">
            <strong className="text-emerald-700">{conferencia.resumo.atendidos} atendido(s)</strong> · <strong className={conferencia.resumo.faltas ? 'text-red-700' : 'text-gray-900'}>{conferencia.resumo.faltas} falta(s)</strong> ·{' '}
            <span className="text-amber-800">{conferencia.resumo.avisos} aviso(s)</span> · <span className="text-slate-500">{conferencia.resumo.naoAvaliados} não avaliada(s)</span> · circulação{' '}
            <strong className={tom(conferencia.circulacao.estado, 'AVISO')}>{conferencia.circulacao.pct.toFixed(1).replace('.', ',')} %</strong> (máx. {conferencia.circulacao.maxPct} %)
          </p>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Por item</p>
            <table className="w-full text-xs" data-testid="conferencia-itens">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-2 font-medium">Item</th>
                  <th className="py-1 pr-2 text-right font-medium">Pedidos</th>
                  <th className="py-1 pr-2 font-medium">Encontrados no desenho</th>
                  <th className="py-1 pr-2 font-medium">Verificações</th>
                </tr>
              </thead>
              <tbody>
                {conferencia.itens.map((i) => (
                  <tr key={i.item.id} className="border-t border-slate-100 align-top" aria-label={`Item ${i.item.nome}`}>
                    <td className="py-1 pr-2 font-medium text-gray-800">{i.item.nome}</td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${i.faltam ? 'text-red-700' : 'text-gray-700'}`}>
                      {i.casados.length}/{i.item.quantidade}
                      {i.faltam ? <span className="block text-[10px]">faltam {i.faltam}</span> : null}
                    </td>
                    <td className="py-1 pr-2 text-gray-700">
                      {i.casados.length === 0 ? (
                        <span className="text-slate-400">nenhum ambiente com este uso</span>
                      ) : (
                        i.casados.map((c) => (
                          <button key={c.spaceId} type="button" onClick={() => c.etiquetaId && onSelecionar(c.etiquetaId)} className="mr-2 text-blue-700 underline-offset-2 hover:underline" title={nomeDoPavimento(c.levelId)}>
                            {c.rotulo} ({nomeDoPavimento(c.levelId)}) · {c.areaUtilM2.toFixed(2).replace('.', ',')} m²
                          </button>
                        ))
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      {i.casados.flatMap((c) =>
                        c.verificacoes
                          .filter((v) => v.estado !== 'CONFORME')
                          .map((v) => (
                            <span key={`${c.spaceId}-${v.chave}`} className={`mr-2 inline-block ${tom(v.estado, v.severidade)}`} title={v.motivo ?? `${v.valor} · exigido ${v.exigido}`}>
                              {i.casados.length > 1 ? `${c.rotulo}: ` : ''}
                              {v.rotulo.toLowerCase()} {palavra(v.estado)}
                              {v.estado === 'VIOLADA' ? ` (${v.valor}, exigido ${v.exigido})` : v.motivo ? ` — ${v.motivo}` : ''}
                            </span>
                          )),
                      )}
                      {i.casados.length > 0 && i.casados.every((c) => c.verificacoes.every((v) => v.estado === 'CONFORME')) && <span className="text-emerald-700">tudo atende</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {conferencia.relacoes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Matriz de proximidade</p>
              <table className="w-full text-xs" data-testid="conferencia-relacoes">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2 font-medium">Relação</th>
                    <th className="py-1 pr-2 font-medium">Pedido</th>
                    <th className="py-1 pr-2 font-medium">No desenho</th>
                    <th className="py-1 pr-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {conferencia.relacoes.map((r) => (
                    <tr key={`${r.relacao.a}|${r.relacao.b}`} className="border-t border-slate-100" aria-label={`Relação ${r.a.nome} × ${r.b.nome}`}>
                      <td className="py-1 pr-2 text-gray-800">
                        {r.a.nome} × {r.b.nome}
                      </td>
                      <td className="py-1 pr-2 text-gray-600">{r.relacao.tipo === 'DESEJAVEL' ? `peso ${r.relacao.peso}` : ROTULO_DO_TIPO_DE_RELACAO[r.relacao.tipo].toLowerCase()}</td>
                      <td className="py-1 pr-2 text-gray-700">{r.estado === 'NAO_AVALIADA' ? <span className="text-slate-500">{r.motivo}</span> : r.valor}</td>
                      <td className={`py-1 pr-2 font-medium ${tom(r.estado, r.severidade)}`}>{palavra(r.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {conferencia.foraDoPrograma.length > 0 && (
            <p className="text-xs text-slate-600" data-testid="fora-do-programa">
              <span className="font-medium uppercase tracking-wide text-slate-500">Fora do programa:</span>{' '}
              {conferencia.foraDoPrograma.map((f) => (
                <button key={f.spaceId} type="button" onClick={() => f.etiquetaId && onSelecionar(f.etiquetaId)} className="mr-2 text-blue-700 underline-offset-2 hover:underline" title={nomeDoPavimento(f.levelId)}>
                  {f.rotulo}
                  {f.uso ? ` (${f.uso})` : ''} · {nomeDoPavimento(f.levelId)}
                </button>
              ))}
            </p>
          )}
          <p className="text-xs text-slate-500">
            O item casa com o ambiente pelo uso que o nome sugere ("Dorm. 2" é dormitório) e, entre iguais, pelo nome. Obrigatória = porta direta; proibida = nem parede nem porta em comum; peso ≥ 7 = vizinhos; 4–6 = até 2 portas. Área útil pela face
            interna. Nada aqui trava o desenho.
          </p>
        </div>
      )}
    </div>
  );
}
