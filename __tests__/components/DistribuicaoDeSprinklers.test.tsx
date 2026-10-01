// @vitest-environment jsdom
/**
 * A distribuição automática de sprinklers (01/10/2026, E5.3): sem ambiente o
 * botão diz por quê; com ambiente, as alternativas lado a lado com contagem e
 * comprimento; escolher outra muda o que "Lançar" lança.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DistribuicaoDeSprinklers from '../../components/blueprint/DistribuicaoDeSprinklers';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../utils/blueprintKernel';
import { HIPOTESES_SPRINKLERS_PADRAO as HS, criterioDeSprinklers } from '../../utils/blueprintSprinklersIncendio';
import { distribuirSprinklers } from '../../utils/blueprintDistribuicaoSprinklers';

function sala() {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const l = m.levels[0].id;
  const c = [point(0, 0), point(12000, 0), point(12000, 8000), point(0, 8000)];
  m = applyBatch(m, c.map((a, i) => ({ type: 'AddWall', levelId: l, a, b: c[(i + 1) % 4], thicknessMm: 150, heightMm: 2800 }) as Command)).model;
  return m;
}

describe('DistribuicaoDeSprinklers', () => {
  it('sem ambiente: "Lançar" desligado com o motivo', () => {
    render(<DistribuicaoDeSprinklers ambientes={[{ id: 's1', nome: 'Salão', areaM2: 96 }]} spaceId={null} onSpace={vi.fn()} contorno={null} plano={null} onLancar={vi.fn()} />);
    const b = screen.getByRole('button', { name: 'Lançar sprinklers' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toBe('escolha o ambiente');
  });

  it('as alternativas lado a lado; a primeira vem escolhida, e escolher outra muda o lançamento', async () => {
    const m = sala();
    const s = m.spaces[0];
    const plano = distribuirSprinklers(m, s.id, criterioDeSprinklers({ ...HS, risco: 'ORDINARIO_1' }, null), HS);
    const onLancar = vi.fn();
    render(<DistribuicaoDeSprinklers ambientes={[{ id: s.id, nome: 'Salão', areaM2: 96 }]} spaceId={s.id} onSpace={vi.fn()} contorno={s.ring} plano={plano} onLancar={onLancar} />);
    expect(screen.getAllByRole('radio').length).toBe(plano.alternativas.length);
    expect(screen.getByTestId('alternativa-Y|MAXIMO').textContent).toContain('8 sprinklers · 4,00 × 3,00 m');
    expect(screen.getByTestId('alternativa-Y|MAXIMO').getAttribute('aria-checked')).toBe('true');
    const u = userEvent.setup();
    await u.click(screen.getByTestId('alternativa-X|QUADRADO'));
    await u.click(screen.getByRole('button', { name: 'Lançar 12 sprinklers' }));
    expect(onLancar).toHaveBeenCalledWith(plano.alternativas.find((a) => a.chave === 'X|QUADRADO'));
  });
});
