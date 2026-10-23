// @vitest-environment jsdom
/**
 * 22/10/2026 — pedido com dois prints da planta Garden, elétrica ligada: *"Veja a total confusão de
 * sobreposicões de testos e componentes."* A cena do print num canto de cozinha: a luz do teto, o
 * interruptor ao lado da porta e três tomadas coladas na mesma parede — duas SUGERIDAS, com a
 * instrução "Posicione sobre a bancada da pia". Antes, cada texto ia a uma distância fixa do próprio
 * símbolo e caíam uns sobre os outros. Contexto 2D falso por Proxy que grava as chamadas (molde:
 * `BlueprintCanvasRotulosDasPecas.test.tsx`).
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BlueprintCanvas from '../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { EXIBICAO_ELETRICA_PADRAO, type ExibicaoEletrica, type ItemEletrico } from '../../utils/preferencias/resolver';

const INSTRUCAO = 'Posicione sobre a bancada da pia';

function cena(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  m = applyCommand(m, { type: 'AddWall', levelId, a: point(0, 0), b: point(4000, 0), thicknessMm: 150, heightMm: 2800 }).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(-2000, 1500), cotaMm: 1600 }).model;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C1', tensaoV: 127 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C2', tensaoV: 127 }).model;
  const [c1, c2] = m.circuitos.map((c) => c.id);
  const pontos: [Command, string][] = [
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(1500, 500), cotaMm: 2800, potenciaW: 100, comando: 'a' } as Command, c1],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Int', tipoEletrico: 'INTERRUPTOR', interruptor: 'UMA_SECAO', comando: 'a', at: point(1250, 75), cotaMm: 1100 } as Command, c1],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1450, 75), cotaMm: 1100, potenciaW: 600, sugerida: true, rotulo: INSTRUCAO } as Command, c2],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1600, 75), cotaMm: 300, potenciaW: 100 } as Command, c2],
    [{ type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(1750, 75), cotaMm: 1100, potenciaW: 600, sugerida: true, rotulo: INSTRUCAO } as Command, c2],
  ];
  for (const [cmd, circuitoId] of pontos) {
    m = applyCommand(m, cmd).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais![m.terminais!.length - 1].id, circuitoId }).model;
  }
  return m;
}

/**
 * A cena da cozinha + a REDE: três eletrodutos com circuitos (um com dois circuitos de seções
 * diferentes → seção por grupo; um CHEIO, com 8 condutores → círculo numerado e "8 cond."; um de
 * Ø 32, o diferente do predominante → o Ø escrito), uma luz e uma tomada SEM circuito (a pendência).
 */
function cenaComRede(): BlueprintModel {
  let m = cena();
  const levelId = m.levels[0].id;
  const quadroId = m.quadros[0].id;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C7', tensaoV: 127, ligacao: 'FN', secaoMm2: 2.5 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId, nome: 'C9', tensaoV: 127, ligacao: 'FN', secaoMm2: 6 }).model;
  const c7 = m.circuitos[m.circuitos.length - 2].id;
  const c9 = m.circuitos[m.circuitos.length - 1].id;
  const trecho = (y: number, x1: number, bitolaMm: number, circuitoIds: string[], condutores?: number): Command =>
    ({ type: 'AddTrecho', levelId, disciplina: 'ELETRICA', a: point(200, y), b: point(x1, y), cotaAMm: 2800, cotaBMm: 2800, bitolaMm, circuitoIds, condutores }) as Command;
  m = applyBatch(m, [trecho(1000, 3000, 25, [c7, c9]), trecho(1300, 3000, 25, [c7], 8), trecho(1600, 1700, 32, [c7])]).model;
  // Sem circuito: uma luz (rótulo "?") e uma tomada (bloco "-?-" + "200 VA").
  m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(2800, 500), cotaMm: 2800, potenciaW: 150 } as Command).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo: 'TUG', tipoEletrico: 'TUG', at: point(2500, 75), cotaMm: 1100, potenciaW: 200 } as Command).model;
  return m;
}

describe('BlueprintCanvas · os textos elétricos sem colisão', () => {
  type Chamada = { metodo: string; args: unknown[]; base?: unknown; fonte?: unknown };
  let chamadas: Chamada[] = [];
  const original = HTMLCanvasElement.prototype.getContext;
  const medidas = ['clientWidth', 'clientHeight'] as const;
  const medidasOriginais = medidas.map((k) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, k));

  beforeEach(() => {
    chamadas = [];
    // jsdom mede tudo 0 × 0, e o canvas com 0 × 0 ignora a navegação (o zoom): 800 × 600, como no app.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const estado: Record<string | symbol, unknown> = {};
    const ctx: unknown = new Proxy(estado, {
      get(alvo, prop) {
        if (prop in alvo) return alvo[prop];
        if (prop === 'canvas') return { width: 800, height: 600 };
        if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 });
        if (prop === 'getLineDash') return () => [];
        if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args: unknown[]) => {
          chamadas.push({ metodo: String(prop), args, base: alvo.textBaseline, fonte: alvo.font });
          return { addColorStop() {}, setTransform() {} };
        };
      },
      set(alvo, prop, valor) {
        alvo[prop] = valor;
        return true;
      },
    });
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
    medidas.forEach((k, i) => {
      const d = medidasOriginais[i];
      if (d) Object.defineProperty(HTMLElement.prototype, k, d);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
    });
  });

  /** Os textos do ÚLTIMO quadro (depois do último `clearRect`), com a caixa de cada um. */
  function textosDoUltimoQuadro(escala: number, extra: { modelo?: BlueprintModel; exibicao?: ExibicaoEletrica; mostrarCircuitos?: boolean } = {}) {
    cleanup();
    chamadas = [];
    const m = extra.modelo ?? cena();
    const canvas = (navegacao: React.ComponentProps<typeof BlueprintCanvas>['navegacao']) => (
      <BlueprintCanvas
        model={m}
        tool="selecionar"
        levelId={m.levels[0].id}
        selectedIds={[]}
        onSelecionar={() => {}}
        onAddWall={() => {}}
        onAddOpening={() => {}}
        onDelete={() => {}}
        larguraAberturaMm={900}
        espessuraMm={150}
        passoGradeMm={200}
        escala={0.05}
        dx={0}
        dy={0}
        navegacao={navegacao}
        {...(extra.exibicao ? { exibicaoEletrica: extra.exibicao } : {})}
        {...(extra.mostrarCircuitos != null ? { mostrarCircuitos: extra.mostrarCircuitos } : {})}
      />
    );
    // ⚠️ A vista é do PRÓPRIO canvas (começa em 0,05 px/mm; a prop `escala` não a muda): o zoom vem
    // pela navegação, como na barra — centralizar com escala mínima para aproximar, "zoom −" para afastar.
    const { rerender } = render(canvas(escala >= 0.05 ? { seq: 1, acao: 'CENTRALIZAR', em: point(1500, 300), escalaMinima: escala } : null));
    for (let e = 0.05, seq = 1; e > escala; e /= 1.25) rerender(canvas({ seq: seq++, acao: 'ZOOM_MENOS' }));
    const inicio = chamadas.map((c) => c.metodo).lastIndexOf('clearRect');
    return chamadas
      .slice(inicio)
      .filter((c) => c.metodo === 'fillText')
      .map((c) => {
        const [texto, x, y] = c.args as [string, number, number];
        const h = Number(/(\d+)px/.exec(String(c.fonte))?.[1] ?? 11);
        const w = texto.length * 7;
        const caixa = c.base === 'top' ? { x0: x, y0: y, x1: x + w, y1: y + h } : c.base === 'middle' ? { x0: x, y0: y - h / 2, x1: x + w, y1: y + h / 2 } : { x0: x, y0: y - h, x1: x + w, y1: y };
        return { texto, caixa, base: c.base };
      });
  }

  const cruza = (a: { x0: number; y0: number; x1: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  for (const escala of [0.08, 0.2]) {
    it(`⚠️ PRONTO QUANDO: no zoom ${escala} px/mm, nenhum texto da luz, do interruptor e das tomadas cobre outro`, () => {
      const textos = textosDoUltimoQuadro(escala);
      // Os textos dos pontos — qualquer que seja a linha de base (o desenho antigo usava a alfabética
      // e a 'middle'; o motor escreve com 'top'): circuito, potência, instrução, comando.
      const nossos = textos.filter((t) => ['C1', 'Luz teto · C1', 'Int · C1', '-2-', '600 VA', '100 VA', INSTRUCAO, 'a'].includes(t.texto));
      for (let i = 0; i < nossos.length; i++)
        for (let j = i + 1; j < nossos.length; j++) expect(cruza(nossos[i].caixa, nossos[j].caixa), `"${nossos[i].texto}" × "${nossos[j].texto}"`).toBe(false);
      expect(nossos.map((t) => t.texto)).toEqual(expect.arrayContaining(['C1', 'Int · C1', '-2-', '600 VA', '100 VA', INSTRUCAO, 'a']));
    });
  }

  it('⚠️ 22/10/2026 (decisão do usuário): no zoom do lote inteiro (< 0,02 px/mm) os textos elétricos não se escrevem; ao aproximar, voltam', () => {
    const longe = textosDoUltimoQuadro(0.01).map((t) => t.texto);
    for (const x of ['C1', 'Int · C1', '-2-', '600 VA', INSTRUCAO]) expect(longe).not.toContain(x);
    chamadas = [];
    const perto = textosDoUltimoQuadro(0.08).map((t) => t.texto);
    for (const x of ['C1', 'Int · C1', '-2-', '600 VA', INSTRUCAO]) expect(perto).toContain(x);
    // E o zoom MUDOU de verdade: os símbolos (interruptor a 1250 mm, tomada a 1750 mm) se afastam na
    // tela na proporção do zoom. Mede-se pelos centros dos `arc` do último quadro, não pelos textos —
    // esses o motor afasta justamente quando falta lugar.
    const espalhamento = (escala: number) => {
      chamadas = [];
      textosDoUltimoQuadro(escala);
      const inicio = chamadas.map((c) => c.metodo).lastIndexOf('clearRect');
      const xs = chamadas.slice(inicio).filter((c) => c.metodo === 'arc').map((c) => Number(c.args[0]));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(espalhamento(0.4)).toBeGreaterThan(espalhamento(0.08) * 2);
  });

  it('a luminária escreve só o circuito ("C1"), não "Luz teto · C1"', () => {
    const textos = textosDoUltimoQuadro(0.2).map((t) => t.texto);
    expect(textos).toContain('C1');
    expect(textos.some((t) => t.startsWith('Luz teto'))).toBe(false);
  });

  it('a sugerida mantém a instrução, uma por tomada', () => {
    const textos = textosDoUltimoQuadro(0.2).map((t) => t.texto);
    expect(textos.filter((t) => t === INSTRUCAO)).toHaveLength(2);
  });

  // ── As preferências da planta elétrica (23/10/2026): cada item corta só o SEU texto ──────────────

  /** Os textos do último quadro, contados (um mesmo texto pode sair mais de uma vez). */
  function contagem(textos: { texto: string }[]): Map<string, number> {
    const mapa = new Map<string, number>();
    for (const t of textos) mapa.set(t.texto, (mapa.get(t.texto) ?? 0) + 1);
    return mapa;
  }
  /** O que SUMIU entre dois quadros, ordenado (um texto repetido tantas vezes quantas sumiu). */
  function sumiu(antes: Map<string, number>, depois: Map<string, number>): string[] {
    const fora: string[] = [];
    for (const [t, n] of antes) for (let i = 0; i < n - (depois.get(t) ?? 0); i++) fora.push(t);
    return fora.sort();
  }

  const sem = (item: ItemEletrico): ExibicaoEletrica => ({ ...EXIBICAO_ELETRICA_PADRAO, [item]: false });

  /**
   * Tabela: item desligado → exatamente os textos que somem na `cenaComRede` (zoom 0,2). "?" e "-?-"
   * nunca estão aqui: a pendência não some.
   */
  const SOME_COM: Record<ItemEletrico, string[]> = {
    // o número no círculo do trecho cheio ("1") + os dependentes: circuito nos fios, bitola, "8 cond."
    fios: ['1', '2,5', '2,5', '6', '7', '7', '9', '8 cond.'],
    circuitoNosFios: ['7', '7', '9'],
    bitola: ['2,5', '2,5', '6'],
    diametro: ['Ø 32'],
    circuitoNoPonto: ['-2-', '-2-', '-2-', 'C1', 'Int · C1'],
    potencia: ['100', '100 VA', '150', '200 VA', '600 VA', '600 VA'],
    comando: ['a', 'a'],
    instrucaoSugerida: [INSTRUCAO, INSTRUCAO],
    condutoresDoTrecho: ['8 cond.'],
  };

  it('cena de partida: os textos da rede estão todos escritos (a tabela abaixo parte disto)', () => {
    const base = contagem(textosDoUltimoQuadro(0.2, { modelo: cenaComRede() }));
    for (const x of ['7', '9', '2,5', '6', '1', '8 cond.', 'Ø 32', '-?-', '?', '200 VA', '150', 'a', INSTRUCAO]) expect(base.has(x), x).toBe(true);
  });

  for (const item of Object.keys(SOME_COM) as ItemEletrico[]) {
    it(`⚠️ "${item}" desligado: somem só os textos dele, nada aparece, a pendência fica`, () => {
      const modelo = cenaComRede();
      const antes = contagem(textosDoUltimoQuadro(0.2, { modelo }));
      const depois = contagem(textosDoUltimoQuadro(0.2, { modelo, exibicao: sem(item) }));
      expect(sumiu(antes, depois)).toEqual([...SOME_COM[item]].sort());
      expect(sumiu(depois, antes)).toEqual([]);
      expect(depois.get('-?-')).toBe(antes.get('-?-'));
      expect(depois.get('?')).toBe(antes.get('?'));
    });
  }

  it('"fios" desligado: os traços e o círculo do trecho cheio não se desenham', () => {
    const modelo = cenaComRede();
    const contar = (exibicao?: ExibicaoEletrica) => {
      textosDoUltimoQuadro(0.2, { modelo, exibicao });
      const q = chamadas.slice(chamadas.map((c) => c.metodo).lastIndexOf('clearRect'));
      return { linhas: q.filter((c) => c.metodo === 'lineTo').length, arcos: q.filter((c) => c.metodo === 'arc').length };
    };
    const ligado = contar();
    const desligado = contar(sem('fios'));
    expect(desligado.linhas).toBeLessThan(ligado.linhas);
    expect(desligado.arcos).toBe(ligado.arcos - 1);
  });

  it('o objeto CRU também vale: "fios" desligado com "circuito nos fios" e "bitola" ligados não escreve nenhum dos dois', () => {
    const modelo = cenaComRede();
    const depois = contagem(textosDoUltimoQuadro(0.2, { modelo, exibicao: { ...EXIBICAO_ELETRICA_PADRAO, fios: false, circuitoNosFios: true, bitola: true } }));
    for (const x of ['7', '9', '2,5', '6', '8 cond.']) expect(depois.has(x), x).toBe(false);
  });

  it('a chave geral "Circuito nos pontos" manda: desligada, nada elétrico se escreve, mesmo com tudo ligado nas preferências', () => {
    const textos = textosDoUltimoQuadro(0.2, { modelo: cenaComRede(), exibicao: EXIBICAO_ELETRICA_PADRAO, mostrarCircuitos: false }).map((t) => t.texto);
    for (const x of ['7', '2,5', '8 cond.', 'Ø 32', '-?-', '?', 'C1', '600 VA', '200 VA', INSTRUCAO]) expect(textos).not.toContain(x);
  });

  it('⚠️ pendência nunca some: com "circuito no ponto" desligado, a luz sem circuito segue escrevendo "?" e a tomada, "-?-"', () => {
    const textos = contagem(textosDoUltimoQuadro(0.2, { modelo: cenaComRede(), exibicao: sem('circuitoNoPonto') }));
    expect(textos.get('?')).toBe(1);
    expect(textos.get('-?-')).toBe(1);
    expect(textos.has('C1')).toBe(false);
  });

  it('bloco da tomada sem nenhuma linha ligada não se anota (sem circuito, potência nem instrução)', () => {
    const exibicao = { ...EXIBICAO_ELETRICA_PADRAO, circuitoNoPonto: false, potencia: false, instrucaoSugerida: false };
    const textos = textosDoUltimoQuadro(0.2, { exibicao }).map((t) => t.texto);
    for (const x of ['-2-', '600 VA', '100 VA', INSTRUCAO]) expect(textos).not.toContain(x);
  });

  it('⚠️ tudo no padrão: o desenho é IDÊNTICO ao de antes das preferências (mesmas chamadas ao canvas)', () => {
    const modelo = cenaComRede();
    const assinatura = () => {
      const q = chamadas.slice(chamadas.map((c) => c.metodo).lastIndexOf('clearRect'));
      return { n: q.length, sha: createHash('sha1').update(JSON.stringify(q.map((c) => [c.metodo, c.args]))).digest('hex') };
    };
    const textosSemProp = textosDoUltimoQuadro(0.2, { modelo }).map((t) => t.texto);
    const semProp = assinatura();
    textosDoUltimoQuadro(0.2, { modelo, exibicao: EXIBICAO_ELETRICA_PADRAO });
    expect(assinatura()).toEqual(semProp);
    // E igual ao que o desenho produzia ANTES desta tarefa (o registro foi tirado do código sem a prop).
    expect({ textos: textosSemProp, ...semProp }).toMatchSnapshot();
  });
});
