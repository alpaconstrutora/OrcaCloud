// @vitest-environment jsdom
/**
 * O painel de saídas de emergência (01/10/2026, E6.1): a população por
 * pavimento, a largura exigida × desenhada em vermelho quando falta, a
 * pendência, e as premissas que gravam.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelSaidasIncendio from '../../components/blueprint/PainelSaidasIncendio';
import { HIPOTESES_SAIDAS_PADRAO as HS, FONTE_SAIDAS, type AnaliseDeSaidas } from '../../utils/blueprintSaidasIncendio';

const analise: AnaliseDeSaidas = {
  grupo: 'A',
  populacao: [
    { levelId: 't', nome: 'Térreo', pessoas: 0, origem: 'DORMITORIOS', base: 0 },
    { levelId: 'p', nome: 'Tipo', pessoas: 8, origem: 'DORMITORIOS', base: 4 },
  ],
  itens: [
    { tipo: 'ESCADA', alvoId: 'e1', rotulo: 'E1', pessoas: 8, pavimentoCritico: 'Tipo', unidades: 2, exigidaMm: 1100, desenhadaMm: 900, atende: false },
    { tipo: 'DESCARGA', alvoId: 't', rotulo: 'Saídas para o exterior (Térreo)', pessoas: 8, pavimentoCritico: 'Tipo', unidades: 1, exigidaMm: 550, desenhadaMm: 900, atende: true },
  ],
  protecao: [{ escadaId: 'e1', rotulo: 'E1', exigida: 'EP', motivo: 'altura 20 m entre 12 e 30 m — CONFERIR NA IT', declarada: 'NE', atende: false, portasSemCortaFogo: ['o1', 'o2'], semCaixa: false }],
  pendencias: ['o pavimento de descarga (Térreo) não tem porta para o exterior'],
  fonte: FONTE_SAIDAS,
};

describe('PainelSaidasIncendio', () => {
  it('a população, a escada estreita em vermelho com o motivo, e selecionar leva à peça', async () => {
    const onSelecionar = vi.fn();
    render(<PainelSaidasIncendio analise={analise} hip={HS} onHip={vi.fn()} onSelecionar={onSelecionar} />);
    expect(screen.getByTestId('saidas-populacao').textContent).toContain('Tipo84 dormitório(s)');
    const t = screen.getByTestId('saidas-larguras').textContent!;
    expect(t).toContain('8 pessoa(s) (Tipo) → 2 unidade(s) de passagem');
    expect(t).toContain('1,10 m0,90 m');
    expect(screen.getByTestId('saidas-falta').textContent).toBe('1 saída(s) mais estreita(s) que o exigido.');
    expect(screen.getByText('o pavimento de descarga (Térreo) não tem porta para o exterior')).toBeInTheDocument();
    await userEvent.setup().click(within(screen.getByTestId('saidas-larguras')).getByRole('button', { name: 'E1' }));
    expect(onSelecionar).toHaveBeenCalledWith(['e1']);
  });

  it('as premissas gravam; m² por pessoa vazio volta à tabela', () => {
    const onHip = vi.fn();
    render(<PainelSaidasIncendio analise={analise} hip={{ ...HS, areaPorPessoaM2: 5 }} onHip={onHip} onSelecionar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Pessoas por dormitório'), { target: { value: '3' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HS, areaPorPessoaM2: 5, pessoasPorDormitorio: 3 });
    fireEvent.change(screen.getByLabelText('m² por pessoa'), { target: { value: '' } });
    expect(onHip).toHaveBeenLastCalledWith({ ...HS, areaPorPessoaM2: null });
  });
});

describe('PainelSaidasIncendio › proteção das escadas (E6.2)', () => {
  it('a exigida pela altura em vermelho quando a declarada não basta; trocar a proteção e marcar corta-fogo chamam o editor', async () => {
    const onProtecao = vi.fn();
    const onCortaFogo = vi.fn();
    render(<PainelSaidasIncendio analise={analise} hip={HS} onHip={vi.fn()} onSelecionar={vi.fn()} onProtecao={onProtecao} onCortaFogo={onCortaFogo} />);
    const sec = screen.getByTestId('saidas-protecao').textContent!;
    expect(sec).toContain('Exigida: enclausurada protegida (altura 20 m entre 12 e 30 m — CONFERIR NA IT) — a declarada não basta');
    expect(sec).toContain('2 porta(s) da caixa sem corta-fogo');
    const u = userEvent.setup();
    await u.selectOptions(screen.getByLabelText('Proteção da E1'), 'PF');
    expect(onProtecao).toHaveBeenCalledWith('e1', 'PF');
    await u.selectOptions(screen.getByLabelText('Proteção da E1'), '');
    expect(onProtecao).toHaveBeenLastCalledWith('e1', null);
    await u.click(screen.getByRole('button', { name: 'Marcar corta-fogo' }));
    expect(onCortaFogo).toHaveBeenCalledWith(['o1', 'o2']);
  });
});

