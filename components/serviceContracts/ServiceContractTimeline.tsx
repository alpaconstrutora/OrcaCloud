import React from 'react';
import type { ServiceContractsScope, ServiceTimelineRow, ServiceContractSituation } from '../../lib/serviceContractAnalysis';
import { SERVICE_SITUATION_COLORS, SERVICE_SITUATION_LABELS } from '../../lib/serviceContractAnalysis';
import { moneyBRL, plural, Legend } from '../analysis/chartKit';

/**
 * Linha do tempo de vigência — o lugar que o espelho de unidades ocupa em Venda
 * de Ativos › Análise (decisão do usuário, 13/11/2026: contrato de serviço não
 * tem unidade para pintar). Uma barra por contrato, do início ao fim, pintada
 * pela situação, com a parte MEDIDA preenchida por dentro; a linha de "hoje"
 * atravessa todas. Clique (ou Enter) abre o contrato.
 *
 * Lê `scope.timeline` — o MESMO balde dos indicadores (lib/serviceContractAnalysis.ts).
 */

export type ServiceTimelineDestaque = 'nenhum' | 'vence90' | 'vencida' | 'atraso';

/** Quantas linhas aparecem antes do "Mostrar todos". */
const LINHAS_INICIAIS = 10;
/** Janela máxima para cada lado de hoje — contrato de 10 anos não achata o resto. */
const MESES_MAX_CADA_LADO = 36;
const MESES_MIN_JANELA = 12;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const dataBR = (iso: string | null) => (iso ? parse(iso).toLocaleDateString('pt-BR') : null);
const addMeses = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

const casa = (r: ServiceTimelineRow, d: ServiceTimelineDestaque): boolean =>
    d === 'nenhum' || (d === 'vence90' && r.expiring) || (d === 'vencida' && r.expired) || (d === 'atraso' && r.overdue > 0);

interface Janela { inicio: Date; fim: Date; meses: Date[] }

/** Do mês do primeiro início ao mês do último fim, com hoje dentro, cortada a
 *  ±36 meses de hoje e com pelo menos 12 meses. */
const janelaDe = (rows: ServiceTimelineRow[], hoje: Date): Janela => {
    const mesHoje = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const datas = rows.flatMap(r => [r.start, r.end]).filter((d): d is string => !!d).map(parse);
    let inicio = new Date(Math.min(mesHoje.getTime(), ...datas.map(d => d.getTime())));
    let fim = new Date(Math.max(mesHoje.getTime(), ...datas.map(d => d.getTime())));
    inicio = new Date(Math.max(inicio.getTime(), addMeses(mesHoje, -MESES_MAX_CADA_LADO).getTime()));
    fim = new Date(Math.min(fim.getTime(), addMeses(mesHoje, MESES_MAX_CADA_LADO).getTime()));
    inicio = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    let fimMes = addMeses(new Date(fim.getFullYear(), fim.getMonth(), 1), 1);
    const span = (fimMes.getFullYear() - inicio.getFullYear()) * 12 + fimMes.getMonth() - inicio.getMonth();
    if (span < MESES_MIN_JANELA) fimMes = addMeses(inicio, MESES_MIN_JANELA);
    const meses: Date[] = [];
    for (let m = inicio; m < fimMes; m = addMeses(m, 1)) meses.push(m);
    return { inicio, fim: fimMes, meses };
};

const pct = (d: Date, j: Janela) => {
    const total = j.fim.getTime() - j.inicio.getTime();
    return Math.min(100, Math.max(0, ((d.getTime() - j.inicio.getTime()) / total) * 100));
};

const descricao = (r: ServiceTimelineRow): string => {
    const partes = [
        `Contrato ${r.number || 'sem número'} — ${r.title}`,
        r.clientName,
        r.status,
        moneyBRL(r.value),
        r.start || r.end ? `de ${dataBR(r.start) ?? 'sem início'} a ${dataBR(r.end) ?? 'sem fim'}` : 'sem datas de vigência',
    ];
    if (r.measuredRate != null) partes.push(`${Math.round(r.measuredRate * 100)}% medido`);
    if (r.expiring) partes.push('vence em até 90 dias');
    if (r.expired) partes.push('vigência vencida');
    if (r.overdue > 0) partes.push(`${moneyBRL(r.overdue)} em parcelas vencidas`);
    return partes.join(', ');
};

interface Props {
    scope: ServiceContractsScope;
    destaque: ServiceTimelineDestaque;
    onDestaque: (d: ServiceTimelineDestaque) => void;
    onOpenContract: (id: string) => void;
    now?: Date;
}

const ServiceContractTimeline: React.FC<Props> = ({ scope, destaque, onDestaque, onOpenContract, now }) => {
    const [todos, setTodos] = React.useState(false);
    const hoje = React.useMemo(() => {
        const d = now ?? new Date();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }, [now]);
    const rows = scope.timeline;
    const janela = React.useMemo(() => janelaDe(rows, hoje), [rows, hoje]);
    const hojePct = pct(hoje, janela);
    // Até 18 meses, um rótulo por mês; acima, um por trimestre.
    const passo = janela.meses.length <= 18 ? 1 : 3;
    const visiveis = todos ? rows : rows.slice(0, LINHAS_INICIAIS);

    const contagem: Record<Exclude<ServiceTimelineDestaque, 'nenhum'>, number> = {
        vence90: rows.filter(r => r.expiring).length,
        vencida: rows.filter(r => r.expired).length,
        atraso: rows.filter(r => r.overdue > 0).length,
    };
    const opcoes: { id: ServiceTimelineDestaque; label: string; n?: number; motivo?: string }[] = [
        { id: 'nenhum', label: 'Nenhum' },
        { id: 'vence90', label: 'Vencem em 90 dias', n: contagem.vence90, motivo: 'Nenhum contrato vigente vence nos próximos 90 dias' },
        { id: 'vencida', label: 'Vigência vencida', n: contagem.vencida, motivo: 'Nenhum contrato vigente com a vigência vencida' },
        { id: 'atraso', label: 'Parcela vencida', n: contagem.atraso, motivo: 'Nenhum contrato com parcela vencida' },
    ];

    const situacoes = (Object.keys(SERVICE_SITUATION_LABELS) as ServiceContractSituation[])
        .filter(s => scope.bySituation[s].count > 0);

    return (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 mb-3">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-700">Linha do tempo dos contratos</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Vigência de cada contrato, do início ao fim, pela situação; a parte cheia da barra é o que já foi medido.
                        Clique para abrir o contrato.
                    </p>
                </div>
                {rows.length > 0 && (
                    <div role="radiogroup" aria-label="Destacar contratos" className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        {opcoes.map(o => {
                            const desligado = o.n === 0;
                            return (
                                <button
                                    key={o.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={destaque === o.id}
                                    disabled={desligado}
                                    title={desligado ? o.motivo : undefined}
                                    onClick={() => onDestaque(o.id)}
                                    className={`px-2.5 h-8 rounded-[6px] text-xs font-medium whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${destaque === o.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'}`}
                                >
                                    {o.label}{o.n != null && <span className="ml-1 text-gray-500 tabular-nums">{o.n}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {rows.length === 0 ? (
                <div className="flex items-center justify-center min-h-[120px] text-sm text-gray-500 text-center px-4">
                    Nenhum contrato de serviço neste recorte.
                </div>
            ) : (
                <>
                    <div className="mt-3">
                        <Legend items={[
                            ...situacoes.map(s => ({ label: `${SERVICE_SITUATION_LABELS[s]} (${scope.bySituation[s].count})`, color: SERVICE_SITUATION_COLORS[s] })),
                        ]} />
                        <p className="text-xs text-gray-500 -mt-1 mb-2">
                            Contorno âmbar: vence em até 90 dias · contorno vermelho: vigência vencida · ponto vermelho: parcela vencida.
                        </p>
                    </div>

                    <div className="grid grid-cols-[8rem_1fr] sm:grid-cols-[15rem_1fr] gap-x-3">
                        {/* Régua dos meses */}
                        <div />
                        <div className="relative h-5 border-b border-gray-100" aria-hidden="true">
                            {janela.meses.map((m, i) => i % passo === 0 && (
                                <span
                                    key={m.getTime()}
                                    className={`absolute top-0 text-[11px] text-gray-500 -translate-x-1/2 whitespace-nowrap ${(i / passo) % 2 === 1 ? 'hidden sm:inline' : ''}`}
                                    style={{ left: `${pct(m, janela)}%` }}
                                >
                                    {MESES_CURTOS[m.getMonth()]}{m.getMonth() === 0 || i === 0 ? `/${String(m.getFullYear()).slice(2)}` : ''}
                                </span>
                            ))}
                        </div>

                        {visiveis.map(r => {
                            const cor = SERVICE_SITUATION_COLORS[r.situation];
                            const ini = r.start ? parse(r.start) : r.end ? janela.inicio : null;
                            const fim = r.end ? parse(r.end) : r.start ? janela.fim : null;
                            const left = ini ? pct(ini, janela) : 0;
                            const width = ini && fim ? Math.max(0.8, pct(fim, janela) - left) : 0;
                            const anel = r.expired ? 'ring-2 ring-red-600' : r.expiring ? 'ring-2 ring-amber-500' : '';
                            const apagado = !casa(r, destaque);
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => onOpenContract(r.id)}
                                    aria-label={`${descricao(r)}. Abrir o contrato.`}
                                    title={descricao(r)}
                                    className={`col-span-2 grid grid-cols-subgrid items-center py-1.5 text-left rounded-[6px] hover:bg-blue-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-opacity ${apagado ? 'opacity-25 saturate-0' : ''}`}
                                >
                                    <span className="min-w-0 flex items-center gap-1.5 pl-1">
                                        {r.overdue > 0 && <span aria-hidden="true" className="w-2 h-2 rounded-full bg-red-600 shrink-0" />}
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm text-gray-700">
                                                {r.number ? <span className="text-gray-500 tabular-nums">{r.number} · </span> : null}{r.title}
                                            </span>
                                            <span className="block truncate text-xs text-gray-500">{r.clientName} · {r.status}</span>
                                        </span>
                                    </span>
                                    <span className="relative h-6" aria-hidden="true">
                                        <span className="absolute inset-y-0 w-px bg-gray-300" style={{ left: `${hojePct}%` }} />
                                        {ini && fim ? (
                                            <span
                                                className={`absolute top-1 bottom-1 rounded-[4px] overflow-hidden border ${anel}`}
                                                // Tracejada quando falta início ou fim: a barra vai até a borda da janela.
                                                style={{
                                                    left: `${left}%`, width: `${width}%`,
                                                    backgroundColor: `${cor}26`, borderColor: cor,
                                                    borderStyle: !r.start || !r.end ? 'dashed' : 'solid',
                                                }}
                                            >
                                                {r.measuredRate != null && r.measuredRate > 0 && (
                                                    <span className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, r.measuredRate * 100)}%`, backgroundColor: cor }} />
                                                )}
                                            </span>
                                        ) : (
                                            <span className="absolute inset-0 flex items-center text-xs text-gray-500 pl-1">sem datas de vigência</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}

                        <div />
                        <div className="relative h-4" aria-hidden="true">
                            <span className="absolute top-0 text-[11px] text-gray-500 -translate-x-1/2" style={{ left: `${hojePct}%` }}>hoje</span>
                        </div>
                    </div>

                    {rows.length > LINHAS_INICIAIS && (
                        <button
                            type="button"
                            onClick={() => setTodos(!todos)}
                            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                            {todos ? 'Mostrar menos' : `Mostrar todos os ${plural(rows.length, 'contrato', 'contratos')}`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};

export default ServiceContractTimeline;
