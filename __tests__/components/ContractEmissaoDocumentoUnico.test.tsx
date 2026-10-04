// @vitest-environment jsdom
/**
 * Contratos › aba Emissão — o documento do contrato entra por UM lugar só.
 *
 * Até 2026-10-03 a aba tinha dois uploads do mesmo arquivo, sem ligação:
 * "Contrato Assinado (GED)" no formulário (`contracts.signed_contract_url`) e
 * "Versões da Minuta" (`MinutaVersionsPanel`, escritor legado do JSONB
 * `contracts.minuta_versions`, só no status Minuta). O ZapSign assinava o
 * arquivo do GED, então o usuário subia o mesmo PDF duas vezes — e o painel
 * legado brigava com a projeção do JSONB feita a partir de
 * `contract_document_versions` (versão criada por ele sumia).
 *
 * O que este teste trava:
 *  1. o formulário (drawer e seção `status_documento` embutida) não tem mais
 *     upload de arquivo;
 *  2. nenhum componente volta a chamar os escritores legados do JSONB;
 *  3. a aba Emissão monta o painel da tabela nova, e a assinatura não lê mais
 *     o arquivo do GED.
 *
 * Plano: docs/planos/2026-10-03-emissao-documento-unico.md
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';

vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: () => Promise.resolve([]) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/clientService', () => ({ clientService: { listClients: () => Promise.resolve([]) } }));
vi.mock('../../services/financialRegistryService', () => ({
    financialRegistryService: {
        listCostCenters: () => Promise.resolve([]),
        listPlanoContas: () => Promise.resolve([]),
        listChartOfAccounts: () => Promise.resolve([]),
        listPaymentAccounts: () => Promise.resolve([]),
    },
}));
vi.mock('../../services/projectService', () => ({ projectService: { listProjects: () => Promise.resolve([]) } }));
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: () => Promise.resolve([]) } }));
vi.mock('../../services/contractTypeService', () => ({ contractTypeService: { listTypes: () => Promise.resolve([]) } }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { list: () => Promise.resolve([]) } }));
vi.mock('../../services/documentNumbering', () => ({
    generateDocumentNumber: vi.fn().mockResolvedValue('001'),
    MissingCodeError: class extends Error {},
    DocType: {},
}));
vi.mock('../../services/contractNumberRegenService', () => ({
    getNumberLockReason: () => Promise.resolve(null),
    regenerateContractNumber: vi.fn(),
}));
vi.mock('../../lib/supabase', () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = () => chain; chain.order = () => chain;
    chain.limit = () => chain; chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r);
    return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), functions: { invoke: vi.fn() } } };
});

import { ContractModal } from '../../components/ContractModal';
import { ConfirmProvider } from '../../components/ui/confirm';

const RAIZ = path.resolve(__dirname, '../..');
const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

// Contrato que já tem um PDF no campo antigo — o caso em que o bloco GED
// aparecia preenchido (contrato 007 em produção).
const CONTRATO = {
    id: 'c-1',
    organization_id: 'org-1',
    number: '007',
    title: 'Contenção',
    status: 'Minuta',
    signed_contract_url: 'https://exemplo/assinado.pdf',
} as never;

const montar = (props: Partial<React.ComponentProps<typeof ContractModal>>) => render(
    <ConfirmProvider>
        <ContractModal
            isOpen
            onClose={() => {}}
            onSubmit={async () => {}}
            projectId=""
            organizationId="org-1"
            domain="SUPRIMENTOS"
            {...props}
        />
    </ConfirmProvider>,
);

describe('Contratos › Emissão — documento por um lugar só', () => {
    it('seção status_documento embutida: só o status, sem upload de arquivo', () => {
        const { container } = montar({ variant: 'inline', sections: ['status_documento'], initialData: CONTRATO });

        expect(screen.getByText('Status do contrato')).toBeTruthy();
        expect(screen.queryByText('Contrato Assinado (GED)')).toBeNull();
        expect(container.querySelector('input[type="file"]')).toBeNull();
    });

    it('drawer completo de criar/editar também não sobe arquivo', () => {
        // SEM PDF no campo antigo: era quando o bloco GED mostrava o
        // <input type="file"> (com PDF ele mostrava só o link) — com o PDF
        // preenchido este teste passava até no código antigo.
        const { container } = montar({ initialData: { ...(CONTRATO as object), signed_contract_url: undefined } as never });
        expect(container.querySelector('input[type="file"]')).toBeNull();
    });

    it('nenhum componente chama os escritores legados de minuta_versions', () => {
        const dir = path.join(RAIZ, 'components');
        const arquivos: string[] = [];
        const varrer = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) varrer(p);
            else if (/\.tsx?$/.test(e.name)) arquivos.push(p);
        });
        varrer(dir);

        const legado = /contractService\.(addMinutaVersion|emitMinutaVersion|updateMinutaVersion|deleteMinutaVersion)\b/;
        const culpados = arquivos.filter(p => legado.test(fs.readFileSync(p, 'utf8'))).map(p => path.relative(RAIZ, p));
        expect(culpados).toEqual([]);
    });

    it('aba Emissão monta o painel da tabela nova e assina a versão emitida', () => {
        const fonte = ler('components/ContractDetailView.tsx');
        expect(fonte).toMatch(/<ContractDocumentsTab\b/);
        expect(fonte).not.toMatch(/<MinutaVersionsPanel\b/);
        // o arquivo enviado ao ZapSign é o da versão, não o campo do GED
        expect(fonte).not.toMatch(/fetch\(contract\.signed_contract_url\)/);
    });
});
