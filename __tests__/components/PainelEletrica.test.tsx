// @vitest-environment jsdom
/**
 * O painel de Elétrica — o quadro de cargas na tela (08/09/2026).
 *
 * ⚠️ O que estes casos guardam não é o layout: é que a tela **não esconda o que
 * falta**. Uma soma que omite os pontos que não entraram nela parece completa, e
 * o número sai plausível — a pior espécie de erro num quadro de cargas.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import {
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

function modelo(opcoes: { comPotencia: boolean; soltos: number }): BlueprintModel {
  let m = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  const nivel = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId: nivel, nome: 'QDC', at: point(0, 0) }).model;
  m = applyCommand(m, {
    type: 'AddCircuito',
    quadroId: m.quadros[0].id,
    nome: 'C1',
    disjuntorA: 10,
    secaoMm2: 1.5,
  }).model;
  const circuitoId = m.circuitos[0].id;

  const ponto = (x: number, potenciaW: number | null, comCircuito: boolean) => {
    m = applyCommand(m, {
      type: 'AddTerminal',
      levelId: nivel,
      disciplina: 'ELETRICA',
      tipo: 'Tomada baixa',
      at: point(x, 0),
      cotaMm: 300,
    }).model;
    const id = m.terminais[m.terminais.length - 1].id;
    m = applyCommand(m, {
      type: 'SetTerminalProps',
      terminalId: id,
      ...(comCircuito ? { circuitoId } : {}),
      ...(potenciaW === null ? {} : { potenciaW }),
    }).model;
  };

  ponto(500, 100, true);
  ponto(1000, opcoes.comPotencia ? 60 : null, true);
  for (let i = 0; i < opcoes.soltos; i++) ponto(2000 + i * 300, 100, false);
  return m;
}

const vazio = {
  onAddCircuito: vi.fn(),
  onCircuitoProps: vi.fn(),
  onQuadroProps: vi.fn(),
};

describe('PainelEletrica', () => {
  it('mostra a carga somada e o disjuntor DECLARADO', () => {
    render(<PainelEletrica model={modelo({ comPotencia: true, soltos: 0 })} {...vazio} />);
    // Em VA, e não W: a NBR 5410 dimensiona por potência aparente (10/09/2026).
    expect(screen.getAllByText('160 VA').length).toBeGreaterThan(0);
    expect(screen.queryByText('160 W')).toBeNull();
    expect(screen.getByLabelText(/Disjuntor do circuito C1/i)).toHaveValue(10);
    expect(screen.getByLabelText(/Seção do circuito C1/i)).toHaveValue(1.5);
  });

  it('⚠️ avisa que a soma está INCOMPLETA quando falta potência', () => {
    // 100 W em 2 pontos: o segundo não tem potência informada. Sem o aviso, o
    // número pareceria a carga do circuito inteiro.
    render(<PainelEletrica model={modelo({ comPotencia: false, soltos: 0 })} {...vazio} />);
    expect(screen.getByText(/soma acima está\s+incompleta/i)).toBeInTheDocument();
  });

  it('⚠️ mostra os pontos FORA DE CIRCUITO, que não entram em soma nenhuma', () => {
    render(<PainelEletrica model={modelo({ comPotencia: true, soltos: 3 })} {...vazio} />);
    // O número do aviso ("3 pontos elétricos fora de circuito") — o cabeçalho do
    // grupo também mostra "(3)" desde o agrupamento de 13/09, daí o `getAllBy`.
    expect(screen.getAllByText(/3/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/fora de\s+circuito/i)).toBeInTheDocument();
  });

  it('⚠️ o campo DECLARADO fica vazio sem declaração — a sugestão vive ao lado, nunca dentro dele', () => {
    // A fronteira mudou de forma em 13/09/2026 (item 6, molde da topografia):
    // o painel passou a PRÉ-DIMENSIONAR, com hipóteses declaradas. O que não
    // mudou: o campo continua sendo o que o projetista escolheu — vazio é
    // "ninguém declarou", e o sugerido aparece numa linha própria com o item
    // da norma. Um valor de partida DENTRO do campo viraria recomendação
    // silenciosa.
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
    }).model;
    m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1' }).model;

    render(<PainelEletrica model={m} {...vazio} />);
    expect(screen.getByLabelText(/Disjuntor do circuito C1/i)).toHaveValue(null);
    expect(screen.getByLabelText(/Seção do circuito C1/i)).toHaveValue(null);
    expect(screen.getByText(/quem grava é você/i)).toBeInTheDocument();
    // Sem tensão nem pontos, o pré-dimensionamento diz por que não calculou.
    expect(screen.getByLabelText(/Pré-dimensionamento do circuito C1/i).textContent).toMatch(/sem tensão/);
  });

  it('sem quadro nenhum, explica onde criar um em vez de mostrar tabela vazia', () => {
    const m = applyCommand(emptyModel(), {
      type: 'AddLevel',
      name: 'Térreo',
      elevationMm: 0,
      defaultHeightMm: 2800,
    }).model;
    render(<PainelEletrica model={m} {...vazio} />);
    expect(screen.getByText(/Nenhum quadro de distribuição ainda/i)).toBeInTheDocument();
  });
});
