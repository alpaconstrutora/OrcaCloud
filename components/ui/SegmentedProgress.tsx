import React from 'react';

/**
 * Barra de progresso segmentada — §29 de `docs/ui_ux_guia_unificado.md`.
 *
 * Percentual em texto + fileira de quadradinhos: os primeiros `round(pct/100·N)`
 * preenchidos, o resto em cinza-claro. A cor dos preenchidos diz "está bom?":
 * `emerald` de 50% para cima, `amber` abaixo (o `tone` explícito manda quando a
 * tela tem semântica própria). Desenho de referência: card de exportação
 * agendada (print do usuário, 2026-09-13).
 *
 * Vive dentro de célula de tabela (§7: sem `font-bold`; o percentual usa
 * `font-medium` porque é número) ou em card. Sem `title` o percentual já é o
 * rótulo — passe `title` quando a base do cálculo não for óbvia.
 */
export interface SegmentedProgressProps {
    /** 0–100 (valores fora da faixa são recortados). */
    percent: number;
    /** Quantidade de quadradinhos (padrão 12). */
    segments?: number;
    /** Cor dos preenchidos; sem ela, `emerald` ≥ 50 e `amber` < 50. */
    tone?: 'emerald' | 'amber' | 'blue' | 'red';
    /** Texto ao lado do percentual (ex.: "↑12% vs últimos 5"). */
    hint?: React.ReactNode;
    title?: string;
    className?: string;
}

const FILL: Record<NonNullable<SegmentedProgressProps['tone']>, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-400',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
};

export function SegmentedProgress({ percent, segments = 12, tone, hint, title, className = '' }: SegmentedProgressProps) {
    const pct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    const filled = Math.round(pct / 100 * segments);
    const fill = FILL[tone ?? (pct >= 50 ? 'emerald' : 'amber')];
    return (
        <div className={`flex flex-col gap-1 min-w-0 ${className}`} title={title}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 tabular-nums">{pct.toFixed(0)}%</span>
                {hint && <span className="text-xs text-gray-500 truncate">{hint}</span>}
            </div>
            <div className="flex items-center gap-0.5" role="img" aria-label={`${pct.toFixed(0)}%`}>
                {Array.from({ length: segments }, (_, i) => (
                    <span key={i} className={`h-2.5 w-2 rounded-[2px] ${i < filled ? fill : 'bg-gray-200'}`} />
                ))}
            </div>
        </div>
    );
}

export default SegmentedProgress;
