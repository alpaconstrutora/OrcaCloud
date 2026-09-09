// @vitest-environment jsdom
/**
 * O QUADRO se edita como qualquer outra peça (09/09/2026).
 *
 * ─── O RELATO, E A REGRA QUE ELE FIXOU ──────────────────────────────────────
 *
 * *"o QDC está dentro de um accordion chamado Elétrica, porém o ponto elétrico
 * está em outro chamado Componentes. Deveria tudo ligado à elétrica ficar
 * dentro de um mesmo grupo."*
 *
 * A confusão era real, e a raiz era o contrário do que parecia: não é o ponto
 * que estava no lugar errado — é o quadro que **não tinha painel de peça
 * nenhum**. Ele era a única peça do desenho sem um, e as medidas dele viviam
 * dentro do painel de cargas porque era o único lugar em que ele aparecia
 * listado.
 *
 * A regra que ficou: **peça → Componentes; somatório e relação → a seção da
 * disciplina**. A propriedade de uma peça selecionada tem UM lugar só, para
 * todas as disciplinas — dividir por disciplina obrigaria quem desenha a saber
 * a disciplina da peça ANTES de saber onde olhar.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelQuadroSelecionado from '../../components/blueprint/PainelQuadroSelecionado';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  m = applyCommand(m, {
    type: 'AddQuadro',
    levelId: m.levels[0].id,
    nome: 'QDC',
    at: point(0, 0),
    cotaMm: 1600,
  }).model;
  return applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1' }).model;
}

describe('PainelQuadroSelecionado', () => {
  it('sem quadro selecionado, não renderiza nada', () => {
    const { container } = render(<PainelQuadroSelecionado quadro={null} onQuadro={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('edita o NOME do quadro', async () => {
    const onQuadro = vi.fn();
    const m = cena();
    const user = userEvent.setup();
    render(<PainelQuadroSelecionado quadro={m.quadros[0]} onQuadro={onQuadro} />);

    await user.type(screen.getByLabelText('Nome do quadro'), '2');
    expect(onQuadro).toHaveBeenCalledWith({ nome: 'QDC2' });
  });

  it('mostra as MEDIDAS e o GIRO — é aqui que a caixa se dimensiona', () => {
    const m = cena();
    render(<PainelQuadroSelecionado quadro={m.quadros[0]} onQuadro={() => {}} />);
    expect(screen.getByLabelText('Largura da peça, em milímetros')).toBeTruthy();
    expect(screen.getByLabelText('Profundidade da peça, em milímetros')).toBeTruthy();
    expect(screen.getByLabelText('Altura da peça, em milímetros')).toBeTruthy();
    expect(screen.getByLabelText('Giro da peça em planta, em graus')).toBeTruthy();
  });

  it('⚠️ diz que a cota é o CENTRO, não a base', () => {
    // É a convenção que o IFC já usava quando as medidas nasceram. Sem a frase,
    // "QDC a 1.600" é lido como onde a caixa COMEÇA, e a peça sai meia altura
    // fora do lugar — sem erro nenhum na tela.
    const m = cena();
    render(<PainelQuadroSelecionado quadro={m.quadros[0]} onQuadro={() => {}} />);
    expect(screen.getByText(/centro/)).toBeTruthy();
  });
});

describe('⚠️ a medida do quadro existe num LUGAR SÓ', () => {
  it('o painel de cargas não edita mais geometria nem nome', () => {
    // Dois lugares para o mesmo campo são duas verdades sobre ele, e foi a
    // geometria morando no painel de cargas que gerou a assimetria relatada:
    // o QDC se editava na Elétrica e o ponto em Componentes.
    render(
      <PainelEletrica model={cena()} onAddCircuito={() => {}} onCircuitoProps={() => {}} />,
    );
    expect(screen.queryByLabelText('Largura da peça, em milímetros')).toBeNull();
    expect(screen.queryByLabelText('Giro da peça em planta, em graus')).toBeNull();
    expect(screen.queryByLabelText('Nome do quadro')).toBeNull();
    // Mas o nome continua LEGÍVEL — ele é o cabeçalho que agrupa os circuitos.
    expect(screen.getByText('QDC')).toBeTruthy();
  });

  it('e continua sendo o quadro de CARGAS: os circuitos seguem lá', () => {
    render(
      <PainelEletrica model={cena()} onAddCircuito={() => {}} onCircuitoProps={() => {}} />,
    );
    expect(screen.getByDisplayValue('C1')).toBeTruthy();
  });
});
