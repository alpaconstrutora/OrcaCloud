/**
 * Harness do campo "Sistema predial" (plano `docs/planos/2026-10-15-condominio-sistema-predial-crud.md`).
 *
 * `ManutencaoTab` REAL, sem login: o Supabase vai à rede com a chave anon e o
 * roteiro do Playwright responde no lugar do banco (`page.route`) — leitura com
 * dado fabricado, escrita respondida sem chegar ao banco. O que o teste de
 * componente não vê: o drawer do seletor por cima do "Novo item do plano", e a
 * confirmação por cima dos dois.
 *
 * Abrir em: /docs/spikes/sistema-predial-crud/index.html no servidor de dev.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import ManutencaoTab from '../../../components/condominio/ManutencaoTab';
import { ConfirmProvider } from '../../../components/ui/confirm';
import type { Empreendimento } from '../../../types/empreendimento';

const empreendimento = {
    id: '00000000-0000-0000-0000-0000000000e1',
    organization_id: '00000000-0000-0000-0000-0000000000a1',
    name: 'Residencial Harness',
} as unknown as Empreendimento;

createRoot(document.getElementById('raiz')!).render(
    <ConfirmProvider>
        <ManutencaoTab empreendimento={empreendimento} />
    </ConfirmProvider>,
);
