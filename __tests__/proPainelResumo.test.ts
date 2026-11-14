/**
 * Números e listas do painel do ÒPURA Pro (14/11/2026, passo 2 da crítica de design).
 *
 * Antes: "Faturamento" somava o CONCLUÍDO (sem saber se foi pago) e "A receber"
 * somava o que ainda NÃO terminou — deixando de fora justamente o concluído não
 * pago, que é o dinheiro que o autônomo precisa ir buscar.
 */
import { describe, it, expect } from 'vitest';
import { resumirPainelPro, diasDesde, mensagemDeCobranca, linkWhatsApp } from '../utils/proPainelResumo';

const AGORA = new Date('2026-11-14T15:00:00-04:00');

const serv = (p: Partial<any>) => ({
  id: p.id ?? 's',
  orcamento_id: p.orcamento_id ?? 'o',
  status: p.status ?? 'PENDENTE',
  concluido_em: p.concluido_em ?? null,
  pago_em: p.pago_em ?? null,
  forma_pagamento: p.forma_pagamento ?? null,
  pro_orcamentos: { valor: p.valor ?? 100 },
});

describe('resumirPainelPro', () => {
  it('Recebido no mês soma só os pagos neste mês (pela data de recebimento)', () => {
    const r = resumirPainelPro([
      serv({ id: 'a', status: 'CONCLUIDO', valor: 300, pago_em: '2026-11-03T10:00:00-04:00', forma_pagamento: 'PIX' }),
      serv({ id: 'b', status: 'CONCLUIDO', valor: 200, pago_em: '2026-10-30T10:00:00-04:00', forma_pagamento: 'DINHEIRO' }),
    ], [], AGORA);
    expect(r.recebidoNoMes).toBe(300);
  });

  it('A receber = concluído e ainda não pago', () => {
    const r = resumirPainelPro([
      serv({ id: 'a', status: 'CONCLUIDO', valor: 350, concluido_em: '2026-11-10T10:00:00-04:00' }),
      serv({ id: 'b', status: 'CONCLUIDO', valor: 100, pago_em: '2026-11-10T10:00:00-04:00', forma_pagamento: 'PIX' }),
      serv({ id: 'c', status: 'EM_ANDAMENTO', valor: 999 }),
    ], [], AGORA);
    expect(r.aReceber).toBe(350);
    expect(r.aguardandoPagamento.map(s => s.id)).toEqual(['a']);
  });

  it('Em execução = pendente, em andamento e bloqueado + orçamento aprovado ainda sem OS', () => {
    const r = resumirPainelPro(
      [
        serv({ id: 'a', orcamento_id: 'o1', status: 'PENDENTE', valor: 100 }),
        serv({ id: 'b', orcamento_id: 'o2', status: 'EM_ANDAMENTO', valor: 200 }),
        serv({ id: 'c', orcamento_id: 'o3', status: 'BLOQUEADO', valor: 50 }),
        serv({ id: 'd', orcamento_id: 'o4', status: 'CONCLUIDO', valor: 1000 }),
      ],
      [
        { id: 'o5', status: 'APROVADO', valor: 400 },
        { id: 'o1', status: 'APROVADO', valor: 100 }, // já tem OS: não conta de novo
        { id: 'o6', status: 'ENVIADO', valor: 700 },  // ainda não fechado: não conta
      ],
      AGORA,
    );
    expect(r.emExecucao).toBe(750);
  });

  it('aguardando pagamento vem do mais antigo para o mais novo, sem corte', () => {
    const lista = Array.from({ length: 5 }, (_, i) =>
      serv({ id: `s${i}`, status: 'CONCLUIDO', concluido_em: `2026-11-0${5 - i}T10:00:00-04:00` }));
    const r = resumirPainelPro(lista, [], AGORA);
    expect(r.aguardandoPagamento.map(s => s.id)).toEqual(['s4', 's3', 's2', 's1', 's0']);
  });

  it('valor ausente conta como zero, nunca NaN', () => {
    const r = resumirPainelPro([{ ...serv({ status: 'CONCLUIDO' }), pro_orcamentos: null }], [], AGORA);
    expect(r.aReceber).toBe(0);
  });
});

describe('diasDesde', () => {
  // Datas no fuso LOCAL de quem roda: "dias" é o calendário do aparelho do profissional.
  it('conta dias de calendário; sem data devolve null', () => {
    const agoraLocal = new Date(2026, 10, 14, 15, 0);
    expect(diasDesde(new Date(2026, 10, 14, 8, 0).toISOString(), agoraLocal)).toBe(0);
    expect(diasDesde(new Date(2026, 10, 11, 23, 0).toISOString(), agoraLocal)).toBe(3);
    expect(diasDesde(null, agoraLocal)).toBeNull();
  });
});

describe('mensagemDeCobranca', () => {
  it('leva valor e, quando houver, o Pix Copia e Cola', () => {
    const m = mensagemDeCobranca({ cliente: 'Ana', descricao: 'Limpeza de split', valor: 350, pixCopiaECola: '000201ABC' });
    expect(m).toContain('Ana');
    expect(m).toContain('R$');
    expect(m).toContain('350,00');
    expect(m).toContain('000201ABC');
  });

  it('sem Pix, não promete código', () => {
    const m = mensagemDeCobranca({ cliente: 'Ana', descricao: 'Limpeza', valor: 350, pixCopiaECola: '' });
    expect(m).not.toMatch(/copia e cola/i);
  });
});

describe('linkWhatsApp', () => {
  it('põe 55 em número com DDD e codifica a mensagem', () => {
    expect(linkWhatsApp('(65) 99999-0000', 'olá & tchau')).toBe('https://wa.me/5565999990000?text=ol%C3%A1%20%26%20tchau');
  });
  it('número já com 55 fica como está', () => {
    expect(linkWhatsApp('5565999990000', 'x')).toBe('https://wa.me/5565999990000?text=x');
  });
});
