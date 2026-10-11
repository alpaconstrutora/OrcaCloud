import { describe, it, expect } from 'vitest';
import {
    acoesDisponiveis, estadoAposAgendar, motivoBloqueio, resumoDoEvento, sugerirResponsavel, sugestaoDeAgendamento,
    type AcaoDoChamado,
} from '../utils/warrantyLifecycle';
import type { ClaimState } from '../types/warranty';

const TODOS: ClaimState[] = [
    'ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'FORA_GARANTIA', 'VISITA_AGENDADA',
    'EM_REPARO', 'CONCLUIDO', 'CONTESTADO', 'REABERTO', 'ENCERRADO',
];
const ACOES: AcaoDoChamado[] = [
    'triar', 'agendar_visita', 'iniciar_reparo', 'concluir_reparo', 'encerrar',
    'definir_responsabilidade', 'suprimentos',
];

describe('ciclo de vida do chamado (2026-10-11)', () => {
    it('todo bloqueio tem frase, em todos os 10 estados, triado ou não', () => {
        for (const state of TODOS) for (const in_warranty of [null, true, false]) for (const a of ACOES) {
            const m = motivoBloqueio(a, { state, in_warranty });
            if (m !== null) expect(m.length).toBeGreaterThan(5);
        }
    });

    it('encerrado não deixa fazer nada', () => {
        expect(acoesDisponiveis({ state: 'ENCERRADO', in_warranty: true })).toEqual([]);
    });

    it('aberto: triar e agendar visita; reparo e compras pedem triagem antes', () => {
        const c = { state: 'ABERTO' as const, in_warranty: null };
        expect(acoesDisponiveis(c)).toEqual(['triar', 'agendar_visita', 'definir_responsabilidade']);
        expect(motivoBloqueio('iniciar_reparo', c)).toMatch(/triagem/);
        expect(motivoBloqueio('suprimentos', c)).toMatch(/triagem/);
    });

    it('visita de diagnóstico antes da triagem: triar continua possível; depois de triado, não', () => {
        expect(motivoBloqueio('triar', { state: 'VISITA_AGENDADA', in_warranty: null })).toBeNull();
        expect(motivoBloqueio('triar', { state: 'VISITA_AGENDADA', in_warranty: true })).not.toBeNull();
    });

    it('em garantia → iniciar reparo → concluir → encerrar', () => {
        expect(acoesDisponiveis({ state: 'EM_GARANTIA', in_warranty: true }))
            .toEqual(['agendar_visita', 'iniciar_reparo', 'definir_responsabilidade', 'suprimentos']);
        expect(acoesDisponiveis({ state: 'EM_REPARO', in_warranty: true }))
            .toEqual(['agendar_visita', 'concluir_reparo', 'encerrar', 'definir_responsabilidade', 'suprimentos']);
        expect(acoesDisponiveis({ state: 'CONCLUIDO', in_warranty: true }))
            .toEqual(['agendar_visita', 'encerrar', 'definir_responsabilidade', 'suprimentos']);
    });

    it('fora de garantia pode encerrar direto (sem reparo) ou reparar por conta do cliente', () => {
        const c = { state: 'FORA_GARANTIA' as const, in_warranty: false };
        expect(motivoBloqueio('encerrar', c)).toBeNull();
        expect(motivoBloqueio('iniciar_reparo', c)).toBeNull();
    });

    it('agendar visita só muda o estado antes do reparo', () => {
        expect(estadoAposAgendar('EM_GARANTIA')).toBe('VISITA_AGENDADA');
        expect(estadoAposAgendar('ABERTO')).toBe('VISITA_AGENDADA');
        expect(estadoAposAgendar('EM_REPARO')).toBe('EM_REPARO');
        expect(estadoAposAgendar('CONCLUIDO')).toBe('CONCLUIDO');
    });

    it('responsável sugerido pela origem provável', () => {
        expect(sugerirResponsavel('execucao')).toBe('construtora');
        expect(sugerirResponsavel('material')).toBe('fornecedor');
        expect(sugerirResponsavel('uso')).toBe('uso_inadequado');
        expect(sugerirResponsavel('manutencao')).toBe('proprietario');
        expect(sugerirResponsavel(undefined)).toBeNull();
    });

    it('agendamento sugerido = amanhã às 09:00, no formato do campo', () => {
        expect(sugestaoDeAgendamento(new Date(2026, 9, 31, 15, 30))).toBe('2026-11-01T09:00');
    });
});

describe('resumo do evento no Histórico', () => {
    it('mostra o que o evento gravou', () => {
        expect(resumoDoEvento('RepairStarted', { custo_estimado: 1500 })).toMatch(/custo estimado R\$\s?1\.500,00/);
        expect(resumoDoEvento('VisitCompleted', { parecer: 'FORA_GARANTIA', acao_definida: 'trocar' }))
            .toBe('parecer fora de garantia · ação: trocar');
        expect(resumoDoEvento('ResponsibilityAssigned', { party: 'fornecedor', notes: 'lote X' })).toBe('Fornecedor · lote X');
        expect(resumoDoEvento('ProcurementLinked', { tipo: 'solicitacao', number: 'SC-0012' })).toBe('Solicitação de compra SC-0012');
        expect(resumoDoEvento('ClaimClosed', { custo_real: null, nps_nota: 9 })).toBe('NPS 9');
        expect(resumoDoEvento('ClaimOpened', { state: 'ABERTO' })).toBeNull();
    });
});
