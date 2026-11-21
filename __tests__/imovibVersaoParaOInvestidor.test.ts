import { describe, it, expect, vi } from 'vitest';

/**
 * Revisão das Fases 2–4 do plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md:
 * o que vai ao investidor (portal e prévia do gestor) sai do MESMO recorte — sem chaves internas do
 * estudo e com as listas do relatório só com os campos que o relatório usa.
 */
const rpc = vi.hoisted(() => ({ chamadas: [] as unknown[], resposta: null as unknown }));
vi.mock('../lib/supabase', () => ({
    supabase: { rpc: (nome: string, args: unknown) => { rpc.chamadas.push([nome, args]); return Promise.resolve({ data: rpc.resposta, error: null }); } },
}));

import { versaoPublicadaDoSnapshot, dadosDoRelatorioDaVersao, snapshotDaVersaoPublicada } from '../utils/imovibVersoes';
import { investorPortalTokenService } from '../services/investorPortalTokenService';
import { secoesDoRelatorio } from '../utils/imovibRelatorio';
import { baseStudy } from './fixtures/imovibEstudos';

const versao = { id: 'v1', label: 'Comitê', created_at: '2026-11-15T23:30:00Z' };
const organizacao = { name: 'Alpa', logo_url: null };
const snapshot = () => ({
    ...(baseStudy({ premise_notes: { discount_rate: { fonte: 'Comitê interno', data: '2026-11-01' } }, recommendation: 'renegociar', recommendation_notes: 'só com desconto', hurdle_margin_percent: 18 }) as object),
    cenarios: [{ id: 'c1', study_id: 'e', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0, created_at: 'x' }],
    relatorio: {
        socios: [{ id: 's1', study_id: 'e', name: 'Sócio A', share_percent: 60, capital_percent: 60, sort_order: 0, notes: 'nota interna', company_partner_id: 'cp1' }],
        comparaveis: [{ id: 'm1', study_id: 'e', name: 'Vizinho', price_sqm: 9500, sold_units: 10, total_units: 40, launch_date: '2026-01-01', distance_km: 1.2, notes: 'corretor disse', source: 'WhatsApp' }],
        riscos: [{ id: 'r1', study_id: 'e', category: 'juridico', description: 'Ônus', probability: 3, impact: 4, mitigation: 'Baixa', status: 'aberto', sort_order: 0, owner: 'Fulano' }],
        dueDiligence: [{ id: 'd1', study_id: 'e', item_key: 'matricula', label: 'Matrícula', status: 'ok', notes: 'Conferida', sort_order: 0, checked_by: 'u1', checked_at: '2026-11-10' }],
    },
}) as never;

describe('o que vai ao investidor', () => {
    it('sem parecer, critérios, notas de fonte; listas só com os campos do relatório', () => {
        const vp = versaoPublicadaDoSnapshot(snapshot(), versao, organizacao);
        for (const k of ['premise_notes', 'recommendation', 'recommendation_notes', 'hurdle_margin_percent']) expect(k in vp.study, k).toBe(false);
        expect(vp.relatorio.socios![0]).toEqual({ id: 's1', name: 'Sócio A', share_percent: 60, capital_percent: 60, sort_order: 0 });
        expect(vp.relatorio.comparaveis![0]).not.toHaveProperty('notes');
        expect(vp.relatorio.comparaveis![0]).not.toHaveProperty('source');
        expect(vp.relatorio.riscos![0]).not.toHaveProperty('owner');
        expect(vp.relatorio.dueDiligence![0]).not.toHaveProperty('checked_by');
        expect(vp.relatorio.dueDiligence![0].notes).toBe('Conferida');
        expect(vp.cenarios[0]).toEqual({ id: 'c1', name: 'Pessimista', kind: 'pessimista', choques: { preco: -10 }, sort_order: 0 });
    });

    it('edição do investidor: premissas sem as colunas de fonte e sem a contagem de "sem fonte"', () => {
        const vp = versaoPublicadaDoSnapshot(snapshot(), versao, organizacao);
        const premissas = secoesDoRelatorio(dadosDoRelatorioDaVersao(snapshotDaVersaoPublicada(vp), vp.versao), { edicao: 'investidor', versao })
            .find(s => s.id === 'premissas')!;
        expect(premissas.tabelas[0].colunas).toEqual(['Grupo', 'Premissa', 'Valor']);
        expect(premissas.paragrafos.join(' ')).not.toMatch(/sem fonte/);
        expect(JSON.stringify(premissas)).not.toContain('Comitê interno');
    });

    it('a data da versão é a de Brasília, não a de Greenwich (01h30 UTC de 16/11 = 15/11 às 22h30)', () => {
        const d = dadosDoRelatorioDaVersao(snapshot(), { created_at: '2026-11-16T01:30:00Z' });
        expect(d.hoje).toBe('2026-11-15');
    });

    it('o portal lê pela OPORTUNIDADE, não pelo estudo', async () => {
        rpc.resposta = { valid: true, study: baseStudy(), cenarios: [], relatorio: {}, versao, organizacao };
        await investorPortalTokenService.getVersaoPublicadaByToken('tok', 'oportunidade-1');
        expect(rpc.chamadas[0]).toEqual(['fn_investor_portal_get_versao', { p_token: 'tok', p_opportunity_id: 'oportunidade-1' }]);
    });
});
