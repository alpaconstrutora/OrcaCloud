// @vitest-environment jsdom
/**
 * O painel de detecção e alarme (01/10/2026, E7.4): o que falta (central,
 * cobertura, acionador, avisador, laço) com seleção; tudo certo em verde;
 * a proposta desligada sem nada a lançar.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelAlarmeIncendio from '../../components/blueprint/PainelAlarmeIncendio';
import { FONTE_ALARME, type AnaliseDeAlarme } from '../../utils/blueprintDeteccaoAlarme';

const base: AnaliseDeAlarme = { deteccaoExigida: true, alarmeExigido: true, ambientes: [], longeDoAcionador: [], pavimentosSemAvisador: [], semCentral: false, foraDoLaco: [], fonte: FONTE_ALARME };

describe('PainelAlarmeIncendio', () => {
  it('o que falta, com o pior acionador e a seleção dos ambientes e dos fora do laço', async () => {
    const onSelecionar = vi.fn();
    const a: AnaliseDeAlarme = {
      ...base,
      semCentral: true,
      ambientes: [
        { spaceId: 's1', levelId: 'l', rotulo: 'Sala 2', detector: 'DETECTOR_FUMACA', descobertos: 4, atende: false },
        { spaceId: 's2', levelId: 'l', rotulo: 'Sala 3', detector: 'DETECTOR_FUMACA', descobertos: 0, atende: true },
      ],
      longeDoAcionador: [{ spaceId: 's1', rotulo: 'Sala 2', distanciaM: 41.25 }],
      pavimentosSemAvisador: [{ levelId: 'l', nome: 'Térreo' }],
      foraDoLaco: ['d1', 'd2'],
    };
    render(<PainelAlarmeIncendio analise={a} onSelecionar={onSelecionar} proposta={{ quantos: 9, onPropor: vi.fn() }} />);
    const t = screen.getByTestId('alarme-falta').textContent!;
    expect(t).toContain('Não há central de alarme');
    expect(t).toContain('1 ambiente(s) sem cobertura de detector (Sala 2)');
    expect(t).toContain('1 ambiente(s) a mais de 30 m de um acionador (pior: 41,3 m)');
    expect(t).toContain('Térreo: nenhum avisador');
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: '2 dispositivo(s) fora do laço de uma central' }));
    expect(onSelecionar).toHaveBeenCalledWith(['d1', 'd2']);
    await u.click(screen.getByRole('button', { name: '1 ambiente(s) sem cobertura de detector' }));
    expect(onSelecionar).toHaveBeenLastCalledWith(['s1']);
    expect(screen.getByRole('button', { name: 'Propor 9 item(ns)' })).toBeEnabled();
  });

  it('nada exigido e nada faltando: verde, proposta desligada com o motivo', () => {
    render(<PainelAlarmeIncendio analise={{ ...base, deteccaoExigida: false, alarmeExigido: false }} onSelecionar={vi.fn()} proposta={{ quantos: 0, onPropor: vi.fn() }} />);
    expect(screen.getByTestId('alarme-ok').textContent).toBe('Nada exigido, e o que foi lançado está no laço.');
    const b = screen.getByRole('button', { name: 'Propor detecção e alarme' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toBe('nada a lançar');
  });
});
