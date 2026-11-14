// @vitest-environment jsdom
/**
 * Aba Lote/Unidade do empreendimento de unidade única (09/11/2026). Plano:
 * docs/planos/2026-11-09-empreendimento-unidade-unica.md.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  listTowers: vi.fn(async (): Promise<unknown[]> => []),
  listUnits: vi.fn(async (): Promise<unknown[]> => []),
  update: vi.fn(async () => ({})),
  salvarUnidadeUnica: vi.fn(async (_id: string, criar: { nomeDaTorre: string; nomeDaUnidade: string }, campos: Record<string, unknown>) => ({
    tower: { id: 't1', name: criar.nomeDaTorre },
    unit: { id: 'u1', tower_id: 't1', status: 'DISPONIVEL', name: (campos.name as string) || criar.nomeDaUnidade, ...campos },
  })),
}));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: svc }));
vi.mock('../../services/blueprintTerrenoDaPlanta', () => ({ terrenoDaPlantaVinculada: vi.fn(async () => null) }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));

import { UnidadeUnicaEditor } from '../../components/empreendimento/UnidadeUnicaEditor';

const EMP = { id: 'emp-1', organization_id: 'org-1', name: 'Lote Vale do Sol', terreno_area: 134, terreno_frente: 8 };
const NOME_PADRAO = { LOTE: 'Lote', IMOVEL_UNICO: 'Casa Residencial', UNIDADE_AUTONOMA: 'Apartamento Residencial' } as const;
const montar = (estrutura: keyof typeof NOME_PADRAO, nomeDoTipo: string = NOME_PADRAO[estrutura]) =>
  render(<UnidadeUnicaEditor empreendimentoId="emp-1" organizationId="org-1" empreendimento={EMP as never} estrutura={estrutura} nomeDoTipo={nomeDoTipo} />);

describe('UnidadeUnicaEditor', () => {
  beforeEach(() => {
    Object.values(svc).forEach(f => f.mockClear());
    svc.listTowers.mockResolvedValue([]);
    svc.listUnits.mockResolvedValue([]);
  });

  it('LOTE sem unidade: não grava ao abrir; vem preenchido e mostra área/testada do terreno', async () => {
    montar('LOTE');
    expect(await screen.findByTestId('secao-unidade-unica')).toBeInTheDocument();
    expect((screen.getByLabelText('Identificação *') as HTMLInputElement).value).toBe('Lote Vale do Sol');
    expect(screen.getByTestId('lote-area')).toHaveTextContent('134,00 m²');
    expect(screen.getByTestId('lote-testada')).toHaveTextContent('8,00 m');
    expect(screen.queryByText(/Nova torre/)).toBeNull();
    expect(svc.salvarUnidadeUnica).not.toHaveBeenCalled();
  });

  it('LOTE: cadastrar grava a unidade com a área e a testada do terreno', async () => {
    montar('LOTE');
    fireEvent.change(await screen.findByLabelText('Quadra'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Nº do lote'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar unidade/ }));
    await waitFor(() => expect(svc.salvarUnidadeUnica).toHaveBeenCalledTimes(1));
    expect(svc.salvarUnidadeUnica).toHaveBeenCalledWith(
      'emp-1',
      { nomeDaTorre: 'Lote', nomeDaUnidade: 'Lote Vale do Sol', tipologia: 'Lote' },
      expect.objectContaining({ name: 'Lote Vale do Sol', quadra: 'A', lote: '12', private_area: 134, total_area: 134, testada_m: 8 }),
    );
  });

  it('LOTE: salvar o terreno leva a área e a testada novas à unidade', async () => {
    montar('LOTE');
    fireEvent.change(await screen.findByLabelText('Área total (m²)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar terreno/ }));
    await waitFor(() => expect(svc.salvarUnidadeUnica).toHaveBeenCalledTimes(1));
    expect(svc.update).toHaveBeenCalledWith('emp-1', expect.objectContaining({ terreno_area: 150 }));
    expect(svc.salvarUnidadeUnica.mock.calls[0][2]).toEqual({ private_area: 150, total_area: 150, common_area: null, testada_m: 8 });
  });

  it('IMÓVEL ÚNICO: campos de unidade sem pavimento nem posição; salvar grava a casa', async () => {
    montar('IMOVEL_UNICO');
    expect(await screen.findByLabelText('Dormitórios')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pavimento')).toBeNull();
    expect(screen.queryByLabelText('Tipo de pavimento')).toBeNull();
    expect(screen.queryByLabelText('Posição')).toBeNull();
    expect((screen.getByLabelText('Tipologia') as HTMLInputElement).value).toBe('Casa Residencial');
    fireEvent.change(screen.getByLabelText('Área privativa (m²)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Dormitórios'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar unidade/ }));
    await waitFor(() => expect(svc.salvarUnidadeUnica).toHaveBeenCalledTimes(1));
    expect(svc.salvarUnidadeUnica.mock.calls[0][2]).toEqual(expect.objectContaining({ name: 'Lote Vale do Sol', typology: 'Casa Residencial', private_area: 90, bedrooms: 3 }));
    // Salvar o terreno de uma casa NÃO mexe na unidade (a área dela é a construída).
    fireEvent.change(screen.getByLabelText('Área total (m²)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar terreno/ }));
    await waitFor(() => expect(svc.update).toHaveBeenCalledTimes(1));
    expect(svc.salvarUnidadeUnica).toHaveBeenCalledTimes(1);
  });

  it('UNIDADE AUTÔNOMA (apartamento, 13/11/2026): só a Unidade — sem a seção Terreno', async () => {
    montar('UNIDADE_AUTONOMA');
    expect(await screen.findByTestId('secao-unidade-unica')).toBeInTheDocument();
    expect(screen.getByLabelText('Dormitórios')).toBeInTheDocument();
    expect(screen.queryByLabelText('Área total (m²)')).toBeNull();
    expect(screen.queryByRole('button', { name: /Salvar terreno/ })).toBeNull();
    expect(screen.queryByText(/Terreno/)).toBeNull();
    expect((screen.getByLabelText('Tipologia') as HTMLInputElement).value).toBe('Apartamento Residencial');
    fireEvent.change(screen.getByLabelText('Área privativa (m²)'), { target: { value: '72' } });
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar unidade/ }));
    await waitFor(() => expect(svc.salvarUnidadeUnica).toHaveBeenCalledTimes(1));
    expect(svc.salvarUnidadeUnica.mock.calls[0][1]).toEqual({ nomeDaTorre: 'Apartamento Residencial', nomeDaUnidade: 'Lote Vale do Sol', tipologia: 'Apartamento Residencial' });
    expect(svc.salvarUnidadeUnica.mock.calls[0][2]).toEqual(expect.objectContaining({ private_area: 72 }));
    expect(svc.update).not.toHaveBeenCalled();
  });

  it('com unidade gravada: mostra o status de venda e só salva depois de mudar algo', async () => {
    svc.listTowers.mockResolvedValue([{ id: 't1', name: 'Lote' }]);
    svc.listUnits.mockResolvedValue([{ id: 'u1', tower_id: 't1', name: 'Lote 12', quadra: 'A', lote: '12', status: 'RESERVADO', price: 250000 }]);
    montar('LOTE');
    expect(await screen.findByTestId('unidade-unica-status')).toHaveTextContent(/Reservado/);
    const salvar = screen.getByRole('button', { name: /Salvar unidade/ });
    expect(salvar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nº do lote'), { target: { value: '12-A' } });
    expect(salvar).not.toBeDisabled();
  });

  it('fora do molde (tipo trocado depois): mostra o motivo e as torres como antes, sem gravar', async () => {
    svc.listTowers.mockResolvedValue([{ id: 't1', name: 'Torre A' }, { id: 't2', name: 'Torre B' }]);
    montar('LOTE');
    expect(await screen.findByTestId('unidade-unica-fora-do-molde')).toHaveTextContent(/2 torre\(s\)/);
    expect(await screen.findByTestId('secao-torres')).toBeInTheDocument();
    expect(svc.salvarUnidadeUnica).not.toHaveBeenCalled();
  });
});
