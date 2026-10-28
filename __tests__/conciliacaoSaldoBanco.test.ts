import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    estadoDoSaldoBanco, resumoDoBanco, sugestoesDeAjuste, contaComMais, diaSeguinte,
    pareceTarifa, EXPRESSAO_TARIFA,
} from '../utils/conciliacaoSaldoBanco';
import type { ReconciliationAccountBalance } from '../types/financial';

const conta = (extra: Partial<ReconciliationAccountBalance> = {}): ReconciliationAccountBalance => ({
    account_id: 'a', account_name: 'Conta', bank_name: null,
    opening_balance: 0, opening_balance_date: null,
    bank_balance: 0, reconciled_balance: 0, difference: 0,
    pending_value: 0, pending_count: 0, unclassified_count: 0,
    ...extra,
});

// O caso real de 28/10/2026: extrato do Itaú de 2014 a 08/2026, saldo inicial 0.
const itau = conta({
    account_id: 'itau', account_name: 'Banco Itaú', pending_count: 7516, unclassified_count: 6000,
    saldo_banco: -39048.13, saldo_banco_data: '2026-09-14', saldo_banco_origem: 'OFX',
    calculado_na_data_banco: 10850187.26, pendentes_apos_data_banco: 0,
});
const asaas = conta({
    account_id: 'asaas', account_name: 'Asaas', pending_count: 3,
    saldo_banco: 138.35, saldo_banco_data: '2026-10-28', saldo_banco_origem: 'ASAAS', calculado_na_data_banco: 138.35,
});
const sicredi = conta({ account_id: 'sicredi', account_name: 'Sicredi', pending_count: 5329, unclassified_count: 50 });

describe('conciliação · saldo do banco', () => {
    it('três estados: bate, fora (com a diferença) e sem saldo do banco', () => {
        expect(estadoDoSaldoBanco(asaas)).toMatchObject({ tipo: 'bate', origem: 'ASAAS' });
        expect(estadoDoSaldoBanco(itau)).toMatchObject({ tipo: 'fora', origem: 'OFX', diferenca: -39048.13 - 10850187.26 });
        expect(estadoDoSaldoBanco(sicredi)).toEqual({ tipo: 'sem' });
        // Função antiga (sem os campos): sem saldo do banco, não "bate".
        expect(estadoDoSaldoBanco(conta())).toEqual({ tipo: 'sem' });
    });

    it('centavo de arredondamento ainda bate', () => {
        expect(estadoDoSaldoBanco(conta({ saldo_banco: 10, saldo_banco_data: '2026-10-01', calculado_na_data_banco: 10.004 })).tipo).toBe('bate');
    });

    it('resumo nomeia as contas de cada estado', () => {
        expect(resumoDoBanco([itau, asaas, sicredi])).toEqual({ total: 3, bate: ['Asaas'], fora: ['Banco Itaú'], sem: ['Sicredi'] });
    });

    it('duas sugestões: manter a data (valor que fecha) e recomeçar no saldo do banco', () => {
        const s = sugestoesDeAjuste(itau)!;
        expect(s.manterData).toEqual({ saldo: -10889235.39, data: null });
        expect(s.recomecar).toEqual({ saldo: -39048.13, data: '2026-09-15', pendentesQueSaem: 7516, pendentesQueFicam: 0 });
        expect(sugestoesDeAjuste(asaas)).toBeNull();
        expect(sugestoesDeAjuste(sicredi)).toBeNull();
    });

    it('manter a data soma a diferença ao saldo inicial que já existe', () => {
        const c = conta({ opening_balance: 1000, opening_balance_date: '2026-01-01', saldo_banco: 1500, saldo_banco_data: '2026-03-31', calculado_na_data_banco: 1200 });
        expect(sugestoesDeAjuste(c)!.manterData).toEqual({ saldo: 1300, data: '2026-01-01' });
    });

    it('dia seguinte vira o mês e o ano', () => {
        expect(diaSeguinte('2026-09-14')).toBe('2026-09-15');
        expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
        expect(diaSeguinte('2028-02-28')).toBe('2028-02-29');
    });

    it('conta com mais pendências — nenhuma quando todas zeradas', () => {
        expect(contaComMais([asaas, itau, sicredi], 'pending_count')?.account_name).toBe('Banco Itaú');
        expect(contaComMais([asaas, itau, sicredi], 'unclassified_count')?.account_name).toBe('Banco Itaú');
        expect(contaComMais([asaas], 'unclassified_count')).toBeNull();
    });

    it('possível tarifa: saída, sem categoria, descrição com o termo', () => {
        expect(pareceTarifa({ direction: 'DEBIT', category: null, description_normalized: 'TARIFA PACOTE SERVICOS' })).toBe(true);
        expect(pareceTarifa({ direction: 'DEBIT', category: null, description_normalized: 'IOF ADICIONAL' })).toBe(true);
        expect(pareceTarifa({ direction: 'CREDIT', category: null, description_normalized: 'TARIFA ESTORNADA' })).toBe(false);
        expect(pareceTarifa({ direction: 'DEBIT', category: 'Tarifas', description_normalized: 'TARIFA' })).toBe(false);
        expect(pareceTarifa({ direction: 'DEBIT', category: null, description_normalized: 'PIX FORNECEDOR' })).toBe(false);
    });

    it('a expressão de tarifa é a MESMA da função do banco (o alerta e o recorte contam igual)', () => {
        const pasta = path.join(process.cwd(), 'supabase', 'migrations');
        const ultima = readdirSync(pasta).filter(f => f.endsWith('.sql'))
            // A que DEFINE a função — não basta citar: o Dashboard financeiro a CHAMA
            // (aplicar_20271029400000) e virava a "última", sem a expressão de tarifa.
            .filter(f => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fn_reconciliation_dashboard\s*\(/i.test(readFileSync(path.join(pasta, f), 'utf8')))
            .sort((a, b) => (a.replace(/^aplicar_/, '')).localeCompare(b.replace(/^aplicar_/, ''))).pop()!;
        const sql = readFileSync(path.join(pasta, ultima), 'utf8');
        const m = /description_normalized ~ '([^']+)'/.exec(sql);
        expect(m?.[1]).toBe(EXPRESSAO_TARIFA.source);
    });
});
