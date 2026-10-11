// @vitest-environment jsdom
/**
 * Engenharia › Planejamento › Suprimentos — Plano de Suprimentos em abas + tabela
 * (pedido de 11/10/2026: "Transformar em tabela e aplicar o padrão
 * ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas").
 *
 * O que interessa provar: os baldes por prazo viraram abas (§19.1) com contagem; a
 * aba recorta a tabela; a tabela é o StandardTable com o auto-ajuste; status é
 * texto (sem pílula) e a data vencida fica em vermelho; a ação primária mora na
 * barra de abas.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcurementPlanItem } from '../../types/procurement';

vi.mock('../../services/procurementService', () => ({
  procurementService: {
    listPlanItems: vi.fn(),
    generatePlan: vi.fn(),
  },
}));

import { procurementService } from '../../services/procurementService';
import { SupplyPanel } from '../../components/schedule/SupplyPanel';

const dia = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
};
const item = (id: string, desc: string, extra: Partial<ProcurementPlanItem>): ProcurementPlanItem => ({
  id, organizationId: 'o', projectId: 'p', isStale: false,
  inputDescription: desc, inputUnit: 'kg', requiredQty: 10, netRequiredQty: 0, leadTimeDays: 5,
  estimatedTotal: 1234.5, status: 'pending', ...extra,
} as ProcurementPlanItem);

const ITENS = [
  item('a', 'Cimento CP-II', { suggestedBuyDate: dia(-3), inputCode: '1379' }),          // atrasado
  item('b', 'Areia média', { suggestedBuyDate: dia(3), status: 'quoted' }),               // 7 dias
  item('c', 'Aço CA-50', { suggestedBuyDate: dia(20), status: 'ordered' }),               // 30 dias
  item('d', 'Telha cerâmica', { suggestedBuyDate: undefined }),                           // sem data
];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(procurementService.listPlanItems).mockResolvedValue(ITENS);
});

describe('Plano de Suprimentos — abas + tabela', () => {
  it('abas por prazo com contagem; ação primária na barra; tabela com auto-ajuste', async () => {
    render(<SupplyPanel organizationId="o" projectId="p" onNavigateToProcurement={() => undefined} />);
    const todos = await screen.findByRole('tab', { name: /Todos/ });
    expect(todos).toHaveTextContent('4');
    expect(screen.getByRole('tab', { name: /Atrasados/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Próximos 7 dias/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Sem data/ })).toHaveTextContent('1');
    const barra = todos.closest('[role=tablist]')!.parentElement!;
    expect(within(barra).getByRole('button', { name: /Atualizar plano/ })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: /Módulo Aquisições/ })).toBeInTheDocument();
    expect(screen.getByTitle(/Ajustar largura/i)).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBe(1 + 4); // cabeçalho + 4 insumos
  });

  it('a aba recorta a tabela', async () => {
    render(<SupplyPanel organizationId="o" projectId="p" />);
    await userEvent.setup().click(await screen.findByRole('tab', { name: /Atrasados/ }));
    expect(screen.getByText('Cimento CP-II')).toBeInTheDocument();
    expect(screen.queryByText('Areia média')).toBeNull();
  });

  it('status é texto colorido (sem pílula) e a data vencida fica em vermelho', async () => {
    render(<SupplyPanel organizationId="o" projectId="p" />);
    const linha = (await screen.findByText('Cimento CP-II')).closest('tr')!;
    const status = within(linha).getByText('Pendente');
    expect(status.className).not.toMatch(/rounded-full|bg-/);
    const data = within(linha).getByTitle('Data de compra vencida');
    expect(data.className).toMatch(/text-red-600/);
    expect(within(linha).getByText('1379')).toBeInTheDocument();
    expect(within(linha).getByText(/1\.234,50/)).toBeInTheDocument();
  });

  it('sem plano: estado vazio, com a ação "Gerar plano de compras" na barra', async () => {
    vi.mocked(procurementService.listPlanItems).mockResolvedValue([]);
    render(<SupplyPanel organizationId="o" projectId="p" />);
    expect(await screen.findByText('Nenhum plano de suprimentos gerado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gerar plano de compras/ })).toBeInTheDocument();
  });
});
