// F72 (varredura Claude Security de 15/11/2026): o `pix_quote` lia colaborador, fornecedor e
// sócio pela chave de serviço, sem conferir a organização do título. Um membro da org A criava
// um título apontando para alguém da org B e recebia nome, CPF/CNPJ, titular e chave mascarada.
//
// Regra: o favorecido tem de ser da org do título, ou disponibilizado para ela
// (`employee_org_shares` / `supplier_org_shares` com target_org_id = org do título). Fora
// disso, a resposta é a mesma de quando a linha não existe.
import { describe, expect, it } from 'vitest';
import { destinoDoTitulo } from '../supabase/functions/_shared/pixFavorecido';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const FOLHA = '11111111-1111-4111-8111-111111111111';
const COLAB_A = '22222222-2222-4222-8222-22222222222a';
const COLAB_B = '22222222-2222-4222-8222-22222222222b';
const FORN_A = '33333333-3333-4333-8333-33333333333a';
const FORN_B = '33333333-3333-4333-8333-33333333333b';
const ITEM_A = '44444444-4444-4444-8444-44444444444a';
const ITEM_B = '44444444-4444-4444-8444-44444444444b';

type Linha = Record<string, unknown>;

/** Cliente falso: só os filtros que o destinoDoTitulo usa (eq, not is null, limit). */
function bancoFalso(tabelas: Record<string, Linha[]>) {
    const lidas: string[] = [];
    const admin = {
        from(tabela: string) {
            lidas.push(tabela);
            let linhas = [...(tabelas[tabela] ?? [])];
            const q: any = {
                select: () => q,
                eq: (col: string, val: unknown) => { linhas = linhas.filter(l => l[col] === val); return q; },
                not: (col: string, op: string, val: unknown) => {
                    if (op === 'is' && val === null) linhas = linhas.filter(l => l[col] != null);
                    return q;
                },
                limit: (n: number) => { linhas = linhas.slice(0, n); return q; },
                maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
                then: (ok: (r: { data: Linha[]; error: null }) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok),
            };
            return q;
        },
    };
    return { admin, lidas };
}

const tabelas = (extra: Record<string, Linha[]> = {}): Record<string, Linha[]> => ({
    employees: [
        { id: COLAB_A, org_id: ORG_A, name: 'Ana da A', cpf: '52998224725' },
        { id: COLAB_B, org_id: ORG_B, name: 'Bruno da B', cpf: '11144477735' },
    ],
    employee_bank_accounts: [
        { id: 'eba-a', employee_id: COLAB_A, pix_key: '52998224725', pix_key_type: 'CPF', holder_name: 'Ana da A', is_primary: true },
        { id: 'eba-b', employee_id: COLAB_B, pix_key: '11144477735', pix_key_type: 'CPF', holder_name: 'Bruno da B', is_primary: true },
    ],
    suppliers: [
        { id: FORN_A, organization_id: ORG_A, name: 'Fornecedor A', document: '11222333000181' },
        { id: FORN_B, organization_id: ORG_B, name: 'Fornecedor B', document: '11444777000161' },
    ],
    supplier_bank_accounts: [
        { id: 'sba-a', supplier_id: FORN_A, status: 'ativo', pix_key: '11222333000181', pix_key_type: 'CNPJ', is_pix_primary: true },
        { id: 'sba-b', supplier_id: FORN_B, status: 'ativo', pix_key: '11444777000161', pix_key_type: 'CNPJ', is_pix_primary: true },
    ],
    prolabore_payroll_items: [
        { id: ITEM_A, payroll_id: 'folha-a', partner_id: 'socio-a' },
        { id: ITEM_B, payroll_id: 'folha-b', partner_id: 'socio-b' },
    ],
    prolabore_payrolls: [
        { id: 'folha-a', organization_id: ORG_A },
        { id: 'folha-b', organization_id: ORG_B },
    ],
    companies: [
        { id: 'empresa-a', org_id: ORG_A },
        { id: 'empresa-b', org_id: ORG_B },
    ],
    company_partners: [
        { id: 'socio-a', company_id: 'empresa-a', nome: 'Sócia A', documento: '52998224725', pix_chave: '52998224725', pix_tipo: 'CPF', bank_account_id: 'cba-a' },
        { id: 'socio-b', company_id: 'empresa-b', nome: 'Sócio B', documento: '11144477735', pix_chave: '11144477735', pix_tipo: 'CPF' },
    ],
    company_bank_accounts: [
        { id: 'cba-a', company_id: 'empresa-a', banco_nome: 'Banco A', pix_chave: 'socia@exemplo.com', pix_tipo: 'EMAIL', favorecido: 'Sócia A' },
        { id: 'cba-b', company_id: 'empresa-b', banco_nome: 'Banco B', pix_chave: 'empresa-b@exemplo.com', pix_tipo: 'EMAIL', favorecido: 'Empresa B' },
    ],
    employee_org_shares: [],
    supplier_org_shares: [],
    ...extra,
});

const tituloFolha = (colab: string) => ({
    organization_id: ORG_A, source_system: 'LABOR', party_type: 'EMPLOYEE',
    reference_id: `labor-${FOLHA}-indiv-ADIANTAMENTO-${colab}`,
});

describe('destinoDoTitulo · favorecido só da organização do título (F72)', () => {
    it('colaborador da própria org: devolve nome, CPF e a chave', async () => {
        const { admin } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, tituloFolha(COLAB_A));
        expect(d.nome).toBe('Ana da A');
        expect(d.documento).toBe('52998224725');
        expect(d.opcoes.map(o => o.ref)).toEqual(['colaborador:eba-a']);
    });

    it('colaborador de OUTRA org pelo reference_id: nada sai — nem nome, nem CPF, nem chave', async () => {
        const { admin, lidas } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, tituloFolha(COLAB_B));
        expect(d).toEqual({ favorecido: { origem: 'colaborador', id: COLAB_B, motivo: null }, nome: null, documento: null, opcoes: [] });
        expect(lidas).not.toContain('employee_bank_accounts');
    });

    it('colaborador de outra org pelo employee_id do título: idem', async () => {
        const { admin } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'MANUAL', employee_id: COLAB_B });
        expect(d.nome).toBeNull();
        expect(d.opcoes).toEqual([]);
    });

    it('colaborador de outra org DISPONIBILIZADO para a org do título: devolve a chave', async () => {
        const { admin } = bancoFalso(tabelas({ employee_org_shares: [{ id: 'sh', employee_id: COLAB_B, target_org_id: ORG_A }] }));
        const d = await destinoDoTitulo(admin, tituloFolha(COLAB_B));
        expect(d.nome).toBe('Bruno da B');
        expect(d.opcoes.map(o => o.ref)).toEqual(['colaborador:eba-b']);
    });

    it('disponibilizado para OUTRA org que não a do título não serve', async () => {
        const { admin } = bancoFalso(tabelas({ employee_org_shares: [{ id: 'sh', employee_id: COLAB_B, target_org_id: 'org-c' }] }));
        const d = await destinoDoTitulo(admin, tituloFolha(COLAB_B));
        expect(d.opcoes).toEqual([]);
    });

    it('fornecedor da própria org: devolve a chave do cadastro', async () => {
        const { admin } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'CONTRACT', supplier_id: FORN_A });
        expect(d.nome).toBe('Fornecedor A');
        expect(d.opcoes.map(o => o.ref)).toEqual(['fornecedor:sba-a']);
    });

    it('fornecedor de outra org sem compartilhamento: resposta vazia, sem ler as contas', async () => {
        const { admin, lidas } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'CONTRACT', supplier_id: FORN_B });
        expect(d).toEqual({ favorecido: { origem: 'fornecedor', id: FORN_B, motivo: null }, nome: null, documento: null, opcoes: [] });
        expect(lidas).not.toContain('supplier_bank_accounts');
    });

    it('fornecedor de outra org compartilhado com a org do título (supplier_org_shares): devolve a chave', async () => {
        const { admin } = bancoFalso(tabelas({ supplier_org_shares: [{ id: 'ss', supplier_id: FORN_B, target_org_id: ORG_A }] }));
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'CONTRACT', supplier_id: FORN_B });
        expect(d.nome).toBe('Fornecedor B');
        expect(d.opcoes.map(o => o.ref)).toEqual(['fornecedor:sba-b']);
    });

    it('fornecedor que não existe: a mesma resposta vazia de sempre (não vira avulso)', async () => {
        const { admin } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'CONTRACT', supplier_id: 'nao-existe' });
        expect(d).toEqual({ favorecido: { origem: 'fornecedor', id: 'nao-existe', motivo: null }, nome: null, documento: null, opcoes: [] });
    });

    it('sócio cujo pró-labore é da org do título: devolve a chave do sócio e a da conta dele', async () => {
        const { admin } = bancoFalso(tabelas());
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'PROLABORE', reference_id: ITEM_A });
        expect(d.nome).toBe('Sócia A');
        expect(d.opcoes.map(o => o.ref)).toEqual(['socio:socio-a', 'socio-conta:cba-a']);
    });

    it('item do pró-labore da org do título apontando para sócio de OUTRA org (partner_id editado): nada do sócio sai', async () => {
        const t = tabelas();
        t.prolabore_payroll_items = [{ id: ITEM_A, payroll_id: 'folha-a', partner_id: 'socio-b' }];
        const { admin } = bancoFalso(t);
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'PROLABORE', reference_id: ITEM_A });
        expect(d.nome).toBeNull();
        expect(d.documento).toBeNull();
        expect(d.opcoes).toEqual([]);
    });

    it('sócio da org do título com a conta apontando para conta de empresa de OUTRA org: só a chave do sócio', async () => {
        const t = tabelas();
        t.company_partners = t.company_partners.map(p => (p.id === 'socio-a' ? { ...p, bank_account_id: 'cba-b' } : p));
        const { admin } = bancoFalso(t);
        const d = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'PROLABORE', reference_id: ITEM_A });
        expect(d.opcoes.map(o => o.ref)).toEqual(['socio:socio-a']);
    });

    it('item de pró-labore de outra org: responde como item inexistente, sem ler o sócio', async () => {
        const { admin, lidas } = bancoFalso(tabelas());
        const deFora = await destinoDoTitulo(admin, { organization_id: ORG_A, source_system: 'PROLABORE', reference_id: ITEM_B });
        const inexistente = await destinoDoTitulo(bancoFalso(tabelas()).admin,
            { organization_id: ORG_A, source_system: 'PROLABORE', reference_id: '44444444-4444-4444-8444-000000000000' });
        expect(deFora).toEqual(inexistente);
        expect(deFora.nome).toBeNull();
        expect(deFora.opcoes).toEqual([]);
        expect(lidas).not.toContain('company_partners');
    });
});
