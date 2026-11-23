import { describe, it, expect } from 'vitest';
import { rotinaMeta, quandoRoda, statusDaExecucao, GRUPOS_ROTINA } from '../utils/rotinasAutomaticas';

/**
 * Catálogo das rotinas do pg_cron — Configurações › Rotinas automáticas.
 * Plano: docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md (Task 2).
 *
 * A lista abaixo são os 23 jobs que existiam em 16/11/2026, mais `limpar-historico-rotinas`
 * (criado no mesmo dia, plano 2026-11-16-rotinas-automaticas-pontos-abertos.md). Job novo sem
 * entrada no catálogo não quebra a tela: aparece em "Outras" com o nome técnico.
 */
const ROTINAS = [
    'process-sla-sweep', 'process-overdue-sweep', 'daily-financial-notifications', 'daily-payment-tasks',
    'task-alert-notifier', 'riscos-alertas-diarios', 'manutencao-vencimento-alerts', 'opura-docs-vencimento-alerts',
    'daily-academy-alerts', 'warranty-sla-sweep', 'vencimento-portal-alerts',
    'dunning-notifier-hourly', 'asaas-status-sync', 'asaas-conta-extrato', 'reconciliation-engine-sweep',
    'email-capture-sync', 'email-capture-busca-diaria', 'fiscal-fallback-polling',
    'financial-report-hourly', 'hourly-bi-report-check', 'monthly-investor-report',
    'planta-webhooks-retentativas', 'opura-market-feeds-diario', 'limpar-historico-rotinas',
];

const SENSIVEIS = [
    'dunning-notifier-hourly', 'asaas-status-sync', 'asaas-conta-extrato', 'reconciliation-engine-sweep',
    'email-capture-sync', 'email-capture-busca-diaria', 'fiscal-fallback-polling',
    'monthly-investor-report', 'planta-webhooks-retentativas',
];

describe('rotinaMeta', () => {
    it('cobre as 24 rotinas de 16/11/2026', () => {
        expect(ROTINAS).toHaveLength(24);
        for (const n of ROTINAS) {
            const m = rotinaMeta(n);
            expect(m.grupo, n).not.toBe('outras');
            expect(m.oQueFaz.length, n).toBeGreaterThan(0);
            expect(m.nome, n).not.toBe(n);
        }
    });

    it('sensíveis são exatamente as 9 do desenho, e toda sensível diz o que para', () => {
        const sensiveis = ROTINAS.filter(n => rotinaMeta(n).sensivel);
        expect(sensiveis.sort()).toEqual([...SENSIVEIS].sort());
        for (const n of SENSIVEIS) expect(rotinaMeta(n).aoDesligar, n).toBeTruthy();
    });

    it('a limpeza do histórico é técnica e não pede confirmação para desligar', () => {
        const m = rotinaMeta('limpar-historico-rotinas');
        expect(m.grupo).toBe('tecnicas');
        expect(m.sensivel).toBe(false);
        expect(m.oQueFaz).toMatch(/60 dias/);
    });

    it('a limpeza dos eventos do WhatsApp (OpenWA) é técnica e não pede confirmação para desligar', () => {
        const m = rotinaMeta('wa-limpar-eventos');
        expect(m.grupo).toBe('tecnicas');
        expect(m.sensivel).toBe(false);
        expect(m.oQueFaz).toBe('Limpa o registro de eventos do WhatsApp com mais de 30 dias.');
    });

    it('os grupos do desenho, na ordem', () => {
        expect(GRUPOS_ROTINA.map(g => g.rotulo)).toEqual([
            'Avisos à equipe', 'Dinheiro e sistemas externos', 'Relatórios', 'Técnicas', 'Outras',
        ]);
        expect(rotinaMeta('process-sla-sweep').grupo).toBe('avisos');
        expect(rotinaMeta('asaas-status-sync').grupo).toBe('dinheiro');
        expect(rotinaMeta('monthly-investor-report').grupo).toBe('relatorios');
        expect(rotinaMeta('opura-market-feeds-diario').grupo).toBe('tecnicas');
    });

    it('job desconhecido cai em Outras com o nome técnico', () => {
        expect(rotinaMeta('x-nova')).toEqual({ nome: 'x-nova', grupo: 'outras', oQueFaz: '', sensivel: false });
    });
});

describe('quandoRoda (cron em GMT → texto em BRT)', () => {
    it.each([
        ['* * * * *', 'A cada minuto'],
        ['*/2 * * * *', 'A cada 2 min'],
        ['*/10 * * * *', 'A cada 10 min'],
        ['*/15 * * * *', 'A cada 15 min'],
        ['0 * * * *', 'De hora em hora'],
        ['7 * * * *', 'De hora em hora (minuto 7)'],
        ['45 8 * * *', 'Diária às 05h45'],
        ['0 6 * * *', 'Diária às 03h00'],
        ['0 1 * * *', 'Diária às 22h00'],
        ['0 6 1 * *', 'Mensal, dia 1 às 03h00'],
        ['*/30 9-10 * * *', 'A cada 30 min, das 06h às 07h59'],
    ])('%s → %s', (cron, texto) => {
        expect(quandoRoda(cron)).toBe(texto);
    });

    it('formato desconhecido devolve a expressão crua', () => {
        expect(quandoRoda('0 9 * * 1-5')).toBe('0 9 * * 1-5');
        // mensal com hora < 3 GMT: em BRT cairia no dia anterior — não traduz
        expect(quandoRoda('0 2 1 * *')).toBe('0 2 1 * *');
        expect(quandoRoda('')).toBe('');
    });
});

// Pendências da revisão do #513 — docs/planos/2026-11-16-rotinas-automaticas-pendencias-menores.md
describe('rotina sem nome (jobname NULL no pg_cron)', () => {
    it('vira "Rotina sem nome (#N)" em Outras', () => {
        expect(rotinaMeta(null, 77)).toEqual({ nome: 'Rotina sem nome (#77)', grupo: 'outras', oQueFaz: '', sensivel: false });
    });
});

describe('statusDaExecucao — status do pg_cron em português', () => {
    it('traduz os seis status do cron.job_run_details', () => {
        expect(statusDaExecucao('succeeded')).toBe('concluída');
        expect(statusDaExecucao('failed')).toBe('falhou');
        expect(statusDaExecucao('running')).toBe('rodando');
        expect(statusDaExecucao('starting')).toBe('iniciando');
        expect(statusDaExecucao('connecting')).toBe('conectando');
        expect(statusDaExecucao('sending')).toBe('enviando');
    });
    it('status desconhecido passa como veio', () => {
        expect(statusDaExecucao('novo-status')).toBe('novo-status');
    });
});
