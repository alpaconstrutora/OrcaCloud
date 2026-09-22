// utils/emendaDeParedes.ts
//
// Emendar paredes COLINEARES com um buraco entre elas — e dizer o que o buraco é.
//
// ─── POR QUE ISTO É UM MÓDULO PRÓPRIO ────────────────────────────────────────
//
// Nasceu na importação COLLADA (P2.29): um vão de piso a teto não deixa face
// nenhuma na malha, e o reconhecimento devolve duas paredes na mesma reta com
// um buraco. A importação DXF (P2.33) tem o MESMO buraco por outro motivo — as
// faces da parede param no batente — e precisa da MESMA emenda, só que o
// buraco pode ser porta (arco desenhado em cima), janela (símbolo dentro) ou
// vão livre. Quem sabe classificar é cada importador; a geometria da emenda é
// uma só, e por isso mora aqui, com o classificador injetado.
//
// ─── A ORIENTAÇÃO ────────────────────────────────────────────────────────────
//
// As duas peças podem ter sido desenhadas em sentidos opostos. A emenda sempre
// recompõe no sentido `antes → depois` (a peça de trás primeiro), virando a que
// estiver ao contrário — e um `offsetMm` de abertura de peça virada é
// espelhado (`L − offset − largura`). Sem isso a parede emendada apontaria
// para o lado errado e a porta cairia no outro extremo.

export interface Ponto2 {
  x: number;
  y: number;
}

/** ABERTURAS: o vão reconhecido numa parede, desde a ponta `a`, ao longo do eixo. */
export interface AberturaLida {
  kind: 'door' | 'window' | 'passage';
  /** Desde a ponta `a` da parede, ao longo do eixo (mm). */
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  /** Só porta (P2.33, do arco do DXF): de qual ponta do vão sai a dobradiça e para que lado abre. Omitido = padrão do kernel. */
  hingeAtStart?: boolean;
  swingReversed?: boolean;
}

/** O mínimo que uma peça precisa ter para ser emendada. */
export interface ParedeEmendavel {
  a: Ponto2;
  b: Ponto2;
  espessuraMm: number;
  comprimentoMm: number;
  aberturas: AberturaLida[];
}

/** O buraco entre duas peças colineares, já no sentido `antes → depois`. */
export interface VaoEntreParedes<T extends ParedeEmendavel> {
  antes: T;
  depois: T;
  /** Ponta do buraco do lado de `antes` (= `antes.b`) e do lado de `depois` (= `depois.a`), em mm. */
  inicio: Ponto2;
  fim: Ponto2;
  /** Direção unitária `antes → depois` e a normal positiva do kernel (`n = (−uy, ux)`). */
  ux: number;
  uy: number;
  larguraMm: number;
  espessuraMm: number;
  /** Desde a ponta `a` da parede emendada até o começo do buraco. */
  offsetMm: number;
}

export interface OpcoesDeEmenda<T extends ParedeEmendavel> {
  /** Buraco menor que isto não é vão: é fresta de desenho. */
  vaoMinMm: number;
  /** Buraco maior que isto nem é oferecido ao classificador — ficam duas paredes. `0` desliga a emenda. */
  vaoMaxMm: number;
  /** As duas peças podem ser a mesma parede? (mesma base e altura no COLLADA, por exemplo). Omitido = sim. */
  compativeis?: (p: T, q: T) => boolean;
  /** O que o buraco é. `null` = não emendar (ficam duas paredes). */
  classificar: (vao: VaoEntreParedes<T>) => AberturaLida | null;
  /** Campos da peça emendada que vêm das duas (o `origem` do COLLADA). Omitido = os de `antes`. */
  fundir?: (antes: T, depois: T) => Partial<T>;
}

const eixoDe = (p: ParedeEmendavel) => {
  const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
  return { ux: (p.b.x - p.a.x) / L, uy: (p.b.y - p.a.y) / L, L };
};

/** A peça apontando no sentido `u`; virada se estava ao contrário — com as aberturas espelhadas. */
function noSentido<T extends ParedeEmendavel>(p: T, ux: number, uy: number): T {
  if ((p.b.x - p.a.x) * ux + (p.b.y - p.a.y) * uy >= 0) return p;
  const L = eixoDe(p).L;
  return { ...p, a: p.b, b: p.a, aberturas: p.aberturas.map((ab) => ({ ...ab, offsetMm: L - ab.offsetMm - ab.widthMm })) };
}

/**
 * Emenda pares de peças colineares (mesma espessura ±1 mm, mesma reta a 5 mm)
 * separadas por um buraco entre `vaoMinMm` e `vaoMaxMm`, quando `classificar`
 * diz o que o buraco é. Repete até não emendar mais — três peças com dois
 * buracos viram uma parede com duas aberturas.
 */
export function emendarColineares<T extends ParedeEmendavel>(paredes: readonly T[], o: OpcoesDeEmenda<T>): T[] {
  if (!(o.vaoMaxMm > 0)) return [...paredes];
  const restantes = [...paredes];
  const saida: T[] = [];
  while (restantes.length) {
    let p = restantes.shift()!;
    let emendou = true;
    while (emendou) {
      emendou = false;
      const e = eixoDe(p);
      for (let i = 0; i < restantes.length; i++) {
        const q = restantes[i];
        if (Math.abs(q.espessuraMm - p.espessuraMm) > 1) continue;
        if (o.compativeis && !o.compativeis(p, q)) continue;
        const eq = eixoDe(q);
        // Mesma direção (ou oposta) e sobre a mesma reta.
        if (Math.abs(e.ux * eq.ux + e.uy * eq.uy) < 0.99996) continue;
        const dist = Math.abs((q.a.x - p.a.x) * e.uy - (q.a.y - p.a.y) * e.ux);
        if (dist > 5) continue;
        // Posições de q ao longo do eixo de p.
        const ta = (q.a.x - p.a.x) * e.ux + (q.a.y - p.a.y) * e.uy;
        const tb = (q.b.x - p.a.x) * e.ux + (q.b.y - p.a.y) * e.uy;
        const qMin = Math.min(ta, tb);
        const qMax = Math.max(ta, tb);
        let largura: number;
        let antes: T;
        let depois: T;
        let ux = e.ux;
        let uy = e.uy;
        if (qMin >= e.L) {
          largura = qMin - e.L;
          antes = p;
          depois = noSentido(q, ux, uy);
        } else if (qMax <= 0) {
          largura = -qMax;
          antes = noSentido(q, ux, uy);
          depois = p;
        } else continue;
        if (largura < o.vaoMinMm || largura > o.vaoMaxMm) continue;
        // ⚠️ NADA no meio do buraco. Duas portas lado a lado deixam TRÊS peças colineares:
        // a de fora de uma, o pilarete, a de fora da outra. Sem esta guarda o par das pontas
        // emendaria por cima do pilarete (um "vão" de 1,9 m engolindo as duas portas) e o
        // pilarete sobraria duplicado — foi o que aconteceu no projeto real da empresa.
        const gIni = qMin >= e.L ? e.L : qMax;
        const gFim = qMin >= e.L ? qMin : 0;
        const temPecaNoMeio = [...restantes, ...saida].some((r) => {
          if (r === q) return false;
          const er = eixoDe(r);
          if (Math.abs(e.ux * er.ux + e.uy * er.uy) < 0.99996) return false;
          if (Math.abs((r.a.x - p.a.x) * e.uy - (r.a.y - p.a.y) * e.ux) > Math.max(5, r.espessuraMm / 2)) return false;
          const ra = (r.a.x - p.a.x) * e.ux + (r.a.y - p.a.y) * e.uy;
          const rb = (r.b.x - p.a.x) * e.ux + (r.b.y - p.a.y) * e.uy;
          return Math.min(Math.max(ra, rb), gFim) - Math.max(Math.min(ra, rb), gIni) > 1;
        });
        if (temPecaNoMeio) continue;
        // ⚠️ A direção é a de `antes` (a peça que fica na frente da parede emendada).
        ({ ux, uy } = eixoDe(antes));
        const La = eixoDe(antes).L;
        const abertura = o.classificar({ antes, depois, inicio: antes.b, fim: depois.a, ux, uy, larguraMm: largura, espessuraMm: antes.espessuraMm, offsetMm: La });
        if (!abertura) continue;
        const Ld = eixoDe(depois).L;
        const inicioDepois = La + largura;
        p = {
          ...antes,
          ...(o.fundir ? o.fundir(antes, depois) : {}),
          b: { x: depois.b.x, y: depois.b.y },
          comprimentoMm: Math.round(inicioDepois + Ld),
          aberturas: [...antes.aberturas, { ...abertura, offsetMm: Math.round(La), widthMm: Math.round(largura) }, ...depois.aberturas.map((ab) => ({ ...ab, offsetMm: Math.round(ab.offsetMm + inicioDepois) }))].sort((x, y) => x.offsetMm - y.offsetMm),
        };
        restantes.splice(i, 1);
        emendou = true;
        break;
      }
    }
    saida.push(p);
  }
  return saida;
}
