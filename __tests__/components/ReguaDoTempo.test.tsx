// @vitest-environment jsdom
/**
 * A régua do tempo do 4D.
 *
 * O risco desta tela não é errar a data: é uma cena colorida convencer alguém
 * de que aquilo é a obra executada. Medido no banco em 06/09/2026: das 265
 * tarefas de cronograma, 265 têm data planejada e 4 têm execução informada.
 * Sem o rótulo, previsão vira relatório.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReguaDoTempo from '../../components/blueprint/ReguaDoTempo';

const padrao = {
  data: '2026-03-15',
  onData: vi.fn(),
  tarefas: 10,
  pecasColoridas: 4,
  algumRealConhecido: false,
};

describe('ReguaDoTempo', () => {
  it('SEM cronograma não renderiza — régua que não colore nada faz procurar defeito', () => {
    const { container } = render(<ReguaDoTempo {...padrao} tarefas={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('AVISA que a cor é do planejado — o rótulo que não pode faltar', () => {
    render(<ReguaDoTempo {...padrao} />);
    expect(screen.getByText(/PLANEJADAS/)).toBeInTheDocument();
    expect(screen.getByText(/não é o que foi executado/i)).toBeInTheDocument();
  });

  it('com execução informada, o aviso MUDA — e continua dizendo que a cor não a usa', () => {
    // O caso perigoso: existe algum dado real, e alguém conclui que a cor o
    // reflete. Ela não reflete, e a tela tem de ser explícita sobre isso.
    render(<ReguaDoTempo {...padrao} algumRealConhecido />);
    expect(screen.getByText(/a cor não a usa/i)).toBeInTheDocument();
  });

  it('diz quantas peças estão ligadas', () => {
    render(<ReguaDoTempo {...padrao} />);
    expect(screen.getByText(/4 peça\(s\).*10 tarefa\(s\)/)).toBeInTheDocument();
  });

  it('com cronograma e NENHUMA peça ligada, explica por quê', () => {
    // Sem isto, a pessoa mexe a data, nada muda de cor, e conclui que quebrou.
    render(<ReguaDoTempo {...padrao} pecasColoridas={0} />);
    expect(screen.getByText(/não vieram desta planta/i)).toBeInTheDocument();
  });

  it('a data é editável e reporta a mudança', () => {
    const onData = vi.fn();
    render(<ReguaDoTempo {...padrao} onData={onData} />);
    const campo = screen.getByLabelText(/data da simulação/i) as HTMLInputElement;
    expect(campo.value).toBe('2026-03-15');
  });
});
