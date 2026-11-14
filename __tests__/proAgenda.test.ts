/**
 * Agenda do ÒPURA Pro (14/11/2026, passo 5 da crítica de design).
 *
 * Antes: serviço SEM data caía em "Hoje" pela data de criação do orçamento;
 * atrasado ia para "Próximos" sem aviso; "Próximos" não era ordenado e parava em 3.
 */
import { describe, it, expect } from 'vitest';
import { separarAgenda } from '../utils/proAgenda';

const AGORA = new Date(2026, 10, 14, 15, 0); // 14/11/2026 15h, horário local
const em = (dia: number, hora = 9) => new Date(2026, 10, dia, hora, 0).toISOString();
const s = (id: string, status: string, data_agendamento?: string, created_at = em(1)) => ({ id, status, data_agendamento, created_at });

describe('separarAgenda', () => {
  it('hoje = agendado para hoje ou em andamento (qualquer data)', () => {
    const r = separarAgenda([s('a', 'PENDENTE', em(14, 8)), s('b', 'EM_ANDAMENTO', em(20))], AGORA);
    expect(r.hoje.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('agendado antes de hoje e não concluído = atrasado (não some em "Próximos")', () => {
    const r = separarAgenda([s('a', 'PENDENTE', em(12)), s('b', 'BLOQUEADO', em(10))], AGORA);
    expect(r.atrasados.map(x => x.id)).toEqual(['b', 'a']);
    expect(r.proximos).toEqual([]);
  });

  it('sem data NÃO cai em "Hoje": vai para "Sem data marcada"', () => {
    const r = separarAgenda([s('a', 'PENDENTE', undefined, em(14, 7))], AGORA);
    expect(r.hoje).toEqual([]);
    expect(r.semData.map(x => x.id)).toEqual(['a']);
  });

  it('próximos em ordem de data, todos (sem corte)', () => {
    const lista = [s('c', 'PENDENTE', em(25)), s('a', 'PENDENTE', em(15)), s('b', 'PENDENTE', em(18)), s('d', 'PENDENTE', em(16)), s('e', 'PENDENTE', em(30))];
    expect(separarAgenda(lista, AGORA).proximos.map(x => x.id)).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('concluído não aparece na agenda', () => {
    const r = separarAgenda([s('a', 'CONCLUIDO', em(14))], AGORA);
    expect([...r.atrasados, ...r.hoje, ...r.proximos, ...r.semData]).toEqual([]);
  });
});
