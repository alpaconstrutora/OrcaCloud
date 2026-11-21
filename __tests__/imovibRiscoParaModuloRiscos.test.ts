/**
 * Fase 7.6 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md: o risco do estudo vira risco do
 * Módulo Riscos com ficha válida para as CHECKs de project_risks e a mesma probabilidade × impacto.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIA_NO_MODULO, motivoParaNaoLevar, riscoParaOModulo, type DestinoNoModulo } from '../utils/imovibRiscoParaModuloRiscos';
import { ROTULO_DA_CATEGORIA } from '../constants/imovibRiscos';
import { RISK_DIMENSOES } from '../types/risk';
import type { ImovibRisk } from '../types/imovib';

const risco = (over: Partial<ImovibRisk> = {}): ImovibRisk => ({
    id: 'r1', study_id: 's1', category: 'ambiental', description: 'Passivo ambiental aguardando laudo',
    probability: 4, impact: 3, status: 'aberto', sort_order: 0, mitigation: 'Contratar laudo', prazo: '2026-12-15', ...over,
});
const destino = (over: Partial<DestinoNoModulo> = {}): DestinoNoModulo => ({
    organizationId: 'org', empreendimentoId: 'emp', obraId: 'obra', ownerUserId: 'u1', ownerNome: 'Ana',
    categoriaPorCodigo: { R04: 'cat-amb' }, nomeDoEstudo: 'Garden', ...over,
});

describe('riscoParaOModulo', () => {
    it('com obra: escopo obra, categoria, dimensão e avaliação inerente iguais ao estudo', () => {
        const { ficha, avaliacao } = riscoParaOModulo(risco(), destino(), '2026-11-21');
        expect(ficha).toMatchObject({
            escopo: 'obra', project_id: 'obra', empreendimento_id: null, category_id: 'cat-amb',
            dimensoes: ['ambiental'], fase: 'viabilidade', status: 'identificado', estrategia: 'mitigar',
            proxima_revisao: '2026-12-15', owner_user_id: 'u1', evento: 'Passivo ambiental aguardando laudo',
        });
        expect(ficha.causa.trim()).not.toBe('');
        expect(ficha.consequencia.trim()).not.toBe('');
        expect(avaliacao).toMatchObject({ tipo: 'inerente', metodo: 'matriz_5x5', probabilidade: 4, impactos: { ambiental: 3 } });
    });

    it('sem obra: escopo empreendimento', () => {
        const { ficha } = riscoParaOModulo(risco(), destino({ obraId: null }), '2026-11-21');
        expect(ficha).toMatchObject({ escopo: 'empreendimento', empreendimento_id: 'emp', project_id: null });
    });

    it('aceito no estudo leva a justificativa (CHECK de aceitar)', () => {
        const { ficha } = riscoParaOModulo(risco({ status: 'aceito' }), destino(), '2026-11-21');
        expect(ficha.estrategia).toBe('aceitar');
        expect(ficha.justificativa_aceite).toContain('Garden');
    });

    it('prazo vencido ou ausente: revisão em 30 dias', () => {
        expect(riscoParaOModulo(risco({ prazo: '2026-01-01' }), destino(), '2026-11-21').ficha.proxima_revisao).toBe('2026-12-21');
        expect(riscoParaOModulo(risco({ prazo: null }), destino(), '2026-11-21').ficha.proxima_revisao).toBe('2026-12-21');
    });

    it('toda categoria do estudo tem código R e dimensão válida', () => {
        for (const c of Object.keys(ROTULO_DA_CATEGORIA)) {
            const m = CATEGORIA_NO_MODULO[c as ImovibRisk['category']];
            expect(m.codigo).toMatch(/^R\d{2}$/);
            expect(RISK_DIMENSOES).toContain(m.dimensao);
        }
    });
});

describe('motivoParaNaoLevar', () => {
    it('já levado, encerrado e sem empreendimento dizem por quê', () => {
        expect(motivoParaNaoLevar({ status: 'aberto', project_risk_id: 'x' }, 'emp')).toMatch(/já está/);
        expect(motivoParaNaoLevar({ status: 'encerrado' }, 'emp')).toMatch(/encerrado/);
        expect(motivoParaNaoLevar({ status: 'aberto' }, null)).toMatch(/empreendimento/);
        expect(motivoParaNaoLevar({ status: 'aberto' }, 'emp')).toBeNull();
    });
});
