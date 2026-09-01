// services/condominioAcessoService.ts
// O lado do PORTAL DO CLIENTE visto de dentro de Comercial › Condomínios.
// Plano: docs/planos/2026-09-01b-conectar-condominio-portal-cliente.md
//
// O módulo de Condomínios só conhecia `condomino_portal_access`. Desde que a
// aba Condomínio entrou no Portal do Cliente, "tem acesso" depende de duas
// coisas que moram noutro lugar: um token vivo em `client_portal_tokens` e a
// aba `condominio` ligada em `clients.portal_tabs`.
//
// ⚠️ SEM RPC NOVA. As duas tabelas já são legíveis por membro da organização
// (`is_org_member`), e quem abre esta tela é membro. RPC aqui seria peso morto
// — diferente do portal público, onde ela existe porque o leitor é `anon`.
import { supabase } from '../lib/supabase';
import { clientService } from './clientService';
import { clientPortalService } from './clientPortalService';
import type { AcessoClienteLite } from '../utils/acessoAoCondominio';

/** A aba do portal que mostra o condomínio. Mesma string do `ALL_TABS`
 *  de `ClientArea.tsx` — se ela mudar lá, muda aqui. */
export const ABA_CONDOMINIO = 'condominio';

export const condominioAcessoService = {
    /**
     * Para uma lista de clientes, diz quem tem link do Portal do Cliente vivo e
     * quem está com a aba ligada.
     *
     * DUAS consultas, não N+1 — mesmo princípio de
     * `unitOccupancyService.listByEmpreendimento`. Uma tela de condomínio tem
     * dezenas de ocupações, e uma ida ao banco por linha derrubaria a aba.
     */
    async mapearPorCliente(clientIds: string[]): Promise<Map<string, AcessoClienteLite>> {
        const mapa = new Map<string, AcessoClienteLite>();
        const ids = [...new Set(clientIds.filter(Boolean))];
        if (ids.length === 0) return mapa;

        const [tokens, clientes] = await Promise.all([
            supabase.from('client_portal_tokens')
                .select('client_id, expires_at, is_active')
                .in('client_id', ids),
            supabase.from('clients')
                .select('id, portal_tabs')
                .in('id', ids),
        ]);

        // Falhar aqui não pode derrubar a aba de Ocupações: sem este dado a
        // coluna cai no estado antigo (só o link de condômino), que é menos
        // informação, não informação errada.
        if (tokens.error) console.error('[condominioAcessoService] tokens:', tokens.error);
        if (clientes.error) console.error('[condominioAcessoService] clients:', clientes.error);

        const abaPorCliente = new Map<string, boolean>();
        for (const c of clientes.data || []) {
            const tabs = (c as any).portal_tabs;
            // `null` = não configurado. Aí quem manda é o preset por categoria,
            // e o preset de quem tem condomínio JÁ inclui a aba
            // (`utils/clientCategory.ts`). Tratar null como "desligada" faria a
            // tela pedir para ligar uma aba que já aparece.
            abaPorCliente.set((c as any).id, !Array.isArray(tabs) || tabs.includes(ABA_CONDOMINIO));
        }

        const agora = Date.now();
        for (const t of tokens.data || []) {
            const row = t as any;
            const vivo = !!row.is_active && new Date(row.expires_at).getTime() > agora;
            mapa.set(row.client_id, {
                ativo: vivo,
                expiraEm: row.expires_at,
                abaLigada: abaPorCliente.get(row.client_id) ?? false,
            });
        }
        // Cliente sem linha de token: existe, mas sem porta.
        for (const id of ids) {
            if (!mapa.has(id)) {
                mapa.set(id, { ativo: false, expiraEm: null, abaLigada: abaPorCliente.get(id) ?? false });
            }
        }
        return mapa;
    },

    /**
     * Concede o acesso ao condomínio pelo Portal do Cliente, num gesto só.
     *
     * ⚠️ NÃO REGENERA TOKEN DE QUEM JÁ TEM. `client_portal_generate_token` faz
     * upsert com `ON CONFLICT (client_id) DO UPDATE SET token = novo` — chamar
     * para quem já usa o portal **derrubaria o link dele**, e junto o acesso a
     * contratos e cobranças que nada têm a ver com condomínio. Só emite quando
     * não há token vivo.
     */
    async conceder(clientId: string, orgId: string): Promise<{ url: string; tokenNovo: boolean }> {
        const atual = await clientPortalService.getTokenForClient(clientId);
        const vivo = atual && atual.is_active && new Date(atual.expires_at).getTime() > Date.now();

        const token = vivo ? atual!.token : await clientPortalService.generateToken(clientId, orgId);

        // Liga a aba PRESERVANDO as que já estavam lá. Sobrescrever com uma
        // lista fixa apagaria a configuração de quem já foi ajustado à mão.
        // Lê só a coluna. `listClients` traria a org inteira para achar um.
        const { data: cli } = await supabase
            .from('clients').select('portal_tabs').eq('id', clientId).maybeSingle();
        const atuais = Array.isArray((cli as any)?.portal_tabs) ? (cli as any).portal_tabs as string[] : null;
        if (atuais && !atuais.includes(ABA_CONDOMINIO)) {
            await clientService.saveClient({ id: clientId, portalTabs: [...atuais, ABA_CONDOMINIO] } as any);
        }
        // `atuais === null` fica como está: sem configuração explícita, o preset
        // por categoria já entrega a aba, e gravar uma lista aqui congelaria o
        // portal dele no que existe hoje.

        return { url: clientPortalService.buildPortalUrl(token), tokenNovo: !vivo };
    },
};
