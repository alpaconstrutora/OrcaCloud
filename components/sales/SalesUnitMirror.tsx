import React from 'react';
import type { SalesAnalysisScope, SaleMirrorCell, SaleUnitStatus } from '../../lib/salesAnalysis';
import { rotuloDaTorre, rotuloDoAndar } from '../../lib/rentalUnitMirror';
import { Torres, RuaDePredios, DestaqueRadios, type MirrorPintura } from '../analysis/UnitMirrorGrid';
import { moneyBRL, compactAxis } from '../analysis/chartKit';

/**
 * Espelho das unidades de Venda de Ativos › Análise — a mesma peça de
 * Locações (guia §28.6), com a pintura da venda. Plano:
 * docs/planos/2026-10-27-vendas-aba-analise.md.
 *
 * A cor segue a leitura:
 * - Comercial: o STATUS (vendida azul, reservada âmbar, disponível verde,
 *   permutada cinza) — as cores do donut "Composição das unidades"; embaixo do
 *   rótulo, o valor da venda, a etapa da negociação ou o preço de tabela;
 * - Financeiro: quanto da venda já entrou (recebido ÷ valor), em degraus de um
 *   azul só; estoque é tracejado, e o ponto vermelho é parcela vencida.
 *
 * Tudo sai de `scope.units`, o MESMO balde dos indicadores e gráficos.
 */

export type SalesMirrorDestaque = 'nenhum' | 'negociacao' | 'disponivel' | 'atraso' | 'atraso90';
type Leitura = 'comercial' | 'financeiro';

const casa = (c: SaleMirrorCell, d: SalesMirrorDestaque): boolean => {
    switch (d) {
        case 'negociacao': return c.status === 'reserved';
        case 'disponivel': return c.status === 'available';
        case 'atraso': return c.overdue > 0;
        case 'atraso90': return c.overdue90 > 0;
        default: return true;
    }
};

const DESTAQUES: { id: Exclude<SalesMirrorDestaque, 'nenhum'>; label: string; vazio: string }[] = [
    { id: 'negociacao', label: 'Em negociação', vazio: 'Nenhuma unidade reservada ou em negociação' },
    { id: 'disponivel', label: 'Disponíveis', vazio: 'Nenhuma unidade disponível' },
    { id: 'atraso', label: 'Com atraso', vazio: 'Nenhuma unidade com parcela vencida' },
    { id: 'atraso90', label: 'Atraso > 90 dias', vazio: 'Nenhuma unidade com atraso acima de 90 dias' },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

// ── Cores (classes por extenso — o JIT do Tailwind não enxerga classe montada)

const COR_STATUS: Record<SaleUnitStatus, string> = {
    sold: 'bg-blue-50 border-blue-200 text-blue-900',
    reserved: 'bg-amber-50 border-amber-200 text-amber-900',
    available: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    exchanged: 'bg-slate-100 border-slate-300 text-slate-700',
    other: 'bg-white border-gray-200 text-gray-600',
};
/** Mesma cor do donut, para a legenda e a rua de prédios. */
const COR_SOLIDA: Record<SaleUnitStatus, string> = {
    sold: 'bg-blue-600', reserved: 'bg-amber-600', available: 'bg-emerald-600', exchanged: 'bg-slate-400', other: 'bg-slate-300',
};
export const ROTULO_STATUS_VENDA: Record<SaleUnitStatus, string> = {
    sold: 'Vendida', reserved: 'Em negociação', available: 'Disponível', exchanged: 'Permutada', other: 'Outro status',
};

/** Financeiro: recebido ÷ valor da venda, 5 degraus de um azul só. */
const DEGRAUS_RECEBIDO: { ate: number; cls: string; solida: string; legenda: string }[] = [
    { ate: 0.1, cls: 'bg-blue-50 border-blue-100 text-blue-900', solida: 'bg-blue-100', legenda: '< 10%' },
    { ate: 0.3, cls: 'bg-blue-100 border-blue-200 text-blue-900', solida: 'bg-blue-200', legenda: '10–30%' },
    { ate: 0.6, cls: 'bg-blue-200 border-blue-300 text-blue-950', solida: 'bg-blue-300', legenda: '30–60%' },
    { ate: 0.9, cls: 'bg-blue-400 border-blue-500 text-white', solida: 'bg-blue-400', legenda: '60–90%' },
    { ate: Infinity, cls: 'bg-blue-600 border-blue-700 text-white', solida: 'bg-blue-600', legenda: '≥ 90%' },
];
const degrauDe = (r: number) => DEGRAUS_RECEBIDO.find(d => r < d.ate) ?? DEGRAUS_RECEBIDO[DEGRAUS_RECEBIDO.length - 1];

/** Vendida ou em negociação já tem negócio; o resto é estoque. */
const emEstoque = (c: SaleMirrorCell) => c.status === 'available' || c.status === 'other';

const descricao = (c: SaleMirrorCell): string => {
    const partes = [c.name, `${rotuloDaTorre(c.block)}, ${rotuloDoAndar(c.floor).longo}`, ROTULO_STATUS_VENDA[c.status]];
    if (c.stageLabel && c.status !== 'available') partes.push(`etapa ${c.stageLabel}`);
    if (c.dealValue > 0) partes.push(`${c.status === 'sold' ? 'vendida por' : 'proposta de'} ${moneyBRL(c.dealValue)}`);
    else if (c.tablePrice > 0) partes.push(`tabela ${moneyBRL(c.tablePrice)}`);
    if (c.receivedRatio != null) partes.push(`${pct(c.receivedRatio)} recebido`);
    if (c.overdue > 0) partes.push(`em atraso ${moneyBRL(c.overdue)}${c.overdue90 > 0 ? `, ${moneyBRL(c.overdue90)} há mais de 90 dias` : ''}`);
    return partes.join(' · ');
};

const Detalhe: React.FC<{ cell: SaleMirrorCell }> = ({ cell: c }) => {
    const m2 = c.dealValue > 0 && c.privateArea ? c.dealValue / c.privateArea : null;
    const variacao = c.dealValue > 0 && c.tablePrice > 0 ? c.dealValue / c.tablePrice - 1 : null;
    return (
        <>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-gray-500">Status</dt>
                <dd className="text-gray-800 text-right">
                    {ROTULO_STATUS_VENDA[c.status]}{c.stageLabel && c.status !== 'available' ? ` · ${c.stageLabel}` : ''}
                </dd>
                <dt className="text-gray-500">{c.status === 'sold' ? 'Venda' : 'Proposta'}</dt>
                <dd className="text-gray-800 text-right tabular-nums">
                    {c.dealValue > 0 ? moneyBRL(c.dealValue) : '—'}{m2 != null && <span className="text-gray-500"> · {moneyBRL(m2)}/m²</span>}
                </dd>
                <dt className="text-gray-500">Tabela</dt>
                <dd className="text-gray-800 text-right tabular-nums">
                    {c.tablePrice > 0 ? moneyBRL(c.tablePrice) : '—'}
                    {variacao != null && <span className="text-gray-500"> · {variacao >= 0 ? '+' : '−'}{Math.abs(variacao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
                </dd>
                {c.receivedRatio != null && (
                    <>
                        <dt className="text-gray-500">Recebido</dt>
                        <dd className="text-gray-800 text-right tabular-nums">{pct(c.receivedRatio)} do valor</dd>
                    </>
                )}
                {c.overdue > 0 && (
                    <>
                        <dt className="text-red-700">Em atraso</dt>
                        <dd className="text-red-700 text-right tabular-nums">
                            {moneyBRL(c.overdue)}{c.overdue90 > 0 && <span> · {moneyBRL(c.overdue90)} &gt; 90 d</span>}
                        </dd>
                    </>
                )}
            </dl>
            {c.dealUnits > 1 && (
                <p className="mt-2 text-gray-500">
                    Negociação de {c.dealUnits} unidades — o valor é a parte desta{c.overdue > 0 ? '; o atraso é do contrato inteiro.' : '.'}
                </p>
            )}
        </>
    );
};

const PINTURA_COMERCIAL: MirrorPintura<SaleMirrorCell> = {
    classe: c => COR_STATUS[c.status],
    linha: c => {
        if (c.status === 'sold') return c.dealValue > 0 ? compactAxis(c.dealValue) : 'vendida';
        if (c.status === 'reserved') return (c.stageLabel ?? 'reservada').toLowerCase();
        if (c.status === 'available') return c.tablePrice > 0 ? compactAxis(c.tablePrice) : 'sem preço';
        return ROTULO_STATUS_VENDA[c.status].split(' ')[0].toLowerCase();
    },
    descricao,
    solida: c => COR_SOLIDA[c.status],
    Detalhe,
};

const PINTURA_FINANCEIRO: MirrorPintura<SaleMirrorCell> = {
    classe: c => {
        if (emEstoque(c)) return 'bg-white border-dashed border-gray-300 text-gray-500';
        if (c.receivedRatio == null) return 'bg-white border-gray-300 text-gray-600';
        return degrauDe(c.receivedRatio).cls;
    },
    linha: c => {
        if (emEstoque(c)) return 'estoque';
        if (c.status === 'exchanged') return 'permuta';
        if (c.receivedRatio == null) return c.status === 'reserved' ? 'negociação' : 'sem contrato';
        return pct(c.receivedRatio);
    },
    descricao,
    solida: c => {
        if (emEstoque(c)) return 'bg-white border border-dashed border-gray-300';
        if (c.receivedRatio == null) return 'bg-white border border-gray-300';
        return degrauDe(c.receivedRatio).solida;
    },
    ponto: c => (c.overdue > 0 ? (c.overdue90 > 0 ? 'grande' : 'pequeno') : null),
    Detalhe,
};

interface Props {
    scope: SalesAnalysisScope;
    rows: SalesAnalysisScope[];
    isAll: boolean;
    leitura: Leitura;
    destaque: SalesMirrorDestaque;
    onDestaque: (d: SalesMirrorDestaque) => void;
    onSelectEmpreendimento: (id: string) => void;
    onOpenUnit: (cell: SaleMirrorCell) => void;
}

const SalesUnitMirror: React.FC<Props> = ({ scope, rows, isAll, leitura, destaque, onDestaque, onSelectEmpreendimento, onOpenUnit }) => {
    const cells = scope.units;
    const contagem = (d: SalesMirrorDestaque) => cells.filter(c => casa(c, d)).length;
    // Destaque que ficou sem nenhuma unidade (trocou o recorte) esmaeceria a
    // tela inteira: volta a mostrar todas.
    const vazio = destaque !== 'nenhum' && contagem(destaque) === 0;
    React.useEffect(() => { if (vazio) onDestaque('nenhum'); }, [vazio]); // eslint-disable-line react-hooks/exhaustive-deps

    const pintura = leitura === 'comercial' ? PINTURA_COMERCIAL : PINTURA_FINANCEIRO;
    const destaca = destaque === 'nenhum' ? null : (c: SaleMirrorCell) => casa(c, destaque);

    if (cells.length === 0) return null;

    return (
        <section aria-labelledby="espelho-venda-titulo" className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 mb-3">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                    <h3 id="espelho-venda-titulo" className="text-sm font-semibold text-gray-700">
                        {isAll ? 'Espelho da carteira' : 'Espelho das unidades'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {leitura === 'comercial'
                            ? 'Cada célula é uma unidade: a cor é o status; embaixo, o valor da venda, a etapa da negociação ou o preço de tabela.'
                            : 'Cada célula é uma unidade vendida: quanto mais escura, mais do valor já foi recebido. Tracejada = estoque; ponto vermelho = parcela vencida.'}
                        {isAll && ' Clique num prédio para recortar a aba.'}
                    </p>
                </div>
                <DestaqueRadios opcoes={DESTAQUES} contagem={contagem} ativo={destaque} nenhum="nenhum" onChange={onDestaque} />
            </div>

            <Legenda leitura={leitura} />

            {isAll
                ? <RuaDePredios predios={rows.map(predioDe)} pintura={pintura} destaca={destaca} onSelect={onSelectEmpreendimento} />
                : <Torres key={scope.empreendimentoId} cells={cells} pintura={pintura} destaca={destaca} onOpenUnit={onOpenUnit} chave={scope.empreendimentoId} />}
        </section>
    );
};

const Legenda: React.FC<{ leitura: Leitura }> = ({ leitura }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
        {leitura === 'comercial' ? (
            (['sold', 'reserved', 'available', 'exchanged'] as const).map(s => (
                <span key={s} className="inline-flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-[2px] ${COR_SOLIDA[s]}`} />{ROTULO_STATUS_VENDA[s]}
                </span>
            ))
        ) : (
            <>
                <span>Recebido ÷ valor da venda:</span>
                {DEGRAUS_RECEBIDO.map(d => (
                    <span key={d.legenda} className="inline-flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-[2px] ${d.solida}`} />{d.legenda}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[3px] border border-gray-300 bg-white" />sem contrato
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[3px] border border-dashed border-gray-400 bg-white" />estoque
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-600" />parcela vencida
                </span>
            </>
        )}
    </div>
);

/** Um prédio da rua por empreendimento, com o resumo que o leitor de tela ouve. */
const predioDe = (r: SalesAnalysisScope) => {
    const comAtraso = r.units.filter(c => c.overdue > 0).length;
    return {
        id: r.empreendimentoId,
        name: r.name,
        cells: r.units,
        resumo: `${r.name}: ${r.soldCount} de ${r.sellableCount} unidades vendidas${comAtraso > 0 ? `, ${comAtraso} com atraso` : ''}. Recortar a aba neste empreendimento.`,
    };
};

export default SalesUnitMirror;
