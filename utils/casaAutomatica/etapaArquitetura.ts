/**
 * Casa automática — etapa(s) `fechar`, `gerarTodas` de `planejarComPavimentos`, extraída(s) com o
 * `ContextoDaCasa` (P2, 12/11/2026). O marco das 8 casas prova que o motor gera o mesmo.
 */
import { pointInPolygon } from '../blueprintKernel';
import { gerar } from '../blueprintGerador';
import type { ResultadoDoGerador } from '../blueprintGerador';
import type { Programa } from '../blueprintPrograma';
import { conferirPrograma } from '../blueprintConferenciaDoPrograma';
import { avaliarRegras, REGRAS_SEMENTE } from '../blueprintRegras';
import { localDoElemento } from '../blueprintLocalDaPendencia';
import { comLocal, ROTULO_DA_ETAPA_DA_CASA } from './hipoteses';
import type { PlanoDaCasa, ResumoDoSobrado } from './hipoteses';
import type { ContextoDaCasa } from './contexto';
import { ResumoDasDisciplinas } from './orquestrador';

export function fechar(ctx: ContextoDaCasa, f: { projecaoM2: number; areaConstruidaM2: number; alturaM: number; semente: number; escolha: string; sobrado: ResumoDoSobrado | null; disciplinas: ResumoDasDisciplinas }): PlanoDaCasa {
  const { comandos, criados, decisoes, entrada, etapa, etapas, implantacao, loteDasRegras, pedidos, pendencias, programa, zonaDasRegras } = ctx;
  // F21: o molhado sem lado externo que ganhou EXAUSTOR (a climatização lança onde não há janela) está resolvido pela
  // ventilação mecânica — fica para conferir no código de obras, não "sem solução".
  for (const pd of pendencias) {
    const nome = /^Arquitetura: (.+) exige ventilação e ficou sem lado externo\.$/.exec(pd.texto)?.[1];
    if (!nome) continue;
    const sp = ctx.m.spaces.find((x) => x.name === nome);
    if (sp && (ctx.m.terminais ?? []).some((t) => t.tipoHidraulico === 'EXAUSTOR_AR' && t.levelId === sp.levelId && pointInPolygon(sp.ring, t.at))) {
      pd.grupo = 'CONFERIR';
      pd.texto = `Arquitetura: ${nome} sem lado externo — ventilação por exaustor com duto até a fachada (confira no código de obras).`;
    }
  }
  const conferencia = conferirPrograma(ctx.m, programa);
  for (const it of conferencia.itens) {
    if (it.item.uso === 'CIRCULACAO' || it.faltam <= 0) continue;
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Programa: falta ${it.faltam} × ${it.item.nome} no desenho` });
  }
  for (const rel of conferencia.relacoes) {
    if (rel.estado === 'VIOLADA' && rel.relacao.tipo !== 'DESEJAVEL') pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Programa: ${rel.a.nome} × ${rel.b.nome} — ${rel.relacao.tipo === 'OBRIGATORIA' ? 'deviam ter porta direta' : 'não podiam ser vizinhos'} (${rel.valor})`, ...comLocal(localDoElemento(ctx.m, [rel.spaceA, rel.spaceB].filter((x): x is string => !!x))) });
  }
  const atendidos = conferencia.itens.filter((it) => it.item.uso !== 'CIRCULACAO').reduce((s, it) => s + it.casados.length, 0);
  const regras = avaliarRegras(ctx.m, REGRAS_SEMENTE, {
    lote: loteDasRegras,
    zona: zonaDasRegras,
    taxaOcupacaoPct: loteDasRegras && loteDasRegras.areaM2 > 0 ? Math.round((f.projecaoM2 / loteDasRegras.areaM2) * 1000) / 10 : null,
    coeficiente: loteDasRegras && loteDasRegras.areaM2 > 0 ? Math.round((f.areaConstruidaM2 / loteDasRegras.areaM2) * 100) / 100 : null,
    alturaM: f.alturaM,
  });
  const violadas = regras.filter((x) => x.estado === 'VIOLADA' && x.regra.severidade === 'ERRO');
  for (const v of violadas) pendencias.push({ grupo: 'VERIFICACAO', texto: `Legislação: ${v.regra.nome} — ${v.alvoRotulo}${v.valores ? ` (${v.valores})` : ''}`, ...comLocal(localDoElemento(ctx.m, [v.selecionarId ?? v.alvoId].filter((x): x is string => !!x))) });
  etapa('CONFERENCIA', ROTULO_DA_ETAPA_DA_CASA.CONFERENCIA, 'CALCULOU', 0, `${atendidos} de ${pedidos} ambientes do programa; ${violadas.length} regra(s) violada(s)`);
  return {
    levelId: entrada.levelId,
    comandos,
    criados,
    etapas,
    pendencias,
    resultado: ctx.m,
    programa,
    implantacao,
    semente: f.semente,
    escolha: f.escolha,
    decisoes,
    sobrado: f.sobrado,
    resumo: { areaConstruidaM2: f.areaConstruidaM2, ambientesPedidos: pedidos, ambientesAtendidos: atendidos, regrasVioladas: violadas.length, ...f.disciplinas, terraplenagem: ctx.terraplenagemDaCasa, muro: ctx.resumoDoMuro },
  };
}

export function gerarTodas(ctx: ContextoDaCasa, p: Programa) {
  const { entradaDoGerador, hip, hipGerador } = ctx;
  const resultados: ResultadoDoGerador[] = [];
  const falhas: string[] = [];
  for (const s of hip.sementes.length ? hip.sementes : [1]) {
    try {
      resultados.push(gerar({ ...entradaDoGerador, programa: p }, s, hipGerador));
    } catch (e) {
      falhas.push(`semente ${s}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { resultados, falhas };
}
