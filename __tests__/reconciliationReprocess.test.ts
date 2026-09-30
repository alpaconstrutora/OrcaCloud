/**
 * O "Reprocessar" da Central roda memória → regras → motor, e uma etapa que falha
 * não derruba as outras. Plano 2026-09-30-conciliacao-regras-absorvidas-pela-central.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

const ordem: string[] = [];
const aplicarMemoria = vi.fn();
const aplicarRegras = vi.fn();
const rodarMotor = vi.fn();

vi.mock('../services/reconciliationMemoryService', () => ({
    reconciliationMemoryService: { aplicar: (...a: unknown[]) => { ordem.push('memória'); return aplicarMemoria(...a); } },
}));
vi.mock('../services/bankReconciliationService', () => ({
    bankReconciliationService: {
        applyCustomRules: (...a: unknown[]) => { ordem.push('regras'); return aplicarRegras(...a); },
        runMatchingEngineTracked: (...a: unknown[]) => { ordem.push('motor'); return rodarMotor(...a); },
    },
}));

import { reconciliationReprocessService, resumoDoReprocesso } from '../services/reconciliationReprocessService';

const motorOk = { autoApplied: 9, suggestions: 30, exactUnique: 2, transfersPaired: 1, bankRowsScanned: 100, titleRowsScanned: 50 };

beforeEach(() => {
    ordem.length = 0;
    aplicarMemoria.mockReset().mockResolvedValue({ analisados: 50, aplicados: 12, campos: 20 });
    aplicarRegras.mockReset().mockResolvedValue(4);
    rodarMotor.mockReset().mockResolvedValue(motorOk);
});

describe('reprocessarTudo', () => {
    it('roda memória, depois regras, depois o motor — nessa ordem', async () => {
        const r = await reconciliationReprocessService.reprocessarTudo('conta-1', 'org-1');
        expect(ordem).toEqual(['memória', 'regras', 'motor']);
        expect(r).toEqual({ memoria: { aplicados: 12, campos: 20 }, regras: 4, motor: motorOk, erros: [] });
        expect(rodarMotor).toHaveBeenCalledWith('conta-1', 'org-1', 'MANUAL');
    });

    it('memória falhando não impede regras nem motor, e o erro volta', async () => {
        aplicarMemoria.mockRejectedValue(new Error('timeout'));
        const r = await reconciliationReprocessService.reprocessarTudo('conta-1', null);
        expect(ordem).toEqual(['memória', 'regras', 'motor']);
        expect(r.memoria).toBeNull();
        expect(r.regras).toBe(4);
        expect(r.motor).toEqual(motorOk);
        expect(r.erros).toEqual([{ etapa: 'memória', mensagem: 'timeout' }]);
    });

    it('erro do PostgREST (sem ser Error) chega legível, com código', async () => {
        aplicarRegras.mockRejectedValue({ message: 'invalid input syntax for type uuid', code: '22P02' });
        const r = await reconciliationReprocessService.reprocessarTudo('conta-1', '');
        expect(r.erros).toEqual([{ etapa: 'regras', mensagem: 'invalid input syntax for type uuid (22P02)' }]);
        expect(r.motor).toEqual(motorOk);
    });
});

describe('resumoDoReprocesso — o toast diz de onde veio cada número', () => {
    it('as três fontes', () => {
        expect(resumoDoReprocesso({ memoria: { aplicados: 12, campos: 20 }, regras: 4, motor: motorOk, erros: [] }))
            .toBe('12 classificado(s) pela memória · 4 por regra · 9 conciliado(s) automaticamente (2 por valor exato e candidato único) · 1 transferência(s) entre contas pareada(s) · 30 sugestão(ões) para revisar');
    });
    it('etapa que não fez nada não aparece; o total de sugestões sempre aparece', () => {
        expect(resumoDoReprocesso({ memoria: { aplicados: 0, campos: 0 }, regras: 0, motor: { ...motorOk, autoApplied: 0, transfersPaired: 0, suggestions: 3 }, erros: [] }))
            .toBe('3 sugestão(ões) para revisar');
    });
    it('falha aparece no texto, não só no console', () => {
        expect(resumoDoReprocesso({ memoria: null, regras: 4, motor: null, erros: [{ etapa: 'motor', mensagem: 'Edge fora' }] }))
            .toBe('4 por regra · falhou na motor: Edge fora');
    });
});
