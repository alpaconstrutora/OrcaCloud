// @vitest-environment jsdom
/**
 * OS MEMORIAIS NO PAINEL DO EXECUTIVO ELÉTRICO (E5.3, 29/09/2026).
 *
 * Os dois memoriais baixam A QUALQUER MOMENTO (antes da emissão), em PDF ou
 * DOCX; os textos do descritivo se editam ali; cada emissão baixa em PDF e DOCX.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelEletricaExecutivo from '../../components/blueprint/PainelEletricaExecutivo';
import { RESPONSAVEL_VAZIO } from '../../utils/blueprintTopografiaExecutivo';
import type { BlocoDoMemorial } from '../../utils/blueprintMemorialHidro';
import type { BlueprintProjetoExecutivoRow } from '../../types/blueprint';

const calculo: BlocoDoMemorial[] = [{ tipo: 'titulo', texto: 'Memorial de cálculo' }, { tipo: 'secao', texto: 'Hipóteses' }, { tipo: 'secao', texto: 'Quadros e circuitos' }];
const descritivo: BlocoDoMemorial[] = [{ tipo: 'titulo', texto: 'Memorial descritivo' }, { tipo: 'secao', texto: 'Objeto' }, { tipo: 'secao', texto: 'Normas' }];
const EMITIDO = { id: 'e1', hash_da_base: 'h'.repeat(64), emitido_em: '2026-09-29T12:00:00Z', responsavel: { ...RESPONSAVEL_VAZIO, nome: 'Eng.', artNumero: '123', conselho: 'CREA' }, memorial: '# x' } as unknown as BlueprintProjetoExecutivoRow;

const base = (extra: Record<string, unknown> = {}) => ({
  responsavel: RESPONSAVEL_VAZIO,
  onResponsavel: vi.fn(),
  resultado: null,
  emitidos: [EMITIDO],
  emissaoValida: null,
  hashDaBaseAtual: 'h'.repeat(64),
  onEmitir: vi.fn(),
  emitindo: false,
  erro: null,
  onBaixarMemorial: vi.fn(),
  persistenciaIndisponivel: false,
  ...extra,
});

describe('PainelEletricaExecutivo · memoriais (E5.3)', () => {
  it('antes da emissão: os dois cartões com o sumário das seções; PDF e DOCX chamam onBaixar com o memorial e o formato', async () => {
    const onBaixar = vi.fn().mockResolvedValue(undefined);
    render(<PainelEletricaExecutivo e={base({ memoriais: { calculo, descritivo, onBaixar } })} />);
    const painel = screen.getByTestId('memoriais-eletricos');
    const calc = within(painel).getByTestId('memorial-calculo');
    expect(within(calc).getByText('Hipóteses')).toBeTruthy();
    expect(within(calc).getByText('Quadros e circuitos')).toBeTruthy();
    await userEvent.click(within(within(painel).getByTestId('memorial-descritivo')).getByRole('button', { name: /DOCX/ }));
    expect(onBaixar).toHaveBeenCalledWith('descritivo', 'docx');
    await userEvent.click(within(calc).getByRole('button', { name: /PDF/ }));
    expect(onBaixar).toHaveBeenCalledWith('calculo', 'pdf');
  });

  it('sem quadro: os botões ficam desligados dizendo por quê', () => {
    const vazio: BlocoDoMemorial[] = [{ tipo: 'titulo', texto: 'x' }];
    render(<PainelEletricaExecutivo e={base({ memoriais: { calculo: vazio, descritivo: vazio, onBaixar: vi.fn() } })} />);
    const painel = screen.getByTestId('memoriais-eletricos');
    expect(within(painel).getAllByText('O desenho não tem quadro de distribuição — não há o que memorializar.')).toHaveLength(2);
    for (const b of within(painel).getAllByRole('button', { name: /PDF|DOCX/ })) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toBe('Sem quadro de distribuição no desenho');
    }
  });

  it('os textos do descritivo se editam no painel (o padrão aparece como sugestão); cada emissão baixa em PDF e em DOCX', () => {
    const onTextos = vi.fn();
    const onBaixarMemorial = vi.fn();
    render(<PainelEletricaExecutivo e={base({ memoriais: { calculo, descritivo, onBaixar: vi.fn() }, textosDoMemorial: { objeto: 'Casa térrea' }, onTextosDoMemorial: onTextos, onBaixarMemorial })} />);
    const objeto = screen.getByLabelText('Texto do memorial — Objeto') as HTMLTextAreaElement;
    expect(objeto.value).toBe('Casa térrea');
    fireEvent.change(objeto, { target: { value: 'Reforma' } });
    expect(onTextos).toHaveBeenLastCalledWith({ objeto: 'Reforma' });
    const aterramento = screen.getByLabelText('Texto do memorial — Aterramento') as HTMLTextAreaElement;
    expect(aterramento.placeholder).toMatch(/Tabela 58/);
    fireEvent.change(aterramento, { target: { value: 'TN-S' } });
    expect(onTextos).toHaveBeenLastCalledWith({ objeto: 'Casa térrea', aterramento: 'TN-S' });
    const emitidos = screen.getByTestId('eletrica-emitidos');
    fireEvent.click(within(emitidos).getByRole('button', { name: 'Memorial (PDF)' }));
    expect(onBaixarMemorial).toHaveBeenLastCalledWith(EMITIDO, 'pdf');
    fireEvent.click(within(emitidos).getByRole('button', { name: 'DOCX' }));
    expect(onBaixarMemorial).toHaveBeenLastCalledWith(EMITIDO, 'docx');
  });

  it('sem `memoriais`, a seção não aparece (quem monta o painel sem o editor continua igual)', () => {
    render(<PainelEletricaExecutivo e={base()} />);
    expect(screen.queryByTestId('memoriais-eletricos')).toBeNull();
  });
});
