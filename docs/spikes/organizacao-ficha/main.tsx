/**
 * Harness: monta a ficha DE PRODUÇÃO de Minha Organização › Organização
 * (lista + Detalhes) para conferir na tela a tipografia unificada de 19/10/2026
 * (docs/planos/2026-10-19-organizacao-ficha-tipografia.md).
 *
 * O PostgREST é servido pelo `passeio.mjs` (page.route, só leitura) — nada chega
 * ao Supabase. A casca reproduz o gutter do Layout (§20.2: 24px no desktop).
 *
 *   ?modo=ficha    (padrão) — OrganizationDetail de uma org PJ com matriz
 *   ?modo=empresa  — CompanyDetailPage solta (empresa do grupo aberta em "Gerenciar")
 *   ?modo=lista    — OrganizationList, aba Organização
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import OrganizationDetail from '../../../components/OrganizationDetail';
import OrganizationList from '../../../components/OrganizationList';
import CompanyDetailPage from '../../../components/CompanyDetailPage';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { ToastProvider } from '../../../components/ui/toast';
import type { Company, Organization } from '../../../types';

const modo = new URLSearchParams(location.search).get('modo') ?? 'ficha';

const org = {
  id: 'org-1',
  name: 'Alpa Construtora Harness',
  code: '001',
  cnpj: '12.345.678/0001-90',
  email: 'contato@harness.test',
  settings: { tax_recognition_regime: 'CAIXA' },
  members: [],
} as unknown as Organization;

const outra = { ...org, id: 'org-2', name: 'SPE Residencial Harness', code: '002', cnpj: '98.765.432/0001-10' } as Organization;

const spe = {
  id: 'co-2', org_id: 'org-1', razao_social: 'SPE Residencial Harness Ltda', tipo: 'spe',
  cnpj: '98.765.432/0001-10', status: 'ativa', is_headquarters: false, cor_sistema: '#10b981',
} as unknown as Company;

const noop = () => { /* harness */ };

function Harness() {
  return (
    <ConfirmProvider>
      <ToastProvider>
        <div className="p-4 md:p-6 max-w-[1400px]">
          {modo === 'lista' ? (
            <OrganizationList
              organizations={[org, outra]}
              onCreate={noop} onEdit={noop} onDelete={noop} onSelect={noop}
              activeTab="organizations" onTabChange={noop}
              projects={[]} onClientsChange={noop} onLoadProject={noop} onEditProject={noop}
              onNewProject={noop} onDuplicateProject={noop} onImportProject={noop} onExportProject={noop}
            />
          ) : modo === 'empresa' ? (
            <CompanyDetailPage company={spe} companies={[spe]} onBack={noop} onSaved={noop} />
          ) : (
            <OrganizationDetail organization={org} onSave={noop} onBack={noop} onIrParaContas={noop} />
          )}
        </div>
      </ToastProvider>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz')!).render(<Harness />);
