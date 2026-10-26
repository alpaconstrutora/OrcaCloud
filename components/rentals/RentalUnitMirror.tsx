import React from 'react';
import { Building2, ArrowRight } from 'lucide-react';
import type { RentalAnalysisScope } from '../../lib/rentalByEmpreendimento';
import {
    mirrorTowers,
    rotuloDaTorre,
    rotuloDoAndar,
    type UnitMirrorCell,
} from '../../lib/rentalUnitMirror';

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

// ── Movimento: o prédio sobe andar por andar ─────────────────────────────────

const reduzMovimento = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** Anima os andares de baixo para cima (o térreo primeiro). Um só momento,
 *  ao trocar de recorte; trocar de leitura só repinta. Sem a API ou com
 *  "reduzir movimento", a tela já está no estado final — nada a desfazer. */
const useSubida = (container: React.RefObject<HTMLElement | null>, chave: string) => {
    React.useLayoutEffect(() => {
        const el = container.current;
        if (!el || reduzMovimento() || typeof el.animate !== 'function') return;
        const andares = [...el.querySelectorAll<HTMLElement>('[data-andar]')];
        const total = andares.length;
        const passo = Math.min(45, 420 / Math.max(1, total));
        const anims = andares.map(a => a.animate(
            [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 320, delay: Number(a.dataset.andar) * passo, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        ));
        return () => anims.forEach(x => x.cancel());
    }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
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
                <div role="radiogroup" aria-label="Destacar unidades" className="flex flex-wrap items-center gap-1.5">
                    {DESTAQUES.map(d => {
                        const n = contagem(d.id);
                        const ativo = destaque === d.id;
                        return (
                            <button
                                key={d.id}
                                type="button"
                                role="radio"
                                aria-checked={ativo}
                                disabled={n === 0}
                                title={n === 0 ? d.vazio : ativo ? 'Clique de novo para mostrar todas' : undefined}
                                onClick={() => onDestaque(ativo ? 'nenhum' : d.id)}
                                className={`h-8 px-2.5 rounded-[6px] border text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed ${
                                    ativo ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                                }`}
                            >
                                {d.label} <span className={`tabular-nums ${ativo ? 'text-gray-300' : 'text-gray-500'}`}>{n}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <Legenda leitura={leitura} />

            {isAll
                ? <RuaDePredios rows={rows} leitura={leitura} destaque={destaque} onSelect={onSelectEmpreendimento} />
                : <Torres key={scope.empreendimentoId} cells={cells} leitura={leitura} destaque={destaque} onOpenUnit={onOpenUnit} chave={scope.empreendimentoId} />}
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

/** Torres do empreendimento recortado — células grandes, navegáveis por seta. */
const Torres: React.FC<{
    cells: UnitMirrorCell[];
    leitura: 'operacao' | 'investimento';
    destaque: MirrorDestaque;
    onOpenUnit: (c: UnitMirrorCell) => void;
    chave: string;
}> = ({ cells, leitura, destaque, onOpenUnit, chave }) => {
    const torres = React.useMemo(() => mirrorTowers(cells), [cells]);
    const ref = React.useRef<HTMLDivElement>(null);
    useSubida(ref, chave);

    // Navegação por seta (roving tabindex): Tab entra UMA vez no espelho; as
    // setas andam pela unidade vizinha, e para cima/baixo vão ao andar de
    // cima/baixo na posição mais próxima. Home/End: início/fim do andar.
    const [ativa, setAtiva] = React.useState<string>(() => torres[0]?.floors[0]?.cells[0]?.id ?? '');
    const [detalhe, setDetalhe] = React.useState<{ cell: UnitMirrorCell; x: number; y: number; abaixo: boolean } | null>(null);
    const botoes = React.useRef(new Map<string, HTMLButtonElement>());

    const posicao = React.useMemo(() => {
        const m = new Map<string, { t: number; f: number; i: number }>();
        torres.forEach((t, ti) => t.floors.forEach((f, fi) => f.cells.forEach((c, ci) => m.set(c.id, { t: ti, f: fi, i: ci }))));
        return m;
    }, [torres]);

    const mover = (id: string, tecla: string) => {
        const p = posicao.get(id);
        if (!p) return;
        const t = torres[p.t];
        let alvo: UnitMirrorCell | undefined;
        if (tecla === 'ArrowRight') alvo = t.floors[p.f].cells[p.i + 1] ?? torres[p.t + 1]?.floors[0]?.cells[0];
        if (tecla === 'ArrowLeft') alvo = t.floors[p.f].cells[p.i - 1] ?? (() => { const ant = torres[p.t - 1]; const f = ant?.floors[0]; return f?.cells[f.cells.length - 1]; })();
        if (tecla === 'ArrowUp' || tecla === 'ArrowDown') {
            const f = t.floors[p.f + (tecla === 'ArrowUp' ? -1 : 1)];
            if (f) alvo = f.cells[Math.min(p.i, f.cells.length - 1)];
        }
        if (tecla === 'Home') alvo = t.floors[p.f].cells[0];
        if (tecla === 'End') alvo = t.floors[p.f].cells[t.floors[p.f].cells.length - 1];
        if (alvo) { setAtiva(alvo.id); botoes.current.get(alvo.id)?.focus(); }
    };

    const mostrar = (cell: UnitMirrorCell, el: HTMLElement) => {
        const caixa = ref.current?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (!caixa) return;
        // O cartão tem ~210px de altura e 256 de largura. Sem espaço acima da
        // célula DENTRO do espelho (o andar de cima fica colado na legenda),
        // ele abre embaixo; e nunca passa das bordas laterais do espelho.
        const MEIA_LARGURA = 128;
        const abaixo = r.top - caixa.top < 210;
        const centro = r.left - caixa.left + r.width / 2;
        const x = Math.min(Math.max(centro, MEIA_LARGURA), Math.max(MEIA_LARGURA, caixa.width - MEIA_LARGURA));
        setDetalhe({ cell, x, y: abaixo ? r.bottom - caixa.top : r.top - caixa.top, abaixo });
    };

    const temDestaque = destaque !== 'nenhum';

    return (
        <div ref={ref} className="relative mt-4" onMouseLeave={() => setDetalhe(null)}>
            <div className="flex gap-8 overflow-x-auto pb-1">
                {torres.map(t => {
                    const nAndares = t.floors.length;
                    return (
                        <div key={t.block} role="group" aria-label={`${rotuloDaTorre(t.block)}, ${t.floors.reduce((a, f) => a + f.cells.length, 0)} unidades`} className="shrink-0">
                            <p className="text-xs font-semibold text-gray-600 mb-2">{rotuloDaTorre(t.block)}</p>
                            <div className="flex flex-col gap-1.5">
                                {t.floors.map((f, fi) => {
                                    const andar = rotuloDoAndar(f.floor);
                                    return (
                                        // data-andar = posição a partir do TÉRREO: o de baixo sobe primeiro.
                                        <div key={String(f.floor)} data-andar={nAndares - 1 - fi} className="flex items-center gap-2">
                                            <span className="w-7 shrink-0 text-right text-xs text-gray-500 tabular-nums" title={andar.longo}>{andar.curto}</span>
                                            <div className="flex gap-1.5">
                                                {f.cells.map(c => {
                                                    const apagada = temDestaque && !casa(c, destaque);
                                                    const envelhecida = leitura === 'operacao' && (c.vacantDays ?? 0) > DIAS_ESTOQUE_ENVELHECIDO;
                                                    return (
                                                        <button
                                                            key={c.id}
                                                            ref={el => { if (el) botoes.current.set(c.id, el); else botoes.current.delete(c.id); }}
                                                            type="button"
                                                            tabIndex={c.id === ativa ? 0 : -1}
                                                            aria-label={descricao(c)}
                                                            onClick={() => onOpenUnit(c)}
                                                            onFocus={e => { setAtiva(c.id); mostrar(c, e.currentTarget); }}
                                                            onBlur={() => setDetalhe(null)}
                                                            onMouseEnter={e => mostrar(c, e.currentTarget)}
                                                            onKeyDown={e => {
                                                                if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) { e.preventDefault(); mover(c.id, e.key); }
                                                                if (e.key === 'Escape') setDetalhe(null);
                                                            }}
                                                            className={`relative w-16 h-11 rounded-[6px] border flex flex-col items-center justify-center leading-tight
                                                                transition-[opacity,transform,filter] duration-200 ease-out
                                                                focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-600 hover:-translate-y-px
                                                                ${classeDaCelula(c, leitura)}
                                                                ${envelhecida ? 'ring-2 ring-amber-500 ring-inset' : ''}
                                                                ${apagada ? 'opacity-25 saturate-0' : ''}
                                                                ${temDestaque && !apagada ? 'shadow-md -translate-y-0.5' : ''}`}
                                                        >
                                                            <span className="text-[13px] font-medium tabular-nums max-w-full truncate px-1">{c.label}</span>
                                                            <span className="text-[11px] opacity-80 tabular-nums">{linhaDaCelula(c, leitura)}</span>
                                                            {leitura === 'operacao' && c.overdue > 0 && (
                                                                <span
                                                                    aria-hidden="true"
                                                                    className={`absolute -top-1 -right-1 rounded-full bg-red-600 ring-2 ring-white ${c.overdue90 > 0 ? 'w-3 h-3' : 'w-2 h-2'}`}
                                                                />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {detalhe && <Detalhe {...detalhe} />}
        </div>
    );
};

/** Cartão de detalhe da unidade — no mouse E no foco do teclado. Repete o que
 *  o nome acessível já diz, por isso `aria-hidden`. */
const Detalhe: React.FC<{ cell: UnitMirrorCell; x: number; y: number; abaixo: boolean }> = ({ cell: c, x, y, abaixo }) => {
    const andar = rotuloDoAndar(c.floor);
    const m2 = c.contracted > 0 && c.privateArea ? c.contracted / c.privateArea : null;
    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute z-20 w-64 -translate-x-1/2 rounded-[10px] border border-gray-200 bg-white p-3 shadow-lg text-xs ${abaixo ? 'mt-2' : '-translate-y-full -mt-2'}`}
            style={{ left: x, top: y }}
        >
            <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
            <p className="text-gray-500">{rotuloDaTorre(c.block)} · {andar.longo}</p>
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
            <p className="mt-2 inline-flex items-center gap-1 text-blue-700 font-medium">Abrir a torre no inventário <ArrowRight className="w-3 h-3" /></p>
        </div>
    );
};

/** "Todos": um prédio por empreendimento, células sem rótulo, lado a lado,
 *  alinhados pelo chão. O prédio inteiro é um botão que recorta a aba. */
const RuaDePredios: React.FC<{
    rows: RentalAnalysisScope[];
    leitura: 'operacao' | 'investimento';
    destaque: MirrorDestaque;
    onSelect: (id: string) => void;
}> = ({ rows, leitura, destaque, onSelect }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    useSubida(ref, `rua-${rows.length}`);
    const predios = rows.filter(r => r.units.length > 0);
    const temDestaque = destaque !== 'nenhum';
    return (
        <div ref={ref} className="mt-2 flex items-end gap-6 overflow-x-auto overflow-y-hidden py-2 px-1">
            {predios.map(r => {
                const torres = mirrorTowers(r.units);
                const comAtraso = r.units.filter(c => c.overdue > 0).length;
                const resumo = `${r.name}: ${r.rentedCount} de ${r.unitsCount} unidades alugadas${comAtraso > 0 ? `, ${comAtraso} com atraso` : ''}. Recortar a aba neste empreendimento.`;
                return (
                    <button
                        key={r.empreendimentoId}
                        type="button"
                        onClick={() => onSelect(r.empreendimentoId)}
                        aria-label={resumo}
                        title={resumo}
                        className="group shrink-0 flex flex-col items-start gap-2 rounded-[10px] p-2 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                        <div className="flex items-end gap-2.5">
                            {torres.map(t => (
                                <div key={t.block} className="flex flex-col gap-1">
                                    {t.floors.map((f, fi) => (
                                        <div key={String(f.floor)} data-andar={t.floors.length - 1 - fi} className="flex gap-1">
                                            {f.cells.map(c => {
                                                const apagada = temDestaque && !casa(c, destaque);
                                                const cor = leitura === 'operacao'
                                                    ? COR_SOLIDA[c.status]
                                                    : c.contracted <= 0 ? 'bg-white border border-dashed border-gray-300' : (degrauDe(c)?.solida ?? 'bg-gray-200');
                                                return (
                                                    <span
                                                        key={c.id}
                                                        className={`relative w-[18px] h-[18px] rounded-[4px] transition-[opacity,filter] duration-200 ${cor} ${apagada ? 'opacity-20 saturate-0' : ''}`}
                                                    >
                                                        {leitura === 'operacao' && c.overdue > 0 && !apagada && (
                                                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white" />
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <span className="w-full border-t-2 border-gray-300" aria-hidden="true" />
                        <span className="inline-flex items-center gap-1 max-w-[11rem] text-xs font-medium text-gray-700 group-hover:text-blue-700">
                            <Building2 className="w-3.5 h-3.5 shrink-0 text-gray-400 group-hover:text-blue-600" />
                            <span className="truncate">{r.name}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
};

export default RentalUnitMirror;
