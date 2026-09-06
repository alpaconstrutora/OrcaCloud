import { supabase } from '../lib/supabase';
import { fetchAllPages, type RangeableQuery } from '../lib/supabasePaginate';

/**
 * Memória de classificação por contraparte — item 2.3 do plano
 * `docs/planos/2026-09-05-conciliacao-bancaria-plano-execucao.md`.
 *
 * O uso real do módulo é CLASSIFICAR extrato: em 09/2026, 6.147 das 9.958 linhas já
 * tinham categoria, quase toda posta à mão ou por regra. Esse trabalho ficava preso
 * a cada linha e não voltava na importação seguinte. Aqui ele vira conhecimento da
 * organização: "esta contraparte costuma ser esta categoria, esta obra, este centro
 * de custo".
 *
 * Não é IA nem palpite: é a última decisão de quem classificou, com contagem.
 */

/** Uma decisão de classificação já tomada para uma contraparte. */
export interface ClassificationMemory {
    id: string;
    organization_id: string;
    counterparty_key: string;
    key_kind: 'DOCUMENTO' | 'TOKEN';
    category: string | null;
    project_id: string | null;
    cost_center_id: string | null;
    party_type: 'SUPPLIER' | 'CLIENT' | null;
    party_id: string | null;
    party_name: string | null;
    hits: number;
}

/** O que se pode gravar na memória a partir de uma classificação manual. */
export interface ClassificationInput {
    category?: string | null;
    project_id?: string | null;
    cost_center_id?: string | null;
    party_type?: 'SUPPLIER' | 'CLIENT' | null;
    party_id?: string | null;
    party_name?: string | null;
}

const NOISE = new Set([
    'PIX', 'TED', 'DOC', 'TEV', 'TRANSFERENCIA', 'TRANSF', 'RECEBIDO', 'ENVIADO', 'PAGAMENTO',
    'PAGTO', 'PAG', 'COBRANCA', 'BOLETO', 'DEB', 'CRED', 'DEBITO', 'CREDITO', 'CARTAO', 'COMPRA',
    'SAQUE', 'TARIFA', 'LIQUIDACAO', 'REF', 'NOME', 'LTDA', 'ME', 'EPP', 'SA', 'EIRELI',
    'DA', 'DE', 'DO', 'DAS', 'DOS', 'E',
]);

/** Maiúsculas, sem acento, só letras, números e espaço. Mesma régua do motor. */
export function normalizarTexto(texto: string): string {
    return (texto || '')
        .toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * A chave pela qual a organização reconhece uma contraparte.
 *
 * CNPJ ou CPF, quando o texto do extrato traz um, é identidade forte: dois lançamentos
 * com o mesmo documento são da mesma empresa, ponto. Sem documento, sobra o token da
 * descrição, que é heurística — daí `kind`, para quem consome decidir quanta evidência
 * exigir antes de aplicar sozinho.
 *
 * Só aceita 11 (CPF) ou 14 (CNPJ) dígitos: qualquer corrida de dígitos serve para
 * número de documento, código de barras ou identificador do banco, e casaria errado.
 */
export function chaveDaContraparte(textos: {
    counterparty_name?: string | null;
    description_raw?: string | null;
    description_normalized?: string | null;
}): { key: string; kind: 'DOCUMENTO' | 'TOKEN' } | null {
    const bruto = `${textos.description_raw ?? ''} ${textos.counterparty_name ?? ''}`;
    for (const corrida of bruto.match(/\d[\d.\-/]{9,}\d/g) ?? []) {
        const digitos = corrida.replace(/\D/g, '');
        if (digitos.length === 14 || digitos.length === 11) {
            return { key: digitos, kind: 'DOCUMENTO' };
        }
    }

    const fonte = textos.counterparty_name || textos.description_normalized || textos.description_raw || '';
    const palavras = normalizarTexto(fonte)
        .split(' ')
        .filter(p => p && !/^\d+$/.test(p) && !NOISE.has(p));
    const token = palavras.slice(0, 4).join(' ').trim();
    if (token.length < 3) return null;
    return { key: token, kind: 'TOKEN' };
}

/** O que aplicar num movimento, dada a memória — só campos que o movimento ainda não tem. */
export function camposAAplicar(
    movimento: { category?: string | null; project_id?: string | null; cost_center_id?: string | null; counterparty_name?: string | null },
    memoria: Pick<ClassificationMemory, 'category' | 'project_id' | 'cost_center_id' | 'party_name'>,
): Record<string, string> {
    const patch: Record<string, string> = {};
    const vazio = (v?: string | null) => !v || String(v).trim() === '';
    if (vazio(movimento.category) && !vazio(memoria.category)) patch.category = memoria.category!;
    if (vazio(movimento.project_id) && !vazio(memoria.project_id)) patch.project_id = memoria.project_id!;
    if (vazio(movimento.cost_center_id) && !vazio(memoria.cost_center_id)) patch.cost_center_id = memoria.cost_center_id!;
    if (vazio(movimento.counterparty_name) && !vazio(memoria.party_name)) patch.counterparty_name = memoria.party_name!;
    return patch;
}

export const reconciliationMemoryService = {
    /** Carrega a memória inteira da organização, indexada pela chave. */
    async carregar(organizationId: string): Promise<Map<string, ClassificationMemory>> {
        const { data, error } = await fetchAllPages<ClassificationMemory>(() => supabase
            .from('reconciliation_classification_memory')
            .select('id, organization_id, counterparty_key, key_kind, category, project_id, cost_center_id, party_type, party_id, party_name, hits')
            .eq('organization_id', organizationId)
            .order('counterparty_key', { ascending: true }) as unknown as RangeableQuery<ClassificationMemory>);
        if (error) throw error;
        return new Map((data ?? []).map(m => [m.counterparty_key, m]));
    },

    /**
     * Registra uma classificação feita à mão. Chamada em TODO ponto onde o usuário
     * decide categoria, obra, centro de custo ou contraparte de um movimento.
     *
     * Nunca derruba a ação do usuário: se a memória falhar, a classificação já foi
     * gravada no movimento e é isso que importa.
     */
    async registrar(
        organizationId: string,
        movimento: { counterparty_name?: string | null; description_raw?: string | null; description_normalized?: string | null },
        classificacao: ClassificationInput,
    ): Promise<void> {
        try {
            const temAlgo = (['category', 'project_id', 'cost_center_id', 'party_name'] as const)
                .some(k => { const v = classificacao[k]; return v && String(v).trim() !== ''; });
            if (!temAlgo) return;

            const chave = chaveDaContraparte(movimento);
            if (!chave) return;

            const { data: existente } = await supabase
                .from('reconciliation_classification_memory')
                .select('id, hits')
                .eq('organization_id', organizationId)
                .eq('counterparty_key', chave.key)
                .maybeSingle();

            const agora = new Date().toISOString();
            if (existente) {
                // A decisão mais recente vence, mas um campo deixado em branco agora não
                // apaga o que já se sabia: só sobrescreve quem veio preenchido.
                const patch: Record<string, unknown> = { hits: (existente.hits || 1) + 1, last_used_at: agora, updated_at: agora };
                for (const campo of ['category', 'project_id', 'cost_center_id', 'party_type', 'party_id', 'party_name'] as const) {
                    const v = classificacao[campo];
                    if (v !== undefined && v !== null && String(v).trim() !== '') patch[campo] = v;
                }
                await supabase.from('reconciliation_classification_memory').update(patch).eq('id', existente.id);
            } else {
                await supabase.from('reconciliation_classification_memory').insert({
                    organization_id: organizationId,
                    counterparty_key: chave.key,
                    key_kind: chave.kind,
                    category: classificacao.category ?? null,
                    project_id: classificacao.project_id ?? null,
                    cost_center_id: classificacao.cost_center_id ?? null,
                    party_type: classificacao.party_type ?? null,
                    party_id: classificacao.party_id ?? null,
                    party_name: classificacao.party_name ?? null,
                    last_used_at: agora,
                });
            }
        } catch (e) {
            console.warn('[Memória] registro ignorado (a classificação do movimento foi gravada):', e);
        }
    },

    /**
     * Aplica a memória aos movimentos ainda sem classificação de uma conta.
     *
     * `minimoHits` é a evidência exigida: 2 por padrão, para que uma classificação
     * isolada — que pode ter sido engano — não se espalhe sozinha. Documento (CNPJ/CPF)
     * é identidade forte e vale a partir de 1.
     *
     * Só preenche campo VAZIO. Nunca sobrescreve decisão de quem classificou antes.
     */
    async aplicar(
        bankAccountId: string,
        organizationId: string,
        opcoes: { minimoHits?: number; somenteSemCategoria?: boolean } = {},
    ): Promise<{ analisados: number; aplicados: number; campos: number }> {
        const minimoHits = opcoes.minimoHits ?? 2;
        const memoria = await this.carregar(organizationId);
        if (memoria.size === 0) return { analisados: 0, aplicados: 0, campos: 0 };

        type Mov = {
            id: string; category: string | null; project_id: string | null; cost_center_id: string | null;
            counterparty_name: string | null; description_raw: string | null; description_normalized: string | null;
        };
        const { data: movimentos, error } = await fetchAllPages<Mov>(() => supabase
            .from('bank_transactions')
            .select('id, category, project_id, cost_center_id, counterparty_name, description_raw, description_normalized')
            .eq('bank_account_id', bankAccountId)
            .in('status', ['IMPORTED', 'NORMALIZED', 'RULE_APPLIED'])
            .order('transaction_date', { ascending: true })
            .order('id', { ascending: true }) as unknown as RangeableQuery<Mov>);
        if (error) throw error;

        // Agrupa por patch idêntico para gravar em lote: 6.000 movimentos não podem
        // virar 6.000 requisições (foi o que já travou o "Reprocessar" antes).
        const lotes = new Map<string, { patch: Record<string, string>; ids: string[] }>();
        let campos = 0;

        for (const mov of movimentos ?? []) {
            if (opcoes.somenteSemCategoria && mov.category) continue;
            const chave = chaveDaContraparte(mov);
            if (!chave) continue;
            const lembrado = memoria.get(chave.key);
            if (!lembrado) continue;
            const exigido = chave.kind === 'DOCUMENTO' ? 1 : minimoHits;
            if ((lembrado.hits ?? 0) < exigido) continue;

            const patch = camposAAplicar(mov, lembrado);
            if (Object.keys(patch).length === 0) continue;

            const assinatura = JSON.stringify(patch);
            const lote = lotes.get(assinatura) ?? { patch, ids: [] };
            lote.ids.push(mov.id);
            lotes.set(assinatura, lote);
            campos += Object.keys(patch).length;
        }

        let aplicados = 0;
        for (const { patch, ids } of lotes.values()) {
            // `RULE_APPLIED` é o estado de "tem categoria": mantém o movimento no mesmo
            // lugar da tela em que uma regra o teria posto.
            const corpo = patch.category ? { ...patch, status: 'RULE_APPLIED' } : patch;
            for (let i = 0; i < ids.length; i += 200) {
                const fatia = ids.slice(i, i + 200);
                const { error: updErr } = await supabase.from('bank_transactions').update(corpo).in('id', fatia);
                if (updErr) throw updErr;
                aplicados += fatia.length;
            }
        }

        return { analisados: (movimentos ?? []).length, aplicados, campos };
    },

    /** Contrapartes com evidência suficiente para virarem regra fixa (item 2.6). */
    async candidatasARegra(organizationId: string, minimoHits = 5): Promise<ClassificationMemory[]> {
        const { data, error } = await supabase
            .from('reconciliation_classification_memory')
            .select('id, organization_id, counterparty_key, key_kind, category, project_id, cost_center_id, party_type, party_id, party_name, hits')
            .eq('organization_id', organizationId)
            .gte('hits', minimoHits)
            .not('category', 'is', null)
            .order('hits', { ascending: false })
            .limit(50);
        if (error) throw error;
        return (data ?? []) as ClassificationMemory[];
    },
};
