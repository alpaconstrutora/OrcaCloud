/**
 * Casa automática — parte `quadroEImplantacao` do motor (etapa D2, 11/11/2026: `utils/blueprintCasaAutomatica.ts` dividido sem mudar
 * o que gera; o marco das casas de referência prova). Ver o cabeçalho de `orquestrador.ts`.
 */
import { DIMENSAO_DA_VAGA, point, polygonArea } from '../blueprintKernel';
import type { Boundary, Point } from '../blueprintKernel';
import { envelopeLegal } from '../blueprintMassa';
import type { ContextoDaMassa } from '../blueprintMassa';
import { envelopeConstrutivo } from '../blueprintTerreno';
import { recuosEfetivos } from '../blueprintZonaUrbanistica';
import { maiorRetanguloInscrito } from '../blueprintGerador';
import type { Retangulo } from '../blueprintGerador';
import { resumoDoPrograma } from '../blueprintPrograma';
import type { Programa, ProgramaCurtoDaCasa } from '../blueprintPrograma';
import { HIPOTESES_DA_IMPLANTACAO_PADRAO, exato, m2, pct, f2, f1, piso } from './hipoteses';
import type { HipotesesDaImplantacao } from './hipoteses';

// ─── O quadro da frente ─────────────────────────────────────────────────────

/** Mundo = x·ex + y·ey. `ey` = normal interna da frente; `ex` = mão direita de quem olha da rua. */
export interface QuadroDaFrente {
  ex: Point;
  ey: Point;
}

/** O quadro pela divisa FRENTE mais longa; `null` sem frente marcada. */
export function quadroDaFrente(limites: readonly Boundary[], anelDoLote: readonly Point[]): QuadroDaFrente | null {
  const frentes = limites.filter((b) => b.kind === 'TERRENO' && b.papel === 'FRENTE');
  if (!frentes.length || anelDoLote.length < 3) return null;
  const f = [...frentes].sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))[0];
  const L = Math.hypot(f.b.x - f.a.x, f.b.y - f.a.y);
  if (L < 1) return null;
  let n = { x: -(f.b.y - f.a.y) / L, y: (f.b.x - f.a.x) / L };
  const c = { x: anelDoLote.reduce((s, p) => s + p.x, 0) / anelDoLote.length, y: anelDoLote.reduce((s, p) => s + p.y, 0) / anelDoLote.length };
  const meio = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
  if ((c.x - meio.x) * n.x + (c.y - meio.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  const ey = { x: exato(n.x), y: exato(n.y) };
  return { ey, ex: { x: exato(ey.y), y: exato(-ey.x) } };
}

export const paraLocal = (q: QuadroDaFrente, p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ex.y, y: p.x * q.ey.x + p.y * q.ey.y });

export const paraMundo = (q: QuadroDaFrente, p: Point): Point => ({ x: p.x * q.ex.x + p.y * q.ey.x, y: p.x * q.ex.y + p.y * q.ey.y });

// ─── Implantação ────────────────────────────────────────────────────────────

export type LimitanteDaImplantacao = 'PROGRAMA' | 'TO' | 'ENVELOPE' | 'CA' | 'PERMEABILIDADE' | 'VAGAS' | 'RAMPA';

export const ROTULO_DO_LIMITANTE: Record<LimitanteDaImplantacao, string> = {
  PROGRAMA: 'o programa',
  TO: 'a taxa de ocupação',
  ENVELOPE: 'os recuos',
  CA: 'o coeficiente de aproveitamento',
  PERMEABILIDADE: 'a taxa de permeabilidade',
  VAGAS: 'as vagas descobertas',
  RAMPA: 'a rampa da garagem',
};

/** Com a preposição contraída — "limitada pelo programa", "pela taxa de ocupação". */
export const LIMITADA_POR: Record<LimitanteDaImplantacao, string> = {
  PROGRAMA: 'pelo programa',
  TO: 'pela taxa de ocupação',
  ENVELOPE: 'pelos recuos',
  CA: 'pelo coeficiente de aproveitamento',
  PERMEABILIDADE: 'pela taxa de permeabilidade',
  VAGAS: 'pelas vagas descobertas',
  RAMPA: 'pela rampa da garagem',
};

export interface ImplantacaoDaCasa {
  /** O retângulo das paredes externas (eixos) no quadro da frente, mm, na malha. */
  retanguloLocal: Retangulo;
  /** O mesmo retângulo no mundo — é o `envelope` que o gerador recebe (alinhado quando a frente é). */
  anelNoMundo: Point[];
  quadro: QuadroDaFrente;
  /** Direção da rua a partir do lote, no mundo (= −ey) — a `direcaoDaFrente` do gerador. */
  direcaoDaFrente: Point;
  /** A frente cai num eixo do desenho: o gerador recebe o anel do mundo direto. */
  alinhadaAoDesenho: boolean;
  limitante: LimitanteDaImplantacao;
  /** F12: 1 = térrea; 2 = sobrado (os dois pavimentos no mesmo retângulo). */
  pavimentos: number;
  medidas: {
    loteM2: number;
    /** A área que o programa pede, já como projeção (paredes externas pela metade). */
    projecaoPedidaM2: number;
    projecaoM2: number;
    implantacaoMaxM2: number | null;
    envelopeM2: number;
    potencialM2: number | null;
    impermeavelMaxM2: number | null;
    toPct: number;
    toMaxPct: number | null;
    /** A área construída (projeção × pavimentos) ÷ lote. */
    coeficiente: number;
    coeficienteMax: number | null;
    /** (lote − projeção − pavimentação − vagas descobertas) ÷ lote. */
    permeabilidadePct: number;
    permeabilidadeMinPct: number | null;
  };
  /**
   * F24: a casa em L — o anel ortogonal (no quadro da frente) do retângulo da frente (`retanguloLocal`) com o anexo
   * colado atrás dele. `null` = a casa é o retângulo.
   */
  contornoLocal: Point[] | null;
  /**
   * F24: onde as vagas descobertas vão (no quadro da frente) — o recuo de frente diante da casa ou a faixa ao lado
   * dela. `null` = sem vaga descoberta.
   */
  vagasDescobertas: { caixa: Retangulo; onde: 'RECUO_DE_FRENTE' | 'AO_LADO' } | null;
  avisos: string[];
}

export type ResultadoDaImplantacao = { ok: true; implantacao: ImplantacaoDaCasa } | { ok: false; motivo: string };

/**
 * F24: o trecho do lote, em x, livre em TODA a faixa horizontal [y0, y1] (no quadro da frente) — por varredura a cada
 * 250 mm (as bordas a 1 mm para dentro); `null` se a faixa sai do lote.
 */
export function faixaDoLote(anel: readonly Point[], y0: number, y1: number, xRef?: number): { xMin: number; xMax: number } | null {
  let xMin = -Infinity;
  let xMax = Infinity;
  const passos = Math.max(1, Math.ceil((y1 - y0) / 250));
  for (let k = 0; k <= passos; k++) {
    const y = Math.min(y1 - 1, Math.max(y0 + 1, y0 + (k * (y1 - y0)) / passos));
    const xs: number[] = [];
    for (let i = 0; i < anel.length; i++) {
      const a = anel[i];
      const b = anel[(i + 1) % anel.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    if (xs.length < 2) return null;
    // Anel não convexo (L, U): na linha, o trecho que contém a referência; sem ela, o de fora a fora.
    xs.sort((a, b) => a - b);
    let lo = xs[0];
    let hi = xs[xs.length - 1];
    if (xRef !== undefined) {
      const k = xs.findIndex((x, j) => j % 2 === 0 && j + 1 < xs.length && xRef >= x && xRef <= xs[j + 1]);
      if (k < 0) return null;
      lo = xs[k];
      hi = xs[k + 1];
    }
    xMin = Math.max(xMin, lo);
    xMax = Math.min(xMax, hi);
  }
  return xMax > xMin ? { xMin, xMax } : null;
}

/**
 * F24: o anel (anti-horário, y para os fundos) da união do retângulo da frente `a` com o anexo `b` colado na borda de
 * trás dele (`b.y0 === a.y1`); sem vértice repetido nem colinear.
 */
export function anelDoL(a: Retangulo, b: Retangulo): Point[] {
  const bruto: Point[] = [
    point(a.x0, a.y0), point(a.x1, a.y0), point(a.x1, a.y1),
    point(b.x1, a.y1), point(b.x1, b.y1), point(b.x0, b.y1), point(b.x0, a.y1),
    point(a.x0, a.y1),
  ];
  const semRepetir = bruto.filter((p, i) => { const q = bruto[(i + bruto.length - 1) % bruto.length]; return p.x !== q.x || p.y !== q.y; });
  return semRepetir.filter((p, i) => {
    const q = semRepetir[(i + semRepetir.length - 1) % semRepetir.length];
    const r = semRepetir[(i + 1) % semRepetir.length];
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x) !== 0;
  });
}

/** F12: o sobrado na implantação — a área útil do pavimento MAIOR (com o núcleo da escada) e a altura total. */
export interface ImplantacaoDoSobrado {
  utilPorPavimentoM2: number;
  alturaM: number;
  /** F27-D: quantos pavimentos sobre o mesmo retângulo (2 = sobrado; 3 = o 2º recuado sobre o 1º). Ausente = 2. */
  pavimentos?: 2 | 3;
}

/**
 * O retângulo da casa no lote, pela lei. `ctx` é o mesmo do estudo de massa
 * (terreno, divisas com papel, recuos da zona, índices da zona). Com `sobrado`, o retângulo serve aos N
 * pavimentos (2, ou 3 na F27-D): o programa é o do pavimento maior, o CA divide o potencial por N, os recuos são os
 * da altura da casa e o gabarito da zona precisa deixar N pavimentos.
 */
export function implantacaoDaCasa(
  ctx: ContextoDaMassa,
  programa: Programa,
  curto: Pick<ProgramaCurtoDaCasa, 'vagas' | 'garagemCoberta'>,
  hipParcial: Partial<HipotesesDaImplantacao> = {},
  sobrado: ImplantacaoDoSobrado | null = null,
): ResultadoDaImplantacao {
  const hip = { ...HIPOTESES_DA_IMPLANTACAO_PADRAO, ...hipParcial };
  const terreno = ctx.terreno && ctx.terreno.anel.length >= 3 ? ctx.terreno : null;
  if (!terreno) return { ok: false, motivo: 'Feche o lote (as divisas do terreno) na aba Terreno.' };
  const quadro = quadroDaFrente(ctx.limites, terreno.anel);
  if (!quadro) return { ok: false, motivo: 'Marque a divisa da FRENTE do lote — a casa se implanta a partir dela.' };

  const pav = sobrado ? (sobrado.pavimentos ?? 2) : 1;
  // O nome da casa e o que gerar no lugar, para as mensagens do gabarito.
  const casa = pav === 3 ? 'a casa de 3 pavimentos' : 'o sobrado';
  const noLugar = pav === 3 ? 'gere o sobrado (2 pavimentos)' : 'gere a casa térrea';
  if (sobrado && ctx.zona.gabaritoPavimentos != null && ctx.zona.gabaritoPavimentos < pav) return { ok: false, motivo: `A zona permite ${ctx.zona.gabaritoPavimentos} ${ctx.zona.gabaritoPavimentos === 1 ? 'pavimento' : 'pavimentos'} — ${casa} não cabe; ${noLugar}.` };
  if (sobrado && ctx.zona.gabaritoAlturaMaxM != null && ctx.zona.gabaritoAlturaMaxM < sobrado.alturaM) return { ok: false, motivo: `O gabarito da zona (${f2(ctx.zona.gabaritoAlturaMaxM)} m) é menor que a altura d${pav === 3 ? 'a casa de 3 pavimentos' : 'o sobrado'} (${f2(sobrado.alturaM)} m) — ${noLugar}.` };
  const legal = envelopeLegal(ctx);
  const ef = recuosEfetivos(ctx.recuosBase, { afastamentoProgressivo: ctx.zona.afastamentoProgressivo, recuoFrenteEscalonado: ctx.zona.recuoFrenteEscalonado ?? null }, sobrado ? sobrado.alturaM : 3, pav);
  const env = envelopeConstrutivo(terreno, ctx.limites, ef.recuos);
  if (!env.valido || env.anel.length < 3) return { ok: false, motivo: 'Os recuos da zona não deixam área edificável no lote.' };
  // Arredondado ao mm: o kernel só aceita milímetro inteiro (lote girado dá frações).
  const envLocal = env.anel.map((p) => paraLocal(quadro, p)).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const rmax = maiorRetanguloInscrito(envLocal);
  if (!rmax) return { ok: false, motivo: 'Não cabe um retângulo no envelope dos recuos.' };

  const loteM2 = terreno.areaMm2 / 1e6;
  const e = hip.espessuraExternaMm;
  const projecao = (W: number, D: number) => ((W + e) * (D + e)) / 1e6;
  const avisos: string[] = [];

  // O que o programa pede, como projeção: área útil × fator das paredes internas → eixos; + meia parede externa.
  const util = sobrado ? sobrado.utilPorPavimentoM2 : resumoDoPrograma(programa).areaIdealComCirculacaoM2;
  const retPedidoM2 = util * hip.fatorDoRetanguloSobreUtil;
  const ladoPedido = Math.sqrt(retPedidoM2 * 1e6);
  const projecaoPedidaM2 = m2(projecao(ladoPedido * Math.sqrt(hip.proporcaoFrenteFundo), ladoPedido / Math.sqrt(hip.proporcaoFrenteFundo)));

  // Os tetos de projeção, cada um com o seu nome.
  const tetos: { limitante: LimitanteDaImplantacao; m2: number }[] = [{ limitante: 'PROGRAMA', m2: projecaoPedidaM2 }];
  if (legal.implantacaoMaxM2 != null) tetos.push({ limitante: 'TO', m2: legal.implantacaoMaxM2 * (1 - hip.folgaDaTOPct / 100) });
  if (legal.potencialM2 != null) tetos.push({ limitante: 'CA', m2: legal.potencialM2 / pav });
  const vagasDescobertas = curto.garagemCoberta ? 0 : Math.max(0, curto.vagas);
  const pavimentacaoM2 = (loteM2 * hip.pavimentacaoExternaPctDoLote) / 100 + vagasDescobertas * hip.areaPorVagaDescobertaM2;
  const permMin = ctx.zona.taxaPermeabilidadeMinPct;
  const impermeavelMaxM2 = permMin != null ? loteM2 * (1 - permMin / 100) - pavimentacaoM2 : null;
  if (impermeavelMaxM2 != null) tetos.push({ limitante: 'PERMEABILIDADE', m2: Math.max(0, impermeavelMaxM2) });
  const teto = tetos.reduce((a, b) => (b.m2 < a.m2 ? b : a));
  if (teto.m2 <= 0) return { ok: false, motivo: `${ROTULO_DO_LIMITANTE[teto.limitante]} não deixa área para a casa neste lote.` };

  // Forma: proporção pedida, presa no maior retângulo do envelope.
  const Wmax = rmax.x1 - rmax.x0;
  const Dmax = rmax.y1 - rmax.y0;
  const alvoEixosMm2 = (() => {
    // resolve (W+e)(D+e) = teto com W = p·D: p·D² + e(p+1)·D + e² − teto = 0
    const p = hip.proporcaoFrenteFundo;
    const A = teto.m2 * 1e6;
    const D = (-e * (p + 1) + Math.sqrt(e * e * (p + 1) ** 2 - 4 * p * (e * e - A))) / (2 * p);
    return { W: p * D, D };
  })();
  let W = alvoEixosMm2.W;
  let D = alvoEixosMm2.D;
  let limitante = teto.limitante;
  if (W > Wmax) {
    W = Wmax;
    D = (teto.m2 * 1e6) / (W + e) - e;
  }
  if (D > Dmax) {
    D = Dmax;
    W = Math.min(Wmax, (teto.m2 * 1e6) / (D + e) - e);
  }
  if (projecao(W, D) < teto.m2 - 0.5) limitante = 'ENVELOPE';
  // Item 9: a largura mínima pedida (os mínimos do programa não cabiam) — alarga, a profundidade fica; passando da TO,
  // a profundidade cede só o necessário.
  if (hip.larguraMinimaMm != null && W < hip.larguraMinimaMm) {
    W = Math.min(Wmax, hip.larguraMinimaMm);
    const toMax = legal.implantacaoMaxM2 != null ? legal.implantacaoMaxM2 * (1 - hip.folgaDaTOPct / 100) : null;
    if (toMax != null && projecao(W, D) > toMax) D = (toMax * 1e6) / (W + e) - e;
  }
  W = piso(W, hip.malhaMm);
  D = piso(D, hip.malhaMm);
  if (W < 3000 || D < 3000) return { ok: false, motivo: `Sobra só ${f2(W / 1000)} × ${f2(D / 1000)} m para a casa — ${ROTULO_DO_LIMITANTE[limitante]} aperta demais.` };

  // Posição: no recuo de frente, encostada na divisa escolhida.
  const xNaDivisa = (w: number) => (hip.encostarNaDivisa === 'ESQUERDA' ? rmax.x0 : hip.encostarNaDivisa === 'DIREITA' ? rmax.x1 - w : piso(rmax.x0 + (Wmax - w) / 2, hip.malhaMm));
  let x0 = xNaDivisa(W);
  let y0 = rmax.y0;

  // F26: a rampa de veículos pede recuo de frente — a casa vai para trás (aprofundando menos, alargando o que a frente
  // deixa); sem profundidade para isso, fica onde estava e quem chama diz por quê.
  if (hip.recuoMinimoDeFrenteMm > 0) {
    const yF = Math.min(...terreno.anel.map((p) => paraLocal(quadro, p).y));
    const yMin = Math.ceil((yF + hip.recuoMinimoDeFrenteMm + e / 2) / hip.malhaMm - 1e-9) * hip.malhaMm;
    if (yMin > y0) {
      const Dr = Math.min(D, piso(rmax.y1 - yMin, hip.malhaMm));
      const Wr = Dr < D ? Math.min(Wmax, piso((teto.m2 * 1e6) / (Dr + e) - e, hip.malhaMm)) : W;
      if (Dr >= 3000 && Wr >= 3000) {
        if (projecao(Wr, Dr) < projecao(W, D) - 0.5) limitante = 'RAMPA';
        avisos.push(`Garagem: a rampa de veículos pede ${f2(hip.recuoMinimoDeFrenteMm / 1000)} m da frente à fachada — a casa recua ${f2((yMin - y0) / 1000)} m.`);
        W = Wr;
        D = Dr;
        y0 = yMin;
        x0 = xNaDivisa(W);
      }
    }
  }

  // F24: as vagas descobertas. Cabem no recuo de frente diante da casa → ficam ali. Senão: recuar a casa (as fileiras
  // de vagas à frente dela) ou abrir a faixa ao lado (a casa estreita e aprofunda para não perder área).
  let vagasDescobertasLocal: ImplantacaoDaCasa['vagasDescobertas'] = null;
  if (vagasDescobertas > 0) {
    const { larguraMm: vL, comprimentoMm: vC } = DIMENSAO_DA_VAGA.COMUM;
    const loteLocal = terreno.anel.map((p) => paraLocal(quadro, p));
    const yFrente = Math.min(...loteLocal.map((p) => p.y));
    const cabemNaFrente = (w: number, yCasa: number) => Math.floor(w / vL) * Math.floor((yCasa - e / 2 - yFrente) / vC);
    const frente = (x: number, w: number, yCasa: number): Retangulo => ({ x0: x, x1: x + w, y0: yFrente, y1: yCasa - e / 2 });
    if (cabemNaFrente(W, y0) >= vagasDescobertas) vagasDescobertasLocal = { caixa: frente(x0, W, y0), onde: 'RECUO_DE_FRENTE' };
    else {
      type Opcao = { W: number; D: number; x0: number; y0: number; caixa: Retangulo; onde: 'RECUO_DE_FRENTE' | 'AO_LADO'; perde: boolean };
      const opcoes: Opcao[] = [];
      // RECUAR: as fileiras pedidas, na largura da casa.
      const colunas = Math.floor(W / vL);
      if (hip.vagaDescoberta !== 'AO_LADO' && colunas >= 1) {
        const y0r = Math.ceil((yFrente + Math.ceil(vagasDescobertas / colunas) * vC + e / 2) / hip.malhaMm - 1e-9) * hip.malhaMm;
        const Dr = Math.min(D, piso(rmax.y1 - y0r, hip.malhaMm));
        const Wr = Dr < D ? Math.min(Wmax, piso((teto.m2 * 1e6) / (Dr + e) - e, hip.malhaMm)) : W;
        if (Dr >= 3000 && Wr >= 3000) opcoes.push({ W: Wr, D: Dr, x0: xNaDivisa(Wr), y0: y0r, caixa: frente(xNaDivisa(Wr), Wr, y0r), onde: 'RECUO_DE_FRENTE', perde: projecao(Wr, Dr) < projecao(W, D) - 0.5 });
      }
      // AO_LADO: a faixa da largura de uma vaga, as vagas em fila da rua para dentro, no lado oposto ao encosto.
      if (hip.vagaDescoberta !== 'RECUAR') {
        const fundoDaFaixa = yFrente + vagasDescobertas * vC;
        const larg = faixaDoLote(loteLocal, yFrente, fundoDaFaixa, x0 + W / 2);
        if (larg) {
          const aDireita = hip.encostarNaDivisa !== 'DIREITA';
          const caixa: Retangulo = aDireita ? { x0: larg.xMax - vL, x1: larg.xMax, y0: yFrente, y1: fundoDaFaixa } : { x0: larg.xMin, x1: larg.xMin + vL, y0: yFrente, y1: fundoDaFaixa };
          const xCasa = aDireita ? x0 : Math.max(x0, Math.ceil((caixa.x1 + e / 2) / hip.malhaMm - 1e-9) * hip.malhaMm);
          const Wl = Math.min(W, piso(aDireita ? caixa.x0 - e / 2 - xCasa : x0 + W - xCasa, hip.malhaMm));
          const Dl = Wl < W ? Math.min(Dmax, piso((teto.m2 * 1e6) / (Wl + e) - e, hip.malhaMm)) : D;
          if (Wl >= 3000 && Dl >= 3000) opcoes.push({ W: Wl, D: Dl, x0: xCasa, y0, caixa, onde: 'AO_LADO', perde: projecao(Wl, Dl) < projecao(W, D) - 0.5 });
        }
      }
      const semPerder = opcoes.find((o) => o.onde === 'RECUO_DE_FRENTE' && !o.perde) ?? opcoes.find((o) => !o.perde);
      const escolhida = semPerder ?? [...opcoes].sort((a, b) => projecao(b.W, b.D) - projecao(a.W, a.D))[0];
      if (escolhida) {
        ({ W, D, x0, y0 } = escolhida);
        vagasDescobertasLocal = { caixa: escolhida.caixa, onde: escolhida.onde };
        if (escolhida.perde) limitante = 'VAGAS';
        avisos.push(
          escolhida.onde === 'AO_LADO'
            ? `Vagas descobertas: o recuo de frente não comporta ${vagasDescobertas} vaga(s) de ${f2(vL / 1000)} × ${f2(vC / 1000)} m — a casa estreita e as vagas vão numa faixa ao lado dela, da rua para dentro.`
            : `Vagas descobertas: o recuo de frente não comportava ${vagasDescobertas} vaga(s) de ${f2(vL / 1000)} × ${f2(vC / 1000)} m — a casa recua ${f2((y0 - rmax.y0) / 1000)} m.`,
        );
      } else vagasDescobertasLocal = { caixa: frente(x0, W, y0), onde: 'RECUO_DE_FRENTE' };
    }
  }
  // F24: a casa em L. O retângulo da frente fica mais raso e um anexo nasce colado atrás dele, no que o envelope tem
  // atrás (mais largo no trapézio, o braço de trás no lote em L): o de MENOR profundidade total que alcança o teto,
  // com ≥ 3 m de lado e ≥ 3 m em comum com o da frente. Fica só se rende mais área ou deixa a casa mais rasa (larga).
  let contornoLocal: Point[] | null = null;
  let projecaoDoL: number | null = null;
  if (hip.forma === 'L') {
    const alvo = teto.m2;
    const r1De = (D1: number): Retangulo => ({ x0, y0, x1: x0 + W, y1: y0 + D1 });
    const projecaoDe = (a: Retangulo, b: Retangulo) => {
      const comum = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const area = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0);
      const perimetro = 2 * (a.x1 - a.x0 + a.y1 - a.y0) + 2 * (b.x1 - b.x0 + b.y1 - b.y0) - 2 * comum;
      return (area + (perimetro * e) / 2 + e * e) / 1e6;
    };
    const yFundo = Math.max(...envLocal.map((p) => p.y));
    let melhor: { D1: number; r2: Retangulo; proj: number; fundo: number } | null = null;
    for (let D1 = 3000; D1 <= D; D1 += 500) {
      const r1 = r1De(D1);
      for (let d2 = 3000; r1.y1 + d2 <= yFundo + 1e-9; d2 += 250) {
        const f = faixaDoLote(envLocal, r1.y1, r1.y1 + d2, x0 + Math.min(W, 3000) / 2);
        if (!f) break;
        let r2: Retangulo = { x0: Math.ceil(f.xMin / hip.malhaMm - 1e-9) * hip.malhaMm, x1: piso(f.xMax, hip.malhaMm), y0: r1.y1, y1: r1.y1 + d2 };
        if (r2.x1 - r2.x0 < 3000 || Math.min(r2.x1, r1.x1) - Math.max(r2.x0, r1.x0) < 3000) break;
        // Passou do teto: o anexo estreita (preso do lado do encosto), sem ficar abaixo de 3 m nem soltar do da frente.
        if (projecaoDe(r1, r2) > alvo) {
          const sobra = ((projecaoDe(r1, r2) - alvo) * 1e6) / (d2 + e);
          const w2 = Math.max(3000, piso(r2.x1 - r2.x0 - sobra, hip.malhaMm));
          r2 = hip.encostarNaDivisa === 'DIREITA' ? { ...r2, x0: r2.x1 - w2 } : { ...r2, x1: r2.x0 + w2 };
          if (Math.min(r2.x1, r1.x1) - Math.max(r2.x0, r1.x0) < 3000 || projecaoDe(r1, r2) > alvo + 0.5) continue;
        }
        // Degrau entre os dois de 0 ou ≥ 3 m: o de menos vira uma faixa que o gerador toma por anexo (estreita para
        // qualquer cômodo) — aparado no da frente. Os dois na mesma largura são um retângulo (já comparado): fora.
        if (r2.x1 > r1.x1 && r2.x1 - r1.x1 < 3000) r2 = { ...r2, x1: r1.x1 };
        if (r2.x0 < r1.x0 && r1.x0 - r2.x0 < 3000) r2 = { ...r2, x0: r1.x0 };
        if ((r1.x1 > r2.x1 && r1.x1 - r2.x1 < 3000) || (r2.x0 > r1.x0 && r2.x0 - r1.x0 < 3000)) continue;
        if (r2.x0 === r1.x0 && r2.x1 === r1.x1) continue;
        const proj = projecaoDe(r1, r2);
        const c = { D1, r2, proj, fundo: D1 + d2 };
        const valor = (x: typeof c) => Math.min(x.proj, alvo);
        if (!melhor || valor(c) > valor(melhor) + 0.5 || (Math.abs(valor(c) - valor(melhor)) <= 0.5 && c.fundo < melhor.fundo)) melhor = c;
        if (proj >= alvo - 0.5) break;
      }
    }
    const projRet = projecao(W, D);
    if (melhor && (melhor.proj > projRet + 1 || (Math.abs(melhor.proj - projRet) <= 1 && melhor.fundo < D - 1000))) {
      const r1 = r1De(melhor.D1);
      const r2 = melhor.r2;
      D = melhor.D1;
      projecaoDoL = melhor.proj;
      contornoLocal = anelDoL(r1, r2);
      if (melhor.proj >= alvo - 0.5 && limitante === 'ENVELOPE') limitante = teto.limitante;
      avisos.push(`Casa em L: ${f2(W / 1000)} × ${f2(D / 1000)} m na frente e um anexo de ${f2((r2.x1 - r2.x0) / 1000)} × ${f2((r2.y1 - r2.y0) / 1000)} m atrás — o retângulo não comportava o programa.`);
    }
  }

  const retanguloLocal: Retangulo = { x0, y0, x1: x0 + W, y1: y0 + D };
  const cantosLocais = [
    { x: retanguloLocal.x0, y: retanguloLocal.y0 },
    { x: retanguloLocal.x1, y: retanguloLocal.y0 },
    { x: retanguloLocal.x1, y: retanguloLocal.y1 },
    { x: retanguloLocal.x0, y: retanguloLocal.y1 },
  ];
  // Dentro do envelope por construção: é um pedaço do maior retângulo inscrito nele (e o anexo, da faixa dele).
  const anelNoMundo = (contornoLocal ?? cantosLocais).map((p) => paraMundo(quadro, p));

  const projecaoM2 = projecaoDoL ?? projecao(W, D);
  if (limitante !== 'PROGRAMA') {
    avisos.push(`O programa pede ${f2(projecaoPedidaM2)} m² de projeção; ${ROTULO_DO_LIMITANTE[limitante]} ${/^(os|as) /.test(ROTULO_DO_LIMITANTE[limitante]) ? 'permitem' : 'permite'} ${f2(projecaoM2)} m² — as áreas dos ambientes serão reduzidas.`);
  }
  if (legal.faltam.length) avisos.push(`Sem dado da zona: ${legal.faltam.join(', ')} — esse limite não foi aplicado.`);

  const alinhadaAoDesenho = [quadro.ex.x, quadro.ex.y].every((v) => v === 0 || Math.abs(v) === 1);
  return {
    ok: true,
    implantacao: {
      retanguloLocal,
      anelNoMundo,
      quadro,
      direcaoDaFrente: { x: 0 - quadro.ey.x || 0, y: 0 - quadro.ey.y || 0 },
      alinhadaAoDesenho,
      limitante,
      pavimentos: pav,
      vagasDescobertas: vagasDescobertasLocal,
      contornoLocal,
      medidas: {
        loteM2: m2(loteM2),
        projecaoPedidaM2,
        projecaoM2: m2(projecaoM2),
        implantacaoMaxM2: legal.implantacaoMaxM2,
        envelopeM2: m2(Math.abs(polygonArea(env.anel)) / 1e6),
        potencialM2: legal.potencialM2,
        impermeavelMaxM2: impermeavelMaxM2 == null ? null : m2(impermeavelMaxM2),
        toPct: pct((projecaoM2 / loteM2) * 100),
        toMaxPct: ctx.zona.taxaOcupacaoMaxPct,
        coeficiente: Math.round(((projecaoM2 * pav) / loteM2) * 100) / 100,
        coeficienteMax: ctx.zona.coeficienteMax,
        permeabilidadePct: pct(((loteM2 - projecaoM2 - pavimentacaoM2) / loteM2) * 100),
        permeabilidadeMinPct: permMin,
      },
      avisos,
    },
  };
}

/** Texto de uma linha para a tela e o relatório. */
export function resumoDaImplantacao(i: ImplantacaoDaCasa): string {
  const m = i.medidas;
  return `${f2((i.retanguloLocal.x1 - i.retanguloLocal.x0) / 1000)} × ${f2((i.retanguloLocal.y1 - i.retanguloLocal.y0) / 1000)} m · projeção ${f2(m.projecaoM2)} m² · TO ${f1(m.toPct)} %${m.toMaxPct != null ? ` (máx. ${f1(m.toMaxPct)} %)` : ''}${i.pavimentos > 1 ? ` · ${i.pavimentos} pavimentos, CA ${f2(m.coeficiente)}${m.coeficienteMax != null ? ` (máx. ${f2(m.coeficienteMax)})` : ''}` : ''} · permeável ${f1(m.permeabilidadePct)} %${m.permeabilidadeMinPct != null ? ` (mín. ${f1(m.permeabilidadeMinPct)} %)` : ''} · limitada ${LIMITADA_POR[i.limitante]}`;
}

// ─── F3: O ORQUESTRADOR ─────────────────────────────────────────────────────
//
// Molde de `gerarPpci`/`gerarClimatizacao`: cada etapa planeja sobre a CÓPIA de
// trabalho já com as anteriores aplicadas (`applyBatch`), o plano acumula os
// comandos e os ids criados, e `conferirPlanoDaCasa` reaplica no original antes de
// gravar — o kernel dá ids determinísticos (`seq` por prefixo), então o mesmo lote
// no mesmo original cria os MESMOS ids. Um `runBatch`, um Ctrl+Z.
//
// Só a ARQUITETURA é fatal: sem paredes, nenhuma etapa seguinte tem o que fazer.
// As outras (F4 em diante) falham com motivo e o plano segue.
//
// SEMENTES: o E6.2 é determinístico por semente. Achado da F2: num lote estreito
// a área de serviço fica sem lado externo em todas as sementes testadas — então o
// orquestrador gera VÁRIAS e fica com a de menos problemas graves (sem acesso,
// abaixo da mínima, sem fachada exigida); empate → maior nota; empate → menor semente.
//
// QUADRO DA FRENTE: a planta é gerada no quadro local (frente ao sul, `direcaoDaFrente`
// nula) e levada ao mundo. Com a frente num eixo do desenho a transformação é exata.
// Girada, as pontas viram frações e o arredondamento ao mm desfaz a junção em T (o
// kernel só corta parede em interseção EXATA — achado da M6b): a ponta que encontra o
// meio de outra parede passa `ALEM_MM` além, e o offset das aberturas anda junto.
