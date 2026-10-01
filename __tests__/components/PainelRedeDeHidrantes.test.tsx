// @vitest-environment jsdom
/**
 * O painel da rede de hidrantes automática (30/09/2026, E3.1): resumo do plano,
 * lançar num lote, aceitar os sugeridos, e cada botão desligado dizendo por quê.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelRedeDeHidrantes from '../../components/blueprint/PainelRedeDeHidrantes';
import { HIPOTESES_REDE_DE_HIDRANTES_PADRAO as HIP, type PlanoDaRedeDeHidrantes } from '../../utils/blueprintRedeDeHidrantes';

const plano = (p: Partial<PlanoDaRedeDeHidrantes> = {}): PlanoDaRedeDeHidrantes => ({
  motivo: null, colunas: [{ x: 8300, y: 4000, hidranteIds: ['h1', 'h2'], pavimentos: 2 }], aLigar: ['h1', 'h2'], jaLigados: [], apagados: 0,
  comandos: [{ type: 'AddTrecho' } as never, { type: 'AddTrecho' } as never], metros: 31.5, ...p,
});

describe('PainelRedeDeHidrantes', () => {
  it('resume o plano e lança num lote', async () => {
    const onLancar = vi.fn();
    render(<PainelRedeDeHidrantes hip={HIP} onHip={vi.fn()} plano={plano()} prova={{ ok: true }} sugeridos={[]} onLancar={onLancar} onAceitar={vi.fn()} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('rede-de-hidrantes-resumo').textContent).toMatch(/Liga 2 hidrante\(s\) por 1 coluna\(s\): 2 trechos, 31,5 m/);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lançar a rede' }));
    expect(onLancar).toHaveBeenCalled();
    // Nada sugerido: aceitar desligado, com o motivo.
    expect(screen.getByRole('button', { name: /Aceitar a rede/ }).getAttribute('title')).toMatch(/não há trecho de incêndio sugerido/);
  });

  it('plano que não fecha não deixa lançar, e diz por quê', () => {
    render(<PainelRedeDeHidrantes hip={HIP} onHip={vi.fn()} plano={plano()} prova={{ ok: false, motivo: '1 hidrante(s) não chegaram à bomba' }} sugeridos={[]} onLancar={vi.fn()} onAceitar={vi.fn()} onSelecionar={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Lançar a rede' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toMatch(/o plano não fecha: 1 hidrante/);
  });

  it('com sugeridos: relançar e aceitar os N', async () => {
    const onAceitar = vi.fn();
    render(<PainelRedeDeHidrantes hip={HIP} onHip={vi.fn()} plano={plano({ apagados: 5 })} prova={{ ok: true }} sugeridos={['t1', 't2']} onLancar={vi.fn()} onAceitar={onAceitar} onSelecionar={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Relançar a rede' })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aceitar a rede (2)' }));
    expect(onAceitar).toHaveBeenCalledWith(['t1', 't2']);
  });

  it('sem bomba: o motivo no lugar do resumo, e lançar desligado', () => {
    render(<PainelRedeDeHidrantes hip={HIP} onHip={vi.fn()} plano={plano({ motivo: 'lance a bomba de incêndio primeiro — a rede parte dela', colunas: [], aLigar: [], comandos: [] })} prova={null} sugeridos={[]} onLancar={vi.fn()} onAceitar={vi.fn()} onSelecionar={vi.fn()} />);
    expect(screen.getByTestId('rede-de-hidrantes-motivo').textContent).toMatch(/bomba de incêndio primeiro/);
    expect(screen.getByRole('button', { name: 'Lançar a rede' })).toBeDisabled();
  });
});
