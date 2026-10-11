/**
 * Listar corretores não pode regravar o perfil deles (11/10/2026).
 *
 * `brokerService.listProfiles` chama `supplierService.syncRealEstateBrokerProfiles`
 * antes de ler. Até aqui essa sincronização fazia upsert de TODOS os
 * fornecedores-corretores a cada abertura de Venda de Ativos/Locações/Negociação:
 * regravava nome, telefone, `updated_at` e a comissão em 5% — a comissão editada
 * em Corretores (BrokerModal) se perdia na próxima listagem. Medido no banco: os
 * 28 perfis com `updated_at` de quando alguém abriu a tela.
 *
 * Agora: só cria o perfil que falta (ON CONFLICT DO NOTHING) e, no caso comum
 * (todos existem), não manda escrita nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Escrita = { tabela: string; op: string; linhas: unknown; opcoes?: unknown };
const escritas: Escrita[] = [];
let fornecedores: Record<string, unknown>[] = [];
let perfisExistentes: { organization_id: string; email: string }[] = [];

// Construtor encadeável mínimo: leitura devolve o que o cenário define; escrita
// é só registrada.
function builder(tabela: string) {
    const b: Record<string, unknown> = {};
    const encadeia = () => b;
    for (const m of ['select', 'eq', 'or', 'order', 'in', 'is']) b[m] = encadeia;
    b.upsert = (linhas: unknown, opcoes: unknown) => {
        escritas.push({ tabela, op: 'upsert', linhas, opcoes });
        return Promise.resolve({ error: null });
    };
    b.update = (linhas: unknown) => {
        escritas.push({ tabela, op: 'update', linhas });
        return b;
    };
    b.insert = (linhas: unknown) => {
        escritas.push({ tabela, op: 'insert', linhas });
        return Promise.resolve({ error: null });
    };
    // `.update().select().single()` do suppliers devolve o fornecedor salvo.
    b.single = () => Promise.resolve({ data: tabela === 'suppliers' ? fornecedores[0] : null, error: null });
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.then = (ok: (v: unknown) => unknown) => ok({
        data: tabela === 'suppliers' ? fornecedores : tabela === 'broker_profiles' ? perfisExistentes : [],
        error: null,
    });
    return b;
}

vi.mock('../lib/supabase', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('../services/organizationService', () => ({
    organizationService: { listOrganizations: async () => [{ id: 'org-a' }, { id: 'org-b' }] },
}));
vi.mock('../services/documentDuplicateCheck', () => ({ assertDocumentNotDuplicated: async () => {} }));

import { supplierService } from '../services/supplierService';

const corretor = (over: Record<string, unknown> = {}) => ({
    id: 's1', name: 'Imobiliária Sul Minas', email: 'Atendimento@SulMinas.com.br ',
    type: 'PJ', phone: '35 9999', portal: 'Portal do Corretor',
    organization_id: 'org-a', is_shared: false, ...over,
});

beforeEach(() => {
    escritas.length = 0;
    fornecedores = [];
    perfisExistentes = [];
});

describe('syncRealEstateBrokerProfiles (chamada ao listar)', () => {
    it('todos os perfis já existem → nenhuma escrita', async () => {
        fornecedores = [corretor()];
        perfisExistentes = [{ organization_id: 'org-a', email: 'atendimento@sulminas.com.br' }];
        await supplierService.syncRealEstateBrokerProfiles('org-a');
        expect(escritas).toEqual([]);
    });

    it('perfil que falta é criado sem comissão (default da coluna) e sem sobrescrever', async () => {
        fornecedores = [corretor()];
        await supplierService.syncRealEstateBrokerProfiles('org-a');
        expect(escritas).toHaveLength(1);
        const [e] = escritas;
        expect(e.op).toBe('upsert');
        expect(e.opcoes).toEqual({ onConflict: 'organization_id,email', ignoreDuplicates: true });
        const linhas = e.linhas as Record<string, unknown>[];
        expect(linhas).toEqual([{
            email: 'atendimento@sulminas.com.br', name: 'Imobiliária Sul Minas', phone: '35 9999',
            cpf: null, agency_name: 'Imobiliária Sul Minas', organization_id: 'org-a',
        }]);
        expect(linhas[0]).not.toHaveProperty('commission_rate');
        expect(linhas[0]).not.toHaveProperty('updated_at');
    });

    it('corretor compartilhado ganha a linha da organização listada, só ela', async () => {
        fornecedores = [corretor({ organization_id: 'org-a', is_shared: true })];
        perfisExistentes = [{ organization_id: 'org-a', email: 'atendimento@sulminas.com.br' }];
        await supplierService.syncRealEstateBrokerProfiles('org-b');
        expect(escritas).toHaveLength(1);
        expect((escritas[0].linhas as { organization_id: string }[]).map(l => l.organization_id)).toEqual(['org-b']);
    });

    it('fornecedor sem e-mail não vira perfil', async () => {
        fornecedores = [corretor({ email: '  ' })];
        await supplierService.syncRealEstateBrokerProfiles('org-a');
        expect(escritas).toEqual([]);
    });
});

describe('salvar o fornecedor (updateSupplier → syncRealEstateBrokerProfile)', () => {
    it('atualiza nome/telefone e reativa, mas não toca na comissão', async () => {
        fornecedores = [corretor({ email: 'atendimento@sulminas.com.br' })];
        await supplierService.updateSupplier('s1', { phone: '35 9999' });
        const perfil = escritas.find(e => e.tabela === 'broker_profiles');
        expect(perfil?.op).toBe('upsert');
        const linhas = perfil!.linhas as Record<string, unknown>[];
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatchObject({ organization_id: 'org-a', phone: '35 9999', is_active: true });
        expect(linhas[0]).not.toHaveProperty('commission_rate');
    });
});
