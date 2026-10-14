// @vitest-environment jsdom
/** A reservação na gaveta de água (E4.1): a frase da situação, os números e as premissas editáveis. */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

/** As premissas abrem recolhidas (14/10/2026). */
const abrirHipoteses = () => fireEvent.click(screen.getByRole('button', { name: /hipóteses da reservação/i }));
/** O campo grava ao sair (14/10/2026), não a cada tecla. */
const digitar = (rotulo: string, valor: string) => {
  const campo = screen.getByLabelText(rotulo);
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo);
};

describe('PainelReservacao (E4.1)', () => {
  beforeEach(() => localStorage.clear());

  it('mostra a situação (vermelha quando falta), a população com os ambientes e os volumes', () => {
    render(<PainelReservacao r={r} hip={HIPOTESES_RESERVATORIO_PADRAO} onHip={vi.fn()} />);
    const sit = screen.getByTestId('reservacao-situacao');
    expect(sit.textContent).toBe(r.texto);
    expect(sit.className).toMatch(/red/);
    expect(screen.getByText('4 pessoa(s) — Quarto, Suíte')).toBeTruthy();
    expect(screen.getByText('800 L (caixa de 1.000 L)')).toBeTruthy();
  });

  it('as premissas abrem recolhidas, com os valores no resumo', () => {
    render(<PainelReservacao r={r} hip={HIPOTESES_RESERVATORIO_PADRAO} onHip={vi.fn()} />);
    expect(screen.queryByLabelText('Consumo per capita em litros por dia')).toBeNull();
    expect(screen.getByTestId('hipoteses-reservacao')).toHaveTextContent('2 por dormitório · 200 L/dia · 1 dia(s) · inferior 60 %');
  });

  it('editar as premissas devolve o objeto inteiro — ao sair do campo', () => {
    const onHip = vi.fn();
    render(<PainelReservacao r={r} hip={HIPOTESES_RESERVATORIO_PADRAO} onHip={onHip} />);
    abrirHipoteses();
    const perCapita = screen.getByLabelText('Consumo per capita em litros por dia');
    fireEvent.change(perCapita, { target: { value: '150' } });
    expect(onHip).not.toHaveBeenCalled();
    fireEvent.blur(perCapita);
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_RESERVATORIO_PADRAO, perCapitaLDia: 150 });
    digitar('População declarada (0 = contar pelos dormitórios)', '12');
    expect(onHip).toHaveBeenCalledWith({ ...HIPOTESES_RESERVATORIO_PADRAO, populacaoDeclarada: 12 });
  });

  it('apagar "Per capita" e sair NÃO grava (antes gravava 1 L/dia)', () => {
    const onHip = vi.fn();
    render(<PainelReservacao r={r} hip={HIPOTESES_RESERVATORIO_PADRAO} onHip={onHip} />);
    abrirHipoteses();
    digitar('Consumo per capita em litros por dia', '');
    expect(onHip).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Consumo per capita em litros por dia')).toHaveValue(200);
  });

  it('as constantes escondidas viraram campos, e a regra da população lê as premissas', () => {
    const onHip = vi.fn();
    render(<PainelReservacao r={r} hip={{ ...HIPOTESES_RESERVATORIO_PADRAO, pessoasPorDormitorio: 3 }} onHip={onHip} />);
    abrirHipoteses();
    // Antes a nota dizia "2 por dormitório" mesmo com a premissa em 3.
    expect(screen.getByTestId('reservacao-regra-populacao')).toHaveTextContent('3 por dormitório ou suíte e 1 por dependência');
    digitar('Fração do volume no reservatório inferior em por cento', '70');
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_RESERVATORIO_PADRAO, pessoasPorDormitorio: 3, fracaoInferior: 0.7 });
    digitar('Pessoas por dependência', '2');
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_RESERVATORIO_PADRAO, pessoasPorDormitorio: 3, pessoasPorDependencia: 2 });
  });
});
