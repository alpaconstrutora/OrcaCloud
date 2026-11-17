import { describe, expect, it } from 'vitest';
import { montarResumo, type DadosDoResumo } from '../supabase/functions/diretoria-resumo-semanal/resumo';

// Plano: docs/planos/2026-11-17-opura-ceo.md (Tarefa 10). O HTML do resumo semanal é puro:
// recebe o que fn_diretoria_resumo_dados devolve e monta assunto, HTML e texto.
const base = (p: Partial<DadosDoResumo> = {}): DadosDoResumo => ({
    hoje: '2026-11-16',
    orgs: [{ id: 'a', nome: 'Alpa Construtora' }],
    excecoes: [
        { chave: 'k1', tipo: 'conta_vencida', org_id: 'a', grupo: null, severidade: 'critico', responsaveis: ['lia'],
          origem_responsavel: 'area', quantidade: 694, valor: 1415562, dias: 45, data_ref: '2026-10-02', itens: [] },
        { chave: 'k2', tipo: 'tarefa_vencida', org_id: 'a', grupo: null, severidade: 'atencao', responsaveis: ['rafa'],
          origem_responsavel: 'dado', quantidade: 3, valor: null, dias: 10, data_ref: '2026-11-06', itens: [] },
        { chave: 'k3', tipo: 'extrato_sem_conciliar', org_id: 'a', grupo: 'Sicredi <3012>', severidade: 'critico', responsaveis: [],
          origem_responsavel: 'nenhum', quantidade: 18, valor: 27480, dias: 40, data_ref: '2026-10-07', itens: [] },
    ],
    determinacoes: [
        { id: 'd1', organization_id: 'a', titulo: 'Renegociar <b>Concreteira</b>', responsavel_user_id: 'lia', prazo: '2026-11-10', status: 'aberta' },
        { id: 'd2', organization_id: 'a', titulo: 'Fechar contrato da loja 3', responsavel_user_id: 'rafa', prazo: '2026-11-20', status: 'andamento' },
        { id: 'd3', organization_id: 'a', titulo: 'Já feito', responsavel_user_id: 'rafa', prazo: '2026-11-01', status: 'concluida' },
    ],
    pessoas: [{ user_id: 'lia', nome: 'Lia Souza' }, { user_id: 'rafa', nome: 'Rafael Lima' }],
    silenciados: null,
    semana_anterior: null,
    destinatario: { email: 'ceo@x.com', nome: 'Diretor' },
    ...p,
});

describe('resumo semanal da Diretoria (e-mail)', () => {
    it('assunto traz a semana e as contagens', () => {
        const r = montarResumo(base(), 'https://app.x');
        expect(r.assunto).toBe('Diretoria — semana 47 (16/11 a 22/11): 2 pedem decisão, 1 determinação vencida');
    });

    it('pede decisão lista os críticos com responsável (ou "sem responsável"); determinação vencida e da semana', () => {
        const { texto } = montarResumo(base(), 'https://app.x');
        expect(texto).toContain('694 contas a pagar vencidas');
        expect(texto).toContain('Lia Souza');
        expect(texto).toContain('Sicredi <3012>: 18 linhas do extrato sem conciliar');
        expect(texto).toContain('sem responsável');
        expect(texto).toContain('VENCIDA desde 10/11/2026: Renegociar <b>Concreteira</b> — Lia Souza');
        expect(texto).toContain('Vence 20/11/2026: Fechar contrato da loja 3 — Rafael Lima');
        expect(texto).not.toContain('Já feito');
    });

    it('o resto em números: os grupos que não pedem decisão, por tipo', () => {
        const { texto } = montarResumo(base(), 'https://app.x');
        expect(texto).toContain('Tarefa vencida: 3');
    });

    it('tipos silenciados ficam fora do e-mail inteiro (inclusive do assunto)', () => {
        const r = montarResumo(base({ silenciados: 'conta_vencida' }), 'https://app.x');
        expect(r.texto).not.toContain('contas a pagar vencidas');
        expect(r.assunto).toContain('1 pede decisão');
    });

    it('melhorou × piorou com a foto da semana anterior; sem ela, avisa que começa na próxima', () => {
        const sem = montarResumo(base(), 'https://app.x');
        expect(sem.texto).toContain('A comparação começa na próxima semana');
        const com = montarResumo(base({
            semana_anterior: { semana: '2026-11-09', por_tipo: { conta_vencida: { quantidade: 700, valor: 1500000 }, tarefa_vencida: { quantidade: 1, valor: null } }, determinacoes_vencidas: 0 },
        }), 'https://app.x');
        expect(com.texto).toContain('Conta a pagar vencida: 700 → 694 (melhorou)');
        expect(com.texto).toContain('Tarefa vencida: 1 → 3 (piorou)');
        expect(com.texto).toContain('Extrato sem conciliar: 0 → 18 (piorou)');
        expect(com.texto).toContain('Determinações vencidas: 0 → 1 (piorou)');
    });

    it('texto de usuário é escapado no HTML (título de determinação, nome de conta)', () => {
        const { html } = montarResumo(base(), 'https://app.x');
        expect(html).not.toContain('<b>Concreteira</b>');
        expect(html).toContain('&lt;b&gt;Concreteira&lt;/b&gt;');
        expect(html).toContain('Sicredi &lt;3012&gt;');
        expect(html).toContain('href="https://app.x"');
    });

    it('com mais de uma organização, cada item diz de qual é', () => {
        const d = base({ orgs: [{ id: 'a', nome: 'Alpa Construtora' }, { id: 'b', nome: 'SPE Garden' }] });
        expect(montarResumo(d, 'https://app.x').texto).toContain('[Alpa Construtora]');
    });
});
