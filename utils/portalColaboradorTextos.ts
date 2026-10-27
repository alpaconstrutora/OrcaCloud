/**
 * Portal do Colaborador — a linguagem da tela, em funções puras
 * (docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md, item 3).
 *
 * Antes a tela mostrava o banco cru: "2024-10-16", "PENDENTE", "LICENCA
 * MATERNIDADE" (o `replace('_', ' ')` trocava só o primeiro), "+2HE", "30d".
 * Quem lê é o colaborador no celular, não o RH: data no formato daqui, status
 * na voz dele, nada abreviado.
 *
 * Vocabulários = CHECK das tabelas (conferidos no banco em 26/10/2026):
 *   time_entries.status ∈ PENDENTE | APROVADO | REJEITADO
 *   absences.status     ∈ SOLICITADO | APROVADO | REJEITADO | CANCELADO
 *   absences.tipo       ∈ FERIAS | ATESTADO | FALTA | LICENCA_MATERNIDADE |
 *                         LICENCA_PATERNIDADE | LICENCA_MEDICA | AFASTAMENTO_INSS |
 *                         SUSPENSAO | OUTROS
 * Valor fora da lista não some: vira texto legível (primeira maiúscula, sem `_`).
 */
import { dataBR } from './darf';
import { hojeLocal } from './baixaRecebivel';

export { dataBR, hojeLocal };

export type TomDoStatus = 'ok' | 'espera' | 'recusado' | 'neutro';

const STATUS_PONTO: Record<string, { rotulo: string; tom: TomDoStatus }> = {
    PENDENTE: { rotulo: 'Em análise', tom: 'espera' },
    APROVADO: { rotulo: 'Aprovado', tom: 'ok' },
    REJEITADO: { rotulo: 'Recusado', tom: 'recusado' },
};

const STATUS_AUSENCIA: Record<string, { rotulo: string; tom: TomDoStatus }> = {
    SOLICITADO: { rotulo: 'Solicitado', tom: 'espera' },
    APROVADO: { rotulo: 'Aprovado', tom: 'ok' },
    REJEITADO: { rotulo: 'Recusado', tom: 'recusado' },
    CANCELADO: { rotulo: 'Cancelado', tom: 'neutro' },
};

const TIPO_AUSENCIA: Record<string, string> = {
    FERIAS: 'Férias',
    ATESTADO: 'Atestado médico',
    FALTA: 'Falta',
    LICENCA_MATERNIDADE: 'Licença-maternidade',
    LICENCA_PATERNIDADE: 'Licença-paternidade',
    LICENCA_MEDICA: 'Licença médica',
    AFASTAMENTO_INSS: 'Afastamento pelo INSS',
    SUSPENSAO: 'Suspensão',
    OUTROS: 'Outros',
};

const TIPO_FOLHA: Record<string, string> = {
    mensal: 'Folha mensal',
    adiantamento: 'Adiantamento',
    ferias: 'Férias',
    decimo_terceiro: '13º salário',
    rescisao: 'Rescisão',
};

/** "LICENCA_MEDICA" → "Licenca medica": o último recurso, para valor que não está no mapa. */
function legivel(cru: string | null | undefined): string {
    if (!cru) return '—';
    const t = cru.replace(/_/g, ' ').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

export const statusDoPonto = (s: string | null | undefined) =>
    STATUS_PONTO[s ?? ''] ?? { rotulo: legivel(s), tom: 'neutro' as TomDoStatus };

export const statusDaAusencia = (s: string | null | undefined) =>
    STATUS_AUSENCIA[s ?? ''] ?? { rotulo: legivel(s), tom: 'neutro' as TomDoStatus };

export const tipoDaAusencia = (t: string | null | undefined) => TIPO_AUSENCIA[t ?? ''] ?? legivel(t);

export const tipoDaFolha = (t: string | null | undefined) => TIPO_FOLHA[t ?? ''] ?? legivel(t);

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
    'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** '2026-10-01' → "Outubro de 2026" (era "Out/2026"). Lê a string — sem Date, sem fuso. */
export const competenciaPorExtenso = (iso: string | null | undefined) => {
    const [y, m] = (iso ?? '').slice(0, 7).split('-');
    const mes = MESES[Number(m) - 1];
    return mes && y ? `${mes} de ${y}` : '—';
};

/** 1 → "1 dia"; 0 e 30 → "0 dias", "30 dias" (era "30d"). */
export const diasTexto = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    return `${v.toLocaleString('pt-BR')} ${Math.abs(v) === 1 ? 'dia' : 'dias'}`;
};

/** 8 → "8h"; 7.5 → "7,5h". Hora de ponto, não duração de cronômetro. */
const horas = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`;

/** Jornada do dia: "8h" ou "8h + 2h extras" (era "8h +2HE"). */
export const jornadaTexto = (trabalhadas: number | null | undefined, extras: number | null | undefined) => {
    const base = horas(Number(trabalhadas ?? 0));
    const he = Number(extras ?? 0);
    return he > 0 ? `${base} + ${horas(he)} extras` : base;
};

/** "01/10/2026 a 05/10/2026"; um dia só, só a data. */
export const periodoTexto = (inicio: string | null | undefined, fim: string | null | undefined) => {
    if (!inicio) return dataBR(fim);
    if (!fim || fim.slice(0, 10) === inicio.slice(0, 10)) return dataBR(inicio);
    return `${dataBR(inicio)} a ${dataBR(fim)}`;
};

/** Hoje + n dias, em 'YYYY-MM-DD' no fuso do aparelho (não UTC). */
export const daquiADias = (n: number, agora: Date = new Date()) => {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + n);
    return hojeLocal(d);
};

/** Situação de uma validade: vencido (antes de hoje), vencendo (até 30 dias) ou válido. */
export type SituacaoValidade = 'vencido' | 'vencendo' | 'valido' | null;
export const situacaoDaValidade = (validade: string | null | undefined, agora: Date = new Date()): SituacaoValidade => {
    if (!validade) return null;
    const v = validade.slice(0, 10);
    if (v < hojeLocal(agora)) return 'vencido';
    if (v <= daquiADias(30, agora)) return 'vencendo';
    return 'valido';
};

/** "Vence em 10/11/2026" / "Venceu em 01/10/2026". */
export const validadeTexto = (validade: string, agora: Date = new Date()) =>
    `${situacaoDaValidade(validade, agora) === 'vencido' ? 'Venceu' : 'Vence'} em ${dataBR(validade)}`;
