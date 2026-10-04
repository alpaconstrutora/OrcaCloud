// @vitest-environment jsdom
/**
 * Tour guiado dos portais — motor v2 (04/10/2026).
 * docs/planos/2026-10-04-tour-guiado-v2-portais.md
 *
 * O que trava:
 *   1. o passo é resolvido QUANDO o tour chega nele: passo sem âncora (e sem
 *      `quando`) é pulado ali, e a contagem "Passo i de n" conta todos;
 *   2. passo com `quando` e sem elemento aparece centralizado com a nota
 *      "Disponível quando…";
 *   3. passo de outra aba chama `onNavigate(section)` UMA vez e espera a âncora
 *      (a volta para a aba de origem é do PortalHelp — PortalHelpTour.test);
 *   4. clique fora NÃO encerra; Escape, X, Pular e Concluir encerram;
 *   5. sem nenhuma âncora termina como 'pulado' sem aparecer;
 *   6. funciona dentro de um <iframe> (prévia mobile): procura no ownerDocument.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { render, screen, waitFor, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PortalTour } from '../../components/portal/PortalTour';
import { posicaoDoPopover } from '../../utils/portalTour';
import type { MergedTourStep } from '../../utils/portalHelpDefaults';

const passo = (anchor: string, title: string, extra: Partial<MergedTourStep> = {}): MergedTourStep => ({
  key: `t.${anchor}`, anchor, section: null, tour: 'geral', title, body: `Texto de ${title}`,
  rowId: null, origin: 'padrao', hidden: false, ...extra,
});

// jsdom não mede layout: dá área a quem tem data-area
const comArea = (proto: { getBoundingClientRect: () => DOMRect }) => {
  proto.getBoundingClientRect = function (this: Element) {
    const area = Number((this as HTMLElement).getAttribute?.('data-area') ?? 0);
    return { top: 40, left: 20, width: area, height: area, right: 20 + area, bottom: 40 + area, x: 20, y: 40, toJSON: () => ({}) } as DOMRect;
  };
};
const rectOriginal = Element.prototype.getBoundingClientRect;
beforeEach(() => { comArea(Element.prototype); });
afterEach(() => {
  Element.prototype.getBoundingClientRect = rectOriginal;
  document.querySelectorAll('[data-ancoras]').forEach(el => el.remove());
});

const ancoras = (quais: { anchor: string; area?: number }[], doc: Document = document) => {
  const raiz = doc.createElement('div');
  raiz.setAttribute('data-ancoras', '');
  for (const q of quais) {
    const el = doc.createElement('button');
    el.setAttribute('data-tour', q.anchor);
    el.setAttribute('data-area', String(q.area ?? 100));
    el.textContent = `alvo ${q.anchor}`;
    raiz.appendChild(el);
  }
  doc.body.appendChild(raiz);
  return raiz;
};

const RAPIDO = { maxTentativas: 3, tentativasCurtas: 1, intervaloMs: 5 };

describe('PortalTour v2', () => {
  it('pula o passo sem âncora ao chegar nele; contagem conta todos; Concluir no último', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    ancoras([{ anchor: 'menu' }, { anchor: 'ajuda' }]);
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('sumiu', 'Fantasma'), passo('ajuda', 'Ajuda')]} onFinish={onFinish} {...RAPIDO} />);
    expect(await screen.findByText('Bem-vindo')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(await screen.findByText('Ajuda')).toBeInTheDocument();
    expect(screen.getByText('Passo 3 de 3')).toBeInTheDocument();
    expect(screen.queryByText('Fantasma')).not.toBeInTheDocument();
    // o passo pulado fica marcado nos pontos
    expect(document.querySelectorAll('[data-ponto="pulado"]')).toHaveLength(1);
    // Anterior volta direto ao 1º (o 2º não existe)
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Bem-vindo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    await user.click(await screen.findByRole('button', { name: 'Concluir' }));
    expect(onFinish).toHaveBeenCalledWith('concluido', 3);
  });

  it('passo com `quando` e sem elemento aparece centralizado com a nota', async () => {
    const user = userEvent.setup();
    ancoras([{ anchor: 'menu' }]);
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('contratos-detalhes', 'Ver Detalhes', { quando: 'quando a construtora liberar um contrato' })]} onFinish={vi.fn()} {...RAPIDO} />);
    await screen.findByText('Bem-vindo');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(await screen.findByText('Ver Detalhes')).toBeInTheDocument();
    expect(screen.getByText('Disponível quando a construtora liberar um contrato.')).toBeInTheDocument();
    expect(screen.getByText('Passo 2 de 2')).toBeInTheDocument();
  });

  it('passo de outra aba navega uma vez e espera a âncora; o motor não volta sozinho', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    ancoras([{ anchor: 'menu' }]);
    let secao = 'dashboard';
    const onNavigate = vi.fn((s: string) => {
      secao = s;
      if (s === 'documentos') setTimeout(() => ancoras([{ anchor: 'documentos-enviar' }]), 20);
      rerender(<PortalTour steps={steps} onFinish={onFinish} currentSection={secao} onNavigate={onNavigate} maxTentativas={20} tentativasCurtas={1} intervaloMs={10} />);
    });
    const steps = [passo('menu', 'Bem-vindo'), passo('documentos-enviar', 'Enviar um arquivo', { section: 'documentos' })];
    const { rerender } = render(<PortalTour steps={steps} onFinish={onFinish} currentSection={secao} onNavigate={onNavigate} maxTentativas={20} tentativasCurtas={1} intervaloMs={10} />);
    await screen.findByText('Bem-vindo');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(await screen.findByText('Enviar um arquivo')).toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('documentos');
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith('concluido', 2);
  });

  it('clique fora não encerra; Escape encerra como pulado', async () => {
    const onFinish = vi.fn();
    ancoras([{ anchor: 'menu' }]);
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('ajuda', 'Ajuda')]} onFinish={onFinish} {...RAPIDO} />);
    const dialogo = await screen.findByRole('dialog', { name: 'Tour do portal' });
    const camada = dialogo.previousElementSibling as HTMLElement;
    fireEvent.click(camada);
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByText('Bem-vindo')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledWith('pulado', 1);
  });

  it('Pular e o X encerram como pulado, informando até onde chegou', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    ancoras([{ anchor: 'menu' }, { anchor: 'ajuda' }, { anchor: 'conta' }]);
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('ajuda', 'Ajuda'), passo('conta', 'Conta')]} onFinish={onFinish} {...RAPIDO} />);
    await screen.findByText('Bem-vindo');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    await screen.findByText('Ajuda');
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onFinish).toHaveBeenCalledWith('pulado', 2);
  });

  it('passos de cromo que não estão nesta tela (celular) não contam: o último visível já mostra Concluir', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    ancoras([{ anchor: 'menu' }, { anchor: 'mobile-mais' }]);
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('mobile-mais', 'Mais seções'), passo('ajuda', 'Ajuda'), passo('conta', 'Conta')]} onFinish={onFinish} {...RAPIDO} />);
    await screen.findByText('Bem-vindo');
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    await screen.findByText('Mais seções');
    expect(screen.queryByRole('button', { name: 'Próximo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pular' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(onFinish).toHaveBeenCalledWith('concluido', 4);
  });

  it('passo de OUTRA aba depois deste não conta como ausente (pode existir lá)', async () => {
    ancoras([{ anchor: 'menu' }]);
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('pedidos-tabela', 'Pedidos', { section: 'orders' })]} onFinish={vi.fn()} onNavigate={vi.fn()} {...RAPIDO} />);
    await screen.findByText('Bem-vindo');
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeInTheDocument();
  });

  it('sem nenhuma âncora termina como pulado sem aparecer', async () => {
    const onFinish = vi.fn();
    render(<PortalTour steps={[passo('menu', 'Bem-vindo'), passo('ajuda', 'Ajuda')]} onFinish={onFinish} {...RAPIDO} />);
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('pulado', 0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('espera o primeiro alvo aparecer (portal carregando)', async () => {
    const onFinish = vi.fn();
    render(<PortalTour steps={[passo('menu', 'Bem-vindo')]} onFinish={onFinish} maxTentativas={40} intervaloMs={10} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { await new Promise(r => setTimeout(r, 60)); ancoras([{ anchor: 'menu' }]); });
    expect(await screen.findByText('Bem-vindo')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('dentro de um iframe (prévia mobile) acha a âncora no documento do iframe, não no da página', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    comArea((iframe.contentWindow as unknown as { Element: { prototype: { getBoundingClientRect: () => DOMRect } } }).Element.prototype);
    // a página de fora NÃO tem a âncora; o iframe tem
    ancoras([{ anchor: 'menu' }], doc);
    const onFinish = vi.fn();
    const { unmount } = render(<>{createPortal(<PortalTour steps={[passo('menu', 'Bem-vindo no celular')]} onFinish={onFinish} {...RAPIDO} />, doc.body)}</>);
    expect(await within(doc.body).findByText('Bem-vindo no celular')).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
    unmount();
    iframe.remove();
  });
});

describe('posicaoDoPopover', () => {
  const pop = { width: 320, height: 210 };
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
