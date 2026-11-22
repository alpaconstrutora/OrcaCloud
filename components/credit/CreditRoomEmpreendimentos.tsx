import React from 'react';
import { FileX2, ImageOff } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { FilterPopover } from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import { formatMoney, formatDateBR } from '../ui/Format';
import PhotoGallery from '../investor/PhotoGallery';
import {
    CardHeader, PortalCard, PortalEmpty, PortalTabs, StatusPill, Td, Th, fmtDate, type PillTone,
} from '../portal/PortalKit';
import type { CreditRoomVersion } from '../../types/creditRoom';
import type { SnapshotContrato, SnapshotEmpreendimentoItem } from '../../utils/creditRoomSnapshot';
import { ROTULO_DO_OBJETIVO } from '../../utils/empreendimentoObjetivo';

/**
 * Aba "Empreendimentos e contratos" de uma VERSÃO congelada do Credit Room.
 *
 * Lê SÓ `version.snapshot.{empreendimentos,contratos}` — nunca o dado vivo.
 * O contrato aparece pelo `rotulo` mascarado ("Venda 03"): o nome do cliente
 * não existe no snapshot e esta tela não tem de onde tirá-lo.
 *
 * Compartilhado entre o módulo interno e o portal do credor (§24: um
 * componente, prop `accent`, mapa `ACCENTS` por extenso — o JIT do Tailwind
 * não enxerga classe montada em runtime). Hex só no mapa.
 *
 * "—" é dado ausente, nunca zero: contrato sem parcelas geradas tem valor,
 * saldo e vencido "não calculados" (a carteira os grava como 0), e aqui eles
 * aparecem como "—".
 */

type Accent = 'indigo' | 'portal';

const ACCENTS = {
    indigo: {
        corpo: 'text-sm', valor: 'text-gray-800', texto: 'text-gray-700', rotulo: 'text-gray-500', titulo: 'text-gray-700',
        linha: 'border-gray-100', divide: 'divide-gray-100', cab: 'bg-white border-gray-200',
        cartao: 'bg-white border-gray-100 shadow-sm rounded-[10px] hover:border-blue-200 focus-visible:ring-blue-500/40',
        capaVazia: 'bg-gray-100 text-gray-500',
        atencao: 'text-amber-700', negativo: 'text-red-700', bom: 'text-emerald-700', info: 'text-blue-700', mudo: 'text-gray-600',
        secao: 'text-sm font-semibold text-gray-700', nota: 'text-sm text-gray-500',
    },
    portal: {
        corpo: 'text-[13px]', valor: 'text-[#1F2430]', texto: 'text-[#4A505C]', rotulo: 'text-[#5F6573]', titulo: 'text-[#1F2430]',
        linha: 'border-[#ECECEF]', divide: 'divide-[#ECECEF]', cab: 'bg-white border-[#ECECEF]',
        cartao: 'bg-white border-[#ECECEF] rounded-xl hover:border-[#E1553C]/50 focus-visible:ring-[#E1553C]/40',
        capaVazia: 'bg-[#F2F2F4] text-[#5F6573]',
        atencao: 'text-[#8A6A16]', negativo: 'text-red-700', bom: 'text-[#1F7A3D]', info: 'text-[#2F5F98]', mudo: 'text-[#5F6573]',
        secao: 'text-[13px] font-semibold text-[#1F2430]', nota: 'text-[13px] text-[#5F6573]',
    },
} as const;

type Paleta = typeof ACCENTS[Accent];

const FRASE_SCHEMA_1 = {
    indigo: 'Versão congelada antes da capacidade de pagamento — congele uma nova.',
    portal: 'Versão congelada antes da capacidade de pagamento — peça à empresa que congele uma nova.',
} as const;

// ── Formatação (ausente → '—', nunca zero) ───────────────────────────────────

const money = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v));
const inteiro = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const round2 = (v: number) => Math.round(v * 100) / 100;

const localizacaoDe = (e: SnapshotEmpreendimentoItem): string => {
    const lugar = e.cidade && e.uf ? `${e.cidade}/${e.uf}` : (e.cidade ?? e.uf ?? '');
    const objetivo = e.objetivo ? (ROTULO_DO_OBJETIVO[e.objetivo as keyof typeof ROTULO_DO_OBJETIVO] ?? '') : '';
    return [lugar, objetivo].filter(Boolean).join(' · ') || '—';
};

// ── Contratos ────────────────────────────────────────────────────────────────

type TipoContrato = SnapshotContrato['tipo'];
type FiltroTipo = '' | TipoContrato;

const TIPO_PT: Record<TipoContrato, string> = { VENDA: 'Venda', LOCACAO: 'Locação' };

interface Situacao { texto: string; cor: string; tom: PillTone }
type CorDaSituacao = 'bom' | 'negativo' | 'info' | 'mudo';
const SITUACAO: Record<string, { texto: string; cor: CorDaSituacao; tom: PillTone }> = {
    EM_DIA: { texto: 'Em dia', cor: 'bom', tom: 'good' },
    EM_ATRASO: { texto: 'Em atraso', cor: 'negativo', tom: 'accent' },
    QUITADO: { texto: 'Quitado', cor: 'info', tom: 'info' },
    ENCERRADO: { texto: 'Encerrado', cor: 'mudo', tom: 'muted' },
};

function situacaoDe(c: SnapshotContrato, A: Paleta): Situacao {
    if (!c.tem_parcelas) {
        // Locação sem títulos gerados é normal: o aluguel vem do contrato. Texto neutro, não alerta.
        // ('muted', não 'neutral': no kit o tom `neutral` é o âmbar.)
        if (c.tipo === 'LOCACAO') return { texto: 'aluguel pelo contrato', cor: A.texto, tom: 'muted' };
        // Ramo defensivo: venda sem parcelas não nasce hoje, mas se nascer é furo de cadastro (âmbar).
        return { texto: 'sem parcelas geradas', cor: A.atencao, tom: 'neutral' };
    }
    const m = SITUACAO[c.status];
    if (m) return { texto: m.texto, cor: A[m.cor], tom: m.tom };
    return { texto: c.status ? c.status.toLowerCase().replace(/_/g, ' ') : '—', cor: A.mudo, tom: 'muted' };
}

interface LinhaContrato extends SnapshotContrato {
    /** Nome do empreendimento do snapshot; `null` = contrato sem empreendimento (ou fora do snapshot). */
    empNome: string | null;
}

const COLUNAS: StandardTableColumn[] = [
    { key: 'rotulo', label: 'Contrato', sortable: true, width: 130 },
    { key: 'tipo', label: 'Tipo', sortable: true, width: 100 },
    { key: 'empreendimento', label: 'Empreendimento', sortable: true, width: 200 },
    { key: 'unidade', label: 'Unidade', sortable: true, width: 100 },
    { key: 'valor', label: 'Valor do contrato', sortable: true, width: 150, align: 'right' },
    { key: 'parcela', label: 'Parcela/aluguel mensal', sortable: true, width: 170, align: 'right' },
    { key: 'saldo', label: 'Saldo a receber', sortable: true, width: 150, align: 'right' },
    { key: 'vencido', label: 'Vencido', sortable: true, width: 120, align: 'right' },
    { key: 'primeiro', label: '1º venc.', sortable: true, width: 110 },
    { key: 'ultimo', label: 'Último venc.', sortable: true, width: 110 },
    { key: 'situacao', label: 'Situação', sortable: true, width: 170 },
];

const COLUNAS_MONETARIAS = new Set(['valor', 'parcela', 'saldo', 'vencido']);
/** Totais que, sem nada calculado, aparecem como "—" (a coluna de parcela, em seleção mista, fica em branco). */
const TOTAIS_SEM_VALOR = new Set(['valor', 'saldo', 'vencido']);

/** Colunas da tabela do painel de um empreendimento (o empreendimento e as datas já estão no contexto). */
const COLUNAS_DO_PAINEL = ['rotulo', 'tipo', 'unidade', 'parcela', 'saldo', 'vencido', 'situacao'] as const;
const ROTULO_DA_COLUNA: Record<string, string> = Object.fromEntries(COLUNAS.map(c => [c.key, c.label]));

const dataCelula = (acc: Accent, v: string | null) => (acc === 'portal' ? fmtDate(v) : formatDateBR(v));

/** O que cada coluna mostra. O invólucro (tipografia do `<td>`) é de quem chama. */
function conteudo(key: string, c: LinhaContrato, acc: Accent, A: Paleta): React.ReactNode {
    switch (key) {
        case 'rotulo': return c.rotulo;
        case 'tipo': return TIPO_PT[c.tipo] ?? c.tipo;
        case 'empreendimento':
            return c.empNome
                ? <span className="block max-w-[220px] truncate" title={c.empNome}>{c.empNome}</span>
                : '—';
        case 'unidade': return c.unidade ?? '—';
        // Sem parcelas geradas a carteira grava 0: aqui é "não calculado", não zero.
        case 'valor': return c.tem_parcelas ? money(c.valor_contrato) : '—';
        // Parcela 0 = nada a vencer (venda quitada): não há parcela, não R$ 0,00.
        case 'parcela': return c.parcela_mensal > 0 ? money(c.parcela_mensal) : '—';
        case 'saldo': return c.tem_parcelas ? money(c.saldo_a_receber) : '—';
        case 'vencido':
            if (!c.tem_parcelas) return '—';
            return c.vencido > 0 ? <span className={A.negativo}>{money(c.vencido)}</span> : money(c.vencido);
        case 'primeiro': return dataCelula(acc, c.primeiro_vencimento);
        case 'ultimo': return dataCelula(acc, c.ultimo_vencimento);
        case 'situacao': {
            const s = situacaoDe(c, A);
            // App: texto colorido, sem pílula (§8). Portal: StatusPill do kit (§24).
            return acc === 'portal' ? <StatusPill tone={s.tom}>{s.texto}</StatusPill> : <span className={s.cor}>{s.texto}</span>;
        }
        default: return null;
    }
}

function ordenavel(key: string, c: LinhaContrato): string | number | null {
    switch (key) {
        case 'rotulo': return c.rotulo;
        case 'tipo': return TIPO_PT[c.tipo] ?? c.tipo;
        case 'empreendimento': return c.empNome;
        case 'unidade': return c.unidade;
        case 'valor': return c.tem_parcelas ? c.valor_contrato : null;
        case 'parcela': return c.parcela_mensal > 0 ? c.parcela_mensal : null;
        case 'saldo': return c.tem_parcelas ? c.saldo_a_receber : null;
        case 'vencido': return c.tem_parcelas ? c.vencido : null;
        case 'primeiro': return c.primeiro_vencimento;
        case 'ultimo': return c.ultimo_vencimento;
        case 'situacao': return situacaoDe(c, ACCENTS.indigo).texto;
        default: return null;
    }
}

/** Total por coluna: só soma o que foi calculado (sem parcelas não entra). `null` = sem total. */
function totalDa(key: string, linhas: LinhaContrato[]): number | null {
    const calculados = linhas.filter(c => c.tem_parcelas);
    // Nenhum contrato com parcelas na seleção: não há o que somar. Sem total ("—"), não R$ 0,00.
    if (calculados.length === 0 && (key === 'valor' || key === 'saldo' || key === 'vencido')) return null;
    switch (key) {
        case 'valor': return round2(calculados.reduce((a, c) => a + c.valor_contrato, 0));
        case 'saldo': return round2(calculados.reduce((a, c) => a + c.saldo_a_receber, 0));
        case 'vencido': return round2(calculados.reduce((a, c) => a + c.vencido, 0));
        // Parcela de venda (próxima a vencer) e aluguel não se somam: só há total quando tudo é locação.
        case 'parcela':
            return linhas.length > 0 && linhas.every(c => c.tipo === 'LOCACAO')
                ? round2(linhas.reduce((a, c) => a + c.parcela_mensal, 0))
                : null;
        default: return null;
    }
}

// ── Peças de cada vocabulário (app × portal) ─────────────────────────────────

const Secao: React.FC<{ acc: Accent; titulo: string; subtitulo?: string; semRecuo?: boolean; children: React.ReactNode }> = ({ acc, titulo, subtitulo, semRecuo, children }) =>
    acc === 'portal' ? (
        <PortalCard>
            <CardHeader title={titulo} subtitle={subtitulo} />
            <div className={semRecuo ? '' : 'px-5 pb-5'}>{children}</div>
        </PortalCard>
    ) : (
        <section className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>
                {subtitulo && <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>}
            </div>
            {children}
        </section>
    );

const Vazio: React.FC<{ acc: Accent; titulo: string; subtitulo: string }> = ({ acc, titulo, subtitulo }) =>
    acc === 'portal' ? (
        <PortalEmpty icon={<FileX2 className="w-9 h-9" />} title={titulo} subtitle={subtitulo} />
    ) : (
        <div className="text-center py-12">
            <FileX2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">{titulo}</h3>
            <p className="text-sm text-gray-500">{subtitulo}</p>
        </div>
    );

/** Capa 16:9; sem foto (ou foto que não carrega) vira um bloco cinza que diz isso. */
const Capa: React.FC<{ A: Paleta; e: SnapshotEmpreendimentoItem }> = ({ A, e }) => {
    const [falhou, setFalhou] = React.useState(false);
    if (!e.capa || falhou) {
        return (
            <span className={`flex aspect-[16/9] w-full flex-col items-center justify-center gap-1 ${A.capaVazia}`}>
                <ImageOff className="w-6 h-6" aria-hidden="true" />
                <span className="text-xs">sem foto cadastrada</span>
            </span>
        );
    }
    return (
        <img
            src={e.capa} alt="" loading="lazy" onError={() => setFalhou(true)}
            className="block aspect-[16/9] w-full object-cover"
        />
    );
};

const CartaoEmpreendimento: React.FC<{ acc: Accent; e: SnapshotEmpreendimentoItem; onAbrir: () => void }> = ({ acc, e, onAbrir }) => {
    const A = ACCENTS[acc];
    const unidades: [string, number | null | undefined][] = [
        ['Unidades', e.unidades_total], ['Vendidas', e.vendidas], ['Alugadas', e.alugadas], ['Disponíveis', e.disponiveis],
    ];
    const valores: [string, string][] = [
        ['VGV vendido', money(e.vgv_vendido)], ['VGV disponível', money(e.vgv_disponivel)], ['Renda do mês', money(e.renda_mensal)],
    ];
    return (
        <button
            type="button" onClick={onAbrir} aria-haspopup="dialog" title="Ver fotos e contratos"
            className={`block w-full overflow-hidden border text-left transition-colors outline-none focus-visible:ring-2 ${A.cartao}`}
        >
            <Capa A={A} e={e} />
            <span className="block space-y-3 p-4">
                <span className="block min-w-0">
                    <span className={`block truncate ${A.corpo} font-semibold ${A.titulo}`}>{e.nome}</span>
                    <span className={`block truncate text-xs ${A.rotulo}`}>{localizacaoDe(e)}</span>
                </span>
                <span className="grid grid-cols-4 gap-2">
                    {unidades.map(([k, v]) => (
                        <span key={k} className="block min-w-0">
                            <span className={`block truncate text-xs ${A.rotulo}`}>{k}</span>
                            <span className={`block ${A.corpo} font-medium tabular-nums ${A.valor}`}>{inteiro(v)}</span>
                        </span>
                    ))}
                </span>
                <span className="block space-y-1">
                    {valores.map(([k, v]) => (
                        <span key={k} className="flex items-baseline justify-between gap-3">
                            <span className={`${A.corpo} ${A.rotulo}`}>{k}</span>
                            <span className={`${A.corpo} font-medium tabular-nums ${A.valor}`}>{v}</span>
                        </span>
                    ))}
                </span>
            </span>
        </button>
    );
};

/** Tabela compacta dos contratos de UM empreendimento, dentro do painel (§6.9: `px-3`, não `px-6`). */
const TabelaDoPainel: React.FC<{ acc: Accent; linhas: LinhaContrato[] }> = ({ acc, linhas }) => {
    const A = ACCENTS[acc];
    return (
        <div className={`overflow-x-auto rounded-[10px] border ${A.linha}`}>
            <table className="w-full text-left border-collapse" aria-label="Contratos do empreendimento">
                <thead>
                    <tr className={`border-b ${A.cab}`}>
                        {COLUNAS_DO_PAINEL.map(k => {
                            const dir = COLUNAS_MONETARIAS.has(k) ? 'text-right' : 'text-left';
                            return acc === 'portal' ? (
                                <Th key={k} className={dir}>{ROTULO_DA_COLUNA[k]}</Th>
                            ) : (
                                <th key={k} className={`px-3 py-2 border-r border-gray-100 last:border-r-0 text-xs font-semibold text-gray-700 whitespace-nowrap ${dir}`}>{ROTULO_DA_COLUNA[k]}</th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className={`divide-y ${A.divide}`}>
                    {linhas.map(c => (
                        <tr key={c.rotulo}>
                            {COLUNAS_DO_PAINEL.map(k => {
                                const dir = COLUNAS_MONETARIAS.has(k) ? 'text-right' : '';
                                return acc === 'portal' ? (
                                    <Td key={k} className={`tabular-nums whitespace-nowrap ${dir}`}>{conteudo(k, c, acc, A)}</Td>
                                ) : (
                                    <td key={k} className={`px-3 py-2.5 border-r border-gray-100 last:border-r-0 text-sm tabular-nums whitespace-nowrap ${COLUNAS_MONETARIAS.has(k) ? 'font-medium text-gray-800' : 'font-normal text-gray-700'} ${dir}`}>{conteudo(k, c, acc, A)}</td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ── A aba ────────────────────────────────────────────────────────────────────

interface Props {
    version: CreditRoomVersion;
    accent?: Accent;
}

const CreditRoomEmpreendimentos: React.FC<Props> = ({ version, accent = 'indigo' }) => {
    const A = ACCENTS[accent];
    const s = version.snapshot;
    const empreendimentos = s.empreendimentos ?? null;
    const contratos = s.contratos ?? null;

    const [tipo, setTipo] = usePersistedState<FiltroTipo>('creditRoom:contratos:tipo', '');
    const [aberto, setAberto] = React.useState<string | null>(null);

    const todos = React.useMemo<LinhaContrato[]>(() => {
        const porId = new Map((empreendimentos ?? []).map(e => [e.id, e.nome]));
        return (contratos ?? []).map(c => ({ ...c, empNome: (c.empreendimento_id && porId.get(c.empreendimento_id)) || null }));
    }, [empreendimentos, contratos]);

    const nVendas = React.useMemo(() => todos.filter(c => c.tipo === 'VENDA').length, [todos]);
    const nLocacoes = todos.length - nVendas;
    // Um valor guardado de outra versão do app que não existe mais não pode esvaziar a tabela em silêncio.
    const tipoAtivo: FiltroTipo = tipo === 'VENDA' || tipo === 'LOCACAO' ? tipo : '';
    // `rows` estável (useMemo): o StandardTable reage à identidade do array.
    const linhas = React.useMemo(() => (tipoAtivo ? todos.filter(c => c.tipo === tipoAtivo) : todos), [todos, tipoAtivo]);

    const selecionado = empreendimentos?.find(e => e.id === aberto) ?? null;
    const doSelecionado = React.useMemo(
        () => (selecionado ? todos.filter(c => c.empreendimento_id === selecionado.id) : []),
        [todos, selecionado],
    );

    // ── Versão sem os dois blocos (schema 1): estado vazio que diz o que fazer ──
    if (empreendimentos == null && contratos == null) {
        return accent === 'portal' ? (
            <PortalCard>
                <Vazio acc={accent} titulo="Esta versão não traz empreendimentos nem contratos" subtitulo={FRASE_SCHEMA_1.portal} />
            </PortalCard>
        ) : (
            <div className="bg-white rounded-[10px] shadow-sm border border-gray-100">
                <Vazio acc={accent} titulo="Esta versão não traz empreendimentos nem contratos" subtitulo={FRASE_SCHEMA_1.indigo} />
            </div>
        );
    }

    const fotos = (selecionado?.fotos ?? []).map((f, i) => ({ id: String(i), url: f.url, description: f.legenda }));
    const fechar = () => setAberto(null);

    return (
        <div className="space-y-6">
            {/* 1. Empreendimentos — o clique abre fotos e contratos */}
            <Secao
                acc={accent} titulo="Empreendimentos"
                subtitulo={empreendimentos ? 'Posição congelada nesta versão. Clique em um empreendimento para ver as fotos e os contratos dele.' : undefined}
            >
                {empreendimentos == null ? (
                    <p className={`${A.corpo} ${A.rotulo}`}>Esta versão não traz os empreendimentos. {FRASE_SCHEMA_1[accent]}</p>
                ) : empreendimentos.length === 0 ? (
                    <p className={`${A.corpo} ${A.rotulo}`}>Nenhum empreendimento na carteira desta versão.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {empreendimentos.map(e => (
                            <CartaoEmpreendimento key={e.id} acc={accent} e={e} onAbrir={() => setAberto(e.id)} />
                        ))}
                    </div>
                )}
            </Secao>

            {/* 2. Contratos — só o rótulo mascarado, nunca o nome do cliente */}
            <Secao
                acc={accent} titulo="Contratos" semRecuo
                subtitulo={contratos ? 'Cada contrato aparece só pelo rótulo: o nome do cliente não faz parte desta versão.' : undefined}
            >
                {contratos == null ? (
                    <div className={accent === 'portal' ? 'px-5 pb-5' : ''}>
                        <p className={`${A.corpo} ${A.rotulo}`}>Esta versão não traz os contratos. {FRASE_SCHEMA_1[accent]}</p>
                    </div>
                ) : contratos.length === 0 ? (
                    <div className={accent === 'portal' ? 'px-5 pb-5' : ''}>
                        <p className={`${A.corpo} ${A.rotulo}`}>Nenhum contrato na carteira desta versão.</p>
                    </div>
                ) : accent === 'portal' ? (
                    <>
                        <PortalTabs
                            active={tipoAtivo || 'todos'}
                            onChange={id => setTipo(id === 'VENDA' || id === 'LOCACAO' ? id : '')}
                            tabs={[
                                { id: 'todos', label: 'Todos', count: todos.length },
                                { id: 'VENDA', label: 'Vendas', count: nVendas },
                                { id: 'LOCACAO', label: 'Locações', count: nLocacoes },
                            ]}
                        />
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1100px]" aria-label="Contratos da carteira">
                                <thead>
                                    <tr className={`border-b ${A.cab}`}>
                                        {COLUNAS.map(c => <Th key={c.key} className={COLUNAS_MONETARIAS.has(c.key) ? 'text-right' : ''}>{c.label}</Th>)}
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${A.divide}`}>
                                    {linhas.map(c => (
                                        <tr key={c.rotulo}>
                                            {COLUNAS.map(col => (
                                                <Td key={col.key} className={`tabular-nums whitespace-nowrap ${COLUNAS_MONETARIAS.has(col.key) ? 'text-right' : ''}`}>
                                                    {conteudo(col.key, c, accent, A)}
                                                </Td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className={`border-t-2 ${A.linha}`}>
                                        {COLUNAS.map(col => {
                                            const total = totalDa(col.key, linhas);
                                            return (
                                                <Td key={col.key} className={`tabular-nums whitespace-nowrap font-medium ${A.valor} ${COLUNAS_MONETARIAS.has(col.key) ? 'text-right' : ''}`}>
                                                    {col.key === 'rotulo' ? 'Total' : total != null ? money(total) : TOTAIS_SEM_VALOR.has(col.key) ? '—' : ''}
                                                </Td>
                                            );
                                        })}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                ) : (
                    <StandardTable<LinhaContrato>
                        storageKey="creditRoom:contratos"
                        columns={COLUNAS}
                        rows={linhas}
                        rowKey={c => c.rotulo}
                        searchText={c => `${c.rotulo} ${c.unidade ?? ''} ${c.empNome ?? ''}`}
                        searchPlaceholder="Buscar por contrato, unidade ou empreendimento..."
                        filters={(
                            <FilterPopover<FiltroTipo>
                                label="Tipo" value={tipoAtivo} onChange={setTipo}
                                options={[
                                    { value: '', label: 'Todos' },
                                    { value: 'VENDA', label: `Vendas (${nVendas})` },
                                    { value: 'LOCACAO', label: `Locações (${nLocacoes})` },
                                ]}
                            />
                        )}
                        sortValue={ordenavel}
                        renderCell={(key, c) => (
                            <span className={`block text-sm tabular-nums ${COLUNAS_MONETARIAS.has(key) ? 'font-medium text-gray-800' : 'font-normal text-gray-700'}`}>
                                {conteudo(key, c, accent, A)}
                            </span>
                        )}
                        totaisPorColuna={(key, ls) => {
                            if (key === 'rotulo') return <span className="text-xs font-semibold text-gray-500">Total</span>;
                            const t = totalDa(key, ls);
                            if (t == null) return TOTAIS_SEM_VALOR.has(key) ? <span className="block text-sm font-medium text-gray-800">—</span> : null;
                            return <span className="block text-sm font-medium tabular-nums text-gray-800">{money(t)}</span>;
                        }}
                        empty={{ title: 'Nenhum contrato encontrado', subtitle: 'Tente ajustar a busca ou o filtro de tipo.' }}
                    />
                )}
            </Secao>

            {/* Painel do empreendimento (REGRA #4: painel lateral, não modal) */}
            <Sheet open={selecionado != null} onClose={fechar} size="2xl">
                <SheetHeader onClose={fechar}>
                    <SheetTitle>{selecionado?.nome ?? 'Empreendimento'}</SheetTitle>
                    <SheetDescription>{selecionado ? localizacaoDe(selecionado) : ''}</SheetDescription>
                </SheetHeader>
                <SheetPanel className="px-6 py-5 space-y-6">
                    <section aria-labelledby="emp-fotos" className="space-y-3">
                        <h3 id="emp-fotos" className={A.secao}>Fotos</h3>
                        {fotos.length > 0
                            ? <PhotoGallery photos={fotos} />
                            : <p className={A.nota}>Este empreendimento não tem fotos cadastradas.</p>}
                    </section>
                    <section aria-labelledby="emp-contratos" className="space-y-3">
                        <h3 id="emp-contratos" className={A.secao}>Contratos deste empreendimento</h3>
                        {doSelecionado.length > 0
                            ? <TabelaDoPainel acc={accent} linhas={doSelecionado} />
                            : <p className={A.nota}>Nenhum contrato desta versão está ligado a este empreendimento.</p>}
                    </section>
                </SheetPanel>
            </Sheet>
        </div>
    );
};

export default CreditRoomEmpreendimentos;
