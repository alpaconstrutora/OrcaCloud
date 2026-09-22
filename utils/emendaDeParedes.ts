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
  /**
   * FRESTA (P2.34): buraco menor que `vaoMinMm` e até isto é emendado SEM abertura —
   * as duas peças viram uma parede contínua. É o cruzamento em T de um desenho de
   * faces: a face da parede que passa é interrompida pela parede que chega, e o
   * pareamento devolve dois trechos separados pela espessura dela (10–25 cm).
   * Medido no projeto real da empresa: metade das pontas de parede eram isso.
   * Omitido/0 = fresta não emenda (o comportamento do COLLADA).
   */
  frestaMaxMm?: number;
  /** Buraco maior que isto nem é oferecido ao classificador — ficam duas paredes. `0` desliga a emenda. */
  vaoMaxMm: number;
  /** As duas peças podem ser a mesma parede? (mesma base e altura no COLLADA, por exemplo). Omitido = sim. */
  compativeis?: (p: T, q: T) => boolean;
  /**
   * O que o buraco é. `null` = não emendar (ficam duas paredes). Uma abertura ocupa o
   * buraco inteiro; uma LISTA traz cada uma com `offsetMm` relativo ao começo do buraco
   * (porta de duas folhas = duas portas de meia largura).
   */
  classificar: (vao: VaoEntreParedes<T>) => AberturaLida | AberturaLida[] | null;
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
  const frestaMax = o.frestaMaxMm ?? 0;
  if (!(o.vaoMaxMm > 0) && !(frestaMax > 0)) return [...paredes];
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
        // Também a SOBREPOSIÇÃO pequena (P2.34): no T de um desenho de faces as duas peças da
        // parede que passa podem avançar uma sobre a outra alguns centímetros em vez de deixar
        // fresta. `largura` negativa = sobreposição; a emenda vira a união, sem abertura.
        if (qMin >= e.L - frestaMax && qMax > e.L) {
          largura = qMin - e.L;
          antes = p;
          depois = noSentido(q, ux, uy);
        } else if (qMax <= frestaMax && qMin < 0) {
          largura = -qMax;
          antes = noSentido(q, ux, uy);
          depois = p;
        } else continue;
        const fresta = largura < o.vaoMinMm && largura <= frestaMax;
        if (!fresta && (largura < o.vaoMinMm || largura > o.vaoMaxMm)) continue;
        if (largura < 0 && -largura > Math.min(e.L, eq.L) / 2) continue; // sobreposição que engole meia peça é duplicata, não T
        // ⚠️ NADA no meio do buraco. Duas portas lado a lado deixam TRÊS peças colineares:
        // a de fora de uma, o pilarete, a de fora da outra. Sem esta guarda o par das pontas
        // emendaria por cima do pilarete (um "vão" de 1,9 m engolindo as duas portas) e o
        // pilarete sobraria duplicado — foi o que aconteceu no projeto real da empresa.
        const gIni = qMin >= e.L ? e.L : qMax;
        const gFim = qMin >= e.L ? qMin : 0;
        const temPecaNoMeio = largura > 0 && [...restantes, ...saida].some((r) => {
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
        // Fresta: sem abertura. Vão: o classificador diz o que é (uma ou mais aberturas, com offset relativo ao começo do buraco).
        let novas: AberturaLida[];
        if (fresta) novas = [];
        else {
          const abertura = o.classificar({ antes, depois, inicio: antes.b, fim: depois.a, ux, uy, larguraMm: largura, espessuraMm: antes.espessuraMm, offsetMm: La });
          if (!abertura) continue;
          novas = Array.isArray(abertura)
            ? abertura.map((ab) => ({ ...ab, offsetMm: Math.round(La + ab.offsetMm), widthMm: Math.round(ab.widthMm) }))
            : [{ ...abertura, offsetMm: Math.round(La), widthMm: Math.round(largura) }];
        }
        const Ld = eixoDe(depois).L;
        const inicioDepois = La + largura;
        p = {
          ...antes,
          ...(o.fundir ? o.fundir(antes, depois) : {}),
          b: { x: depois.b.x, y: depois.b.y },
          comprimentoMm: Math.round(inicioDepois + Ld),
          aberturas: [...antes.aberturas, ...novas, ...depois.aberturas.map((ab) => ({ ...ab, offsetMm: Math.round(ab.offsetMm + inicioDepois) }))].sort((x, y) => x.offsetMm - y.offsetMm),
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
