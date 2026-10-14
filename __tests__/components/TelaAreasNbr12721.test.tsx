// @vitest-environment jsdom
/**
 * Tela "Áreas NBR 12721" da Planta (13/10/2026, Fase 6 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): abas, KPIs, quadros
 * ao vivo, classificação (sugestões e lote), pendências e hipóteses; e a
 * coluna de fração da tela Unidades nos dois estados.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TelaAreasNbr12721 from '../../components/blueprint/TelaAreasNbr12721';
import TelaUnidades from '../../components/blueprint/TelaUnidades';
import { ConfirmProvider } from '../../components/ui/confirm';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { HIPOTESES_NBR12721_PADRAO } from '../../utils/blueprintNbr12721';
import { quadroDeUnidades } from '../../utils/blueprintUnidades';

/** "1º" com 2 apartamentos de 6 × 6 m sobre um hall de 12 × 2 m (o mesmo prédio dos testes do adaptador). */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 12000, 0, 200), w(12000, 0, 12000, 8000, 200), w(12000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200), w(0, 6000, 12000, 6000, 150), w(6000, 0, 6000, 6000, 150)]).model;
  const sala = (x: number) => m.spaces.find((s) => s.areaMm2 === 36_000_000 && Math.min(...s.ring.map((p) => p.x)) === x)!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala(0), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: sala(6000), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: m.spaces.find((s) => s.areaMm2 === 24_000_000)!.id, name: 'Hall' },
  ]).model;
  return applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [m.labels.find((l) => l.name === 'Sala 101')!.id] },
    { type: 'AddUnidade', numero: '102', labelIds: [m.labels.find((l) => l.name === 'Sala 102')!.id] },
  ]).model;
}

function montar(model = predio(), onSalvarHipoteses: ((h: typeof HIPOTESES_NBR12721_PADRAO) => Promise<void>) | null = vi.fn().mockResolvedValue(undefined)) {
  const onRunBatch = vi.fn();
  render(
    <ConfirmProvider>
      <TelaAreasNbr12721 model={model} hipoteses={HIPOTESES_NBR12721_PADRAO} onSalvarHipoteses={onSalvarHipoteses} onRunBatch={onRunBatch} erro={null} />
    </ConfirmProvider>,
  );
  return { onRunBatch, onSalvarHipoteses };
}

describe('TelaAreasNbr12721', () => {
  it('as sete abas; KPIs com a área real e as unidades; Classificação lista os ambientes com a sugestão', () => {
    montar();
    for (const aba of ['Classificação', 'Quadro I', 'Quadro II', 'Quadro IV-B', 'Frações', 'Pendências', 'Hipóteses']) {
      // Nome exato + o contador opcional ("Classificação 3") — "Quadro I" não pode casar "Quadro II".
      expect(screen.getByRole('tab', { name: (nome) => nome.replace(/\s*\d+$/, '') === aba })).toBeTruthy();
    }
    expect(screen.getByText(/ÁREA REAL|Área real/)).toBeTruthy();
    const tela = screen.getByTestId('tela-areas-nbr12721');
    expect(within(tela).getByText('Hall')).toBeTruthy();
    expect(within(tela).getByText(/sugestão: Coberta de padrão · proporcional/)).toBeTruthy();
    expect(within(tela).getAllByText(/sugestão: Coberta de padrão$/)).toHaveLength(2);
  });

  it('"Aplicar sugestões" grava UM lote com uma classificação por ambiente não classificado', async () => {
    const { onRunBatch } = montar();
    await userEvent.click(screen.getByRole('button', { name: /Aplicar sugestões \(3\)/ }));
    expect(onRunBatch).toHaveBeenCalledTimes(1);
    const lote = onRunBatch.mock.calls[0][0] as Command[];
    expect(lote).toHaveLength(3);
    expect(lote.every((c) => c.type === 'SetNbr12721DoAmbiente')).toBe(true);
  });

  it('classificar uma linha abre o drawer; Aplicar manda a classificação do formulário', async () => {
    const { onRunBatch } = montar();
    const linhaHall = screen.getByText('Hall').closest('tr')!;
    await userEvent.click(within(linhaHall).getByRole('button', { name: 'Classificar' }));
    await userEvent.selectOptions(screen.getByLabelText('Cobertura'), 'DIFERENTE');
    await userEvent.type(screen.getByLabelText('Coeficiente de equivalência'), '0,5');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const [cmd] = onRunBatch.mock.calls[0][0] as Command[];
    expect(cmd).toMatchObject({ type: 'SetNbr12721DoAmbiente', nbr12721: { cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' } });
  });

  it('Quadro I mostra o pavimento e a linha de total; Frações fecham 1000 milésimos', async () => {
    montar();
    await userEvent.click(screen.getByRole('tab', { name: /^Quadro I$/ }));
    expect(screen.getByText('1º')).toBeTruthy();
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('tab', { name: /^Frações/ }));
    expect(screen.getByText('1.000,0000')).toBeTruthy();
  });

  it('Pendências lista "a classificar"; Hipóteses: salvar desligado até mudar algo e sem permissão diz por quê', async () => {
    const { onSalvarHipoteses } = montar();
    await userEvent.click(screen.getByRole('tab', { name: /^Pendências/ }));
    expect(screen.getByText(/entraram pela sugestão da Planta/)).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: /^Hipóteses/ }));
    const salvar = screen.getByRole('button', { name: 'Salvar hipóteses' });
    expect((salvar as HTMLButtonElement).disabled).toBe(true);
    expect(salvar.getAttribute('title')).toBe('Nada mudou');
    await userEvent.type(screen.getByLabelText('Coberta de padrão diferente'), '0,75');
    expect((salvar as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(salvar);
    expect(onSalvarHipoteses).toHaveBeenCalledWith(expect.objectContaining({ coeficientesPadrao: { DIFERENTE: 0.75, DESCOBERTA: null } }));
  });

  it('sem permissão de editar, o botão de salvar hipóteses diz o motivo', async () => {
    montar(predio(), null);
    await userEvent.click(screen.getByRole('tab', { name: /^Hipóteses/ }));
    expect(screen.getByRole('button', { name: 'Salvar hipóteses' }).getAttribute('title')).toBe('Sem permissão para editar as hipóteses deste estudo');
  });
});

describe('TelaUnidades — a coluna de fração diz QUAL fração', () => {
  const base = (fracoesNbr12721: React.ComponentProps<typeof TelaUnidades>['fracoesNbr12721']) => {
    const m = predio();
    render(<TelaUnidades model={m} quadro={quadroDeUnidades(m)} onRun={vi.fn()} onRunBatch={vi.fn()} erro={null} carregarDoPlantaAi={null} fracoesNbr12721={fracoesNbr12721} />);
  };

  it('com o Quadro IV-B: "Fração ideal (NBR 12721)" em milésimos', () => {
    base({ porNumero: new Map([['101', { decimal: 0.5, milesimos: 500 }], ['102', { decimal: 0.5, milesimos: 500 }]]), motivo: null });
    expect(screen.getByText('Fração ideal (NBR 12721)')).toBeTruthy();
    expect(screen.getAllByText('500,0000 ‰')).toHaveLength(2);
    expect(screen.queryByText('Fração estimada (sem coeficiente)')).toBeNull();
  });

  it('bloqueado: "Fração estimada (sem coeficiente)" e o motivo', () => {
    base({ porNumero: null, motivo: 'O quadro NBR 12721 está bloqueado (MOTOR_007: x)' });
    expect(screen.getByText('Fração estimada (sem coeficiente)')).toBeTruthy();
    expect(screen.getByText(/está bloqueado \(MOTOR_007/)).toBeTruthy();
    expect(screen.queryByText('Fração ideal (NBR 12721)')).toBeNull();
  });
});
