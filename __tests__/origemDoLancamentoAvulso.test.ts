// Ramo MANUAL do resolvedor de documento de origem (pagamento avulso).
// Plano: docs/planos/2026-10-17-contas-a-pagar-pagamento-avulso.md (item 4).
import { describe, expect, it } from 'vitest';
import { resolverOrigens, BUCKET_ANEXOS_AVULSO } from '../supabase/functions/_shared/origemDoLancamento';

function clienteFalso(linhas: Record<string, unknown[]>) {
    const consultas: { tabela: string; ids: string[] }[] = [];
    const cliente = {
        from(tabela: string) {
            const q: any = {
                select: () => q,
                in: async (_col: string, ids: string[]) => {
                    consultas.push({ tabela, ids });
                    return { data: linhas[tabela] ?? [], error: null };
                },
            };
            return q;
        },
    };
    return { cliente, consultas };
}

describe('origem do lançamento · MANUAL (pagamento avulso)', () => {
    it('resolve pelo ID da linha, com ou sem reference_id, no bucket financeiro-anexos', async () => {
        const { cliente, consultas } = clienteFalso({
            internal_transactions: [
                { id: 'tx-1', documento_path: 'org/avulso/g/recibo.pdf', documento_nome: 'Recibo cartório.pdf' },
                { id: 'tx-2', documento_path: null, documento_nome: null },
            ],
        });
        const m = await resolverOrigens(cliente, [
            { id: 'tx-1', source_system: 'MANUAL', reference_id: 'g:p1' },
            { id: 'tx-2', source_system: 'MANUAL', reference_id: null },
        ]);
        expect(consultas).toEqual([{ tabela: 'internal_transactions', ids: ['tx-1', 'tx-2'] }]);
        expect(m.get('tx-1')).toEqual({
            codigo: null,
            documento: { bucket: BUCKET_ANEXOS_AVULSO, path: 'org/avulso/g/recibo.pdf', nome: 'Recibo cartório.pdf' },
        });
        // Sem anexo, sem entrada — a coluna mostra "—", não um link quebrado.
        expect(m.has('tx-2')).toBe(false);
    });

    it('falha de leitura do avulso apaga só a coluna dele, não as outras origens', async () => {
        const cliente = {
            from(tabela: string) {
                const q: any = {
                    select: () => q,
                    in: async () => tabela === 'internal_transactions'
                        ? { data: null, error: { message: 'sem permissão' } }
                        : { data: [{ id: 'b-1', numero: 7, documento_path: 'org/7.pdf', documento_nome: null }], error: null },
                };
                return q;
            },
        };
        const m = await resolverOrigens(cliente, [
            { id: 'tx-a', source_system: 'MANUAL', reference_id: null },
            { id: 'tx-b', source_system: 'BOLETO', reference_id: 'b-1' },
        ]);
        expect(m.has('tx-a')).toBe(false);
        expect(m.get('tx-b')?.codigo).toBe('0007');
    });
});
