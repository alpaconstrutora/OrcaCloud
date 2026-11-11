import React from 'react';

/**
 * Contador que troca deslizando quando o valor MUDA (pílulas e grupos da tela
 * "Bom dia"): resolver um item faz o "132" virar "131" descendo de cima, e a
 * pessoa vê que foi a ação dela que baixou o número. No primeiro render aparece
 * parado — quem anima a abertura é o NumeroQueSobe.
 *
 * Com `prefers-reduced-motion`, só esmaece (`.central-troca-numero` em index.css).
 */
interface Props {
    valor: number;
    className?: string;
}

export function NumeroQueTroca({ valor, className }: Props) {
    // Só o elemento que NASCEU de uma mudança de valor leva a animação; um
    // re-render qualquer mantém a chave e não repete nada.
    const anterior = React.useRef(valor);
    const animado = React.useRef<number | null>(null);
    if (valor !== anterior.current) {
        animado.current = valor;
        anterior.current = valor;
    }
    return (
        <span className={`inline-flex overflow-hidden tabular-nums ${className ?? ''}`}>
            <span key={valor} className={animado.current === valor ? 'central-troca-numero' : undefined}>{valor.toLocaleString('pt-BR')}</span>
        </span>
    );
}

export default NumeroQueTroca;
