/**
 * DARF — guia que agrupa tributos (plano docs/planos/2026-10-21-agrupar-tributos-em-darf.md).
 *
 * Regras puras, sem rede: quem pode entrar num DARF, se uma seleção vira um
 * DARF, o status derivado dos membros e o recolhimento dos membros numa linha
 * só em Contas a Pagar. O banco repete as mesmas regras (`fn_darf_criar` e as
 * travas de aplicar_20271021300000) — aqui elas existem para a tela dizer o
 * motivo ANTES de o usuário clicar.
 */
import type { Darf, DarfStatus, Payable, TaxPayable } from '../types/financial';
import { nomeSeguroDeArquivo } from './pagamentoAvulso';
import { hojeLocal } from './baixaRecebivel';

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function dataBR(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** 'YYYY-MM-DD' (ou 'YYYY-MM') → 'MM/YYYY'. */
export function competenciaBR(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m] = iso.slice(0, 7).split('-');
    return m && y ? `${m}/${y}` : iso;
}

/** Competência do tributo: o mês do fato gerador (`transaction_date`), 'YYYY-MM'. */
export function competenciaDoTributo(t: Pick<TaxPayable, 'transaction_date'>): string | null {
    const c = (t.transaction_date ?? '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(c) ? c : null;
}

/** Por que este tributo não pode entrar num DARF — `null` quando pode. */
export function motivoNaoAgrupavel(t: TaxPayable): string | null {
    if (t.darf_id) return `Já está no DARF de venc. ${dataBR(t.due_date)}`;
    switch (t.effective_status) {
        case 'PAGO':      return 'Pago — já saiu do caixa';
        case 'RETIDO':    return 'Retido pelo cliente — não é pago pela empresa';
        case 'CANCELADO': return 'Cancelado';
    }
    if (t.status === 'CONCILIATED') return 'Conciliado com o extrato';
    if (!competenciaDoTributo(t)) return 'Sem competência (data do fato gerador)';
    return null;
}

export interface ValidacaoSelecaoDarf {
    ok: boolean;
    /** Motivo de não poder agrupar — vai no `title` do botão desligado. */
    motivo: string | null;
    orgId: string | null;
    /** 'YYYY-MM' */
    competencia: string | null;
    total: number;
}

/**
 * A seleção vira um DARF? Mesmas regras de `fn_darf_criar`: ao menos 2
 * tributos (ou 1 com multa/juros — tributo atrasado sozinho também é DARF),
 * uma organização e uma competência.
 */
export function validarSelecaoParaDarf(tributos: TaxPayable[], comEncargos = false): ValidacaoSelecaoDarf {
    const total = tributos.reduce((s, t) => s + (t.amount ?? 0), 0);
    const base = { orgId: null, competencia: null, total };
    const minimo = comEncargos ? 1 : 2;
    if (tributos.length < minimo) {
        return { ...base, ok: false, motivo: comEncargos ? 'Selecione ao menos 1 tributo' : 'Selecione ao menos 2 tributos' };
    }
    const bloqueado = tributos.find(t => motivoNaoAgrupavel(t));
    if (bloqueado) {
        return { ...base, ok: false, motivo: `${bloqueado.party_name ?? 'Tributo'}: ${motivoNaoAgrupavel(bloqueado)}` };
    }
    const orgs = [...new Set(tributos.map(t => t.organization_id))];
    if (orgs.length > 1) {
        return { ...base, ok: false, motivo: 'A seleção mistura organizações — um DARF é de uma organização só' };
    }
    const comps = [...new Set(tributos.map(competenciaDoTributo))].sort();
    if (comps.length > 1) {
        return {
            ...base, ok: false,
            motivo: `Um DARF só junta tributos da mesma competência — a seleção tem ${comps.map(c => competenciaBR(c)).join(' e ')}`,
        };
    }
    return { ok: true, motivo: null, orgId: orgs[0] ?? null, competencia: comps[0] ?? null, total };
}

/** Menor vencimento da seleção — padrão do vencimento do DARF. */
export function menorVencimento(tributos: Pick<TaxPayable, 'due_date'>[]): string | null {
    const datas = tributos.map(t => t.due_date).filter((d): d is string => !!d).sort();
    return datas[0] ?? null;
}

/** Código de barras / linha digitável: só os dígitos; válido com 44 (barras) ou 48 (linha). */
export function normalizarLinhaDigitavel(texto: string | null | undefined): { digitos: string; valido: boolean } {
    const digitos = (texto ?? '').replace(/\D/g, '');
    return { digitos, valido: digitos.length === 0 || digitos.length === 44 || digitos.length === 48 };
}

/** Linha digitável de arrecadação (48 dígitos) em 4 blocos de 12, como no papel. */
export function formatarLinhaDigitavel(digitos: string | null | undefined): string {
    const d = (digitos ?? '').replace(/\D/g, '');
    if (d.length !== 48) return d;
    return [0, 12, 24, 36].map(i => `${d.slice(i, i + 11)}-${d.slice(i + 11, i + 12)}`).join(' ');
}

/**
 * Caminho do anexo no bucket `financeiro-anexos` — a 1ª pasta é a org (a policy
 * confere). `versao` diferencia a troca de anexo: o upload não sobrescreve, e
 * um arquivo novo com o mesmo nome do anterior cairia no mesmo caminho.
 */
export function caminhoDoAnexoDarf(organizationId: string, darfId: string, nomeArquivo: string, versao?: string): string {
    return `${organizationId}/darf/${darfId}/${versao ? `${versao}-` : ''}${nomeSeguroDeArquivo(nomeArquivo)}`;
}

/** Membro conta como pago pela mesma régua de `tributoJaPago` (conciliado ou PAGO). */
function membroPago(p: Pick<Payable, 'status' | 'business_status'>): boolean {
    return p.status === 'CONCILIATED' || p.business_status === 'PAGO';
}

/** Status do DARF a partir dos membros — mesma regra de `vw_darfs.status_efetivo`. */
export function statusDoDarf(
    membros: Pick<Payable, 'status' | 'business_status'>[],
    dueDate: string,
    hoje: string = hojeLocal(),
): DarfStatus {
    const pagos = membros.filter(membroPago).length;
    if (membros.length > 0 && pagos === membros.length) return 'PAGO';
    if (pagos > 0) return 'PARCIAL';
    if (dueDate < hoje) return 'VENCIDO';
    return 'PREVISTO';
}

/** Valor comum a todos os membros, ou `undefined` quando divergem (a tela mostra "Vários"). */
function comum<T>(valores: T[]): T | undefined {
    const unicos = [...new Set(valores)];
    return unicos.length === 1 ? unicos[0] : undefined;
}

/** Rótulo da linha DARF em Contas a Pagar: competência, tributos e encargos. */
export function descricaoDoDarf(competencia: string, membros: Payable[]): string {
    const tributos = [...new Set(membros.filter(m => m.party_type === 'TAX').map(m => m.party_name).filter(Boolean))].sort();
    const encargos = membros.some(m => m.source_system === 'DARF');
    return `DARF ${competenciaBR(competencia)} · ${tributos.join(', ') || 'tributos'}${encargos ? ' + multa/juros' : ''}`;
}

/**
 * Contas a Pagar mostra o DARF como UMA linha (decisão do usuário): tira os
 * membros da lista e põe no lugar uma linha sintética com o total.
 *
 * O status e o total vêm dos MEMBROS (não do `vw_darfs`), para a linha seguir
 * as atualizações locais da tela (§22) depois de uma baixa ou estorno. Membro
 * cujo DARF não veio na lista (corrida, recorte) continua solto: linha sumida
 * é pior que linha a mais.
 */
export function colapsarDarfs(payables: Payable[], darfs: Darf[], hoje: string = hojeLocal()): Payable[] {
    if (darfs.length === 0) return payables;
    const porDarf = new Map<string, Payable[]>();
    for (const p of payables) {
        if (!p.darf_id) continue;
        const lista = porDarf.get(p.darf_id) ?? [];
        lista.push(p);
        porDarf.set(p.darf_id, lista);
    }
    const sinteticas = new Map<string, Payable>();
    for (const d of darfs) {
        const membros = porDarf.get(d.id);
        if (!membros || membros.length === 0) continue;
        const status = statusDoDarf(membros, d.due_date, hoje);
        const pago = status === 'PAGO';
        sinteticas.set(d.id, {
            id: d.id,
            organization_id: d.organization_id,
            source_system: 'DARF',
            transaction_date: d.competencia,
            due_date: d.due_date,
            amount: membros.reduce((s, m) => s + (m.amount ?? 0), 0),
            direction: 'DEBIT',
            description: descricaoDoDarf(d.competencia, membros),
            category: comum(membros.map(m => m.category)),
            status: pago ? 'CONCILIATED' : 'PENDING',
            business_status: pago ? 'PAGO' : 'PREVISTO',
            effective_status: status,
            party_name: 'Receita Federal (DARF)',
            party_type: 'GOVERNMENT',
            cost_center_id: comum(membros.map(m => m.cost_center_id)),
            plano_de_contas_id: comum(membros.map(m => m.plano_de_contas_id)),
            documento_path: d.documento_path,
            documento_nome: d.documento_nome,
            payment_date: membros.map(m => m.payment_date).filter(Boolean).sort().pop() ?? null,
            payment_type: comum(membros.map(m => m.payment_type ?? null)) ?? null,
            darf: {
                id: d.id,
                competencia: d.competencia,
                componentes: membros,
                conciliado_no_extrato: d.conciliado_no_extrato,
                alcada_pendente: d.alcada_pendente,
                numero_documento: d.numero_documento,
                codigo_barras: d.codigo_barras,
                busca: [d.numero_documento, ...membros.flatMap(m => [m.party_name, m.description])]
                    .filter(Boolean).join(' '),
            },
        });
    }
    // A linha DARF entra na posição do primeiro membro (a lista vem por vencimento).
    const saida: Payable[] = [];
    const postas = new Set<string>();
    for (const p of payables) {
        const sintetica = p.darf_id ? sinteticas.get(p.darf_id) : undefined;
        if (!sintetica) { saida.push(p); continue; }
        if (postas.has(sintetica.id)) continue;
        postas.add(sintetica.id);
        saida.push(sintetica);
    }
    return saida;
}

/** A linha (ou um componente dela) corresponde a este id? Base do deep-link. */
export function linhaContemId(linha: Payable, id: string): boolean {
    return linha.id === id || !!linha.darf?.componentes.some(c => c.id === id);
}
