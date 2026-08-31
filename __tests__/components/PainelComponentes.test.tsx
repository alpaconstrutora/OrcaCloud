// @vitest-environment jsdom
/**
 * Painel "Componentes" — o gerenciador do que está desenhado.
 *
 * Nasceu do pedido de 31/08/2026: *"quando seleciono um componente ele aparece
 * em Ambiente no painel lateral. Crie um novo acordion chamado Componentes e
 * inclua todos os componentes que estão em uso de forma a ser um gerenciador"*.
 *
 * A numeração e as medidas de cada linha têm teste PURO
 * (`__tests__/blueprintComponentes.test.ts`). O que sobra para cá é o que só
 * existe montado: os grupos de leitura, o destaque de quem está selecionado, e
 * os dois cliques que a lista promete — pegar a peça e apagá-la, sem um virar o
 * outro.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelComponentes from '../../components/blueprint/PainelComponentes';
import { point, type Opening, type Structural, type Wall } from '../../utils/blueprintKernel';

function parede(id: string, comprimentoMm: number): Wall {
  return {
    id,
    levelId: 'lvl_1',
    a: point(0, 0),
    b: point(comprimentoMm, 0),
    thicknessMm: 150,
    heightMm: 2800,
  };
}

function porta(id: string, wallId: string): Opening {
  return { id, wallId, kind: 'door', offsetMm: 1000, widthMm: 900, heightMm: 2100, sillMm: 0 };
}

function pilar(id: string): Structural {
  return {
    id,
    levelId: 'lvl_1',
    kind: 'PILAR',
    pontos: [point(500, 500)],
    larguraMm: 200,
    profundidadeMm: 400,
    alturaMm: 2800,
    baseMm: 0,
    circular: false,
  };
}

function montar(over: Partial<React.ComponentProps<typeof PainelComponentes>> = {}) {
  const props = {
    paredes: [parede('wal_1', 4000), parede('wal_2', 3000)],
    aberturas: [porta('opn_1', 'wal_1')],
    estruturas: [pilar('str_1')],
    selecionados: [] as string[],
    onSelecionar: vi.fn(),
    onExcluir: vi.fn(),
    ...over,
  };
  render(<PainelComponentes {...props} />);
  return props;
}

describe('PainelComponentes', () => {
  it('agrupa por família e conta cada grupo', () => {
    montar();
    // Os títulos são os MESMOS do menu que oferece as peças — é o que garante
    // que "Porta de correr" não apareça em um lugar sob "Esquadrias" e no outro
    // sob outro rótulo qualquer.
    expect(screen.getByText('Alvenaria')).toBeTruthy();
    expect(screen.getByText('Esquadrias')).toBeTruthy();
    expect(screen.getByText('Estrutura')).toBeTruthy();
    // Sem fundação desenhada, o grupo não aparece — seção "Fundação · 0" em
    // toda planta seria ruído.
    expect(screen.queryByText('Fundação')).toBeNull();
    expect(screen.getByText(/4 peças neste pavimento/)).toBeTruthy();
  });

  // Cada linha é procurada pelo BOTÃO dela, não pelo texto solto: "Parede 1"
  // aparece duas vezes de propósito — como linha e como a parede em que a porta
  // mora —, e `getByText` não distingue as duas.
  const linha = (rotulo: string) =>
    screen.getByRole('button', { name: new RegExp(`^${rotulo}`) });

  it('lista cada peça com rótulo e medida', () => {
    montar();
    expect(linha('Parede 1')).toHaveTextContent('4,00 m');
    expect(linha('Parede 2')).toHaveTextContent('3,00 m');
    expect(linha('Porta 1')).toHaveTextContent('0,90 × 2,10 m');
    expect(linha('P1 · Pilar')).toHaveTextContent('20 × 40 cm');
  });

  it('clique na linha seleciona só ela; Ctrl+clique acrescenta', async () => {
    const usuario = userEvent.setup();
    const props = montar({ selecionados: ['wal_1'] });

    await usuario.click(screen.getByText('Parede 2'));
    expect(props.onSelecionar).toHaveBeenCalledWith(['wal_2']);

    props.onSelecionar.mockClear();
    await usuario.keyboard('{Control>}');
    await usuario.click(screen.getByText('Parede 2'));
    await usuario.keyboard('{/Control}');
    // A que já estava selecionada CONTINUA: é o gesto que permite pegar na
    // lista as três paredes que se quer mover juntas.
    expect(props.onSelecionar).toHaveBeenCalledWith(['wal_1', 'wal_2']);
  });

  it('marca a peça selecionada, e a lixeira não troca a seleção', async () => {
    const usuario = userEvent.setup();
    const props = montar({ selecionados: ['str_1'] });

    expect(linha('P1 · Pilar')).toHaveAttribute('aria-pressed', 'true');

    await usuario.click(screen.getByRole('button', { name: 'Excluir Porta 1' }));
    expect(props.onExcluir).toHaveBeenCalledWith('opn_1');
    // Apagar UMA peça pela lixeira não pode mexer no que estava selecionado —
    // é a razão de `excluirComponente` existir separado de `removerSelecionada`.
    expect(props.onSelecionar).not.toHaveBeenCalled();
  });

  it('recolhe um grupo sem esconder os outros', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: /Alvenaria/ }));
    expect(screen.queryByRole('button', { name: /^Parede 1/ })).toBeNull();
    expect(linha('Porta 1')).toBeTruthy();
  });

  it('planta vazia explica o que fazer, em vez de mostrar lista em branco', () => {
    montar({ paredes: [], aberturas: [], estruturas: [] });
    expect(screen.getByText(/Nada desenhado neste pavimento ainda/)).toBeTruthy();
  });

  it('as propriedades da peça vêm ANTES da lista', () => {
    montar({ propriedades: <p>Parede selecionada</p> });
    const painel = screen.getByText('Parede selecionada');
    // `compareDocumentPosition` responde a pergunta que importa: quem lê o
    // painel de cima para baixo encontra a resposta ao clique antes de rolar
    // por quarenta linhas de inventário.
    expect(
      painel.compareDocumentPosition(linha('Parede 1')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
