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
import userEvent from '@testing-library/user-event';
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


/**
 * 15/09/2026: o painel virou TabsBar + StandardTable (Circuitos · Pontos fora
 * de circuito · Quadros · Conferência · Hipóteses). O que não é a tabela de
 * circuitos vive numa aba — os testes abrem a aba antes de olhar.
 */
async function abrirAba(nome: RegExp) {
  await userEvent.setup().click(screen.getByRole('tab', { name: nome }));
}

describe('PainelEletrica', () => {
  it('mostra a carga somada e o disjuntor DECLARADO', () => {
    render(<PainelEletrica model={modelo({ comPotencia: true, soltos: 0 })} {...vazio} />);
    // Em VA, e não W: a NBR 5410 dimensiona por potência aparente (10/09/2026).
    // A coluna "Carga (VA)" traz o número; o total do quadro, "160 VA".
    expect(screen.getByRole('columnheader', { name: /carga \(va\)/i })).toBeInTheDocument();
    expect(screen.getAllByText(/160 VA/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/160 W/)).toBeNull();
    // Disjuntor é SELETOR da série comercial (15/09/2026): o valor é string.
    const disj = screen.getByLabelText(/Disjuntor do circuito C1/i) as HTMLSelectElement;
    expect(disj.tagName).toBe('SELECT');
    expect(disj).toHaveValue('10');
    expect(Array.from(disj.options).map((o) => o.value).filter(Boolean).map(Number)).toEqual([10, 16, 20, 25, 32, 40, 50, 63, 73, 80, 100, 125, 160, 200]);
    expect(screen.getByLabelText(/Seção do circuito C1/i)).toHaveValue(1.5);
  });

  it('⚠️ avisa que a soma está INCOMPLETA quando falta potência', () => {
    // 100 W em 2 pontos: o segundo não tem potência informada. Sem o aviso, o
    // número pareceria a carga do circuito inteiro.
    render(<PainelEletrica model={modelo({ comPotencia: false, soltos: 0 })} {...vazio} />);
    expect(screen.getByText(/soma acima está\s+incompleta/i)).toBeInTheDocument();
  });

  it('⚠️ mostra os pontos FORA DE CIRCUITO, que não entram em soma nenhuma', async () => {
    render(<PainelEletrica model={modelo({ comPotencia: true, soltos: 3 })} {...vazio} />);
    // O badge da aba diz 3; o rodapé da tabela repete a pendência junto da soma
    // (uma soma que esconde o que não entrou nela parece completa).
    expect(screen.getByRole('tab', { name: /pontos fora de circuito/i })).toHaveTextContent('3');
    expect(screen.getByText(/3 pontos elétricos estão fora de/)).toBeInTheDocument();
    await abrirAba(/pontos fora de circuito/i);
    expect(screen.getByText(/pontos elétricos fora de\s+circuito/i)).toBeInTheDocument();
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
    expect(screen.getByLabelText(/Disjuntor do circuito C1/i)).toHaveValue('');
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
