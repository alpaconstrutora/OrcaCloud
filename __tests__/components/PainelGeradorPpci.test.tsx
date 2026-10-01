// @vitest-environment jsdom
/**
 * INCÊNDIO E10 (01/10/2026): a gaveta do gerador de PPCI — etapas, lançar
 * desligado dizendo por quê, o relatório por grupo e o download.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelGeradorPpci, { type GeradorPpciNoPainel } from '../../components/blueprint/PainelGeradorPpci';
import { emptyModel } from '../../utils/blueprintKernel';
import type { PlanoDoPpci } from '../../utils/blueprintGeradorPpci';

const plano: PlanoDoPpci = {
  comandos: [{ type: 'AddLevel', name: 'x', elevationMm: 0, defaultHeightMm: 2800 }],
  criados: ['lvl_0001'],
  etapas: [
    { id: 'EXTINTORES', rotulo: 'Extintores (com placa)', situacao: 'LANCOU', comandos: 16, nota: null },
    { id: 'SPRINKLERS', rotulo: 'Sprinklers por ambiente e traçado', situacao: 'NAO_EXIGIDA', comandos: 0, nota: null },
    { id: 'REDE', rotulo: 'Rede de hidrantes', situacao: 'NAO_RODOU', comandos: 0, nota: 'sem bomba' },
  ],
  pendencias: [
    { grupo: 'VERIFICACAO', texto: 'Percurso de fuga: 35 acima' },
    { grupo: 'CONFERIR', texto: 'Hidrantes simultâneos: 2 (IT do CBMMG)' },
  ],
  resultado: emptyModel(),
};
const g = (extra: Partial<GeradorPpciNoPainel> = {}): GeradorPpciNoPainel => ({ plano, gerando: false, onGerar: vi.fn(), prova: { ok: true }, onLancar: vi.fn(), lancado: null, onBaixar: vi.fn(), ...extra });

describe('PainelGeradorPpci (E10)', () => {
  it('sem prévia: só o botão de gerar; lançar não aparece', () => {
    const e = g({ plano: null });
    render(<PainelGeradorPpci g={e} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gerar a prévia' }));
    expect(e.onGerar).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Lançar tudo/ })).toBeNull();
  });

  it('com a prévia: as etapas com a situação, o relatório por grupo (as faltas abertas) e lançar', () => {
    const e = g();
    render(<PainelGeradorPpci g={e} />);
    const etapas = within(screen.getByTestId('ppci-etapas')).getAllByRole('listitem').map((li) => li.textContent);
    expect(etapas).toEqual(['Extintores (com placa)lança · 16', 'Sprinklers por ambiente e traçadonão exigida', 'Rede de hidrantesnão rodou']);
    expect(screen.getByText('Percurso de fuga: 35 acima')).toBeTruthy();
    expect(screen.queryByText('Hidrantes simultâneos: 2 (IT do CBMMG)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /CONFERIR NA NORMA/ }));
    expect(screen.getByText('Hidrantes simultâneos: 2 (IT do CBMMG)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lançar tudo \(1 comando\)/ }));
    expect(e.onLancar).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Relatório PDF/ }));
    expect(e.onBaixar).toHaveBeenCalledWith('pdf');
  });

  it('Fase B: o arranjo da fonte e da reserva — mudar chama onMudar; sem bomba no catálogo, diz que entra sem curva', () => {
    const onMudar = vi.fn();
    render(<PainelGeradorPpci g={g({ arranjo: { alimentacao: 'BOMBA', reserva: 'PROPRIA', bombasNoCatalogo: 0, onMudar } })} />);
    fireEvent.change(screen.getByLabelText('Alimentação da rede'), { target: { value: 'GRAVIDADE' } });
    expect(onMudar).toHaveBeenCalledWith({ alimentacao: 'GRAVIDADE' });
    fireEvent.change(screen.getByLabelText('Reserva técnica'), { target: { value: 'PARCELA' } });
    expect(onMudar).toHaveBeenCalledWith({ reserva: 'PARCELA' });
    expect(screen.getByText(/Nenhuma bomba de incêndio no catálogo: a bomba entra sem curva/)).toBeTruthy();
  });

  it('desenho mudado depois da prévia: lançar fica desligado dizendo por quê', () => {
    render(<PainelGeradorPpci g={g({ prova: { ok: false, motivo: 'o desenho mudou desde a prévia — gere de novo' } })} />);
    const b = screen.getByRole('button', { name: /Lançar tudo/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('o desenho mudou desde a prévia — gere de novo');
  });
});
