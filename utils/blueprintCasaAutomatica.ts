/**
 * CASA AUTOMÁTICA (14/10/2026, plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * Do terreno + zona do Mapa Regulatório + programa curto (F1) à casa térrea
 * completa, num lote só de comandos. Este arquivo é o motor PURO; cada fase do
 * plano acrescenta uma etapa.
 *
 * ─── F2: IMPLANTAÇÃO PELA LEI ──────────────────────────────────────────────
 *
 * O gerador E6.2 PREENCHE o retângulo que recebe, ampliando as áreas do programa
 * até caber (é como ele faz planta de apartamento: a unidade é dada). Para a
 * casa, entregar o envelope dos recuos inteiro faz a casa ocupar o lote todo e
 * estourar a TO. Por isso a implantação vem antes: ela escolhe o retângulo que o
 * programa pede, limitado por (o menor vence, e o vencedor é DITO):
 *
 *   - TO × lote, com a folga das hipóteses;
 *   - o envelope dos recuos (o maior retângulo inscrito nele);
 *   - CA × lote (térrea: a área construída inteira conta);
 *   - a permeabilidade: lote × (1 − perm. mín.) − pavimentação externa − vagas descobertas.
 *
 * A casa encosta no recuo de FRENTE e na divisa escolhida (direita/esquerda de
 * quem está na rua olhando para o lote — a convenção de `papeisSugeridos`).
 *
 * ─── O QUADRO DA FRENTE ────────────────────────────────────────────────────
 *
 * O E6.2 só trabalha com eixos alinhados. Lote girado (desenhado no mapa, por
 * azimutes) teria o maior retângulo alinhado minúsculo. A conta é feita num
 * quadro LOCAL alinhado à frente — +y é a normal interna da divisa FRENTE, +x a
 * mão direita de quem olha da rua —, e a `transformacao` leva ao mundo. Com a
 * frente num eixo do desenho a transformação é exata (cos/sin 0 ou ±1).
 */
import { applyBatch, point, polygonArea, snapshotHash, type BlueprintModel, type Boundary, type Command, type ObjectId, type Point } from './blueprintKernel';
import { envelopeLegal, type ContextoDaMassa } from './blueprintMassa';
import { envelopeConstrutivo } from './blueprintTerreno';
import { recuosEfetivos } from './blueprintZonaUrbanistica';
import {
  comandosDeAplicacao,
  gerar,
  HIPOTESES_DO_GERADOR_PADRAO,
  maiorRetanguloInscrito,
  type EntradaDoGerador,
  type HipotesesDoGerador,
  type Retangulo,
  type ResultadoDoGerador,
} from './blueprintGerador';
import {
  HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO,
  programaDaCasa,
  resumoDoPrograma,
  type HipotesesDoProgramaDaCasa,
  type Programa,
  type ProgramaCurtoDaCasa,
} from './blueprintPrograma';
import { conferirPrograma } from './blueprintConferenciaDoPrograma';
import { avaliarRegras, loteParaRegras, REGRAS_SEMENTE, type ContextoDeRegras } from './blueprintRegras';
import { ALEM_MM } from './blueprintPavimentoTipoDaMassa';
import { HIPOTESES_EIXOS_PADRAO, propostaDeEixos, type HipotesesDeEixos } from './blueprintEixosAutomaticos';
import { HIPOTESES_PILARES_PADRAO, planejarPilares, type HipotesesDePilares } from './blueprintPilaresAutomaticos';
import {
  HIPOTESES_LAJES_PADRAO,
  HIPOTESES_VIGAS_PADRAO,
  planejarLajes,
  planejarVigas,
  type HipotesesDeLajes,
  type HipotesesDeVigas,
} from './blueprintVigasLajesAutomaticas';
import { HIPOTESES_FUNDACOES_PADRAO, planejarFundacoes, type HipotesesDeFundacoes } from './blueprintFundacoesAutomaticas';
import type { PendenciaDoPpci, SituacaoDaEtapa } from './blueprintGeradorPpci';

// ─── Hipóteses ──────────────────────────────────────────────────────────────

export type DivisaDeEncosto = 'ESQUERDA' | 'DIREITA' | 'CENTRO';

export interface HipotesesDaImplantacao {
  /** Fica esta porcentagem ABAIXO da TO máxima (folga para beiral, ajuste de obra). */
  folgaDaTOPct: number;
  encostarNaDivisa: DivisaDeEncosto;
  /** Largura (ao longo da frente) ÷ profundidade do retângulo da casa. */
  proporcaoFrenteFundo: number;
  /** Calçadas, acesso e quintal pavimentado, em % do lote — conta como impermeável. */
  pavimentacaoExternaPctDoLote: number;
  /** Área de cada vaga descoberta (impermeável), m². */
  areaPorVagaDescobertaM2: number;
  /** Retângulo (eixos das paredes) ÷ área útil do programa: as paredes internas comem área. */
  fatorDoRetanguloSobreUtil: number;
  /** Espessura da parede externa (a mesma do gerador) — a projeção conta meia de cada lado. */
  espessuraExternaMm: number;
  /** A malha do gerador: as medidas do retângulo são múltiplas dela. */
  malhaMm: number;
}

export const HIPOTESES_DA_IMPLANTACAO_PADRAO: HipotesesDaImplantacao = {
  folgaDaTOPct: 5,
  encostarNaDivisa: 'ESQUERDA',
  proporcaoFrenteFundo: 0.7,
  pavimentacaoExternaPctDoLote: 10,
  areaPorVagaDescobertaM2: 12.5,
  fatorDoRetanguloSobreUtil: 1.08,
  espessuraExternaMm: 200,
  malhaMm: 50,
};

// ─── O quadro da frente ─────────────────────────────────────────────────────

/** Mundo = x·ex + y·ey. `ey` = normal interna da frente; `ex` = mão direita de quem olha da rua. */
export interface QuadroDaFrente {
  ex: Point;
  ey: Point;
}

const exato = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-9 ? Math.sign(v) : v);

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

export type LimitanteDaImplantacao = 'PROGRAMA' | 'TO' | 'ENVELOPE' | 'CA' | 'PERMEABILIDADE';

export const ROTULO_DO_LIMITANTE: Record<LimitanteDaImplantacao, string> = {
  PROGRAMA: 'o programa',
  TO: 'a taxa de ocupação',
  ENVELOPE: 'os recuos',
  CA: 'o coeficiente de aproveitamento',
  PERMEABILIDADE: 'a taxa de permeabilidade',
};

/** Com a preposição contraída — "limitada pelo programa", "pela taxa de ocupação". */
export const LIMITADA_POR: Record<LimitanteDaImplantacao, string> = {
  PROGRAMA: 'pelo programa',
  TO: 'pela taxa de ocupação',
  ENVELOPE: 'pelos recuos',
  CA: 'pelo coeficiente de aproveitamento',
  PERMEABILIDADE: 'pela taxa de permeabilidade',
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
    coeficiente: number;
    coeficienteMax: number | null;
    /** (lote − projeção − pavimentação − vagas descobertas) ÷ lote. */
    permeabilidadePct: number;
    permeabilidadeMinPct: number | null;
  };
  avisos: string[];
}

export type ResultadoDaImplantacao = { ok: true; implantacao: ImplantacaoDaCasa } | { ok: false; motivo: string };

const m2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(v * 10) / 10;
const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const f1 = (v: number) => v.toFixed(1).replace('.', ',');
const piso = (v: number, malha: number) => Math.floor(v / malha + 1e-9) * malha;

/**
 * O retângulo da casa térrea no lote, pela lei. `ctx` é o mesmo do estudo de massa
 * (terreno, divisas com papel, recuos da zona, índices da zona).
 */
export function implantacaoDaCasa(
  ctx: ContextoDaMassa,
  programa: Programa,
  curto: Pick<ProgramaCurtoDaCasa, 'vagas' | 'garagemCoberta'>,
  hipParcial: Partial<HipotesesDaImplantacao> = {},
): ResultadoDaImplantacao {
  const hip = { ...HIPOTESES_DA_IMPLANTACAO_PADRAO, ...hipParcial };
  const terreno = ctx.terreno && ctx.terreno.anel.length >= 3 ? ctx.terreno : null;
  if (!terreno) return { ok: false, motivo: 'Feche o lote (as divisas do terreno) na aba Terreno.' };
  const quadro = quadroDaFrente(ctx.limites, terreno.anel);
  if (!quadro) return { ok: false, motivo: 'Marque a divisa da FRENTE do lote — a casa se implanta a partir dela.' };

  const legal = envelopeLegal(ctx);
  const ef = recuosEfetivos(ctx.recuosBase, { afastamentoProgressivo: ctx.zona.afastamentoProgressivo, recuoFrenteEscalonado: ctx.zona.recuoFrenteEscalonado ?? null }, 3, 1);
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
  const util = resumoDoPrograma(programa).areaIdealComCirculacaoM2;
  const retPedidoM2 = util * hip.fatorDoRetanguloSobreUtil;
  const ladoPedido = Math.sqrt(retPedidoM2 * 1e6);
  const projecaoPedidaM2 = m2(projecao(ladoPedido * Math.sqrt(hip.proporcaoFrenteFundo), ladoPedido / Math.sqrt(hip.proporcaoFrenteFundo)));

  // Os tetos de projeção, cada um com o seu nome.
  const tetos: { limitante: LimitanteDaImplantacao; m2: number }[] = [{ limitante: 'PROGRAMA', m2: projecaoPedidaM2 }];
  if (legal.implantacaoMaxM2 != null) tetos.push({ limitante: 'TO', m2: legal.implantacaoMaxM2 * (1 - hip.folgaDaTOPct / 100) });
  if (legal.potencialM2 != null) tetos.push({ limitante: 'CA', m2: legal.potencialM2 });
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
  W = piso(W, hip.malhaMm);
  D = piso(D, hip.malhaMm);
  if (W < 3000 || D < 3000) return { ok: false, motivo: `Sobra só ${f2(W / 1000)} × ${f2(D / 1000)} m para a casa — ${ROTULO_DO_LIMITANTE[limitante]} aperta demais.` };

  // Posição: no recuo de frente, encostada na divisa escolhida.
  const x0 = hip.encostarNaDivisa === 'ESQUERDA' ? rmax.x0 : hip.encostarNaDivisa === 'DIREITA' ? rmax.x1 - W : piso(rmax.x0 + (Wmax - W) / 2, hip.malhaMm);
  const y0 = rmax.y0;
  const retanguloLocal: Retangulo = { x0, y0, x1: x0 + W, y1: y0 + D };
  const cantosLocais = [
    { x: retanguloLocal.x0, y: retanguloLocal.y0 },
    { x: retanguloLocal.x1, y: retanguloLocal.y0 },
    { x: retanguloLocal.x1, y: retanguloLocal.y1 },
    { x: retanguloLocal.x0, y: retanguloLocal.y1 },
  ];
  // Dentro do envelope por construção: é um pedaço do maior retângulo inscrito nele.
  const anelNoMundo = cantosLocais.map((p) => paraMundo(quadro, p));

  const projecaoM2 = projecao(W, D);
  if (limitante !== 'PROGRAMA') {
    avisos.push(`O programa pede ${f2(projecaoPedidaM2)} m² de projeção; ${ROTULO_DO_LIMITANTE[limitante]} permite ${f2(projecaoM2)} m² — as áreas dos ambientes serão reduzidas.`);
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
        coeficiente: Math.round((projecaoM2 / loteM2) * 100) / 100,
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
  return `${f2((i.retanguloLocal.x1 - i.retanguloLocal.x0) / 1000)} × ${f2((i.retanguloLocal.y1 - i.retanguloLocal.y0) / 1000)} m · projeção ${f2(m.projecaoM2)} m² · TO ${f1(m.toPct)} %${m.toMaxPct != null ? ` (máx. ${f1(m.toMaxPct)} %)` : ''} · permeável ${f1(m.permeabilidadePct)} %${m.permeabilidadeMinPct != null ? ` (mín. ${f1(m.permeabilidadeMinPct)} %)` : ''} · limitada ${LIMITADA_POR[i.limitante]}`;
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

export type EtapaDaCasaId = 'IMPLANTACAO' | 'ARQUITETURA' | 'PILARES' | 'VIGAS' | 'LAJES' | 'FUNDACOES' | 'EIXOS' | 'CONFERENCIA';

/** Rótulo de cada etapa, na ordem em que rodam (a tela e o relatório leem daqui). */
export const ROTULO_DA_ETAPA_DA_CASA: Record<EtapaDaCasaId, string> = {
  IMPLANTACAO: 'Implantação pela lei',
  ARQUITETURA: 'Arquitetura (gerador E6.2)',
  PILARES: 'Pilares',
  VIGAS: 'Vigas',
  LAJES: 'Lajes',
  FUNDACOES: 'Fundações (blocos, estacas, baldrame)',
  EIXOS: 'Eixos (documentam a estrutura)',
  CONFERENCIA: 'Conferência (programa e legislação)',
};
const ORDEM_DAS_ETAPAS = Object.keys(ROTULO_DA_ETAPA_DA_CASA) as EtapaDaCasaId[];

/** F4: as hipóteses da ESTRUTURA — as mesmas das gavetas de lançamento automático (padrões de lá). */
export interface HipotesesDaEstruturaDaCasa {
  /** `false` = a casa sai só com a arquitetura. */
  lancar: boolean;
  eixos: Partial<HipotesesDeEixos>;
  pilares: HipotesesDePilares;
  vigas: HipotesesDeVigas;
  lajes: HipotesesDeLajes;
  fundacoes: HipotesesDeFundacoes;
}

export const HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO: HipotesesDaEstruturaDaCasa = {
  lancar: true,
  eixos: HIPOTESES_EIXOS_PADRAO,
  pilares: HIPOTESES_PILARES_PADRAO,
  vigas: HIPOTESES_VIGAS_PADRAO,
  lajes: HIPOTESES_LAJES_PADRAO,
  fundacoes: HIPOTESES_FUNDACOES_PADRAO,
};

export interface EtapaDaCasa {
  id: EtapaDaCasaId;
  rotulo: string;
  situacao: SituacaoDaEtapa;
  comandos: number;
  nota: string | null;
}

export interface EntradaDaCasa {
  /** O pavimento onde a casa nasce — precisa estar sem paredes. */
  levelId: ObjectId;
  /** Terreno, divisas com papel, recuos e índices da zona (o contexto do estudo de massa). */
  ctx: ContextoDaMassa;
  curto: ProgramaCurtoDaCasa;
  /** Programa já editado pelo usuário; ausente = `programaDaCasa(curto)`. */
  programa?: Programa | null;
  /** A zona inteira para as regras (testada mínima, área mínima do lote…). Ausente = só o que `ctx.zona` tem. */
  zonaDasRegras?: ContextoDeRegras['zona'];
  rotacaoNorteDeg: number | null;
  latitudeGraus: number;
}

export interface HipotesesDaCasa {
  programa: HipotesesDoProgramaDaCasa;
  implantacao: Partial<HipotesesDaImplantacao>;
  gerador: Partial<HipotesesDoGerador>;
  /** As sementes que o E6.2 tenta; fica a de menos problemas graves. */
  sementes: number[];
  estrutura: HipotesesDaEstruturaDaCasa;
}

export const HIPOTESES_DA_CASA_PADRAO: HipotesesDaCasa = {
  programa: HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO,
  implantacao: {},
  gerador: {},
  sementes: [1, 2, 3, 4, 5, 6, 7, 8],
  estrutura: HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO,
};

export interface PlanoDaCasa {
  levelId: ObjectId;
  /** O LOTE: aplicado no modelo original de uma vez, um Ctrl+Z. */
  comandos: Command[];
  /** Os ids que o lote cria, na ordem — para conferir a reaplicação. */
  criados: ObjectId[];
  etapas: EtapaDaCasa[];
  pendencias: PendenciaDoPpci[];
  /** O modelo DEPOIS do lote (a prévia). */
  resultado: BlueprintModel;
  programa: Programa;
  implantacao: ImplantacaoDaCasa | null;
  /** A alternativa do E6.2 escolhida (no quadro da frente). */
  semente: number | null;
  /** Por que esta semente: "2 de 4 sem problema grave; nota 71". */
  escolha: string | null;
  decisoes: string[];
  resumo: {
    areaConstruidaM2: number | null;
    ambientesPedidos: number;
    ambientesAtendidos: number;
    regrasVioladas: number;
    /** F4: peças de estrutura lançadas. */
    estrutura: { eixos: number; pilares: number; vigas: number; lajes: number; blocos: number; estacas: number; baldrames: number };
  };
}

const ESTRUTURA_ZERADA = { eixos: 0, pilares: 0, vigas: 0, lajes: 0, blocos: 0, estacas: 0, baldrames: 0 };

/** Por que o botão "Gerar casa" não roda — `null` = pode. */
export function motivoParaNaoGerar(model: BlueprintModel, levelId: ObjectId | null): string | null {
  if (!levelId || !model.levels.some((l) => l.id === levelId)) return 'Abra um pavimento para gerar a casa.';
  if (model.walls.some((w) => w.levelId === levelId)) return 'O pavimento já tem paredes — a casa automática nasce num pavimento vazio (crie uma alternativa ou limpe o pavimento).';
  return null;
}

/** Os avisos do E6.2 que tornam a planta pior que outra semente sem eles. */
const GRAVE = /sem acesso|abaixo da área mínima|ficou sem lado externo|sem fachada|não coube/i;

/**
 * Problemas graves de uma alternativa: os avisos acima + as regras de AMBIENTE de severidade ERRO
 * violadas (largura e área mínimas, iluminação). Achado de 14/10/2026: o E6.2 dá à faixa íntima uma
 * profundidade só e divide a largura — banheiro de 0,80 × 5,75 m — em TODAS as sementes de um lote
 * de 9 m; escolher pela nota sozinha deixava a pior.
 */
function problemasGraves(r: ResultadoDoGerador): number {
  return r.avisos.filter((a) => GRAVE.test(a)).length + r.regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO' && x.regra.escopo === 'AMBIENTE').length;
}

function escolherSemente(resultados: ResultadoDoGerador[]): { r: ResultadoDoGerador; texto: string } {
  const g = new Map(resultados.map((r) => [r, problemasGraves(r)]));
  const ordem = [...resultados].sort((a, b) => g.get(a)! - g.get(b)! || (b.avaliacao.notaGeral ?? -1) - (a.avaliacao.notaGeral ?? -1) || a.semente - b.semente);
  const r = ordem[0];
  const contagem = resultados.map((x) => g.get(x)!);
  const texto = `semente ${r.semente} de ${resultados.length} tentada(s): ${g.get(r) ? `${g.get(r)} problema(s) grave(s) — o menor entre ${Math.min(...contagem)} e ${Math.max(...contagem)}` : 'sem problema grave'}; nota ${r.avaliacao.notaGeral ?? '—'}`;
  return { r, texto };
}

/** O norte do desenho visto do quadro da frente (mesma convenção de `direcaoDoSol`: norte = (sen θ, cos θ)). */
function norteNoQuadro(q: QuadroDaFrente, rotacaoNorteDeg: number | null): number | null {
  const th = ((rotacaoNorteDeg ?? 0) * Math.PI) / 180;
  const n = { x: Math.sin(th), y: Math.cos(th) };
  const local = Math.round(((Math.atan2(n.x * q.ex.x + n.y * q.ex.y, n.x * q.ey.x + n.y * q.ey.y) * 180) / Math.PI) * 1000) / 1000;
  return rotacaoNorteDeg == null && Math.abs(local) < 1e-9 ? null : local === 0 ? 0 : local;
}

/**
 * As paredes, aberturas e nomes do E6.2 (no quadro da frente) levados ao mundo, nos três
 * comandos de lote. Exata quando a frente cai num eixo; girada, estica as pontas em T.
 */
export function comandosNoMundo(r: ResultadoDoGerador, levelId: ObjectId, q: QuadroDaFrente, exataNoDesenho: boolean): Command[] {
  const base = comandosDeAplicacao(r, levelId);
  const mundo = (p: Point): Point => {
    const m = paraMundo(q, p);
    return point(Math.round(m.x), Math.round(m.y));
  };
  const walls = base.flatMap((c) => (c.type === 'AddWalls' ? c.walls : []));
  const pontas = walls.flatMap((w) => [w.a, w.b]);
  const compartilhada = (p: Point, propria: number) => pontas.some((o, k) => Math.floor(k / 2) !== propria && Math.abs(o.x - p.x) < 1 && Math.abs(o.y - p.y) < 1);
  // Quanto a ponta `a` de cada parede andou para trás (o offset das aberturas cresce o mesmo).
  const andouA = new Map<string, number>();
  const novas = walls.map((w, i) => {
    let a = w.a;
    let b = w.b;
    if (!exataNoDesenho) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / L;
      const uy = (b.y - a.y) / L;
      if (!compartilhada(a, i)) {
        a = { x: a.x - ux * ALEM_MM, y: a.y - uy * ALEM_MM };
        if (w.uid) andouA.set(w.uid, ALEM_MM);
      }
      if (!compartilhada(b, i)) b = { x: b.x + ux * ALEM_MM, y: b.y + uy * ALEM_MM };
    }
    return { ...w, a: mundo(a), b: mundo(b) };
  });
  const out: Command[] = [];
  for (const c of base) {
    if (c.type === 'AddWalls') out.push({ type: 'AddWalls', walls: novas });
    else if (c.type === 'AddOpenings') out.push({ type: 'AddOpenings', openings: c.openings.map((o) => ({ ...o, offsetMm: Math.round(o.offsetMm + (o.wallUid ? (andouA.get(o.wallUid) ?? 0) : 0)) })) });
    else if (c.type === 'PlaceSpaceLabels') out.push({ type: 'PlaceSpaceLabels', labels: c.labels.map((l) => ({ ...l, at: mundo(l.at) })) });
    else out.push(c);
  }
  return out;
}

export function planejarCasa(original: BlueprintModel, entrada: EntradaDaCasa, hipParcial: Partial<HipotesesDaCasa> = {}): PlanoDaCasa {
  const hip: HipotesesDaCasa = {
    ...HIPOTESES_DA_CASA_PADRAO,
    ...hipParcial,
    estrutura: { ...HIPOTESES_DA_ESTRUTURA_DA_CASA_PADRAO, ...(hipParcial.estrutura ?? {}) },
  };
  const hipGerador: Partial<HipotesesDoGerador> = { ...hip.gerador, automaticos: false };
  // A implantação usa a mesma parede externa e a mesma malha do gerador.
  const hipImplantacao: Partial<HipotesesDaImplantacao> = {
    espessuraExternaMm: hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm,
    malhaMm: hipGerador.malhaMm ?? HIPOTESES_DO_GERADOR_PADRAO.malhaMm,
    ...hip.implantacao,
  };
  const etapas: EtapaDaCasa[] = [];
  const pendencias: PendenciaDoPpci[] = [];
  const decisoes: string[] = [];
  const comandos: Command[] = [];
  const criados: ObjectId[] = [];
  let m = original;
  const etapa = (id: EtapaDaCasaId, rotulo: string, situacao: SituacaoDaEtapa, n: number, nota: string | null = null) =>
    etapas.push({ id, rotulo, situacao: situacao === 'LANCOU' && n === 0 ? 'NADA_A_FAZER' : situacao, comandos: n, nota });
  const aplicar = (lote: Command[]): number => {
    if (!lote.length) return 0;
    const r = applyBatch(m, lote);
    m = r.model;
    comandos.push(...lote);
    criados.push(...r.diff.created);
    return lote.length;
  };

  const doCurto = programaDaCasa(entrada.curto, hip.programa);
  const programa = entrada.programa && entrada.programa.itens.length ? entrada.programa : doCurto.programa;
  if (!entrada.programa) for (const a of doCurto.avisos) pendencias.push({ grupo: 'PREMISSA', texto: `Programa: ${a}` });
  const pedidos = programa.itens.filter((i) => i.uso !== 'CIRCULACAO').reduce((s, i) => s + i.quantidade, 0);
  const vazio = (motivo: string, implantacao: ImplantacaoDaCasa | null = null): PlanoDaCasa => {
    for (const id of ORDEM_DAS_ETAPAS) if (id !== 'IMPLANTACAO' && !etapas.some((e) => e.id === id)) etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, id === 'ARQUITETURA' ? motivo : 'sem arquitetura');
    return { levelId: entrada.levelId, comandos: [], criados: [], etapas, pendencias, resultado: original, programa, implantacao, semente: null, escolha: null, decisoes, resumo: { areaConstruidaM2: null, ambientesPedidos: pedidos, ambientesAtendidos: 0, regrasVioladas: 0, estrutura: { ...ESTRUTURA_ZERADA } } };
  };

  const impedimento = motivoParaNaoGerar(original, entrada.levelId);
  if (impedimento) {
    etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'NAO_RODOU', 0, impedimento);
    return vazio(impedimento);
  }

  // ── IMPLANTACAO ───────────────────────────────────────────────────────────
  const imp = implantacaoDaCasa(entrada.ctx, programa, doCurto.curto, hipImplantacao);
  if (!imp.ok) {
    etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'NAO_RODOU', 0, imp.motivo);
    pendencias.push({ grupo: 'PREMISSA', texto: imp.motivo });
    return vazio('sem implantação');
  }
  const implantacao = imp.implantacao;
  etapa('IMPLANTACAO', ROTULO_DA_ETAPA_DA_CASA.IMPLANTACAO, 'CALCULOU', 0, resumoDaImplantacao(implantacao));
  for (const a of implantacao.avisos) pendencias.push({ grupo: 'PREMISSA', texto: a });

  // ── ARQUITETURA ───────────────────────────────────────────────────────────
  const q = implantacao.quadro;
  const rl = implantacao.retanguloLocal;
  const terreno = entrada.ctx.terreno;
  const loteDasRegras = loteParaRegras(terreno, entrada.ctx.limites);
  const zona = entrada.ctx.zona;
  const zonaDasRegras: ContextoDeRegras['zona'] = entrada.zonaDasRegras ?? {
    taxaOcupacaoMax: zona.taxaOcupacaoMaxPct,
    coeficienteMax: zona.coeficienteMax,
    gabaritoAlturaMaxM: zona.gabaritoAlturaMaxM,
    gabaritoPavimentos: zona.gabaritoPavimentos,
    taxaPermeabilidadeMin: zona.taxaPermeabilidadeMinPct,
  };
  const entradaDoGerador: EntradaDoGerador = {
    programa,
    envelope: [point(rl.x0, rl.y0), point(rl.x1, rl.y0), point(rl.x1, rl.y1), point(rl.x0, rl.y1)],
    direcaoDaFrente: null, // no quadro da frente, a rua é o sul (−y)
    rotacaoNorteDeg: norteNoQuadro(q, entrada.rotacaoNorteDeg),
    latitudeGraus: entrada.latitudeGraus,
    contextoDeRegras: { lote: loteDasRegras, zona: zonaDasRegras },
  };
  const resultados: ResultadoDoGerador[] = [];
  const falhas: string[] = [];
  for (const s of hip.sementes.length ? hip.sementes : [1]) {
    try {
      resultados.push(gerar(entradaDoGerador, s, hipGerador));
    } catch (e) {
      falhas.push(`semente ${s}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!resultados.length) {
    const motivo = `o gerador não fechou a planta (${falhas.join('; ')})`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: motivo });
    return vazio(motivo, implantacao);
  }
  const { r, texto: escolha } = escolherSemente(resultados);
  decisoes.push(...r.decisoes);
  let n = 0;
  try {
    n = aplicar(comandosNoMundo(r, entrada.levelId, q, implantacao.alinhadaAoDesenho));
  } catch (e) {
    const motivo = `as paredes geradas não entraram no desenho: ${e instanceof Error ? e.message : String(e)}`;
    etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: motivo });
    return vazio(motivo, implantacao);
  }
  const paredes = m.walls.filter((w) => w.levelId === entrada.levelId).length;
  const aberturas = m.openings.filter((o) => m.walls.some((w) => w.id === o.wallId && w.levelId === entrada.levelId)).length;
  etapa('ARQUITETURA', ROTULO_DA_ETAPA_DA_CASA.ARQUITETURA, 'LANCOU', n, `${paredes} paredes, ${aberturas} portas e janelas, ${r.ambientes.length} ambientes — ${escolha}`);
  for (const a of r.avisos) pendencias.push({ grupo: GRAVE.test(a) ? 'SEM_SOLUCAO' : 'VERIFICACAO', texto: `Arquitetura: ${a}` });

  // ── ESTRUTURA (F4) ────────────────────────────────────────────────────────
  // Os lançamentos automáticos da gaveta Estrutural, em cadeia: cada um lê o modelo com o anterior aplicado
  // (vigas apoiam nos pilares, fundações descem dos pilares). Falha ou recusa = motivo na etapa e segue.
  const estrutura = { ...ESTRUTURA_ZERADA };
  const L = entrada.levelId;
  const etapaEstrutural = <P extends { comandos: Command[]; motivo: string | null; avisos?: string[] }>(
    id: Exclude<EtapaDaCasaId, 'IMPLANTACAO' | 'ARQUITETURA' | 'CONFERENCIA'>,
    planejar: (modelo: BlueprintModel) => P,
    contar: (plano: P) => { nota: string; foraDoPlano?: string[] },
  ) => {
    if (!hip.estrutura.lancar) {
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
      return;
    }
    try {
      const plano = planejar(m);
      if (!plano.comandos.length) {
        // Sem nada a lançar: o motivo (recusa) ou, não havendo, o aviso diz por quê (paredes oblíquas, nos eixos).
        etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], plano.motivo ? 'NAO_RODOU' : 'NADA_A_FAZER', 0, plano.motivo ?? (plano.avisos?.length ? plano.avisos.join('; ') : null));
        if (plano.motivo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${plano.motivo}` });
        return;
      }
      const n = aplicar(plano.comandos);
      const { nota, foraDoPlano = [] } = contar(plano);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota);
      for (const a of plano.avisos ?? []) pendencias.push({ grupo: 'VERIFICACAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${a}` });
      for (const f of foraDoPlano) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${f}` });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
      pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
    }
  };
  etapaEstrutural(
    'PILARES',
    (x) => planejarPilares(x, L, hip.estrutura.pilares),
    (p) => {
      estrutura.pilares = p.pilares.length;
      return { nota: `${p.pilares.length} pilar(es)${p.pontasSoltas ? `; ${p.pontasSoltas} ponta(s) de parede solta(s) sem pilar` : ''}`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'VIGAS',
    (x) => planejarVigas(x, L, hip.estrutura.vigas),
    (p) => {
      estrutura.vigas = p.vigas.length;
      return { nota: `${p.vigas.length} viga(s)`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'LAJES',
    (x) => planejarLajes(x, L, hip.estrutura.lajes),
    (p) => {
      estrutura.lajes = p.lajes.length;
      return { nota: `${p.lajes.length} laje(s) de ${hip.estrutura.lajes.espessuraMm} mm`, foraDoPlano: p.foraDoPlano.map((f) => f.motivo) };
    },
  );
  etapaEstrutural(
    'FUNDACOES',
    (x) => planejarFundacoes(x, L, hip.estrutura.fundacoes),
    (p) => {
      estrutura.blocos = p.blocos.length;
      estrutura.estacas = p.estacas.length;
      estrutura.baldrames = p.baldrames.length;
      return { nota: `${p.blocos.length} bloco(s), ${p.estacas.length} estaca(s), ${p.baldrames.length} baldrame(s)` };
    },
  );

  // Eixos POR ÚLTIMO: o `planejarPilares` põe pilar em todo cruzamento de eixos "com ou sem parede ali" (a malha
  // do calculista manda). Com os eixos automáticos — um por linha de parede — antes dos pilares, a malha cobria
  // a casa inteira (sonda de 15/10, casa de 157 m²: 52 pilares, 49 em cruzamento de eixo, 2 DENTRO de ambiente
  // longe de parede, 26 recusados por colidir; nesta ordem: 32, todos sobre parede). Depois, os eixos documentam
  // a estrutura lançada. Das paredes ortogonais; com paredes no pavimento, o envelope do lote não entra.
  etapaEstrutural(
    'EIXOS',
    (x) => {
      const p = propostaDeEixos(x, L, hip.estrutura.eixos);
      return { ...p, motivo: p.comandos.length ? null : p.motivoVazio && p.paredesObliquas === 0 ? p.motivoVazio : null, avisos: p.paredesObliquas ? [`${p.paredesObliquas} parede(s) oblíqua(s) ao desenho ficam fora da malha de eixos`] : [] };
    },
    (p) => {
      estrutura.eixos = p.novos;
      return { nota: `${p.novos} eixo(s)` };
    },
  );

  // ── CONFERENCIA ───────────────────────────────────────────────────────────
  const conferencia = conferirPrograma(m, programa);
  for (const it of conferencia.itens) {
    if (it.item.uso === 'CIRCULACAO' || it.faltam <= 0) continue;
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Programa: falta ${it.faltam} × ${it.item.nome} no desenho` });
  }
  for (const rel of conferencia.relacoes) {
    if (rel.estado === 'VIOLADA' && rel.relacao.tipo !== 'DESEJAVEL') pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Programa: ${rel.a.nome} × ${rel.b.nome} — ${rel.relacao.tipo === 'OBRIGATORIA' ? 'deviam ter porta direta' : 'não podiam ser vizinhos'} (${rel.valor})` });
  }
  const atendidos = conferencia.itens.filter((it) => it.item.uso !== 'CIRCULACAO').reduce((s, it) => s + it.casados.length, 0);
  const areaConstruidaM2 = r.resumo.areaConstruidaM2;
  const regras = avaliarRegras(m, REGRAS_SEMENTE, {
    lote: loteDasRegras,
    zona: zonaDasRegras,
    taxaOcupacaoPct: loteDasRegras && loteDasRegras.areaM2 > 0 ? Math.round((areaConstruidaM2 / loteDasRegras.areaM2) * 1000) / 10 : null,
    coeficiente: loteDasRegras && loteDasRegras.areaM2 > 0 ? Math.round((areaConstruidaM2 / loteDasRegras.areaM2) * 100) / 100 : null,
    alturaM: (hipGerador.peDireitoMm ?? HIPOTESES_DO_GERADOR_PADRAO.peDireitoMm) / 1000,
  });
  const violadas = regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO');
  for (const v of violadas) pendencias.push({ grupo: 'VERIFICACAO', texto: `Legislação: ${v.regra.nome} — ${v.alvoRotulo}${v.valores ? ` (${v.valores})` : ''}` });
  etapa('CONFERENCIA', ROTULO_DA_ETAPA_DA_CASA.CONFERENCIA, 'CALCULOU', 0, `${atendidos} de ${pedidos} ambientes do programa; ${violadas.length} regra(s) violada(s)`);

  return {
    levelId: entrada.levelId,
    comandos,
    criados,
    etapas,
    pendencias,
    resultado: m,
    programa,
    implantacao,
    semente: r.semente,
    escolha,
    decisoes,
    resumo: { areaConstruidaM2, ambientesPedidos: pedidos, ambientesAtendidos: atendidos, regrasVioladas: violadas.length, estrutura },
  };
}

/** Trava antes de gravar: o lote reaplicado no desenho ATUAL cria os mesmos ids e o mesmo modelo da prévia. */
export function conferirPlanoDaCasa(original: BlueprintModel, plano: PlanoDaCasa): { ok: true } | { ok: false; motivo: string } {
  if (!plano.comandos.length) return { ok: false, motivo: 'O plano não tem nada a lançar.' };
  const impedimento = motivoParaNaoGerar(original, plano.levelId);
  if (impedimento) return { ok: false, motivo: impedimento };
  try {
    const r = applyBatch(original, plano.comandos);
    const iguais = r.diff.created.length === plano.criados.length && r.diff.created.every((id, i) => id === plano.criados[i]);
    if (!iguais || snapshotHash(r.model) !== snapshotHash(plano.resultado)) return { ok: false, motivo: 'O desenho mudou desde a prévia — gere de novo.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: `O desenho mudou desde a prévia — gere de novo (${e instanceof Error ? e.message : String(e)}).` };
  }
}
