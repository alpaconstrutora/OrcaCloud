/**
 * Regras puras do envio pelo OpenWA (utils/whatsappOpenwa.ts) — o texto do
 * pedido, o chatId, a chave de idempotência, o status que só avança, a
 * política de retentativa (repetir só com a mesma chave, dentro de 23 h), a
 * assinatura do webhook e o vínculo da resposta ao pedido. As Edge Functions
 * `whatsapp-openwa`, `whatsapp-openwa-worker` e `whatsapp-openwa-webhook`
 * importam este módulo; se a regra mudar aqui, muda nos três.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
    ESPERAS_MS, JANELA_VINCULO_DIAS, assinaturaConfere, avancarStatus, chatIdDoTelefone,
    classificarEnvio, comandoIdEnvioAutomatico, escolherVinculo, esperaAposFalha, espelhoDoLog, estadoDaConexao,
    idsDeMensagemIguais, lerResultadoDoWorker, montarTextoDoPedido, planoDoReporte, statusDoAck,
    telefoneDoRemetente,
    // Task 5 — webhook do OpenWA
    CORPO_WEBHOOK_MAX_BYTES, MIDIA_MAX_BYTES, avisoDaResposta, candidatoDoVinculo, classificarEventoRecebido,
    conteudoConfereComTipo, STATUS_ALVO_DE_VINCULO, STATUS_QUE_CONTAM_ORG,
    decidirMidia, deveAvisarDesconexao, espelhoDoAckNoLog, estadoDoEventoDeSessao, eventoVelhoDemais,
    idCurtoDaMensagem, linhaDaMidia, nomeSeguroDoArquivo, normalizarMimetype, tamanhoDoBase64,
    variantesDoTelefoneBR,
} from '../utils/whatsappOpenwa';
import { formatarValorBRL } from '../utils/whatsappPedido';
import type { StatusSaida } from '../utils/whatsappOpenwa';

const HORA = 3600_000;

describe('montarTextoDoPedido', () => {
    const base = {
        empresa: 'Alpa Construtora e Incorporadora', fornecedor: 'X', numero: '42', obra: 'Y',
        quantidadeDeItens: 3, total: 1234.5, dataDeEntrega: '2026-11-20', link: 'https://exemplo/p/abc',
    };

    it('primeira linha diz a empresa e o número; corpo traz fornecedor, obra, itens, total e entrega', () => {
        const texto = montarTextoDoPedido(base);
        const linhas = texto.split('\n');
        expect(linhas[0]).toBe('*Alpa Construtora e Incorporadora* — Pedido de compra nº 42');
        expect(texto).toContain('Fornecedor: X');
        expect(texto).toContain('Obra: Y');
        expect(texto).toContain(`Itens: 3 · Total: ${formatarValorBRL(1234.5)}`);
        // O helper usa espaço não separável depois de "R$" — o que importa é o valor.
        expect(formatarValorBRL(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
        expect(texto).toContain('Entrega: 20/11/2026');
        expect(texto.endsWith('Ver o pedido completo: https://exemplo/p/abc')).toBe(true);
    });

    it('sem data de entrega → "A definir"', () => {
        expect(montarTextoDoPedido({ ...base, dataDeEntrega: null })).toContain('Entrega: A definir');
    });
});

describe('chatIdDoTelefone', () => {
    it('telefone vira <E.164>@c.us', () => {
        expect(chatIdDoTelefone('(11) 99999-0000')).toBe('5511999990000@c.us');
    });
    it('sem telefone → vazio', () => {
        expect(chatIdDoTelefone('')).toBe('');
        expect(chatIdDoTelefone(null)).toBe('');
        expect(chatIdDoTelefone(undefined)).toBe('');
        expect(chatIdDoTelefone('sem número')).toBe('');
    });
});

describe('comandoIdEnvioAutomatico', () => {
    it('uma chave por transição para Enviado', () => {
        expect(comandoIdEnvioAutomatico('o1', '2026-11-23T10:00:00Z')).toBe('pedido:o1:enviado:2026-11-23T10:00:00Z');
        expect(comandoIdEnvioAutomatico('o1', '2026-11-23T11:00:00Z'))
            .not.toBe(comandoIdEnvioAutomatico('o1', '2026-11-23T10:00:00Z'));
    });
});

describe('statusDoAck', () => {
    it('mapeia o ack do OpenWA para o status de saída', () => {
        expect(statusDoAck('sent')).toBe('aceita');
        expect(statusDoAck('delivered')).toBe('entregue');
        expect(statusDoAck('read')).toBe('lida');
        expect(statusDoAck('played')).toBe('lida');
        expect(statusDoAck('failed')).toBe('falhou');
        expect(statusDoAck('pending')).toBeNull();
        expect(statusDoAck('qualquer')).toBeNull();
    });
});

describe('avancarStatus', () => {
    it('status só avança; evento atrasado não regride', () => {
        expect(avancarStatus('lida', 'entregue')).toBe('lida');
        expect(avancarStatus('aceita', 'entregue')).toBe('entregue');
        expect(avancarStatus('incerta', 'aceita')).toBe('aceita');
        expect(avancarStatus('falhou', 'entregue')).toBe('entregue');
    });
    it('cancelada é final', () => {
        expect(avancarStatus('cancelada', 'aceita')).toBe('cancelada');
    });
});

describe('classificarEnvio', () => {
    it('2xx → aceita', () => {
        expect(classificarEnvio({ httpStatus: 201, erro: null }, 0)).toBe('aceita');
    });
    it('recusa definitiva do gateway → falhou', () => {
        for (const s of [400, 401, 403, 404, 413, 422, 501]) {
            expect(classificarEnvio({ httpStatus: s, erro: null }, HORA), String(s)).toBe('falhou');
        }
    });
    it('passageiro: repete até 23 h (mesma chave); depois → incerta', () => {
        const casos = [
            { httpStatus: 429, erro: null }, { httpStatus: 503, erro: null }, { httpStatus: 409, erro: null },
            { httpStatus: null, erro: 'recusada' as const }, { httpStatus: null, erro: 'timeout' as const },
        ];
        for (const r of casos) {
            expect(classificarEnvio(r, HORA), JSON.stringify(r)).toBe('repetir');
            expect(classificarEnvio(r, 23 * HORA + 1), JSON.stringify(r)).toBe('incerta');
        }
    });
    it('idade ilegível falha fechado → incerta', () => {
        expect(classificarEnvio({ httpStatus: 503, erro: null }, NaN)).toBe('incerta');
        expect(classificarEnvio({ httpStatus: null, erro: 'timeout' }, NaN)).toBe('incerta');
    });
    it('sem resposta e sem erro → incerta', () => {
        expect(classificarEnvio({ httpStatus: null, erro: null }, 0)).toBe('incerta');
    });
});

describe('esperaAposFalha', () => {
    it('espera crescente e limite', () => {
        expect(ESPERAS_MS).toEqual([30e3, 60e3, 120e3, 300e3, 600e3, 1800e3]);
        expect(esperaAposFalha(0)).toBe(30000);
        expect(esperaAposFalha(5)).toBe(1800000);
        expect(esperaAposFalha(6)).toBeNull();
    });
});

describe('assinaturaConfere', () => {
    const segredo = 'segredo-de-teste';
    const corpo = new TextEncoder().encode('{"event":"message.ack","data":{"status":"read"}}');
    const assinar = (s: string, c: Uint8Array) => 'sha256=' + createHmac('sha256', s).update(c).digest('hex');

    it('confere com HMAC-SHA256 dos bytes originais', async () => {
        expect(await assinaturaConfere(corpo, assinar(segredo, corpo), segredo)).toBe(true);
    });
    it('recusa segredo errado, cabeçalho ausente, sem prefixo, hex truncado e corpo alterado', async () => {
        const boa = assinar(segredo, corpo);
        expect(await assinaturaConfere(corpo, assinar('outro', corpo), segredo)).toBe(false);
        expect(await assinaturaConfere(corpo, null, segredo)).toBe(false);
        expect(await assinaturaConfere(corpo, boa.slice('sha256='.length), segredo)).toBe(false);
        expect(await assinaturaConfere(corpo, boa.slice(0, -2), segredo)).toBe(false);
        const comEspaco = new TextEncoder().encode('{"event":"message.ack","data":{"status":"read"}} ');
        expect(await assinaturaConfere(comEspaco, boa, segredo)).toBe(false);
    });
});

describe('telefoneDoRemetente', () => {
    it('c.us → telefone; @lid → senderPhone; grupo ou sem telefone → vazio', () => {
        expect(telefoneDoRemetente({ from: '5511999990000@c.us' })).toBe('5511999990000');
        expect(telefoneDoRemetente({ from: '123@lid', senderPhone: '5511999990000' })).toBe('5511999990000');
        expect(telefoneDoRemetente({ from: '123@lid' })).toBe('');
        expect(telefoneDoRemetente({ from: '1203@g.us' })).toBe('');
    });
    it('@s.whatsapp.net (forma do Baileys) vale como @c.us; grupo, lista e canal continuam vazios', () => {
        expect(telefoneDoRemetente({ from: '5511999990000@s.whatsapp.net' })).toBe('5511999990000');
        expect(telefoneDoRemetente({ from: '5511999990000@S.WHATSAPP.NET', senderPhone: '5599' })).toBe('5511999990000');
        expect(telefoneDoRemetente({ from: 'status@broadcast' })).toBe('');
        expect(telefoneDoRemetente({ from: '1203@newsletter' })).toBe('');
        expect(telefoneDoRemetente({ from: '1203@g.us', senderPhone: '5511999990000' })).toBe('');
    });
});

describe('idsDeMensagemIguais', () => {
    it('id serializado e id curto da mesma mensagem são iguais', () => {
        expect(idsDeMensagemIguais('true_5511@c.us_3EB0AB', '3EB0AB')).toBe(true);
        expect(idsDeMensagemIguais('true_5511@c.us_3EB0AB', '3EB0CD')).toBe(false);
        expect(idsDeMensagemIguais('3EB0AB', '3EB0CD')).toBe(false);
    });
});

describe('escolherVinculo', () => {
    const c = (organizationId: string, orderId: string, providerMessageId: string | null, enviadoEm: string) =>
        ({ organizationId, orderId, providerMessageId, enviadoEm });

    it('citação casa com a mensagem enviada → aquele pedido, mesmo com outra org na lista', () => {
        const lista = [
            c('orgA', 'pA', 'true_5511@c.us_AAA', '2026-11-20T10:00:00Z'),
            c('orgB', 'pB', 'true_5511@c.us_BBB', '2026-11-22T10:00:00Z'),
        ];
        expect(escolherVinculo(lista, 'AAA')).toEqual({ tipo: 'citacao', organizationId: 'orgA', orderId: 'pA' });
    });
    it('sem citação e uma só org → o pedido mais recente dela', () => {
        const lista = [
            c('orgA', 'p1', null, '2026-11-20T10:00:00Z'),
            c('orgA', 'p2', null, '2026-11-22T10:00:00Z'),
            c('orgA', 'p3', null, '2026-11-21T10:00:00Z'),
        ];
        expect(escolherVinculo(lista, null)).toEqual({ tipo: 'unico', organizationId: 'orgA', orderId: 'p2' });
    });
    it('duas orgs sem citação → sem vínculo (nunca por palpite)', () => {
        const lista = [c('orgA', 'p1', null, '2026-11-20T10:00:00Z'), c('orgB', 'p2', null, '2026-11-22T10:00:00Z')];
        expect(escolherVinculo(lista, null)).toEqual({ tipo: 'sem_vinculo' });
    });
    it('citou mensagem que não está na lista (pedido da org B fora da janela) → sem vínculo, nunca a org A por palpite', () => {
        // Org B mandou pedido há 90 dias (fora da janela, quem chama já filtrou); org A há 10 dias.
        const lista = [c('orgA', 'pA', 'true_5511@c.us_AAA', '2026-11-13T10:00:00Z')];
        expect(escolherVinculo(lista, 'true_5511@c.us_BBB')).toEqual({ tipo: 'sem_vinculo' });
    });
    it('lista vazia → sem vínculo', () => {
        expect(escolherVinculo([], null)).toEqual({ tipo: 'sem_vinculo' });
        expect(escolherVinculo([], 'AAA')).toEqual({ tipo: 'sem_vinculo' });
    });
    it('org B com envio incerta/enviando (fora da lista de vínculo) + org A aceita, sem citação → sem vínculo', () => {
        const lista = [c('orgA', 'pA', 'true_5511@c.us_AAA', '2026-11-20T10:00:00Z')];
        expect(escolherVinculo(lista, null, ['orgB'])).toEqual({ tipo: 'sem_vinculo' });
        // A própria org A nos ocupados não muda nada.
        expect(escolherVinculo(lista, null, ['orgA'])).toEqual({ tipo: 'unico', organizationId: 'orgA', orderId: 'pA' });
    });
    it('mesma situação, mas citando a mensagem da org A → A (a citação vence)', () => {
        const lista = [c('orgA', 'pA', 'true_5511@c.us_AAA', '2026-11-20T10:00:00Z')];
        expect(escolherVinculo(lista, 'AAA', ['orgB'])).toEqual({ tipo: 'citacao', organizationId: 'orgA', orderId: 'pA' });
    });
    it('só envio incerta (nenhum alvo de vínculo) → sem vínculo', () => {
        expect(escolherVinculo([], null, ['orgA'])).toEqual({ tipo: 'sem_vinculo' });
    });
    it('janela de 60 dias', () => {
        expect(JANELA_VINCULO_DIAS).toBe(60);
    });
});

describe('estadoDaConexao (vivo do worker)', () => {
    it('normaliza o estado bruto do OpenWA', () => {
        expect(estadoDaConexao('ready')).toBe('conectado');
        expect(estadoDaConexao('qr_ready')).toBe('aguardando_qr');
        expect(estadoDaConexao('authenticating')).toBe('aguardando_qr');
        expect(estadoDaConexao('disconnected')).toBe('desconectado');
        expect(estadoDaConexao('action_required')).toBe('desconectado');
        expect(estadoDaConexao('failed')).toBe('erro');
        expect(estadoDaConexao('  READY ')).toBe('conectado');
    });
    it('estado desconhecido ou ausente nunca vira conectado', () => {
        expect(estadoDaConexao('initializing')).toBe('desconectado');
        expect(estadoDaConexao('')).toBe('desconectado');
        expect(estadoDaConexao(null)).toBe('desconectado');
        expect(estadoDaConexao(42)).toBe('desconectado');
    });
});

describe('lerResultadoDoWorker', () => {
    const ID = '0b5c3f0e-1d2a-4c3b-9e8f-112233445566';
    it('aceita o formato do worker', () => {
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 201, erro: null, messageId: 'true_5511@c.us_ABC' }))
            .toEqual({ id: ID, httpStatus: 201, erro: null, messageId: 'true_5511@c.us_ABC', codigo: null });
        expect(lerResultadoDoWorker({ id: ID.toUpperCase(), httpStatus: null, erro: 'timeout' }))
            .toEqual({ id: ID.toUpperCase(), httpStatus: null, erro: 'timeout', messageId: null, codigo: null });
    });
    it('codigo (o `code` do OpenWA) é opcional: [A-Z0-9_] até 64; fora disso vira null sem perder o relato', () => {
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 429, erro: null, messageId: null, codigo: 'SEND_PACING_LIMITED' }))
            .toEqual({ id: ID, httpStatus: 429, erro: null, messageId: null, codigo: 'SEND_PACING_LIMITED' });
        for (const codigo of ['send_pacing_limited', 'A B', 'X'.repeat(65), '', 7, {}]) {
            const r = lerResultadoDoWorker({ id: ID, httpStatus: 429, erro: null, messageId: null, codigo });
            expect(r, String(codigo)).not.toBeNull();
            expect(r?.codigo, String(codigo)).toBeNull();
        }
    });
    it('id que não é uuid, status fora de 100–599, erro desconhecido ou messageId estranho → null', () => {
        expect(lerResultadoDoWorker({ id: 'x', httpStatus: 200, erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 99, erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200.5, erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: '200', erro: null, messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: null, erro: 'outro', messageId: null })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200, erro: null, messageId: 'a'.repeat(301) })).toBeNull();
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200, erro: null, messageId: 7 })).toBeNull();
        expect(lerResultadoDoWorker(null)).toBeNull();
        expect(lerResultadoDoWorker('x')).toBeNull();
    });
    it('messageId vazio vira null', () => {
        expect(lerResultadoDoWorker({ id: ID, httpStatus: 200, erro: null, messageId: '  ' })?.messageId).toBeNull();
    });
});

describe('planoDoReporte', () => {
    const AGORA = Date.parse('2026-11-23T12:00:00Z');
    const haUmaHora = new Date(AGORA - HORA).toISOString();
    const linha = (tentativas: number, criadoEm = haUmaHora, status: 'enviando' | 'pendente' | 'aceita' = 'enviando') =>
        ({ status, tentativas, criadoEm });
    const ok = { httpStatus: 201, erro: null, messageId: 'MID' } as const;
    const r503 = { httpStatus: 503, erro: null, messageId: null } as const;

    it('só aplica em linha que está enviando (relato atrasado ou repetido não regride)', () => {
        expect(planoDoReporte(linha(1, haUmaHora, 'aceita'), ok, AGORA)).toEqual({ tipo: 'ignorar' });
        expect(planoDoReporte(linha(1, haUmaHora, 'pendente'), r503, AGORA)).toEqual({ tipo: 'ignorar' });
    });
    it('2xx → aceita com o id da mensagem', () => {
        expect(planoDoReporte(linha(1), ok, AGORA)).toEqual({ tipo: 'aceita', status: 'aceita', providerMessageId: 'MID' });
    });
    it('primeira falha passageira (tentativas = 1, já contando a atual) espera 30 s', () => {
        const p = planoDoReporte(linha(1), r503, AGORA);
        expect(p.tipo).toBe('repetir');
        if (p.tipo !== 'repetir') return;
        expect(p.status).toBe('pendente');
        expect(Date.parse(p.proximaTentativaEm) - AGORA).toBe(ESPERAS_MS[0]);
        expect(p.erro).toContain('503');
    });
    it('a espera cresce com as tentativas: tentativas N espera ESPERAS_MS[N-1]', () => {
        for (let n = 1; n <= ESPERAS_MS.length; n++) {
            const p = planoDoReporte(linha(n), { httpStatus: null, erro: 'recusada', messageId: null }, AGORA);
            expect(p.tipo, String(n)).toBe('repetir');
            if (p.tipo === 'repetir') expect(Date.parse(p.proximaTentativaEm) - AGORA, String(n)).toBe(ESPERAS_MS[n - 1]);
        }
    });
    it('esgotou as tentativas → incerta (pode ter saído), não falhou', () => {
        const p = planoDoReporte(linha(ESPERAS_MS.length + 1), r503, AGORA);
        expect(p.tipo).toBe('incerta');
        if (p.tipo === 'incerta') expect(p.erro).toContain('esgotou as tentativas');
    });
    it('recusa definitiva → falhou mesmo com as tentativas esgotadas', () => {
        const p = planoDoReporte(linha(ESPERAS_MS.length + 1), { httpStatus: 422, erro: null, messageId: null }, AGORA);
        expect(p.tipo).toBe('falhou');
        if (p.tipo === 'falhou') expect(p.erro).toContain('422');
    });
    it('passageira com comando de mais de 23 h → incerta', () => {
        const velha = new Date(AGORA - 23 * HORA - 1).toISOString();
        expect(planoDoReporte(linha(1, velha), r503, AGORA).tipo).toBe('incerta');
    });
    it('criado_em ilegível → incerta (falha fechado)', () => {
        expect(planoDoReporte(linha(1, 'ontem'), r503, AGORA).tipo).toBe('incerta');
    });
    it('sem resposta e sem erro → incerta', () => {
        expect(planoDoReporte(linha(1), { httpStatus: null, erro: null, messageId: null }, AGORA).tipo).toBe('incerta');
    });

    // 429 SEND_PACING_LIMITED: o aquecimento do número recusou ANTES de enviar — nada
    // saiu e o OpenWA libera a chave (docs/06 §Idempotent sends). Não é "pode ter saído".
    const pacing = { httpStatus: 429, erro: null, messageId: null, codigo: 'SEND_PACING_LIMITED' } as const;
    it('429 SEND_PACING_LIMITED → repetir em 15 min devolvendo a tentativa (não consome)', () => {
        const p = planoDoReporte(linha(1), pacing, AGORA);
        expect(p.tipo).toBe('repetir');
        if (p.tipo !== 'repetir') return;
        expect(p.status).toBe('pendente');
        expect(Date.parse(p.proximaTentativaEm) - AGORA).toBe(15 * 60_000);
        expect(p.tentativas).toBe(0);
        expect(p.erro).toContain('aquecimento');
    });
    it('429 SEND_PACING_LIMITED com tentativas esgotadas → continua repetir, nunca incerta', () => {
        const n = ESPERAS_MS.length + 3;
        const p = planoDoReporte(linha(n), pacing, AGORA);
        expect(p.tipo).toBe('repetir');
        if (p.tipo === 'repetir') expect(p.tentativas).toBe(n - 1);
    });
    it('429 SEND_PACING_LIMITED entre 23 h e 24 h → ainda repetir (nada saiu, a chave foi liberada)', () => {
        const p = planoDoReporte(linha(1, new Date(AGORA - 23.5 * HORA).toISOString()), pacing, AGORA);
        expect(p.tipo).toBe('repetir');
    });
    it('429 SEND_PACING_LIMITED com o comando há mais de 24 h → falhou "reenviar mais tarde"', () => {
        const p = planoDoReporte(linha(1, new Date(AGORA - 24 * HORA - 1).toISOString()), pacing, AGORA);
        expect(p).toEqual({ tipo: 'falhou', status: 'falhou', erro: expect.stringContaining('limite de aquecimento do número; reenviar mais tarde') });
        expect(planoDoReporte(linha(1, 'ontem'), pacing, AGORA).tipo).toBe('falhou');
    });
    it('429 sem code (limitador global) ou com outro code → regra comum (consome tentativa)', () => {
        for (const codigo of [null, undefined, 'OUTRO_CODIGO']) {
            const p = planoDoReporte(linha(1), { httpStatus: 429, erro: null, messageId: null, codigo }, AGORA);
            expect(p.tipo, String(codigo)).toBe('repetir');
            if (p.tipo === 'repetir') {
                expect(Date.parse(p.proximaTentativaEm) - AGORA, String(codigo)).toBe(ESPERAS_MS[0]);
                expect(p.tentativas, String(codigo)).toBeUndefined();
            }
        }
        expect(planoDoReporte(linha(ESPERAS_MS.length + 1), { httpStatus: 429, erro: null, messageId: null, codigo: null }, AGORA).tipo)
            .toBe('incerta');
    });
    it('SEND_PACING_LIMITED só vale com 429', () => {
        expect(planoDoReporte(linha(1), { ...pacing, httpStatus: 400 }, AGORA).tipo).toBe('falhou');
    });
});

describe('espelhoDoLog (varredura do vivo)', () => {
    const pend = (metadata: Record<string, unknown> | null = { wa_mensagem_id: 'm' }) => ({ status: 'pending', metadata });
    const msg = (status: StatusSaida, providerMessageId: string | null = null, erro: string | null = null) =>
        ({ status, providerMessageId, erro });

    it('aceita, entregue ou lida → sent com o id da mensagem', () => {
        for (const st of ['aceita', 'entregue', 'lida'] as const) {
            expect(espelhoDoLog(msg(st, 'MID'), pend()), st).toEqual({ acao: 'sent', waMessageId: 'MID' });
        }
    });
    it('falhou → failed com o erro gravado (ou um texto padrão)', () => {
        expect(espelhoDoLog(msg('falhou', null, 'O WhatsApp não aceitou'), pend())).toEqual({ acao: 'failed', erro: 'O WhatsApp não aceitou' });
        const semErro = espelhoDoLog(msg('falhou'), pend());
        expect(semErro.acao).toBe('failed');
        if (semErro.acao === 'failed') expect(semErro.erro.length).toBeGreaterThan(0);
    });
    it('incerta → continua pending com confirmação pendente; já marcada → nada', () => {
        expect(espelhoDoLog(msg('incerta', null, 'pode ter saído'), pend())).toEqual({ acao: 'confirmacao_pendente', erro: 'pode ter saído' });
        expect(espelhoDoLog(msg('incerta'), pend({ wa_mensagem_id: 'm', confirmacao: 'pendente' }))).toEqual({ acao: 'nada' });
    });
    it('log que já saiu de pending nunca é sobrescrito', () => {
        for (const st of ['sent', 'failed']) {
            expect(espelhoDoLog(msg('aceita', 'MID'), { status: st, metadata: null }), st).toEqual({ acao: 'nada' });
            expect(espelhoDoLog(msg('falhou', null, 'x'), { status: st, metadata: null }), st).toEqual({ acao: 'nada' });
        }
    });
    it('mensagem ainda na fila, enviando ou cancelada → nada', () => {
        for (const st of ['pendente', 'enviando', 'cancelada'] as const) {
            expect(espelhoDoLog(msg(st), pend()), st).toEqual({ acao: 'nada' });
        }
    });
});

// ─── Task 5 — webhook do OpenWA (whatsapp-openwa-webhook) ─────────────────────

describe('limites do webhook', () => {
    it('corpo até 8 MiB; mídia inline até 5 MiB decodificada', () => {
        expect(CORPO_WEBHOOK_MAX_BYTES).toBe(8 * 1024 * 1024);
        expect(MIDIA_MAX_BYTES).toBe(5 * 1024 * 1024);
    });
});

describe('variantesDoTelefoneBR (nono dígito)', () => {
    it('celular antigo de 8 dígitos (12 com DDI) também procura com o 9', () => {
        expect(variantesDoTelefoneBR('551188887777')).toEqual(['551188887777', '5511988887777']);
    });
    it('celular de 9 dígitos (13 com DDI) também procura sem o 9', () => {
        expect(variantesDoTelefoneBR('5511988887777')).toEqual(['5511988887777', '551188887777']);
    });
    it('fixo (começa com 2–5) não ganha 9 — nunca casar um fixo com o celular de outro', () => {
        expect(variantesDoTelefoneBR('551133334444')).toEqual(['551133334444']);
    });
    it('celular novo (9 seguido de 1–5) não tem forma antiga', () => {
        expect(variantesDoTelefoneBR('5511912345678')).toEqual(['5511912345678']);
    });
    it('fora do Brasil, tamanho fora do padrão ou vazio → só ele mesmo (ou nada)', () => {
        expect(variantesDoTelefoneBR('14155550100')).toEqual(['14155550100']);
        expect(variantesDoTelefoneBR('5511')).toEqual(['5511']);
        expect(variantesDoTelefoneBR('')).toEqual([]);
        expect(variantesDoTelefoneBR('+55 (11) 8888-7777')).toEqual(['551188887777', '5511988887777']);
    });
});

describe('idCurtoDaMensagem', () => {
    it('id serializado → curto; curto fica como está', () => {
        expect(idCurtoDaMensagem('true_5511988887777@c.us_3EB0AB')).toBe('3EB0AB');
        expect(idCurtoDaMensagem('3EB0AB')).toBe('3EB0AB');
        expect(idCurtoDaMensagem('  ')).toBe('');
    });
});

describe('mídia do message.received', () => {
    const b64 = (n: number) => Buffer.alloc(n, 7).toString('base64');
    /** Arquivo de `n` bytes com a assinatura (magic bytes) do tipo no começo. */
    const MAGICO: Record<string, number[]> = {
        'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
        'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
        'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        'image/webp': [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50],
        'audio/ogg': [0x4f, 0x67, 0x67, 0x53],
        'audio/mpeg': [0x49, 0x44, 0x33],
        'video/mp4': [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70],
    };
    const arquivo = (tipo: string, n: number) => {
        const b = Buffer.alloc(n, 7);
        Buffer.from(MAGICO[tipo]).copy(b);
        return b;
    };
    const b64De = (tipo: string, n: number) => arquivo(tipo, n).toString('base64');

    it('normalizarMimetype tira parâmetros e caixa', () => {
        expect(normalizarMimetype('audio/ogg; codecs=opus')).toBe('audio/ogg');
        expect(normalizarMimetype(' Image/JPEG ')).toBe('image/jpeg');
        expect(normalizarMimetype(undefined)).toBe('');
        expect(normalizarMimetype('<script>/x')).toBe('');
    });
    it('tamanhoDoBase64 = bytes decodificados; inválido → null', () => {
        expect(tamanhoDoBase64(b64(10))).toBe(10);
        expect(tamanhoDoBase64(b64(11))).toBe(11);
        expect(tamanhoDoBase64(b64(12))).toBe(12);
        expect(tamanhoDoBase64('data:image/png;base64,' + b64(9))).toBe(9);
        expect(tamanhoDoBase64('não é base64!')).toBeNull();
        expect(tamanhoDoBase64('')).toBeNull();
    });
    it('inline aceito e dentro do limite → gravar', () => {
        const d = decidirMidia({ mimetype: 'image/jpeg', data: b64De('image/jpeg', 1000), filename: 'foto.jpg' });
        expect(d).toEqual({ acao: 'gravar', mimetype: 'image/jpeg', base64: b64De('image/jpeg', 1000), bytes: 1000, nome: 'foto.jpg' });
    });
    it('inline acima de 5 MiB → grande; omitido → grande', () => {
        expect(decidirMidia({ mimetype: 'application/pdf', data: b64(MIDIA_MAX_BYTES + 1) }))
            .toEqual({ acao: 'grande', mimetype: 'application/pdf' });
        expect(decidirMidia({ mimetype: 'video/mp4', omitted: true, sizeBytes: 20e6 }))
            .toEqual({ acao: 'grande', mimetype: 'video/mp4' });
    });
    it('tipo fora da lista → tipo_nao_aceito (antes do tamanho)', () => {
        expect(decidirMidia({ mimetype: 'application/x-msdownload', data: b64(10) }))
            .toEqual({ acao: 'tipo_nao_aceito', mimetype: 'application/x-msdownload' });
        expect(decidirMidia({ mimetype: 'text/html', omitted: true, sizeBytes: 9e6 }))
            .toEqual({ acao: 'tipo_nao_aceito', mimetype: 'text/html' });
        expect(decidirMidia({ data: b64(10) })).toEqual({ acao: 'tipo_nao_aceito', mimetype: 'desconhecido' });
    });
    it('áudio de voz (audio/ogg; codecs=opus) é aceito', () => {
        expect(decidirMidia({ mimetype: 'audio/ogg; codecs=opus', data: b64De('audio/ogg', 10) })?.acao).toBe('gravar');
    });
    it('conteúdo que não bate com o tipo declarado → tipo_nao_aceito (ex.: executável dito PDF)', () => {
        const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0)]).toString('base64');
        expect(decidirMidia({ mimetype: 'application/pdf', data: exe, filename: 'Orcamento.pdf.exe' }))
            .toEqual({ acao: 'tipo_nao_aceito', mimetype: 'application/pdf' });
        expect(decidirMidia({ mimetype: 'image/png', data: b64De('image/jpeg', 50) }))
            .toEqual({ acao: 'tipo_nao_aceito', mimetype: 'image/png' });
    });
    it('conteudoConfereComTipo: cada tipo aceito pela assinatura, e recusa trocado/curto/desconhecido', () => {
        for (const tipo of Object.keys(MAGICO)) {
            expect(conteudoConfereComTipo(new Uint8Array(arquivo(tipo, 32)), tipo), tipo).toBe(true);
        }
        // MP3 sem ID3: começa direto no frame (FF Fx / FF Ex).
        expect(conteudoConfereComTipo(new Uint8Array([0xff, 0xfb, 0x90, 0x44, 0, 0]), 'audio/mpeg')).toBe(true);
        expect(conteudoConfereComTipo(new Uint8Array([0xff, 0x1b, 0x90, 0x44, 0, 0]), 'audio/mpeg')).toBe(false);
        expect(conteudoConfereComTipo(new Uint8Array(arquivo('image/jpeg', 32)), 'application/pdf')).toBe(false);
        expect(conteudoConfereComTipo(new Uint8Array(arquivo('audio/ogg', 32)), 'video/mp4')).toBe(false);
        // RIFF que não é WEBP (WAV/AVI).
        const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);
        expect(conteudoConfereComTipo(new Uint8Array(wav), 'image/webp')).toBe(false);
        expect(conteudoConfereComTipo(new Uint8Array([0x25, 0x50]), 'application/pdf')).toBe(false);
        expect(conteudoConfereComTipo(new Uint8Array(arquivo('application/pdf', 32)), 'text/html')).toBe(false);
    });
    it('sem dado e sem marcador, ou base64 inválido → indisponivel; sem mídia → null', () => {
        expect(decidirMidia({ mimetype: 'image/png' })).toEqual({ acao: 'indisponivel', mimetype: 'image/png' });
        expect(decidirMidia({ mimetype: 'image/png', data: '%%%' })).toEqual({ acao: 'indisponivel', mimetype: 'image/png' });
        expect(decidirMidia(undefined)).toBeNull();
        expect(decidirMidia(null)).toBeNull();
    });
    it('nomeSeguroDoArquivo: sem caminho, sem caractere estranho, com extensão de reserva', () => {
        expect(nomeSeguroDoArquivo('../../etc/passwd', 'application/pdf')).toBe('passwd.pdf');
        // Extensão sempre a do tipo: a do remetente sai (e o ponto interno vira _).
        expect(nomeSeguroDoArquivo('Orcamento.pdf.exe', 'application/pdf')).toBe('Orcamento_pdf.pdf');
        expect(nomeSeguroDoArquivo('foto.PNG', 'image/jpeg')).toBe('foto.jpg');
        expect(nomeSeguroDoArquivo('Orçamento final (2).pdf', 'application/pdf')).toBe('Or_amento_final_2_.pdf');
        expect(nomeSeguroDoArquivo(undefined, 'image/jpeg')).toBe('arquivo.jpg');
        expect(nomeSeguroDoArquivo('...', 'audio/ogg')).toBe('arquivo.ogg');
        expect(nomeSeguroDoArquivo('a'.repeat(300) + '.pdf', 'application/pdf').length).toBeLessThanOrEqual(100);
        expect(nomeSeguroDoArquivo('a'.repeat(300) + '.pdf', 'application/pdf').endsWith('.pdf')).toBe(true);
    });
    it('linhaDaMidia — o que aparece no chat do pedido', () => {
        expect(linhaDaMidia({ acao: 'gravar', mimetype: 'image/png', base64: '', bytes: 1, nome: 'a.png' }))
            .toBe('Fornecedor enviou um arquivo (imagem); abrir no celular do número.');
        expect(linhaDaMidia({ acao: 'gravar', mimetype: 'application/pdf', base64: '', bytes: 1, nome: 'a.pdf' }))
            .toBe('Fornecedor enviou um arquivo (PDF); abrir no celular do número.');
        expect(linhaDaMidia({ acao: 'grande', mimetype: 'video/mp4' }))
            .toBe('Fornecedor enviou um arquivo (video/mp4) maior que 5 MB; abrir no celular do número.');
        expect(linhaDaMidia({ acao: 'tipo_nao_aceito', mimetype: 'text/html' }))
            .toBe('Fornecedor enviou um arquivo (text/html) de tipo não aceito; abrir no celular do número.');
        expect(linhaDaMidia({ acao: 'indisponivel', mimetype: 'image/png' }))
            .toBe('Fornecedor enviou um arquivo (image/png) que não chegou; abrir no celular do número.');
    });
});

describe('classificarEventoRecebido', () => {
    const base = {
        id: 'true_5511988887777@c.us_ABC', from: '5511988887777@c.us', to: '5511900000000@c.us',
        body: 'Pode entregar amanhã', type: 'chat', timestamp: 1_790_000_000, isGroup: false,
    };

    it('1:1 com texto → mensagem com telefone, chat, id, texto', () => {
        expect(classificarEventoRecebido(base)).toEqual({
            tipo: 'mensagem', telefone: '5511988887777', chatIdRemoto: '5511988887777@c.us',
            providerMessageId: 'true_5511988887777@c.us_ABC', citadoId: null, texto: 'Pode entregar amanhã', midia: null,
        });
    });
    it('citação → citadoId', () => {
        const r = classificarEventoRecebido({ ...base, quotedMessage: { id: 'true_5511@c.us_Q1', body: 'pedido' } });
        expect(r.tipo === 'mensagem' && r.citadoId).toBe('true_5511@c.us_Q1');
    });
    it('@lid com senderPhone → telefone resolvido; @lid sem telefone → ignorar', () => {
        const r = classificarEventoRecebido({ ...base, from: '987654321@lid', senderPhone: '5511988887777' });
        expect(r.tipo === 'mensagem' && r.telefone).toBe('5511988887777');
        expect(r.tipo === 'mensagem' && r.chatIdRemoto).toBe('5511988887777@c.us');
        expect(classificarEventoRecebido({ ...base, from: '987654321@lid' })).toEqual({ tipo: 'ignorar', motivo: 'sem_telefone' });
    });
    it('grupo, transmissão, canal, mensagem nossa ou fora do formato → ignorar', () => {
        expect(classificarEventoRecebido({ ...base, isGroup: true }).tipo).toBe('ignorar');
        expect(classificarEventoRecebido({ ...base, from: '1203@g.us' }).tipo).toBe('ignorar');
        expect(classificarEventoRecebido({ ...base, from: 'status@broadcast' }).tipo).toBe('ignorar');
        expect(classificarEventoRecebido({ ...base, from: '1203@newsletter' }).tipo).toBe('ignorar');
        expect(classificarEventoRecebido({ ...base, fromMe: true }).tipo).toBe('ignorar');
        expect(classificarEventoRecebido(null).tipo).toBe('ignorar');
        expect(classificarEventoRecebido('x').tipo).toBe('ignorar');
    });
    it('texto longo é cortado em 4096; sem texto e sem mídia → linha que manda abrir no celular', () => {
        const r = classificarEventoRecebido({ ...base, body: 'a'.repeat(5000) });
        expect(r.tipo === 'mensagem' && r.texto.length).toBe(4096);
        const v = classificarEventoRecebido({ ...base, body: '', type: 'location' });
        expect(v.tipo === 'mensagem' && v.texto).toBe('Fornecedor enviou uma mensagem sem texto (location); abrir no celular do número.');
    });
    it('mídia: legenda vai depois da linha do arquivo; corpo que é o próprio base64 é descartado', () => {
        const media = { mimetype: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(26).fill(1)]).toString('base64') };
        const r = classificarEventoRecebido({ ...base, type: 'image', body: 'nota fiscal', media });
        expect(r.tipo === 'mensagem' && r.texto).toBe('Fornecedor enviou um arquivo (imagem); abrir no celular do número.\nnota fiscal');
        expect(r.tipo === 'mensagem' && r.midia?.acao).toBe('gravar');
        const lixo = Buffer.alloc(400, 3).toString('base64');
        const s = classificarEventoRecebido({ ...base, type: 'image', body: lixo, media });
        expect(s.tipo === 'mensagem' && s.texto).toBe('Fornecedor enviou um arquivo (imagem); abrir no celular do número.');
    });
});

describe('status do vínculo', () => {
    it('alvo = aceita|entregue|lida; contam organização também pendente|enviando|incerta', () => {
        expect([...STATUS_ALVO_DE_VINCULO]).toEqual(['aceita', 'entregue', 'lida']);
        expect([...STATUS_QUE_CONTAM_ORG]).toEqual(['pendente', 'enviando', 'incerta', 'aceita', 'entregue', 'lida']);
    });
});

describe('candidatoDoVinculo', () => {
    const c = (id: string, organizationId: string, orderId: string, providerMessageId: string | null, enviadoEm: string) =>
        ({ id, organizationId, orderId, providerMessageId, enviadoEm });
    const lista = [
        c('m1', 'orgA', 'p1', 'true_x@c.us_AAA', '2026-11-20T10:00:00Z'),
        c('m2', 'orgA', 'p1', 'true_x@c.us_BBB', '2026-11-22T10:00:00Z'),
        c('m3', 'orgA', 'p2', 'true_x@c.us_CCC', '2026-11-21T10:00:00Z'),
    ];
    it('citação → a própria mensagem citada (quem a enviou recebe o aviso)', () => {
        const v = escolherVinculo(lista, 'AAA');
        expect(candidatoDoVinculo(lista, v, 'AAA')?.id).toBe('m1');
    });
    it('único → a mensagem mais recente daquele pedido', () => {
        const v = escolherVinculo(lista, null);
        expect(v).toEqual({ tipo: 'unico', organizationId: 'orgA', orderId: 'p1' });
        expect(candidatoDoVinculo(lista, v, null)?.id).toBe('m2');
    });
    it('sem vínculo → null', () => {
        expect(candidatoDoVinculo(lista, { tipo: 'sem_vinculo' }, null)).toBeNull();
    });
});

describe('espelhoDoAckNoLog (Logs de envio)', () => {
    const log = (status: string, metadata: Record<string, unknown> | null = {}) => ({ status, metadata });

    it('entregue/lida → sent, metadata.entrega e some a confirmação pendente', () => {
        expect(espelhoDoAckNoLog(log('pending', { wa_mensagem_id: 'w', confirmacao: 'pendente' }), 'entregue', null))
            .toEqual({ status: 'sent', error: null, metadata: { wa_mensagem_id: 'w', entrega: 'entregue' } });
        expect(espelhoDoAckNoLog(log('sent', { entrega: 'entregue' }), 'lida', null))
            .toEqual({ metadata: { entrega: 'lida' } });
        // Entrega prova que chegou: vence um 'failed' anterior.
        expect(espelhoDoAckNoLog(log('failed', {}), 'lida', null))
            .toEqual({ status: 'sent', error: null, metadata: { entrega: 'lida' } });
    });
    it('nada a mudar → null (repetição do evento não regrava)', () => {
        expect(espelhoDoAckNoLog(log('sent', { entrega: 'lida' }), 'lida', null)).toBeNull();
        expect(espelhoDoAckNoLog(log('sent', {}), 'aceita', null)).toBeNull();
        expect(espelhoDoAckNoLog(log('failed', { entrega: 'falhou' }), 'falhou', 'x')).toBeNull();
    });
    it('aceita com log pendente → sent sem confirmação pendente', () => {
        expect(espelhoDoAckNoLog(log('pending', { confirmacao: 'pendente' }), 'aceita', null))
            .toEqual({ status: 'sent', error: null, metadata: {} });
    });
    it('falhou → failed com o erro e entrega falhou', () => {
        expect(espelhoDoAckNoLog(log('sent', null), 'falhou', 'recusou'))
            .toEqual({ status: 'failed', error: 'recusou', metadata: { entrega: 'falhou' } });
    });
    it('status que não vem de ack → null', () => {
        for (const st of ['pendente', 'enviando', 'incerta', 'cancelada'] as const) {
            expect(espelhoDoAckNoLog(log('pending'), st, null), st).toBeNull();
        }
    });
});

describe('sessão do OpenWA', () => {
    it('estadoDoEventoDeSessao', () => {
        expect(estadoDoEventoDeSessao('session.status', { status: 'ready' }))
            .toEqual({ estado: 'conectado', estadoBruto: 'ready', motivo: null });
        expect(estadoDoEventoDeSessao('session.status', { status: 'qr_ready' })?.estado).toBe('aguardando_qr');
        expect(estadoDoEventoDeSessao('session.status', { status: 'action_required' })?.estado).toBe('desconectado');
        expect(estadoDoEventoDeSessao('session.disconnected', { reason: 'LOGOUT' }))
            .toEqual({ estado: 'desconectado', estadoBruto: 'disconnected', motivo: 'LOGOUT' });
        expect(estadoDoEventoDeSessao('message.ack', {})).toBeNull();
    });
    it('deveAvisarDesconexao: virou desconectado, ou o evento é a própria desconexão', () => {
        expect(deveAvisarDesconexao({ evento: 'session.status', anterior: 'conectado', novo: 'desconectado' })).toBe(true);
        expect(deveAvisarDesconexao({ evento: 'session.status', anterior: 'desconectado', novo: 'desconectado' })).toBe(false);
        // O "vivo" do worker pode ter gravado desconectado antes do evento chegar.
        expect(deveAvisarDesconexao({ evento: 'session.disconnected', anterior: 'desconectado', novo: 'desconectado' })).toBe(true);
        expect(deveAvisarDesconexao({ evento: 'session.status', anterior: 'desconectado', novo: 'conectado' })).toBe(false);
        expect(deveAvisarDesconexao({ evento: 'session.status', anterior: 'conectado', novo: 'erro' })).toBe(false);
    });
});

describe('eventoVelhoDemais (reenvio de corpo assinado antigo)', () => {
    const agora = Date.parse('2026-11-23T12:00:00Z');
    it('mais de 7 dias → true; recente, futuro próximo ou ilegível → false', () => {
        expect(eventoVelhoDemais('2026-11-10T12:00:00Z', agora)).toBe(true);
        expect(eventoVelhoDemais('2026-11-22T12:00:00Z', agora)).toBe(false);
        expect(eventoVelhoDemais('2026-11-23T12:05:00Z', agora)).toBe(false);
        expect(eventoVelhoDemais(undefined, agora)).toBe(false);
        expect(eventoVelhoDemais('ontem', agora)).toBe(false);
    });
});

describe('avisoDaResposta (sino)', () => {
    it('diz quem respondeu e qual pedido, com trecho curto numa linha', () => {
        const a = avisoDaResposta({ fornecedor: 'Casa do Aço', numero: 'PC-42', texto: 'linha 1\nlinha 2 ' + 'x'.repeat(300) });
        expect(a.title).toBe('Resposta do fornecedor no WhatsApp');
        expect(a.message.startsWith('Casa do Aço respondeu o pedido nº PC-42: "linha 1 linha 2 ')).toBe(true);
        expect(a.message.length).toBeLessThanOrEqual(220);
        expect(avisoDaResposta({ fornecedor: '', numero: '', texto: '' }).message).toBe('Fornecedor respondeu o pedido nº —.');
    });
});
