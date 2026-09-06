/**
 * Memória de classificação por contraparte — item 2.3 do plano de conciliação.
 *
 * A chave é o coração da coisa: se ela casar demais, a memória espalha classificação
 * errada por toda a base; se casar de menos, não serve para nada. Os casos abaixo saem
 * de descrições reais do extrato em produção.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { chaveDaContraparte, camposAAplicar, normalizarTexto } from '../services/reconciliationMemoryService';

describe('chaveDaContraparte — documento é identidade forte', () => {
    it('acha o CNPJ no texto bruto do extrato', () => {
        const r = chaveDaContraparte({ description_raw: 'PAGAMENTO PIX-PIX_DEB   11866633000101 EMPORIUM DOS PAES' });
        expect(r).toEqual({ key: '11866633000101', kind: 'DOCUMENTO' });
    });

    it('acha o CPF', () => {
        const r = chaveDaContraparte({ description_raw: 'PAGAMENTO PIX SICREDI-CX140166  07593144000148 REGINALDO BEN' });
        expect(r?.kind).toBe('DOCUMENTO');
        expect(r?.key).toBe('07593144000148');
    });

    it('aceita documento com máscara', () => {
        const r = chaveDaContraparte({ description_raw: 'TED 11.866.633/0001-01 EMPORIUM' });
        expect(r).toEqual({ key: '11866633000101', kind: 'DOCUMENTO' });
    });

    it('IGNORA corrida de dígitos que não é CPF nem CNPJ', () => {
        // 10 e 13 dígitos não são documento: seriam número de boleto, código, id do banco.
        const r = chaveDaContraparte({ description_raw: 'PAGTO BOLETO 1234567890123 FORNECEDOR ALFA' });
        expect(r?.kind).toBe('TOKEN');
    });
});

describe('chaveDaContraparte — token quando não há documento', () => {
    it('tira o jargão bancário e fica com o nome', () => {
        const r = chaveDaContraparte({ counterparty_name: 'PIX ENVIADO CONSTRUTORA ALPA LTDA' });
        expect(r).toEqual({ key: 'CONSTRUTORA ALPA', kind: 'TOKEN' });
    });

    it('a mesma contraparte com jargão diferente dá a MESMA chave', () => {
        const a = chaveDaContraparte({ counterparty_name: 'PIX ENVIADO EMPORIUM DOS PAES' });
        const b = chaveDaContraparte({ counterparty_name: 'TED PAGAMENTO EMPORIUM DOS PAES LTDA' });
        expect(a?.key).toBe(b?.key);
    });

    it('ignora acento e caixa', () => {
        const a = chaveDaContraparte({ counterparty_name: 'Construção Sul Minas' });
        const b = chaveDaContraparte({ counterparty_name: 'CONSTRUCAO SUL MINAS' });
        expect(a?.key).toBe(b?.key);
    });

    it('prefere counterparty_name à descrição, quando existe', () => {
        const r = chaveDaContraparte({
            counterparty_name: 'ENERGISA SUL SUDESTE',
            description_normalized: 'PAGAMENTO CONTA DE LUZ',
        });
        expect(r?.key).toBe('ENERGISA SUL SUDESTE');
    });

    it('texto só de jargão não vira chave', () => {
        expect(chaveDaContraparte({ counterparty_name: 'PIX RECEBIDO' })).toBeNull();
        expect(chaveDaContraparte({ counterparty_name: 'TARIFA' })).toBeNull();
        expect(chaveDaContraparte({})).toBeNull();
    });

    it('contrapartes diferentes não colidem', () => {
        const a = chaveDaContraparte({ counterparty_name: 'EMPORIUM DOS PAES' });
        const b = chaveDaContraparte({ counterparty_name: 'REGINALDO BENEDITO NUNES' });
        expect(a?.key).not.toBe(b?.key);
    });
});

describe('camposAAplicar — nunca sobrescreve decisão anterior', () => {
    const memoria = { category: 'Combustível', project_id: 'obra-1', cost_center_id: 'cc-1', party_name: 'Auto Posto Cambuí' };

    it('movimento vazio recebe tudo', () => {
        expect(camposAAplicar({}, memoria)).toEqual({
            category: 'Combustível', project_id: 'obra-1', cost_center_id: 'cc-1', counterparty_name: 'Auto Posto Cambuí',
        });
    });

    it('campo já preenchido é preservado', () => {
        const patch = camposAAplicar({ category: 'Manutenção', counterparty_name: 'Posto X' }, memoria);
        expect(patch).toEqual({ project_id: 'obra-1', cost_center_id: 'cc-1' });
    });

    it('movimento completo não recebe nada', () => {
        const patch = camposAAplicar(
            { category: 'X', project_id: 'o', cost_center_id: 'c', counterparty_name: 'N' }, memoria);
        expect(patch).toEqual({});
    });

    it('memória vazia não apaga nem preenche', () => {
        const patch = camposAAplicar({}, { category: null, project_id: null, cost_center_id: null, party_name: null });
        expect(patch).toEqual({});
    });

    it('string em branco conta como vazio dos dois lados', () => {
        const patch = camposAAplicar({ category: '   ' }, { ...memoria, project_id: '  ' });
        expect(patch.category).toBe('Combustível');
        expect(patch.project_id).toBeUndefined();
    });
});

describe('normalizarTexto', () => {
    it('é a mesma régua do motor de conciliação', () => {
        expect(normalizarTexto('Construção  Sul-Minas Ltda.')).toBe('CONSTRUCAO SUL MINAS LTDA');
        expect(normalizarTexto('')).toBe('');
    });
});
