import React from 'react';

/**
 * Mapa de calor 5×5 — probabilidade (colunas, 1 → 5) × impacto (linhas, 5 → 1).
 *
 * Extraído de `components/ImovibRiscosCard.tsx` (14/11/2026, plano
 * docs/planos/2026-11-13-modulo-riscos.md F1.9: "mapa de calor 5×5 extraído de
 * ImovibRiscosCard como componente compartilhado"). O desenho compacto é o do
 * Imovib, LITERAL — o Imovib usa este componente e o HTML que sai é o mesmo de
 * antes (conferido por `renderToStaticMarkup` lado a lado, ver relatório da F1.9).
 *
 * Quem decide o que cada célula conta e qual cor ela tem é a tela: o Imovib pinta
 * pela severidade dele (15/8), o módulo Riscos pelas faixas da organização
 * (`COR_CELULA_NIVEL`). O mapa só desenha.
 *
 * `onSelecionar` liga o modo clicável (Riscos › Matriz): cada célula vira botão
 * com `aria-pressed`, e a selecionada ganha anel azul — a cor do nível continua
 * sendo a do fundo, o anel é o estado.
 *
 * Não é tabela de registros (§6/§7): é diagrama — `font-semibold` no número da
 * célula é o desenho original do Imovib, fora de `<td>`.
 */
export interface MatrizCalorProps {
    /** Quantos itens caem em (probabilidade, impacto). */
    contagem: (probabilidade: number, impacto: number) => number;
    /** Classes de fundo/texto da célula (recebe a contagem para pintar a vazia diferente). */
    corDaCelula: (probabilidade: number, impacto: number, n: number) => string;
    /** `title` da célula — diz o cruzamento e a contagem (a cor nunca é o único sinal). */
    tituloDaCelula: (probabilidade: number, impacto: number, n: number) => string;
    /** Nome acessível do mapa. */
    ariaLabel: string;
    /** Legenda acima do mapa. */
    titulo?: React.ReactNode;
    /** `compacto` = o desenho do Imovib (células de 36px); `amplo` = página inteira. */
    tamanho?: 'compacto' | 'amplo';
    /** Liga o modo clicável. */
    onSelecionar?: (probabilidade: number, impacto: number) => void;
    selecionada?: { probabilidade: number; impacto: number } | null;
    /** Rótulo da linha de impacto (padrão: "Impacto 5", 4, 3, 2, 1). */
    rotuloImpacto?: (impacto: number) => React.ReactNode;
    /** Rótulo da coluna de probabilidade (padrão: o número). */
    rotuloProbabilidade?: (probabilidade: number) => React.ReactNode;
}

const IMPACTOS = [5, 4, 3, 2, 1];
const PROBABILIDADES = [1, 2, 3, 4, 5];

/* Classes por extenso — o JIT do Tailwind não enxerga classe montada em runtime. */
const GRADE = {
    compacto: 'grid grid-cols-[auto_repeat(5,2.25rem)] gap-1 text-xs',
    amplo: 'grid grid-cols-[auto_repeat(5,minmax(3.5rem,1fr))] gap-1.5 text-sm',
};
const CELULA = {
    compacto: 'h-9 rounded-[6px] flex items-center justify-center font-semibold',
    amplo: 'h-14 rounded-[6px] flex items-center justify-center font-semibold text-base',
};

export const MatrizCalor: React.FC<MatrizCalorProps> = ({
    contagem, corDaCelula, tituloDaCelula, ariaLabel, titulo, tamanho = 'compacto',
    onSelecionar, selecionada, rotuloImpacto, rotuloProbabilidade,
}) => (
    <div aria-label={ariaLabel}>
        {titulo}
        <div className={GRADE[tamanho]}>
            {IMPACTOS.map(i => (
                <React.Fragment key={i}>
                    <span className="text-slate-500 pr-1 self-center text-right">{rotuloImpacto ? rotuloImpacto(i) : (i === 5 ? 'Impacto 5' : i)}</span>
                    {PROBABILIDADES.map(p => {
                        const n = contagem(p, i);
                        const classe = `${CELULA[tamanho]} ${corDaCelula(p, i, n)}`;
                        if (!onSelecionar) {
                            return (
                                <span key={p} title={tituloDaCelula(p, i, n)}
                                    className={classe}>
                                    {n || ''}
                                </span>
                            );
                        }
                        const ativa = selecionada?.probabilidade === p && selecionada?.impacto === i;
                        return (
                            <button key={p} type="button" title={tituloDaCelula(p, i, n)} aria-pressed={ativa}
                                onClick={() => onSelecionar(p, i)}
                                className={`${classe} transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:brightness-95 ${ativa ? 'ring-2 ring-blue-600 ring-offset-1' : ''}`}>
                                {n || ''}
                            </button>
                        );
                    })}
                </React.Fragment>
            ))}
            <span />
            {PROBABILIDADES.map(p => <span key={p} className="text-center text-slate-500">{rotuloProbabilidade ? rotuloProbabilidade(p) : p}</span>)}
        </div>
        <p className="text-xs text-slate-500 mt-1 text-right">Probabilidade →</p>
    </div>
);

export default MatrizCalor;
