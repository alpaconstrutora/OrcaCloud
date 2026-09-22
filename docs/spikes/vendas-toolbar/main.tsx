/**
 * Harness: SalesModule DE PRODUÇÃO (Comercial › Venda de Ativos) com rede
 * stubada pelo roteiro Playwright (c:/tmp/pwtest/vendas-toolbar/). Serve para
 * ver o cabeçalho nos dois estados — lista de empreendimentos e dentro de um
 * edifício — depois que a toolbar de botões (§5.3) saiu e os dois controles
 * voltaram para a linha do <h1> (pedido de 2026-09-22).
 *
 * O gutter `p-4 md:p-6` é o do <main> do Layout (§20.2), que aqui não existe.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import SalesModule from '../../../components/SalesModule';
import { ConfirmProvider } from '../../../components/ui/confirm';

createRoot(document.getElementById('raiz')!).render(
    <ConfirmProvider>
        <div className="p-4 md:p-6">
            <SalesModule organizationId="00000000-0000-0000-0000-000000000000" />
        </div>
    </ConfirmProvider>,
);
