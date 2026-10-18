/**
 * F25 da casa automática (17/10/2026): o TERRENO INCLINADO — a casa assenta num PLATÔ ÚNICO (decisão do usuário,
 * 16/10/2026: "na cota que equilibra corte e aterro sob a projeção; corte/aterro no orçamento; talude ou arrimo nas
 * bordas acima de uma hipótese; escada/rampa na entrada").
 *
 *  - A cota do platô é a de EQUILÍBRIO sob a projeção da casa (face externa das paredes) — `cotaDeEquilibrio`.
 *  - O platô é a projeção crescida pela margem (a calçada em volta); o piso do térreo fica `pisoAcimaDoPlatoMm` acima.
 *  - Cada borda do platô leva TALUDE (1:h de corte ou de aterro) ou, quando a altura passa da hipótese ou o talude não
 *    cabe no lote, MURO DE ARRIMO. Volumes, bota-fora/empréstimo e muros pela `terraplenagemComTalude` da topografia.
 *  - A entrada: o desnível da calçada da rua ao piso vira rampa (até a inclinação máxima, se cabe no recuo de frente)
 *    ou escada (espelho máximo, piso do degrau).
 *
 * Puro: recebe a grade do terreno, a projeção no mundo e o lote; devolve a cota do térreo e o resumo.
 */
import { anelRecuado, pointInPolygon, polygonArea, signedArea, type Point } from './blueprintKernel';
import { amostradorDaGrade, type GradeDeElevacao } from './blueprintTopografia';
import { PARAMETROS_PADRAO, cotaDeEquilibrio, terraplenagemComTalude, type ParametrosDeTerraplenagem } from './blueprintTopografiaAnalises';

export interface HipotesesDaTerraplenagemDaCasa {
  /** `false` = a casa fica na cota zero do desenho, como antes (o terreno só entra nas cotas da hidráulica). */
  lancar: boolean;
  /** O platô passa a projeção da casa por esta margem em volta (calçada, beiral), mm. */
  margemDoPlatoMm: number;
  /** O piso do térreo acima do platô, mm. */
  pisoAcimaDoPlatoMm: number;
  /** Acima desta altura (m), a borda leva muro de arrimo em vez de talude. */
  alturaMaximaDoTaludeM: number;
  /** Os taludes, o empolamento e a contração — os mesmos da aba de terraplenagem. */
  parametros: ParametrosDeTerraplenagem;
  /** Rampa da entrada até esta inclinação, % (NBR 9050: 8,33). */
  rampaMaximaPct: number;
  /** Espelho máximo do degrau da escada da entrada, mm. */
  espelhoMaximoMm: number;
  /** Piso do degrau, mm. */
  pisoDoDegrauMm: number;
  /** Até este desnível da calçada ao piso, nada a fazer (soleira), mm. */
  desnivelSemDegrauMm: number;
}

export const HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO: HipotesesDaTerraplenagemDaCasa = {
  lancar: true,
  margemDoPlatoMm: 1000,
  pisoAcimaDoPlatoMm: 150,
  alturaMaximaDoTaludeM: 1.5,
  parametros: PARAMETROS_PADRAO,
  rampaMaximaPct: 8.33,
  espelhoMaximoMm: 180,
  pisoDoDegrauMm: 280,
  desnivelSemDegrauMm: 20,
};

export interface BordaDoPlato {
  aresta: number;
  a: Point;
  b: Point;
  comprimentoM: number;
  /** A maior distância vertical entre o platô e o terreno ao longo dela, m (+ corte, − aterro na mais alta). */
  alturaMaxM: number;
  lado: 'CORTE' | 'ATERRO' | 'NENHUM';
  solucao: 'TALUDE' | 'MURO' | 'NENHUMA';
  /** Por que muro (altura acima da hipótese, ou o talude sai do lote). */
  motivo: string | null;
}

export interface EntradaDoPlato {
  tipo: 'NENHUMA' | 'RAMPA' | 'ESCADA';
  /** Piso − calçada da rua, mm (+ a casa acima da rua). */
  desnivelMm: number;
  comprimentoMm: number;
  degraus: number;
  espelhoMm: number;
  /** O recuo de frente comporta. */
  cabe: boolean;
}

export interface ResumoDaTerraplenagem {
  cotaDoPlatoM: number;
  /** A cota do térreo no desenho (relativa à cota zero), mm — já com o piso acima do platô. */
  elevacaoDoTerreoMm: number;
  platoNoMundo: Point[];
  areaPlatoM2: number;
  corteM3: number;
  aterroM3: number;
  botaForaM3: number;
  emprestimoM3: number;
  alturaMaxCorteM: number;
  alturaMaxAterroM: number;
  areaTaludeM2: number;
  bordas: BordaDoPlato[];
  murosComprimentoM: number;
  murosAreaDeFaceM2: number;
  entrada: EntradaDoPlato;
  parametros: ParametrosDeTerraplenagem;
}

export type PlanoDoPlato = { ok: true; resumo: ResumoDaTerraplenagem } | { ok: false; motivo: string };

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * O platô da casa. `projecao` = o anel dos EIXOS das paredes externas no mundo (a implantação); `meiaParedeMm` leva à
 * face. `pontoDaRua` = onde a entrada encontra a calçada (a divisa da frente diante da casa); `recuoDeFrenteMm` = quanto
 * há da rua à casa para a rampa.
 */
export function platoDaCasa(
  grade: GradeDeElevacao,
  cotaZeroM: number,
  projecao: readonly Point[],
  meiaParedeMm: number,
  anelDoLote: readonly Point[] | null,
  pontoDaRua: Point | null,
  recuoDeFrenteMm: number,
  hip: HipotesesDaTerraplenagemDaCasa = HIPOTESES_DA_TERRAPLENAGEM_DA_CASA_PADRAO,
): PlanoDoPlato {
  const face = anelRecuado([...projecao], projecao.map(() => -meiaParedeMm));
  if (face.length < 3) return { ok: false, motivo: 'a projeção da casa não fecha' };
  const cota = cotaDeEquilibrio(grade, face);
  if (cota == null) return { ok: false, motivo: 'a topografia não cobre a projeção da casa — amplie a área do levantamento' };
  const plato = anelRecuado(face, face.map(() => -hip.margemDoPlatoMm));
  if (plato.length < 3) return { ok: false, motivo: 'o platô não fecha' };
  const terreno = amostradorDaGrade(grade);
  const sentido = signedArea(plato) > 0 ? 1 : -1;

  // As bordas: a altura ao longo de cada uma; talude ou muro.
  const H = (lado: 'CORTE' | 'ATERRO') => (lado === 'CORTE' ? hip.parametros.taludeCorteH : hip.parametros.taludeAterroH);
  const bordas: BordaDoPlato[] = plato.map((a, i) => {
    const b = plato[(i + 1) % plato.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    // Para FORA do platô: anti-horário → a direita do sentido a → b.
    const fora = L > 0 ? { x: ((b.y - a.y) / L) * sentido, y: (-(b.x - a.x) / L) * sentido } : { x: 0, y: 0 };
    let corte = 0;
    let aterro = 0;
    const n = Math.max(2, Math.ceil(L / 250));
    const pontos: Point[] = [];
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      pontos.push(p);
      const z = terreno(p);
      if (z == null) continue;
      corte = Math.max(corte, z - cota);
      aterro = Math.max(aterro, cota - z);
    }
    const lado: BordaDoPlato['lado'] = corte < 0.01 && aterro < 0.01 ? 'NENHUM' : corte >= aterro ? 'CORTE' : 'ATERRO';
    const altura = lado === 'CORTE' ? corte : lado === 'ATERRO' ? aterro : 0;
    let solucao: BordaDoPlato['solucao'] = lado === 'NENHUM' ? 'NENHUMA' : 'TALUDE';
    let motivo: string | null = null;
    if (lado !== 'NENHUM' && altura > hip.alturaMaximaDoTaludeM) {
      solucao = 'MURO';
      motivo = `${r2(altura).toLocaleString('pt-BR')} m acima de ${hip.alturaMaximaDoTaludeM.toLocaleString('pt-BR')} m`;
    } else if (lado !== 'NENHUM' && anelDoLote && anelDoLote.length >= 3) {
      // O pé (aterro) ou a crista (corte) do talude a altura × h da borda: dentro do lote?
      const alcance = altura * H(lado) * 1000;
      const sai = pontos.some((p) => !pointInPolygon([...anelDoLote], { x: p.x + fora.x * alcance, y: p.y + fora.y * alcance }));
      if (sai) {
        solucao = 'MURO';
        motivo = `o talude (${r2(alcance / 1000).toLocaleString('pt-BR')} m) sai do lote`;
      }
    }
    return { aresta: i, a, b, comprimentoM: r2(L / 1000), alturaMaxM: r2(altura), lado, solucao, motivo };
  });

  const parametros: ParametrosDeTerraplenagem = {
    ...hip.parametros,
    taludePorAresta: bordas.map((x) => (x.solucao === 'MURO' ? { muro: true } : null)),
  };
  const t = terraplenagemComTalude(grade, plato, cota, parametros);

  // A entrada: da calçada da rua ao piso.
  const piso = cota + hip.pisoAcimaDoPlatoMm / 1000;
  const rua = pontoDaRua ? terreno(pontoDaRua) : null;
  const desnivelMm = rua == null ? 0 : Math.round((piso - rua) * 1000);
  const d = Math.abs(desnivelMm);
  let entrada: EntradaDoPlato = { tipo: 'NENHUMA', desnivelMm, comprimentoMm: 0, degraus: 0, espelhoMm: 0, cabe: true };
  if (d > hip.desnivelSemDegrauMm) {
    const rampa = Math.ceil(d / (hip.rampaMaximaPct / 100));
    if (rampa <= recuoDeFrenteMm) entrada = { tipo: 'RAMPA', desnivelMm, comprimentoMm: rampa, degraus: 0, espelhoMm: 0, cabe: true };
    else {
      const degraus = Math.ceil(d / hip.espelhoMaximoMm);
      const comprimento = degraus * hip.pisoDoDegrauMm;
      entrada = { tipo: 'ESCADA', desnivelMm, comprimentoMm: comprimento, degraus, espelhoMm: Math.round(d / degraus), cabe: comprimento <= recuoDeFrenteMm };
    }
  }

  return {
    ok: true,
    resumo: {
      cotaDoPlatoM: Math.round(cota * 1000) / 1000,
      elevacaoDoTerreoMm: Math.round((cota - cotaZeroM) * 1000) + hip.pisoAcimaDoPlatoMm,
      platoNoMundo: plato,
      areaPlatoM2: r2(Math.abs(polygonArea(plato)) / 1e6),
      corteM3: r2(t.corteTotalM3),
      aterroM3: r2(t.aterroTotalM3),
      botaForaM3: r2(t.botaForaM3),
      emprestimoM3: r2(t.emprestimoM3),
      alturaMaxCorteM: r2(t.alturaMaxCorteM),
      alturaMaxAterroM: r2(t.alturaMaxAterroM),
      areaTaludeM2: r2(t.areaTaludeM2),
      bordas,
      murosComprimentoM: r2(t.murosComprimentoM),
      murosAreaDeFaceM2: r2(t.murosAreaDeFaceM2),
      entrada,
      parametros,
    },
  };
}
