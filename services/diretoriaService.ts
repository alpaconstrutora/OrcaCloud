/**
 * Painel da Diretoria (ÒPURA CEO, 17/11/2026) — chamadas ao banco.
 * Plano: docs/planos/2026-11-17-opura-ceo.md.
 *
 * Leitura: UMA RPC (`fn_diretoria_painel`) traz tudo. Gravação: só RPCs `fn_diretoria_*` —
 * as tabelas diretoria_* não aceitam escrita direta. A permissão "Diretoria (CEO)" é conferida
 * no banco em cada chamada; o erro 42501 sobe com o `code` para a tela mostrar o motivo.
 * Organização: quem chama passa a do topo (`useOrgContext`, REGRA #5); null = "Todas".
 */
import { supabase } from '../lib/supabase';
import { preferenciasService } from './preferenciasService';
import { lerSilenciados, juntarSilenciados, type Area, type PainelDiretoria, type TipoExcecao } from '../utils/diretoria';

export type VisaoDiretoria = 'fila' | 'responsavel' | 'reuniao';
export const VISOES: readonly VisaoDiretoria[] = ['fila', 'responsavel', 'reuniao'];
const CHAVE_VISAO = 'diretoria.visao';
const CHAVE_SILENCIADOS = 'diretoria.silenciados';

export interface ErroDoBanco extends Error { code?: string }

function erro(e: { message: string; code?: string }): ErroDoBanco {
    return Object.assign(new Error(e.message), { code: e.code });
}

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw erro(error);
    return data as T;
}

function normalizar(d: Partial<PainelDiretoria> | null): PainelDiretoria {
    return {
        hoje: d?.hoje ?? new Date().toISOString().slice(0, 10),
        orgs: d?.orgs ?? [],
        excecoes: d?.excecoes ?? [],
        erros: d?.erros ?? {},
        pessoas: d?.pessoas ?? [],
        hierarquia: d?.hierarquia ?? [],
        areas: d?.areas ?? [],
        determinacoes: d?.determinacoes ?? [],
        cobrancas: d?.cobrancas ?? [],
    };
}

export const diretoriaService = {
    async painel(orgId: string | null): Promise<PainelDiretoria> {
        return normalizar(await chamar<Partial<PainelDiretoria> | null>('fn_diretoria_painel', { p_org: orgId }));
    },

    definirArea: (orgId: string, area: Area, userId: string | null) =>
        chamar<void>('fn_diretoria_definir_area', { p_org: orgId, p_area: area, p_user: userId }),

    definirChefe: (orgId: string, userId: string, chefeId: string | null) =>
        chamar<void>('fn_diretoria_definir_chefe', { p_org: orgId, p_user: userId, p_chefe: chefeId }),

    determinar: (d: { orgId: string; titulo: string; responsavelId: string; prazo: string; origem: string | null; excecaoChave: string | null }) =>
        chamar<string>('fn_diretoria_determinar', {
            p_org: d.orgId, p_titulo: d.titulo, p_responsavel: d.responsavelId, p_prazo: d.prazo,
            p_origem: d.origem, p_excecao_chave: d.excecaoChave,
        }),

    atualizar: (id: string, texto: string) => chamar<void>('fn_diretoria_atualizar', { p_id: id, p_texto: texto }),

    concluir: (id: string) => chamar<void>('fn_diretoria_concluir', { p_id: id }),

    cobrar: (c: { orgId: string; chave: string; tipo: TipoExcecao; titulo: string; responsaveis: string[]; tela: string }) =>
        chamar<{ criadas: number; ja_abertas: number }>('fn_diretoria_cobrar', {
            p_org: c.orgId, p_chave: c.chave, p_tipo: c.tipo, p_titulo: c.titulo,
            p_responsaveis: c.responsaveis, p_view: c.tela,
        }),

    /** Visão escolhida e tipos silenciados ("É barulho") — preferências da pessoa, valem em qualquer org. */
    async preferencias(): Promise<{ visao: VisaoDiretoria | null; silenciados: TipoExcecao[] }> {
        const linhas = await preferenciasService.listarDoUsuario();
        const valor = (chave: string) => linhas.find(l => l.chave === chave)?.valor;
        const v = valor(CHAVE_VISAO);
        return {
            visao: typeof v === 'string' && (VISOES as readonly string[]).includes(v) ? (v as VisaoDiretoria) : null,
            silenciados: lerSilenciados(valor(CHAVE_SILENCIADOS)),
        };
    },

    gravarVisao: (v: VisaoDiretoria) => preferenciasService.gravar('USUARIO', {}, CHAVE_VISAO, v),

    gravarSilenciados: (tipos: readonly string[]) =>
        preferenciasService.gravar('USUARIO', {}, CHAVE_SILENCIADOS, juntarSilenciados(tipos)),
};
