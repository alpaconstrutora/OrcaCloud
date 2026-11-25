/**
 * Editar a renovação = SUBSTITUIR o aditivo (decisão do usuário, 25/11/2026 —
 * mesmo comportamento do Editar do Reajuste): o aditivo vira Cancelado e fica no
 * histórico, e nasce o próximo com os dados novos. Tudo o que pode recusar é
 * conferido ANTES de desfazer — falhar no meio deixaria o contrato sem renovação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let parcelasNaoPendentes: { id: string }[] = [];
const filtrosParcelas: unknown[][] = [];
function table() {
    const b: Record<string, unknown> = {};
    const filt = (...a: unknown[]) => { filtrosParcelas.push(a); return b; };
    Object.assign(b, {
        select: () => b, eq: filt, neq: filt, limit: filt,
        then: (resolve: (v: unknown) => void) => resolve({ data: parcelasNaoPendentes, error: null }),
    });
    return b;
}
vi.mock('../lib/supabase', () => ({ supabase: { from: () => table(), rpc: vi.fn() } }));

const getAddendumById = vi.fn();
const listAddendums = vi.fn();
vi.mock('../services/contractService', () => ({
    contractService: {
        getAddendumById: (...a: unknown[]) => getAddendumById(...a),
        listAddendums: (...a: unknown[]) => listAddendums(...a),
    },
    nextRentalNumber: vi.fn(), removeContractTransactionsFrom: vi.fn(), buildRecurringDueDates: vi.fn(),
    resolveDealUnitsInfo: vi.fn(), ultimoVencimentoDaSerie: vi.fn(), regerarTributosDaNegociacao: vi.fn(),
}));

import { contractRenewalService, motivoParaNaoEditarAditivo } from '../services/contractRenewalService';
import type { ContractAddendum, Contract } from '../types';

const AD1 = {
    id: 'ad1', contract_id: 'c1', number: 'AD-001', status: 'Cancelado', new_start_date: '2019-03-23',
    created_at: '2026-11-25T10:00:00Z',
} as ContractAddendum;
const AD2 = {
    id: 'ad2', contract_id: 'c1', number: 'AD-002', status: 'Aprovado', new_start_date: '2019-03-23',
    new_end_date: '2021-09-22', previous_end_date: '2019-03-22', new_value: 4784.92, previous_value: 4784.92,
    created_at: '2026-11-25T12:00:00Z',
} as ContractAddendum;
const AD3 = { ...AD2, id: 'ad3', number: 'AD-003', created_at: '2026-11-26T00:00:00Z' } as ContractAddendum;

describe('motivoParaNaoEditarAditivo', () => {
    it('a última renovação aprovada pode ser editada', () => {
        expect(motivoParaNaoEditarAditivo(AD2, [AD2, AD1])).toBeNull();
    });
    it('uma renovação que não é a última, não', () => {
        expect(motivoParaNaoEditarAditivo(AD2, [AD1, AD2, AD3])).toMatch(/última é o AD-003/);
    });
    it('aditivo rejeitado depois não conta como a última', () => {
        expect(motivoParaNaoEditarAditivo(AD2, [AD2, { ...AD3, status: 'Rejeitado' }])).toBeNull();
    });
    it('cancelado, pendente e aditivo que não é prorrogação dizem por quê', () => {
        expect(motivoParaNaoEditarAditivo(AD1, [AD1])).toMatch(/cancelado/);
        expect(motivoParaNaoEditarAditivo({ ...AD2, status: 'Pendente' }, [])).toMatch(/aprovada/);
        expect(motivoParaNaoEditarAditivo({ ...AD2, new_start_date: undefined }, [])).toMatch(/prorrogação/);
    });
});

describe('replaceAddendumRenewal — CTL-006, AD-002', () => {
    const ordem: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let preview: any, undo: any, renew: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        ordem.length = 0;
        filtrosParcelas.length = 0;
        parcelasNaoPendentes = [];
        getAddendumById.mockResolvedValue(AD2);
        listAddendums.mockResolvedValue([AD2, AD1]);
        preview = vi.spyOn(contractRenewalService, 'previewRenewal').mockImplementation(async () => {
            ordem.push('preview');
            return { startDate: '2019-03-23', endDate: '2021-12-22' } as never;
        });
        undo = vi.spyOn(contractRenewalService, 'undoAddendumRenewal').mockImplementation(async () => { ordem.push('undo'); });
        renew = vi.spyOn(contractRenewalService, 'renewByAddendum').mockImplementation(async () => {
            ordem.push('renew');
            return { addendum: AD3, parent: {} as Contract, preview: {} as never };
        });
    });

    it('confere, desfaz o AD-002 e gera o AD-003 com os dados novos, nessa ordem', async () => {
        const r = await contractRenewalService.replaceAddendumRenewal('ad2', { endDate: '2021-12-22', newValue: 5832.48 });
        expect(ordem).toEqual(['preview', 'undo', 'renew']);
        expect(preview).toHaveBeenCalledWith('c1', expect.objectContaining({ mode: 'ADITIVO', substituindo: AD2, endDate: '2021-12-22' }));
        expect(undo).toHaveBeenCalledWith('ad2');
        expect(renew).toHaveBeenCalledWith('c1', expect.objectContaining({ newValue: 5832.48, substituindo: AD2 }));
        expect(r.replaced.number).toBe('AD-002');
        expect(r.addendum.number).toBe('AD-003');
    });

    it('parcela do período já paga/conciliada: recusa sem desfazer nada', async () => {
        parcelasNaoPendentes = [{ id: 'p1' }];
        await expect(contractRenewalService.replaceAddendumRenewal('ad2', { endDate: '2021-12-22' }))
            .rejects.toThrow(/pagas ou conciliadas — não dá para editar/);
        expect(filtrosParcelas).toContainEqual(['contract_addendum_id', 'ad2']);
        expect(filtrosParcelas).toContainEqual(['status', 'PENDING']);
        expect(undo).not.toHaveBeenCalled();
        expect(renew).not.toHaveBeenCalled();
    });

    it('não é a última renovação: recusa sem desfazer nada', async () => {
        listAddendums.mockResolvedValue([AD3, AD2]);
        await expect(contractRenewalService.replaceAddendumRenewal('ad2', {})).rejects.toThrow(/última é o AD-003/);
        expect(undo).not.toHaveBeenCalled();
    });

    it('fim antes do início: recusa sem desfazer nada', async () => {
        preview.mockImplementation(async () => ({ startDate: '2019-03-23', endDate: '2019-03-01' }) as never);
        await expect(contractRenewalService.replaceAddendumRenewal('ad2', { endDate: '2019-03-01' }))
            .rejects.toThrow(/posterior a 23\/03\/2019/);
        expect(undo).not.toHaveBeenCalled();
    });

    it('aditivo novo falhou depois de desfazer: a mensagem diz que o AD-002 saiu e o que fazer', async () => {
        renew.mockImplementation(async () => { throw new Error('falhou'); });
        await expect(contractRenewalService.replaceAddendumRenewal('ad2', { endDate: '2021-12-22' }))
            .rejects.toThrow(/AD-002 foi desfeito, mas o aditivo novo não foi gerado \(falhou\)\. Gere a renovação de novo/);
    });
});
