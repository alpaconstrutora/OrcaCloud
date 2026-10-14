// @vitest-environment jsdom
/**
 * Fração da versão aprovada de volta ao Empreendimento (Fase 9 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`): o drawer propõe os
 * pares, a pessoa troca na célula, e só o que está na tela vai para a RPC.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = {
  planta: [
    { codigo: '101', chave: 'u1', numero: '101' },
    { codigo: '102', chave: 'u2', numero: '102' },
    { codigo: '103', chave: 'u3', numero: '103' },
  ] as { codigo: string; chave: string; numero: string }[],
  unidades: [
    { id: 'a', nome: '101', chave: null, origem: null, torre: 'Torre A', milesimos: null },
    { id: 'b', nome: '102', chave: 'u2', origem: 'MOTOR', torre: 'Torre A', milesimos: 400 },
    { id: 'c', nome: 'Loja 1', chave: null, origem: 'CONVENCAO', torre: 'Torre A', milesimos: 100 },
  ] as unknown[],
};
const devolver = vi.fn(async () => ({ revisao: 2, vinculos: 3, gravadas: 2, convencao: ['Loja 1'], semFracao: [] }));
vi.mock('../../services/blueprintSnapshotNbr12721Service', () => ({
  blueprintSnapshotNbr12721Service: {
    unidadesDaVersao: vi.fn(async () => estado.planta),
    unidadesDoEmpreendimento: vi.fn(async () => estado.unidades),
    devolverAoEmpreendimento: (...a: unknown[]) => devolver(...(a as [])),
  },
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import DevolucaoNbr12721 from '../../components/blueprint/DevolucaoNbr12721';
import { ConfirmProvider } from '../../components/ui/confirm';

const emp = { id: 'e1', name: 'Residencial Teste', organizationId: 'org1' };
const abrir = () =>
  render(
    <ConfirmProvider>
      <DevolucaoNbr12721 aberto onFechar={() => {}} snapshotId="s1" empreendimento={emp} />
    </ConfirmProvider>,
  );

describe('DevolucaoNbr12721', () => {
  beforeEach(() => {
    devolver.mockClear();
    localStorage.clear();
  });

  it('propõe pelo número, mantém o já ligado, e grava os pares da tela (inclusive a troca e o sem par)', async () => {
    abrir();
    expect(await screen.findByText('Proposta pelo número')).toBeTruthy();
    expect(screen.getByText('Já ligada')).toBeTruthy();
    expect(screen.getByText('Sem par · convenção')).toBeTruthy();
    // 2 de 3 ligadas; a de convenção (sem par) não conta fração.
    expect(screen.getByText(/2 de 3 unidade\(s\) ligada\(s\) · 2 fração\(ões\) a gravar/)).toBeTruthy();
    // A da Planta já usada por outra linha fica desabilitada no select.
    const selLoja = screen.getByLabelText('Unidade da Planta para Loja 1') as HTMLSelectElement;
    expect((within(selLoja).getByRole('option', { name: '101' }) as HTMLOptionElement).disabled).toBe(true);
    await userEvent.selectOptions(selLoja, 'u3');
    expect(screen.getByText('Escolhida · convenção (fração mantida)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Gravar e levar 2 fração/ }));
    expect(devolver).toHaveBeenCalledWith('s1', emp, [
      { unit_id: 'a', chave: 'u1' },
      { unit_id: 'b', chave: 'u2' },
      { unit_id: 'c', chave: 'u3' },
    ]);
    const rel = await screen.findByTestId('relatorio-devolucao');
    expect(rel.textContent).toMatch(/Versão 2: 2 fração\(ões\) gravada\(s\)/);
    expect(rel.textContent).toMatch(/convenção mantida: Loja 1/);
  });

  it('versão sem as unidades congeladas: o botão diz por quê', async () => {
    const antes = estado.planta;
    estado.planta = [];
    abrir();
    const botao = await screen.findByRole('button', { name: /Gravar e levar/ });
    await screen.findByText(/0 de 3/);
    expect(botao.getAttribute('title')).toMatch(/publicada antes da devolução existir/);
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    estado.planta = antes;
  });

  it('erro da RPC aparece com o motivo do banco', async () => {
    devolver.mockRejectedValueOnce(new Error('blueprintSnapshotNbr12721/devolverAoEmpreendimento: só uma versão aprovada na técnica E na jurídica devolve a fração ao empreendimento'));
    abrir();
    await screen.findByText('Proposta pelo número');
    await userEvent.click(screen.getByRole('button', { name: /Gravar e levar/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('só uma versão aprovada na técnica E na jurídica devolve a fração ao empreendimento');
  });
});
