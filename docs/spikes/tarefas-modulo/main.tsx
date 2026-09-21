/**
 * Harness: monta o `TasksModule` de produção inteiro (sem mock de componente). As
 * leituras do PostgREST são respondidas pelo Playwright (C:/tmp/pwtest/tarefas_modulo.js)
 * com dado fabricado e toda escrita é abortada — nada é gravado. Prova do plano
 * docs/planos/2026-09-21-tarefas-sem-painel-lateral.md: sem rail, Prazo / Espaço /
 * Pasta / painel Espaços na toolbar acoplada, Kanban com a mesma barra.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import TasksModule from '../../../components/TasksModule';
import { ConfirmProvider } from '../../../components/ui/confirm';

// ConfirmProvider: o Sheet (painel Espaços) usa useConfirm(); no app ele vem do App.tsx.
createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <TasksModule activeOrganizationId="o1" organizations={[{ id: 'o1', name: 'Alpa' }]} projects={[]} />
  </ConfirmProvider>
);
