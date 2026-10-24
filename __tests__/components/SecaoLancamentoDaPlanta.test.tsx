// @vitest-environment jsdom
/**
 * Seção "Lançamento" da gaveta Preferências da Planta — plano
 * docs/planos/2026-10-24-preferencia-caixas-de-passagem.md.
 *
 * Usa o HOOK REAL (`usePreferenciaDaPlanta` com o catálogo do lançamento) e o `preferenciasService` simulado
 * (como o teste da seção de exibição): as duas opções com os rótulos do plano, o padrão "pela luz", e que
 * escolher grava `planta.lancamento.caixasDePassagem` no escopo USUARIO.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  banco: [] as { escopo: string; chave: string; valor: unknown }[],
  listar: vi.fn(async () => [] as unknown[]),
  gravar: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('../../services/preferenciasService', () => ({
  preferenciasService: {
    listarDoUsuario: (...a: unknown[]) => m.listar(...(a as [])),
    listarDaPrancha: vi.fn(async () => []),
    gravar: (...a: unknown[]) => m.gravar(...a),
    gravarVarios: vi.fn(async () => {}),
    apagarDoEstudo: vi.fn(async () => {}),
  },
}));

import SecaoLancamentoDaPlanta from '../../components/preferencias/SecaoLancamentoDaPlanta';
import { useStore } from '../../store/useStore';

const PELA_LUZ = 'Sem caixas de passagem — a caixa da luz do teto, a das tomadas e o quadro fazem a passagem (como em obra residencial)';
const CAIXAS = 'Usar caixas de passagem (NBR 5410: a cada 15 m ou 270° de curvas)';

let cliente: QueryClient;

function montar() {
  return render(
    <QueryClientProvider client={cliente}>
      <SecaoLancamentoDaPlanta />
    </QueryClientProvider>,
  );
}

const opcao = (rotulo: string) => screen.getByRole('radio', { name: rotulo }) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  m.banco = [];
  m.listar.mockReset().mockImplementation(async () => [...m.banco]);
  m.gravar.mockReset().mockImplementation(async (...a: unknown[]) => {
    const [escopo, , chaveGravada, valor] = a as [string, unknown, string, unknown];
    m.banco = m.banco.filter((l) => !(l.escopo === escopo && l.chave === chaveGravada));
    if (valor !== null) m.banco.push({ escopo, chave: chaveGravada, valor });
  });
  useStore.setState({ session: { user: { id: 'usr_1' } } as never });
});
afterEach(() => {
  cleanup();
  useStore.setState({ session: null as never });
  cliente.clear();
});

describe('SecaoLancamentoDaPlanta', () => {
  it('é a região "Lançamento" e mostra as duas opções, com os rótulos do plano, num grupo de escolha única', () => {
    montar();
    expect(screen.getByRole('region', { name: 'Lançamento' })).toBeInTheDocument();
    const grupo = screen.getByRole('radiogroup', { name: 'Caixas de passagem' });
    expect(grupo).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['PELA_LUZ', 'CAIXAS']);
    expect(opcao(PELA_LUZ)).toBeInTheDocument();
    expect(opcao(CAIXAS)).toBeInTheDocument();
    // A preferência só liga/desliga as caixas: o CAMINHO é o "Encaminhamento" do painel dos eletrodutos.
    expect(
      screen.getByText(
        "O caminho do eletroduto (quadro → luz do ambiente → tomadas, ou árvore no teto) é o 'Encaminhamento' do painel dos eletrodutos.",
      ),
    ).toBeInTheDocument();
  });

  it('sem escolha: "pela luz do teto" vem marcado (padrão)', async () => {
    montar();
    await waitFor(() => expect(m.listar).toHaveBeenCalled());
    expect(opcao(PELA_LUZ)).toBeChecked();
    expect(opcao(CAIXAS)).not.toBeChecked();
  });

  it('escolher "Usar caixas" grava planta.lancamento.caixasDePassagem = CAIXAS no escopo USUARIO e troca na hora', async () => {
    montar();
    await waitFor(() => expect(m.listar).toHaveBeenCalled());
    fireEvent.click(opcao(CAIXAS));
    await waitFor(() => expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.lancamento.caixasDePassagem', 'CAIXAS'));
    expect(opcao(CAIXAS)).toBeChecked();
    expect(opcao(PELA_LUZ)).not.toBeChecked();
    // Com sessão a fonte é o banco: nada fica no navegador.
    expect(localStorage.getItem('blueprint:lancamento:caixasDePassagem')).toBeNull();

    // E voltar para "pela luz" grava de novo.
    fireEvent.click(opcao(PELA_LUZ));
    await waitFor(() => expect(m.gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'planta.lancamento.caixasDePassagem', 'PELA_LUZ'));
    expect(opcao(PELA_LUZ)).toBeChecked();
  });

  it('o valor já gravado no banco aparece marcado', async () => {
    m.banco = [{ escopo: 'USUARIO', chave: 'planta.lancamento.caixasDePassagem', valor: 'CAIXAS' }];
    montar();
    await waitFor(() => expect(opcao(CAIXAS)).toBeChecked());
    expect(m.gravar).not.toHaveBeenCalled();
  });
});
