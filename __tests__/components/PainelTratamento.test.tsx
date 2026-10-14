// @vitest-environment jsdom
/** Tratamento individual (E7.1/E7.2): o dimensionamento, as unidades do plano, o filtro opcional, a conferência e o botão com o motivo. */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelTratamento from '../../components/blueprint/PainelTratamento';
import { HIPOTESES_TRATAMENTO_PADRAO, type DimensionamentoDoTratamento, type PlanoDeTratamento } from '../../utils/blueprintTratamento';

const dim: DimensionamentoDoTratamento = {
  pessoas: 4, contribuicaoDiariaL: 520, C: 130, Lf: 1,
  tanque: { T: 1, K: 65, volumeL: 1780, comprimentoMm: 1800, larguraMm: 900, profundidadeUtilMm: 1200 },
  filtro: { T: 1, volumeUtilL: 1000, diametroMm: 1050, leitoMm: 1200 },
  sumidouro: { areaM2: 10.4, diametroMm: 1500, alturaUtilMm: 1850 },
  avisos: [],
};
const hip = HIPOTESES_TRATAMENTO_PADRAO;

const plano: PlanoDeTratamento = {
  motivo: null,
  caixaId: 'ci',
  unidades: [
    { tipo: 'TANQUE_SEPTICO', at: { x: 8500, y: -1500 }, cotaMm: -725, medidas: { comprimentoMm: 2400, larguraMm: 1200, alturaMm: 1800 } },
    { tipo: 'SUMIDOURO', at: { x: 14450, y: -1500 }, cotaMm: -785, medidas: { comprimentoMm: 1500, larguraMm: 1500, alturaMm: 3000 } },
  ],
  apagados: 0,
  comandos: [{ type: 'DeleteTrecho', trechoId: 'x' }],
};

/** As premissas abrem recolhidas (14/10/2026). */
const abrirHipoteses = () => fireEvent.click(screen.getByRole('button', { name: /hipóteses do tratamento/i }));

describe('PainelTratamento (E7.1)', () => {
  beforeEach(() => localStorage.clear());

  it('as unidades com as medidas e a cota do tubo — sem botão de lançar (14/10/2026: o rodapé lança o tratamento)', () => {
    render(<PainelTratamento plano={plano} dim={dim} unidades={[]} hip={hip} onHip={vi.fn()} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('tratamento-dimensionamento').textContent).toContain('V = 1000 + N(C·T + K·Lf) = 1.780 L → 1,80 × 0,90 m, h útil 1,20 m');
    expect(screen.getByTestId('tratamento-unidades').textContent).toContain('Tanque séptico 2,40 × 1,20 m, altura 1,80 m · tubo a -0,73 m');
    expect(screen.getByTestId('tratamento-unidades').textContent).toContain('Sumidouro ø 1,50 m, altura 3,00 m');
    expect(screen.queryByRole('button', { name: /lançar/i })).toBeNull();
  });

  it('o resultado vem ANTES das premissas, que abrem recolhidas com o resumo (14/10/2026)', () => {
    render(<PainelTratamento plano={plano} dim={dim} unidades={[]} hip={hip} onHip={vi.fn()} onSelecionar={vi.fn()} />);
    const resultado = screen.getByTestId('tratamento-dimensionamento');
    const bloco = screen.getByTestId('hipoteses-tratamento');
    expect(resultado.compareDocumentPosition(bloco) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bloco).toHaveTextContent(/padrão médio · com filtro/);
    expect(screen.queryByLabelText('Taxa de infiltração do solo em litros por metro quadrado por dia')).toBeNull();
  });

  it('o filtro opcional devolve a premissa; sem o que lançar, o motivo', () => {
    const onHip = vi.fn();
    render(<PainelTratamento plano={{ ...plano, motivo: 'O lote tem ligação à rede pública — o esgoto vai para ela; o tratamento individual não se aplica.', unidades: [], comandos: [] }} dim={dim} unidades={[{ terminalId: 'ts', tipo: 'TANQUE_SEPTICO', tem: 1080, precisa: 1780, unidade: 'L', atende: false }]} hip={hip} onHip={onHip} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('tratamento-verificacao').textContent).toBe('Tanque séptico: tem 1.080 L, precisa 1.780 L — insuficiente');
    abrirHipoteses();
    fireEvent.click(screen.getByLabelText('Com filtro anaeróbio entre o tanque e o sumidouro'));
    expect(onHip).toHaveBeenCalledWith({ ...hip, comFiltro: false });
    expect(screen.getByTestId('tratamento-motivo')).toHaveTextContent(/rede pública/);
  });

  it('apagar a infiltração e sair NÃO grava (antes gravava 1 L/m²·dia e o sumidouro saía gigante)', () => {
    const onHip = vi.fn();
    render(<PainelTratamento plano={plano} dim={dim} unidades={[]} hip={hip} onHip={onHip} onSelecionar={vi.fn()} />);
    abrirHipoteses();
    const infiltracao = screen.getByLabelText('Taxa de infiltração do solo em litros por metro quadrado por dia');
    fireEvent.change(infiltracao, { target: { value: '' } });
    fireEvent.blur(infiltracao);
    expect(onHip).not.toHaveBeenCalled();
    expect(infiltracao).toHaveValue(hip.taxaDeInfiltracaoLM2Dia);
    const frio = screen.getByLabelText('Temperatura média do mês mais frio em graus');
    fireEvent.change(frio, { target: { value: '12' } });
    fireEvent.blur(frio);
    expect(onHip).toHaveBeenCalledWith({ ...hip, temperaturaC: 12 });
  });
});
