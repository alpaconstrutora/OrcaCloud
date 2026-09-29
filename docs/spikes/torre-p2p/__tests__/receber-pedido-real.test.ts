/**
 * Passo 1.2 do plano docs/planos/2026-09-28-torre-p2p-processos.md —
 * um pedido REAL passa para `Recebido` pelo código NOVO do gancho
 * (`orderService.updateOrder`, bloco 2b) e a instância de processo tem de
 * nascer na org DO PEDIDO. Criação autorizada pelo usuário em 2026-09-28
 * ("1. liberado") depois de o classificador do modo automático ter negado a
 * primeira tentativa.
 *
 * ⚠️ ISTO ESCREVE EM PRODUÇÃO. Roda só com `PW_SENHA` no ambiente — sem ela
 * o caso é pulado. Fora do glob da suíte (`__tests__/**` na raiz), então
 * `npm test` nunca o executa. Para rodar, no PowerShell, dentro da frente:
 *
 *   $env:PW_EMAIL = 'seu.login@alpaconstrutora.com.br'
 *   $s = Read-Host 'Senha' -AsSecureString
 *   $env:PW_SENHA = [System.Net.NetworkCredential]::new('', $s).Password
 *   npx vitest run --dir docs/spikes/torre-p2p
 *   Remove-Item Env:PW_SENHA, Env:PW_EMAIL
 *
 * Efeitos colaterais conhecidos, além da instância: `syncOrderToFinance` cria
 * o título em Contas a Pagar do pedido (fornecedor "Fordinho", material de
 * limpeza — pode ser excluído depois); fornecedor sem e-mail → nenhuma
 * notificação sai; webhook só dispara em `Enviado`, não aqui.
 */
import { describe, it, expect } from 'vitest';

// `appSettingsService` lê localStorage dentro do fluxo de notificação; fora
// do navegador não existe. Um shim em memória evita o ReferenceError (que o
// try/catch do updateOrder engoliria, mas sujaria o log de notificação).
if (typeof globalThis.localStorage === 'undefined') {
    const mem = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => { mem.set(k, String(v)); },
        removeItem: (k: string) => { mem.delete(k); },
        clear: () => mem.clear(),
        key: (i: number) => [...mem.keys()][i] ?? null,
        get length() { return mem.size; },
    } as Storage;
}

import { supabase } from '../../../../lib/supabase';
import { orderService } from '../../../../services/orderService';

/** PC-013-013-0002 — Rascunho desde 01/06/2026, obra Galeria, fornecedor Fordinho (sem e-mail), 5 itens de limpeza. */
const PEDIDO_ID = '205634f3-0a4d-4aa2-81aa-abdd066e3090';
const PEDIDO_NUMERO = 'PC-013-013-0002';
/** Alpa Construtora e Incoporadora — é a org do pedido E da empresa (aqui não divergem). */
const ORG_ESPERADA = '926cf626-ba49-4ee4-9f35-472822fb90e6';

// Os dois são obrigatórios — sem padrão de e-mail. A 1ª rodada (28/09, 21:07)
// falhou no login porque o padrão era `desenvolvedor@…` (último acesso em
// junho) e a senha digitada era da conta em uso, `altair.rosa@…`.
const EMAIL = process.env.PW_EMAIL;
const SENHA = process.env.PW_SENHA;

describe('Passo 1.2 — pedido real vira Recebido pelo gancho novo', () => {
    it.skipIf(!SENHA || !EMAIL)(`${PEDIDO_NUMERO} → Recebido nasce instância na org do pedido`, async () => {
        const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL!, password: SENHA! });
        expect(authErr, `login: ${authErr?.message}`).toBeNull();

        const antes = await supabase.from('process_instances').select('id').eq('purchase_order_id', PEDIDO_ID);
        expect(antes.error).toBeNull();

        const po = await orderService.getOrderById(PEDIDO_ID);
        expect(po?.number).toBe(PEDIDO_NUMERO);
        console.log(`[1.2] ${PEDIDO_NUMERO}: status ${po!.status} → Recebido (versão ${po!.version})`);

        await orderService.updateOrder(PEDIDO_ID, { status: 'Recebido' }, po!.version);

        const depois = await supabase
            .from('process_instances')
            .select('id, organization_id, status, title, current_step_id, process_templates(name)')
            .eq('purchase_order_id', PEDIDO_ID);
        expect(depois.error).toBeNull();
        console.log('[1.2] instâncias do pedido:', JSON.stringify(depois.data, null, 2));

        expect((depois.data ?? []).length).toBeGreaterThan((antes.data ?? []).length);
        for (const inst of depois.data ?? []) expect(inst.organization_id).toBe(ORG_ESPERADA);
    }, 90_000);
});
