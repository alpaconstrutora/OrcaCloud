// @vitest-environment jsdom
/**
 * Tour guiado dos portais — o componente que realça e conduz.
 * F3 (04/10/2026), docs/planos/2026-10-03-ajuda-portais-externos.md
 *
 * O que trava:
 *   1. passo sem âncora no DOM é pulado; passo com âncora sem área (oculta) idem;
 *   2. "Próximo" até o fim termina como 'concluido'; "Pular" termina como 'pulado';
 *   3. sem nenhuma âncora, termina sozinho como 'pulado' (não fica insistindo);
 *   4. espera a âncora aparecer (portal ainda carregando) antes de começar.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PortalTour } from '../../components/portal/PortalTour';
import { posicaoDoPopover } from '../../utils/portalTour';
import type { MergedTourStep } from '../../utils/portalHelpDefaults';

const passo = (key: string, anchor: string, title: string): MergedTourStep => ({
  key, anchor, section: null, title, body: `Texto de ${title}`, rowId: null, origin: 'padrao', hidden: false,
});
const PASSOS = [passo('t.menu', 'menu', 'Bem-vindo'), passo('t.doc', 'aba-documentos', 'Documentos'), passo('t.ajuda', 'ajuda', 'Ajuda à mão')];

// jsdom não mede layout: damos área aos elementos marcados com data-area
const rectOriginal = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const area = Number((this as HTMLElement).getAttribute?.('data-area') ?? 0);
    return { top: 40, left: 20, width: area, height: area, right: 20 + area, bottom: 40 + area, x: 20, y: 40, toJSON: () => ({}) } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal;
  // as âncoras vão direto no body (fora do container do RTL): limpar à mão
  document.querySelectorAll('[data-tour]').forEach(el => el.parentElement?.remove());
});

const montarAncoras = (quais: { anchor: string; area: number }[]) => {
  const raiz = document.createElement('div');
  for (const q of quais) {
    const el = document.createElement('button');
    el.setAttribute('data-tour', q.anchor);
    el.setAttribute('data-area', String(q.area));
    el.textContent = q.anchor;
    raiz.appendChild(el);
  }
  document.body.appendChild(raiz);
  return raiz;
};

describe('PortalTour', () => {
  it('pula passo sem âncora e passo com âncora oculta; Próximo até o fim = concluido', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    montarAncoras([{ anchor: 'menu', area: 100 }, { anchor: 'aba-documentos', area: 0 }]);
    render(<PortalTour steps={PASSOS} onFinish={onFinish} maxTentativas={1} />);
    expect(await screen.findByRole('dialog', { name: 'Tour do portal' })).toBeInTheDocument();
    expect(screen.getByText('Bem-vindo')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 1')).toBeInTheDocument();
    expect(screen.queryByText('Documentos')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(onFinish).toHaveBeenCalledWith('concluido');
  });

  it('dois passos visíveis: Próximo avança, Anterior volta, Pular termina como pulado', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    montarAncoras([{ anchor: 'menu', area: 100 }, { anchor: 'ajuda', area: 24 }]);
    render(<PortalTour steps={PASSOS} onFinish={onFinish} maxTentativas={1} />);
    await screen.findByText('Passo 1 de 2');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('Ajuda à mão')).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Passo 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onFinish).toHaveBeenCalledWith('pulado');
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('sem nenhuma âncora termina sozinho como pulado, sem renderizar nada', async () => {
    const onFinish = vi.fn();
    render(<PortalTour steps={PASSOS} onFinish={onFinish} maxTentativas={1} />);
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('pulado'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('espera a âncora do primeiro passo aparecer (portal carregando)', async () => {
    const onFinish = vi.fn();
    render(<PortalTour steps={PASSOS} onFinish={onFinish} maxTentativas={10} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { montarAncoras([{ anchor: 'menu', area: 100 }]); });
    expect(await screen.findByText('Bem-vindo', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('Escape pula', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    montarAncoras([{ anchor: 'menu', area: 100 }]);
    render(<PortalTour steps={PASSOS} onFinish={onFinish} maxTentativas={1} />);
    await screen.findByText('Bem-vindo');
    await user.keyboard('{Escape}');
    expect(onFinish).toHaveBeenCalledWith('pulado');
  });
});

describe('posicaoDoPopover', () => {
  const pop = { width: 320, height: 190 };
  const janela = { width: 1400, height: 800 };
  it('à direita quando cabe', () => {
    expect(posicaoDoPopover({ top: 100, left: 0, width: 256, height: 400 }, pop, janela)).toMatchObject({ lado: 'direita', left: 272, top: 100 });
  });
  it('abaixo quando não cabe à direita; acima quando também não cabe abaixo; nunca fora da janela', () => {
    expect(posicaoDoPopover({ top: 20, left: 1300, width: 40, height: 40 }, pop, janela)).toMatchObject({ lado: 'abaixo', top: 76, left: 1400 - 320 - 16 });
    const acima = posicaoDoPopover({ top: 700, left: 1300, width: 40, height: 40 }, pop, janela);
    expect(acima.lado).toBe('acima');
    expect(acima.top).toBeGreaterThanOrEqual(16);
    expect(acima.top + pop.height).toBeLessThanOrEqual(janela.height - 16);
  });
});
