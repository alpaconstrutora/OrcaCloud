/**
 * Geometria do canvas da Torre de Controle (utils/p2pLayout.ts) — B.2 de
 * docs/planos/2026-10-16-torre-p2p-processo-visual.md.
 *
 * O que este arquivo trava: posições determinísticas e sem sobreposição; a
 * caixa do grupo contém os seus nós; o caminho ortogonal começa na borda
 * direita de A, termina na borda esquerda de B e o rótulo cai entre as duas
 * colunas; a topologia liga nós existentes e só `solicitacao` não tem entrada.
 */
import { describe, it, expect } from 'vitest';
import {
  posicoesDosNos, caixaDoGrupo, caminhoOrtogonal, tamanhoDoDesenho, sobrepoe, enquadrarDesenho, NODE_W, NODE_H,
} from '../utils/p2pLayout';
import { DEFINICAO_DAS_ARESTAS, P2P_GROUPS, EDGE_EVENT_KEYS, STAGE_EVENT_KEYS } from '../services/p2pFlowService';

const IDS = ['solicitacao', 'cotacao', 'pedido', 'recebimento', 'estoque', 'fiscal', 'financeiro', 'pagamento'];

describe('p2pLayout — posições', () => {
  it('é determinístico e nenhum par de nós se sobrepõe', () => {
    const a = posicoesDosNos(IDS);
    const b = posicoesDosNos(IDS);
    expect(a).toEqual(b);
    for (const id of IDS) expect(a[id]).toMatchObject({ w: NODE_W, h: NODE_H });
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        expect(sobrepoe(a[IDS[i]], a[IDS[j]])).toBe(false);
      }
    }
  });

  it('Estoque e Nota Fiscal ficam na MESMA coluna, uma acima da outra; o Recebimento à esquerda delas, centrado', () => {
    const p = posicoesDosNos(IDS);
    expect(p.estoque.x).toBe(p.fiscal.x);
    expect(p.estoque.y).toBeLessThan(p.fiscal.y);
    expect(p.recebimento.x).toBeLessThan(p.estoque.x);
    const centroReceb = p.recebimento.y + p.recebimento.h / 2;
    expect(centroReceb).toBeGreaterThan(p.estoque.y);
    expect(centroReceb).toBeLessThan(p.fiscal.y + p.fiscal.h);
  });

  it('id desconhecido ganha uma posição de reserva, visível e sem sobrepor os conhecidos', () => {
    const p = posicoesDosNos(['pedido', 'fiscal', 'inventado']);
    expect(p.inventado).toBeDefined();
    expect(sobrepoe(p.inventado, p.pedido)).toBe(false);
    expect(sobrepoe(p.inventado, p.fiscal)).toBe(false);
    const t = tamanhoDoDesenho(p);
    expect(p.inventado.x + p.inventado.w).toBeLessThanOrEqual(t.w);
    expect(p.inventado.y + p.inventado.h).toBeLessThanOrEqual(t.h);
  });
});

describe('p2pLayout — grupos', () => {
  it('a caixa de cada grupo contém todos os seus nós, e grupo sem nó no desenho devolve null', () => {
    const p = posicoesDosNos(IDS);
    for (const g of P2P_GROUPS) {
      const caixa = caixaDoGrupo(g.nodeIds, p)!;
      expect(caixa).not.toBeNull();
      for (const id of g.nodeIds) {
        const r = p[id];
        expect(r.x).toBeGreaterThanOrEqual(caixa.x);
        expect(r.y).toBeGreaterThanOrEqual(caixa.y);
        expect(r.x + r.w).toBeLessThanOrEqual(caixa.x + caixa.w);
        expect(r.y + r.h).toBeLessThanOrEqual(caixa.y + caixa.h);
      }
    }
    expect(caixaDoGrupo(['nao-existe'], p)).toBeNull();
  });

  it('as caixas dos grupos não se sobrepõem', () => {
    const p = posicoesDosNos(IDS);
    const caixas = P2P_GROUPS.map(g => caixaDoGrupo(g.nodeIds, p)!);
    for (let i = 0; i < caixas.length; i++) {
      for (let j = i + 1; j < caixas.length; j++) expect(sobrepoe(caixas[i], caixas[j])).toBe(false);
    }
  });
});

describe('p2pLayout — caminho ortogonal', () => {
  it('mesma linha → traço reto da borda direita de A à borda esquerda de B, rótulo no meio', () => {
    const p = posicoesDosNos(IDS);
    const { d, meio } = caminhoOrtogonal(p.pedido, p.recebimento);
    const x0 = p.pedido.x + p.pedido.w;
    const y0 = p.pedido.y + p.pedido.h / 2;
    expect(d).toBe(`M ${x0} ${y0} H ${p.recebimento.x}`);
    expect(meio.x).toBeGreaterThan(x0);
    expect(meio.x).toBeLessThan(p.recebimento.x);
    expect(meio.y).toBe(y0);
  });

  it('linhas diferentes → H V H, com x crescente e o degrau antes da curva', () => {
    const p = posicoesDosNos(IDS);
    const { d, meio } = caminhoOrtogonal(p.recebimento, p.fiscal);
    const m = d.match(/^M (\S+) (\S+) H (\S+) V (\S+) H (\S+)$/);
    expect(m).not.toBeNull();
    const [, x0, y0, xm, y1, x1] = m!.map(Number);
    expect(x0).toBe(p.recebimento.x + p.recebimento.w);
    expect(y0).toBe(p.recebimento.y + p.recebimento.h / 2);
    expect(x1).toBe(p.fiscal.x);
    expect(y1).toBe(p.fiscal.y + p.fiscal.h / 2);
    expect(xm).toBeGreaterThanOrEqual(x0 + 24);
    expect(xm).toBeLessThan(x1);
    expect(meio).toEqual({ x: (x0 + xm) / 2, y: y0 });
  });
});

describe('p2pLayout — topologia do serviço', () => {
  it('toda aresta liga nós conhecidos, só solicitacao fica sem entrada, e os eventos de aresta vêm dos nós emissores', () => {
    const ids = new Set(IDS);
    for (const e of DEFINICAO_DAS_ARESTAS) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
    const semEntrada = IDS.filter(id => !DEFINICAO_DAS_ARESTAS.some(e => e.to === id));
    expect(semEntrada).toEqual(['solicitacao']);
    // cada nó tem no máximo UMA entrada — é o que deixa `inboundSeam` ser herdado sem combinar costuras
    for (const id of IDS) expect(DEFINICAO_DAS_ARESTAS.filter(e => e.to === id).length).toBeLessThanOrEqual(1);
    for (const [id, keys] of Object.entries(EDGE_EVENT_KEYS)) {
      const [from] = id.split('->');
      expect(DEFINICAO_DAS_ARESTAS.some(e => `${e.from}->${e.to}` === id)).toBe(true);
      expect(keys).toEqual(STAGE_EVENT_KEYS[from]);
    }
    // todo grupo só nomeia nós do desenho e todo nó está em exatamente um grupo
    const emGrupos = P2P_GROUPS.flatMap(g => g.nodeIds);
    expect([...emGrupos].sort()).toEqual([...IDS].sort());
  });
});

describe('p2pLayout — enquadrar', () => {
  it('desenho mais largo que a área sai com escala < 1 e centrado; área vazia devolve a vista neutra', () => {
    const v = enquadrarDesenho({ w: 2000, h: 500 }, { w: 1000, h: 600 }, { min: 0.25, max: 2 });
    expect(v.escala).toBeCloseTo(0.5);
    expect(v.dx).toBeCloseTo(0);
    expect(v.dy).toBeCloseTo((600 - 250) / 2);
    expect(enquadrarDesenho({ w: 2000, h: 500 }, { w: 0, h: 0 }, { min: 0.25, max: 2 })).toEqual({ escala: 1, dx: 0, dy: 0 });
    // nunca passa do máximo: desenho pequeno numa área grande não vira lupa
    expect(enquadrarDesenho({ w: 100, h: 100 }, { w: 1000, h: 1000 }, { min: 0.25, max: 2 }).escala).toBe(2);
  });

  it('com piso legível, não desce abaixo dele: abre alinhado ao início (dx = 0) e centrado na vertical', () => {
    const v = enquadrarDesenho({ w: 2000, h: 400 }, { w: 700, h: 560 }, { min: 0.35, max: 2, legivel: 0.7 });
    expect(v.escala).toBe(0.7);
    expect(v.dx).toBe(0);
    expect(v.dy).toBeCloseTo((560 - 280) / 2);
    // quando cabe acima do piso, o piso não interfere
    expect(enquadrarDesenho({ w: 500, h: 400 }, { w: 700, h: 560 }, { min: 0.35, max: 2, legivel: 0.7 }).escala).toBeCloseTo(1.4);
  });
});

describe('p2pLayout — mapa de células por fluxo (16/10/2026, Torre do Financeiro)', () => {
  it('aceita o mapa do fluxo; sem mapa usa o do P2P (comportamento antigo)', () => {
    const celulas = { a: { col: 0, linha: 0 }, b: { col: 2, linha: 3 } };
    const p = posicoesDosNos(['a', 'b'], celulas);
    expect(p.b.x).toBeGreaterThan(p.a.x);
    expect(p.b.y).toBeGreaterThan(p.a.y);
    expect(posicoesDosNos(IDS)).toEqual(posicoesDosNos(IDS, undefined));
  });

  it('a linha de reserva fica abaixo da mais baixa DO MAPA usado, não numa linha fixa', () => {
    const celulas = { a: { col: 0, linha: 0 }, b: { col: 1, linha: 3.5 } };
    const p = posicoesDosNos(['a', 'b', 'inventado'], celulas);
    expect(p.inventado.y).toBeGreaterThanOrEqual(p.b.y + p.b.h);
    expect(sobrepoe(p.inventado, p.a)).toBe(false);
    expect(sobrepoe(p.inventado, p.b)).toBe(false);
  });
});
