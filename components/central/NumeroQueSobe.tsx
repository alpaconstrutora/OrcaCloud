import React from 'react';

/**
 * Número que sobe de zero até o valor — UMA vez, no primeiro carregamento da
 * tela "Bom dia". Ao atualizar, trocar de organização ou com
 * `prefers-reduced-motion`, aparece direto no valor: número que "corre" a cada
 * clique lê como dado mudando (mesma regra do §28.2 para gráficos).
 *
 * O texto final está sempre no DOM para leitor de tela (`aria-label`); a
 * contagem visível é decoração.
 */
interface Props {
    valor: number;
    formatar?: (n: number) => string;
    /** false = mostra o valor final sem animar. */
    animar: boolean;
    duracaoMs?: number;
    className?: string;
}

function semMovimento(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function NumeroQueSobe({ valor, formatar = n => Math.round(n).toLocaleString('pt-BR'), animar, duracaoMs = 700, className }: Props) {
    const [mostrado, setMostrado] = React.useState(() => (animar && !semMovimento() ? 0 : valor));

    React.useEffect(() => {
        if (!animar || semMovimento()) { setMostrado(valor); return; }
        let quadro = 0;
        const inicio = performance.now();
        const passo = (agora: number) => {
            const t = Math.min(1, (agora - inicio) / duracaoMs);
            // ease-out exponencial: rápido no começo, assenta no valor
            const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setMostrado(valor * e);
            if (t < 1) quadro = requestAnimationFrame(passo);
        };
        quadro = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(quadro);
    }, [valor, animar, duracaoMs]);

    const final = formatar(valor);
    return (
        <span className={`tabular-nums ${className ?? ''}`} aria-label={final}>
            <span aria-hidden="true">{formatar(mostrado)}</span>
        </span>
    );
}

export default NumeroQueSobe;
