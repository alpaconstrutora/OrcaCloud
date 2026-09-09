// @vitest-environment jsdom
/**
 * O ponto elétrico fora de circuito se resolve NO AVISO (09/09/2026).
 *
 * ─── O RELATO ───────────────────────────────────────────────────────────────
 *
 * "1 ponto elétrico fora de circuito. Eles não entram em soma nenhuma.
 * Selecione o ponto e escolha o circuito no painel dele. **porém não encontrou
 * como conectar a um circuito**"
 *
 * O aviso dava um NÚMERO e uma instrução para procurar. E procurar o quê? Um
 * ponto fora de circuito está fora de circuito, quase sempre, exatamente por
 * ter passado despercebido — pedir que ele seja achado no desenho é pedir de
 * novo o que já falhou uma vez.
 *
 * Agora o aviso lista QUAIS são, leva a cada um no desenho, e liga ao circuito
 * ali mesmo.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

/** Um desenho com quadro, um circuito e um ponto SOLTO. */
function cena(opcoes: { comCircuito?: boolean; comQuadro?: boolean } = {}) {
  const { comCircuito = true, comQuadro = true } = opcoes;
  let m: BlueprintModel = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const levelId = m.levels[0].id;

  if (comQuadro) {
    m = applyCommand(m, {
      type: 'AddQuadro',
      levelId,
      nome: 'QDC',
      at: point(0, 0),
      cotaMm: 1600,
    }).model;
    if (comCircuito) {
      m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1' }).model;
    }
  }

  m = applyCommand(m, {
    type: 'AddTerminal',
    levelId,
    disciplina: 'ELETRICA',
    tipo: 'Tomada',
    at: point(1000, 1000),
    cotaMm: 300,
  }).model;
  m = applyCommand(m, {
    type: 'SetTerminalProps',
    terminalId: m.terminais[0].id,
    rotulo: 'TUG cozinha',
  }).model;
  return m;
}

const montar = (m: BlueprintModel, extra: Record<string, unknown> = {}) =>
  render(
    <PainelEletrica
      model={m}
      onAddCircuito={() => {}}
      onCircuitoProps={() => {}}
      onQuadroProps={() => {}}
      {...extra}
    />,
  );

describe('PainelEletrica · o ponto fora de circuito', () => {
  it('⚠️ diz QUAL ponto é, e não só quantos', () => {
    // O número sozinho é um beco sem saída: manda procurar o que passou
    // despercebido. E o rótulo do projetista vence o tipo.
    montar(cena());
    expect(screen.getByText(/1 .*ponto elétrico|ponto elétrico/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'TUG cozinha' })).toBeTruthy();
  });

  it('liga ao circuito ALI MESMO, sem sair do aviso', async () => {
    const onLigarAoCircuito = vi.fn();
    const m = cena();
    const user = userEvent.setup();
    montar(m, { onLigarAoCircuito });

    await user.selectOptions(
      screen.getByLabelText('Circuito de TUG cozinha'),
      m.circuitos[0].id,
    );
    expect(onLigarAoCircuito).toHaveBeenCalledWith(m.terminais[0].id, m.circuitos[0].id);
  });

  it('o nome do ponto leva a ele no desenho', async () => {
    const onSelecionar = vi.fn();
    const m = cena();
    const user = userEvent.setup();
    montar(m, { onSelecionar });

    await user.click(screen.getByRole('button', { name: 'TUG cozinha' }));
    expect(onSelecionar).toHaveBeenCalledWith(m.terminais[0].id);
  });

  it('⚠️ sem circuito nenhum, diz o que fazer em vez de oferecer uma lista vazia', () => {
    // Um seletor com uma opção só — "Ligar a…" — é uma porta que não abre, e
    // quem clica nela conclui que a tela está quebrada.
    montar(cena({ comCircuito: false }));
    expect(screen.queryByLabelText('Circuito de TUG cozinha')).toBeNull();
    expect(screen.getByText('crie um circuito abaixo')).toBeTruthy();
  });

  it('⚠️ SEM QUADRO, a pendência continua visível', () => {
    // Antes, o painel devolvia só "nenhum quadro ainda" e os pontos que ninguém
    // alimenta ficavam invisíveis até alguém criar o quadro — a tela parecia
    // completa justamente quando faltava mais coisa.
    montar(cena({ comQuadro: false }));
    expect(screen.getByText(/Nenhum quadro de distribuição ainda/)).toBeTruthy();
    expect(screen.getByText(/TUG cozinha/)).toBeTruthy();
  });

  it('sem ponto solto, o aviso não aparece', () => {
    const m = cena();
    const ligado = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: m.terminais[0].id,
      circuitoId: m.circuitos[0].id,
    }).model;
    montar(ligado);
    expect(screen.queryByText(/fora de circuito/)).toBeNull();
  });
});
