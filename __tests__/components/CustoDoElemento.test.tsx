// @vitest-environment jsdom
/**
 * O custo ao lado da peça selecionada.
 *
 * A classe de defeito aqui não é somar errado — é MOSTRAR um número que parece
 * certo. São dois riscos, e os dois têm caso próprio abaixo:
 *
 *   1. mostrar R$ 0,00 quando ninguém pediu a prévia. "Zero" e "não perguntei"
 *      são coisas diferentes, e a primeira faria alguém concluir que a parede
 *      não entrou no orçamento;
 *   2. mostrar o custo da versão publicada sem dizer que o desenho mudou desde
 *      então. Um custo plausível e desatualizado é pior que nenhum: ninguém
 *      confere um número que parece certo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CustoDoElemento from '../../components/blueprint/CustoDoElemento';

describe('CustoDoElemento', () => {
  it('sem prévia calculada, NÃO renderiza nada — e não R$ 0,00', () => {
    const { container } = render(<CustoDoElemento custo={undefined} desatualizado={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o valor em reais e quantas linhas o compõem', () => {
    render(<CustoDoElemento custo={{ totalBRL: 1234.5, linhas: 2 }} desatualizado={false} />);
    // O número de linhas importa: um custo que vem de duas medidas diferentes
    // da mesma parede é conferível; um número solto, não.
    expect(screen.getByText(/2 linhas/)).toBeInTheDocument();
    expect(screen.getByText(/1\.234,50/)).toBeInTheDocument();
  });

  it('uma linha só fica no singular', () => {
    render(<CustoDoElemento custo={{ totalBRL: 10, linhas: 1 }} desatualizado={false} />);
    expect(screen.getByText(/1 linha$/)).toBeInTheDocument();
  });

  it('AVISA quando há rascunho não publicado', () => {
    render(<CustoDoElemento custo={{ totalBRL: 10, linhas: 1 }} desatualizado />);
    expect(screen.getByText(/última versão publicada/i)).toBeInTheDocument();
  });

  it('e NÃO avisa quando o desenho está publicado — o aviso tem de significar algo', () => {
    render(<CustoDoElemento custo={{ totalBRL: 10, linhas: 1 }} desatualizado={false} />);
    expect(screen.queryByText(/última versão publicada/i)).not.toBeInTheDocument();
  });

  it('custo zero com prévia calculada APARECE — aí zero é informação', () => {
    // Diferente do primeiro caso: aqui a prévia existe e o elemento realmente
    // não gerou custo. Esconder isso deixaria a pessoa sem saber se perguntou.
    render(<CustoDoElemento custo={{ totalBRL: 0, linhas: 1 }} desatualizado={false} />);
    expect(screen.getByText(/R\$\s*0,00/)).toBeInTheDocument();
  });
});
