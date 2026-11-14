import { supabase } from '../lib/supabase';
import {
    patchDaLinha,
    type CamposPropagaveis,
    type DestinoPropagacao,
} from '../utils/clientPropagacao';

/**
 * Propaga a edição de um cliente para as cópias do cadastro no app.
 * Mapa dos destinos e do que fica de fora: `utils/clientPropagacao.ts`.
 *
 * Tudo roda com a sessão do usuário (RLS): ele só conta e só atualiza o que
 * já podia ver e gravar. Nada de RPC nova — é UPDATE de coluna descritiva.
 *
 * Travas do banco que podem recusar uma linha: título a pagar (DEBIT) numa
 * competência FECHADA em Contas a Pagar (`fn_payable_bloqueia_competencia_fechada`
 * olha qualquer UPDATE). Por isso o lote cai para linha a linha quando falha —
 * uma linha travada não pode impedir as outras 35 de serem corrigidas — e a
 * recusa volta contada, com a mensagem do banco, para a tela dizer.
 */

interface Alteracao {
    tabela: 'internal_transactions' | 'client_charges' | 'warranty_claims' | 'projects';
    id: string;
    patch: Record<string, unknown>;
}

export interface PlanoDePropagacao {
    campos: CamposPropagaveis;
    porDestino: Partial<Record<DestinoPropagacao, Alteracao[]>>;
}

export interface ResultadoDaPropagacao {
    atualizados: number;
    recusados: number;
    /** Primeira mensagem de recusa do banco (ex.: competência fechada). */
    motivo?: string;
    obrasAlteradas: boolean;
}

const LOTE = 200;

async function linhasDoFinanceiro(clientId: string, campos: CamposPropagaveis): Promise<Alteracao[]> {
    const { data, error } = await supabase
        .from('internal_transactions')
        .select('id, party_name, party_email, entity_name')
        .eq('party_id', clientId);
    if (error) throw error;
    return (data ?? []).flatMap(l => {
        const patch = patchDaLinha(l, campos, true);
        return patch ? [{ tabela: 'internal_transactions' as const, id: l.id as string, patch }] : [];
    });
}

async function linhasDasCobrancas(clientId: string, campos: CamposPropagaveis): Promise<Alteracao[]> {
    const { data, error } = await supabase
        .from('client_charges')
        .select('id, party_name, party_email')
        .eq('client_id', clientId);
    if (error) throw error;
    return (data ?? []).flatMap(l => {
        const patch = patchDaLinha(l, campos, false);
        return patch ? [{ tabela: 'client_charges' as const, id: l.id as string, patch }] : [];
    });
}

async function linhasDaGarantia(clientId: string, campos: CamposPropagaveis): Promise<Alteracao[]> {
    if (!campos.name) return [];
    const { data, error } = await supabase
        .from('warranty_claims')
        .select('id, client_name')
        .eq('client_id', clientId);
    if (error) throw error;
    return (data ?? [])
        .filter(l => (l.client_name ?? '').trim() !== campos.name)
        .map(l => ({ tabela: 'warranty_claims' as const, id: l.id as string, patch: { client_name: campos.name } }));
}

async function linhasDasObras(clientId: string, campos: CamposPropagaveis): Promise<Alteracao[]> {
    if (!campos.name) return [];
    // `settings` é jsonb gravado inteiro: lê o objeto todo para devolvê-lo
    // inteiro com só `client` trocado.
    const { data, error } = await supabase
        .from('projects')
        .select('id, settings')
        .eq('settings->>clientId', clientId);
    if (error) throw error;
    return (data ?? []).flatMap(p => {
        const settings = (p.settings ?? {}) as Record<string, unknown>;
        if (String(settings.client ?? '').trim() === campos.name) return [];
        return [{ tabela: 'projects' as const, id: p.id as string, patch: { settings: { ...settings, client: campos.name } } }];
    });
}

export const clientPropagacaoService = {
    /**
     * Lê as cópias e monta o que mudaria — sem gravar nada. Destino que falhar
     * na leitura (tabela sem acesso) fica de fora em vez de derrubar a pergunta.
     */
    async planejar(clientId: string, campos: CamposPropagaveis): Promise<PlanoDePropagacao> {
        const destinos: [DestinoPropagacao, Promise<Alteracao[]>][] = [
            ['financeiro', linhasDoFinanceiro(clientId, campos)],
            ['cobrancas', linhasDasCobrancas(clientId, campos)],
            ['garantia', linhasDaGarantia(clientId, campos)],
            ['obras', linhasDasObras(clientId, campos)],
        ];
        const porDestino: PlanoDePropagacao['porDestino'] = {};
        const lidos = await Promise.allSettled(destinos.map(([, p]) => p));
        lidos.forEach((r, i) => {
            const destino = destinos[i][0];
            if (r.status === 'fulfilled') {
                if (r.value.length) porDestino[destino] = r.value;
            } else {
                console.error(`Propagar cliente: leitura de ${destino} falhou`, r.reason);
            }
        });
        return { campos, porDestino };
    },

    async aplicar(plano: PlanoDePropagacao): Promise<ResultadoDaPropagacao> {
        const res: ResultadoDaPropagacao = { atualizados: 0, recusados: 0, obrasAlteradas: false };
        const todas = Object.values(plano.porDestino).flat() as Alteracao[];

        // `projects.settings` é diferente por linha (o objeto inteiro): uma a uma.
        // As demais agrupam por patch idêntico — quase sempre um só UPDATE.
        const grupos = new Map<string, { tabela: Alteracao['tabela']; patch: Record<string, unknown>; ids: string[] }>();
        for (const a of todas) {
            const chave = a.tabela === 'projects' ? `projects:${a.id}` : `${a.tabela}:${JSON.stringify(a.patch)}`;
            const g = grupos.get(chave) ?? { tabela: a.tabela, patch: a.patch, ids: [] };
            g.ids.push(a.id);
            grupos.set(chave, g);
        }

        const umaAUma = async (tabela: Alteracao['tabela'], patch: Record<string, unknown>, ids: string[]) => {
            for (const id of ids) {
                const { data, error } = await supabase.from(tabela).update(patch).eq('id', id).select('id');
                if (error || !data?.length) {
                    res.recusados += 1;
                    if (error) res.motivo ??= error.message;
                } else {
                    res.atualizados += 1;
                    if (tabela === 'projects') res.obrasAlteradas = true;
                }
            }
        };

        for (const g of grupos.values()) {
            for (let i = 0; i < g.ids.length; i += LOTE) {
                const ids = g.ids.slice(i, i + LOTE);
                // `.select('id')`: a RLS de UPDATE pula em silêncio a linha que o
                // usuário vê mas não pode gravar — conta-se o que VOLTOU, não o pedido.
                const { data, error } = await supabase.from(g.tabela).update(g.patch).in('id', ids).select('id');
                if (!error) {
                    const n = data?.length ?? 0;
                    res.atualizados += n;
                    res.recusados += ids.length - n;
                    if (g.tabela === 'projects' && n > 0) res.obrasAlteradas = true;
                } else {
                    // Uma linha travada derruba o UPDATE inteiro: refaz uma a uma
                    // para gravar as que podem e contar as que o banco recusou.
                    await umaAUma(g.tabela, g.patch, ids);
                }
            }
        }
        return res;
    },
};

/** Quantas linhas mudariam em cada destino. */
export function contagemDoPlano(plano: PlanoDePropagacao): Partial<Record<DestinoPropagacao, number>> {
    const out: Partial<Record<DestinoPropagacao, number>> = {};
    for (const [d, linhas] of Object.entries(plano.porDestino)) out[d as DestinoPropagacao] = linhas?.length ?? 0;
    return out;
}
