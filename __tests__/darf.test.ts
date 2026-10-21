/**
 * Regras puras do DARF (utils/darf.ts) — plano docs/planos/2026-10-21-agrupar-tributos-em-darf.md.
 * O banco repete as mesmas regras em `fn_darf_criar`; aqui elas existem para a
 * tela dizer o motivo antes do clique, e para Contas a Pagar mostrar UMA linha.
 */
import { describe, it, expect } from 'vitest';
import type { Darf, Payable, TaxPayable } from '../types/financial';
import {
    colapsarDarfs, competenciaBR, formatarLinhaDigitavel, linhaContemId, menorVencimento,
    motivoNaoAgrupavel, normalizarLinhaDigitavel, statusDoDarf, validarSelecaoParaDarf,
} from '../utils/darf';

const tributo = (id: string, over: Partial<TaxPayable> = {}): TaxPayable => ({
    id, organization_id: 'org1', source_system: 'COMMERCIAL', transaction_date: '2026-10-05', due_date: '2026-10-25',
    amount: 100, direction: 'DEBIT', party_name: 'PIS', party_type: 'TAX',
    status: 'PENDING', business_status: 'PREVISTO', effective_status: 'PREVISTO', ...over,
});

describe('motivoNaoAgrupavel', () => {
    it('em aberto (a pagar ou vencido) pode', () => {
        expect(motivoNaoAgrupavel(tributo('a'))).toBeNull();
        expect(motivoNaoAgrupavel(tributo('b', { effective_status: 'VENCIDO' }))).toBeNull();
    });
    it('pago, retido, cancelado, conciliado e já em DARF dizem por quê', () => {
        expect(motivoNaoAgrupavel(tributo('p', { effective_status: 'PAGO' }))).toMatch(/Pago/);
        expect(motivoNaoAgrupavel(tributo('r', { effective_status: 'RETIDO', business_status: 'RETIDO' }))).toMatch(/Retido pelo cliente/);
        expect(motivoNaoAgrupavel(tributo('c', { effective_status: 'CANCELADO' }))).toBe('Cancelado');
        expect(motivoNaoAgrupavel(tributo('k', { status: 'CONCILIATED' }))).toMatch(/Conciliado/);
        expect(motivoNaoAgrupavel(tributo('d', { darf_id: 'x', due_date: '2026-10-30' }))).toBe('Já está no DARF de venc. 30/10/2026');
    });
});

describe('validarSelecaoParaDarf', () => {
    it('2 tributos da mesma org e competência: ok, com org, competência e total', () => {
        const v = validarSelecaoParaDarf([tributo('a'), tributo('b', { amount: 50, transaction_date: '2026-10-20' })]);
        expect(v).toMatchObject({ ok: true, orgId: 'org1', competencia: '2026-10', total: 150 });
    });
    it('1 tributo só vale com multa/juros', () => {
        expect(validarSelecaoParaDarf([tributo('a')]).motivo).toBe('Selecione ao menos 2 tributos');
        expect(validarSelecaoParaDarf([tributo('a')], true).ok).toBe(true);
    });
    it('organizações misturadas', () => {
        expect(validarSelecaoParaDarf([tributo('a'), tributo('b', { organization_id: 'org2' })]).motivo)
            .toMatch(/mistura organizações/);
    });
    it('competências diferentes dizem quais', () => {
        expect(validarSelecaoParaDarf([tributo('a'), tributo('b', { transaction_date: '2026-09-30' })]).motivo)
            .toBe('Um DARF só junta tributos da mesma competência — a seleção tem 09/2026 e 10/2026');
    });
    it('um tributo bloqueado na seleção nomeia o tributo e o motivo', () => {
        expect(validarSelecaoParaDarf([tributo('a'), tributo('b', { party_name: 'IRRF', effective_status: 'RETIDO' })]).motivo)
            .toBe('IRRF: Retido pelo cliente — não é pago pela empresa');
    });
});

describe('linha digitável e datas', () => {
    it('aceita vazio, 44 ou 48 dígitos; ignora pontuação', () => {
        expect(normalizarLinhaDigitavel('')).toEqual({ digitos: '', valido: true });
        expect(normalizarLinhaDigitavel('8580000000-1 '.repeat(4)).digitos).toHaveLength(44);
        expect(normalizarLinhaDigitavel('1'.repeat(48)).valido).toBe(true);
        expect(normalizarLinhaDigitavel('123').valido).toBe(false);
    });
    it('formata a linha de 48 dígitos em 4 blocos', () => {
        expect(formatarLinhaDigitavel('85800000000100000000000200000000000300000000000400'.slice(0, 48)))
            .toBe('85800000000-1 00000000000-2 00000000000-3 00000000000-4');
    });
    it('menor vencimento e competência', () => {
        expect(menorVencimento([{ due_date: '2026-10-25' }, { due_date: '2026-10-20' }, { due_date: undefined }])).toBe('2026-10-20');
        expect(competenciaBR('2026-10-01')).toBe('10/2026');
    });
});

const membro = (id: string, over: Partial<Payable> = {}): Payable => ({
    id, organization_id: 'org1', source_system: 'COMMERCIAL', transaction_date: '2026-10-05', due_date: '2026-10-30',
    amount: 100, direction: 'DEBIT', party_type: 'TAX', party_name: 'PIS', description: `Tributo ${id}`,
    status: 'PENDING', business_status: 'PREVISTO', effective_status: 'PREVISTO', darf_id: 'D1', ...over,
});
const darf: Darf = {
    id: 'D1', organization_id: 'org1', competencia: '2026-10-01', due_date: '2026-10-30',
    codigo_barras: null, numero_documento: '07.1', observacao: null, documento_path: 'org1/darf/D1/guia.pdf', documento_nome: 'guia.pdf',
    principal: 300, multa: 10, juros: 0, total: 310, qtd_tributos: 2, tributos_nomes: 'COFINS, PIS', n_membros: 3, n_pagos: 0,
    payment_date: null, payment_type: null, conciliado_no_extrato: false, alcada_pendente: false, asaas_em_curso: false, status_efetivo: 'PREVISTO',
};

describe('statusDoDarf', () => {
    it('todos pagos → PAGO; alguns → PARCIAL; senão vencido/previsto pela data', () => {
        const pago = { status: 'CONCILIATED' as const, business_status: 'PAGO' as const };
        const aberto = { status: 'PENDING' as const, business_status: 'PREVISTO' as const };
        expect(statusDoDarf([pago, pago], '2026-10-30', '2026-10-21')).toBe('PAGO');
        expect(statusDoDarf([pago, aberto], '2026-10-30', '2026-10-21')).toBe('PARCIAL');
        expect(statusDoDarf([aberto], '2026-10-20', '2026-10-21')).toBe('VENCIDO');
        expect(statusDoDarf([aberto], '2026-10-21', '2026-10-21')).toBe('PREVISTO');
    });
});

describe('colapsarDarfs — Contas a Pagar mostra o DARF como UMA linha', () => {
    const solto = membro('solto', { darf_id: null, due_date: '2026-10-01' });
    const pis = membro('pis', { amount: 100 });
    const cofins = membro('cofins', { amount: 200, party_name: 'COFINS' });
    const multa = membro('multa', { amount: 10, source_system: 'DARF', party_type: 'GOVERNMENT', party_name: 'Receita Federal' });

    it('tira os membros e põe uma linha com o total, na posição do primeiro membro', () => {
        const linhas = colapsarDarfs([solto, pis, cofins, multa], [darf], '2026-10-21');
        expect(linhas.map(l => l.id)).toEqual(['solto', 'D1']);
        const d = linhas[1];
        expect(d).toMatchObject({
            source_system: 'DARF', amount: 310, due_date: '2026-10-30', effective_status: 'PREVISTO',
            party_name: 'Receita Federal (DARF)', description: 'DARF 10/2026 · COFINS, PIS + multa/juros',
            documento_path: 'org1/darf/D1/guia.pdf',
        });
        expect(d.darf?.componentes.map(c => c.id)).toEqual(['pis', 'cofins', 'multa']);
    });

    it('a soma "a pagar" não muda; só a contagem (3 títulos viram 1)', () => {
        const antes = [solto, pis, cofins, multa];
        const depois = colapsarDarfs(antes, [darf], '2026-10-21');
        const soma = (ls: Payable[]) => ls.reduce((s, l) => s + l.amount, 0);
        expect(soma(depois)).toBe(soma(antes));
        expect(depois).toHaveLength(2);
    });

    it('status e pagamento seguem os membros (estado local depois da baixa)', () => {
        const pagos = [pis, cofins, multa].map(m => ({ ...m, status: 'CONCILIATED' as const, business_status: 'PAGO' as const, payment_date: '2026-10-21' }));
        const [d] = colapsarDarfs(pagos, [darf], '2026-10-21');
        expect(d.effective_status).toBe('PAGO');
        expect(d.payment_date).toBe('2026-10-21');
    });

    it('a busca acha o DARF pelos componentes; o deep-link pelo id de um componente', () => {
        const [, d] = colapsarDarfs([solto, pis, cofins, multa], [darf], '2026-10-21');
        expect(d.darf?.busca).toMatch(/COFINS/);
        expect(linhaContemId(d, 'cofins')).toBe(true);
        expect(linhaContemId(d, 'solto')).toBe(false);
    });

    it('membro cujo DARF não veio continua solto (linha sumida é pior que linha a mais)', () => {
        expect(colapsarDarfs([pis, cofins], [], '2026-10-21').map(l => l.id)).toEqual(['pis', 'cofins']);
    });
});
