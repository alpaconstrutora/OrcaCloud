import React from 'react';
import type { RentalAnalysisScope } from '../../lib/rentalByEmpreendimento';
import {
    rotuloDaTorre,
    rotuloDoAndar,
    type UnitMirrorCell,
} from '../../lib/rentalUnitMirror';
import { Torres, RuaDePredios, DestaqueRadios, type MirrorPintura } from '../analysis/UnitMirrorGrid';

/**
 * Espelho das unidades — a carteira desenhada como prédio (overdrive da aba
 * Análise, 26/10/2026; plano docs/planos/2026-10-26-locacoes-analise-espelho-vivo.md).
 *
 * Com um empreendimento recortado: torres lado a lado, andares de cima para
 * baixo, uma célula por unidade. Em "Todos": uma rua de prédios, um por
 * empreendimento, e o clique no prédio recorta a aba.
 *
 * O que a cor diz depende da leitura (guia §28.6):
 * - Operação: o STATUS (as mesmas cores do donut "Composição das unidades"),
 *   com os dias de vaga escritos na célula, contorno âmbar na vaga há mais de
 *   90 dias e um ponto vermelho no atraso;
 * - Investimento: quanto o contrato rende contra o valor base (rampa de um
 *   azul só); vaga é tracejada — é receita que não entra.
 *
 * Tudo sai de `scope.units`, o MESMO balde dos indicadores e gráficos.
 */

export type MirrorDestaque = 'nenhum' | 'atraso' | 'atraso90' | 'vaga90' | 'vence90';

/** Vaga "envelhecida" — o mesmo corte do indicador "Estoque envelhecido". */
const DIAS_ESTOQUE_ENVELHECIDO = 90;

const casa = (c: UnitMirrorCell, d: MirrorDestaque): boolean => {
    switch (d) {
        case 'atraso': return c.overdue > 0;
        case 'atraso90': return c.overdue90 > 0;
        case 'vaga90': return (c.vacantDays ?? 0) > DIAS_ESTOQUE_ENVELHECIDO;
        case 'vence90': return c.expiresWithin90;
        default: return true;
    }
};

const DESTAQUES: { id: Exclude<MirrorDestaque, 'nenhum'>; label: string; vazio: string }[] = [
    { id: 'atraso', label: 'Com atraso', vazio: 'Nenhuma unidade com parcela vencida' },
    { id: 'atraso90', label: 'Atraso > 90 dias', vazio: 'Nenhuma unidade com atraso acima de 90 dias' },
    { id: 'vaga90', label: 'Vagas há > 90 dias', vazio: 'Nenhuma unidade vaga há mais de 90 dias' },
    { id: 'vence90', label: 'Vencem em 90 dias', vazio: 'Nenhum contrato vence nos próximos 90 dias' },
];

const moneyBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ── Cores (classes por extenso — o JIT do Tailwind não enxerga classe montada)

/** Operação: famílias do donut (alugada roxo, disponível verde, reservada âmbar). */
const COR_STATUS: Record<UnitMirrorCell['status'], string> = {
    rented: 'bg-purple-50 border-purple-200 text-purple-900',
    available: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    reserved: 'bg-amber-50 border-amber-200 text-amber-900',
    maintenance: 'bg-slate-100 border-slate-300 text-slate-700',
    other: 'bg-white border-gray-200 text-gray-600',
};
const ROTULO_STATUS: Record<UnitMirrorCell['status'], string> = {
    rented: 'Alugada', available: 'Disponível', reserved: 'Reservada', maintenance: 'Em manutenção', other: 'Outro status',
};
/** Mesma cor do donut, para o quadradinho da legenda e da rua de prédios. */
const COR_SOLIDA: Record<UnitMirrorCell['status'], string> = {
    rented: 'bg-purple-600', available: 'bg-emerald-600', reserved: 'bg-amber-600', maintenance: 'bg-slate-400', other: 'bg-slate-300',
};

/** Investimento: contratado ÷ valor base em 5 degraus de um azul só. */
const DEGRAUS_RENDA: { ate: number; cls: string; solida: string; legenda: string }[] = [
    { ate: 0.4, cls: 'bg-blue-50 border-blue-100 text-blue-900', solida: 'bg-blue-100', legenda: '< 40%' },
    { ate: 0.7, cls: 'bg-blue-100 border-blue-200 text-blue-900', solida: 'bg-blue-200', legenda: '40–70%' },
    { ate: 0.9, cls: 'bg-blue-200 border-blue-300 text-blue-950', solida: 'bg-blue-300', legenda: '70–90%' },
    { ate: 1, cls: 'bg-blue-400 border-blue-500 text-white', solida: 'bg-blue-400', legenda: '90–100%' },
    { ate: Infinity, cls: 'bg-blue-600 border-blue-700 text-white', solida: 'bg-blue-600', legenda: '≥ 100%' },
];
const degrauDe = (c: UnitMirrorCell) => {
    const r = c.base > 0 ? c.contracted / c.base : null;
    return r == null ? null : DEGRAUS_RENDA.find(d => r < d.ate) ?? DEGRAUS_RENDA[DEGRAUS_RENDA.length - 1];
};

const classeDaCelula = (c: UnitMirrorCell, leitura: 'operacao' | 'investimento'): string => {
    if (leitura === 'operacao') return COR_STATUS[c.status];
    if (c.contracted <= 0) return 'bg-white border-dashed border-gray-300 text-gray-500';
    return degrauDe(c)?.cls ?? 'bg-white border-gray-200 text-gray-600';
};

/** O que vai embaixo do rótulo da célula — a leitura em uma palavra. */
const linhaDaCelula = (c: UnitMirrorCell, leitura: 'operacao' | 'investimento'): string => {
    if (leitura === 'investimento') {
        if (c.contracted <= 0) return c.status === 'available' ? 'vaga' : ROTULO_STATUS[c.status].split(' ')[0].toLowerCase();
        const r = c.base > 0 ? c.contracted / c.base : null;
        return r == null ? 'sem base' : pct(r);
    }
    if (c.status === 'available') return c.vacantDays != null ? `${c.vacantDays} d` : 'vaga';
    if (c.status === 'rented') return c.contracted > 0 ? compacto(c.contracted) : 'alugada';
    return ROTULO_STATUS[c.status].split(' ')[0].toLowerCase();
};
const compacto = (v: number) =>
    v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v));

/** Frase completa da unidade — o nome acessível da célula e o miolo do detalhe. */
const descricao = (c: UnitMirrorCell): string => {
    const partes = [c.name, `${rotuloDaTorre(c.block)}, ${rotuloDoAndar(c.floor).longo}`, ROTULO_STATUS[c.status]];
    if (c.status === 'available' && c.vacantDays != null) partes.push(`vaga há ${c.vacantDays} dias${c.vacancyApproximate ? ' (estimado)' : ''}`);
    if (c.contracted > 0) partes.push(`aluguel ${moneyBRL(c.contracted)}`);
    if (c.overdue > 0) partes.push(`em atraso ${moneyBRL(c.overdue)}${c.overdue90 > 0 ? `, ${moneyBRL(c.overdue90)} há mais de 90 dias` : ''}`);
    if (c.expiresWithin90) partes.push('contrato vence em 90 dias');
    return partes.join(' · ');
};

// ── Peças ────────────────────────────────────────────────────────────────────

interface Props {
    scope: RentalAnalysisScope;
    /** Linhas por empreendimento — a rua de prédios de "Todos". */
    rows: RentalAnalysisScope[];
    isAll: boolean;
    leitura: 'operacao' | 'investimento';
    destaque: MirrorDestaque;
    onDestaque: (d: MirrorDestaque) => void;
    onSelectEmpreendimento: (id: string) => void;
    /** Enter / clique numa unidade: abre a torre dela no inventário. */
    onOpenUnit: (cell: UnitMirrorCell) => void;
}

const RentalUnitMirror: React.FC<Props> = ({ scope, rows, isAll, leitura, destaque, onDestaque, onSelectEmpreendimento, onOpenUnit }) => {
    const cells = scope.units;
    const contagem = (d: MirrorDestaque) => cells.filter(c => casa(c, d)).length;
    // Destaque que ficou sem nenhuma unidade (trocou o recorte) esmaeceria a
    // tela inteira: volta a mostrar todas.
    const vazio = destaque !== 'nenhum' && contagem(destaque) === 0;
    React.useEffect(() => { if (vazio) onDestaque('nenhum'); }, [vazio]); // eslint-disable-line react-hooks/exhaustive-deps

    const pintura = leitura === 'operacao' ? PINTURA_OPERACAO : PINTURA_INVESTIMENTO;
    const destaca = destaque === 'nenhum' ? null : (c: UnitMirrorCell) => casa(c, destaque);

    if (cells.length === 0) return null;

    return (
        <section aria-labelledby="espelho-titulo" className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-4 mb-3">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                    <h3 id="espelho-titulo" className="text-sm font-semibold text-gray-700">
                        {isAll ? 'Espelho da carteira' : 'Espelho das unidades'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {leitura === 'operacao'
                            ? 'Cada célula é uma unidade: a cor é o status, a vaga mostra há quantos dias, o ponto vermelho é atraso.'
                            : 'Cada célula é uma unidade: quanto mais escura, mais perto do valor base o contrato está. Tracejada = vaga.'}
                        {isAll && ' Clique num prédio para recortar a aba.'}
                    </p>
                </div>
                {/* Destacar: uma escolha por vez; o resto esmaece. Desligado com
                    o motivo quando não há nenhuma unidade no caso. */}
                <DestaqueRadios
                    opcoes={DESTAQUES}
                    contagem={contagem}
                    ativo={destaque}
                    nenhum="nenhum"
                    onChange={onDestaque}
                />
            </div>

            <Legenda leitura={leitura} />

            {isAll
                ? <RuaDePredios predios={rows.map(predioDe)} pintura={pintura} destaca={destaca} onSelect={onSelectEmpreendimento} />
                : <Torres key={scope.empreendimentoId} cells={cells} pintura={pintura} destaca={destaca} onOpenUnit={onOpenUnit} chave={scope.empreendimentoId} />}
        </section>
    );
};

const Legenda: React.FC<{ leitura: 'operacao' | 'investimento' }> = ({ leitura }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
        {leitura === 'operacao' ? (
            <>
                {(['rented', 'available', 'reserved', 'maintenance'] as const).map(s => (
                    <span key={s} className="inline-flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-[2px] ${COR_SOLIDA[s]}`} />{ROTULO_STATUS[s]}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[3px] border-2 border-amber-500 bg-emerald-50" />vaga há &gt; {DIAS_ESTOQUE_ENVELHECIDO} dias
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-600" />parcela vencida
                </span>
            </>
        ) : (
            <>
                <span>Contratado ÷ valor base:</span>
                {DEGRAUS_RENDA.map(d => (
                    <span key={d.legenda} className="inline-flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-[2px] ${d.solida}`} />{d.legenda}
                    </span>
                ))}
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[3px] border border-dashed border-gray-400 bg-white" />vaga
                </span>
            </>
        )}
    </div>
);

/** Miolo do cartão de detalhe da unidade — nome, torre e o "Abrir a torre"
 *  vêm da grade comum. */
const Detalhe: React.FC<{ cell: UnitMirrorCell }> = ({ cell: c }) => {
    const m2 = c.contracted > 0 && c.privateArea ? c.contracted / c.privateArea : null;
    return (
        <>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-gray-500">Status</dt>
                <dd className="text-gray-800 text-right">
                    {ROTULO_STATUS[c.status]}
                    {c.status === 'available' && c.vacantDays != null && ` há ${c.vacantDays} dias${c.vacancyApproximate ? ' (estim.)' : ''}`}
                </dd>
                <dt className="text-gray-500">Aluguel</dt>
                <dd className="text-gray-800 text-right tabular-nums">{c.contracted > 0 ? moneyBRL(c.contracted) : '—'}{m2 != null && <span className="text-gray-500"> · {moneyBRL(m2)}/m²</span>}</dd>
                <dt className="text-gray-500">Valor base</dt>
                <dd className="text-gray-800 text-right tabular-nums">{c.base > 0 ? moneyBRL(c.base) : '—'}</dd>
                {c.overdue > 0 && (
                    <>
                        <dt className="text-red-700">Em atraso</dt>
                        <dd className="text-red-700 text-right tabular-nums">
                            {moneyBRL(c.overdue)}{c.overdue90 > 0 && <span> · {moneyBRL(c.overdue90)} &gt; 90 d</span>}
                        </dd>
                    </>
                )}
                {c.expiresWithin90 && (
                    <>
                        <dt className="text-amber-700">Contrato</dt>
                        <dd className="text-amber-700 text-right">vence em 90 dias</dd>
                    </>
                )}
            </dl>
            {c.contractUnits > 1 && (
                <p className="mt-2 text-gray-500">
                    Contrato de {c.contractUnits} unidades{c.overdue > 0 ? ' — o atraso é do contrato inteiro.' : '.'}
                </p>
            )}
        </>
    );
};

/** Operação: status nas famílias do donut, vaga envelhecida com anel âmbar,
 *  ponto vermelho no atraso (maior acima de 90 dias). */
const PINTURA_OPERACAO: MirrorPintura<UnitMirrorCell> = {
    classe: c => classeDaCelula(c, 'operacao'),
    linha: c => linhaDaCelula(c, 'operacao'),
    descricao,
    solida: c => COR_SOLIDA[c.status],
    ponto: c => (c.overdue > 0 ? (c.overdue90 > 0 ? 'grande' : 'pequeno') : null),
    anel: c => (c.vacantDays ?? 0) > DIAS_ESTOQUE_ENVELHECIDO,
    Detalhe,
};

/** Investimento: contratado ÷ valor base em degraus de um azul só; vaga tracejada. */
const PINTURA_INVESTIMENTO: MirrorPintura<UnitMirrorCell> = {
    classe: c => classeDaCelula(c, 'investimento'),
    linha: c => linhaDaCelula(c, 'investimento'),
    descricao,
    solida: c => (c.contracted <= 0 ? 'bg-white border border-dashed border-gray-300' : (degrauDe(c)?.solida ?? 'bg-gray-200')),
    Detalhe,
};

/** Um prédio da rua por empreendimento, com o resumo que o leitor de tela ouve. */
const predioDe = (r: RentalAnalysisScope) => {
    const comAtraso = r.units.filter(c => c.overdue > 0).length;
    return {
        id: r.empreendimentoId,
        name: r.name,
        cells: r.units,
        resumo: `${r.name}: ${r.rentedCount} de ${r.unitsCount} unidades alugadas${comAtraso > 0 ? `, ${comAtraso} com atraso` : ''}. Recortar a aba neste empreendimento.`,
    };
};

export default RentalUnitMirror;
