/**
 * PRÉDIO AUTOMÁTICO — o PLUVIAL da cobertura (PA7b do plano docs/planos/2026-11-12-predio-automatico.md, 14/11/2026).
 *
 * A cobertura é laje plana com platibanda (PA3): a água vai, pelo caimento da impermeabilização (premissa), a RALOS junto
 * dos cantos, por dentro da platibanda; de cada ralo um CONDUTOR VERTICAL desce pela face externa da fachada — um trecho
 * por andar no tipo, que a cópia viva empilha (como o tubo de queda) —, no térreo até enterrado, numa CAIXA DE AREIA ao
 * pé dele, e um CONDUTOR HORIZONTAL até a SAÍDA pluvial na frente do lote (sarjeta ou rede).
 *
 * Dimensionamento (NBR 10844): Q = I·A/60 com a área de projeção do bloco; a intensidade da cidade (ou a informada) nas
 * premissas pluviais do estudo; o número de condutores é o que a capacidade do DN 100 pede (no mínimo 2 — um entope, o
 * outro escoa); o DN de cada vertical e de cada horizontal pela vazão dele (`dnDoVertical`, `dnDoHorizontal`).
 */
import type { Command, ObjectId, Point } from '../blueprintKernel';
import { HIPOTESES_PLUVIAIS_PADRAO, INTENSIDADE_ATE_100M2_MMH, intensidadeDeProjeto, vazaoDeProjetoLMin, type HipotesesPluviais } from '../blueprintPluvial';
import { ROTULO_DO_CONDUTOR_HORIZONTAL, ROTULO_DO_CONDUTOR_VERTICAL, capacidadeDoVerticalLMin, dnDoHorizontal, dnDoVertical } from '../blueprintCondutoresPluviais';
import { FICHA_DO_PONTO_HIDRAULICO } from '../blueprintHidraulica';
import { pontoNaFrente } from '../blueprintAncorasHidro';
import type { PendenciaDoPpci } from '../blueprintGeradorPpci';
import type { BaseDoPredio, ContextoDoPredio } from './terreoECobertura';

/** O DN de referência para contar os condutores, mm. */
export const DN_DE_REFERENCIA_DO_CONDUTOR_MM = 100;
/** Pelo menos dois condutores: um entope, o outro escoa. */
export const MINIMO_DE_CONDUTORES = 2;
/** O condutor fica a isto do canto do bloco, ao longo da fachada, mm. */
const DO_CANTO_MM = 600;
/** O eixo do condutor a isto da face externa da parede, mm. */
const FORA_DA_FACE_MM = 100;
/** O ralo a isto da face interna da platibanda, mm. */
const DENTRO_DA_PLATIBANDA_MM = 300;
/** A cota da passagem do ralo ao condutor (sob a laje da cobertura) — o encontro dos trechos de cada andar, mm. */
const JUNCAO_MM = -150;
/** A caixa de areia ao pé do condutor, para fora, mm. */
const CAIXA_FORA_MM = 600;
/** Rugosidade de Manning do PVC (NBR 10844, Tabela 4). */
const MANNING_PVC = 0.011;

const inteiro = (p: { x: number; y: number }): Point => ({ x: Math.round(p.x), y: Math.round(p.y) }) as Point;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const f0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

export interface CondutorDoPredio {
  ralo: Point;
  at: Point;
  dnMm: number;
  vazaoLMin: number;
}

export interface PluvialDoPredio {
  comandos: number;
  areaM2: number;
  intensidadeMmH: number;
  vazaoLMin: number;
  condutores: CondutorDoPredio[];
  dnHorizontalMm: number | null;
  pendencias: PendenciaDoPpci[];
}

const trecho = (levelId: ObjectId, a: Point, ca: number, b: Point, cb: number, bitolaMm: number, rotulo: string): Command => ({
  type: 'AddTrecho', levelId, disciplina: 'PLUVIAL', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, cotaAMm: ca, cotaBMm: cb, bitolaMm, sugerido: true, rotulo,
});

/** O lugar de `n` condutores no contorno do bloco: junto dos cantos e, passando deles, no meio dos lados mais longos. */
function lugaresNoContorno(base: BaseDoPredio, n: number, espessuraMm: number): { ralo: Point; at: Point; normal: { x: number; y: number } }[] {
  const pts = base.bloco.pontos as Point[];
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  const lados = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const L = dist(a, b);
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let nrm = { x: u.y, y: -u.x };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((mid.x - c.x) * nrm.x + (mid.y - c.y) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
    return { a, b, L, u, nrm };
  });
  // Os candidatos: no começo de cada lado (o canto), depois o meio dos lados do mais longo para o mais curto.
  const candidatos: { lado: (typeof lados)[number]; s: number }[] = [
    ...lados.filter((l) => l.L > 2 * DO_CANTO_MM).map((lado) => ({ lado, s: DO_CANTO_MM })),
    ...[...lados].sort((x, y) => y.L - x.L).map((lado) => ({ lado, s: lado.L / 2 })),
  ];
  // Os lados de um polígono podem ser percorridos em qualquer sentido — os de bloco em L têm cantos côncavos: o candidato
  // tem de ficar FORA do bloco (a normal aponta para fora) e longe dos já escolhidos.
  const escolhidos: { ralo: Point; at: Point; normal: { x: number; y: number } }[] = [];
  for (const { lado, s } of candidatos) {
    if (escolhidos.length >= n) break;
    const p = { x: lado.a.x + lado.u.x * s, y: lado.a.y + lado.u.y * s };
    const fora = espessuraMm / 2 + FORA_DA_FACE_MM;
    const dentro = espessuraMm / 2 + DENTRO_DA_PLATIBANDA_MM;
    const at = inteiro({ x: p.x + lado.nrm.x * fora, y: p.y + lado.nrm.y * fora });
    const ralo = inteiro({ x: p.x - lado.nrm.x * dentro, y: p.y - lado.nrm.y * dentro });
    if (escolhidos.some((e) => dist(e.at, at) < 2 * DO_CANTO_MM)) continue;
    escolhidos.push({ ralo, at, normal: lado.nrm });
  }
  return escolhidos;
}

export function lancarPluvial(
  ctx: ContextoDoPredio,
  base: BaseDoPredio,
  terreo: { levelId: ObjectId } | null,
  cobertura: { levelId: ObjectId },
  hipParcial: Partial<HipotesesPluviais> | null,
): PluvialDoPredio {
  const hip: HipotesesPluviais = { ...HIPOTESES_PLUVIAIS_PADRAO, ...(hipParcial ?? {}) };
  const pendencias: PendenciaDoPpci[] = [];
  const tipo = base.tipoLevelId;
  const pe = (id: ObjectId) => ctx.m.levels.find((l) => l.id === id)?.defaultHeightMm ?? 3000;
  const pts = base.bloco.pontos as Point[];
  const areaM2 = Math.abs(pts.reduce((s, q, i) => s + q.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * q.y, 0)) / 2 / 1e6;
  const intensidade = intensidadeDeProjeto(hip, areaM2);
  const intensidadeMmH = intensidade?.mmH ?? INTENSIDADE_ATE_100M2_MMH;
  if (!intensidade) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Pluvial: sem a cidade (ou a intensidade) nas premissas pluviais do estudo, a cobertura de ${f0(areaM2)} m² foi dimensionada com ${INTENSIDADE_ATE_100M2_MMH} mm/h — a NBR 10844 só permite adotá-la até 100 m²; escolha a cidade.` });
  const vazaoLMin = vazaoDeProjetoLMin(intensidadeMmH, areaM2);
  const n = Math.max(MINIMO_DE_CONDUTORES, Math.ceil(vazaoLMin / capacidadeDoVerticalLMin(DN_DE_REFERENCIA_DO_CONDUTOR_MM)));
  const paredeExterna = ctx.m.walls.filter((w) => w.levelId === tipo).reduce((m, w) => Math.max(m, w.thicknessMm), 150);
  const lugares = lugaresNoContorno(base, n, paredeExterna);
  if (lugares.length < n) pendencias.push({ grupo: 'VERIFICACAO', texto: `Pluvial: a vazão pede ${n} condutor(es) e o contorno do bloco comportou ${lugares.length} — complete à mão.` });
  const qCada = vazaoLMin / Math.max(1, lugares.length);
  const fila: Command[] = [];
  const condutores: CondutorDoPredio[] = [];
  for (const l of lugares) {
    const dn = dnDoVertical(qCada);
    condutores.push({ ralo: l.ralo, at: l.at, dnMm: dn, vazaoLMin: qCada });
    // O ralo na cobertura, por dentro da platibanda; a passagem até a face externa, sob a laje.
    fila.push(
      { type: 'AddTerminal', levelId: cobertura.levelId, disciplina: 'PLUVIAL', tipo: FICHA_DO_PONTO_HIDRAULICO.RALO_PLUVIAL.rotulo, at: l.ralo, cotaMm: 0, tipoHidraulico: 'RALO_PLUVIAL', sugerida: true } as Command,
      trecho(cobertura.levelId, l.ralo, 0, l.ralo, JUNCAO_MM, dn, ROTULO_DO_CONDUTOR_VERTICAL),
      trecho(cobertura.levelId, l.ralo, JUNCAO_MM, l.at, JUNCAO_MM, dn, ROTULO_DO_CONDUTOR_HORIZONTAL),
      // O vertical no tipo: da passagem deste andar à do de cima — a cópia viva empilha.
      trecho(tipo, l.at, JUNCAO_MM, l.at, pe(tipo) + JUNCAO_MM, dn, ROTULO_DO_CONDUTOR_VERTICAL),
    );
  }
  let dnHorizontalMm: number | null = null;
  if (!terreo) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Pluvial: sem o térreo do prédio, a descida dos condutores até o terreno e a saída ficam para o projetista.' });
  else {
    const T = terreo.levelId;
    const enterrado = -hip.profundidadeDoCondutorMm;
    const caixas = lugares.map((l) => ({ l, caixa: inteiro({ x: l.at.x + l.normal.x * CAIXA_FORA_MM, y: l.at.y + l.normal.y * CAIXA_FORA_MM }) }));
    const frente = pontoNaFrente(ctx.m, inteiro({ x: caixas.reduce((s, x) => s + x.caixa.x, 0) / Math.max(1, caixas.length), y: caixas.reduce((s, x) => s + x.caixa.y, 0) / Math.max(1, caixas.length) }));
    const decl = Math.max(0.5, hip.declividadeDoCondutorPct);
    for (const { l, caixa } of caixas) {
      fila.push(
        trecho(T, l.at, pe(T) + JUNCAO_MM, l.at, enterrado, condutores[0].dnMm, ROTULO_DO_CONDUTOR_VERTICAL),
        trecho(T, l.at, enterrado, caixa, enterrado - Math.round((CAIXA_FORA_MM * decl) / 100), dnDoHorizontal(qCada, MANNING_PVC, decl, condutores[0].dnMm), ROTULO_DO_CONDUTOR_HORIZONTAL),
        { type: 'AddTerminal', levelId: T, disciplina: 'PLUVIAL', tipo: FICHA_DO_PONTO_HIDRAULICO.CAIXA_AREIA.rotulo, at: caixa, cotaMm: enterrado - Math.round((CAIXA_FORA_MM * decl) / 100), tipoHidraulico: 'CAIXA_AREIA', sugerida: true } as Command,
      );
    }
    if (!frente) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Pluvial: marque a divisa da frente do lote — a saída pluvial vai nela.' });
    else {
      const saida = inteiro(frente.ponto);
      // Todos chegam à saída na mesma cota — a do mais longo, com a declividade da premissa (os outros, com mais).
      const cotaDaCaixa = enterrado - Math.round((CAIXA_FORA_MM * decl) / 100);
      const cotaNaSaida = Math.min(...caixas.map(({ caixa }) => cotaDaCaixa - Math.round((dist(caixa, saida) * decl) / 100)));
      dnHorizontalMm = dnDoHorizontal(vazaoLMin, MANNING_PVC, decl, condutores[0].dnMm);
      for (const { caixa } of caixas) fila.push(trecho(T, caixa, cotaDaCaixa, saida, cotaNaSaida, dnDoHorizontal(qCada, MANNING_PVC, decl, condutores[0].dnMm), ROTULO_DO_CONDUTOR_HORIZONTAL));
      fila.push({ type: 'AddTerminal', levelId: T, disciplina: 'PLUVIAL', tipo: FICHA_DO_PONTO_HIDRAULICO.LIGACAO_PLUVIAL.rotulo, at: saida, cotaMm: cotaNaSaida, tipoHidraulico: 'LIGACAO_PLUVIAL', sugerida: true } as Command);
      pendencias.push({ grupo: 'CONFERIR', texto: `Pluvial: a saída na frente do lote a ${(-cotaNaSaida / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m de profundidade — confira a cota da sarjeta (ou da galeria) e a ligação com a prefeitura.` });
    }
  }
  pendencias.push({ grupo: 'PREMISSA', texto: `Pluvial: a laje da cobertura impermeabilizada com caimento de pelo menos 1 % para os ${lugares.length} ralo(s); ${lugares.length} condutor(es) DN ${condutores[0]?.dnMm ?? '—'} aparentes na fachada (${f0(vazaoLMin)} L/min para ${f0(areaM2)} m² a ${intensidadeMmH} mm/h) — confira no ábaco da NBR 10844 e com a arquitetura da fachada.` });
  return { comandos: ctx.aplicar(fila), areaM2, intensidadeMmH, vazaoLMin, condutores, dnHorizontalMm, pendencias };
}
