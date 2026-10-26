// @vitest-environment jsdom
/**
 * Casas dos lotes (26/10/2026, etapa 2 de docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md): escolhidos de
 * saída = lotes de casa sem planta; lote com planta só com confirmação; situação e "Abrir" por linha.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const confirmar = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => confirmar }));

import TelaCasasDosLotes from '../../components/blueprint/TelaCasasDosLotes';
import { PROGRAMA_CURTO_PADRAO } from '../../utils/blueprintPrograma';
import type { LoteParaCasa } from '../../utils/blueprintCasasDoLoteamento';

const lote = (n: string, extra: Partial<LoteParaCasa> = {}): LoteParaCasa => ({ loteId: `l${n}`, loteUid: `u${n}`, rotulo: `Quadra A · Lote ${n}`, areaM2: 360, elegivel: true, motivo: null, unidade: null, ...extra });
const LOTES = [lote('1'), lote('2', { unidade: { id: 'x', name: 'Lote 2', bedrooms: 4 } }), lote('3', { elegivel: false, motivo: 'Lote remanescente — não é lote de casa.', areaM2: 180 })];

function tela(extra: Partial<React.ComponentProps<typeof TelaCasasDosLotes>> = {}) {
  const props: React.ComponentProps<typeof TelaCasasDosLotes> = {
    lotes: LOTES,
    plantas: new Map([['u1', { studyId: 's1', nome: 'Residencial · Quadra A · Lote 1 — Casa' }]]),
    programa: PROGRAMA_CURTO_PADRAO,
    onEditarPrograma: vi.fn(),
    gerando: null,
    resultados: {},
    onGerar: vi.fn(),
    onParar: vi.fn(),
    onAbrir: vi.fn(),
    ...extra,
  };
  render(<TelaCasasDosLotes {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  confirmar.mockClear();
});

describe('TelaCasasDosLotes', () => {
  it('de saída escolhe só os lotes de casa sem planta, e gera sem perguntar', async () => {
    const p = tela();
    await waitFor(() => expect(screen.getByTestId('gerar-casas-dos-lotes')).toHaveTextContent('Gerar casas (1)'));
    fireEvent.click(screen.getByTestId('gerar-casas-dos-lotes'));
    await waitFor(() => expect(p.onGerar).toHaveBeenCalledWith(['u2']));
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('situação por linha: já tem planta (com Abrir), sem planta, remanescente fora com o motivo', () => {
    const p = tela();
    expect(screen.getByTestId('situacao-u1')).toHaveTextContent('Já tem planta');
    expect(screen.getByTestId('situacao-u2')).toHaveTextContent('Sem planta');
    expect(screen.getByTestId('situacao-u3')).toHaveTextContent('remanescente');
    fireEvent.click(screen.getByTitle('Abrir Residencial · Quadra A · Lote 1 — Casa'));
    expect(p.onAbrir).toHaveBeenCalledWith('s1');
  });

  it('escolher um lote que já tem planta pede confirmação; recusar não gera', async () => {
    confirmar.mockResolvedValueOnce(false);
    const p = tela();
    const linha = screen.getByTestId('situacao-u1').closest('tr')!;
    fireEvent.click(within(linha).getByRole('checkbox'));
    await waitFor(() => expect(screen.getByTestId('gerar-casas-dos-lotes')).toHaveTextContent('Gerar casas (2)'));
    fireEvent.click(screen.getByTestId('gerar-casas-dos-lotes'));
    await waitFor(() => expect(confirmar).toHaveBeenCalledTimes(1));
    expect(confirmar.mock.calls[0][0]).toMatchObject({ title: 'Gerar outra planta?' });
    expect(p.onGerar).not.toHaveBeenCalled();
  });

  it('unidades do Empreendimento ainda carregando: o botão espera (o programa de cada lote depende delas)', async () => {
    tela({ carregandoUnidades: true });
    await waitFor(() => expect(screen.getByTestId('gerar-casas-dos-lotes')).toBeDisabled());
    expect(screen.getByTestId('gerar-casas-dos-lotes').parentElement!.title).toMatch(/unidades do Empreendimento/);
  });

  it('carregando as plantas: o botão espera, dizendo por quê; gerando: andamento e Parar', () => {
    tela({ plantas: null });
    expect(screen.getByTestId('gerar-casas-dos-lotes')).toBeDisabled();
    expect(screen.getByTestId('gerar-casas-dos-lotes').parentElement!.title).toMatch(/conferindo/);
    cleanup();
    const p = tela({ gerando: { rotulo: 'Quadra A · Lote 2', indice: 1, total: 1, etapa: 'etapa 3 de 20: Estrutura' } });
    expect(screen.getByText(/Lote 1 de 1: Quadra A · Lote 2 — etapa 3 de 20: Estrutura/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('parar-casas-dos-lotes'));
    expect(p.onParar).toHaveBeenCalled();
  });

  it('resultado: planta criada com Abrir; falha com o motivo', () => {
    tela({ plantas: new Map(), resultados: { u1: { ok: true, studyId: 'n1', nome: 'Nova', avisos: [] }, u2: { ok: false, motivo: 'a casa não coube no lote' } } });
    expect(screen.getByTestId('situacao-u1')).toHaveTextContent('Planta criada');
    expect(screen.getByTestId('situacao-u2')).toHaveTextContent('Falhou: a casa não coube no lote');
    expect(screen.getByTitle('Abrir Nova')).toBeTruthy();
  });

  it('lote que acabou de ganhar planta sai da escolha', async () => {
    tela({ plantas: new Map(), resultados: { u1: { ok: true, studyId: 'n1', nome: 'Nova', avisos: [] } } });
    await waitFor(() => expect(screen.getByTestId('gerar-casas-dos-lotes')).toHaveTextContent('Gerar casas (1)'));
  });
});
