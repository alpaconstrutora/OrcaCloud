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
import { useStore } from '../../../store/useStore';

// REGRA #5: o módulo lê a organização do seletor do TOPO (store), não de prop.
// ?org=o1 simula o topo apontando para uma organização; ?org=all simula "Todas".
const orgParam = new URLSearchParams(location.search).get('org') ?? 'o1';
useStore.setState({
  activeOrganizationId: orgParam === 'all' ? null : orgParam,
  organizations: [
    { id: 'o1', name: 'Alpa', members: [{ email: 'dev@x.com' }] },
    { id: 'o2', name: 'SPE Horizonte', members: [{ email: 'dev@x.com' }] },
  ] as never,
  currentProfile: { ...useStore.getState().currentProfile, email: 'dev@x.com' },
});

// ConfirmProvider: o Sheet (painel Espaços) usa useConfirm(); no app ele vem do App.tsx.
createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <TasksModule projects={[]} />
  </ConfirmProvider>
);
