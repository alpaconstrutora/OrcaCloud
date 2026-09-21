/**
 * Harness: monta `TasksList` de produção (sem mock do componente) com tarefas,
 * colaboradores, obras, status e espaços fabricados, numa largura de 1050px —
 * a régua real da área de conteúdo de Tarefas (viewport 1600 − sidebar − rail).
 *
 * Prova visual do plano docs/planos/2026-09-21-tarefas-toolbar-acoplada-filtro-espaco.md:
 * toolbar §5.2 costurada ao card, autofit §6.1.2, filtro Espaço §5.4.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import TasksList from '../../../components/TasksList';
import type { TaskRecord, EmployeeOption, ProjectOption } from '../../../components/TaskForm';
import { FilterPopover } from '../../../components/ui/FilterPopover';
import type { TaskStatus } from '../../../services/taskService';

const employees: EmployeeOption[] = [
  { id: 'e1', name: 'Maria Aparecida da Silva Santos', role: 'Engenheira', email: 'maria@x.com' },
  { id: 'e2', name: 'João Pedro', role: 'Mestre de obras', email: 'joao@x.com' },
] as EmployeeOption[];
const projects: ProjectOption[] = [
  { id: 'p1', name: 'Residencial Horizonte — Torre B' },
  { id: 'p2', name: 'Galpão Logístico Norte' },
];
const statuses: TaskStatus[] = [
  { id: 's1', org_id: 'o1', name: 'A fazer', color: '#94a3b8', position: 0, is_default: true, is_done: false },
  { id: 's2', org_id: 'o1', name: 'Em andamento', color: '#3b82f6', position: 1, is_default: false, is_done: false },
  { id: 's3', org_id: 'o1', name: 'Concluída', color: '#10b981', position: 2, is_default: false, is_done: true },
] as TaskStatus[];
// No app, os popovers Prazo/Espaço/Pasta vêm do TasksModule pelo slot `filters`;
// aqui um popover de amostra ocupa o mesmo lugar para a prova visual da toolbar.
const SPACE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: '__none__', label: 'Sem espaço' },
  { value: 'sp1', label: 'Engenharia' },
  { value: 'sp2', label: 'Financeiro' },
];

const base = {
  org_id: 'o1', user_id: 'u1', description: null, start_date: null, alert_at: null, snoozed_until: null,
  status: 'open', source_module: 'manual', source_ref: null, created_at: '2026-09-01T00:00:00Z', completed_at: null,
  assignee_employee_id: null, project_id: null, parent_task_id: null, space_id: null, folder_id: null,
};
const tasks = [
  { ...base, id: 't1', title: 'Aprovar folha de setembro — conferir encargos e rubricas antes do fechamento', description: 'Descrição longa da tarefa para provar o truncate com title na célula de nome', due_date: '2026-09-22', priority: 1, status_id: 's2', assignee_employee_id: 'e1', project_id: 'p1', space_id: 'sp1', folder_id: 'f1', source_module: 'rh', alert_at: '2026-09-21T09:00:00Z', start_date: '2026-09-15' },
  { ...base, id: 't2', title: 'Responder cotação de aço CA-50', due_date: '2026-09-10', priority: 2, status_id: 's1', assignee_employee_id: 'e2', project_id: 'p2', space_id: 'sp2', source_module: 'compras', alert_at: '2026-09-30T14:30:00Z' },
  { ...base, id: 't3', title: 'Subtarefa: separar propostas', priority: 3, status_id: 's1', parent_task_id: 't2', due_date: null },
  { ...base, id: 't4', title: 'Tarefa sem espaço', priority: 4, status_id: 's3', status: 'done', due_date: '2026-09-05' },
] as TaskRecord[];

// ?groupBy=status|assignee|priority|project|source — prova o cabeçalho de grupo
// (colSpan cobre grip + checkbox + colunas + espaçador + ações).
const groupBy = (new URLSearchParams(location.search).get('groupBy') ?? 'none') as 'none' | 'status' | 'assignee' | 'priority' | 'project' | 'source';

function Harness() {
  const [rows, setRows] = React.useState<TaskRecord[]>(tasks);
  const [space, setSpace] = React.useState('');
  const shown = space === '__none__' ? rows.filter(t => !t.space_id) : space ? rows.filter(t => t.space_id === space) : rows;
  return (
    <TasksList
      tasks={shown}
      loading={false}
      employees={employees}
      projects={projects}
      statuses={statuses}
      filters={<FilterPopover label="Espaço" value={space} onChange={setSpace} options={SPACE_OPTIONS} />}
      groupBy={groupBy}
      onToggleDone={t => setRows(prev => prev.map(x => x.id === t.id ? { ...x, status: x.status === 'done' ? 'open' : 'done', status_id: x.status === 'done' ? 's1' : 's3' } : x))}
      onEdit={() => {}}
      onAddSubtask={() => {}}
      onMakeSubtask={() => {}}
      onAddTask={() => {}}
      onNavigate={() => {}}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
