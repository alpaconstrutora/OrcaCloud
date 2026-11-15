/**
 * PRÉDIO AUTOMÁTICO — o INCÊNDIO, primeira parte (PA9a do plano docs/planos/2026-11-12-predio-automatico.md, 14/11/2026):
 * a CLASSIFICAÇÃO do prédio, as EXIGÊNCIAS e a ROTA DE FUGA em todos os andares — conferidas no modelo FINAL (depois da
 * cópia viva), sem lançar nada. Os equipamentos de cada andar (extintores, sinalização, iluminação, alarme) e os
 * hidrantes com a casa de bombas são a PA9b e a PA9c: o gerador de PPCI da planta edita portas e põe peças em todo
 * pavimento — nas cópias vivas isso é recusado; no prédio eles vão no tipo.
 *
 * A classificação usa as premissas de incêndio do estudo (o preset do Corpo de Bombeiros, as saídas, a carga), com três
 * coisas do prédio: a divisão é a do estudo ou, sem ela, A-2 (habitação multifamiliar); o pavimento de descarga é o
 * térreo do prédio; e a ALTURA é a do piso do último andar com unidades — a cobertura técnica não conta (IT 01: a altura
 * vai do piso de descarga ao piso do último pavimento ocupado). Sem a altura declarada a classificação tomava a cobertura.
 */
import { applyBatch, pointInPolygon } from '../blueprintKernel';
import type { BlueprintModel, Command, ObjectId, Point } from '../blueprintKernel';
import { analisarExtintores, proporExtintores } from '../blueprintExtintores';
import { analisarSinalizacao, proporSinalizacao } from '../blueprintSinalizacao';
import { analisarIluminacao, proporIluminacao } from '../blueprintIluminacaoEmergencia';
import { analisarAlarme, proporAlarme } from '../blueprintDeteccaoAlarme';
import { kitDaPeca } from '../blueprintKitsIncendio';
import type { ContextoDoPredio } from './terreoECobertura';
import { classificarEdificacao, exigenciasDaEdificacao, HIPOTESES_INCENDIO_PADRAO, type HipotesesIncendio } from '../blueprintIncendioClassificacao';
import { percursoDeFuga } from '../blueprintRotaDeFuga';
import { criteriosDoPercursoMG } from '../blueprintIncendioSaidasMG';
import { MEDIDAS_NAO_MODELADAS } from '../blueprintIncendioExecutivo';
import type { LocalDaPendencia, PendenciaDoPpci } from '../blueprintGeradorPpci';

/** A divisão de quem não declarou: habitação multifamiliar (IT 01, Tabela 1). */
export const DIVISAO_DO_PREDIO_PADRAO = 'A-2';

export interface RotaDoAndar {
  levelId: ObjectId;
  nome: string;
  ambientes: number;
  semRota: number;
  naoAtendem: number;
  /** A maior distância até a saída (pela escada), m. */
  piorM: number | null;
}

export interface IncendioDoPredio {
  divisao: string | null;
  grupo: string | null;
  alturaM: number;
  areaM2: number;
  /** As medidas exigidas (os nomes), as condicionais e quantas a tabela dispensa. */
  exigidas: string[];
  condicionais: string[];
  dispensadas: number;
  rota: { andares: RotaDoAndar[]; limiteM: number; fonte: string };
  pendencias: PendenciaDoPpci[];
}

/**
 * As premissas de incêndio do prédio: as do estudo, com a divisão delas ou A-2, o piso de descarga = o térreo do prédio e a
 * altura declarada = a do piso do último andar com unidades (a cobertura técnica não conta).
 */
export function hipotesesDeIncendioDoPredio(m: BlueprintModel, descargaLevelId: ObjectId, ultimoLevelId: ObjectId, hipParcial: Partial<HipotesesIncendio> | null): { hip: HipotesesIncendio; base: HipotesesIncendio } {
  const base = { ...HIPOTESES_INCENDIO_PADRAO, ...(hipParcial ?? {}) } as HipotesesIncendio;
  const elev = (id: ObjectId) => m.levels.find((l) => l.id === id)?.elevationMm ?? 0;
  const alturaCalculadaM = Math.max(0, elev(ultimoLevelId) - elev(descargaLevelId)) / 1000;
  return {
    base,
    hip: {
      ...base,
      classificacao: {
        ...base.classificacao,
        divisao: base.classificacao.divisao ?? DIVISAO_DO_PREDIO_PADRAO,
        alturaDeclaradaM: base.classificacao.alturaDeclaradaM ?? alturaCalculadaM,
        pisoDeDescargaLevelId: descargaLevelId,
      },
    },
  };
}

export function conferirIncendioDoPredio(
  m: BlueprintModel,
  descargaLevelId: ObjectId,
  ultimoLevelId: ObjectId,
  hipParcial: Partial<HipotesesIncendio> | null,
): IncendioDoPredio {
  const pendencias: PendenciaDoPpci[] = [];
  const { hip, base } = hipotesesDeIncendioDoPredio(m, descargaLevelId, ultimoLevelId, hipParcial);
  if (!base.classificacao.divisao) pendencias.push({ grupo: 'PREMISSA', texto: `Incêndio: sem a ocupação nas premissas do estudo — o prédio foi classificado como ${DIVISAO_DO_PREDIO_PADRAO} (habitação multifamiliar).` });
  const c = classificarEdificacao(m, hip.classificacao);
  for (const p of c.pendencias) pendencias.push({ grupo: 'PREMISSA', texto: `Incêndio: ${p}` });
  const ex = exigenciasDaEdificacao(c);
  const exigidas = ex.medidas.filter((x) => x.estado === 'EXIGIDA');
  const condicionais = ex.medidas.filter((x) => x.estado === 'CONDICIONAL');
  for (const x of condicionais) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Incêndio — ${x.nome}: ${x.motivo}` });
  for (const x of exigidas.filter((y) => MEDIDAS_NAO_MODELADAS.includes(y.medida))) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Incêndio — ${x.nome}: exigida e fora do desenho — projeto do responsável.` });

  // A rota de fuga de cada ambiente de cada andar, até o exterior no térreo (pela escada).
  const grupo = c.divisao.valor?.trim().charAt(0).toUpperCase() || null;
  const pf = percursoDeFuga(m, grupo, descargaLevelId, hip.saidas.percursoMaximoM, criteriosDoPercursoMG(c.preset, c.divisao.valor, hip.saidas));
  for (const p of pf.pendencias) if (!/sem caminho até uma saída/.test(p)) pendencias.push({ grupo: 'PREMISSA', texto: `Rota de fuga: ${p}` });
  const andares: RotaDoAndar[] = [...m.levels]
    .sort((a, b) => a.elevationMm - b.elevationMm)
    .flatMap((l) => {
      const amb = pf.ambientes.filter((x) => x.levelId === l.id);
      if (!amb.length) return [];
      const comRota = amb.filter((x) => x.distanciaM != null);
      return [{ levelId: l.id, nome: l.name, ambientes: amb.length, semRota: amb.length - comRota.length, naoAtendem: amb.filter((x) => x.atende === false).length, piorM: comRota.length ? Math.round(Math.max(...comRota.map((x) => x.distanciaM!)) * 10) / 10 : null }];
    });
  const local = (x: (typeof pf.ambientes)[number]): LocalDaPendencia => ({ levelId: x.levelId, ids: [x.spaceId], ponto: x.origem as Point });
  const sem = pf.ambientes.filter((x) => x.distanciaM == null);
  if (sem.length) pendencias.push({ grupo: 'VERIFICACAO', texto: `Rota de fuga: ${sem.length} ambiente(s) sem caminho até a saída no térreo (${[...new Set(sem.map((x) => m.levels.find((l) => l.id === x.levelId)?.name))].join(', ')}).`, locais: sem.slice(0, 30).map(local) });
  const longe = pf.ambientes.filter((x) => x.atende === false);
  if (longe.length) pendencias.push({ grupo: 'VERIFICACAO', texto: `Rota de fuga: ${longe.length} ambiente(s) com o caminhamento até o local seguro acima do limite (${longe[0].rotulo}: ${longe[0].caminhamentoM ?? longe[0].distanciaM} m de ${longe[0].limiteM ?? pf.limiteM} m).`, locais: longe.slice(0, 30).map(local) });
  if (exigidas.some((x) => x.medida === 'HIDRANTES')) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Incêndio: os hidrantes, a rede e a casa de bombas ainda não são lançados pelo prédio automático (PA9c) — lance pelo PPCI da planta.' });
  return {
    divisao: c.divisao.valor,
    grupo: c.grupo?.grupo ?? null,
    alturaM: c.altura.valorM,
    areaM2: Math.round(c.areaTotalM2),
    exigidas: exigidas.map((x) => x.nome),
    condicionais: condicionais.map((x) => x.nome),
    dispensadas: ex.medidas.filter((x) => x.estado === 'DISPENSADA').length,
    rota: { andares, limiteM: pf.limiteM, fonte: pf.fonte },
    pendencias,
  };
}

// ─── PA9b: os equipamentos de cada andar ─────────────────────────────────────

export { semOsComodosDasUnidades };

/**
 * O modelo SEM os andares copiados do tipo (e tudo o que mora neles) — a vista em que os motores do PPCI da planta
 * propõem. Eles põem peça em todo ambiente de todo pavimento; nas cópias isso seria recusado (e redundante: a cópia viva
 * leva o que o tipo tem). Os contadores de id (`seq`) ficam: o que a vista cria tem os ids que o modelo real dará.
 */
export function vistaSemAsCopias(m: BlueprintModel, copias: ReadonlySet<ObjectId>, tipoLevelId: ObjectId): BlueprintModel {
  const saida: Record<string, unknown> = { ...m };
  const uidsDasCopias = new Set(m.levels.filter((l) => copias.has(l.id)).map((l) => l.uid));
  const uidDoTipo = m.levels.find((l) => l.id === tipoLevelId)?.uid;
  const paraOTipo = (x: unknown): unknown => {
    if (!x || typeof x !== 'object') return x;
    let y: Record<string, unknown> | null = null;
    for (const [campo, valor] of Object.entries(x as Record<string, unknown>)) {
      const mudar = (/.LevelId$/.test(campo) && copias.has(valor as ObjectId)) || (campo === 'levelUid' && uidsDasCopias.has(valor as string));
      if (!mudar) continue;
      y ??= { ...(x as Record<string, unknown>) };
      y[campo] = campo === 'levelUid' ? uidDoTipo : tipoLevelId;
    }
    return y ?? x;
  };
  for (const [k, v] of Object.entries(m)) {
    if (k === 'levels' || !Array.isArray(v) || !v.length) continue;
    if (!v.some((x) => x && typeof x === 'object' && 'levelId' in (x as object))) continue;
    // O que APONTA para um andar copiado — o elevador que chega ao último andar (`ateLevelId`), o medidor do térreo que mede a
    // unidade de um andar (`unidadeLevelId`) — passa a apontar para o tipo na vista (sem isso a invariante a recusa).
    saida[k] = v.filter((x) => !copias.has((x as { levelId?: ObjectId }).levelId ?? '')).map((x) => paraOTipo(x));
  }
  const paredes = new Set((saida.walls as BlueprintModel['walls']).map((w) => w.id));
  saida.openings = m.openings.filter((o) => paredes.has(o.wallId));
  saida.levels = m.levels.filter((l) => !copias.has(l.id));
  return saida as unknown as BlueprintModel;
}

export interface EquipamentosDeIncendioDoPredio {
  comandos: number;
  /** Por tipo de peça (o tipo do ponto: extintor, placa, luminária…), no tipo, no térreo e na cobertura. */
  pecas: Record<string, number>;
  pendencias: PendenciaDoPpci[];
}

/**
 * Os equipamentos que cada andar pede — extintores (com placa), sinalização da rota, iluminação de emergência e, quando
 * exigidos, os dispositivos do alarme — pelos MESMOS motores e na mesma ordem do PPCI da planta (`gerarPpci`), na vista
 * sem as cópias, ANTES da marca `copiaInstalacoes`: o tipo recebe e a cópia viva leva aos andares. Cada lote é aplicado
 * na vista e no modelo real; se os ids criados divergirem, para (as peças seguintes apontariam para outras).
 */
export function lancarEquipamentosDeIncendio(
  ctx: ContextoDoPredio,
  descargaLevelId: ObjectId,
  ultimoLevelId: ObjectId,
  copias: ReadonlySet<ObjectId>,
  tipoLevelId: ObjectId,
  hipParcial: Partial<HipotesesIncendio> | null,
): EquipamentosDeIncendioDoPredio {
  const pendencias: PendenciaDoPpci[] = [];
  const { hip } = hipotesesDeIncendioDoPredio(ctx.m, descargaLevelId, ultimoLevelId, hipParcial);
  // A classificação no modelo inteiro (a área de todos os andares); as propostas, na vista.
  const c = classificarEdificacao(ctx.m, hip.classificacao);
  const exigencias = exigenciasDaEdificacao(c);
  const exigida = (id: string) => exigencias.medidas.some((x) => x.medida === id && x.estado === 'EXIGIDA');
  let v = vistaSemAsCopias(ctx.m, copias, tipoLevelId);
  // Habitação (grupo A): os equipamentos do condomínio ficam nas áreas COMUNS — a rota conta a partir da porta da unidade
  // (IT 08, 5.5.2.2). Sem os cômodos das unidades na vista, o motor punha extintor na varanda e placa no dormitório.
  if (c.grupo?.grupo === 'A') v = { ...v, spaces: semOsComodosDasUnidades(v, tipoLevelId) };
  const pecas: Record<string, number> = {};
  let comandos = 0;
  const aplicar = (lote: Command[]): number => {
    if (!lote.length) return 0;
    const rv = applyBatch(v, lote);
    v = rv.model;
    comandos += ctx.aplicar(lote);
    const real = ctx.criadosNoUltimoLote ?? [];
    if (real.length !== rv.diff.created.length || real.some((id, i) => id !== rv.diff.created[i])) throw new Error('os ids criados na vista sem as cópias divergem dos do prédio');
    for (const x of lote) if (x.type === 'AddTerminal') pecas[(x as { tipoHidraulico?: string }).tipoHidraulico ?? x.tipo] = (pecas[(x as { tipoHidraulico?: string }).tipoHidraulico ?? x.tipo] ?? 0) + 1;
    return lote.length;
  };
  const grupo = c.divisao.valor?.trim().charAt(0).toUpperCase() || null;
  const percurso = () => percursoDeFuga(v, grupo, descargaLevelId, hip.saidas.percursoMaximoM, criteriosDoPercursoMG(c.preset, c.divisao.valor, hip.saidas));
  if (exigida('EXTINTORES')) {
    const p = proporExtintores(v, analisarExtintores(v, c.carga.nivel, hip.extintores), hip.extintores);
    aplicar(p.comandos.length ? kitDaPeca(v, p.comandos).comandos : []);
    for (const x of p.semCobertura) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Extintor: ${x}` });
  }
  if (exigida('SINALIZACAO')) aplicar(proporSinalizacao(v, analisarSinalizacao(v, percurso(), descargaLevelId)));
  if (exigida('ILUMINACAO_EMERGENCIA')) {
    // Até 3 passadas, como no PPCI da planta: a luminária lançada muda o que a análise seguinte acusa.
    for (let passada = 0; passada < 3; passada++) {
      const pc = percurso();
      const lote = proporIluminacao(v, pc, analisarIluminacao(v, pc, descargaLevelId, hip.iluminacao));
      if (!lote.length) break;
      aplicar(kitDaPeca(v, lote).comandos);
    }
  }
  if (exigida('DETECCAO') || exigida('ALARME')) {
    aplicar(kitDaPeca(v, proporAlarme(v, analisarAlarme(v, exigida('DETECCAO'), exigida('ALARME')))).comandos);
    pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Alarme: o eletroduto do laço (da central aos dispositivos de cada andar, pela prumada) fica para o projetista — o prédio automático lança a central e os dispositivos.' });
  }
  if (exigida('SAIDAS_EMERGENCIA')) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: 'Saídas de emergência: a barra antipânico nas portas da rota (que a análise de saídas pedir) fica para o PPCI da planta — ela edita as portas, e as dos andares copiados vêm do tipo.' });
  return { comandos, pecas, pendencias };
}

/** Os ambientes do pavimento tipo que NÃO são de unidade (circulação, núcleo) — e todos os dos outros pavimentos. */
function semOsComodosDasUnidades(m: BlueprintModel, tipoLevelId: ObjectId): BlueprintModel['spaces'] {
  const area = (r: readonly Point[]) => Math.abs(r.reduce((s, q, i) => s + q.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * q.y, 0)) / 2;
  const doTipo = m.spaces.filter((s) => s.levelId === tipoLevelId);
  const etiquetas = new Set((m.unidades ?? []).flatMap((u) => u.etiquetaUids));
  const daUnidade = new Set<ObjectId>();
  for (const l of m.labels.filter((x) => x.levelId === tipoLevelId && etiquetas.has(x.uid))) {
    const s = doTipo.filter((x) => pointInPolygon(x.ring as Point[], l.at as Point)).sort((a, b) => area(a.ring as Point[]) - area(b.ring as Point[]))[0];
    if (s) daUnidade.add(s.id);
  }
  return m.spaces.filter((s) => !daUnidade.has(s.id));
}
