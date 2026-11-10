/**
 * Padrões do pedido de compra novo — leitura e gravação em `public.preferencias`.
 * Plano: docs/planos/2026-11-09-pedido-compra-preferencias.md
 *
 *   Empresa  escopo ORGANIZACAO, organization_id, chave `suprimentos.pedido.padroes`
 *   Pessoal  escopo USUARIO,     user_id,         chave `suprimentos.pedido.padroes.<orgId>`
 *
 * Uma linha por camada, com o objeto inteiro. Gravar camada vazia APAGA a linha
 * (a coluna é jsonb NOT NULL e "nada definido" = herdar). A RLS da tabela é a
 * trava final: só owner/admin grava o da empresa; cada um só o seu.
 */
import { supabase } from '../lib/supabase';
import { CHAVE_EMPRESA, chavePessoal, sanearPadroes, vazio, type PadroesDoPedido } from '../lib/pedidoPreferencias';

const TABELA = 'preferencias';

async function usuarioDaSessao(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const id = data?.session?.user?.id;
    if (!id) throw new Error('Sem usuário na sessão — entre de novo para salvar suas preferências.');
    return id;
}

export const pedidoPreferenciasService = {
    /** As duas camadas da organização. Erro de leitura sobe: quem chama decide se segue sem padrão. */
    async ler(orgId: string): Promise<{ empresa: PadroesDoPedido; pessoal: PadroesDoPedido }> {
        const userId = await usuarioDaSessao();
        const [empresa, pessoal] = await Promise.all([
            supabase.from(TABELA).select('valor')
                .eq('escopo', 'ORGANIZACAO').eq('organization_id', orgId).eq('chave', CHAVE_EMPRESA).maybeSingle(),
            supabase.from(TABELA).select('valor')
                .eq('escopo', 'USUARIO').eq('user_id', userId).eq('chave', chavePessoal(orgId)).maybeSingle(),
        ]);
        if (empresa.error) throw new Error(`Erro ao ler o padrão da empresa: ${empresa.error.message}`);
        if (pessoal.error) throw new Error(`Erro ao ler o seu padrão: ${pessoal.error.message}`);
        return { empresa: sanearPadroes(empresa.data?.valor), pessoal: sanearPadroes(pessoal.data?.valor) };
    },

    async gravarEmpresa(orgId: string, padroes: PadroesDoPedido): Promise<void> {
        const valor = sanearPadroes(padroes);
        if (vazio(valor)) {
            const { error } = await supabase.from(TABELA).delete()
                .eq('escopo', 'ORGANIZACAO').eq('organization_id', orgId).eq('chave', CHAVE_EMPRESA);
            if (error) throw new Error(`Erro ao limpar o padrão da empresa: ${error.message}`);
            return;
        }
        const { error } = await supabase.from(TABELA).upsert(
            { escopo: 'ORGANIZACAO', user_id: null, organization_id: orgId, study_id: null, chave: CHAVE_EMPRESA, valor, updated_at: new Date().toISOString() },
            { onConflict: 'organization_id,escopo,chave' },
        );
        // 42501 = a RLS barrou: só owner/admin grava o padrão da empresa.
        if (error) throw new Error(error.code === '42501'
            ? 'Só administradores da organização podem gravar o padrão da empresa.'
            : `Erro ao gravar o padrão da empresa: ${error.message}`);
    },

    async gravarPessoal(orgId: string, padroes: PadroesDoPedido): Promise<void> {
        const userId = await usuarioDaSessao();
        const valor = sanearPadroes(padroes);
        if (vazio(valor)) {
            const { error } = await supabase.from(TABELA).delete()
                .eq('escopo', 'USUARIO').eq('user_id', userId).eq('chave', chavePessoal(orgId));
            if (error) throw new Error(`Erro ao limpar o seu padrão: ${error.message}`);
            return;
        }
        const { error } = await supabase.from(TABELA).upsert(
            { escopo: 'USUARIO', user_id: userId, organization_id: null, study_id: null, chave: chavePessoal(orgId), valor, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,escopo,chave' },
        );
        if (error) throw new Error(`Erro ao gravar o seu padrão: ${error.message}`);
    },
};
