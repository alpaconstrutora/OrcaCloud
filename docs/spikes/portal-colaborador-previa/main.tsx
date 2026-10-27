/**
 * Harness: LaborPortal DE PRODUÇÃO (aba Prévia + moldura de celular). A rede é
 * interceptada pelo passeio.mjs (page.route) com dados fictícios — nada aqui
 * fala com o banco de verdade.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../index.css';
import LaborPortal from '../../../components/LaborPortal';
import { ConfirmProvider } from '../../../components/ui/confirm';
import type { Employee } from '../../../services/laborService';

const emp = (id: string, name: string, role: string) => ({ id, name, role, status: 'ATIVO' }) as unknown as Employee;
const employees = [
    emp('emp-1', 'Claudinei da Costa Vieira', 'Mestre de Obras'),
    emp('emp-2', 'Rogério Alves', 'Pedreiro'),
    emp('emp-3', 'Maria Souza', 'Servente'),
];

createRoot(document.getElementById('raiz')!).render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ConfirmProvider>
            <LaborPortal orgId="00000000-0000-0000-0000-0000000000aa" employees={employees} />
        </ConfirmProvider>
    </QueryClientProvider>,
);
