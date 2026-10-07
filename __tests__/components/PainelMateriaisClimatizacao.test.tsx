// @vitest-environment jsdom
/**
 * CLIMATIZAÇÃO E9.3 (07/10/2026): a lista de materiais na tela — as premissas
 * editáveis (dentro da faixa) e a lista por grupo, com os avisos.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelMateriaisClimatizacao from '../../components/blueprint/PainelMateriaisClimatizacao';
import { HIPOTESES_DOS_MATERIAIS_PADRAO } from '../../utils/blueprintClimatizacao';
import type { MateriaisDeClimatizacao } from '../../utils/blueprintMateriaisClimatizacao';

const MATERIAIS: MateriaisDeClimatizacao = {
  totais: [
    { grupo: 'Linha frigorígena', item: 'Tubo de cobre 1/4" (6 mm)', quantidade: 8.5, unidade: 'm', itemCode: null },
    { grupo: 'Suportes', item: 'Suporte do duto (perfilado e tirante)', quantidade: 2, unidade: 'un', itemCode: null, nota: '4 m ÷ 1 a cada 2,5 m' },
  ],
  porPavimento: [],
  porSistema: [],
  avisos: ['1 evaporadora(s) sem capacidade declarada: a compra pede o modelo.'],
};

describe('PainelMateriaisClimatizacao (E9.3)', () => {
  it('mostra a lista por grupo e os avisos; a premissa se edita dentro da faixa', () => {
    const onHip = vi.fn();
    render(<PainelMateriaisClimatizacao materiais={MATERIAIS} hip={HIPOTESES_DOS_MATERIAIS_PADRAO} onHip={onHip} />);
    expect(screen.getByText('Linha frigorígena')).toBeInTheDocument();
    expect(screen.getByText('Tubo de cobre 1/4" (6 mm)')).toBeInTheDocument();
    expect(screen.getByText('8,50 m')).toBeInTheDocument();
    expect(screen.getByText('2 un')).toBeInTheDocument();
    expect(screen.getByTestId('materiais-climatizacao-avisos')).toHaveTextContent(/sem capacidade declarada/);
    fireEvent.change(screen.getByLabelText('Perda da chapa do duto (%)'), { target: { value: '15' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HIPOTESES_DOS_MATERIAIS_PADRAO, perdaDaChapaPct: 15 });
    // Fora da faixa não grava.
    onHip.mockClear();
    fireEvent.change(screen.getByLabelText('Perda da chapa do duto (%)'), { target: { value: '90' } });
    expect(onHip).not.toHaveBeenCalled();
  });

  it('sem nada no desenho, diz', () => {
    render(<PainelMateriaisClimatizacao materiais={{ totais: [], porPavimento: [], porSistema: [], avisos: [] }} hip={HIPOTESES_DOS_MATERIAIS_PADRAO} onHip={vi.fn()} />);
    expect(screen.getByText('Sem instalação de climatização no desenho.')).toBeInTheDocument();
  });
});
