/**
 * WhatsApp Cloud API: o navegador NÃO toca no token (achado F75, 18/11/2026).
 *
 * O que trava:
 *   1. `enviarPedido` chama a Edge Function `whatsapp-cloud` com SÓ o id do pedido
 *      — nada de token, telefone ou texto vindo do navegador — e nunca chama a
 *      Graph API (graph.facebook.com) daqui;
 *   2. nem com um token antigo no localStorage o serviço o lê ou o envia;
 *   3. a situação vem da RPC `whatsapp_cloud_situacao` (configurado sim/não), e
 *      "API ativa" é por organização;
 *   4. o erro da function chega com a mensagem dela (corpo `{ error }`);
 *   5. o envio automático do status 'Enviado' (orderService) passa pela function
 *      quando a organização DO PEDIDO tem o WhatsApp configurado, e não quando não tem;
 *   6. o código do app não volta a ter o fallback `VITE_WA_ACCESS_TOKEN`, a gravação
 *      do token no localStorage, nem chamada direta à Graph API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const invocacoes: { nome: string; body: Record<string, unknown> }[] = [];
const rpcs: string[] = [];
let respostaDaFunction: { data: unknown; error: unknown } = { data: { ok: true, para: '5511999990000' }, error: null };
let situacao: Record<string, unknown>[] = [];
let orgDoPedido: string | null = 'org-a';

vi.mock('../lib/supabase', () => ({
    supabase: {
        functions: {
            invoke: async (nome: string, opts: { body: Record<string, unknown> }) => {
                invocacoes.push({ nome, body: opts.body });
                return respostaDaFunction;
            },
        },
        rpc: async (nome: string) => {
            rpcs.push(nome);
            return { data: situacao, error: null };
        },
        from: () => {
            const q: Record<string, unknown> = {};
            const chain = () => q;
            Object.assign(q, {
                select: chain, eq: chain,
                maybeSingle: async () => ({ data: { organization_id: orgDoPedido }, error: null }),
            });
            return q;
        },
    },
}));

import { whatsappService } from '../services/whatsappService';

const linha = (o: Partial<Record<string, unknown>>) => ({
    organization_id: 'org-a', configurado: true, phone_number_id: '123456789',
    numero_exibicao: '+55 11 99999-0000', nome_verificado: 'Alpa', template_pedido: 'opura_pedido_enviado',
    token_atualizado_em: '2026-11-18T12:00:00Z', token_atualizado_por: 'gestor@a.com', pode_configurar: false,
    ...o,
});

describe('whatsappService — o token não passa pelo navegador', () => {
    let fetchEspiao: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        invocacoes.length = 0;
        rpcs.length = 0;
        respostaDaFunction = { data: { ok: true, para: '5511999990000' }, error: null };
        situacao = [linha({})];
        orgDoPedido = 'org-a';
        fetchEspiao = vi.fn(async () => new Response('{}'));
        vi.stubGlobal('fetch', fetchEspiao);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('enviarPedido chama a Edge Function só com o id do pedido, e nunca a Graph API', async () => {
        const r = await whatsappService.enviarPedido('po-1');
        expect(r.para).toBe('5511999990000');
        expect(invocacoes).toEqual([{ nome: 'whatsapp-cloud', body: { acao: 'enviar_pedido', order_id: 'po-1' } }]);
        expect(fetchEspiao).not.toHaveBeenCalled();
    });

    it('com um token antigo no localStorage, ele não é lido nem enviado', async () => {
        const memoria = new Map<string, string>([['whatsapp_config', JSON.stringify({ phoneNumberId: '1', accessToken: 'EAAG-SEGREDO' })]]);
        const getItem = vi.fn((k: string) => memoria.get(k) ?? null);
        vi.stubGlobal('localStorage', { getItem, setItem: vi.fn(), removeItem: vi.fn() });

        await whatsappService.enviarPedido('po-1');
        await whatsappService.situacao();

        expect(getItem).not.toHaveBeenCalled();
        expect(JSON.stringify(invocacoes)).not.toContain('EAAG-SEGREDO');
        expect(fetchEspiao).not.toHaveBeenCalled();
    });

    it('a situação vem da RPC e não traz token; "API ativa" é por organização', async () => {
        situacao = [linha({}), linha({ organization_id: 'org-b', configurado: false, pode_configurar: true })];
        const lista = await whatsappService.situacao();
        expect(rpcs).toEqual(['whatsapp_cloud_situacao']);
        expect(lista).toHaveLength(2);
        expect(lista[0]).toMatchObject({ organizationId: 'org-a', configurado: true, podeConfigurar: false, phoneNumberId: '123456789' });
        expect(Object.keys(lista[0]).some(k => /token$/i.test(k))).toBe(false);

        expect(await whatsappService.apiAtivaNaOrg('org-a')).toBe(true);
        expect(await whatsappService.apiAtivaNaOrg('org-b')).toBe(false);
        expect(await whatsappService.apiAtivaNaOrg(null)).toBe(false);
        expect(await whatsappService.apiAtivaNoPedido('po-1')).toBe(true);
        orgDoPedido = 'org-b';
        expect(await whatsappService.apiAtivaNoPedido('po-1')).toBe(false);
    });

    it('salvar e remover vão para a function (que exige gestor e testa o token na Meta)', async () => {
        respostaDaFunction = { data: { ok: true, numero_exibicao: '+55 11 99999-0000', nome_verificado: 'Alpa' }, error: null };
        const r = await whatsappService.salvar({ organizationId: 'org-a', phoneNumberId: ' 123456789 ', token: ' EAAG ', templatePedido: '' });
        expect(r).toEqual({ numeroExibicao: '+55 11 99999-0000', nomeVerificado: 'Alpa' });
        expect(invocacoes[0]).toEqual({
            nome: 'whatsapp-cloud',
            body: { acao: 'salvar', organization_id: 'org-a', phone_number_id: '123456789', token: 'EAAG', template_pedido: undefined },
        });

        respostaDaFunction = { data: { ok: true }, error: null };
        await whatsappService.remover('org-a');
        expect(invocacoes[1]).toEqual({ nome: 'whatsapp-cloud', body: { acao: 'remover', organization_id: 'org-a' } });
        expect(fetchEspiao).not.toHaveBeenCalled();
    });

    it('erro da function chega com a mensagem do corpo { error }', async () => {
        respostaDaFunction = {
            data: null,
            error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'WhatsApp não configurado nesta organização.' }), { status: 409 }) },
        };
        await expect(whatsappService.enviarPedido('po-1')).rejects.toThrow('WhatsApp não configurado nesta organização.');
    });
});

// ── 5. envio automático no status 'Enviado' ──────────────────────────────────
describe('orderService — WhatsApp automático no Enviado vai pela function, pela org do pedido', () => {
    it('org configurada → enviarPedido(id); org sem configuração → nada', async () => {
        vi.resetModules();
        const chamadas: string[] = [];
        let configurada = true;
        const pedido = {
            id: 'po1', number: 'PO-1', status: 'Enviado', version: 1, items: [],
            supplier_id: 'sup1', project_id: 'obra1', empresa_id: 'emp1', organization_id: 'org-do-pedido',
        };
        vi.doMock('../lib/supabase', () => ({
            supabase: {
                from: () => {
                    const q: Record<string, unknown> = {};
                    const chain = () => q;
                    Object.assign(q, {
                        select: chain, eq: chain, order: chain, in: chain,
                        single: async () => ({ data: pedido, error: null }),
                        maybeSingle: async () => ({ data: null, error: null }),
                        update: () => ({ eq: async () => ({ error: null }) }),
                    });
                    return q;
                },
                rpc: async () => ({ data: null, error: null }),
            },
        }));
        vi.doMock('../services/appSettingsService', () => ({ appSettingsService: { get: () => ({}), interpolateEmailSubject: () => '', interpolateEmailBody: () => '' } }));
        vi.doMock('../services/notificationService', () => ({ notificationService: { sendNotification: async () => {} } }));
        vi.doMock('../services/supplierService', () => ({ supplierService: { getById: async () => null }, getSupplierDisplayName: (s: { name: string }) => s.name }));
        vi.doMock('../services/financialService', () => ({ financialService: { syncOrderToFinance: async () => {} } }));
        vi.doMock('../services/receiptService', () => ({ receiptService: {} }));
        vi.doMock('../services/discrepancyService', () => ({ discrepancyService: {} }));
        vi.doMock('../services/notificationLogService', () => ({ notificationLogService: { log: () => {} } }));
        vi.doMock('../services/approvalService', () => ({ approvalService: {} }));
        vi.doMock('../services/orderNumberingService', () => ({ generateOrderNumber: async () => 'PO-X' }));
        vi.doMock('../services/processService', () => ({ processService: { triggerEvent: async () => {} } }));
        vi.doMock('../services/whatsappService', () => ({
            whatsappService: {
                apiAtivaNaOrg: async (org: string) => { chamadas.push(`ativa:${org}`); return configurada; },
                enviarPedido: async (id: string) => { chamadas.push(`enviar:${id}`); return { para: '55' }; },
            },
        }));

        const { orderService } = await import('../services/orderService');

        await orderService.updateOrder('po1', { status: 'Enviado' });
        expect(chamadas).toEqual(['ativa:org-do-pedido', 'enviar:po1']);

        chamadas.length = 0;
        configurada = false;
        await orderService.updateOrder('po1', { status: 'Enviado' });
        expect(chamadas).toEqual(['ativa:org-do-pedido']);

        chamadas.length = 0;
        await orderService.updateOrder('po1', { status: 'Separação' });
        expect(chamadas).toEqual([]);

        vi.doUnmock('../lib/supabase');
        vi.doUnmock('../services/whatsappService');
    });
});

// ── 6. trava de código ────────────────────────────────────────────────────────
describe('trava — o token do WhatsApp não volta para o navegador', () => {
    const RAIZ = process.cwd();
    const PASTAS = ['components', 'services', 'hooks', 'utils', 'lib', 'store'];
    const ARQUIVOS_RAIZ = ['App.tsx', 'index.tsx', '.env.example'];

    function fontes(): string[] {
        const lista: string[] = [];
        const andar = (dir: string) => {
            for (const nome of readdirSync(dir)) {
                const p = path.join(dir, nome);
                if (statSync(p).isDirectory()) andar(p);
                else if (/\.(ts|tsx)$/.test(nome)) lista.push(p);
            }
        };
        for (const pasta of PASTAS) andar(path.join(RAIZ, pasta));
        return [...lista, ...ARQUIVOS_RAIZ.map(a => path.join(RAIZ, a))];
    }

    it('sem VITE_WA_ACCESS_TOKEN, sem gravar whatsapp_config no localStorage, sem Graph API no front', () => {
        const achados: string[] = [];
        for (const arquivo of fontes()) {
            const texto = readFileSync(arquivo, 'utf8');
            const rel = path.relative(RAIZ, arquivo);
            // Código que LÊ a variável (comentário explicando a remoção não conta) ou .env que a declara.
            if (/import\.meta\.env\.VITE_WA_ACCESS_TOKEN|env\[\s*['"]VITE_WA_ACCESS_TOKEN/.test(texto)
                || /^\s*#?\s*VITE_WA_ACCESS_TOKEN\s*=/m.test(texto)) achados.push(`${rel}: VITE_WA_ACCESS_TOKEN`);
            // A chave antiga do localStorage só pode aparecer na limpeza. `.from('whatsapp_config')`
            // é a TABELA da Comunicação do RH, outra coisa.
            const chave = (texto.match(/['"]whatsapp_config['"]/g) ?? []).length
                - (texto.match(/\.from\(\s*['"]whatsapp_config['"]/g) ?? []).length;
            if (chave > 0 && rel !== path.join('lib', 'whatsappLegado.ts')) achados.push(`${rel}: usa a chave do token antigo no localStorage`);
            if (/setItem\(\s*CHAVE_TOKEN_LEGADO/.test(texto)) achados.push(`${rel}: grava o token no localStorage`);
            if (/graph\.facebook\.com/.test(texto)) achados.push(`${rel}: chama a Graph API do navegador`);
        }
        expect(achados).toEqual([]);
    });
});
