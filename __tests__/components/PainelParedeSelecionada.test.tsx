// @vitest-environment jsdom
/**
 * Painel "Parede selecionada" (aba Ambientes do editor de plantas).
 *
 * O comprimento aqui deixou de ser texto morto: pedido do usuário em
 * 12/08/2026 foi digitar a cota do projetista e a parede fechar nela — hoje o
 * arraste da alça no canvas mira a olho, em pixel. `docs/planos/
 * 2026-08-12-comprimento-editavel-parede.md` tem o pedido literal.
 *
 * Este arquivo existe SEPARADO de `BlueprintEditor.test.tsx` porque selecionar
 * parede de verdade exige clique no canvas, que é opaco em jsdom — extrair o
 * componente foi o que tornou a interação testável.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PainelParedeSelecionada from '../../components/blueprint/PainelParedeSelecionada';
import { point, type Opening, type Wall } from '../../utils/blueprintKernel';

/** Parede de 4,00 m no eixo horizontal. */
function parede(over: Partial<Wall> = {}): Wall {
  return {
    id: 'wal_0001',
    levelId: 'lvl_1',
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 150,
    heightMm: 2800,
    ...over,
  };
}

/** Porta de 900 mm, no padrão de sempre: dobradiça no início, sem espelhar. */
function porta(over: Partial<Opening> = {}): Opening {
  return {
    id: 'opn_1',
    wallId: 'wal_1',
    kind: 'door',
    offsetMm: 1500,
    widthMm: 900,
    heightMm: 2100,
    sillMm: 0,
    hingeAtStart: true,
    swingReversed: false,
    ...over,
  };
}

function montar(over: Partial<React.ComponentProps<typeof PainelParedeSelecionada>> = {}) {
  const props: React.ComponentProps<typeof PainelParedeSelecionada> = {
    parede: parede(),
    abertura: null,
    pontaQueAnda: 'b',
    arrastaCanto: false,
    onComprimento: vi.fn(),
    onEspessura: vi.fn(),
    podeUnir: false,
    onDividir: vi.fn(),
    onUnir: vi.fn(),
    onFlipAbertura: vi.fn(),
    ...over,
  };
  render(<PainelParedeSelecionada {...props} />);
  return props;
}

function campo() {
  return screen.getByRole('textbox', { name: /comprimento da parede/i }) as HTMLInputElement;
}

describe('PainelParedeSelecionada · sem seleção', () => {
  it('sem parede nem abertura, não renderiza a caixa', () => {
    const { container } = render(
      <PainelParedeSelecionada
        parede={null}
        abertura={null}
        pontaQueAnda={null}
        arrastaCanto={false}
        onComprimento={vi.fn()}
        onEspessura={vi.fn()}
        podeUnir={false}
        onDividir={vi.fn()}
        onUnir={vi.fn()}
        onFlipAbertura={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PainelParedeSelecionada · campo de comprimento', () => {
  it('mostra o comprimento atual, em metros, com vírgula', () => {
    montar({ parede: parede({ a: point(0, 0), b: point(4100, 0) }) });
    expect(campo().value).toBe('4,10');
  });

  it('ENTER aplica o valor digitado, convertido para mm', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.type(campo(), '4,10');
    await user.keyboard('{Enter}');

    expect(props.onComprimento).toHaveBeenCalledExactlyOnceWith(4100);
  });

  it('aceita ponto decimal também', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.type(campo(), '3.52');
    await user.keyboard('{Enter}');

    expect(props.onComprimento).toHaveBeenCalledExactlyOnceWith(3520);
  });

  it('perder o foco SEM apertar Enter também aplica', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.type(campo(), '5');
    await user.tab();

    expect(props.onComprimento).toHaveBeenCalledExactlyOnceWith(5000);
  });

  it('ESCAPE descarta: não chama onComprimento e restaura o texto exibido', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: parede({ a: point(0, 0), b: point(4000, 0) }) });

    await user.clear(campo());
    await user.type(campo(), '999');
    await user.keyboard('{Escape}');

    expect(props.onComprimento).not.toHaveBeenCalled();
    expect(campo().value).toBe('4,00');
  });

  it('valor zerado, negativo ou não numérico não chama onComprimento', async () => {
    const user = userEvent.setup();
    const props = montar();

    for (const invalido of ['0', '-3', 'abc']) {
      await user.clear(campo());
      await user.type(campo(), invalido);
      await user.keyboard('{Enter}');
    }

    expect(props.onComprimento).not.toHaveBeenCalled();
  });

  it('campo vazio + Enter não chama onComprimento (e não trava em NaN)', async () => {
    const user = userEvent.setup();
    const props = montar();

    await user.clear(campo());
    await user.keyboard('{Enter}');

    expect(props.onComprimento).not.toHaveBeenCalled();
  });

  it('trocar de parede selecionada RESSINCRONIZA o campo com o novo modelo', () => {
    const { rerender } = render(<PainelParedeSelecionada {...montarProps()} />);
    expect(campo().value).toBe('4,00');

    const outraParede = parede({ id: 'wal_0002', a: point(0, 0), b: point(2500, 0) });
    rerender(
      <PainelParedeSelecionada
        {...montarProps()}
        parede={outraParede}
      />,
    );

    expect(campo().value).toBe('2,50');
  });

  it('o arraste da alça no canvas (comprimento mudou, mesma parede) também ressincroniza', () => {
    const { rerender } = render(<PainelParedeSelecionada {...montarProps()} />);
    expect(campo().value).toBe('4,00');

    rerender(
      <PainelParedeSelecionada
        {...montarProps()}
        parede={parede({ a: point(0, 0), b: point(4750, 0) })}
      />,
    );

    expect(campo().value).toBe('4,75');
  });
});

describe('PainelParedeSelecionada · texto de ajuda sobre qual ponta anda', () => {
  it('ponta livre: avisa que não arrasta canto', () => {
    montar({ pontaQueAnda: 'a', arrastaCanto: false });
    expect(screen.getByText(/estica a ponta inicial \(livre\)/i)).toBeInTheDocument();
  });

  it('ponta presa: avisa que o canto vai junto', () => {
    montar({ pontaQueAnda: 'b', arrastaCanto: true });
    expect(screen.getByText(/estica a ponta final — o canto vai junto/i)).toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · abertura selecionada', () => {
  it('mostra o resumo da abertura, sem campo de comprimento', () => {
    render(
      <PainelParedeSelecionada
        parede={null}
        abertura={porta()}
        pontaQueAnda={null}
        arrastaCanto={false}
        onComprimento={vi.fn()}
        onEspessura={vi.fn()}
        podeUnir={false}
        onDividir={vi.fn()}
        onUnir={vi.fn()}
        onFlipAbertura={vi.fn()}
      />,
    );
    expect(screen.getByText(/porta de/i)).toBeInTheDocument();
    expect(screen.getByText(/900 mm/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /comprimento/i })).not.toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · girar e espelhar porta', () => {
  // Pedido de 14/08/2026: "ao selecionar uma porta, implementar opcao de girar
  // e espelhar". São dois EIXOS INDEPENDENTES — dobradiça (girar) e lado da
  // folha (espelhar) — não um único botão de 180°, por decisão confirmada com
  // o usuário: as 4 combinações são as 4 variações padrão de porta em planta.

  it('porta selecionada oferece Girar e Espelhar', () => {
    montar({ parede: null, abertura: porta() });
    expect(screen.getByRole('button', { name: /girar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /espelhar/i })).toBeInTheDocument();
  });

  it('Girar chama onFlipAbertura com o eixo "hinge"', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.click(screen.getByRole('button', { name: /girar/i }));
    expect(props.onFlipAbertura).toHaveBeenCalledExactlyOnceWith('hinge');
  });

  it('Espelhar chama onFlipAbertura com o eixo "swing"', async () => {
    const user = userEvent.setup();
    const props = montar({ parede: null, abertura: porta() });

    await user.click(screen.getByRole('button', { name: /espelhar/i }));
    expect(props.onFlipAbertura).toHaveBeenCalledExactlyOnceWith('swing');
  });

  it('janela NÃO oferece Girar/Espelhar — não tem dobradiça nem lado de giro', () => {
    montar({ parede: null, abertura: porta({ kind: 'window', sillMm: 900 }) });
    expect(screen.queryByRole('button', { name: /girar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /espelhar/i })).not.toBeInTheDocument();
  });
});

describe('PainelParedeSelecionada · unir', () => {
  it('botão Unir desabilitado sem vizinha colinear', () => {
    montar({ podeUnir: false });
    expect(screen.getByRole('button', { name: /unir/i })).toBeDisabled();
  });

  it('botão Unir habilitado e chama onUnir', async () => {
    const user = userEvent.setup();
    const props = montar({ podeUnir: true });

    const botao = screen.getByRole('button', { name: /unir/i });
    expect(botao).toBeEnabled();
    await user.click(botao);
    expect(props.onUnir).toHaveBeenCalledOnce();
  });
});

// Props default reaproveitadas nos casos de rerender acima.
function montarProps(): React.ComponentProps<typeof PainelParedeSelecionada> {
  return {
    parede: parede(),
    abertura: null,
    pontaQueAnda: 'b',
    arrastaCanto: false,
    onComprimento: vi.fn(),
    onEspessura: vi.fn(),
    podeUnir: false,
    onDividir: vi.fn(),
    onUnir: vi.fn(),
    onFlipAbertura: vi.fn(),
  };
}
