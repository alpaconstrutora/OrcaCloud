/**
 * ÁGUAS PLUVIAIS — CONTRIBUIÇÃO (29/09/2026, E6.1 do roadmap hidrossanitário,
 * NBR 10844:1989).
 *
 * De cada ÁGUA do telhado e de cada LAJE descoberta sai a vazão de projeto que
 * a calha (E6.2) e os condutores (E6.3) vão dimensionar:
 *
 *   - ÁREA DE CONTRIBUIÇÃO (NBR 10844, 5.2): a superfície inclinada conta a
 *     projeção MAIS metade da altura — A = (a + h/2)·b. Com a projeção de área
 *     Ap e a inclinação i (h = a·i), A = Ap·(1 + i/2), para qualquer contorno;
 *     a laje plana conta a projeção. As paredes que interceptam a chuva (5.2.2)
 *     ficam fora — declarado no memorial;
 *   - INTENSIDADE (5.1): a informada no estudo; senão a da TABELA pela cidade e
 *     pelo período de retorno (5.1.2: 1 ano onde empoçar é tolerável, 5 anos
 *     para coberturas e terraços, 25 anos onde não se tolera extravasamento);
 *     senão, com até 100 m² de projeção, os 150 mm/h que a norma permite adotar
 *     (5.1.4). Sem nada disso não há cálculo — a pendência diz o que falta;
 *   - VAZÃO (5.3): Q = I·A/60, em L/min (I em mm/h, A em m²).
 *
 * LAJE DESCOBERTA: a laje do último pavimento que não está sob nenhuma água do
 * telhado (o terraço, a laje impermeabilizada). A de pavimento intermediário
 * não entra — sem saber o que há em cima, o sistema não inventa terraço.
 *
 * Tudo derivado do modelo e das premissas do estudo; nada gravado.
 */
import type { Agua, BlueprintModel, ObjectId, Point, SecaoDeCalha } from './blueprintKernel';
import { extensaoVerticalDaCaixa, pegadaEmPlanta, pointInPolygon, polygonArea } from './blueprintKernel';
import { fazerChave } from './blueprintGrafoDeRede';

/** Os períodos de retorno da NBR 10844 (5.1.2), em anos. */
export const PERIODOS_DE_RETORNO = [1, 5, 25] as const;
export type PeriodoDeRetorno = (typeof PERIODOS_DE_RETORNO)[number];

export interface HipotesesPluviais {
  /** A cidade da tabela de intensidades (`INTENSIDADE_POR_CIDADE`); `null` = nenhuma escolhida. */
  cidade: string | null;
  periodoDeRetornoAnos: PeriodoDeRetorno;
  /** A intensidade informada pelo projetista, mm/h — vale sobre a tabela. `null` = usar a tabela. */
  intensidadeMmH: number | null;
  /** E6.2: a seção das calhas lançadas. */
  secaoDaCalha: SecaoDeCalha;
  /** E6.2: o material da calha — a chave da rugosidade (`RUGOSIDADE_DA_CALHA`). */
  materialDaCalha: string;
  /** E6.2: a declividade das calhas lançadas, % (nunca abaixo de 0,5). */
  declividadeDaCalhaPct: number;
  /** E6.3: a declividade dos condutores horizontais lançados, % (nunca abaixo de 0,5). */
  declividadeDoCondutorPct: number;
  /** E6.3: a profundidade do condutor enterrado no pé do vertical, mm abaixo do piso. */
  profundidadeDoCondutorMm: number;
}

export const HIPOTESES_PLUVIAIS_PADRAO: HipotesesPluviais = {
  cidade: null,
  periodoDeRetornoAnos: 5,
  intensidadeMmH: null,
  secaoDaCalha: 'SEMICIRCULAR',
  materialDaCalha: 'PLASTICO_METAL',
  declividadeDaCalhaPct: 0.5,
  declividadeDoCondutorPct: 1,
  profundidadeDoCondutorMm: 300,
};

/**
 * Intensidade pluviométrica (mm/h) para chuva de 5 minutos, por período de
 * retorno de 1, 5 e 25 anos — NBR 10844:1989, Tabela 5 (a norma lista mais de
 * 100 postos; aqui as capitais mais usadas).
 *
 * ⚠️ TRANSCRITA DE MEMÓRIA — CONFERIR NA NORMA antes de emitir. Está num lugar
 * só; na dúvida, informe a intensidade no estudo (ela vale sobre a tabela).
 */
export const INTENSIDADE_POR_CIDADE: Readonly<Record<string, Readonly<Record<PeriodoDeRetorno, number>>>> = {
  'Belém': { 1: 138, 5: 157, 25: 185 },
  'Belo Horizonte': { 1: 132, 5: 227, 25: 230 },
  'Cuiabá': { 1: 144, 5: 190, 25: 230 },
  'Curitiba': { 1: 132, 5: 204, 25: 228 },
  'Florianópolis': { 1: 114, 5: 120, 25: 144 },
  'Fortaleza': { 1: 120, 5: 156, 25: 180 },
  'Goiânia': { 1: 120, 5: 178, 25: 192 },
  'Manaus': { 1: 138, 5: 180, 25: 198 },
  'Porto Alegre': { 1: 118, 5: 146, 25: 167 },
  'Rio de Janeiro': { 1: 122, 5: 167, 25: 227 },
  'Salvador': { 1: 108, 5: 122, 25: 145 },
  'São Paulo': { 1: 122, 5: 172, 25: 191 },
  'Vitória': { 1: 102, 5: 156, 25: 210 },
};

/** A intensidade que a norma permite adotar para até 100 m² de projeção (5.1.4). */
export const INTENSIDADE_ATE_100M2_MMH = 150;
export const AREA_DA_INTENSIDADE_PADRAO_M2 = 100;

export type OrigemDaIntensidade = 'INFORMADA' | 'TABELA' | 'ATE_100M2';

export interface SuperficieDeContribuicao {
  tipo: 'AGUA' | 'LAJE';
  /** O id da água do telhado ou da laje. */
  id: ObjectId;
  levelId: ObjectId;
  rotulo: string;
  areaProjecaoM2: number;
  inclinacaoPct: number;
  /** A área de contribuição da NBR 10844 (5.2). */
  areaContribuicaoM2: number;
  /** Q = I·A/60 — `null` sem intensidade. */
  vazaoLMin: number | null;
  /** O beiral (a aresta baixa da água), onde corre a calha; `null` na laje. */
  beiral: { a: Point; b: Point } | null;
}

export interface ContribuicaoPluvial {
  superficies: SuperficieDeContribuicao[];
  areaProjecaoTotalM2: number;
  areaContribuicaoTotalM2: number;
  intensidadeMmH: number | null;
  origem: OrigemDaIntensidade | null;
  vazaoTotalLMin: number | null;
  /** O que falta para calcular — vazio quando há intensidade. */
  pendencias: string[];
}

const mm2ParaM2 = (a: number) => a / 1e6;

/** A área de contribuição de uma superfície de projeção `Ap` (m²) e inclinação `i` (%): Ap·(1 + i/2). */
export function areaDeContribuicaoM2(areaProjecaoM2: number, inclinacaoPct: number): number {
  return areaProjecaoM2 * (1 + inclinacaoPct / 100 / 2);
}

/** Q = I·A/60, em L/min. */
export function vazaoDeProjetoLMin(intensidadeMmH: number, areaM2: number): number {
  return (intensidadeMmH * areaM2) / 60;
}

/** A intensidade de projeto e de onde ela veio, ou `null` quando nada a determina. */
export function intensidadeDeProjeto(hip: HipotesesPluviais, areaProjecaoTotalM2: number): { mmH: number; origem: OrigemDaIntensidade } | null {
  if (hip.intensidadeMmH != null && hip.intensidadeMmH > 0) return { mmH: hip.intensidadeMmH, origem: 'INFORMADA' };
  const linha = hip.cidade ? INTENSIDADE_POR_CIDADE[hip.cidade] : undefined;
  if (linha) return { mmH: linha[hip.periodoDeRetornoAnos], origem: 'TABELA' };
  if (areaProjecaoTotalM2 <= AREA_DA_INTENSIDADE_PADRAO_M2) return { mmH: INTENSIDADE_ATE_100M2_MMH, origem: 'ATE_100M2' };
  return null;
}

const beiralDa = (a: Agua) => ({ a: a.pontos[a.beiralIndex], b: a.pontos[(a.beiralIndex + 1) % a.pontos.length] });

/** As águas do telhado e as lajes descobertas do último pavimento, com a área e a vazão de cada uma. */
export function contribuicaoPluvial(model: BlueprintModel, hip: HipotesesPluviais): ContribuicaoPluvial {
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const nomeDoNivel = new Map(niveis.map((l) => [l.id, l.name]));
  const aguas = [...(model.roofs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const sup: Omit<SuperficieDeContribuicao, 'vazaoLMin'>[] = aguas.map((a, i) => {
    const ap = mm2ParaM2(polygonArea(a.pontos));
    return {
      tipo: 'AGUA', id: a.id, levelId: a.levelId, rotulo: `Água ${i + 1} · ${nomeDoNivel.get(a.levelId) ?? ''}`.trim(),
      areaProjecaoM2: ap, inclinacaoPct: a.inclinacaoPct, areaContribuicaoM2: areaDeContribuicaoM2(ap, a.inclinacaoPct), beiral: beiralDa(a),
    };
  });
  const ultimo = niveis[niveis.length - 1];
  if (ultimo) {
    const sobTelhado = (p: { x: number; y: number }) => aguas.some((a) => pointInPolygon(a.pontos, p as Point));
    const lajes = (model.structures ?? []).filter((s) => s.kind === 'LAJE' && s.levelId === ultimo.id).sort((a, b) => a.id.localeCompare(b.id));
    lajes.forEach((l, i) => {
      const contorno = pegadaEmPlanta(l);
      const c = contorno.reduce((s, p) => ({ x: s.x + p.x / contorno.length, y: s.y + p.y / contorno.length }), { x: 0, y: 0 });
      if (sobTelhado(c)) return;
      const ap = mm2ParaM2(polygonArea(contorno));
      sup.push({ tipo: 'LAJE', id: l.id, levelId: l.levelId, rotulo: `Laje descoberta ${i + 1} · ${ultimo.name}`, areaProjecaoM2: ap, inclinacaoPct: 0, areaContribuicaoM2: ap, beiral: null });
    });
  }
  const areaProjecaoTotalM2 = sup.reduce((s, x) => s + x.areaProjecaoM2, 0);
  const areaContribuicaoTotalM2 = sup.reduce((s, x) => s + x.areaContribuicaoM2, 0);
  const I = intensidadeDeProjeto(hip, areaProjecaoTotalM2);
  const pendencias: string[] = [];
  if (sup.length === 0) pendencias.push('Nenhuma água de telhado nem laje descoberta no desenho — não há chuva a captar.');
  else if (!I) pendencias.push(`Projeção de ${areaProjecaoTotalM2.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m² (acima de 100 m²): escolha a cidade ou informe a intensidade pluviométrica.`);
  const superficies = sup.map((x) => ({ ...x, vazaoLMin: I ? vazaoDeProjetoLMin(I.mmH, x.areaContribuicaoM2) : null }));
  return {
    superficies,
    areaProjecaoTotalM2,
    areaContribuicaoTotalM2,
    intensidadeMmH: I?.mmH ?? null,
    origem: I?.origem ?? null,
    vazaoTotalLMin: I ? vazaoDeProjetoLMin(I.mmH, areaContribuicaoTotalM2) : null,
    pendencias,
  };
}

// ─── E6.4 — redes independentes ─────────────────────────────────────────────

export interface MisturaDeRedes {
  /** O trecho que encosta na outra rede. */
  trechoId: ObjectId;
  levelId: ObjectId;
  at: { x: number; y: number };
  /** Com o que ele se mistura: o tubo da outra rede, ou a caixa/saída dela. */
  com: 'TRECHO' | 'CAIXA';
}

const CAIXAS_DO_ESGOTO = new Set(['CAIXA_INSPECAO', 'CAIXA_GORDURA', 'CAIXA_SIFONADA', 'RALO_SIFONADO', 'LIGACAO_ESGOTO']);
const CAIXAS_DA_PLUVIAL = new Set(['CAIXA_AREIA', 'LIGACAO_PLUVIAL']);

/**
 * Onde a rede PLUVIAL encosta na de ESGOTO (NBR 10844: as águas pluviais não
 * vão para a rede de esgoto; NBR 8160: o esgoto não vai para a pluvial): a
 * ponta de um tubo no nó de um tubo da outra rede, ou dentro de uma caixa ou
 * saída da outra rede. Vazio = redes independentes.
 */
export function misturasPluvialEsgoto(model: BlueprintModel): MisturaDeRedes[] {
  const chave = fazerChave(model.levels);
  const trechos = (model.trechos ?? []).filter((t) => t.disciplina === 'PLUVIAL' || t.disciplina === 'ESGOTO');
  const pontas = trechos.flatMap((t) => [
    { t, p: t.a, cota: t.cotaAMm },
    { t, p: t.b, cota: t.cotaBMm },
  ]);
  const nosDe = (d: string) => new Set(pontas.filter((x) => x.t.disciplina === d).map((x) => chave(x.t.levelId, x.p.x, x.p.y, x.cota)));
  const nos = { PLUVIAL: nosDe('PLUVIAL'), ESGOTO: nosDe('ESGOTO') };
  const caixas = (model.terminais ?? []).filter((t) => t.tipoHidraulico && (CAIXAS_DO_ESGOTO.has(t.tipoHidraulico) || CAIXAS_DA_PLUVIAL.has(t.tipoHidraulico)));
  const saida: MisturaDeRedes[] = [];
  const vistos = new Set<string>();
  for (const { t, p, cota } of pontas) {
    const outra = t.disciplina === 'PLUVIAL' ? 'ESGOTO' : 'PLUVIAL';
    const k = chave(t.levelId, p.x, p.y, cota);
    let com: MisturaDeRedes['com'] | null = nos[outra].has(k) ? 'TRECHO' : null;
    if (!com) {
      const daOutra = outra === 'ESGOTO' ? CAIXAS_DO_ESGOTO : CAIXAS_DA_PLUVIAL;
      const caixa = caixas.find((c) => daOutra.has(c.tipoHidraulico!) && c.at.x === p.x && c.at.y === p.y && chave(c.levelId, p.x, p.y, 0) === chave(t.levelId, p.x, p.y, 0));
      if (caixa) {
        const ext = extensaoVerticalDaCaixa(caixa) ?? { fundoMm: caixa.cotaMm, topoMm: caixa.cotaMm };
        if (cota >= ext.fundoMm - 1 && cota <= ext.topoMm + 1) com = 'CAIXA';
      }
    }
    if (!com || vistos.has(`${t.id}|${p.x},${p.y}`)) continue;
    vistos.add(`${t.id}|${p.x},${p.y}`);
    saida.push({ trechoId: t.id, levelId: t.levelId, at: { x: p.x, y: p.y }, com });
  }
  return saida.sort((a, b) => a.trechoId.localeCompare(b.trechoId) || a.at.x - b.at.x || a.at.y - b.at.y);
}
