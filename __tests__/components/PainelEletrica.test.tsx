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
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/fora de\s+circuito/i)).toBeInTheDocument();
  });

  it('⚠️ NÃO sugere disjuntor: sem declaração, o campo fica vazio', () => {
    // A fronteira do escopo, na tela: somar é registro, decidir é projeto. Um
    // valor de partida aqui viraria recomendação na cabeça de quem lê.
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
    expect(screen.getByText(/ela não dimensiona/i)).toBeInTheDocument();
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
