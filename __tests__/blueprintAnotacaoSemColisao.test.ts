/**
 * 22/10/2026 — pedido com dois prints da planta Garden, elétrica ligada: *"Veja a total confusão de
 * sobreposicões de testos e componentes."* Cada texto elétrico saía a uma distância FIXA do
 * próprio símbolo, sem olhar o vizinho. O motor posiciona TODOS os textos juntos: prioridade
 * primeiro, posição colada ao símbolo quando há lugar, e — decisão do usuário — LINHA DE CHAMADA
 * quando não há (nunca some).
 */
import { describe, expect, it } from 'vitest';
import {
  posicionarAnotacoes,
  type AnotacaoAPosicionar,
  type AnotacaoPosicionada,
  type CaixaNaTela,
} from '../utils/blueprintAnotacaoSemColisao';

const cruza = (a: CaixaNaTela, b: CaixaNaTela) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const caixa = (p: AnotacaoPosicionada, a: AnotacaoAPosicionar): CaixaNaTela => ({ x0: p.x, y0: p.y, x1: p.x + a.largura, y1: p.y + a.altura });
const simbolo = (x: number, y: number, r = 5): CaixaNaTela => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });

function semInterseccao(anots: AnotacaoAPosicionar[], postos: AnotacaoPosicionada[], simbolos: { id: string; caixa: CaixaNaTela }[]) {
  const porId = new Map(anots.map((a) => [a.id, a]));
  const caixas = postos.map((p) => ({ id: p.id, c: caixa(p, porId.get(p.id)!) }));
  for (const a of caixas) {
    for (const b of caixas) if (a.id !== b.id) expect(cruza(a.c, b.c), `${a.id} × ${b.id}`).toBe(false);
    for (const s of simbolos) expect(cruza(a.c, s.caixa), `${a.id} sobre o símbolo ${s.id}`).toBe(false);
  }
}

describe('posicionarAnotacoes — textos da planta sem colisão', () => {
  it('sozinho: o lugar de sempre (acima, à direita, colado) e sem chamada', () => {
    const a: AnotacaoAPosicionar = { id: 'L1', donoId: 'luz', largura: 20, altura: 11, ancora: simbolo(100, 100), prioridade: 1 };
    const [p] = posicionarAnotacoes([a], []);
    expect(p).toEqual({ id: 'L1', x: 105 + 3, y: 95 - 11 });
    expect(p.chamada).toBeUndefined();
  });

  it('a posição preferida vence as padrão quando está livre', () => {
    const a: AnotacaoAPosicionar = { id: 'T', donoId: 't', largura: 20, altura: 11, ancora: simbolo(100, 100), prioridade: 1, preferidas: [{ x: 90, y: 110 }] };
    expect(posicionarAnotacoes([a], [])[0]).toEqual({ id: 'T', x: 90, y: 110 });
  });

  it('dois símbolos colados: os dois textos não se cobrem nem cobrem os símbolos', () => {
    const simbolos = [
      { id: 'a', caixa: simbolo(100, 100) },
      { id: 'b', caixa: simbolo(112, 100) },
    ];
    const anots: AnotacaoAPosicionar[] = simbolos.map((s) => ({ id: `t-${s.id}`, donoId: s.id, largura: 40, altura: 11, ancora: s.caixa, prioridade: 1 }));
    const postos = posicionarAnotacoes(anots, simbolos);
    semInterseccao(anots, postos, simbolos);
  });

  it('a prioridade escolhe primeiro: a pendência fica com o lugar de sempre, a potência procura outro', () => {
    const anc = simbolo(100, 100);
    const potencia: AnotacaoAPosicionar = { id: 'pot', donoId: 'p', largura: 30, altura: 11, ancora: anc, prioridade: 3 };
    const pendencia: AnotacaoAPosicionar = { id: 'pend', donoId: 'p', largura: 30, altura: 11, ancora: anc, prioridade: 0 };
    const postos = posicionarAnotacoes([potencia, pendencia], []);
    expect(postos.find((p) => p.id === 'pend')).toMatchObject({ x: 108, y: 84 });
    expect(postos.find((p) => p.id === 'pot')).not.toMatchObject({ x: 108, y: 84 });
    // A saída mantém a ordem de entrada.
    expect(postos.map((p) => p.id)).toEqual(['pot', 'pend']);
  });

  it('sem lugar colado: afasta e liga ao símbolo por uma linha de chamada', () => {
    // O símbolo cercado por outros oito, colados: nenhuma das posições coladas está livre.
    const centro = simbolo(200, 200);
    const vizinhos: { id: string; caixa: CaixaNaTela }[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) vizinhos.push({ id: `v${i}${j}`, caixa: { x0: 200 + i * 40 - 20, y0: 200 + j * 20 - 10, x1: 200 + i * 40 + 20, y1: 200 + j * 20 + 10 } });
    const a: AnotacaoAPosicionar = { id: 'X', donoId: 'c', largura: 30, altura: 11, ancora: centro, prioridade: 1 };
    const [p] = posicionarAnotacoes([a], [{ id: 'c', caixa: centro }, ...vizinhos]);
    semInterseccao([a], [p], vizinhos);
    expect(p.chamada).toBeDefined();
    // A chamada sai da borda do texto e chega à borda do símbolo.
    const c = caixa(p, a);
    const { de, ate } = p.chamada!;
    expect(de.x >= c.x0 && de.x <= c.x1 && de.y >= c.y0 && de.y <= c.y1).toBe(true);
    expect(ate.x >= centro.x0 && ate.x <= centro.x1 && ate.y >= centro.y0 && ate.y <= centro.y1).toBe(true);
  });

  it('nada livre até o raio máximo: fica no de menor sobreposição — nunca some', () => {
    const a: AnotacaoAPosicionar = { id: 'X', donoId: 'c', largura: 26, altura: 11, ancora: { x0: 100, y0: 100, x1: 110, y1: 110 }, prioridade: 1 };
    const postos = posicionarAnotacoes([a], [{ id: 'muro', caixa: { x0: 0, y0: 0, x1: 300, y1: 300 } }]);
    expect(postos).toHaveLength(1);
    // Empate de sobreposição: a primeira posição, a de sempre, sem chamada.
    expect(postos[0]).toEqual({ id: 'X', x: 113, y: 89 });
  });

  it('o texto pode cruzar um eletroduto (segmento), mas prefere não cruzar', () => {
    const anc = simbolo(100, 100);
    // Um eletroduto horizontal passando logo acima do símbolo: as posições de cima cruzam.
    const seg = { id: 'tr', a: { x: 0, y: 90 }, b: { x: 300, y: 90 } };
    const a: AnotacaoAPosicionar = { id: 'X', donoId: 's', largura: 30, altura: 11, ancora: anc, prioridade: 1 };
    const [p] = posicionarAnotacoes([a], [], { segmentos: [seg] });
    const c = caixa(p, a);
    expect(c.y0 > 90 || c.y1 < 90).toBe(true);
    expect(p.chamada).toBeUndefined();
    // Cercado por eletrodutos dos dois lados, fica colado mesmo cruzando um (melhor que afastar).
    const cerco = [seg, { id: 'tr2', a: { x: 0, y: 110 }, b: { x: 300, y: 110 } }, { id: 'tr3', a: { x: 90, y: 0 }, b: { x: 90, y: 300 } }, { id: 'tr4', a: { x: 110, y: 0 }, b: { x: 110, y: 300 } }];
    const [q] = posicionarAnotacoes([a], [], { segmentos: cerco });
    expect(q.chamada).toBeUndefined();
  });

  it('caso denso: 20 pontos numa fileira apertada, nenhum texto cobre outro nem um símbolo', () => {
    const simbolos = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, caixa: simbolo(100 + (i % 5) * 18, 100 + Math.floor(i / 5) * 18) }));
    const anots: AnotacaoAPosicionar[] = simbolos.flatMap((s, i) => [
      { id: `c${i}`, donoId: s.id, largura: 34, altura: 11, ancora: s.caixa, prioridade: 1 },
      { id: `p${i}`, donoId: s.id, largura: 42, altura: 11, ancora: s.caixa, prioridade: 3 },
    ]);
    const postos = posicionarAnotacoes(anots, simbolos, { raioMaximo: 400 });
    semInterseccao(anots, postos, simbolos);
  });

  it('determinístico: a mesma entrada dá a mesma saída', () => {
    const simbolos = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, caixa: simbolo(50 + i * 9, 80 + (i % 3) * 7) }));
    const anots: AnotacaoAPosicionar[] = simbolos.map((s, i) => ({ id: `t${i}`, donoId: s.id, largura: 28, altura: 10, ancora: s.caixa, prioridade: i % 3 }));
    expect(posicionarAnotacoes(anots, simbolos)).toEqual(posicionarAnotacoes(anots, simbolos));
  });
});
