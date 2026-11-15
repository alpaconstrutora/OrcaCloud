import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import type { ProjectRisk, RiskAction } from '../types/risk';
import {
    acoesEmAtraso, exposicao, gravidadeMaxima, hojeLocalISO, nivelPendenteDaAlcada, perdasRealizadas, principaisRiscos, recortarRiscos,
    riscosComPlano, riscosComSinal, riscosParaAprovacao, sinaisPorRisco, type ContextoRecorte,
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
    ultima_avaliacao_em: null, sst_document_tipo: null, sst_document_id: null,
    approval_status: null, approval_chain: [], approval_required_levels: null, created_at: '', updated_at: '', ...p,
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

describe('Fase 2 — sinais, materializados e perdas: cartões do Painel = lista do Registro (CA11)', () => {
    const sinais = [
        { project_risk_id: 'r1', link_id: 'l1', modulo: 'contrato' as const, external_label: 'Contrato 012', sinal: 'Contrato vencido', gravidade: 'alta' as const },
        { project_risk_id: 'r1', link_id: 'l2', modulo: 'documento' as const, external_label: 'Documento · Alvará', sinal: 'Documento vence em 10 dia(s)', gravidade: 'media' as const },
        { project_risk_id: 'r3', link_id: 'l3', modulo: 'pedido_compra' as const, external_label: 'Pedido PC-1', sinal: 'Pedido com entrega atrasada', gravidade: 'alta' as const },
        // sinal num risco ENCERRADO não conta como "com sinal ativo"
        { project_risk_id: 'r4', link_id: 'l4', modulo: 'contrato' as const, external_label: 'Contrato 9', sinal: 'Contrato vencido', gravidade: 'alta' as const },
    ];
    const comMat = [...riscos, risco({ id: 'r6', status: 'materializado' })];
    const ctx2: ContextoRecorte = { ...ctx, comSinal: riscosComSinal(sinais) };
    const reg2 = (recorte: FiltrosRegistro['recorte']) =>
        filtrarRegistro(comMat, { ...semFiltro, recorte }, ctx2, () => '', () => '').map(r => r.id);

    it('"com sinal" = ativos com ≥1 sinal; "materializados" = status materializado; o Registro mostra a mesma lista', () => {
        expect(recortarRiscos(comMat, 'com_sinal', ctx2).map(r => r.id)).toEqual(['r1', 'r3']);
        expect(recortarRiscos(comMat, 'materializados', ctx2).map(r => r.id)).toEqual(['r6']);
        for (const rec of ['com_sinal', 'materializados'] as const) {
            expect(reg2(rec)).toEqual(recortarRiscos(comMat, rec, ctx2).map(r => r.id));
        }
        // sem sinais carregados (ou a função do banco indisponível), ninguém tem sinal
        expect(recortarRiscos(comMat, 'com_sinal', ctx).length).toBe(0);
    });

    it('sinais por risco e a gravidade mais alta (coluna "Sinais")', () => {
        const m = sinaisPorRisco(sinais);
        expect(m.get('r1')?.length).toBe(2);
        expect(gravidadeMaxima(m.get('r1'))).toBe('alta');
        expect(gravidadeMaxima([{ gravidade: 'media' }])).toBe('media');
        expect(gravidadeMaxima(undefined)).toBeNull();
    });

    it('perdas = soma do impacto financeiro, um valor por ocorrência; sem valor não entra', () => {
        expect(perdasRealizadas([{ impacto_financeiro: 1500.1 }, { impacto_financeiro: null }, { impacto_financeiro: 200.2 }]))
            .toEqual({ total: 1700.3, comValor: 2 });
        expect(perdasRealizadas([])).toEqual({ total: 0, comValor: 0 });
    });
});

describe('Fase 2 — fila da aba Aprovações (F2.3)', () => {
    const base = { estrategia: null, approval_status: null, approval_chain: [], approval_required_levels: null } as const;
    const fila = [
        risco({ id: 'a1', ...base, estrategia: 'aceitar', justificativa_aceite: 'x' }),                         // falta enviar
        risco({ id: 'a2', ...base, gatilho_critico: true, gatilho_motivo: 'vida', approval_status: 'PENDENTE' }), // pendente
        risco({ id: 'a3', ...base, inerente_pontuacao: 20, approval_status: 'REJEITADO' }),                    // reprovado, ainda exige
        risco({ id: 'a4', ...base, inerente_pontuacao: 20, approval_status: 'APROVADO' }),                     // aprovado: fora
        risco({ id: 'a5', ...base, inerente_pontuacao: 6 }),                                                    // não exige: fora
        risco({ id: 'a6', ...base, estrategia: 'aceitar', status: 'encerrado' }),                               // encerrado: fora
    ];
    it('pendentes, a enviar e reprovados entram; aprovado, sem exigência e encerrado ficam fora', () => {
        expect(riscosParaAprovacao(fila, {}).map(l => [l.risco.id, l.situacao])).toEqual([
            ['a1', 'falta_enviar'], ['a2', 'pendente'], ['a3', 'reprovado'],
        ]);
    });
    it('faixas da organização do risco decidem o crítico', () => {
        const r = risco({ id: 'b1', ...base, inerente_pontuacao: 16, organization_id: 'org-b' });
        expect(riscosParaAprovacao([r], {}).length).toBe(0);
        expect(riscosParaAprovacao([r], { 'org-b': { limite_medio: 4, limite_alto: 9, limite_critico: 16 } }).length).toBe(1);
    });
    it('nível pendente: só a rodada depois da última reprovação conta', () => {
        const passo = (level: 1 | 2, action: 'APROVADO' | 'REJEITADO') => ({ level, role: 'x', action, approved_by: 'a@x', approved_at: '' });
        expect(nivelPendenteDaAlcada({ approval_chain: [], approval_required_levels: 1 })).toEqual({ nivel: 1, de: 1 });
        expect(nivelPendenteDaAlcada({ approval_chain: [passo(1, 'APROVADO')], approval_required_levels: 2 })).toEqual({ nivel: 2, de: 2 });
        expect(nivelPendenteDaAlcada({ approval_chain: [passo(1, 'APROVADO'), passo(1, 'REJEITADO')], approval_required_levels: 2 })).toEqual({ nivel: 1, de: 2 });
    });
});
