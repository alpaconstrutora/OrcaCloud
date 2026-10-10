// @vitest-environment jsdom
/**
 * Engenharia › Planejamento › Recursos — Funções, Trabalhadores e Alocação em
 * `StandardTable` (pedido de 10/10/2026; plano em
 * docs/planos/2026-10-10-planejamento-recursos-tabelas-padrao.md).
 *
 * O que interessa provar: cada aba virou tabela com o botão de auto-ajuste de
 * largura; o que o card mostrava continua numa coluna; clicar na linha edita e o
 * excluir pede confirmação pelo `useConfirm` (não mais `confirm()` nativo); duas
 * funções com o mesmo nome viram duas linhas (o card agrupava e travava as duas).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TabelaFuncoes, TabelaTrabalhadores, TabelaAlocacao, rotuloDoCalendario, SmartAssignment } from '../../components/RecursosTabelas';
import { ResourceManagement } from '../../components/ResourceManagement';
import { ConfirmProvider } from '../../components/ui/confirm';
import type { ItemScheduleDetails, ResourceRole, ResourceTeam, ResourceWorker } from '../../types';

const roles: ResourceRole[] = [
  { id: 'r1', name: 'PEDREIRO', costPerHour: 30, costPerDay: 240, description: 'SINAPI · Código: 88309', source: 'SINAPI' },
  { id: 'r2', name: 'PEDREIRO', costPerHour: 32, costPerDay: 256, overtimeCostPerHour: 50, description: 'SINAPI · Código: 88310', source: 'SINAPI' },
  { id: 'r3', name: 'Servente', costPerHour: 20, costPerDay: 160, workDays: [1, 2, 3, 4, 5] },
];
const workers: ResourceWorker[] = [
  { id: 'w1', name: 'João Silva', roleId: 'r1', email: 'joao@x.com' },
  { id: 'w2', name: 'Maria Souza', roleId: 'r3' },
];
const teams: ResourceTeam[] = [{ id: 't1', name: 'Equipe Alvenaria', memberIds: ['w2'] } as ResourceTeam];
const tarefas = [
  { id: 'a', startDate: '2026-10-05', endDate: '2026-10-20', duration: 10, allocations: [{ id: 'al1', resourceId: 'w1', resourceType: 'WORKER', quantity: 1, hoursPerDay: 8 }] },
  { id: 'b', startDate: '2026-10-10', endDate: '2026-10-25', duration: 10, allocations: [{ id: 'al2', resourceId: 'w1', resourceType: 'WORKER', quantity: 1, hoursPerDay: 8 }] },
] as unknown as ItemScheduleDetails[];

const linhaDe = (texto: string) => screen.getAllByText(texto)[0].closest('tr')!;

describe('Funções', () => {
  it('uma linha por função — inclusive duas com o mesmo nome —, com código, HE e auto-ajuste', () => {
    render(<TabelaFuncoes roles={roles} workers={workers} localLabel="Planejamento" onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByText('PEDREIRO')).toHaveLength(2);
    expect(within(screen.getByText('88309').closest('tr')!).getByText(/1,5×/)).toBeInTheDocument(); // HE sem valor próprio
    expect(within(screen.getByText('88310').closest('tr')!).getByText(/50,00/)).toBeInTheDocument();
    expect(within(linhaDe('Servente')).getByText('Seg a Sex')).toBeInTheDocument();
    expect(within(linhaDe('Servente')).getByText('Planejamento')).toBeInTheDocument(); // origem local
    expect(screen.getByTitle(/Ajustar largura/i)).toBeInTheDocument();
  });

  it('clique na linha edita; o botão de excluir não edita', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<TabelaFuncoes roles={roles} workers={workers} localLabel="Planejamento" onEdit={onEdit} onDelete={onDelete} />);
    const u = userEvent.setup();
    await u.click(screen.getByText('Servente'));
    expect(onEdit).toHaveBeenCalledWith(roles[2]);
    await u.click(within(linhaDe('Servente')).getByRole('button', { name: /excluir/i }));
    expect(onDelete).toHaveBeenCalledWith(roles[2]);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('Trabalhadores', () => {
  it('função e equipe pelo nome, calendário herdado e número de alocações', () => {
    render(<TabelaTrabalhadores workers={workers} roles={roles} teams={teams} itemSchedules={tarefas} localLabel="Planejamento" onEdit={vi.fn()} onDelete={vi.fn()} />);
    const joao = linhaDe('João Silva');
    expect(within(joao).getByText('PEDREIRO')).toBeInTheDocument();
    expect(within(joao).getByText('2')).toBeInTheDocument(); // alocado em 2 tarefas
    expect(within(joao).queryByText('joao@x.com')).toBeNull(); // Contato começa oculto (defaultHidden)
    const maria = linhaDe('Maria Souza');
    expect(within(maria).getByText('Equipe Alvenaria')).toBeInTheDocument(); // via memberIds
    expect(within(maria).getByText('Seg a Sex')).toHaveAttribute('title', 'Herdado da função: Seg a Sex');
  });
});

describe('Alocação', () => {
  const base = { roleId: 'r1', roleName: 'PEDREIRO', source: 'COMPOSITION' as const };
  const assignments: SmartAssignment[] = [
    { ...base, taskId: 'a', taskName: 'Alvenaria bloco', allocationId: 'al1', worker: workers[0], status: 'CONFIRMED', budgetedCost: 25 },
    { ...base, taskId: 'b', taskName: 'Chapisco', suggestion: workers[0], status: 'SUGGESTION' },
    { taskId: 'c', taskName: 'Pintura', roleId: null, roleName: 'A Definir', status: 'GAP', source: 'MANUAL' },
  ];

  it('as três situações, o período, o custo × orçado e a sobrecarga', () => {
    render(<TabelaAlocacao assignments={assignments} itemSchedules={tarefas} roles={roles} workerConflicts={{ a: ['Chapisco'] }} periodo="all" onPeriodo={vi.fn()} onConfirmar={vi.fn()} />);
    const alocado = linhaDe('Alvenaria bloco');
    expect(within(alocado).getByText('Alocado')).toBeInTheDocument();
    expect(within(alocado).getByText('05/10 – 20/10')).toHaveAttribute('title', '05/10/26 a 20/10/26');
    expect(within(alocado).getByText(/\+ R\$\s?5,00\/h/)).toBeInTheDocument(); // 30 real − 25 orçado
    expect(within(alocado).getByRole('img', { name: 'Sobrecarga' })).toBeInTheDocument();
    expect(within(linhaDe('Chapisco')).queryByRole('img', { name: 'Sobrecarga' })).toBeNull(); // sugestão não tem
    expect(within(linhaDe('Chapisco')).getByText('Sugestão')).toBeInTheDocument();
    expect(within(linhaDe('Pintura')).getByText('Incompleta')).toHaveAttribute('title', expect.stringContaining('Equipe incompleta'));
    expect(within(linhaDe('Pintura')).getByText('Sem data')).toBeInTheDocument();
  });

  it('"Confirmar" só na sugestão, e chama a confirmação', async () => {
    const onConfirmar = vi.fn();
    render(<TabelaAlocacao assignments={assignments} itemSchedules={tarefas} roles={roles} workerConflicts={{}} periodo="all" onPeriodo={vi.fn()} onConfirmar={onConfirmar} />);
    expect(screen.getAllByRole('button', { name: 'Confirmar' })).toHaveLength(1);
    await userEvent.setup().click(within(linhaDe('Chapisco')).getByRole('button', { name: 'Confirmar' }));
    expect(onConfirmar).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'b', status: 'SUGGESTION' }));
  });

  it('o filtro de período fica na toolbar e muda o recorte', async () => {
    const onPeriodo = vi.fn();
    render(<TabelaAlocacao assignments={assignments} itemSchedules={tarefas} roles={roles} workerConflicts={{}} periodo="all" onPeriodo={onPeriodo} onConfirmar={vi.fn()} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /Período/ }));
    await u.click(screen.getByRole('menuitemradio', { name: 'Este mês' }));
    expect(onPeriodo).toHaveBeenCalledWith('thisMonth');
  });
});

describe('ResourceManagement — excluir pede confirmação (useConfirm, não confirm nativo)', () => {
  it('excluir função: diálogo do app, e só confirma depois do clique', async () => {
    const nativo = vi.spyOn(window, 'confirm');
    const onUpdate = vi.fn();
    render(
      <ConfirmProvider>
        <ResourceManagement resources={{ roles, workers, teams: [] }} onUpdateResources={onUpdate} />
      </ConfirmProvider>,
    );
    const u = userEvent.setup();
    await u.click(within(linhaDe('Servente')).getByRole('button', { name: /excluir/i }));
    expect(nativo).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    await u.click(await screen.findByRole('button', { name: 'Excluir função' }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ roles: roles.filter((r) => r.id !== 'r3') }));
    nativo.mockRestore();
  });
});

describe('rotuloDoCalendario', () => {
  it('corrido vira intervalo; salteado vira lista; ausente = sem calendário próprio', () => {
    expect(rotuloDoCalendario([1, 2, 3, 4, 5])).toBe('Seg a Sex');
    expect(rotuloDoCalendario([1, 3, 5])).toBe('Seg, Qua, Sex');
    expect(rotuloDoCalendario(undefined)).toBeUndefined();
  });
});
