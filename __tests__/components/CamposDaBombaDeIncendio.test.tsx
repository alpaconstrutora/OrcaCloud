// @vitest-environment jsdom
/**
 * A bomba de incêndio no painel (30/09/2026, E4.1): a curva digitada se aplica
 * num passo só e diz por que não dá; a jockey escolhe a principal; NPSH em m.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CamposDaBombaDeIncendio, { curvaDigitada } from '../../components/blueprint/CamposDaBombaDeIncendio';
import type { Terminal } from '../../utils/blueprintKernel';

const bomba = (tipoHidraulico: 'BOMBA_INCENDIO' | 'BOMBA_JOCKEY', extra: Partial<Terminal> = {}): Terminal => ({
  id: 'b1', uid: 'u1', levelId: 'l1', disciplina: 'INCENDIO', tipo: 'Bomba', at: { x: 0, y: 0 }, cotaMm: 300, tipoHidraulico, ...extra,
});

describe('CamposDaBombaDeIncendio', () => {
  it('digitar 3 pontos e aplicar grava a curva em mm; antes disso, o botão diz por que não', async () => {
    const onBomba = vi.fn();
    render(<CamposDaBombaDeIncendio terminal={bomba('BOMBA_INCENDIO')} principais={[]} onBomba={onBomba} />);
    const b = screen.getByRole('button', { name: 'Aplicar curva' });
    expect(b.getAttribute('title')).toMatch(/3 pontos ou mais/);
    const pts = [['0', '60'], ['600', '52'], ['900', '40,5']];
    pts.forEach(([q, h], i) => {
      fireEvent.change(screen.getByLabelText(`Vazão do ponto ${i + 1} (L/min)`), { target: { value: q } });
      fireEvent.change(screen.getByLabelText(`Altura do ponto ${i + 1} (m)`), { target: { value: h } });
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aplicar curva' }));
    expect(onBomba).toHaveBeenLastCalledWith({ curvaBomba: [{ vazaoLmin: 0, alturaMm: 60000 }, { vazaoLmin: 600, alturaMm: 52000 }, { vazaoLmin: 900, alturaMm: 40500 }] });
  });

  it('a validação é a do kernel: vazão que não cresce e altura que sobe', () => {
    expect(curvaDigitada([{ q: '0', h: '60' }, { q: '0', h: '50' }, { q: '900', h: '40' }])).toEqual({ motivo: 'ponto 2: a vazão tem de crescer' });
    expect(curvaDigitada([{ q: '0', h: '60' }, { q: '600', h: '70' }, { q: '900', h: '40' }])).toEqual({ motivo: 'ponto 2: a altura não pode subir com a vazão' });
  });

  it('a jockey escolhe a principal; sem principal no desenho, a opção diz isso', async () => {
    const onBomba = vi.fn();
    const { unmount } = render(<CamposDaBombaDeIncendio terminal={bomba('BOMBA_JOCKEY')} principais={[{ id: 'p1', nome: 'BI-1' }]} onBomba={onBomba} />);
    await userEvent.setup().selectOptions(screen.getByLabelText('Bomba principal da jockey'), 'p1');
    expect(onBomba).toHaveBeenLastCalledWith({ bombaPrincipalId: 'p1' });
    unmount();
    render(<CamposDaBombaDeIncendio terminal={bomba('BOMBA_JOCKEY')} principais={[]} onBomba={vi.fn()} />);
    expect(screen.getByLabelText('Bomba principal da jockey').textContent).toContain('não há bomba principal no desenho');
  });

  it('NPSH em metros vira mm', () => {
    const onBomba = vi.fn();
    render(<CamposDaBombaDeIncendio terminal={bomba('BOMBA_INCENDIO')} principais={[]} onBomba={onBomba} />);
    fireEvent.change(screen.getByLabelText('NPSH requerido da bomba (m)'), { target: { value: '3.5' } });
    expect(onBomba).toHaveBeenLastCalledWith({ npshrMm: 3500 });
  });
});
