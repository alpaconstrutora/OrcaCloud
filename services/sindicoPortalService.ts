import { supabase } from '../lib/supabase';
import type {
    PortalAvisoCondominio, PortalCondominio, PortalCotaCondominio, PortalDocumentoCondominio,
    PortalOcupante, PortalOrdemCondominio, PortalRateioCondominio, PortalUnidadeCondominio,
} from './clientPortalService';
import type { EstadoDoSindico } from '../utils/acessoDoSindico';

/**
 * Portal do Síndico — leitura e gestão do acesso.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * Tudo por RPC `sindico_portal_*` (SECURITY DEFINER): o síndico não é membro da
 * organização, e leitura direta de tabela devolveria [] sem erro. A identidade
 * vai em UM de dois campos — `token` (link ou login por e-mail, que entrega o
 * mesmo token) ou `clientId` (prévia do admin, só leitura) — e quem decide se
 * vale é `fn_sindico_resolver`, no banco.
 *
 * O formato é o da aba Condomínio do Portal do Cliente (`PortalCondominio`),
 * com os acréscimos que só o síndico vê: contato dos ocupantes, custo das OS,
 * documentos internos, leituras dos avisos e a situação do título de cada cota.
 */

export type IdentidadeDoSindico = { token: string; clientId?: undefined } | { clientId: string; token?: undefined };

export interface OcupanteParaSindico extends PortalOcupante {
    clientId: string;
    email: string | null;
    telefone: string | null;
    desde: string | null;
}

export interface UnidadeParaSindico extends Omit<PortalUnidadeCondominio, 'ocupacoes'> {
    ocupacoes: OcupanteParaSindico[];
}

export interface AvisoParaSindico extends PortalAvisoCondominio {
    publicadoPor: string | null;
    validoAte: string | null;
    vigente: boolean;
    condominioId: string;
    leituras: number;
    /** Publicado pelo próprio síndico — só esses ele encerra (F2). */
    meu: boolean;
}

export interface DocumentoParaSindico extends PortalDocumentoCondominio {
    visivelPortal: boolean;
}

export interface OrdemParaSindico extends PortalOrdemCondominio {
    custo: number | null;
}

export interface CotaParaSindico extends PortalCotaCondominio {
    tituloStatus: string | null;
    tituloNegocio: string | null;
    vencimento: string | null;
    pagoEm: string | null;
}

export interface RateioParaSindico extends Omit<PortalRateioCondominio, 'cotas'> {
    condominioId: string;
    cotas: CotaParaSindico[];
    /** Decisão do síndico (F3). `desatualizada` = o rateio mudou depois dela. */
    aprovacao?: {
        status: 'APROVADO' | 'DEVOLVIDO' | null;
        em: string | null;
        porNome: string | null;
        observacao: string | null;
        desatualizada: boolean;
    };
}

export interface EventoDoChamado {
    autorTipo: 'EQUIPE' | 'SINDICO' | 'MORADOR' | 'SISTEMA';
    autorNome: string | null;
    mensagem: string | null;
    statusAnterior: string | null;
    statusNovo: string | null;
    criadoEm: string;
}

/** Chamado de morador numa unidade do prédio (F2). */
export interface ChamadoParaSindico {
    id: string;
    titulo: string;
    descricao: string | null;
    categoria: string;
    prioridade: string;
    status: string;
    abertoEm: string;
    resolvidoEm: string | null;
    notaDaEquipe: string | null;
    unitId: string;
    unidade: string;
    torre: string | null;
    morador: string | null;
    moradorEmail: string | null;
    moradorTelefone: string | null;
    condominioId: string;
    condominioNome: string;
    eventos: EventoDoChamado[];
}

/** Vocabulário do CHECK de `client_requests.status`. */
export const SITUACOES_DO_CHAMADO = ['Aberto', 'Em Andamento', 'Aguardando', 'Resolvido', 'Cancelado'] as const;
/** Vocabulário do CHECK de `condominio_avisos.categoria`. */
export const CATEGORIAS_DE_AVISO = [
    { id: 'AVISO', label: 'Aviso' }, { id: 'URGENTE', label: 'Urgente' }, { id: 'MANUTENCAO', label: 'Manutenção' },
    { id: 'ASSEMBLEIA', label: 'Assembleia' }, { id: 'OBRA', label: 'Obra' },
] as const;

export interface CondominioDoSindico {
    id: string;
    codigo: string | null;
    nome: string;
    cnpj: string | null;
    razaoSocial: string | null;
    cidade: string | null;
    mandatoInicio: string | null;
    mandatoFim: string | null;
    /** Fechar rateio exige a aprovação do síndico (F3). */
    exigeAprovacao?: boolean;
}

export interface PortalSindico extends Omit<PortalCondominio, 'unidades' | 'avisos' | 'documentos' | 'ordens' | 'rateios'> {
    sindico: { clientId: string; nome: string; email: string | null } | null;
    condominios: CondominioDoSindico[];
    unidades: UnidadeParaSindico[];
    avisos: AvisoParaSindico[];
    documentos: DocumentoParaSindico[];
    ordens: OrdemParaSindico[];
    rateios: RateioParaSindico[];
    chamados: ChamadoParaSindico[];
}

const params = (id: IdentidadeDoSindico) => ({ p_token: id.token ?? null, p_client_id: id.clientId ?? null });

/** RPC de escrita: `{ok:false, motivo}` vira erro com o motivo do banco. */
async function escrever(rpc: string, args: Record<string, unknown>, padrao: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) throw new Error(error.message);
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (!r.ok) throw new Error(r.motivo || padrao);
    return r as Record<string, unknown>;
}

/** Motivo do corpo de uma Edge Function que respondeu 4xx (o supabase-js só diz "non-2xx"). */
async function motivoDaFunction(error: unknown, padrao: string): Promise<string> {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return corpo?.error || padrao;
}

export const sindicoPortalService = {
    /** Os dados do portal. `ok:false` traz o `motivo` que a tela mostra. */
    async getDados(id: IdentidadeDoSindico): Promise<PortalSindico> {
        const { data, error } = await supabase.rpc('sindico_portal_dados', params(id));
        if (error) throw new Error(error.message);
        return data as PortalSindico;
    },

    /** Endereço de um documento (assinado quando é arquivo do bucket). */
    async abrirDocumento(id: IdentidadeDoSindico, documentoId: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('client-portal-condominio-download', {
            body: { portal: 'sindico', ...id, documentoId },
        });
        if (error) throw new Error(await motivoDaFunction(error, 'Não foi possível abrir o documento.'));
        if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir o documento.');
        return data.url as string;
    },

    /** Comprovantes de um rateio, já assinados, para o PDF anexar. */
    async comprovantesDoRateio(id: IdentidadeDoSindico, rateioId: string): Promise<{ despesaId: string; url: string; nome: string }[]> {
        const { data, error } = await supabase.functions.invoke('client-portal-rateio-comprovantes', {
            body: { portal: 'sindico', ...id, rateioId },
        });
        if (error) throw new Error(await motivoDaFunction(error, 'o serviço de comprovantes não respondeu'));
        if (!Array.isArray(data?.comprovantes)) throw new Error(data?.error || 'Não foi possível buscar os comprovantes.');
        return data.comprovantes;
    },

    // ── Escritas do síndico (F2) — modo 'escrever': token ou o próprio síndico
    //    logado; a prévia do admin NÃO grava (o banco recusa membro).

    async publicarAviso(id: IdentidadeDoSindico, aviso: {
        condominioId: string; titulo: string; corpo: string; categoria: string; validoAte: string | null;
    }): Promise<void> {
        await escrever('sindico_portal_publicar_aviso', {
            ...params(id), p_empreendimento_id: aviso.condominioId, p_titulo: aviso.titulo,
            p_corpo: aviso.corpo, p_categoria: aviso.categoria, p_valido_ate: aviso.validoAte || null,
        }, 'Não foi possível publicar o aviso.');
    },

    async encerrarAviso(id: IdentidadeDoSindico, avisoId: string): Promise<void> {
        await escrever('sindico_portal_encerrar_aviso', { ...params(id), p_aviso_id: avisoId }, 'Não foi possível encerrar o aviso.');
    },

    async responderChamado(id: IdentidadeDoSindico, chamadoId: string, mensagem: string, novoStatus: string | null): Promise<void> {
        await escrever('sindico_portal_responder_chamado', {
            ...params(id), p_request_id: chamadoId, p_mensagem: mensagem, p_novo_status: novoStatus,
        }, 'Não foi possível responder o chamado.');
    },

    /** Aprovar/devolver (F3). O banco exige LOGIN (modo 'sessao'): pelo link
     *  sem senha a RPC recusa, e a tela já diz isso antes. */
    async decidirRateio(id: IdentidadeDoSindico, rateioId: string, decisao: 'APROVADO' | 'DEVOLVIDO', observacao: string): Promise<void> {
        await escrever('sindico_portal_decidir_rateio', {
            ...params(id), p_rateio_id: rateioId, p_decisao: decisao, p_observacao: observacao,
        }, 'Não foi possível registrar a decisão.');
    },

    // ── Admin (Portais › Portal do Condomínio) ──────────────────────────────

    /** Quem é o síndico, o mandato e o estado do link. O token só vem para gestor. */
    async estado(empreendimentoId: string): Promise<EstadoDoSindico & { ok: boolean; motivo?: string; podeGerir: boolean }> {
        const { data, error } = await supabase.rpc('sindico_portal_estado', { p_empreendimento_id: empreendimentoId });
        if (error) throw new Error(error.message);
        const r = data as EstadoDoSindico & { ok: boolean; motivo?: string; podeGerir: boolean };
        return { ...r, sindico: r.sindico ?? null, acesso: r.acesso ?? null };
    },

    /** `renovar=false` reaproveita o link vivo; `true` troca e invalida o anterior. */
    async gerarLink(empreendimentoId: string, renovar = false): Promise<string> {
        const { data, error } = await supabase.rpc('sindico_portal_gerar_token', {
            p_empreendimento_id: empreendimentoId, p_renovar: renovar,
        });
        if (error) throw new Error(error.message);
        const r = data as { ok: boolean; token?: string; motivo?: string };
        if (!r.ok || !r.token) throw new Error(r.motivo || 'Não foi possível gerar o link.');
        return `${window.location.origin}/portal-sindico?token=${r.token}`;
    },

    async revogar(clientId: string): Promise<void> {
        const { data, error } = await supabase.rpc('sindico_portal_revogar_token', { p_client_id: clientId });
        if (error) throw new Error(error.message);
        const r = data as { ok: boolean; motivo?: string };
        if (!r.ok) throw new Error(r.motivo || 'Não foi possível revogar o acesso.');
    },
};
