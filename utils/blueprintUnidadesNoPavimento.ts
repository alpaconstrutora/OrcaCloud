// utils/blueprintUnidadesNoPavimento.ts
//
// AS UNIDADES DE CADA PAVIMENTO NA MASSA (27/10/2026): *"implemente também a identificação além do pavimento que já
// foi feito mas também de cada unidade em cada pavimento"*. Decisões do usuário: o 3D mostra cada andar dividido nas
// unidades dele, clicáveis, e a divisão sai das UNIDADES DO EMPREENDIMENTO daquele andar (a área privativa de cada
// uma), não do Produto. Plano: docs/planos/2026-10-27-massa-unidades-por-pavimento.md.
//
// É IDENTIFICAÇÃO, não projeto: o contorno do bloco é fatiado ao longo do lado maior, na proporção das áreas; com 4
// ou mais unidades e o lado menor de pelo menos 10 m, em duas fileiras (metade de cada lado, como um corredor
// central). Quem projeta o pavimento de verdade é o "Pavimento tipo" (`blueprintPavimentoTipoDaMassa`). Puro.
//
// POSIÇÃO E ORIENTAÇÃO (28/10/2026, *"para posicionamento das unidades na planta inteligente, deve-se usar as
// informações em … torres e unidades > seção unidades: colunas (posição e orientação)"*): na arrumação Automática,
// cada unidade com Posição (Frente/Fundos/Lateral, em relação à frente do lote) ou Orientação (o sol: N/S/L/O, pelo
// norte do desenho) vira uma DIREÇÃO; cada vaga do andar (fileira × ponta) tem a direção para onde dá, e a unidade
// vai para a vaga que mais combina (`fatiasPorDirecao`). Sem nenhuma das duas no andar, a regra de antes (o número).
// Plano: docs/planos/2026-10-28-unidades-pela-posicao-e-orientacao.md.

import type { Point } from './blueprintKernel';
import { compararNomesPorNumero } from './empreendimentoOrdemDasUnidades';
import type { OrdemDasUnidadesNaPlanta } from '../types/empreendimento';

/**
 * Como as unidades se arrumam no andar (27/10/2026, *"ordenação de duas maneiras, automática … e manual"*):
 *  - AUTOMATICA: pelo número (101 sobre 201 sobre 301) e as duas fileiras com áreas parecidas;
 *  - EMPREENDIMENTO: a ordem da aba Torres e Unidades, a 1ª metade numa fileira e a 2ª na outra.
 */
export type ArrumacaoDasUnidades = 'AUTOMATICA' | 'EMPREENDIMENTO';

/**
 * A escolha de quem olha a Planta (28/10/2026, *"opção de ordenação de duas maneiras pelas setas ou pela posição. O
 * usuário escolhe"*; decisão: "Nos dois"). DO_EMPREENDIMENTO (o padrão) segue cada torre em Torres e Unidades ›
 * Unidades; AUTOMATICA ("Pela posição") e EMPREENDIMENTO ("Pelas setas") valem só para quem escolheu.
 */
export type EscolhaDaArrumacao = 'DO_EMPREENDIMENTO' | ArrumacaoDasUnidades;

/** A arrumação que vale para o bloco: a escolha do usuário, ou — em "Do Empreendimento" — a da torre dele. */
export function arrumacaoEfetiva(escolha: EscolhaDaArrumacao | null | undefined, daTorre: OrdemDasUnidadesNaPlanta | null | undefined): ArrumacaoDasUnidades {
  if (escolha === 'AUTOMATICA' || escolha === 'EMPREENDIMENTO') return escolha;
  return daTorre === 'SETAS' ? 'EMPREENDIMENTO' : 'AUTOMATICA';
}

/** Onde a planta está: a frente do lote (para FORA, para a rua) e o norte do desenho (`georreferencia.rotacaoNorteDeg`). */
export interface ReferenciasDaPlanta {
  /** Unitária, da frente do lote para a rua; null = o lote não tem frente (divisa, testada ou via). */
  frenteParaFora: Point | null;
  /** O norte girado no desenho; null = norte é +Y. */
  rotacaoNorteDeg: number | null;
}

interface UnidadeComLado {
  nome: string;
  posicao?: string | null;
  orientacao?: string | null;
}

const ROTULO_DA_POSICAO: Record<string, string> = { FRENTE: 'Frente', FUNDOS: 'Fundos', LATERAL: 'Lateral' };
const ROTULO_DO_SOL: Record<string, string> = { NORTE: 'Norte', SUL: 'Sul', LESTE: 'Leste', OESTE: 'Oeste' };

/**
 * A direção (unitária) para onde cada unidade deve dar: Frente = para a rua, Fundos = o contrário, Lateral = de lado
 * (uma para cada lado, alternando); Norte/Sul/Leste/Oeste pelo norte do desenho. Com as duas, a soma — opostas
 * se anulam e viram aviso. null = a unidade não diz.
 */
export function direcoesDasUnidades(unidades: readonly UnidadeComLado[], ref: ReferenciasDaPlanta): { direcoes: (Point | null)[]; avisos: string[] } {
  const avisos: string[] = [];
  const th = ((ref.rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const norte = { x: Math.sin(th), y: Math.cos(th) };
  const leste = { x: Math.cos(th), y: -Math.sin(th) };
  const DO_SOL: Record<string, Point> = { NORTE: norte, SUL: { x: -norte.x, y: -norte.y }, LESTE: leste, OESTE: { x: -leste.x, y: -leste.y } };
  const f = ref.frenteParaFora;
  let lado = 1;
  let semFrente = false;
  const direcoes = unidades.map((u) => {
    let pos: Point | null = null;
    const sol = u.orientacao ? (DO_SOL[u.orientacao] ?? null) : null;
    if (u.posicao && ROTULO_DA_POSICAO[u.posicao]) {
      if (!f) semFrente = true;
      else if (u.posicao === 'FRENTE') pos = f;
      else if (u.posicao === 'FUNDOS') pos = { x: -f.x, y: -f.y };
      else {
        // LATERAL: o lado que o sol diz (Garden: "Lateral/Norte"); sem sol que decida, um de cada lado, alternando.
        const perp = { x: -f.y, y: f.x };
        const peloSol = sol ? perp.x * sol.x + perp.y * sol.y : 0;
        const sinal = Math.abs(peloSol) > 0.3 ? Math.sign(peloSol) : lado;
        if (Math.abs(peloSol) <= 0.3) lado = -lado;
        pos = { x: perp.x * sinal, y: perp.y * sinal };
      }
    }
    if (pos && sol && pos.x * sol.x + pos.y * sol.y < -0.5) {
      avisos.push(`Unidade ${u.nome}: posição ${ROTULO_DA_POSICAO[u.posicao!]} e sol ${ROTULO_DO_SOL[u.orientacao!]} apontam para lados opostos nesta planta — confira o cadastro.`);
    }
    if (!pos && !sol) return null;
    const d = { x: (pos?.x ?? 0) + (sol?.x ?? 0), y: (pos?.y ?? 0) + (sol?.y ?? 0) };
    const len = Math.hypot(d.x, d.y);
    return len < 1e-9 ? null : { x: d.x / len, y: d.y / len };
  });
  if (semFrente) avisos.push('O lote não tem frente: a Posição das unidades (Frente/Fundos/Lateral) não foi usada — marque a divisa de Frente no Terreno.');
  return { direcoes, avisos };
}

/**
 * As unidades do andar na ordem em que a massa as fatia, e como escolher as fileiras (`fatiasPorArea`). Na Automática,
 * com `ref` e alguma unidade com Posição ou Orientação, também as direções (`fatiasPorDirecao`) e os avisos.
 */
export function arrumarUnidades<T extends UnidadeComLado>(
  unidades: readonly T[],
  modo: ArrumacaoDasUnidades,
  ref?: ReferenciasDaPlanta,
): { unidades: T[]; fileiras: 'ORDEM' | 'EQUILIBRADAS'; direcoes?: (Point | null)[]; avisos?: string[] } {
  if (modo === 'EMPREENDIMENTO') return { unidades: [...unidades], fileiras: 'ORDEM' };
  const ordem = [...unidades].sort((a, b) => compararNomesPorNumero(a.nome, b.nome));
  if (ref && ordem.some((u) => u.posicao || u.orientacao)) {
    const { direcoes, avisos } = direcoesDasUnidades(ordem, ref);
    if (direcoes.some((d) => d)) return { unidades: ordem, fileiras: 'EQUILIBRADAS', direcoes, avisos };
    return { unidades: ordem, fileiras: 'EQUILIBRADAS', avisos };
  }
  return { unidades: ordem, fileiras: 'EQUILIBRADAS' };
}

const LADO_MIN_PARA_DUAS_FILEIRAS_MM = 10_000;

function areaMm2(anel: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i];
    const q = anel[(i + 1) % anel.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** O pedaço do anel com projeção em `d` entre `de` e `ate` (Sutherland–Hodgman com dois semiplanos). */
function faixa(anel: readonly Point[], d: Point, de: number, ate: number): Point[] {
  const corta = (pol: Point[], dentro: (t: number) => boolean, limite: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < pol.length; i++) {
      const a = pol[i];
      const b = pol[(i + 1) % pol.length];
      const ta = a.x * d.x + a.y * d.y;
      const tb = b.x * d.x + b.y * d.y;
      if (dentro(ta)) out.push(a);
      if (dentro(ta) !== dentro(tb)) {
        const k = (limite - ta) / (tb - ta);
        out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      }
    }
    return out;
  };
  return corta(corta([...anel], (t) => t >= de, de), (t) => t <= ate, ate);
}

/** A posição em `d` que deixa `alvo` mm² do anel antes dela (busca binária: a área cresce com a posição). */
function corteNaArea(anel: readonly Point[], d: Point, min: number, max: number, alvo: number): number {
  let lo = min;
  let hi = max;
  for (let k = 0; k < 50; k++) {
    const meio = (lo + hi) / 2;
    if (areaMm2(faixa(anel, d, min, meio)) < alvo) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

/** Fatias ao longo de `d`, na proporção de `pesos`, dentro do trecho [min, max] de `d`. */
function fatiar(anel: readonly Point[], d: Point, pesos: readonly number[]): Point[][] {
  const ts = anel.map((p) => p.x * d.x + p.y * d.y);
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  const total = areaMm2(anel);
  const soma = pesos.reduce((s, p) => s + p, 0);
  const out: Point[][] = [];
  let de = min;
  let acumulado = 0;
  pesos.forEach((p, i) => {
    acumulado += p;
    const ate = i === pesos.length - 1 ? max : corteNaArea(anel, d, min, max, (total * acumulado) / soma);
    out.push(faixa(anel, d, de, ate));
    de = ate;
  });
  return out;
}

const arredondar = (anel: Point[]) => anel.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

/** Os pesos sem buraco: nulo, zero ou inválido vale a média dos outros. */
function pesosValidos(pesos: readonly (number | null | undefined)[]): number[] {
  const validos = pesos.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0);
  const media = validos.length > 0 ? validos.reduce((s, p) => s + p, 0) / validos.length : 1;
  return pesos.map((p) => (typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : media));
}

/** O lado maior dá a direção das fatias (u); a perpendicular, a das fileiras (v). Com 4+ e largura ≥ 10 m, duas. */
function eixosDoAnel(anel: readonly Point[], n: number): { u: Point; v: Point; duasFileiras: boolean } {
  let maior = { d: { x: 1, y: 0 }, len: 0 };
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > maior.len) maior = { d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, len };
  }
  const u = maior.d;
  const v = { x: -u.y, y: u.x };
  const tv = anel.map((p) => p.x * v.x + p.y * v.y);
  return { u, v, duasFileiras: n >= 4 && Math.max(...tv) - Math.min(...tv) >= LADO_MIN_PARA_DUAS_FILEIRAS_MM };
}

/** O anel fatiado por fileiras (a 1ª no menor v), cada uma com as unidades na ordem ao longo de u. A fatia k = a unidade k. */
function fatiarEmFileiras(anel: readonly Point[], ps: readonly number[], u: Point, v: Point, fileiras: readonly number[][]): Point[][] {
  const out: Point[][] = new Array(ps.length);
  const cheias = fileiras.filter((f) => f.length > 0);
  const pedacos = cheias.length === 1 ? [[...anel]] : fatiar(anel, v, cheias.map((f) => f.reduce((s, i) => s + ps[i], 0)));
  cheias.forEach((f, r) => fatiar(pedacos[r], u, f.map((i) => ps[i])).forEach((fatia, k) => (out[f[k]] = fatia)));
  return out.map(arredondar);
}

/**
 * O contorno `anel` (mm) fatiado em uma fatia por peso, na ordem dos pesos. Peso nulo, zero ou inválido vale a
 * média dos outros (a "Área Comum" sem área privativa, o estacionamento). Sem pesos, nada.
 */
export function fatiasPorArea(
  anel: readonly Point[],
  pesos: readonly (number | null | undefined)[],
  /**
   * Com duas fileiras, quem vai em cada uma (27/10/2026). 'ORDEM' (o padrão): a 1ª metade numa e a 2ª na outra — a
   * ordem que a pessoa arrumou no Empreendimento. 'EQUILIBRADAS' (a ordem automática): cada unidade, na ordem, vai
   * para a fileira com menos área até agora (e com vaga), e as fileiras saem com áreas parecidas — a Torre A do Garden
   * (127, 127, 81, 81) ficava com 61 % do andar de um lado. A fatia k continua sendo a unidade k.
   */
  fileiras: 'ORDEM' | 'EQUILIBRADAS' = 'ORDEM',
): Point[][] {
  if (pesos.length === 0 || anel.length < 3) return [];
  const ps = pesosValidos(pesos);
  if (ps.length === 1) return [arredondar([...anel])];
  const { u, v, duasFileiras } = eixosDoAnel(anel, ps.length);

  if (duasFileiras) {
    const n1 = Math.ceil(ps.length / 2);
    const vagas = [n1, ps.length - n1];
    const quem: [number[], number[]] = [[], []];
    const somas = [0, 0];
    ps.forEach((p, i) => {
      const lado = fileiras === 'ORDEM' ? (i < n1 ? 0 : 1) : quem[0].length >= vagas[0] ? 1 : quem[1].length >= vagas[1] ? 0 : somas[1] < somas[0] ? 1 : 0;
      quem[lado].push(i);
      somas[lado] += p;
    });
    return fatiarEmFileiras(anel, ps, u, v, quem);
  }
  return fatiar(anel, u, ps).map(arredondar);
}

/**
 * O contorno fatiado com cada unidade na vaga que dá para a sua direção (`direcoesDasUnidades`). As vagas são as
 * mesmas de `fatiasPorArea` (uma ou duas fileiras ao longo do lado maior); cada uma dá para o lado da fileira (−v na
 * 1ª, +v na 2ª; nenhum com uma fileira só) somado à ponta (−u na primeira, +u na última). As unidades com direção, na
 * ordem recebida, ficam com a vaga livre que mais combina; as sem direção ocupam as que sobram, na ordem. A fatia k
 * continua sendo a unidade k, na proporção da área.
 */
export function fatiasPorDirecao(anel: readonly Point[], pesos: readonly (number | null | undefined)[], direcoes: readonly (Point | null)[]): Point[][] {
  if (pesos.length === 0 || anel.length < 3) return [];
  const ps = pesosValidos(pesos);
  if (ps.length === 1) return [arredondar([...anel])];
  const { u, v, duasFileiras } = eixosDoAnel(anel, ps.length);
  const n1 = duasFileiras ? Math.ceil(ps.length / 2) : ps.length;
  const tamanhos = duasFileiras ? [n1, ps.length - n1] : [ps.length];
  const vagas: { fileira: number; pos: number; dir: Point }[] = [];
  tamanhos.forEach((t, r) => {
    const lado = duasFileiras ? (r === 0 ? -1 : 1) : 0;
    for (let k = 0; k < t; k++) {
      const ponta = t === 1 ? 0 : k === 0 ? -1 : k === t - 1 ? 1 : 0;
      vagas.push({ fileira: r, pos: k, dir: { x: v.x * lado + u.x * ponta, y: v.y * lado + u.y * ponta } });
    }
  });
  const dono: number[] = new Array(vagas.length).fill(-1);
  const colocar = (i: number, nota: (vaga: (typeof vagas)[number]) => number) => {
    let melhor = -1;
    for (let k = 0; k < vagas.length; k++) if (dono[k] < 0 && (melhor < 0 || nota(vagas[k]) > nota(vagas[melhor]) + 1e-9)) melhor = k;
    dono[melhor] = i;
  };
  ps.forEach((_, i) => {
    const d = direcoes[i];
    if (d) colocar(i, (vg) => d.x * vg.dir.x + d.y * vg.dir.y);
  });
  ps.forEach((_, i) => {
    if (!direcoes[i]) colocar(i, () => 0);
  });
  const fileiras = tamanhos.map((_, r) =>
    vagas
      .map((vg, k) => ({ vg, k }))
      .filter(({ vg }) => vg.fileira === r)
      .sort((a, b) => a.vg.pos - b.vg.pos)
      .map(({ k }) => dono[k]),
  );
  return duasFileiras ? fatiarEmFileiras(anel, ps, u, v, fileiras) : fatiarEmFileiras(anel, ps, u, v, [fileiras[0]]);
}
