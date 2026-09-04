// services/condominoPortalService.ts
// Portal do Condômino — F3.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// O portal roda SEM SESSÃO: entra por RPC SECURITY DEFINER, como os outros seis
// portais do app. Por isso tudo vem numa chamada só — cada ida ao banco sem
// sessão é uma chance a mais de recortar errado.
//
// A identidade do condômino é a linha de `condomino_portal_access` (pessoa ×
// unidade), não o token. Trocar token por login real é preencher `auth_user_id`
// naquela linha; nada aqui migra. Ver o cabeçalho da migration 000023.

import { supabase } from '../lib/supabase';

export interface PortalOcupacao { papel: string; nome: string }
export interface PortalAviso {
    id: string; titulo: string; corpo: string; categoria: string;
    publicadoEm: string; lido: boolean;
}
export interface PortalDocumento {
    id: string; titulo: string; categoria: string; descricao?: string | null;
    /** Nulo quando o documento é ARQUIVO ENVIADO — aí o endereço nasce assinado,
     *  na hora, pela edge function `condomino-portal-download`. Nunca guarde o
     *  retorno dela: ele expira em 15 min. */
    url: string | null;
}
export interface PortalChamado {
    id: string; titulo: string; descricao?: string | null; categoria: string;
    prioridade: string; status: string; abertoEm: string; resolvidoEm?: string | null;
}

export interface PortalCondominoData {
    ok: true;
    acesso: { id: string; expiraEm: string };
    condominio: { nome: string; cnpj?: string | null };
    unidade: {
        id: string; nome: string; torre: string; pavimento?: number | null;
        areaPrivativa?: number | null; tipologia?: string | null;
        fracaoIdeal?: number | null; fracaoOrigem?: string | null;
    };
    pessoa: { nome: string };
    ocupacoes: PortalOcupacao[];
    avisos: PortalAviso[];
    documentos: PortalDocumento[];
    chamados: PortalChamado[];
}

export type PortalResposta = PortalCondominoData | { ok: false; motivo: string };

export const condominoPortalService = {
    async carregar(token: string): Promise<PortalResposta> {
        const { data, error } = await supabase.rpc('condomino_portal_get_data', { p_token: token });
        if (error) throw new Error(`Falha ao abrir o portal: ${error.message}`);
        return data as PortalResposta;
    },

    async abrirChamado(
        token: string,
        dados: { titulo: string; descricao: string; categoria: string; prioridade: string },
    ): Promise<{ ok: boolean; motivo?: string; id?: string }> {
        const { data, error } = await supabase.rpc('condomino_portal_abrir_chamado', {
            p_token: token,
            p_titulo: dados.titulo,
            p_descricao: dados.descricao,
            p_categoria: dados.categoria,
            p_prioridade: dados.prioridade,
        });
        if (error) throw new Error(`Falha ao abrir o chamado: ${error.message}`);
        return data as { ok: boolean; motivo?: string; id?: string };
    },

    /**
      * Endereço para abrir um documento do condomínio.
      *
      * Passa pela edge function porque o bucket `condominio-documentos` é
      * privado e o portal roda SEM SESSÃO: a policy de storage exige
      * `authenticated` + `is_org_member`, que um acesso por token nunca tem.
      * A function confere token, empreendimento e `visivel_portal` antes de
      * assinar — mesmo molde dos outros cinco portais.
      */
    async abrirDocumento(token: string, documentoId: string): Promise<string> {
        const { data, error } = await supabase.functions.invoke('condomino-portal-download', {
            body: { token, documentoId },
        });
        if (error) throw error;
        if (!data?.url) throw new Error(data?.error || 'Não foi possível abrir o documento.');
        return data.url as string;
    },

    async marcarLido(token: string, avisoId: string): Promise<void> {
        const { error } = await supabase.rpc('condomino_portal_marcar_lido', {
            p_token: token, p_aviso_id: avisoId,
        });
        if (error) throw new Error(`Falha ao marcar como lido: ${error.message}`);
    },
};

// ── Lado ADMIN: gerar e revogar o acesso ────────────────────────────────────

/** Token de link público. `crypto.randomUUID` duas vezes = 256 bits de entropia. */
function gerarToken(): string {
    return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

export interface AcessoCondomino {
    id: string; occupancy_id: string; unit_id: string; client_id: string;
    token: string; expires_at: string; is_active: boolean; last_used_at?: string | null;
}

export const condominoAccessService = {
    async listByUnits(unitIds: string[]): Promise<AcessoCondomino[]> {
        if (unitIds.length === 0) return [];
        const { data, error } = await supabase
            .from('condomino_portal_access')
            .select('id, occupancy_id, unit_id, client_id, token, expires_at, is_active, last_used_at')
            .in('unit_id', unitIds);
        if (error) throw new Error(`Falha ao carregar os acessos: ${error.message}`);
        return (data || []) as AcessoCondomino[];
    },

    /**
     * Gera (ou renova) o acesso de uma ocupação. Um acesso por ocupação — o
     * índice único garante; renovar troca o token e estende o prazo, o que
     * INVALIDA o link antigo. É o comportamento desejado: quem perdeu o controle
     * do link quer justamente que o anterior pare de funcionar.
     */
    async gerar(ocupacao: { id: string; unit_id: string; client_id: string; organization_id: string }): Promise<AcessoCondomino> {
        const token = gerarToken();
        const expira = new Date();
        expira.setDate(expira.getDate() + 90);

        const { data, error } = await supabase
            .from('condomino_portal_access')
            .upsert({
                occupancy_id: ocupacao.id,
                unit_id: ocupacao.unit_id,
                client_id: ocupacao.client_id,
                organization_id: ocupacao.organization_id,
                token,
                expires_at: expira.toISOString(),
                is_active: true,
            }, { onConflict: 'occupancy_id' })
            .select('id, occupancy_id, unit_id, client_id, token, expires_at, is_active, last_used_at')
            .single();
        if (error) throw new Error(`Falha ao gerar o acesso: ${error.message}`);
        return data as AcessoCondomino;
    },

    async revogar(id: string): Promise<void> {
        // Desativa em vez de apagar: a linha é a IDENTIDADE do condômino, e é
        // dela que dependem as leituras de aviso. Apagar levaria o histórico junto.
        const { error } = await supabase
            .from('condomino_portal_access')
            .update({ is_active: false })
            .eq('id', id);
        if (error) throw new Error(`Falha ao revogar o acesso: ${error.message}`);
    },
};

export function linkDoPortal(token: string): string {
    return `${window.location.origin}/portal-condomino?token=${token}`;
}
