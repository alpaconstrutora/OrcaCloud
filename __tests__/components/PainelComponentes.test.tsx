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
import { render, screen, within } from '@testing-library/react';
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

  // ── Subgrupos por tipo (16/09/2026) ──────────────────────────────────────
  // Pedido: "Painel lateral › Componentes › Estrutura: implementar subgrupos
  // (laje; viga; pilar), faça o mesmo para os demais componentes".
  const viga = (id: string): Structural => ({
    id, levelId: 'lvl_1', kind: 'VIGA', pontos: [point(0, 0), point(3000, 0)],
    larguraMm: 150, profundidadeMm: 0, alturaMm: 400, baseMm: 2400, circular: false,
  });
  const laje = (id: string): Structural => ({
    id, levelId: 'lvl_1', kind: 'LAJE', pontos: [point(0, 0), point(3000, 0), point(3000, 3000), point(0, 3000)],
    larguraMm: 0, profundidadeMm: 0, alturaMm: 100, baseMm: 2800, circular: false,
  });

  it('cada família se divide em subgrupos por TIPO, na ordem do catálogo, com contagem', () => {
    // Laje antes de pilar na lista de entrada: a ordem da tela é a do catálogo, não a do modelo.
    montar({ estruturas: [laje('str_3'), viga('str_2'), pilar('str_1'), pilar('str_4')] });
    const subgrupos = screen.getAllByRole('button', { name: /^(Pilar|Viga|Laje): \d+ peças?$/ });
    expect(subgrupos.map((b) => b.getAttribute('aria-label'))).toEqual(['Pilar: 2 peças', 'Viga: 1 peça', 'Laje: 1 peça']);
    // Os demais também: Alvenaria › Parede, Esquadrias › Porta.
    expect(screen.getByRole('button', { name: 'Parede: 2 peças' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Porta: 1 peça' })).toBeTruthy();
    // A família continua contando o total.
    expect(screen.getByRole('button', { name: /Estrutura/ })).toHaveTextContent('4');
  });

  it('recolher um subgrupo esconde só as peças dele', async () => {
    const usuario = userEvent.setup();
    montar({ estruturas: [pilar('str_1'), viga('str_2')] });
    await usuario.click(screen.getByRole('button', { name: 'Viga: 1 peça' }));
    expect(screen.queryByRole('button', { name: /^V1 · Viga/ })).toBeNull();
    expect(linha('P1 · Pilar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Viga: 1 peça' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('no 3D, o olho do subgrupo alterna todas as peças do tipo de uma vez', async () => {
    const usuario = userEvent.setup();
    const onAlternarOculto = vi.fn();
    montar({
      estruturas: [pilar('str_1'), pilar('str_4'), viga('str_2')],
      ocultos: new Set<string>(),
      onAlternarOculto,
      somenteLeitura: true,
    });
    await usuario.click(screen.getByRole('button', { name: 'Ocultar Pilar no desenho' }));
    expect(onAlternarOculto).toHaveBeenCalledWith(['str_1', 'str_4'], true);
  });

  // ── Grupo de fundação (16/09/2026): a estaca aninhada no bloco ──────────
  const bloco = (id: string, x = 0): Structural => ({
    id, levelId: 'lvl_1', kind: 'BLOCO_COROAMENTO', pontos: [point(x, 0)],
    larguraMm: 1500, profundidadeMm: 600, alturaMm: 600, baseMm: -1100, circular: false, rotacaoDeg: 0, rotulo: id === 'str_b1' ? 'B1' : 'B2',
  });
  const estaca = (id: string, x: number, rotulo: string): Structural => ({
    id, levelId: 'lvl_1', kind: 'ESTACA', pontos: [point(x, 0)],
    larguraMm: 300, profundidadeMm: 300, alturaMm: 8000, baseMm: -9100, circular: true, rotacaoDeg: 0, rotulo,
  });

  it('as estacas aparecem DENTRO do bloco delas; "Estaca" só lista as órfãs; o olho de "Bloco" leva as estacas', async () => {
    const onAlternarOculto = vi.fn();
    montar({
      estruturas: [bloco('str_b1'), estaca('str_e1', -450, 'E1'), estaca('str_e2', 450, 'E2'), estaca('str_e9', 9000, 'E9')],
      ocultos: new Set<string>(),
      onAlternarOculto,
    });
    const linhaBloco = screen.getByRole('button', { name: /^B1 · Bloco de coroamento/ }).closest('li')!;
    // E1 e E2 estão aninhadas no <li> do bloco; E9 não.
    expect(within(linhaBloco).getByRole('button', { name: /^E1 · Estaca/ })).toBeInTheDocument();
    expect(within(linhaBloco).getByRole('button', { name: /^E2 · Estaca/ })).toBeInTheDocument();
    expect(within(linhaBloco).queryByRole('button', { name: /^E9 · Estaca/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Estaca: 1 peça' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloco de coroamento: 1 peça' })).toBeInTheDocument();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole('button', { name: 'Ocultar Bloco de coroamento no desenho' }));
    expect(onAlternarOculto).toHaveBeenCalledWith(['str_b1', 'str_e1', 'str_e2'], true);
  });

  it('duplo clique na linha chama onSelecionarPeca; clique simples segue por onSelecionar', async () => {
    const onSelecionarPeca = vi.fn();
    const props = montar({ estruturas: [bloco('str_b1'), estaca('str_e1', 0, 'E1')], onSelecionarPeca });
    const usuario = userEvent.setup();
    await usuario.dblClick(screen.getByRole('button', { name: /^E1 · Estaca/ }));
    expect(onSelecionarPeca).toHaveBeenCalledWith('str_e1');
    expect(props.onSelecionar).toHaveBeenCalledWith(['str_e1']);
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
