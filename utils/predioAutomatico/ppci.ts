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
import type { BlueprintModel, ObjectId, Point } from '../blueprintKernel';
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

export function conferirIncendioDoPredio(
  m: BlueprintModel,
  descargaLevelId: ObjectId,
  ultimoLevelId: ObjectId,
  hipParcial: Partial<HipotesesIncendio> | null,
): IncendioDoPredio {
  const pendencias: PendenciaDoPpci[] = [];
  const base = { ...HIPOTESES_INCENDIO_PADRAO, ...(hipParcial ?? {}) } as HipotesesIncendio;
  const elev = (id: ObjectId) => m.levels.find((l) => l.id === id)?.elevationMm ?? 0;
  const alturaCalculadaM = Math.max(0, elev(ultimoLevelId) - elev(descargaLevelId)) / 1000;
  const hip: HipotesesIncendio = {
    ...base,
    classificacao: {
      ...base.classificacao,
      divisao: base.classificacao.divisao ?? DIVISAO_DO_PREDIO_PADRAO,
      alturaDeclaradaM: base.classificacao.alturaDeclaradaM ?? alturaCalculadaM,
      pisoDeDescargaLevelId: descargaLevelId,
    },
  };
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
  pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Incêndio: ${exigidas.length} medida(s) exigida(s) para ${c.divisao.valor ?? '?'} com ${c.altura.valorM.toLocaleString('pt-BR')} m — os equipamentos de cada andar e os hidrantes ainda não são lançados pelo prédio automático (PA9b e PA9c); lance pelo PPCI da planta.` });
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
