/**
 * Pós-Obra & Garantia — ciclo de vida do chamado (fonte única das transições).
 *
 * Plano: docs/planos/2026-10-11-pos-obra-garantia-conexao-suprimentos.md (Fase 0).
 *
 * Até 2026-10-11 nenhum chamado novo passava de "Em garantia": não existia
 * RPC para EM_REPARO/CONCLUIDO, o agendamento de visita não tinha botão e o
 * encerramento era inalcançável. Este módulo diz, para cada estado, o que o
 * usuário pode fazer e — quando não pode — POR QUÊ (o botão nunca fica mudo).
 *
 * As listas de estados de origem abaixo são as MESMAS que as RPCs conferem no
 * banco (`aplicar_20271011000500_garantia_ciclo_vida.sql`). O teste
 * `warrantyLifecycleSql.test.ts` lê a migration e quebra se um lado mudar
 * sem o outro.
 */
import type { ClaimState, ClaimOrigin, ResponsibleParty } from '../types/warranty';

/** Triagem: só quem ainda não foi triado (VISITA_AGENDADA entra se a visita foi de diagnóstico). */
export const ESTADOS_TRIAGEM: readonly ClaimState[] = ['ABERTO', 'TRIAGEM', 'REABERTO', 'VISITA_AGENDADA'];
/** Agendar visita: qualquer estado não encerrado. */
export const ESTADOS_AGENDAR_VISITA: readonly ClaimState[] = [
    'ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'FORA_GARANTIA', 'VISITA_AGENDADA', 'EM_REPARO',
    'CONCLUIDO', 'CONTESTADO', 'REABERTO',
];
/** Estados que PASSAM a VISITA_AGENDADA ao agendar; nos demais (em reparo, concluído) o estado fica. */
export const ESTADOS_QUE_VIRAM_VISITA: readonly ClaimState[] = [
    'ABERTO', 'TRIAGEM', 'EM_GARANTIA', 'FORA_GARANTIA', 'REABERTO', 'CONTESTADO',
];
/** Iniciar reparo: chamado já triado. */
export const ESTADOS_INICIAR_REPARO: readonly ClaimState[] = [
    'EM_GARANTIA', 'FORA_GARANTIA', 'VISITA_AGENDADA', 'REABERTO', 'CONTESTADO',
];
export const ESTADOS_CONCLUIR_REPARO: readonly ClaimState[] = ['EM_REPARO'];
export const ESTADOS_ENCERRAR: readonly ClaimState[] = ['CONCLUIDO', 'EM_REPARO', 'FORA_GARANTIA'];

export type AcaoDoChamado =
    | 'triar'
    | 'agendar_visita'
    | 'iniciar_reparo'
    | 'concluir_reparo'
    | 'encerrar'
    | 'definir_responsabilidade'
    | 'suprimentos';

/** O mínimo do chamado que decide as ações. `in_warranty` nulo = ainda não triado. */
export interface EstadoDoChamado {
    state: ClaimState;
    in_warranty?: boolean | null;
}

const triado = (c: EstadoDoChamado) => c.in_warranty === true || c.in_warranty === false;

/**
 * Por que a ação não está disponível — ou `null` se está. A frase diz o que
 * fazer, não só o que falta (regra do app: botão desligado sempre diz o motivo).
 */
export function motivoBloqueio(acao: AcaoDoChamado, c: EstadoDoChamado): string | null {
    if (c.state === 'ENCERRADO') return 'Chamado encerrado.';
    switch (acao) {
        case 'triar':
            if (!ESTADOS_TRIAGEM.includes(c.state)) return 'A triagem já foi feita para este chamado.';
            if (c.state === 'VISITA_AGENDADA' && triado(c)) return 'A triagem já foi feita para este chamado.';
            return null;
        case 'agendar_visita':
            return ESTADOS_AGENDAR_VISITA.includes(c.state) ? null : 'Não é possível agendar visita neste estado.';
        case 'iniciar_reparo':
            if (!triado(c)) return 'Faça a triagem (em garantia ou fora de garantia) antes de iniciar o reparo.';
            if (c.state === 'EM_REPARO') return 'O reparo já está em andamento.';
            if (c.state === 'CONCLUIDO') return 'O reparo já foi concluído.';
            return ESTADOS_INICIAR_REPARO.includes(c.state) ? null : 'Não é possível iniciar o reparo neste estado.';
        case 'concluir_reparo':
            return ESTADOS_CONCLUIR_REPARO.includes(c.state) ? null : 'Inicie o reparo antes de concluí-lo.';
        case 'encerrar':
            return ESTADOS_ENCERRAR.includes(c.state)
                ? null
                : 'Conclua o reparo (ou marque como fora de garantia) antes de encerrar.';
        case 'definir_responsabilidade':
            return null;
        case 'suprimentos':
            return triado(c) ? null : 'Faça a triagem antes de pedir compras ou contratar serviço.';
    }
}

/** As ações que o detalhe mostra como disponíveis neste estado. */
export function acoesDisponiveis(c: EstadoDoChamado): AcaoDoChamado[] {
    const todas: AcaoDoChamado[] = [
        'triar', 'agendar_visita', 'iniciar_reparo', 'concluir_reparo', 'encerrar',
        'definir_responsabilidade', 'suprimentos',
    ];
    return todas.filter(a => motivoBloqueio(a, c) === null);
}

/** Estado que o chamado assume ao agendar uma visita. */
export function estadoAposAgendar(state: ClaimState): ClaimState {
    return ESTADOS_QUE_VIRAM_VISITA.includes(state) ? 'VISITA_AGENDADA' : state;
}

/** Responsável sugerido pela origem provável já classificada (o app já sabe → sugere). */
export function sugerirResponsavel(origin: ClaimOrigin | null | undefined): ResponsibleParty | null {
    switch (origin) {
        case 'execucao':
        case 'projeto':       return 'construtora';
        case 'material':      return 'fornecedor';
        case 'uso':           return 'uso_inadequado';
        case 'manutencao':    return 'proprietario';
        case 'indeterminada': return 'indeterminado';
        default:              return null;
    }
}

export const RESPONSAVEL_LABELS: Record<ResponsibleParty, string> = {
    construtora:    'Construtora',
    fornecedor:     'Fornecedor',
    proprietario:   'Proprietário (falta de manutenção)',
    uso_inadequado: 'Uso inadequado',
    indeterminado:  'Indeterminado',
};

/** Rótulos do Histórico. Evento sem rótulo aparece com o nome técnico. */
export const EVENT_LABELS: Record<string, string> = {
    ClaimOpened:                'Chamado aberto',
    ClaimClassified:            'Classificação atualizada',
    ClaimTriaged:               'Triagem realizada',
    VisitScheduled:             'Visita agendada',
    VisitCompleted:             'Visita realizada',
    RepairStarted:              'Reparo iniciado',
    RepairCompleted:            'Reparo concluído',
    ResponsibilityAssigned:     'Responsabilidade definida',
    ProcurementLinked:          'Vinculado a Suprimentos',
    ClaimClosed:                'Chamado encerrado',
    ClaimMigratedFromCondition: 'Migrado de Qualidade & Entrega',
    SlaBreached:                'Prazo de atendimento (SLA) vencido',
};

/** "Amanhã às 09:00" no fuso do navegador, no formato do <input type="datetime-local">. */
export function sugestaoDeAgendamento(agora: Date = new Date()): string {
    const d = new Date(agora);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const brl = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

const PARECER_LABELS: Record<string, string> = {
    EM_GARANTIA: 'em garantia', FORA_GARANTIA: 'fora de garantia', AGUARDANDO_LAUDO: 'aguardando laudo',
};

/**
 * Uma linha legível com o que o evento registrou — o Histórico mostrava só o
 * nome do evento e a data, e o payload (custo, parecer, nº da compra) ficava
 * invisível. `null` quando não há nada a acrescentar.
 */
export function resumoDoEvento(tipo: string, payload: Record<string, unknown> | null | undefined): string | null {
    const p = payload ?? {};
    const partes: string[] = [];
    switch (tipo) {
        case 'VisitScheduled':
            if (p.scheduled_at) partes.push(`para ${new Date(String(p.scheduled_at)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`);
            if (p.technician_name) partes.push(`técnico ${p.technician_name}`);
            break;
        case 'VisitCompleted':
            if (p.parecer) partes.push(`parecer ${PARECER_LABELS[String(p.parecer)] ?? p.parecer}`);
            if (p.acao_definida) partes.push(`ação: ${p.acao_definida}`);
            break;
        case 'ClaimTriaged':
            if (typeof p.in_warranty === 'boolean') partes.push(p.in_warranty ? 'em garantia' : 'fora de garantia');
            break;
        case 'ResponsibilityAssigned':
            if (p.party) partes.push(RESPONSAVEL_LABELS[p.party as ResponsibleParty] ?? String(p.party));
            break;
        case 'RepairStarted': {
            const c = brl(p.custo_estimado);
            if (c) partes.push(`custo estimado ${c}`);
            break;
        }
        case 'ClaimClosed': {
            const c = brl(p.custo_real);
            if (c) partes.push(`custo real ${c}`);
            if (p.nps_nota != null) partes.push(`NPS ${p.nps_nota}`);
            break;
        }
        case 'ProcurementLinked':
            if (p.tipo) partes.push(`${p.tipo === 'contrato' ? 'Contrato' : 'Solicitação de compra'}${p.number ? ` ${p.number}` : ''}`);
            break;
    }
    if (typeof p.notes === 'string' && p.notes.trim()) partes.push(p.notes.trim());
    return partes.length ? partes.join(' · ') : null;
}
