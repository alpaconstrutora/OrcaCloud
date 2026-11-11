import React from 'react';

/**
 * Marca por um instante o número que MUDOU desde a última vez que a pessoa olhou
 * (tela "Bom dia", 11/11/2026). Só compara de uma rodada de "Atualizar" para a
 * próxima (`rodada`): a primeira carga e o "Tentar de novo" não marcam nada, e
 * se nada mudou, nada pisca. Responde "o que aconteceu desde que abri a tela?".
 *
 * Fundo âmbar que esmaece em ~1,4s (`.central-mudou`, index.css); `claro` para o
 * cartão azul. É cor, não deslocamento: vale também com `prefers-reduced-motion`.
 */
interface Props {
    valor: number | null;
    rodada: number;
    claro?: boolean;
    children: React.ReactNode;
}

export function Realce({ valor, rodada, claro = false, children }: Props) {
    const base = React.useRef(valor);
    const vista = React.useRef(rodada);
    const marcado = React.useRef<number | null>(null);
    if (rodada !== vista.current) {
        if (valor !== base.current) marcado.current = rodada;
        base.current = valor;
        vista.current = rodada;
    }
    // Nada de `key` para reiniciar: remontaria o filho (o NumeroQueSobe voltaria a
    // correr do zero). Rodadas pares e ímpares usam keyframes de nomes diferentes
    // — trocar o nome reinicia a animação no mesmo elemento.
    const agora = marcado.current === rodada;
    const classe = agora
        ? ['central-mudou', rodada % 2 === 0 ? 'central-mudou-par' : '', claro ? 'central-mudou-claro' : ''].filter(Boolean).join(' ')
        : undefined;
    return (
        <span className={classe}>
            {children}
        </span>
    );
}

export default Realce;
