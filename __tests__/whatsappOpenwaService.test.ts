/**
 * WhatsApp pelo OpenWA — o service do front (tela → Edge Function `whatsapp-openwa`).
 *
 * O que trava:
 *   1. `enviarPedido` manda SÓ o id do pedido e um `comando_id` (novo, ou o que a tela
 *      guardou para repetir depois de um erro) —
 *      nada de telefone ou texto vindo do navegador; dois cliques = dois comandos;
 *   2. o envio automático não leva `comando_id` (o servidor calcula um por transição);
 *   3. o erro da function chega com a mensagem do corpo `{ error }` (e o `codigo`);
 *   4. situação e uso vão direto às RPCs `wa_situacao` / `wa_definir_uso`;
 *   5. `listarSemPedido` e `atribuir` passam pela function (superadmin, conferido lá).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invocacoes: { nome: string; body: Record<string, unknown> }[] = [];
const rpcs: { nome: string; args: unknown }[] = [];
let respostaDaFunction: { data: unknown; error: unknown } = { data: { status: 'na_fila', mensagem_id: 'm-1' }, error: null };
let respostaDaRpc: { data: unknown; error: unknown } = { data: [], error: null };
const consultas: { tabela: string; colunas: string; filtros: [string, unknown][] }[] = [];
let respostaDaTabela: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('../lib/supabase', () => ({
    supabase: {
        functions: {
            invoke: async (nome: string, opts: { body: Record<string, unknown> }) => {
                invocacoes.push({ nome, body: opts.body });
                return respostaDaFunction;
            },
        },
        rpc: async (nome: string, args?: unknown) => {
            rpcs.push({ nome, args });
            return respostaDaRpc;
        },
        from: (tabela: string) => ({
            select: (colunas: string) => {
                const consulta = { tabela, colunas, filtros: [] as [string, unknown][] };
                consultas.push(consulta);
                const cadeia = {
                    eq: (col: string, valor: unknown) => { consulta.filtros.push([col, valor]); return cadeia; },
                    maybeSingle: async () => respostaDaTabela,
                };
                return cadeia;
            },
        }),
    },
}));

import { whatsappOpenwaService } from '../services/whatsappOpenwaService';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const erroDaFunction = (corpo: Record<string, unknown>, status: number) => ({
    data: null,
    error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(corpo), { status }) },
});

describe('whatsappOpenwaService', () => {
    beforeEach(() => {
        invocacoes.length = 0;
        rpcs.length = 0;
        respostaDaFunction = { data: { status: 'na_fila', mensagem_id: 'm-1' }, error: null };
        respostaDaRpc = { data: [], error: null };
        consultas.length = 0;
        respostaDaTabela = { data: null, error: null };
    });

    it('enviarPedido manda só o id do pedido e um comando_id (uuid) à function whatsapp-openwa', async () => {
        const r = await whatsappOpenwaService.enviarPedido('po-1');
        expect(r).toEqual({ status: 'na_fila' });
        expect(invocacoes).toHaveLength(1);
        const { nome, body } = invocacoes[0];
        expect(nome).toBe('whatsapp-openwa');
        expect(Object.keys(body).sort()).toEqual(['acao', 'comando_id', 'order_id']);
        expect(body.acao).toBe('enviar_pedido');
        expect(body.order_id).toBe('po-1');
        expect(String(body.comando_id)).toMatch(UUID_RE);
    });

    it('dois cliques → dois comando_id diferentes', async () => {
        await whatsappOpenwaService.enviarPedido('po-1');
        await whatsappOpenwaService.enviarPedido('po-1');
        expect(invocacoes).toHaveLength(2);
        expect(invocacoes[0].body.comando_id).not.toBe(invocacoes[1].body.comando_id);
    });

    it('envio automático não manda comando_id (o servidor calcula um por transição)', async () => {
        await whatsappOpenwaService.enviarPedido('po-1', { automatico: true });
        expect(invocacoes[0].body).toEqual({ acao: 'enviar_pedido', order_id: 'po-1', automatico: true });
    });

    it('erro da function vira Error com a mensagem do corpo { error } (e o codigo)', async () => {
        respostaDaFunction = erroDaFunction(
            { error: 'Fornecedor sem telefone cadastrado. Adicione o telefone na ficha do fornecedor.', codigo: 'sem_telefone' }, 422,
        );
        const p = whatsappOpenwaService.enviarPedido('po-1');
        await expect(p).rejects.toThrow('Fornecedor sem telefone cadastrado. Adicione o telefone na ficha do fornecedor.');
        await expect(p).rejects.toMatchObject({ codigo: 'sem_telefone' });
    });

    it('corpo 2xx com { error } também vira Error', async () => {
        respostaDaFunction = { data: { error: 'Ação desconhecida.' }, error: null };
        await expect(whatsappOpenwaService.atribuir('m-1', 'po-1')).rejects.toThrow('Ação desconhecida.');
    });

    it('responderNoPedido manda o texto aparado e um comando_id novo', async () => {
        respostaDaFunction = { data: { ok: true }, error: null };
        await whatsappOpenwaService.responderNoPedido('po-1', '  pode entregar amanhã?  ');
        const { body } = invocacoes[0];
        expect(body.acao).toBe('responder_no_pedido');
        expect(body.order_id).toBe('po-1');
        expect(body.texto).toBe('pode entregar amanhã?');
        expect(String(body.comando_id)).toMatch(UUID_RE);
    });

    it('enviarPedido com comandoId → manda esse (repetição depois de erro reaproveita a chave)', async () => {
        await whatsappOpenwaService.enviarPedido('po-1', { comandoId: 'cmd-fixo' });
        await whatsappOpenwaService.enviarPedido('po-1', { comandoId: 'cmd-fixo' });
        expect(invocacoes.map((i) => i.body.comando_id)).toEqual(['cmd-fixo', 'cmd-fixo']);
    });

    it('enviarPedido automático ignora comandoId (o servidor calcula a chave da transição)', async () => {
        await whatsappOpenwaService.enviarPedido('po-1', { automatico: true, comandoId: 'cmd-fixo' });
        expect(invocacoes[0].body).toEqual({ acao: 'enviar_pedido', order_id: 'po-1', automatico: true });
    });

    it('responderNoPedido com comandoId → manda esse; sem → um novo', async () => {
        respostaDaFunction = { data: { ok: true }, error: null };
        await whatsappOpenwaService.responderNoPedido('po-1', 'oi', { comandoId: 'cmd-fixo' });
        await whatsappOpenwaService.responderNoPedido('po-1', 'oi');
        expect(invocacoes[0].body.comando_id).toBe('cmd-fixo');
        expect(String(invocacoes[1].body.comando_id)).toMatch(UUID_RE);
    });

    it('responderNoPedido com texto vazio não chama a function', async () => {
        await expect(whatsappOpenwaService.responderNoPedido('po-1', '   ')).rejects.toThrow();
        expect(invocacoes).toHaveLength(0);
    });

    it('situacao lê a RPC wa_situacao e devolve em camelCase', async () => {
        respostaDaRpc = {
            data: [{
                estado: 'conectado', numero_exibicao: '+55 11 99999-0000', visto_em: '2026-11-23T12:00:00Z',
                usa_na_org: true, envio_automatico_pedido: false, organization_id: 'org-a',
            }],
            error: null,
        };
        const s = await whatsappOpenwaService.situacao();
        expect(rpcs).toEqual([{ nome: 'wa_situacao', args: undefined }]);
        expect(s).toEqual([{
            organizationId: 'org-a', estado: 'conectado', numeroExibicao: '+55 11 99999-0000',
            vistoEm: '2026-11-23T12:00:00Z', usaNaOrg: true, envioAutomaticoPedido: false,
        }]);
        expect(invocacoes).toHaveLength(0);
    });

    it('definirUso chama a RPC wa_definir_uso com os três parâmetros', async () => {
        respostaDaRpc = { data: null, error: null };
        await whatsappOpenwaService.definirUso('org-a', true, false);
        expect(rpcs).toEqual([{ nome: 'wa_definir_uso', args: { p_org: 'org-a', p_usar: true, p_envio_automatico: false } }]);
    });

    it('definirUso propaga o erro da RPC', async () => {
        respostaDaRpc = { data: null, error: { message: 'só o proprietário ou um administrador da organização liga ou desliga o WhatsApp do ÒPURA' } };
        await expect(whatsappOpenwaService.definirUso('org-a', true, true)).rejects.toThrow('só o proprietário');
    });

    it('listarSemPedido chama a function e devolve em camelCase', async () => {
        respostaDaFunction = {
            data: { itens: [{ id: 'm-9', telefone: '5511999990000', texto: 'chegou?', recebido_em: '2026-11-23T10:00:00Z' }] },
            error: null,
        };
        const itens = await whatsappOpenwaService.listarSemPedido();
        expect(invocacoes[0]).toEqual({ nome: 'whatsapp-openwa', body: { acao: 'listar_sem_pedido' } });
        expect(itens).toEqual([{ id: 'm-9', telefone: '5511999990000', texto: 'chegou?', recebidoEm: '2026-11-23T10:00:00Z' }]);
    });

    it('atribuir manda a mensagem e o pedido', async () => {
        respostaDaFunction = { data: { ok: true }, error: null };
        await whatsappOpenwaService.atribuir('m-9', 'po-1');
        expect(invocacoes[0]).toEqual({ nome: 'whatsapp-openwa', body: { acao: 'atribuir', mensagem_id: 'm-9', order_id: 'po-1' } });
    });

    it('pedidoPeloNumero procura o pedido pelo número (aparado) e devolve id e organização', async () => {
        respostaDaTabela = { data: { id: 'po-7', number: 'PC-0007', organization_id: 'org-b' }, error: null };
        const p = await whatsappOpenwaService.pedidoPeloNumero('  PC-0007 ');
        expect(consultas).toEqual([{ tabela: 'purchase_orders', colunas: 'id, number, organization_id', filtros: [['number', 'PC-0007']] }]);
        expect(p).toEqual({ id: 'po-7', numero: 'PC-0007', organizationId: 'org-b' });
    });

    it('pedidoPeloNumero: nada encontrado → null; número vazio nem consulta', async () => {
        expect(await whatsappOpenwaService.pedidoPeloNumero('PC-9999')).toBeNull();
        consultas.length = 0;
        expect(await whatsappOpenwaService.pedidoPeloNumero('   ')).toBeNull();
        expect(consultas).toHaveLength(0);
    });
});
