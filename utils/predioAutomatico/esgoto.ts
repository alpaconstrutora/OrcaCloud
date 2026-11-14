/**
 * PRÉDIO AUTOMÁTICO — o ESGOTO e a VENTILAÇÃO (PA7a do plano docs/planos/2026-11-12-predio-automatico.md, 14/11/2026).
 *
 * Roda no TIPO antes da marca `copiaInstalacoes` (como a elétrica e a água): o que se desenha nele vai aos andares numa
 * sincronização só. Da louça à rede pública:
 *
 *   louças da unidade ─ RAMAIS (sob o piso, com caimento) ─ TUBO DE QUEDA do grupo molhado (rente à parede, do lado da
 *   unidade) ─ um trecho por andar, que a cópia viva empilha ─ DESVIO no forro do térreo ─ a fachada da rua ─ CAIXA DE
 *   INSPEÇÃO fora do prédio ─ COLETOR ─ ligação na rede pública.
 *
 *   VENTILAÇÃO: o tubo de queda sobe pela cobertura até `TERMINAL_DE_VENTILACAO_MM` acima dela (terraço — ventilação
 *   primária) e uma COLUNA DE VENTILAÇÃO corre ao lado dele, ligada embaixo (abaixo do ramal mais baixo) e em cima.
 *
 * Como a água (PA6), os ramais de cada unidade saem do motor da casa (`planejarEsgoto`) numa VISTA só com o pavimento
 * tipo, os cômodos e os pontos dela — e, como "caixas de inspeção", os pontos dos tubos de queda dela. O motor liga
 * cada ponto à caixa mais perto e termina numa vertical até ela: essa vertical sai, e o topo dela é a JUNÇÃO do andar.
 *
 * A COTA DA JUNÇÃO e o empilhamento: o ramal do andar corre sob o piso (cota negativa, que a chave dos nós lê como o
 * teto do andar de baixo). O tubo de queda de cada andar vai da junção dele (j) até `pé-direito + j` — que é,
 * exatamente, a junção do andar de cima. No tipo mais baixo, a junção é o teto do térreo, onde começa o desvio.
 *
 * DN (NBR 8160): o tubo de queda pela Tabela 6 com as UHC do grupo × os andares (nunca abaixo de 100 com bacia); a
 * coluna de ventilação pela tabela da NBR 8160 (`dnDaColunaDeVentilacao`); o desvio e o coletor pela Tabela 7.
 */
import { pointInPolygon } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, Point, Terminal, Wall } from '../blueprintKernel';
import { fontesDeEsgoto, HIPOTESES_ESGOTO_PADRAO, planejarEsgoto } from '../blueprintEsgotoAutomatico';
import { dnDoSubcoletor, dnDoTuboDeQueda } from '../blueprintNbr8160';
import { dnDaColunaDeVentilacao } from '../blueprintVentilacao';
import { FICHA_DO_PONTO_HIDRAULICO } from '../blueprintHidraulica';
import { anelDoPilar, pegadasDePilares } from '../blueprintObstaculosEstruturais';
import { pontoNaFrente } from '../blueprintAncorasHidro';
import type { PendenciaDoPpci } from '../blueprintGeradorPpci';
import type { BaseDoPredio, ContextoDoPredio } from './terreoECobertura';
import { comodosDoTipo } from './agua';

export const ROTULO_DO_TUBO_DE_QUEDA = 'Tubo de queda';
export const ROTULO_DA_COLUNA_DE_VENTILACAO = 'Coluna de ventilação';
export const ROTULO_DO_DESVIO = 'Desvio do tubo de queda';
export const ROTULO_DO_COLETOR_DO_PREDIO = 'Coletor predial';
/** Terraço utilizável: o terminal da ventilação a 2 m acima da cobertura (NBR 8160). */
export const TERMINAL_DE_VENTILACAO_MM = 2000;
/** Os pontos de esgoto a até isto uns dos outros formam um GRUPO MOLHADO — um tubo de queda cada. */
export const RAIO_DO_GRUPO_MOLHADO_MM = 2500;
/** O tubo de queda fica rente à face da parede: o eixo dele a isto da face, do lado da unidade (DN 100 = 110 mm). */
const AFASTAMENTO_DA_FACE_MM = 75;
/** A coluna de ventilação ao lado do tubo de queda, ao longo da parede, mm. */
const VENTILACAO_AO_LADO_MM = 200;
/** Folga do tubo de queda (e da ventilação) a um vão da parede e a outro tubo vertical, mm. */
const FOLGA_DO_VAO_MM = 200;
const FOLGA_ENTRE_TUBOS_MM = 250;
/**
 * A "caixa" falsa do tubo de queda, no forro do andar de baixo. O motor fecha com uma vertical até ela (que sai: o tubo
 * de queda passa ali) ou chega nela em rampa (a ligação direta) — cada chegada vira um nó do tubo de queda.
 */
const COTA_DA_CAIXA_FALSA_MM = -400;
/** Abaixo da junção mais baixa, no térreo, onde a coluna de ventilação se liga ao tubo de queda e começa o desvio. */
const DESCIDA_NO_TERREO_MM = 300;
/** Onde a coluna de ventilação se liga ao tubo de queda na cobertura, acima da laje, mm. */
const LIGACAO_DA_VENTILACAO_NA_COBERTURA_MM = 600;
/** Caimento do desvio e do coletor (DN 100 ou mais), %. */
const CAIMENTO_PCT = 1;
/** Fundo do desvio na saída: enterrado sob o piso do térreo, mm. */
const COTA_ENTERRADA_MM = -600;
/** Acima desta declividade o coletor pede degrau numa caixa (NBR 8160), %. */
const DECLIVIDADE_MAXIMA_DO_COLETOR_PCT = 5;
/** A caixa de inspeção fica a isto da fachada, para fora, mm. */
const CI_FORA_DA_FACHADA_MM = 1000;

const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const uhcDe = (t: Terminal) => (t.tipoHidraulico ? (FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico].uhcNbr8160 ?? 0) : 0);
const f1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export interface TuboDeQuedaDoPredio {
  numero: string;
  at: Point;
  /** A coluna de ventilação ao lado. */
  ventilacao: Point;
  /** Cota da junção mais baixa dos ramais do andar, mm (negativa: sob o piso) — onde o tubo de queda do andar começa. */
  juncaoMm: number;
  /** As cotas em que os ramais do andar chegam ao tubo de queda, da mais baixa para a mais alta. */
  chegadasMm: number[];
  /** UHC que o grupo despeja por andar. */
  uhcPorAndar: number;
  comBacia: boolean;
  dnMm: number;
  dnVentilacaoMm: number;
}

export interface EsgotoDoPredio {
  comandos: number;
  tubos: TuboDeQuedaDoPredio[];
  /** Pontos de esgoto do tipo ligados a um tubo de queda. */
  pontos: number;
  /** UHC de um andar (todos os grupos). */
  uhcPorAndar: number;
  coletor: { dnMm: number; declividadePct: number; porGravidade: boolean } | null;
  pendencias: PendenciaDoPpci[];
}

/** Grupos de pontos a até `raio` uns dos outros (ligação simples), na ordem do primeiro ponto. */
function gruposMolhados(pts: readonly Terminal[], raio: number): Terminal[][] {
  const grupos: Terminal[][] = [];
  for (const p of pts) {
    const perto = grupos.filter((g) => g.some((q) => dist(p.at, q.at) <= raio));
    if (!perto.length) grupos.push([p]);
    else {
      const [primeiro, ...resto] = perto;
      primeiro.push(p, ...resto.flat());
      for (const r of resto) grupos.splice(grupos.indexOf(r), 1);
    }
  }
  return grupos;
}

const trecho = (levelId: ObjectId, a: Point, ca: number, b: Point, cb: number, bitolaMm: number, rotulo: string): Extract<Command, { type: 'AddTrecho' }> => ({
  type: 'AddTrecho', levelId, disciplina: 'ESGOTO', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: ca, cotaBMm: cb, bitolaMm, sugerido: true, rotulo,
});

export function lancarEsgoto(
  ctx: ContextoDoPredio,
  base: BaseDoPredio,
  terreo: { levelId: ObjectId } | null,
  cobertura: { levelId: ObjectId } | null,
  andares: number,
): EsgotoDoPredio {
  const tipo = base.tipoLevelId;
  const pendencias: PendenciaDoPpci[] = [];
  const pe = (id: ObjectId) => ctx.m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 3000;
  const fila: Command[] = [];
  const resultado: EsgotoDoPredio = { comandos: 0, tubos: [], pontos: 0, uhcPorAndar: 0, coletor: null, pendencias };
  const { espacos, daUnidade, menor } = comodosDoTipo(ctx.m, base);
  const paredes = ctx.m.walls.filter((w) => w.levelId === tipo);
  const pilares = pegadasDePilares(ctx.m, tipo).map((g) => anelDoPilar(g, 100) as Point[]);
  const noPilar = (q: Point) => pilares.some((g) => pointInPolygon(g, q));
  // Os tubos verticais que já existem no tipo (as descidas de água e elétrica, as colunas do shaft) e os escolhidos aqui.
  const verticais: Point[] = (ctx.m.trechos ?? []).filter((t) => t.levelId === tipo && t.a.x === t.b.x && t.a.y === t.b.y).map((t) => t.a as Point);
  const fontes = fontesDeEsgoto(ctx.m).filter((t) => t.levelId === tipo);
  const avisosDoMotor = new Set<string>();

  for (const u of base.divisao.unidades) {
    const meus = espacos.filter((s) => daUnidade.get(s.id) === u.numero);
    const pts = fontes.filter((t) => meus.some((s) => pointInPolygon(s.ring as Point[], t.at as Point)));
    if (!pts.length) continue;
    const naUnidade = (q: Point) => {
      const s = menor(q);
      return !!s && meus.some((x) => x.id === s.id);
    };
    // As paredes da unidade: a que tem cômodo dela de um dos lados.
    const paredesDaUnidade = paredes.filter((w) => {
      const L = dist(w.a, w.b);
      if (L < 1) return false;
      const n = { x: -(w.b.y - w.a.y) / L, y: (w.b.x - w.a.x) / L };
      const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      const d = w.thicknessMm / 2 + 100;
      return naUnidade(inteiro({ x: mid.x + n.x * d, y: mid.y + n.y * d })) || naUnidade(inteiro({ x: mid.x - n.x * d, y: mid.y - n.y * d }));
    });
    const tubosDaUnidade: { at: Point; ventilacao: Point; grupo: Terminal[] }[] = [];
    for (const grupo of gruposMolhados(pts, RAIO_DO_GRUPO_MOLHADO_MM)) {
      const principal = [...grupo].sort((a, b) => uhcDe(b) - uhcDe(a) || a.id.localeCompare(b.id))[0];
      const lugar = lugarDoTubo(principal.at as Point, paredesDaUnidade, ctx.m, naUnidade, noPilar, [...verticais, ...tubosDaUnidade.flatMap((x) => [x.at, x.ventilacao])]);
      if (!lugar) {
        pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Esgoto da unidade ${u.numero}: sem lugar livre na parede junto de ${FICHA_DO_PONTO_HIDRAULICO[principal.tipoHidraulico!].rotulo.toLowerCase()} para o tubo de queda — ponha à mão.` });
        continue;
      }
      tubosDaUnidade.push({ ...lugar, grupo });
      verticais.push(lugar.at, lugar.ventilacao);
    }
    if (!tubosDaUnidade.length) continue;
    // Os ramais: o motor da casa com os tubos de queda como caixas (cada ponto vai à mais perto).
    const falsas = tubosDaUnidade.map((x, k): Terminal => ({ id: `__tq-${k}`, uid: `__tq-${k}`, levelId: tipo, disciplina: 'ESGOTO', tipo: 'TQ', at: x.at, cotaMm: COTA_DA_CAIXA_FALSA_MM, tipoHidraulico: 'CAIXA_INSPECAO' } as unknown as Terminal));
    const paredesDaVista = new Set(paredes.map((w) => w.id));
    const vista: BlueprintModel = {
      ...ctx.m,
      levels: ctx.m.levels.filter((l) => l.id === tipo),
      walls: paredes,
      openings: ctx.m.openings.filter((o) => paredesDaVista.has(o.wallId)),
      structures: (ctx.m.structures ?? []).filter((x) => x.levelId === tipo),
      terminais: [...pts, ...falsas],
      trechos: (ctx.m.trechos ?? []).filter((t) => t.levelId === tipo && t.disciplina !== 'ESGOTO'),
      spaces: meus,
      nucleos: [],
    };
    const plano = planejarEsgoto(vista, HIPOTESES_ESGOTO_PADRAO);
    for (const a of plano.avisos) if (!/pelas tabelas da NBR 8160/.test(a)) avisosDoMotor.add(a.replace(/à caixa de inspeção/g, 'ao tubo de queda').replace(/caixa de inspeção/g, 'tubo de queda'));
    const noTubo = (c: { x: number; y: number }) => tubosDaUnidade.findIndex((x) => x.at.x === c.x && x.at.y === c.y);
    // As verticais no ponto do tubo de queda saem (o tubo de queda passa ali); as chegadas ficam.
    const lote = plano.comandos.filter((c): c is Extract<Command, { type: 'AddTrecho' }> => c.type === 'AddTrecho' && !(c.a.x === c.b.x && c.a.y === c.b.y && noTubo(c.a) >= 0));
    // Que tubo de queda cada ponto alcança: pela rede traçada (o motor liga a lavatório à caixa sifonada, que vai ao tubo).
    const chaveL = (x: number, y: number, z: number) => `${x},${y}|${z}`;
    const paiL = new Map<string, string>();
    const raizL = (a: string): string => {
      while (paiL.get(a) !== a) a = paiL.get(a)!;
      return a;
    };
    const uneL = (a: string, b: string) => {
      for (const x of [a, b]) if (!paiL.has(x)) paiL.set(x, x);
      paiL.set(raizL(a), raizL(b));
    };
    for (const c of lote) uneL(chaveL(c.a.x, c.a.y, c.cotaAMm), chaveL(c.b.x, c.b.y, c.cotaBMm));
    const chegadasDe = tubosDaUnidade.map((tq) => [...new Set(lote.flatMap((c) => [c.a.x === tq.at.x && c.a.y === tq.at.y ? c.cotaAMm : null, c.b.x === tq.at.x && c.b.y === tq.at.y ? c.cotaBMm : null]).filter((z): z is number => z != null))].sort((a, b) => a - b));
    const tuboDoPonto = (p: Terminal) => {
      const k0 = chaveL(p.at.x, p.at.y, p.cotaMm);
      if (!paiL.has(k0)) return -1;
      return chegadasDe.findIndex((cs, k) => cs.some((z) => paiL.has(chaveL(tubosDaUnidade[k].at.x, tubosDaUnidade[k].at.y, z)) && raizL(chaveL(tubosDaUnidade[k].at.x, tubosDaUnidade[k].at.y, z)) === raizL(k0)));
    };
    const semTubo = pts.filter((p) => tuboDoPonto(p) < 0);
    if (semTubo.length) pendencias.push({ grupo: 'VERIFICACAO', texto: `Esgoto da unidade ${u.numero}: ${semTubo.length} ponto(s) sem caminho até um tubo de queda (${semTubo.map((p) => FICHA_DO_PONTO_HIDRAULICO[p.tipoHidraulico!].rotulo).join(', ')}) — ligue à mão.` });
    for (const [k, tq] of tubosDaUnidade.entries()) {
      const chegadas = chegadasDe[k];
      // Tubo de queda sem ramal (o grupo foi a outro tubo pela rede): sai.
      if (!chegadas.length) continue;
      const juncao = chegadas[0];
      const doTubo = pts.filter((p) => tuboDoPonto(p) === k);
      const uhc = doTubo.reduce((s, p) => s + uhcDe(p), 0);
      const comBacia = doTubo.some((p) => p.tipoHidraulico === 'VASO_SANITARIO');
      const dnMm = Math.max(dnDoTuboDeQueda(uhc * andares, uhc, andares), comBacia ? 100 : 0);
      const alturaM = (pe(tipo) * andares + (cobertura ? TERMINAL_DE_VENTILACAO_MM : 0)) / 1000;
      const dnVentilacaoMm = dnDaColunaDeVentilacao(dnMm, uhc * andares, alturaM, comBacia);
      resultado.tubos.push({ numero: u.numero, at: tq.at, ventilacao: tq.ventilacao, juncaoMm: juncao, chegadasMm: chegadas, uhcPorAndar: uhc, comBacia, dnMm, dnVentilacaoMm });
    }
    resultado.pontos += pts.length - semTubo.length;
    fila.push(...lote);
  }
  for (const a of avisosDoMotor) pendencias.push({ grupo: 'CONFERIR', texto: `Esgoto: ${a}` });
  if (!resultado.tubos.length) {
    resultado.comandos = ctx.aplicar(fila);
    return resultado;
  }
  resultado.uhcPorAndar = resultado.tubos.reduce((s, t) => s + t.uhcPorAndar, 0);

  // ── Os tubos de queda e as colunas de ventilação no tipo (as cópias empilham) e o topo deles na cobertura.
  for (const t of resultado.tubos) {
    // Um trecho entre cada par de chegadas do andar, e o último até a junção do andar de cima (pé-direito + a mais baixa).
    const nos = [...t.chegadasMm, pe(tipo) + t.juncaoMm];
    for (let i = 1; i < nos.length; i++) fila.push(trecho(tipo, t.at, nos[i - 1], t.at, nos[i], t.dnMm, ROTULO_DO_TUBO_DE_QUEDA));
    fila.push(trecho(tipo, t.ventilacao, t.juncaoMm, t.ventilacao, pe(tipo) + t.juncaoMm, t.dnVentilacaoMm, ROTULO_DA_COLUNA_DE_VENTILACAO));
    if (cobertura) {
      // A ventilação primária: o tubo de queda atravessa a laje e sobe até o terminal; a coluna se liga a ele acima da laje.
      fila.push(trecho(cobertura.levelId, t.at, t.juncaoMm, t.at, LIGACAO_DA_VENTILACAO_NA_COBERTURA_MM, t.dnMm, ROTULO_DO_TUBO_DE_QUEDA));
      fila.push(trecho(cobertura.levelId, t.at, LIGACAO_DA_VENTILACAO_NA_COBERTURA_MM, t.at, TERMINAL_DE_VENTILACAO_MM, t.dnMm, ROTULO_DO_TUBO_DE_QUEDA));
      fila.push(trecho(cobertura.levelId, t.ventilacao, t.juncaoMm, t.ventilacao, LIGACAO_DA_VENTILACAO_NA_COBERTURA_MM, t.dnVentilacaoMm, ROTULO_DA_COLUNA_DE_VENTILACAO));
      fila.push(trecho(cobertura.levelId, t.ventilacao, LIGACAO_DA_VENTILACAO_NA_COBERTURA_MM, t.at, LIGACAO_DA_VENTILACAO_NA_COBERTURA_MM, t.dnVentilacaoMm, ROTULO_DA_COLUNA_DE_VENTILACAO));
    }
  }
  if (!cobertura) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Ventilação: sem a cobertura, o prolongamento dos tubos de queda acima do telhado fica para o projetista.' });
  pendencias.push({ grupo: 'PREMISSA', texto: `Ventilação: primária pelo prolongamento de cada tubo de queda a ${f1(TERMINAL_DE_VENTILACAO_MM / 1000)} m acima da cobertura (terraço) e uma coluna de ventilação ao lado, ligada embaixo e em cima; os ramais de ventilação de cada bacia ficam para o projetista (NBR 8160).` });

  // ── O térreo: o desvio suspenso no forro até a fachada da rua, a caixa de inspeção fora e o coletor até a rede.
  if (!terreo) {
    pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Esgoto: sem o térreo do prédio, o desvio dos tubos de queda e o coletor ficam para o projetista.' });
  } else {
    const T = terreo.levelId;
    const peT = pe(T);
    const uhcTotal = resultado.uhcPorAndar * andares;
    const saida = saidaNaFachada(base);
    const ponta = (t: TuboDeQuedaDoPredio) => peT + t.juncaoMm - DESCIDA_NO_TERREO_MM;
    const lote: Extract<Command, { type: 'AddTrecho' }>[] = [];
    for (const t of resultado.tubos) {
      // A base do tubo de queda desce um pouco no forro do térreo; a coluna de ventilação se liga a ela ali.
      lote.push(trecho(T, t.at, peT + t.juncaoMm, t.at, ponta(t), t.dnMm, ROTULO_DO_TUBO_DE_QUEDA));
      lote.push(trecho(T, t.ventilacao, peT + t.juncaoMm, t.ventilacao, ponta(t), t.dnVentilacaoMm, ROTULO_DA_COLUNA_DE_VENTILACAO));
      lote.push(trecho(T, t.ventilacao, ponta(t), t.at, ponta(t), t.dnVentilacaoMm, ROTULO_DA_COLUNA_DE_VENTILACAO));
    }
    const desvio = desvioNoTerreo(base, resultado.tubos.map((t) => ({ at: t.at, cotaMm: ponta(t), uhc: t.uhcPorAndar * andares })), saida.dentro, T);
    lote.push(...desvio.trechos);
    // Na fachada, desce até sob o piso; sai para a caixa de inspeção.
    const dnSaida = dnDoSubcoletor(uhcTotal, CAIMENTO_PCT);
    lote.push(trecho(T, saida.dentro, desvio.cotaNaSaidaMm, saida.dentro, COTA_ENTERRADA_MM, dnSaida, ROTULO_DO_DESVIO));
    const ci = saida.fora;
    const cotaCi = COTA_ENTERRADA_MM - Math.round((dist(saida.dentro, ci) * CAIMENTO_PCT) / 100);
    lote.push(trecho(T, saida.dentro, COTA_ENTERRADA_MM, ci, cotaCi, dnSaida, ROTULO_DO_DESVIO));
    fila.push(...lote, { type: 'AddTerminal', levelId: T, disciplina: 'ESGOTO', tipo: FICHA_DO_PONTO_HIDRAULICO.CAIXA_INSPECAO.rotulo, at: ci, cotaMm: cotaCi, tipoHidraulico: 'CAIXA_INSPECAO', sugerida: true } as Command);
    // O coletor até a rede pública, na frente do lote.
    const frente = pontoNaFrente(ctx.m, ci);
    if (!frente) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Esgoto: marque a divisa da frente do lote — o coletor vai até a rede pública nela.' });
    else {
      const L = dist(ci, frente.ponto);
      const cotaRede = -(HIPOTESES_ESGOTO_PADRAO.profundidadeDaRedeMm ?? 1500);
      const declividadePct = L > 0 ? ((cotaCi - cotaRede) / L) * 100 : 0;
      const dnColetor = dnDoSubcoletor(uhcTotal, declividadePct);
      const porGravidade = declividadePct + 1e-9 >= CAIMENTO_PCT;
      fila.push(
        trecho(T, ci, cotaCi, inteiro(frente.ponto), cotaRede, dnColetor, ROTULO_DO_COLETOR_DO_PREDIO),
        { type: 'AddTerminal', levelId: T, disciplina: 'ESGOTO', tipo: FICHA_DO_PONTO_HIDRAULICO.LIGACAO_ESGOTO.rotulo, at: inteiro(frente.ponto), cotaMm: cotaRede, tipoHidraulico: 'LIGACAO_ESGOTO', sugerida: true } as Command,
      );
      resultado.coletor = { dnMm: dnColetor, declividadePct: Math.round(declividadePct * 100) / 100, porGravidade };
      if (declividadePct > DECLIVIDADE_MAXIMA_DO_COLETOR_PCT) pendencias.push({ grupo: 'CONFERIR', texto: `Coletor predial: ${f1(declividadePct)} % — acima de ${DECLIVIDADE_MAXIMA_DO_COLETOR_PCT} %; preveja um degrau (queda) numa caixa e o trecho com a declividade usual.` });
      pendencias.push({
        grupo: porGravidade ? 'CONFERIR' : 'VERIFICACAO',
        texto: porGravidade
          ? `Coletor predial: DN ${dnColetor} a ${f1(declividadePct)} % até a rede pública, presumida a ${f1(-cotaRede / 1000)} m de profundidade na frente — confirme a cota com a concessionária.`
          : `Coletor predial: ${f1(declividadePct)} % até a rede pública presumida a ${f1(-cotaRede / 1000)} m — abaixo de ${CAIMENTO_PCT} %: aprofunde a caixa ou preveja estação elevatória.`,
      });
    }
    pendencias.push({ grupo: 'CONFERIR', texto: `Esgoto: o desvio dos ${resultado.tubos.length} tubo(s) de queda corre suspenso no forro do térreo até a fachada da rua (DN ${dnSaida} na saída, ${desvio.comprimentoM.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m) — confira com a estrutura e o pé-direito do térreo.` });
  }
  resultado.comandos = ctx.aplicar(fila);
  return resultado;
}

/**
 * O lugar do tubo de queda do grupo: rente à face da parede da unidade mais perto do ponto principal (o vaso), do lado
 * da unidade; e a coluna de ventilação ao lado, ao longo da parede. Escorrega pela parede até sair de vão, pilar e de
 * outro tubo vertical.
 */
function lugarDoTubo(
  alvo: Point,
  paredes: readonly Wall[],
  model: BlueprintModel,
  naUnidade: (q: Point) => boolean,
  noPilar: (q: Point) => boolean,
  outros: readonly Point[],
): { at: Point; ventilacao: Point } | null {
  const ordenadas = paredes
    .map((w) => {
      const L = dist(w.a, w.b);
      const u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
      const s = Math.max(0, Math.min(L, (alvo.x - w.a.x) * u.x + (alvo.y - w.a.y) * u.y));
      return { w, L, u, s, d: dist(alvo, { x: w.a.x + u.x * s, y: w.a.y + u.y * s }) };
    })
    .sort((a, b) => a.d - b.d || a.w.id.localeCompare(b.w.id))
    .slice(0, 4);
  for (const { w, L, u, s: s0 } of ordenadas) {
    const n = { x: -u.y, y: u.x };
    const lado = (alvo.x - w.a.x) * n.x + (alvo.y - w.a.y) * n.y >= 0 ? 1 : -1;
    const off = w.thicknessMm / 2 + AFASTAMENTO_DA_FACE_MM;
    const vaos = model.openings.filter((o) => o.wallId === w.id);
    const livre = (s: number) => {
      if (s < 150 || s > L - 150) return null;
      if (vaos.some((o) => s > o.offsetMm - FOLGA_DO_VAO_MM && s < o.offsetMm + o.widthMm + FOLGA_DO_VAO_MM)) return null;
      const p = inteiro({ x: w.a.x + u.x * s + n.x * lado * off, y: w.a.y + u.y * s + n.y * lado * off });
      if (!naUnidade(p) || noPilar(p) || outros.some((q) => dist(p, q) < FOLGA_ENTRE_TUBOS_MM)) return null;
      return p;
    };
    for (let k = 0; k <= 15; k++) {
      for (const s of k === 0 ? [s0] : [s0 + k * 100, s0 - k * 100]) {
        const at = livre(s);
        if (!at) continue;
        for (const dv of [VENTILACAO_AO_LADO_MM, -VENTILACAO_AO_LADO_MM]) {
          const v = livre(s + dv);
          if (v && dist(v, at) >= VENTILACAO_AO_LADO_MM - 2) return { at, ventilacao: v };
        }
      }
    }
  }
  return null;
}

/** A saída do esgoto: o meio do lado do bloco voltado para a rua — por dentro da fachada e, para fora, a caixa. */
function saidaNaFachada(base: BaseDoPredio): { dentro: Point; fora: Point } {
  const pts = base.bloco.pontos as Point[];
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  const rua = base.rua ?? { x: 0, y: -1 };
  let melhor: { mid: Point; n: { x: number; y: number }; nota: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    if (L < 1) continue;
    let n = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const nota = n.x * rua.x + n.y * rua.y + L * 1e-9;
    if (!melhor || nota > melhor.nota) melhor = { mid: mid as Point, n, nota };
  }
  const m = melhor!;
  return { dentro: inteiro({ x: m.mid.x - m.n.x * 300, y: m.mid.y - m.n.y * 300 }), fora: inteiro({ x: m.mid.x + m.n.x * CI_FORA_DA_FACHADA_MM, y: m.mid.y + m.n.y * CI_FORA_DA_FACHADA_MM }) };
}

/**
 * O desvio no forro do térreo, da base de cada tubo de queda à saída, descendo `CAIMENTO_PCT`. No bloco retangular, um
 * coletor suspenso pelo EIXO do corredor (o mesmo esqueleto do tipo), com uma derivação a cada tubo; em asas, cada tubo
 * em linha reta até a saída. As cotas descem das pontas para a saída: a de um nó é a menor das chegadas.
 */
function desvioNoTerreo(
  base: BaseDoPredio,
  tubos: readonly { at: Point; cotaMm: number; uhc: number }[],
  saida: Point,
  T: ObjectId,
): { trechos: Extract<Command, { type: 'AddTrecho' }>[]; cotaNaSaidaMm: number; comprimentoM: number } {
  const queda = (a: Point, b: Point) => Math.round((dist(a, b) * CAIMENTO_PCT) / 100);
  const trechos: Extract<Command, { type: 'AddTrecho' }>[] = [];
  const dv = base.divisao;
  let comprimento = 0;
  const add = (a: Point, ca: number, b: Point, cb: number, uhc: number) => {
    if (a.x === b.x && a.y === b.y && ca === cb) return;
    trechos.push(trecho(T, a, ca, b, cb, dnDoSubcoletor(uhc, CAIMENTO_PCT), ROTULO_DO_DESVIO));
    comprimento += dist(a, b);
  };
  if (dv.esquema === 'ASAS' || dv.ortogonal) {
    // Em linha reta até a saída; as chegadas na saída se encontram na mais baixa.
    const chegadas = tubos.map((t) => ({ t, cota: t.cotaMm - queda(t.at, saida) }));
    const fundo = Math.min(...chegadas.map((c) => c.cota));
    for (const c of chegadas) add(c.t.at, c.t.cotaMm, saida, fundo, c.t.uhc);
    return { trechos, cotaNaSaidaMm: fundo, comprimentoM: comprimento / 1000 };
  }
  const { o, u, v } = dv.quadro;
  const local = (p: Point) => (p.x - o.x) * u.x + (p.y - o.y) * u.y;
  const bm = (dv.corredor.b0 + dv.corredor.b1) / 2;
  const noEixo = (a: number) => inteiro({ x: o.x + u.x * a + v.x * bm, y: o.y + u.y * a + v.y * bm });
  const aSaida = local(saida);
  const A = noEixo(aSaida);
  // Cada tubo chega ao eixo; no eixo, de cada lado da saída, as cotas descem em direção a ela.
  const nos = tubos.map((t) => {
    const p = noEixo(local(t.at));
    return { a: local(t.at), p, cota: t.cotaMm - queda(t.at, p), t };
  });
  for (const x of nos) add(x.t.at, x.t.cotaMm, x.p, x.cota, x.t.uhc);
  let fundo = Infinity;
  for (const sinal of [1, -1]) {
    const lado = nos.filter((x) => (x.a - aSaida) * sinal > 0).sort((x, y) => (y.a - x.a) * sinal);
    let cota = Infinity;
    let uhc = 0;
    let anterior: (typeof lado)[number] | null = null;
    for (const x of lado) {
      cota = Math.min(x.cota, anterior ? cota - queda(anterior.p, x.p) : Infinity);
      if (anterior) add(anterior.p, anterior.cota, x.p, cota, uhc);
      uhc += x.t.uhc;
      anterior = { ...x, cota };
    }
    if (anterior) {
      const naSaida = cota - queda(anterior.p, A);
      add(anterior.p, cota, A, naSaida, uhc);
      fundo = Math.min(fundo, naSaida);
    }
  }
  // Os tubos que caem exatamente no eixo da saída.
  for (const x of nos.filter((y) => y.a === aSaida)) fundo = Math.min(fundo, x.cota);
  const total = tubos.reduce((s, t) => s + t.uhc, 0);
  const naFachada = fundo - queda(A, saida);
  add(A, fundo, saida, naFachada, total);
  return { trechos: costurado(trechos), cotaNaSaidaMm: naFachada, comprimentoM: comprimento / 1000 };
}

/**
 * Onde o desvio passa por uma posição em mais de uma cota (a derivação chega ao eixo acima de onde a linha principal já
 * passa; os dois lados chegam à saída em cotas diferentes), uma vertical liga as cotas — senão são nós diferentes e a
 * rede se parte ali.
 */
function costurado(trechos: Extract<Command, { type: 'AddTrecho' }>[]): Extract<Command, { type: 'AddTrecho' }>[] {
  const porPosicao = new Map<string, { p: Point; cotas: Map<number, number> }>();
  const marcar = (p: { x: number; y: number }, z: number, dn: number) => {
    const k = `${p.x},${p.y}`;
    const e = porPosicao.get(k) ?? { p: p as Point, cotas: new Map<number, number>() };
    e.cotas.set(z, Math.max(e.cotas.get(z) ?? 0, dn));
    porPosicao.set(k, e);
  };
  for (const t of trechos) {
    marcar(t.a, t.cotaAMm, t.bitolaMm);
    marcar(t.b, t.cotaBMm, t.bitolaMm);
  }
  const extra: Extract<Command, { type: 'AddTrecho' }>[] = [];
  for (const { p, cotas } of porPosicao.values()) {
    const zs = [...cotas.keys()].sort((a, b) => b - a);
    for (let i = 1; i < zs.length; i++) extra.push({ ...trechos[0], a: { x: p.x, y: p.y }, b: { x: p.x, y: p.y }, cotaAMm: zs[i - 1], cotaBMm: zs[i], bitolaMm: Math.max(...cotas.values()) });
  }
  return [...trechos, ...extra];
}
