// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelGerarParedes from '../../components/blueprint/PainelGerarParedes';
import type { Underlay } from '../../utils/blueprintUnderlay';

/**
 * A recusa por falta de escala.
 *
 * Nasceu de um caso real: o usuário importou uma prancha, não aferiu, gerou, e
 * o modelo ganhou 13 paredes somando 2,5 m com espessuras de 5, 6, 8, 9, 10 e
 * 11 cm. Nenhuma delas é parede. O painel AVISAVA e gerava assim mesmo — e um
 * resultado errado que parece plausível é pior que nenhum resultado.
 */
const UNDERLAY: Underlay = {
  origemXMm: 0,
  origemYMm: 0,
  mmPorPixel: 1,
  rotacaoMrad: 0,
};

const base = {
  underlay: UNDERLAY,
  temFundo: true,
  pranchaId: 'u1',
  limitesDaVista: null,
  regiao: null,
  regiaoArmada: false,
  onArmarRegiao: vi.fn(),
  onLimparRegiao: vi.fn(),
  onExtrair: vi.fn(),
  onVetorGuardado: vi.fn().mockResolvedValue(null),
  onRegravar: vi.fn(),
  onGerar: vi.fn(),
  ocupado: false,
};

describe('PainelGerarParedes · sem escala não gera', () => {
  it('RECUSA, e diz o que fazer', async () => {
    render(<PainelGerarParedes {...base} semAfericao />);
    expect(
      await screen.findByText(/escala desta prancha não foi estabelecida/i),
    ).toBeInTheDocument();
    // Não basta avisar: não pode haver botão de gerar.
    expect(screen.queryByRole('button', { name: /gerar/i })).not.toBeInTheDocument();
  });

  it('com escala estabelecida, a recusa some', async () => {
    render(<PainelGerarParedes {...base} semAfericao={false} />);
    expect(
      screen.queryByText(/escala desta prancha não foi estabelecida/i),
    ).not.toBeInTheDocument();
  });

  it('sem fundo, pede o fundo antes de qualquer coisa', () => {
    render(<PainelGerarParedes {...base} temFundo={false} semAfericao />);
    expect(screen.getByText(/importe a planta de fundo/i)).toBeInTheDocument();
  });
});

/**
 * A JANELA de região.
 *
 * Nasceu do uso real: numa prancha com várias plantas, isolar uma pelo zoom
 * obriga a enquadrar só ela — num zoom que não é o de leitura. A janela
 * desacopla as duas coisas, e por isso tem de VENCER o enquadramento: o
 * enquadramento muda a cada rolagem, sem intenção.
 *
 * Os controles só existem depois que há vetor extraído (é o que dá o
 * histograma de espessuras), então o `onVetorGuardado` aqui devolve segmentos
 * de verdade em vez de `null`.
 */
const COM_VETOR = {
  ...base,
  semAfericao: false,
  onVetorGuardado: vi.fn().mockResolvedValue({
    segmentos: [
      { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, larguraPt: 0.6 },
      { a: { x: 0, y: 20 }, b: { x: 100, y: 20 }, larguraPt: 0.6 },
    ],
    paraPixel: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
  }),
};

describe('PainelGerarParedes · a janela de região', () => {
  it('sem região marcada, diz que vale o enquadramento', async () => {
    render(<PainelGerarParedes {...COM_VETOR} />);
    expect(await screen.findByText(/sem região marcada/i)).toBeInTheDocument();
    // E não oferece "Limpar" o que não existe.
    expect(screen.queryByRole('button', { name: /limpar/i })).not.toBeInTheDocument();
  });

  it('com região marcada, mostra a cota dela em metros', async () => {
    render(
      <PainelGerarParedes {...COM_VETOR} regiao={{ x0: 0, y0: 0, x1: 12_400, y1: 8_100 }} />,
    );
    // 12.400 mm × 8.100 mm lidos como metros — é a cota que diz se a janela
    // pegou a planta inteira ou parou no meio dela.
    expect(await screen.findByText(/12,40 × 8,10 m/)).toBeInTheDocument();
    expect(screen.queryByText(/sem região marcada/i)).not.toBeInTheDocument();
  });

  it('o botão de limpar só aparece com região, e devolve o enquadramento', async () => {
    const onLimparRegiao = vi.fn();
    render(
      <PainelGerarParedes
        {...COM_VETOR}
        regiao={{ x0: 0, y0: 0, x1: 1000, y1: 1000 }}
        onLimparRegiao={onLimparRegiao}
      />,
    );
    const limpar = await screen.findByRole('button', { name: /limpar/i });
    fireEvent.click(limpar);
    expect(onLimparRegiao).toHaveBeenCalledTimes(1);
  });

  it('armado, o botão diz para arrastar no desenho', async () => {
    render(<PainelGerarParedes {...COM_VETOR} regiaoArmada />);
    const botao = await screen.findByRole('button', { name: /arraste no desenho/i });
    // `aria-pressed` é o que conta o estado para quem navega por teclado — sem
    // ele, "armado" só existe na cor.
    expect(botao).toHaveAttribute('aria-pressed', 'true');
  });

  it('arma ao clicar', async () => {
    const onArmarRegiao = vi.fn();
    render(<PainelGerarParedes {...COM_VETOR} onArmarRegiao={onArmarRegiao} />);
    fireEvent.click(await screen.findByRole('button', { name: /marcar região/i }));
    expect(onArmarRegiao).toHaveBeenCalledTimes(1);
  });
});

/**
 * F15 — RASTREAR COM IA (12/10/2026). A IA propõe; o fundo confere; o usuário aplica. A tela tem de dizer
 * quantas paredes foram ACEITAS e quantas DESCARTADAS, e por quê — e nada se aplica sem o clique.
 */
describe('PainelGerarParedes · rastrear com IA (F15)', () => {
  const comIa = { ...base, semAfericao: false, onRastrear: vi.fn(), onAplicarRastreio: vi.fn(), onDescartarRastreio: vi.fn() };

  it('sem vetor, a região e o botão de rastrear aparecem; sem escala o botão desliga e diz o motivo', async () => {
    const { rerender } = render(<PainelGerarParedes {...comIa} />);
    expect(await screen.findByText(/de que parte da prancha/i)).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: /rastrear a área visível/i });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    expect(comIa.onRastrear).toHaveBeenCalledTimes(1);

    rerender(<PainelGerarParedes {...comIa} semAfericao />);
    expect(screen.getByRole('button', { name: /rastrear/i })).toBeDisabled();
    expect(screen.getByText(/a IA não mede/i)).toBeInTheDocument();
  });

  it('o resultado mostra aceitas × descartadas com o motivo; aplicar e descartar chamam o editor', () => {
    render(
      <PainelGerarParedes
        {...comIa}
        rastreio={{
          propostas: 7,
          paredes: 5,
          aberturas: 2,
          ambientes: ['Sala', 'Cozinha'],
          descartes: [
            { motivo: 'sem traço de parede no fundo sob ela', n: 1 },
            { motivo: 'inclinada', n: 1 },
          ],
          observacao: 'parte inferior cortada',
          cortado: false,
          modelo: 'claude-opus-5-5',
        }}
      />,
    );
    expect(screen.getByText(/5 aceitas/)).toBeInTheDocument();
    expect(screen.getByText(/2 descartadas/)).toBeInTheDocument();
    expect(screen.getByText(/1 × sem traço de parede no fundo sob ela/)).toBeInTheDocument();
    expect(screen.getByText(/Sala · Cozinha/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rastrear/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /aplicar 5 paredes/i }));
    expect(comIa.onAplicarRastreio).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /descartar/i }));
    expect(comIa.onDescartarRastreio).toHaveBeenCalledTimes(1);
  });

  it('nada aceito: aplicar desliga e diz por quê', () => {
    render(
      <PainelGerarParedes
        {...comIa}
        rastreio={{ propostas: 3, paredes: 0, aberturas: 0, ambientes: [], descartes: [{ motivo: 'sem traço de parede no fundo sob ela', n: 3 }], observacao: '', cortado: true, modelo: null }}
      />,
    );
    const aplicar = screen.getByRole('button', { name: /aplicar 0 paredes/i });
    expect(aplicar).toBeDisabled();
    expect(aplicar).toHaveAttribute('title', expect.stringMatching(/nada foi aceito/i));
    expect(screen.getByText(/pode estar incompleta/i)).toBeInTheDocument();
  });
});
