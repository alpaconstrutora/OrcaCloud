// @vitest-environment jsdom
/**
 * BALANCEAR NA ABA QUADROS (E6.1, 29/09/2026).
 *
 * "Balancear" abre a PRÉVIA (desequilíbrio antes → depois, quem muda); só
 * "Aplicar" grava — um lote (o `runBatch` do editor, um Ctrl+Z). Desligado,
 * o botão diz por quê. O select de fase do F-F oferece o PAR.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEletrica from '../../components/blueprint/PainelEletrica';
import { applyCommand, emptyModel, point, type BlueprintModel, type FaseDoCircuito, type LigacaoDoCircuito } from '../../utils/blueprintKernel';
import { HIPOTESES_PADRAO } from '../../utils/blueprintEletricaDimensionamento';

function cena(circs: { va: number; fase?: FaseDoCircuito; ligacao?: LigacaoDoCircuito }[]): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(0, 0), cotaMm: 1600, ligacao: 'FFF', tensaoV: 220, alimentadorM: 12 }).model;
  const quadroId = m.quadros[0].id;
  circs.forEach((c, i) => {
    const lig = c.ligacao ?? 'FN';
    m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: `C${i + 1}`, tensaoV: lig === 'FN' ? 127 : 220, ligacao: lig, ...(c.fase ? { fase: c.fase } : {}) }).model;
    const id = m.circuitos[m.circuitos.length - 1].id;
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUE', at: point(1000 * (i + 1), 75), cotaMm: 300, tipoEletrico: 'TUE', potenciaW: c.va }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: id }).model;
  });
  return m;
}

const painel = (m: BlueprintModel, onDR = vi.fn(), onCircuitoProps = vi.fn()) =>
  render(<PainelEletrica model={m} onAddCircuito={vi.fn()} onCircuitoProps={onCircuitoProps} onQuadroProps={vi.fn()} onDR={onDR} hipoteses={HIPOTESES_PADRAO} />);

async function abrirQuadros() {
  await userEvent.setup().click(screen.getByRole('tab', { name: /^quadros/i }));
}

describe('PainelEletrica · Balancear (E6.1)', () => {
  it('abre a prévia (antes → depois, quem muda) sem gravar; "Aplicar" manda o lote inteiro de uma vez', async () => {
    const onDR = vi.fn();
    painel(cena([{ va: 3000 }, { va: 2500 }, { va: 2000 }, { va: 1500 }, { va: 1200 }, { va: 800 }]), onDR);
    await abrirQuadros();
    const botao = screen.getByRole('button', { name: 'Balancear' });
    expect((botao as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(botao);
    expect(onDR).not.toHaveBeenCalled();
    const previa = screen.getByTestId('previa-balanceamento');
    expect(previa.textContent).toMatch(/Desequilíbrio — \(sem contar 6 sem fase\) → \d+,\d %/);
    expect(previa.textContent).toMatch(/limite 10,0 %/);
    expect(previa.textContent).toMatch(/C1: — → [RST]/);
    await userEvent.click(within(previa).getByRole('button', { name: /Aplicar \(6 circuitos\)/ }));
    expect(onDR).toHaveBeenCalledTimes(1);
    const lote = onDR.mock.calls[0][0] as { type: string; fase: string }[];
    expect(lote).toHaveLength(6);
    expect(lote.every((c) => c.type === 'SetCircuitoProps' && ['R', 'S', 'T'].includes(c.fase))).toBe(true);
    expect(screen.queryByTestId('previa-balanceamento')).toBeNull();
  });

  it('"Cancelar" fecha a prévia sem gravar', async () => {
    const onDR = vi.fn();
    painel(cena([{ va: 3000 }, { va: 1000 }, { va: 1000 }]), onDR);
    await abrirQuadros();
    await userEvent.click(screen.getByRole('button', { name: 'Balancear' }));
    await userEvent.click(within(screen.getByTestId('previa-balanceamento')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('previa-balanceamento')).toBeNull();
    expect(onDR).not.toHaveBeenCalled();
  });

  it('já equilibrado: o botão fica desligado e o title diz por quê', async () => {
    painel(cena([{ va: 1000, fase: 'R' }, { va: 1000, fase: 'S' }, { va: 1000, fase: 'T' }]));
    await abrirQuadros();
    const botao = screen.getByRole('button', { name: 'Balancear' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toMatch(/nada a mudar/);
  });

  it('⚠️ o select de fase do F-F oferece o PAR (R-S, S-T, T-R) — antes o F-F nem tinha select', async () => {
    const onCircuitoProps = vi.fn();
    painel(cena([{ va: 2000, ligacao: 'FF' }, { va: 1000 }]), vi.fn(), onCircuitoProps);
    await abrirQuadros();
    const sel = screen.getByLabelText('Fase do circuito C1') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['—', 'R-S', 'S-T', 'T-R']);
    await userEvent.selectOptions(sel, 'S');
    expect(onCircuitoProps).toHaveBeenLastCalledWith(expect.any(String), { fase: 'S' });
  });
});
