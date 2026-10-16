/**
 * "Aplicar aos N boletos em revisão deste remetente?" (16/10/2026): prévia pela
 * mesma regra de casamento da sincronização e preenchimento só de campos vazios,
 * com trava por updated_at. Plano: docs/planos/2026-10-16-captura-padroes-do-remetente.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { tabela: string; metodo: string; args: unknown[] };
const chamadas: Chamada[] = [];
const banco = vi.hoisted(() => ({
    respostas: {} as Record<string, unknown[] | ((ch: Chamada[]) => unknown[])>,
}));

vi.mock('../lib/supabase', () => {
    const consulta = (tabela: string) => {
        const minhas: Chamada[] = [];
        const q: Record<string, unknown> = {};
        for (const metodo of ['select', 'eq', 'in', 'is', 'not', 'ilike', 'order', 'range', 'update', 'insert']) {
            q[metodo] = (...args: unknown[]) => { const c = { tabela, metodo, args }; chamadas.push(c); minhas.push(c); return q; };
        }
        q.then = (ok: (r: unknown) => unknown) => {
            const r = banco.respostas[tabela];
            const data = typeof r === 'function' ? r(minhas) : (r ?? []);
            return ok({ data, error: null });
        };
        return q;
    };
    return { supabase: { from: consulta, rpc: vi.fn(), functions: { invoke: vi.fn() } } };
});

import { emailCaptureService, type RemetenteCaptura } from '../services/emailCaptureService';
import { boletoService } from '../services/boletoService';

const remetente = (x: Partial<RemetenteCaptura> = {}): RemetenteCaptura => ({
    id: 'r1', organization_id: 'o1', account_id: 'c1', supplier_id: null, nome: 'LL', tipo: 'exato', email: 'll@contabil.com',
    dominio: null, palavras_chave: [], importacao: 'revisao', exigir_dmarc: true, ativo: true, pdf_senha_atualizada_em: null,
    created_at: '2026-10-16', padrao_descricao: 'Parcelamento {mês}', padrao_observacoes: null, padrao_project_id: null,
    padrao_cost_center_id: 'cc1', padrao_plano_de_contas_id: null, padrao_category_id: null, padrao_dia_vencimento: 20,
    padrao_valor: null, padrao_multa: null, padrao_multa_percentual: null, padrao_juros_dia: null, padrao_juros_dia_tipo: null, ...x,
});
const boleto = (id: string, x: Record<string, unknown> = {}) => ({
    id, numero: 1, updated_at: '2026-10-16T06:00:00Z', erros_validacao: ['Captura: Vencimento ausente ou implausível.'],
    vencimento: null, valor: 546.63, multa: null, multa_percentual: null, juros_dia: null, juros_dia_tipo: null,
    descricao: null, observacoes: null, project_id: null, cost_center_id: null, plano_de_contas_id: null, category_id: null, ...x,
});

beforeEach(() => { chamadas.length = 0; banco.respostas = {}; });

describe('prévia dos padrões', () => {
    it('só boletos do remetente (mesma regra da captura), da org, em revisão; e só com algo a preencher', async () => {
        const r = remetente();
        banco.respostas.email_capture_senders = [r, { ...remetente({ id: 'dom', tipo: 'dominio', email: null, dominio: 'contabil.com' }) }];
        banco.respostas.email_capture_messages = [
            { boleto_id: 'b1', remetente: 'LL <ll@contabil.com>', assunto: 'Guia', documento_nome: 'a.pdf', data_email: '2026-08-21T12:00:00Z', created_at: '2026-10-16' },
            // Outro endereço do mesmo domínio: casa com o cadastro "dom", não com r1.
            { boleto_id: 'b2', remetente: 'x@contabil.com', assunto: null, documento_nome: null, data_email: null, created_at: '2026-10-16' },
            { boleto_id: 'b3', remetente: 'll@contabil.com', assunto: null, documento_nome: null, data_email: '2026-08-21T12:00:00Z', created_at: '2026-10-16' },
        ];
        // b3 já tem tudo o que o padrão preencheria.
        banco.respostas.boletos = [boleto('b1'), boleto('b3', { vencimento: '2026-09-20', descricao: 'x', cost_center_id: 'ccX' })];

        const previa = await emailCaptureService.previaDosPadroes(r);
        expect(previa.map(p => p.boleto.id)).toEqual(['b1']);
        // Dia padrão 20, e-mail de 21/08 → o próximo dia 20 é 20/09.
        expect(previa[0].patch).toEqual({ vencimento: '2026-09-20', descricao: 'Parcelamento 09/2026', cost_center_id: 'cc1' });

        const filtrosBoletos = chamadas.filter(c => c.tabela === 'boletos');
        expect(filtrosBoletos).toEqual(expect.arrayContaining([
            { tabela: 'boletos', metodo: 'in', args: ['id', ['b1', 'b3']] },
            { tabela: 'boletos', metodo: 'eq', args: ['organization_id', 'o1'] },
            { tabela: 'boletos', metodo: 'in', args: ['status', ['revisao', 'rascunho']] },
            { tabela: 'boletos', metodo: 'is', args: ['invoice_id', null] },
        ]));
    });
});

describe('preencher com os padrões', () => {
    it('trava por updated_at, troca o aviso de vencimento ausente e audita; 0 linhas = pulado', async () => {
        let n = 0;
        banco.respostas.boletos = () => (++n === 1 ? [{ id: 'b1', organization_id: 'o1', status: 'revisao' }] : []);
        const r = await boletoService.preencherComPadroesDoRemetente([
            { boleto: { id: 'b1', updated_at: 'T1', erros_validacao: ['Captura: Vencimento ausente ou implausível.', 'outro'] }, patch: { vencimento: '2026-08-21' }, campos: ['vencimento'] },
            { boleto: { id: 'b2', updated_at: 'T2', erros_validacao: null }, patch: { cost_center_id: 'cc1' }, campos: ['cost_center_id'] },
        ], 'r1', 'quem@x.com');

        expect(r.atualizados.map(b => b.id)).toEqual(['b1']);
        expect(r.pulados).toBe(1);
        const updates = chamadas.filter(c => c.tabela === 'boletos' && c.metodo === 'update').map(c => c.args[0] as Record<string, unknown>);
        expect(updates[0]).toEqual({
            vencimento: '2026-08-21',
            erros_validacao: ['outro', 'Captura: Vencimento pelo padrão do remetente (o PDF não trouxe): confira antes de aprovar.'],
        });
        expect(chamadas).toEqual(expect.arrayContaining([
            { tabela: 'boletos', metodo: 'eq', args: ['updated_at', 'T1'] },
            { tabela: 'boletos', metodo: 'is', args: ['invoice_id', null] },
        ]));
        const auditoria = chamadas.filter(c => c.tabela === 'boletos_auditoria' && c.metodo === 'insert').map(c => c.args[0] as Record<string, unknown>);
        expect(auditoria).toHaveLength(1);
        expect(auditoria[0]).toMatchObject({ boleto_id: 'b1', acao: 'padroes_remetente', metodo: 'usuario', usuario_email: 'quem@x.com' });
    });
});
