/**
 * Pós-Obra & Garantia — o formulário do chamado se preenche sozinho.
 *
 * Pedido de 2026-10-10: "carregar todos os dados ao selecionar uma cliente e ou
 * unidades. Regra geral: se o app já tem as informações não vamos obrigar o
 * usuário preencher manualmente". Plano:
 * docs/planos/2026-10-10-pos-obra-garantia-autopreencher-cliente-unidade.md
 *
 * O app já sabe, a partir da unidade cadastrada, o empreendimento, a obra e os
 * clientes atuais (`warranty_unit_directory`). Este módulo decide, sem React,
 * o que preencher quando o usuário escolhe um cliente ou uma unidade.
 *
 * A regra que segura tudo: **nunca sobrescrever escolha manual**. Um campo só
 * é escrito se estiver vazio ou se foi o próprio autopreenchimento que o
 * preencheu (`auto`). Editar um campo à mão o tira de `auto`. Mesmo princípio
 * do prazo sugerido pela taxonomia em WarrantyClaimModal.
 */
import type { WarrantyUnitOption, WarrantyUnitClient, WarrantyEntregaFonte } from '../types/warranty';

/** Os campos de vínculo do chamado que o autopreenchimento pode escrever. */
export interface ClaimLinkFields {
    client_id: string;
    unit_id: string;
    unidade_ref: string;
    development_id: string;
    project_id: string;
}

export type ClaimLinkField = keyof ClaimLinkFields;

/** Campos que o autopreenchimento escreveu (e pode reescrever ou limpar). */
export type AutoFilled = ReadonlySet<ClaimLinkField>;

export interface AutofillResult<F extends ClaimLinkFields> {
    form: F;
    auto: AutoFilled;
    /** Explicação para a tela quando não deu para decidir sozinho. */
    hint: string | null;
}

const FORCA_DO_PAPEL: Record<string, number> = {
    PROPRIETARIO: 1, INQUILINO: 2, MORADOR: 3, RESPONSAVEL_FINANCEIRO: 4,
};
const forca = (role: string) => FORCA_DO_PAPEL[role] ?? 5;

export const ROLE_LABELS: Record<string, string> = {
    PROPRIETARIO: 'Proprietário',
    INQUILINO: 'Inquilino',
    MORADOR: 'Morador',
    RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
};

export const ENTREGA_FONTE_LABELS: Record<WarrantyEntregaFonte, string> = {
    posse_proprietario: 'posse do proprietário',
    habite_se: 'habite-se',
    condominio_instalado: 'instalação do condomínio',
    previsao_entrega: 'previsão de entrega do empreendimento',
};

/**
 * Rótulo da unidade gravado em `unidade_ref` (instantâneo) — "Torre A · 302",
 * ou "Quadra 3 · Lote 12" em loteamento. É o que a coluna Unidade da lista lê.
 */
export function unitLabel(u: Pick<WarrantyUnitOption, 'unit_name' | 'tower_name' | 'quadra' | 'lote'>): string {
    if (u.quadra || u.lote) {
        return [u.quadra && `Quadra ${u.quadra}`, u.lote ? `Lote ${u.lote}` : u.unit_name]
            .filter(Boolean).join(' · ');
    }
    return [u.tower_name, u.unit_name].filter(Boolean).join(' · ');
}

/** Unidades em que o cliente tem vínculo atual, as de papel mais forte primeiro. */
export function unitsOfClient(dir: readonly WarrantyUnitOption[], clientId: string): WarrantyUnitOption[] {
    if (!clientId) return [];
    const papelNa = (u: WarrantyUnitOption) =>
        Math.min(...u.clients.filter(c => c.client_id === clientId).map(c => forca(c.role)));
    return dir
        .filter(u => u.clients.some(c => c.client_id === clientId))
        .map((u, i) => ({ u, i, f: papelNa(u) }))
        .sort((a, b) => a.f - b.f || a.i - b.i)
        .map(x => x.u);
}

/**
 * O cliente que dá para deduzir da unidade sem perguntar: o único vinculado,
 * ou — havendo vários — o único PROPRIETARIO. Casal comprador (dois
 * proprietários) não tem resposta certa: devolve null e a tela pergunta.
 */
export function clientToFill(unit: WarrantyUnitOption): WarrantyUnitClient | null {
    if (unit.clients.length === 1) return unit.clients[0];
    const donos = unit.clients.filter(c => c.role === 'PROPRIETARIO');
    return donos.length === 1 ? donos[0] : null;
}

function fill<F extends ClaimLinkFields>(
    form: F, auto: Set<ClaimLinkField>, field: ClaimLinkField, value: string | null | undefined,
): F {
    if (!value) return form;
    if (form[field] && !auto.has(field)) return form;   // escolha manual — não toca
    auto.add(field);
    return { ...form, [field]: value };
}

function clearAuto<F extends ClaimLinkFields>(
    form: F, auto: Set<ClaimLinkField>, fields: ClaimLinkField[],
): F {
    let next = form;
    for (const f of fields) {
        if (auto.has(f)) {
            auto.delete(f);
            next = { ...next, [f]: '' };
        }
    }
    return next;
}

/** Usuário editou um campo à mão: ele deixa de ser do autopreenchimento. */
export function markManual(auto: AutoFilled, field: ClaimLinkField): AutoFilled {
    if (!auto.has(field)) return auto;
    const next = new Set(auto);
    next.delete(field);
    return next;
}

/** Preenche empreendimento, obra, rótulo e (se der) cliente a partir da unidade. */
function fillFromUnit<F extends ClaimLinkFields>(
    form: F, auto: Set<ClaimLinkField>, unit: WarrantyUnitOption, withClient: boolean,
): { form: F; hint: string | null } {
    let next = { ...form, unit_id: unit.unit_id };
    // O rótulo é instantâneo da unidade escolhida, não texto do usuário: com
    // unidade vinculada ele sempre acompanha a unidade.
    next = { ...next, unidade_ref: unitLabel(unit) };
    auto.add('unidade_ref');
    next = fill(next, auto, 'development_id', unit.empreendimento_id);
    next = fill(next, auto, 'project_id', unit.project_id);
    let hint: string | null = null;
    if (withClient) {
        const c = clientToFill(unit);
        if (c) next = fill(next, auto, 'client_id', c.client_id);
        else if (!next.client_id && unit.clients.length > 1) {
            hint = `${unit.clients.length} clientes vinculados a esta unidade — escolha o cliente do chamado.`;
        }
    }
    return { form: next, hint };
}

/**
 * O usuário escolheu um cliente.
 *
 * - 1 unidade do cliente → preenche unidade, empreendimento e obra;
 * - várias → não chuta; `hint` pede para escolher (a tela filtra o seletor);
 * - nenhuma → se o cliente tem UM empreendimento vinculado em Meus Clientes
 *   (`client_empreendimentos`), preenche o empreendimento e a obra principal.
 *
 * O que o cliente ANTERIOR tinha preenchido sozinho é limpo antes.
 */
export function applyClientChoice<F extends ClaimLinkFields>(
    form: F,
    auto: AutoFilled,
    clientId: string,
    dir: readonly WarrantyUnitOption[],
    clientEmpreendimentos: readonly { id: string; project_id?: string | null }[] = [],
): AutofillResult<F> {
    const a = new Set(auto);
    a.delete('client_id');
    let next: F = clearAuto({ ...form, client_id: clientId }, a, ['unit_id', 'unidade_ref', 'development_id', 'project_id']);
    if (!clientId) return { form: next, auto: a, hint: null };

    // Unidade escolhida à mão continua mandando.
    if (next.unit_id) return { form: next, auto: a, hint: null };

    const units = unitsOfClient(dir, clientId);
    if (units.length === 1) {
        next = fillFromUnit(next, a, units[0], false).form;
        a.add('unit_id');
        return { form: next, auto: a, hint: null };
    }
    if (units.length > 1) {
        return { form: next, auto: a, hint: `${units.length} unidades deste cliente — escolha a unidade do chamado.` };
    }
    if (clientEmpreendimentos.length === 1) {
        const emp = clientEmpreendimentos[0];
        next = fill(next, a, 'development_id', emp.id);
        next = fill(next, a, 'project_id', emp.project_id ?? null);
    }
    return { form: next, auto: a, hint: null };
}

/**
 * O usuário escolheu (ou limpou) a unidade. Preenche empreendimento, obra,
 * o rótulo e — se o cliente ainda não foi escolhido e a unidade tem um só
 * candidato — o cliente.
 */
export function applyUnitChoice<F extends ClaimLinkFields>(
    form: F,
    auto: AutoFilled,
    unit: WarrantyUnitOption | null,
): AutofillResult<F> {
    const a = new Set(auto);
    a.delete('unit_id');
    let next: F = clearAuto({ ...form, unit_id: unit?.unit_id ?? '' }, a, ['unidade_ref', 'development_id', 'project_id', 'client_id']);
    if (!unit) {
        // Sem unidade vinculada, o rótulo antigo não descreve mais nada.
        return { form: { ...next, unidade_ref: form.unit_id ? '' : next.unidade_ref }, auto: a, hint: null };
    }
    const r = fillFromUnit(next, a, unit, true);
    return { form: r.form, auto: a, hint: r.hint };
}

/**
 * O usuário escolheu (ou limpou) o empreendimento à mão.
 *
 * Pedido de 2026-10-10: a Obra mostra só as obras vinculadas ao empreendimento
 * escolhido. Então os dois campos não podem se contradizer: a obra que não é
 * deste empreendimento sai, mesmo escolhida à mão — e a unidade de outro
 * empreendimento também. Com UMA obra vinculada, ela é preenchida (regra
 * geral: o app já sabe).
 */
export function applyDevelopmentChoice<F extends ClaimLinkFields>(
    form: F,
    auto: AutoFilled,
    developmentId: string,
    obrasDoEmpreendimento: readonly string[],
    dir: readonly WarrantyUnitOption[] = [],
): AutofillResult<F> {
    const a = new Set(auto);
    a.delete('development_id');
    let next: F = { ...form, development_id: developmentId };
    if (developmentId) {
        if (next.project_id && !obrasDoEmpreendimento.includes(next.project_id)) {
            next = { ...next, project_id: '' };
            a.delete('project_id');
        }
        const unidade = dir.find(u => u.unit_id === next.unit_id);
        if (unidade && unidade.empreendimento_id !== developmentId) {
            next = { ...next, unit_id: '', unidade_ref: '' };
            a.delete('unit_id');
            a.delete('unidade_ref');
        }
        if (obrasDoEmpreendimento.length === 1) next = fill(next, a, 'project_id', obrasDoEmpreendimento[0]);
    } else {
        next = clearAuto(next, a, ['project_id']);
    }
    return { form: next, auto: a, hint: null };
}

/** Obras que a lista de Obra oferece: só as do empreendimento escolhido (todas, sem ele). */
export function obrasDoEmpreendimento<P extends { id: string }>(
    projects: readonly P[],
    obraToDevelopment: Readonly<Record<string, { id: string }>>,
    developmentId: string,
): P[] {
    if (!developmentId) return [...projects];
    return projects.filter(p => obraToDevelopment[p.id]?.id === developmentId);
}

// ── Vencimento da garantia ───────────────────────────────────────────────────

/**
 * `entrega + prazoMeses`, em aritmética de data pura (sem fuso — `new Date`
 * em 'YYYY-MM-DD' é UTC e volta um dia no Brasil). Dia 31 cai no último dia
 * do mês de destino. Sem entrega → null.
 */
export function resolveWarrantyExpiry(entrega: string | null | undefined, prazoMeses: number | null | undefined): string | null {
    if (!entrega || !prazoMeses) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(entrega);
    if (!m) return null;
    const ano = Number(m[1]), mes = Number(m[2]) - 1, dia = Number(m[3]);
    const total = mes + prazoMeses;
    const anoAlvo = ano + Math.floor(total / 12);
    const mesAlvo = ((total % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();
    const d = Math.min(dia, ultimo);
    return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface EntregaInfo {
    data: string;
    fonte: WarrantyEntregaFonte;
}

/**
 * Data de entrega que vale para o chamado: a da unidade vinculada; sem
 * unidade, a do empreendimento — tirada de uma unidade dele cuja data NÃO seja
 * a posse de um proprietário específico (essa é da unidade, não do prédio).
 */
export function entregaDoChamado(
    claim: { unit_id?: string | null; development_id?: string | null },
    dir: readonly WarrantyUnitOption[],
): EntregaInfo | null {
    if (claim.unit_id) {
        const u = dir.find(x => x.unit_id === claim.unit_id);
        if (u?.entrega_data && u.entrega_fonte) return { data: u.entrega_data, fonte: u.entrega_fonte };
    }
    if (claim.development_id) {
        const u = dir.find(x =>
            x.empreendimento_id === claim.development_id
            && x.entrega_data && x.entrega_fonte && x.entrega_fonte !== 'posse_proprietario');
        if (u?.entrega_data && u.entrega_fonte) return { data: u.entrega_data, fonte: u.entrega_fonte };
    }
    return null;
}
