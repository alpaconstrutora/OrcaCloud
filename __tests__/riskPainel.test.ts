import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import type { ProjectRisk, RiskAction } from '../types/risk';
import {
    acoesEmAtraso, exposicao, hojeLocalISO, principaisRiscos, recortarRiscos, riscosComPlano, type ContextoRecorte,
} from '../utils/riskPainel';
import { filtrarRegistro, type FiltrosRegistro } from '../components/riscos/RiscosRegistro';
import { validarFicha, fichaVazia } from '../components/riscos/RiscoFicha';

/**
 * Painel × Registro (CA11): o número de cada cartão é o tamanho da lista que a aba
 * Registro mostra com o recorte correspondente — as duas leem as MESMAS funções.
 */
const risco = (p: Partial<ProjectRisk>): ProjectRisk => ({
    id: 'r', organization_id: 'org-a', numero: 1, codigo: 'RSC-0001', catalog_id: null, catalog_codigo: null, catalog_versao: null,
    category_id: null, tipo: 'ameaca', titulo: 'Risco', causa: 'c', evento: 'e', consequencia: 'q', tags: [], dimensoes: [],
    escopo: 'obra', empreendimento_id: null, project_id: 'obra-1', contract_id: null, frente: null, localizacao: null, fase: null,
    partes_afetadas: null, owner_user_id: 'u', owner_nome: 'Ana', avaliador_user_id: null, aprovador_user_id: null,
    data_identificacao: '2026-11-01', proxima_revisao: '2026-12-01', controles_existentes: null, estrategia: null,
    plano_resposta: null, contingencia: null, justificativa_aceite: null, status: 'identificado', encerramento_motivo: null,
    encerrado_em: null, gatilho_critico: false, gatilho_motivo: null, inerente_probabilidade: null, inerente_impacto: null,
    inerente_pontuacao: null, residual_probabilidade: null, residual_impacto: null, residual_pontuacao: null, valor_esperado: null,
    ultima_avaliacao_em: null, sst_document_tipo: null, sst_document_id: null, created_at: '', updated_at: '', ...p,
});
const acao = (p: Partial<RiskAction>): RiskAction => ({
    id: 'a', organization_id: 'org-a', project_risk_id: 'r', tipo: 'preventiva', descricao: 'd', responsavel_user_id: 'u',
    responsavel_nome: 'Ana', prazo: '2026-12-01', custo_previsto: 0, custo_realizado: null, status: 'planejada', concluida_em: null,
    evidencia_url: null, evidencia_document_id: null, evidencia_descricao: null, eficacia: 'nao_verificada',
    eficacia_verificada_por: null, eficacia_verificada_em: null, eficacia_observacao: null, task_id: null, created_at: '', updated_at: '', ...p,
});

const HOJE = '2026-11-14';
const riscos = [
    risco({ id: 'r1', inerente_pontuacao: 20, gatilho_critico: false, valor_esperado: 60000 }),          // crítico pela nota
    risco({ id: 'r2', inerente_pontuacao: 2, gatilho_critico: true, gatilho_motivo: 'vida' }),          // crítico pelo gatilho
    risco({ id: 'r3', inerente_pontuacao: 12, residual_pontuacao: 4, proxima_revisao: '2026-11-01' }),  // revisão vencida, baixo
    risco({ id: 'r4', status: 'encerrado', inerente_pontuacao: 25, proxima_revisao: '2026-01-01', valor_esperado: 999 }), // fora de tudo
    risco({ id: 'r5' }),                                                                                  // sem avaliação
];
const acoes = [
    acao({ id: 'a1', project_risk_id: 'r1', prazo: '2026-11-10' }),                       // em atraso
    acao({ id: 'a2', project_risk_id: 'r3', status: 'cancelada', prazo: '2026-11-01' }),  // cancelada: não é plano nem atraso
    acao({ id: 'a3', project_risk_id: 'r2', status: 'concluida', concluida_em: '2026-11-02', prazo: '2026-11-01' }),
];
const ctx: ContextoRecorte = { hoje: HOJE, faixasPorOrg: {}, comPlano: riscosComPlano(acoes) };
const semFiltro: FiltrosRegistro = { busca: '', status: '', nivel: '', obra: '', recorte: '' };
const registro = (recorte: FiltrosRegistro['recorte']) =>
    filtrarRegistro(riscos, { ...semFiltro, recorte }, ctx, () => '', () => '').map(r => r.id);

describe('riskPainel — cartões do Painel = lista da aba Registro (CA11)', () => {
    it('ativos, críticos (gatilho escala — CA04), sem plano e revisão vencida', () => {
        expect(recortarRiscos(riscos, 'ativos', ctx).map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r5']);
        expect(recortarRiscos(riscos, 'criticos', ctx).map(r => r.id)).toEqual(['r1', 'r2']);
        expect(recortarRiscos(riscos, 'sem_plano', ctx).map(r => r.id)).toEqual(['r3', 'r5']);
        expect(recortarRiscos(riscos, 'revisao_vencida', ctx).map(r => r.id)).toEqual(['r3']);
        for (const rec of ['ativos', 'criticos', 'sem_plano', 'revisao_vencida'] as const) {
            expect(registro(rec)).toEqual(recortarRiscos(riscos, rec, ctx).map(r => r.id));
        }
    });

    it('filtro "Nível: crítico" do Registro conta o gatilho como crítico', () => {
        expect(filtrarRegistro(riscos, { ...semFiltro, nivel: 'critico' }, ctx, () => '', () => '').map(r => r.id)).toEqual(['r1', 'r2', 'r4']);
        expect(filtrarRegistro(riscos, { ...semFiltro, nivel: 'sem_avaliacao' }, ctx, () => '', () => '').map(r => r.id)).toEqual(['r5']);
    });

    it('tratamentos em atraso: só planejada/em andamento com prazo antes de hoje', () => {
        expect(acoesEmAtraso(acoes, HOJE).map(a => a.id)).toEqual(['a1']);
    });

    it('exposição soma o valor esperado só dos ativos', () => {
        expect(exposicao(riscos)).toEqual({ total: 60000, comValor: 1 });
    });

    it('10 principais: gatilho primeiro, depois a maior pontuação vigente; encerrado fora', () => {
        expect(principaisRiscos(riscos).map(r => r.id)).toEqual(['r2', 'r1', 'r3', 'r5']);
    });

    it('hojeLocalISO usa a data local, não UTC', () => {
        expect(hojeLocalISO(new Date(2026, 10, 14, 23, 30))).toBe('2026-11-14');
    });
});

describe('ficha — campos obrigatórios (CA03)', () => {
    it('sem causa, evento, consequência, obra, dono e próxima revisão: um erro por campo', () => {
        const f = fichaVazia({ owner_user_id: '', owner_nome: null });
        expect(Object.keys(validarFicha(f)).sort()).toEqual(['causa', 'consequencia', 'contexto', 'evento', 'owner', 'proxima', 'titulo'].sort());
    });
    it('aceitar exige justificativa; gatilho ligado exige motivo', () => {
        const f = { ...fichaVazia({ owner_user_id: 'u', owner_nome: 'Ana' }), titulo: 't', causa: 'c', evento: 'e', consequencia: 'q',
            project_id: 'obra-1', proxima_revisao: '2026-12-01', estrategia: 'aceitar' as const, gatilho_critico: true };
        expect(Object.keys(validarFicha(f)).sort()).toEqual(['gatilho_motivo', 'justificativa_aceite']);
        expect(validarFicha({ ...f, justificativa_aceite: 'custo', gatilho_motivo: 'vida' })).toEqual({});
    });
});
