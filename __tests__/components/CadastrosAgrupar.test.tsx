// @vitest-environment jsdom
/**
 * "Agrupar" em Meus Fornecedores, Meus Clientes, Gestão de Ativos, Gestão de
 * Documentos (DocumentsTable) e Ofícios (Modelos). Pedido de 17/10/2026,
 * docs/planos/2026-10-17-agrupar-cadastros-ativos-documentos.md
 *
 * Telas montadas de verdade com os serviços simulados: o cabeçalho do grupo traz
 * a contagem (e o total só onde há valor em dinheiro), recolher esconde as linhas.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { OpuraDocument } from '../../types';
import type { OpuraAsset, OpuraAssetMaintenance } from '../../types/assets';
import type { DocGenModelo } from '../../types/docGen';

// Encadeamento do supabase-js: qualquer método devolve a cadeia; `await` dá { data: [] }.
// `vi.hoisted`: o `vi.mock` abaixo é içado para o topo do arquivo, e uma `const`
// comum ainda não existiria quando a fábrica rodasse (ReferenceError não tratado —
// os testes passam, mas o Vitest sai com 1 e a CI cai).
const { cadeia } = vi.hoisted(() => {
    const c: Record<string, unknown> = {};
    ['select', 'eq', 'in', 'order', 'is', 'not', 'limit', 'match', 'maybeSingle', 'single'].forEach(m => { c[m] = () => c; });
    c.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, erro);
    return { cadeia: c };
});
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => cadeia, rpc: vi.fn(async () => ({ data: [], error: null })), functions: { invoke: vi.fn() }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } } }));
vi.mock('../../components/ui/confirm', () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock('../../store/useStore', () => {
    const estado = { activeOrganizationId: 'org1', organizations: [{ id: 'org1', name: 'Alpa' }], projects: [{ id: 'p1', name: 'Obra Garden' }], companies: [], viewFocus: null, setViewFocus: () => {} };
    const useStore = (sel?: (s: unknown) => unknown) => (sel ? sel(estado) : estado);
    useStore.getState = () => estado;
    return { useStore };
});
vi.mock('../../hooks/useOrgContext', () => ({
    useOrgContext: () => ({ orgId: 'org1' }),
    useOrgWriteTarget: () => ({ resolveWriteOrg: vi.fn(), orgTargetModal: null }),
    useWritableOrganizations: () => [{ id: 'org1', name: 'Alpa' }],
}));

// ── Fornecedores ────────────────────────────────────────────────────
const FORNECEDORES = [
    { id: 'f1', name: 'Cimentos Beta', type: 'PJ', category: 'Materiais', organization_name: 'Alpa', portal: 'Nenhum' },
    { id: 'f2', name: 'Areia Gama', type: 'PJ', category: 'Materiais', organization_name: 'Alpa', portal: 'Portal do Fornecedor' },
    { id: 'f3', name: 'João Pedreiro', type: 'PF', category: 'Mão de obra', organization_name: 'Alpa', portal: 'Nenhum' },
];
vi.mock('../../services/supplierService', () => ({
    supplierService: { listSuppliers: vi.fn(async () => FORNECEDORES) },
    getSupplierDisplayName: (s: { name?: string }) => s?.name ?? '',
}));
vi.mock('../../services/appSettingsService', () => ({ appSettingsService: { get: () => ({ supplierNameDisplay: 'razao_social' }), save: vi.fn() } }));

// ── Clientes ────────────────────────────────────────────────────────
const CLIENTES = [
    { id: 'c1', name: 'Maria', category: 'Vendas', status: 'Ativo', organization_name: 'Alpa', portal: 'Portal do Cliente' },
    { id: 'c2', name: 'Ana', category: 'Locação', status: 'Inativo', organization_name: 'Alpa' },
    { id: 'c3', name: 'Bruno', category: 'Vendas', status: 'Ativo', organization_name: 'Alpa' },
];
vi.mock('../../services/clientService', () => ({ clientService: { listClients: vi.fn(async () => CLIENTES) } }));
vi.mock('../../services/clientCategoryService', () => ({ clientCategoryService: { list: vi.fn(async () => []) } }));
vi.mock('../../services/empreendimentoService', () => ({ empreendimentoService: { mapObrasToEmpreendimentos: vi.fn(async () => ({})) } }));
vi.mock('../../services/clientEmpreendimentoService', () => ({ clientEmpreendimentoService: { listByClients: vi.fn(async () => ({})) } }));
vi.mock('../../services/clientMessagesService', () => ({ clientMessagesService: { sendMessage: vi.fn() } }));

// ── Ativos ──────────────────────────────────────────────────────────
const ativo = (id: string, name: string, category: string, purchase_value: number): OpuraAsset => ({
    id, organization_id: 'org1', code: `PAT-${id}`, name, category, status: 'disponivel', purchase_value,
    useful_life_months: 60, purchase_date: '2026-01-01',
} as unknown as OpuraAsset);
const ATIVOS = [ativo('a1', 'Betoneira', 'equipamento', 1000), ativo('a2', 'Furadeira', 'ferramenta', 200), ativo('a3', 'Vibrador', 'equipamento', 500)];
const MANUTENCOES = [
    { id: 'm1', asset_id: 'a1', type: 'preventiva', description: 'Troca de óleo', scheduled_date: '2026-10-05', cost: 150, status: 'agendada' },
    { id: 'm2', asset_id: 'a3', type: 'corretiva', description: 'Motor', scheduled_date: '2026-11-02', cost: 900, status: 'agendada' },
    { id: 'm3', asset_id: 'a1', type: 'preventiva', description: 'Correia', scheduled_date: '2026-10-20', cost: 50, status: 'concluida' },
] as unknown as OpuraAssetMaintenance[];
vi.mock('../../services/assetService', () => ({
    assetService: {
        list: vi.fn(async () => ATIVOS), listReservations: vi.fn(async () => []), listMaintenances: vi.fn(async () => MANUTENCOES),
        listLatestMovementsByOrg: vi.fn(async () => ({})), listDocumentsByOrg: vi.fn(async () => ({})),
        calculateDepreciationRateio: vi.fn(async () => []), imagePublicUrl: () => null,
    },
}));
vi.mock('../../services/inventoryService', () => ({ inventoryService: { listWarehouses: vi.fn(async () => []) } }));
vi.mock('../../services/laborService', () => ({ laborService: { listEmployees: vi.fn(async () => []) } }));
vi.mock('../../services/financialRegistryService', () => ({ financialRegistryService: { listCostCenters: vi.fn(async () => []), listPlanoContas: vi.fn(async () => []) } }));

import { SupplierList } from '../../components/SupplierList';
import ClientList from '../../components/ClientList';
import { OpuraAssetsModule } from '../../components/OpuraAssetsModule';
import { DocumentsTable } from '../../components/documents/DocumentsTable';
import ModelosList from '../../components/oficios/ModelosList';
import OficiosList from '../../components/oficios/OficiosList';
import RecebidosList from '../../components/oficios/RecebidosList';
import type { DocGenDocumento } from '../../types/docGen';
import type { OficioRecebido } from '../../services/docGen/tramitacao';
import { useTableColumns } from '../../components/ui/TableUtils';
import { agruparLinhas, chavePorNome } from '../../utils/agruparLinhas';

const cabecalho = (rotulo: string) => screen.getByText(rotulo, { selector: 'span.font-semibold' }).closest('div')!;
const pedacos = (rotulo: string) => Array.from(cabecalho(rotulo).children).map(c => c.textContent!.trim()).filter(Boolean).join(' ');
const agrupar = (title: string, campo: string) => fireEvent.change(screen.getByTitle(title), { target: { value: campo } });

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
});

describe('Meus Fornecedores', () => {
    it('agrupa por categoria (só contagem — não há valor em dinheiro) e recolhe', async () => {
        render(<SupplierList organizationId="org1" />);
        await screen.findAllByText('Cimentos Beta');
        agrupar('Agrupar os fornecedores', 'categoria');
        expect(pedacos('Materiais')).toBe('Materiais 2');
        expect(pedacos('Mão de obra')).toBe('Mão de obra 1');
        fireEvent.click(cabecalho('Materiais'));
        expect(screen.queryByText('Cimentos Beta')).toBeNull();
        expect(screen.getAllByText('João Pedreiro').length).toBeGreaterThan(0);
    });

    it('portal vazio e "Nenhum" caem no mesmo grupo, como a célula mostra', async () => {
        render(<SupplierList organizationId="org1" />);
        await screen.findAllByText('Cimentos Beta');
        agrupar('Agrupar os fornecedores', 'portal');
        expect(pedacos('Nenhum')).toBe('Nenhum 2');
    });
});

describe('Meus Clientes', () => {
    it('agrupa por status com a ordem Ativo → Inativo', async () => {
        render(<ClientList organizationId="org1" />);
        await screen.findAllByText('Maria');
        agrupar('Agrupar os clientes', 'status');
        const rotulos = Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.textContent);
        expect(rotulos).toEqual(['Ativo', 'Inativo']);
        expect(pedacos('Ativo')).toBe('Ativo 2');
    });
});

describe('Gestão de Ativos', () => {
    it('Ativos Patrimoniais (modo lista): agrupa por categoria com o total do valor de aquisição', async () => {
        window.localStorage.setItem('opuraAssets:viewMode', JSON.stringify('list'));
        render(<OpuraAssetsModule activeOrganizationId="org1" onChangeView={() => {}} />);
        fireEvent.click(await screen.findByText('Ativos Patrimoniais'));
        await screen.findAllByText('Betoneira');
        agrupar('Agrupar os bens', 'categoria');
        expect(pedacos('Equipamento')).toMatch(/^Equipamento 2 R\$\s?1\.500,00$/);
        fireEvent.click(cabecalho('Equipamento'));
        expect(screen.queryByText('Vibrador')).toBeNull();
    });

    it('Manutenções: agrupa por mês da data programada, em ordem cronológica, com o custo', async () => {
        render(<OpuraAssetsModule activeOrganizationId="org1" onChangeView={() => {}} />);
        fireEvent.click(await screen.findByText('Manutenções'));
        await screen.findAllByText('Troca de óleo');
        agrupar('Agrupar as manutenções', 'mes');
        const rotulos = Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.textContent);
        expect(rotulos).toEqual(['Outubro/2026', 'Novembro/2026']);
        expect(pedacos('Outubro/2026')).toMatch(/^Outubro\/2026 2 R\$\s?200,00$/);
    });
});

describe('Gestão de Documentos — DocumentsTable', () => {
    const doc = (id: string, nome: string, tipo: string): OpuraDocument => ({ id, nome, tipo_documento: tipo, status: 'ativo' } as unknown as OpuraDocument);
    const DOCS = [doc('d1', 'Planta A', 'Projeto'), doc('d2', 'ART 1', 'ART'), doc('d3', 'Planta B', 'Projeto')];
    const COLS = [{ key: 'nome', label: 'Documento', sortable: true }, { key: 'tipo_documento', label: 'Tipo', sortable: true }, { key: 'actions', label: 'Ações', sortable: false }];

    function Tela({ agrupado, recolhidos = new Set<string>(), onToggleRow = vi.fn() }: { agrupado: boolean; recolhidos?: Set<string>; onToggleRow?: (d: OpuraDocument, i: number, s: boolean) => void }) {
        const tableColumns = useTableColumns(COLS, 'teste:docs');
        const grupos = agruparLinhas(DOCS, { chave: d => chavePorNome(d.tipo_documento), semRotulo: 'Sem tipo' });
        return (
            <DocumentsTable documents={DOCS} tableColumns={tableColumns} renderActions={() => null}
                selectable selectedIds={new Set()} onToggleRow={onToggleRow}
                grupos={agrupado ? grupos : undefined} gruposRecolhidos={recolhidos} onAlternarGrupo={() => {}} />
        );
    }

    it('sem grupos (Portal do Parceiro, lotes) nada muda', () => {
        render(<Tela agrupado={false} />);
        expect(document.querySelectorAll('tbody span.font-semibold')).toHaveLength(0);
        expect(screen.getByText('Planta A')).toBeTruthy();
    });

    it('com grupos: cabeçalho só com a contagem; Shift+clique recebe o índice da linha NA TELA', () => {
        const onToggleRow = vi.fn();
        render(<Tela agrupado recolhidos={new Set(['projeto'])} onToggleRow={onToggleRow} />);
        expect(pedacos('Projeto')).toBe('Projeto 2');
        expect(screen.queryByText('Planta A')).toBeNull();
        fireEvent.click(within(screen.getByText('ART 1').closest('tr')!).getByRole('checkbox'));
        // "Projeto" recolhido: a ART é a 1ª linha da tela, índice 0 (na lista plana seria 1).
        expect(onToggleRow).toHaveBeenCalledWith(expect.objectContaining({ id: 'd2' }), 0, false);
    });
});

describe('Ofícios — Modelos', () => {
    it('agrupa por status (via StandardTable, só contagem)', () => {
        const modelo = (id: string, nome: string, status: string): DocGenModelo => ({ id, nome, status, categoria_ged: 'juridico', versao: 1, updated_at: '2026-10-01', department_id: null } as unknown as DocGenModelo);
        render(<ModelosList modelos={[modelo('1', 'Ofício padrão', 'ativo'), modelo('2', 'Notificação', 'inativo'), modelo('3', 'Resposta', 'ativo')]}
            loading={false} nomeDepartamento={() => ''} onAbrir={() => {}} onDuplicar={() => {}} onAlternarStatus={() => {}} onExcluir={() => {}} />);
        agrupar('Agrupar os modelos', 'status');
        const rotulos = Array.from(document.querySelectorAll('tbody span.font-semibold')).map(e => e.parentElement!.textContent);
        // textContent cola rótulo e contagem ("Ativo2"); nenhum "R$" — modelo não tem valor.
        expect(rotulos.map(t => t!.replace(/\s+/g, '').trim())).toEqual(['Ativo2', 'Inativo1']);
        expect(rotulos.every(t => !/R\$/.test(t!))).toBe(true);
    });
});

describe('Ofícios — Ofícios e Recebidos', () => {
    it('Ofícios: agrupa por destinatário (só contagem)', async () => {
        const oficio = (id: string, assunto: string, razao: string): DocGenDocumento => ({
            id, assunto, numero: `OF-${id}`, status: 'RASCUNHO', approval_status: null, modelo_id: 'm1',
            destinatario_snapshot: { razao_social: razao }, updated_at: '2026-10-01T10:00:00Z', signatarios: [],
        } as unknown as DocGenDocumento);
        render(<OficiosList documentos={[oficio('1', 'Pedido A', 'Prefeitura'), oficio('2', 'Pedido B', 'Cemig'), oficio('3', 'Pedido C', 'Prefeitura')]}
            modelos={[]} nomeDepartamento={{}} loading={false} onAbrir={() => {}} onExcluir={() => {}} />);
        await screen.findByText('Pedido A');
        agrupar('Agrupar os ofícios', 'destinatario');
        expect(pedacos('Prefeitura')).toBe('Prefeitura 2');
        fireEvent.click(cabecalho('Prefeitura'));
        expect(screen.queryByText('Pedido A')).toBeNull();
        expect(screen.getByText('Pedido B')).toBeTruthy();
    });

    it('Recebidos: agrupa por remetente', () => {
        const rec = (id: string, assunto: string, remetente: string): OficioRecebido => ({
            documento: { id } as unknown as OpuraDocument,
            meta: { numero: `R-${id}`, assunto, remetente, recebido_em: '2026-10-02', responder_ate: null },
        } as unknown as OficioRecebido);
        render(<RecebidosList recebidos={[rec('1', 'Notificação 1', 'Prefeitura'), rec('2', 'Notificação 2', 'Prefeitura'), rec('3', 'Aviso', 'Cemig')]}
            vinculos={[]} documentos={[]} loading={false} onAbrirPdf={() => {}} onAbrirGed={() => {}} onResponder={() => {}} onAbrirOficio={() => {}} />);
        agrupar('Agrupar os recebidos', 'remetente');
        expect(pedacos('Prefeitura')).toBe('Prefeitura 2');
        expect(pedacos('Cemig')).toBe('Cemig 1');
    });
});
