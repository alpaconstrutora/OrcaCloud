import React from 'react';
import { Building2, ArrowRight } from 'lucide-react';
import {
    mirrorTowers,
    rotuloDaTorre,
    rotuloDoAndar,
    type MirrorPlaceable,
} from '../../lib/rentalUnitMirror';

/**
 * A geometria do espelho de unidades (guia §28.6) — torres lado a lado,
 * andares de cima para baixo, navegação por seta, cartão de detalhe e a
 * subida dos andares. Saiu de `components/rentals/RentalUnitMirror.tsx` em
 * 27/10/2026, quando Venda de Ativos › Análise ganhou o seu espelho: o que
 * muda entre as duas abas é só a PINTURA (cor, linha da célula, frase e
 * detalhe); teclado, foco e movimento são um só.
 */

export interface MirrorCellBase extends MirrorPlaceable {
    id: string;
    /** Prédio (raiz) da unidade — a aba abre a torre no inventário por ele. */
    parentId: string | null;
    name: string;
}

export interface MirrorPintura<C extends MirrorCellBase> {
    /** Célula grande (torres): fundo, borda e texto. */
    classe: (c: C) => string;
    /** A leitura em uma palavra, embaixo do rótulo. */
    linha: (c: C) => string;
    /** Frase inteira — o nome acessível do botão. */
    descricao: (c: C) => string;
    /** Célula de 18px da rua de prédios. */
    solida: (c: C) => string;
    /** Ponto vermelho no canto (atraso). */
    ponto?: (c: C) => 'pequeno' | 'grande' | null;
    /** Anel âmbar por dentro (estado que pede atenção). */
    anel?: (c: C) => boolean;
    /** Miolo do cartão de detalhe (o rodapé "Abrir a torre" é comum). */
    Detalhe: React.FC<{ cell: C }>;
}

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

// ── Destacar ─────────────────────────────────────────────────────────────────

export interface DestaqueOpcao<D extends string> { id: D; label: string; vazio: string }

/** Rádios "Destacar": uma escolha por vez; desligado com o motivo quando não
 *  há nenhuma unidade no caso. Clicar de novo no ativo volta a "todas". */
export const DestaqueRadios = <D extends string>({ opcoes, contagem, ativo, nenhum, onChange }: {
    opcoes: DestaqueOpcao<D>[];
    contagem: (d: D) => number;
    ativo: D;
    nenhum: D;
    onChange: (d: D) => void;
}) => (
    <div role="radiogroup" aria-label="Destacar unidades" className="flex flex-wrap items-center gap-1.5">
        {opcoes.map(d => {
            const n = contagem(d.id);
            const on = ativo === d.id;
            return (
                <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={n === 0}
                    title={n === 0 ? d.vazio : on ? 'Clique de novo para mostrar todas' : undefined}
                    onClick={() => onChange(on ? nenhum : d.id)}
                    className={`h-8 px-2.5 rounded-[6px] border text-[13px] font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed ${
                        on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                >
                    {d.label} <span className={`tabular-nums ${on ? 'text-gray-300' : 'text-gray-500'}`}>{n}</span>
                </button>
            );
        })}
    </div>
);

// ── Torres do recorte ────────────────────────────────────────────────────────

/** Torres do empreendimento recortado — células grandes, navegáveis por seta.
 *  `destaca` = `null` mostra todas; senão o que não casa esmaece. */
export const Torres = <C extends MirrorCellBase>({ cells, pintura, destaca, onOpenUnit, chave }: {
    cells: C[];
    pintura: MirrorPintura<C>;
    destaca: ((c: C) => boolean) | null;
    onOpenUnit: (c: C) => void;
    chave: string;
}) => {
    const torres = React.useMemo(() => mirrorTowers(cells), [cells]);
    const ref = React.useRef<HTMLDivElement>(null);
    useSubida(ref, chave);

    // Navegação por seta (roving tabindex): Tab entra UMA vez no espelho; as
    // setas andam pela unidade vizinha, e para cima/baixo vão ao andar de
    // cima/baixo na posição mais próxima. Home/End: início/fim do andar.
    const [ativa, setAtiva] = React.useState<string>(() => torres[0]?.floors[0]?.cells[0]?.id ?? '');
    const [detalhe, setDetalhe] = React.useState<{ cell: C; x: number; y: number; abaixo: boolean } | null>(null);
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
        let alvo: C | undefined;
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

    const mostrar = (cell: C, el: HTMLElement) => {
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

    const Detalhe = pintura.Detalhe;

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
                                                    const apagada = destaca != null && !destaca(c);
                                                    const ponto = pintura.ponto?.(c) ?? null;
                                                    return (
                                                        <button
                                                            key={c.id}
                                                            ref={el => { if (el) botoes.current.set(c.id, el); else botoes.current.delete(c.id); }}
                                                            type="button"
                                                            tabIndex={c.id === ativa ? 0 : -1}
                                                            aria-label={pintura.descricao(c)}
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
                                                                ${pintura.classe(c)}
                                                                ${pintura.anel?.(c) ? 'ring-2 ring-amber-500 ring-inset' : ''}
                                                                ${apagada ? 'opacity-25 saturate-0' : ''}
                                                                ${destaca != null && !apagada ? 'shadow-md -translate-y-0.5' : ''}`}
                                                        >
                                                            <span className="text-[13px] font-medium tabular-nums max-w-full truncate px-1">{c.label}</span>
                                                            <span className="text-[11px] opacity-80 tabular-nums">{pintura.linha(c)}</span>
                                                            {ponto && (
                                                                <span
                                                                    aria-hidden="true"
                                                                    className={`absolute -top-1 -right-1 rounded-full bg-red-600 ring-2 ring-white ${ponto === 'grande' ? 'w-3 h-3' : 'w-2 h-2'}`}
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

            {detalhe && (
                // Repete o que o nome acessível já diz, por isso `aria-hidden`.
                <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute z-20 w-64 -translate-x-1/2 rounded-[10px] border border-gray-200 bg-white p-3 shadow-lg text-xs ${detalhe.abaixo ? 'mt-2' : '-translate-y-full -mt-2'}`}
                    style={{ left: detalhe.x, top: detalhe.y }}
                >
                    <p className="text-sm font-semibold text-gray-900 truncate">{detalhe.cell.name}</p>
                    <p className="text-gray-500">{rotuloDaTorre(detalhe.cell.block)} · {rotuloDoAndar(detalhe.cell.floor).longo}</p>
                    <Detalhe cell={detalhe.cell} />
                    <p className="mt-2 inline-flex items-center gap-1 text-blue-700 font-medium">Abrir a torre no inventário <ArrowRight className="w-3 h-3" /></p>
                </div>
            )}
        </div>
    );
};

// ── Rua de prédios ("Todos") ─────────────────────────────────────────────────

export interface Predio<C> { id: string; name: string; cells: C[]; resumo: string }

/** "Todos": um prédio por empreendimento, células sem rótulo, lado a lado,
 *  alinhados pelo chão. O prédio inteiro é um botão que recorta a aba. */
export const RuaDePredios = <C extends MirrorCellBase>({ predios, pintura, destaca, onSelect }: {
    predios: Predio<C>[];
    pintura: MirrorPintura<C>;
    destaca: ((c: C) => boolean) | null;
    onSelect: (id: string) => void;
}) => {
    const ref = React.useRef<HTMLDivElement>(null);
    useSubida(ref, `rua-${predios.length}`);
    return (
        <div ref={ref} className="mt-2 flex items-end gap-6 overflow-x-auto overflow-y-hidden py-2 px-1">
            {predios.filter(p => p.cells.length > 0).map(p => (
                <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(p.id)}
                    aria-label={p.resumo}
                    title={p.resumo}
                    className="group shrink-0 flex flex-col items-start gap-2 rounded-[10px] p-2 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                    <div className="flex items-end gap-2.5">
                        {mirrorTowers(p.cells).map(t => (
                            <div key={t.block} className="flex flex-col gap-1">
                                {t.floors.map((f, fi) => (
                                    <div key={String(f.floor)} data-andar={t.floors.length - 1 - fi} className="flex gap-1">
                                        {f.cells.map(c => {
                                            const apagada = destaca != null && !destaca(c);
                                            return (
                                                <span
                                                    key={c.id}
                                                    className={`relative w-[18px] h-[18px] rounded-[4px] transition-[opacity,filter] duration-200 ${pintura.solida(c)} ${apagada ? 'opacity-20 saturate-0' : ''}`}
                                                >
                                                    {pintura.ponto?.(c) && !apagada && (
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
                        <span className="truncate">{p.name}</span>
                    </span>
                </button>
            ))}
        </div>
    );
};
