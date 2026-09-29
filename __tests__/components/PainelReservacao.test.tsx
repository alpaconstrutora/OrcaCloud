// @vitest-environment jsdom
/** A reservação na gaveta de água (E4.1): a frase da situação, os números e as premissas editáveis. */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelReservacao from '../../components/blueprint/PainelReservacao';
import { HIPOTESES_RESERVATORIO_PADRAO, type DimensionamentoDaReservacao } from '../../utils/blueprintReservacao';

const r: DimensionamentoDaReservacao = {
  populacao: { ambientes: [{ nome: 'Quarto', tipo: 'DORMITORIO', pessoas: 2 }, { nome: 'Suíte', tipo: 'SUITE', pessoas: 2 }], contada: 4, pessoas: 4, declarada: false },
  consumoDiarioL: 800,
  volumeNecessarioL: 800,
  inferiorNecessarioL: 0,
  superiorNecessarioL: 800,
  volumeSugeridoL: 1000,
  reservatorios: [{ terminalId: 'cx', levelId: 't', volumeL: 500 }],
  declaradoL: 500,
  situacao: 'INSUFICIENTE',
  texto: 'Reservar 800 L; o desenho tem 500 L — faltam 300 L (sugerida: 1.000 L).',
};

describe('PainelReservacao (E4.1)', () => {
  it('mostra a situação (vermelha quando falta), a população com os ambientes e os volumes', () => {
    render(<PainelReservacao r={r} hip={HIPOTESES_RESERVATORIO_PADRAO} onHip={vi.fn()} />);
    const sit = screen.getByTestId('reservacao-situacao');
    expect(sit.textContent).toBe(r.texto);
    expect(sit.className).toMatch(/red/);
    expect(screen.getByText('4 pessoa(s) — Quarto, Suíte')).toBeTruthy();
    expect(screen.getByText('800 L (caixa de 1.000 L)')).toBeTruthy();
  });

  it('editar as premissas devolve o objeto inteiro', () => {
    const onHip = vi.fn();
    render(<PainelReservacao r={r} hip={HIPOTESES_RESERVATORIO_PADRAO} onHip={onHip} />);
    fireEvent.change(screen.getByLabelText('Consumo per capita em litros por dia'), { target: { value: '150' } });
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_RESERVATORIO_PADRAO, perCapitaLDia: 150 });
    fireEvent.change(screen.getByLabelText('População declarada (0 = contar pelos dormitórios)'), { target: { value: '12' } });
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_RESERVATORIO_PADRAO, populacaoDeclarada: 12 });
  });
});
