/**
 * Imitação, em memória, das RPCs da alçada (fn_alcada_enviar/aprovar/rejeitar —
 * supabase/migrations/aplicar_20271118915000_alcada_rpcs.sql) para os testes que rodam o
 * approvalService REAL por cima de um banco falso. Segue a regra do SQL no que esses testes
 * exercitam: valor do item lido da linha, faixa, "liberar" só de RASCUNHO, nível da vez,
 * níveis exigidos = maior entre os da linha e os da faixa, etapa de processo exige outra pessoa
 * no nível 2, passo gravado em nome de quem está logado. A regra de verdade é a do banco,
 * provada em scripts/teste-alcada-no-servidor.sql.
 */
type Linha = Record<string, unknown>;
type Passo = { level?: number; role?: string; action?: string; approved_by?: string; approved_at?: string; notes?: string };
export type FaixaFake = { required_levels: number; level1_label?: string; level2_label?: string } | null;

const TABELA: Record<string, string> = {
    transaction: 'internal_transactions',
    contract: 'contracts',
    purchase_order: 'purchase_orders',
    process_step: 'process_instance_steps',
    blueprint_snapshot: 'blueprint_snapshots',
    purchase_request: 'purchase_requests',
    doc_gen_documento: 'doc_gen_documentos',
    project_risk: 'project_risks',
};

function valorDoItem(entity: string, l: Linha): number {
    switch (entity) {
        case 'transaction':
        case 'process_step': return Number(l.amount ?? 0) || 0;
        case 'contract': return Number(l.current_value ?? 0) || 0;
        case 'purchase_request': return Number(l.estimated_total ?? 0) || 0;
        case 'purchase_order':
            return ((l.items as Array<{ quotedTotal?: number; total?: number }>) ?? [])
                .reduce((s, i) => s + (Number(i.quotedTotal ?? i.total ?? 0) || 0), 0);
        default: return 0;
    }
}

/** Índices (na cadeia) dos passos APROVADO depois da última rejeição. */
function niveisNaRodada(cadeia: Passo[]): number[] {
    let ultimaRej = -1;
    cadeia.forEach((p, i) => { if (p.action === 'REJEITADO') ultimaRej = i; });
    return cadeia.filter((p, i) => i > ultimaRej && p.action === 'APROVADO').map(p => Number(p.level));
}

const erro = (message: string) => ({ data: null, error: { message } });

/**
 * Trata a chamada se for uma das RPCs da alçada; devolve `null` para as outras.
 * `faixa(valor)` = o que fn_alcada_faixa responderia; `logado()` = e-mail do JWT.
 */
export function rpcAlcadaFake(
    db: Record<string, Linha[]>,
    fn: string,
    args: Record<string, unknown>,
    ctx: { faixa: (valor: number) => FaixaFake; logado: () => string },
): { data: unknown; error: { message: string } | null } | null {
    if (!['fn_alcada_enviar', 'fn_alcada_aprovar', 'fn_alcada_rejeitar'].includes(fn)) return null;
    const entity = String(args.p_entity);
    const tabela = TABELA[entity];
    if (!tabela) return erro(`Tipo de item desconhecido na alçada: ${entity}`);
    const linha = (db[tabela] ?? []).find(l => l.id === args.p_id);
    if (!linha) return erro('Item não encontrado ou sem acesso.');
    const extra = (args.p_extra as Linha | undefined) ?? {};
    const status = (linha.approval_status as string | null | undefined) ?? 'RASCUNHO';
    const cadeia = [...((linha.approval_chain as Passo[] | null | undefined) ?? [])];
    const valor = valorDoItem(entity, linha);
    const faixa = ctx.faixa(valor);

    if (fn === 'fn_alcada_enviar') {
        const reenvio = args.p_reenvio === true;
        if (reenvio && status !== 'REJEITADO') return erro('Só item rejeitado é reenviado para aprovação.');
        if (!reenvio && status === 'PENDENTE') return { data: linha, error: null };
        const libera = !faixa && !reenvio && args.p_sem_faixa === 'liberar'
            && (status === 'RASCUNHO' || status === 'APROVADO')
            && (['transaction', 'contract', 'purchase_order'].includes(entity) || (entity === 'process_step' && valor > 0));
        if (libera) {
            if (status === 'RASCUNHO') linha.approval_status = 'APROVADO';
            return { data: linha, error: null };
        }
        Object.assign(linha, {
            approval_status: 'PENDENTE',
            approval_required_levels: faixa?.required_levels ?? 1,
            approval_chain: reenvio ? cadeia : [],
        }, extra);
        return { data: linha, error: null };
    }

    const quem = ctx.logado();
    const proximo = niveisNaRodada(cadeia).includes(1) ? 2 : 1;

    if (fn === 'fn_alcada_aprovar') {
        if (status !== 'PENDENTE') return erro('Item não está pendente de aprovação.');
        if (args.p_nivel != null && Number(args.p_nivel) !== proximo) {
            return erro(`O nível da vez deste item é o ${proximo}. Recarregue a tela e tente de novo.`);
        }
        const exigidos = Math.min(2, Math.max(Number(linha.approval_required_levels ?? 1) || 1, faixa?.required_levels ?? 1));
        if (entity === 'process_step' && proximo === 2) {
            let ultimaRej = -1;
            cadeia.forEach((p, i) => { if (p.action === 'REJEITADO') ultimaRej = i; });
            if (cadeia.some((p, i) => i > ultimaRej && p.action === 'APROVADO' && p.level === 1
                && (p.approved_by ?? '').toLowerCase() === quem.toLowerCase())) {
                return erro('Você aprovou o nível 1. O nível 2 precisa de outra pessoa.');
            }
        }
        const rotulos = (args.p_rotulos as Linha | undefined) ?? {};
        const rotulo = (proximo === 1 ? rotulos.level1_label : rotulos.level2_label) as string | null | undefined;
        cadeia.push({
            level: proximo,
            role: rotulo || (proximo === 1 ? 'Gestor' : 'Financeiro / Diretoria'),
            action: 'APROVADO',
            approved_by: quem,
            approved_at: new Date().toISOString(),
            ...(args.p_obs ? { notes: String(args.p_obs) } : {}),
        });
        const niveis = niveisNaRodada(cadeia);
        const completo = niveis.includes(1) && (exigidos === 1 || niveis.includes(2));
        Object.assign(linha, {
            approval_chain: cadeia,
            approval_status: completo ? 'APROVADO' : 'PENDENTE',
            approval_required_levels: exigidos,
        }, completo ? extra : {});
        return { data: linha, error: null };
    }

    // fn_alcada_rejeitar
    cadeia.push({
        level: 1, role: 'Rejeição', action: 'REJEITADO', approved_by: quem,
        approved_at: new Date().toISOString(), notes: String(args.p_motivo ?? ''),
    });
    Object.assign(linha, { approval_chain: cadeia, approval_status: 'REJEITADO' }, extra);
    return { data: linha, error: null };
}
