import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
    escolherCanalDoPedido,
    rotuloDaEntrega,
    entregaDoLog,
    rotuloDoLogWhatsapp,
    conexaoAceitaEnvio,
    maquinaFora,
    ultimaDoFornecedorPeloWhatsapp,
    avisoDoEnvioAutomatico,
    comandoParaTentativa,
    comandoAposErro,
    DICA_NUMERO_DESCONECTADO,
} from '../utils/canalWhatsappDoPedido';
import { MOTIVO_SEM_WHATSAPP_EMPRESA } from '../utils/permissaoWhatsappEmpresa';

// Piloto WhatsApp pelo OpenWA (23/11/2026), Tarefa 7.
// Plano: docs/planos/2026-11-23-whatsapp-openwa-piloto-pedido.md.

const base = {
    orgUsaOpenwa: true, conexaoConectadaOuFora: true, podeUsar: true,
    apiOficialAtiva: false, fornecedorTemTelefone: true,
};

describe('escolherCanalDoPedido', () => {
    it('org usa o OpenWA + pode usar + fornecedor com telefone → openwa', () => {
        expect(escolherCanalDoPedido(base)).toEqual({ tipo: 'openwa' });
    });

    it('máquina fora ainda é openwa: a mensagem espera na fila', () => {
        // conexaoConectadaOuFora = true cobre "conectado" e "máquina fora" (conexaoAceitaEnvio).
        expect(escolherCanalDoPedido({ ...base, conexaoConectadaOuFora: true, apiOficialAtiva: true })).toEqual({ tipo: 'openwa' });
    });

    it('org usa o OpenWA + pode usar + fornecedor sem telefone → sem_telefone', () => {
        expect(escolherCanalDoPedido({ ...base, fornecedorTemTelefone: false })).toEqual({ tipo: 'sem_telefone' });
    });

    it('org usa o OpenWA + sem a permissão → WhatsApp pessoal com a dica da permissão', () => {
        expect(escolherCanalDoPedido({ ...base, podeUsar: false })).toEqual({
            tipo: 'whatsapp_pessoal', dica: MOTIVO_SEM_WHATSAPP_EMPRESA,
        });
        // A falta de telefone não importa: o OpenWA nem entra na conta.
        expect(escolherCanalDoPedido({ ...base, podeUsar: false, fornecedorTemTelefone: false })).toEqual({
            tipo: 'whatsapp_pessoal', dica: MOTIVO_SEM_WHATSAPP_EMPRESA,
        });
    });

    it('sem a permissão, quem tinha a API oficial continua com ela (ninguém perde o que tem hoje)', () => {
        expect(escolherCanalDoPedido({ ...base, podeUsar: false, apiOficialAtiva: true })).toEqual({ tipo: 'api_oficial' });
    });

    it('org não usa o OpenWA → API oficial se ativa', () => {
        expect(escolherCanalDoPedido({ ...base, orgUsaOpenwa: false, apiOficialAtiva: true })).toEqual({ tipo: 'api_oficial' });
    });

    it('org não usa o OpenWA nem a API → WhatsApp pessoal sem dica (o de hoje)', () => {
        expect(escolherCanalDoPedido({ ...base, orgUsaOpenwa: false, apiOficialAtiva: false })).toEqual({ tipo: 'whatsapp_pessoal' });
        // Sem OpenWA, a permissão e o telefone não mudam nada.
        expect(escolherCanalDoPedido({
            orgUsaOpenwa: false, conexaoConectadaOuFora: false, podeUsar: false, apiOficialAtiva: false, fornecedorTemTelefone: false,
        })).toEqual({ tipo: 'whatsapp_pessoal' });
    });

    it('número do ÒPURA desconectado (ler o QR) → API oficial se ativa; senão pessoal com a dica', () => {
        expect(escolherCanalDoPedido({ ...base, conexaoConectadaOuFora: false, apiOficialAtiva: true })).toEqual({ tipo: 'api_oficial' });
        expect(escolherCanalDoPedido({ ...base, conexaoConectadaOuFora: false })).toEqual({
            tipo: 'whatsapp_pessoal', dica: DICA_NUMERO_DESCONECTADO,
        });
    });
});

describe('rotuloDaEntrega', () => {
    it('cada status da fila tem o seu rótulo', () => {
        expect(rotuloDaEntrega('pendente', false)).toBe('Na fila');
        expect(rotuloDaEntrega('enviando', false)).toBe('Na fila');
        expect(rotuloDaEntrega('aceita', false)).toBe('Enviada');
        expect(rotuloDaEntrega('entregue', false)).toBe('Entregue');
        expect(rotuloDaEntrega('lida', false)).toBe('Lida');
        expect(rotuloDaEntrega('falhou', false)).toBe('Falhou');
        expect(rotuloDaEntrega('incerta', false)).toBe('Confirmação pendente');
        expect(rotuloDaEntrega('cancelada', false)).toBe('Cancelada');
    });

    it('confirmação pendente vence "Na fila"', () => {
        expect(rotuloDaEntrega('pendente', true)).toBe('Confirmação pendente');
        expect(rotuloDaEntrega('enviando', true)).toBe('Confirmação pendente');
        expect(rotuloDaEntrega('incerta', true)).toBe('Confirmação pendente');
    });

    it('confirmação pendente velha não desmente um desfecho (enviada, entregue, lida, falhou)', () => {
        expect(rotuloDaEntrega('aceita', true)).toBe('Enviada');
        expect(rotuloDaEntrega('entregue', true)).toBe('Entregue');
        expect(rotuloDaEntrega('lida', true)).toBe('Lida');
        expect(rotuloDaEntrega('falhou', true)).toBe('Falhou');
        expect(rotuloDaEntrega('cancelada', true)).toBe('Cancelada');
    });
});

describe('entregaDoLog / rotuloDoLogWhatsapp — a linha do notification_log', () => {
    it('pending sem confirmação → Na fila; com confirmação → Confirmação pendente', () => {
        expect(rotuloDoLogWhatsapp({ status: 'pending', metadata: { via: 'openwa' } })).toBe('Na fila');
        expect(rotuloDoLogWhatsapp({ status: 'pending', metadata: null })).toBe('Na fila');
        expect(rotuloDoLogWhatsapp({ status: 'pending', metadata: { confirmacao: 'pendente' } })).toBe('Confirmação pendente');
        expect(rotuloDoLogWhatsapp({ status: 'pending', metadata: { confirmacao: null } })).toBe('Na fila');
    });

    it('sent → Enviada, ou Entregue/Lida pelo metadata.entrega', () => {
        expect(rotuloDoLogWhatsapp({ status: 'sent', metadata: { via: 'openwa' } })).toBe('Enviada');
        expect(rotuloDoLogWhatsapp({ status: 'sent', metadata: { entrega: 'entregue' } })).toBe('Entregue');
        expect(rotuloDoLogWhatsapp({ status: 'sent', metadata: { entrega: 'lida' } })).toBe('Lida');
        // Visão do fornecedor: sem metadata.
        expect(rotuloDoLogWhatsapp({ status: 'sent' })).toBe('Enviada');
    });

    it('sent com confirmacao velha (achado da Tarefa 4) continua Enviada/Entregue', () => {
        expect(rotuloDoLogWhatsapp({ status: 'sent', metadata: { confirmacao: 'pendente' } })).toBe('Enviada');
        expect(rotuloDoLogWhatsapp({ status: 'sent', metadata: { confirmacao: 'pendente', entrega: 'entregue' } })).toBe('Entregue');
        expect(entregaDoLog({ status: 'sent', metadata: { confirmacao: 'pendente' } })).toEqual({ status: 'aceita', confirmacaoPendente: false });
    });

    it('failed → Falhou (mesmo com confirmacao velha)', () => {
        expect(rotuloDoLogWhatsapp({ status: 'failed', metadata: { entrega: 'falhou' } })).toBe('Falhou');
        expect(rotuloDoLogWhatsapp({ status: 'failed', metadata: { confirmacao: 'pendente' } })).toBe('Falhou');
    });
});

describe('conexaoAceitaEnvio', () => {
    const agora = Date.parse('2026-11-23T12:00:00Z');
    const haMin = (m: number) => new Date(agora - m * 60_000).toISOString();

    it('conectado ou máquina fora → aceita (a fila espera)', () => {
        expect(conexaoAceitaEnvio({ estado: 'conectado', vistoEm: haMin(1) }, agora)).toBe(true);
        expect(conexaoAceitaEnvio({ estado: 'maquina_fora', vistoEm: null }, agora)).toBe(true);
    });

    it('número desconectado / lendo QR / erro com o worker vivo → não aceita', () => {
        expect(conexaoAceitaEnvio({ estado: 'desconectado', vistoEm: haMin(1) }, agora)).toBe(false);
        expect(conexaoAceitaEnvio({ estado: 'aguardando_qr', vistoEm: haMin(2) }, agora)).toBe(false);
        expect(conexaoAceitaEnvio({ estado: 'erro', vistoEm: haMin(0) }, agora)).toBe(false);
    });

    it('sem sinal do worker há mais de 3 min = máquina fora, qualquer que seja o estado gravado', () => {
        expect(conexaoAceitaEnvio({ estado: 'desconectado', vistoEm: haMin(5) }, agora)).toBe(true);
        expect(conexaoAceitaEnvio({ estado: 'desconectado', vistoEm: null }, agora)).toBe(true);
    });

    it('sem conexão nenhuma → não aceita', () => {
        expect(conexaoAceitaEnvio({ estado: null, vistoEm: null }, agora)).toBe(false);
        expect(conexaoAceitaEnvio(null, agora)).toBe(false);
    });
});

describe('maquinaFora', () => {
    const agora = Date.parse('2026-11-23T12:00:00Z');
    const haMin = (m: number) => new Date(agora - m * 60_000).toISOString();

    it('estado gravado maquina_fora, ou sem sinal do worker há mais de 3 min → fora', () => {
        expect(maquinaFora({ estado: 'maquina_fora', vistoEm: haMin(0) }, agora)).toBe(true);
        expect(maquinaFora({ estado: 'conectado', vistoEm: haMin(5) }, agora)).toBe(true);
        expect(maquinaFora({ estado: 'desconectado', vistoEm: null }, agora)).toBe(true);
    });

    it('worker vivo (sinal há até 3 min) → não está fora, qualquer que seja o número', () => {
        expect(maquinaFora({ estado: 'conectado', vistoEm: haMin(1) }, agora)).toBe(false);
        expect(maquinaFora({ estado: 'desconectado', vistoEm: haMin(2) }, agora)).toBe(false);
    });
});

describe('ultimaDoFornecedorPeloWhatsapp', () => {
    it('olha só a última mensagem do FORNECEDOR', () => {
        expect(ultimaDoFornecedorPeloWhatsapp([])).toBe(false);
        expect(ultimaDoFornecedorPeloWhatsapp([
            { senderRole: 'supplier', canal: 'whatsapp' },
            { senderRole: 'buyer', canal: 'app' },
        ])).toBe(true);
        expect(ultimaDoFornecedorPeloWhatsapp([
            { senderRole: 'supplier', canal: 'whatsapp' },
            { senderRole: 'supplier', canal: 'app' },
        ])).toBe(false);
        expect(ultimaDoFornecedorPeloWhatsapp([
            { senderRole: 'buyer', canal: 'whatsapp' },
            { senderRole: 'system' },
        ])).toBe(false);
    });
});

describe('avisoDoEnvioAutomatico', () => {
    it('na fila → diz que entrou na fila', () => {
        expect(avisoDoEnvioAutomatico({ ok: true })).toMatch(/na fila/i);
    });

    it('sem telefone → diz o motivo e onde corrigir', () => {
        const t = avisoDoEnvioAutomatico({ ok: false, codigo: 'sem_telefone', mensagem: 'x' });
        expect(t).toMatch(/sem telefone/i);
        expect(t).toMatch(/Fornecedores/);
    });

    it('outro erro → repete a mensagem do servidor', () => {
        expect(avisoDoEnvioAutomatico({ ok: false, codigo: 'nao_usa', mensagem: 'O envio automático está desligado.' }))
            .toContain('O envio automático está desligado.');
    });
});

describe('comando_id reaproveitado depois de erro (revisão final, M6)', () => {
    const gerador = () => {
        let n = 0;
        return () => `cmd-${++n}`;
    };

    it('sem comando guardado → um novo para a chave', () => {
        expect(comandoParaTentativa(null, 'pedido:1', gerador())).toEqual({ chave: 'pedido:1', comandoId: 'cmd-1' });
    });

    it('mesma chave (mesmo texto/pedido) depois de um erro → o MESMO comando_id', () => {
        const g = gerador();
        const primeiro = comandoParaTentativa(null, 'oi', g);
        expect(comandoParaTentativa(primeiro, 'oi', g)).toBe(primeiro);
    });

    it('chave diferente → comando_id novo', () => {
        const g = gerador();
        const primeiro = comandoParaTentativa(null, 'oi', g);
        expect(comandoParaTentativa(primeiro, 'oi, tudo bem?', g)).toEqual({ chave: 'oi, tudo bem?', comandoId: 'cmd-2' });
    });

    it('depois do erro: guarda para reaproveitar, salvo quando o servidor diz que cancelou (nada saiu)', () => {
        const g = { chave: 'oi', comandoId: 'cmd-1' };
        expect(comandoAposErro(g, 'registro_falhou')).toBe(g);
        expect(comandoAposErro(g, null)).toBe(g);
        expect(comandoAposErro(g, undefined)).toBe(g);
        expect(comandoAposErro(g, 'cancelada')).toBeNull();
        expect(comandoAposErro(null, 'cancelada')).toBeNull();
    });
});
