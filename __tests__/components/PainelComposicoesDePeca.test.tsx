// @vitest-environment jsdom
/**
 * INCÊNDIO E9.2 (01/10/2026): o cadastro de composição por peça — lista,
 * salvar com os itens válidos (e o botão desligado dizendo por quê) e apagar.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const listarComposicoes = vi.fn();
const salvarComposicao = vi.fn();
const apagarComposicao = vi.fn();
vi.mock('../../services/blueprintComposicaoService', () => ({
  listarComposicoes: (...a: unknown[]) => listarComposicoes(...a),
  salvarComposicao: (...a: unknown[]) => salvarComposicao(...a),
  apagarComposicao: (...a: unknown[]) => apagarComposicao(...a),
}));

import PainelComposicoesDePeca from '../../components/blueprint/PainelComposicoesDePeca';

beforeEach(() => {
  listarComposicoes.mockReset().mockResolvedValue([
    { id: 'c1', organizationId: 'org', disciplina: 'INCENDIO', tipo: 'HIDRANTE_SIMPLES', especificacao: null, itens: [{ codigo: 'MANG', quantidade: 2, descricao: 'Mangueira 15 m' }], active: true },
  ]);
  salvarComposicao.mockReset().mockResolvedValue({});
  apagarComposicao.mockReset().mockResolvedValue(undefined);
});

describe('PainelComposicoesDePeca (E9.2)', () => {
  it('lista a composição da organização e conta para o painel', async () => {
    const onContagem = vi.fn();
    render(<PainelComposicoesDePeca organizationId="org" onMudou={vi.fn()} onContagem={onContagem} />);
    expect(await screen.findByText(/Hidrante simples · Incêndio/)).toBeInTheDocument();
    expect(screen.getByText('2 × MANG — Mangueira 15 m')).toBeInTheDocument();
    expect(onContagem).toHaveBeenCalledWith(1);
    expect(listarComposicoes).toHaveBeenCalledWith('org');
  });

  it('sem item válido, salvar fica desligado dizendo por quê; com código, grava só os itens válidos e invalida a prévia', async () => {
    const onMudou = vi.fn();
    const user = userEvent.setup();
    render(<PainelComposicoesDePeca organizationId="org" onMudou={onMudou} />);
    await screen.findByText(/Hidrante simples · Incêndio/);
    const salvar = screen.getByRole('button', { name: 'Salvar composição' });
    expect(salvar).toBeDisabled();
    expect(salvar).toHaveAttribute('title', 'Informe ao menos um item com código e quantidade maior que zero');
    // O primeiro tipo da rede de incêndio é um tipo DELA (não o ponto de espera genérico).
    expect((screen.getByLabelText('Tipo da peça') as HTMLSelectElement).value).not.toBe('PONTO_ESPERA');
    await user.selectOptions(screen.getByLabelText('Tipo da peça'), 'HIDRANTE_SIMPLES');
    await user.type(screen.getByLabelText('Código do item 1'), 'ABRIGO');
    await user.click(screen.getByRole('button', { name: /Item/ }));
    await user.type(screen.getByLabelText('Código do item 2'), 'VALV');
    await user.clear(screen.getByLabelText('Quantidade por peça do item 2'));
    await user.type(screen.getByLabelText('Quantidade por peça do item 2'), '0');
    await user.click(screen.getByRole('button', { name: 'Salvar composição' }));
    await waitFor(() => expect(salvarComposicao).toHaveBeenCalled());
    // Mesma peça (incêndio · hidrante simples · sem especificação) que já existe → atualiza a c1.
    expect(salvarComposicao).toHaveBeenCalledWith('org', { id: 'c1', disciplina: 'INCENDIO', tipo: 'HIDRANTE_SIMPLES', especificacao: null, itens: [{ codigo: 'ABRIGO', quantidade: 1, descricao: '' }] });
    expect(onMudou).toHaveBeenCalled();
  });

  it('climatização (E9.2): o kit do split na rede da linha frigorígena, pela especificação da capacidade', async () => {
    const user = userEvent.setup();
    render(<PainelComposicoesDePeca organizationId="org" onMudou={vi.fn()} />);
    await screen.findByText(/Hidrante simples · Incêndio/);
    const redes = [...(screen.getByLabelText('Rede da peça') as HTMLSelectElement).options].map((o) => o.value);
    expect(redes).toEqual(expect.arrayContaining(['FRIGORIGENA', 'DRENO_AC', 'MECANICA']));
    await user.selectOptions(screen.getByLabelText('Rede da peça'), 'FRIGORIGENA');
    await user.selectOptions(screen.getByLabelText('Tipo da peça'), 'EVAPORADORA_HI_WALL');
    await user.type(screen.getByLabelText('Especificação da peça'), '12.000 BTU/h');
    await user.type(screen.getByLabelText('Código do item 1'), 'EVAP12');
    await user.click(screen.getByRole('button', { name: 'Salvar composição' }));
    await waitFor(() => expect(salvarComposicao).toHaveBeenCalled());
    expect(salvarComposicao).toHaveBeenCalledWith('org', expect.objectContaining({ disciplina: 'FRIGORIGENA', tipo: 'EVAPORADORA_HI_WALL', especificacao: '12.000 BTU/h' }));
  });

  it('apagar chama o serviço com a organização', async () => {
    const user = userEvent.setup();
    render(<PainelComposicoesDePeca organizationId="org" onMudou={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Remover composição de HIDRANTE_SIMPLES' }));
    await waitFor(() => expect(apagarComposicao).toHaveBeenCalledWith('c1', 'org'));
  });
});
