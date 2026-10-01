// @vitest-environment jsdom
/**
 * O painel de EMISSÃO do projeto executivo hidrossanitário (E3.3, 29/09/2026):
 * botão desligado dizendo por quê, ✗ no grupo da norma, emitir, o carimbo da
 * emissão válida e o memorial gravado em PDF e DOCX.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PainelHidroExecutivo, { type HidroExecutivoNoPainel } from '../../components/blueprint/PainelHidroExecutivo';
import type { BlueprintProjetoExecutivoRow } from '../../types/blueprint';
import type { ResultadoHidroExecutivo } from '../../utils/blueprintHidroExecutivo';
import { ROTULO_DO_GRUPO_DE_INCENDIO } from '../../utils/blueprintIncendioExecutivo';

const ana = { nome: 'Ana', titulo: 'Engenheira Civil', conselho: 'CREA' as const, registro: '5069', artNumero: '2802', artData: '2026-09-29' };
const ok: ResultadoHidroExecutivo = {
  verificacoes: [{ grupo: 'NBR8160', item: 'Tubo de queda ventilado', norma: 'NBR 8160:1999', exigido: 'todo TQ', obtido: '1 TQ ventilado(s)', atende: true }],
  podeEmitir: true,
  pendencias: [],
};
const pendente: ResultadoHidroExecutivo = {
  verificacoes: [{ grupo: 'NBR5626', item: 'Pressão dinâmica mínima em cada ponto', norma: 'NBR 5626:2020', exigido: '≥ 10 kPa', obtido: '1 ponto(s) abaixo', atende: false }],
  podeEmitir: false,
  pendencias: ['Pressão dinâmica mínima em cada ponto: 1 ponto(s) abaixo'],
};
const props = (extra: Partial<HidroExecutivoNoPainel> = {}): HidroExecutivoNoPainel => ({
  responsavel: ana,
  onResponsavel: vi.fn(),
  resultado: ok,
  emitidos: [],
  emissaoValida: null,
  hashDaBaseAtual: 'h1',
  onEmitir: vi.fn(),
  emitindo: false,
  erro: null,
  onBaixarMemorial: vi.fn(),
  persistenciaIndisponivel: false,
  ...extra,
});

describe('PainelHidroExecutivo (E3.3)', () => {
  it('incêndio (E8.4): o mesmo painel com os textos e os grupos de incêndio', () => {
    const resultado = { verificacoes: [{ grupo: 'SAIDAS', item: 'Percurso de fuga de todos os ambientes', norma: 'NBR 9077', exigido: '≤ 30 m', obtido: '1 acima', atende: false }], podeEmitir: false, pendencias: ['x'] };
    render(
      <PainelHidroExecutivo
        e={props({ resultado })}
        textos={{ rotuloDoGrupo: ROTULO_DO_GRUPO_DE_INCENDIO, conferencia: 'a conferência de incêndio', disciplina: 'de incêndio', testId: 'incendio-executivo' }}
      />,
    );
    expect(screen.getByTestId('incendio-executivo')).toBeTruthy();
    expect(screen.getByText('Saídas e rota de fuga — NBR 9077')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Emitir projeto executivo de incêndio \(ART\)/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('com pendência: botão desligado com o motivo e o ✗ no grupo da NBR 5626', () => {
    render(<PainelHidroExecutivo e={props({ resultado: pendente })} />);
    const botao = screen.getByRole('button', { name: /Emitir projeto executivo hidrossanitário \(ART\)/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe('1 verificação(ões) pendente(s)');
    const lista = screen.getByTestId('hidro-verificacoes');
    expect(within(lista).getByText('Água fria e quente — NBR 5626')).toBeTruthy();
    expect(within(lista).getByText('✗')).toBeTruthy();
  });

  it('sem pendência: emite; digitar o nome chama onResponsavel; CAU vira RRT', () => {
    const e = props();
    const { rerender } = render(<PainelHidroExecutivo e={e} />);
    fireEvent.click(screen.getByRole('button', { name: /Emitir/ }));
    expect(e.onEmitir).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana S.' } });
    expect(e.onResponsavel).toHaveBeenCalledWith({ nome: 'Ana S.' });
    rerender(<PainelHidroExecutivo e={props({ responsavel: { ...ana, conselho: 'CAU' } })} />);
    expect(screen.getByRole('button', { name: /\(RRT\)/ })).toBeTruthy();
  });

  it('sem a tabela no banco: não emite, e diz por quê', () => {
    render(<PainelHidroExecutivo e={props({ persistenciaIndisponivel: true })} />);
    const botao = screen.getByRole('button', { name: /Emitir/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toMatch(/Sem a tabela do projeto executivo/);
  });

  it('emissão válida: o carimbo no lugar do formulário; a lista diz o que vale e baixa PDF/DOCX do memorial gravado', () => {
    const row = { id: 'r1', hash_da_base: 'h1', responsavel: ana, emitido_em: '2026-09-29T10:00:00Z', memorial: '# x' } as unknown as BlueprintProjetoExecutivoRow;
    const velha = { ...row, id: 'r0', hash_da_base: 'h0' } as BlueprintProjetoExecutivoRow;
    const e = props({ emitidos: [row, velha], emissaoValida: { artNumero: '2802', responsavel: 'Ana', conselho: 'CREA', registro: '5069', emitidoEm: '2026-09-29T10:00:00Z' } });
    render(<PainelHidroExecutivo e={e} />);
    expect(screen.getByTestId('hidro-emitido').textContent).toMatch(/Emitido — ART nº 2802/);
    expect(screen.queryByTestId('hidro-responsavel')).toBeNull();
    const lista = screen.getByTestId('hidro-emitidos');
    expect(within(lista).getByText('(vale para o desenho atual)')).toBeTruthy();
    expect(within(lista).getByText('(o desenho ou as premissas mudaram desde a emissão)')).toBeTruthy();
    fireEvent.click(within(lista).getAllByRole('button', { name: 'DOCX' })[0]);
    expect(e.onBaixarMemorial).toHaveBeenCalledWith(row, 'docx');
  });
});
