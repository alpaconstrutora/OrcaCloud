import { describe, it, expect } from 'vitest';
import { agruparHistorico, chavePorDia } from '../utils/historicoGrupos';

type L = { id: string; created_at: string; entidade: string; acao: string; origem: string; usuario: string };
const leitor = {
  data: (l: L) => l.created_at,
  entidade: (l: L) => l.entidade,
  acao: (l: L) => l.acao,
  origem: (l: L) => l.origem,
  usuario: (l: L) => l.usuario,
};
// Meio-dia local: o dia não depende do fuso de quem roda o teste.
const dia = (d: string) => new Date(`${d}T12:00:00`).toISOString();
const LOGS: L[] = [
  { id: '1', created_at: dia('2026-11-20'), entidade: 'Unidade', acao: 'Alterou', origem: 'Manual', usuario: 'ana@x' },
  { id: '2', created_at: dia('2026-11-21'), entidade: 'Torre', acao: 'Criou', origem: 'Planta Inteligente', usuario: 'Sistema' },
  { id: '3', created_at: dia('2026-11-21'), entidade: 'Unidade', acao: 'Alterou', origem: 'Manual', usuario: 'ANA@x' },
];

describe('agruparHistorico', () => {
  it('por dia: cronológico em Crescente, invertido em Decrescente', () => {
    expect(agruparHistorico(LOGS, 'dia', 'asc', leitor).map(g => [g.label, g.itens.length])).toEqual([['20/11/2026', 1], ['21/11/2026', 2]]);
    expect(agruparHistorico(LOGS, 'dia', 'desc', leitor).map(g => g.label)).toEqual(['21/11/2026', '20/11/2026']);
  });
  it('por entidade: rótulo da célula, A→Z', () => {
    expect(agruparHistorico(LOGS, 'entidade', 'asc', leitor).map(g => [g.label, g.itens.length])).toEqual([['Torre', 1], ['Unidade', 2]]);
  });
  it('por usuário: e-mails que só diferem na caixa caem juntos', () => {
    expect(agruparHistorico(LOGS, 'usuario', 'asc', leitor).map(g => g.itens.length).sort()).toEqual([1, 2]);
  });
  it('data inválida vai para "Sem data", no fim', () => {
    expect(chavePorDia('x')).toBeNull();
    const g = agruparHistorico([...LOGS, { ...LOGS[0], id: '4', created_at: '' }], 'dia', 'desc', leitor);
    expect(g[g.length - 1].label).toBe('Sem data');
  });
});
