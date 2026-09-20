// services/blueprintComprasService.ts
//
// PLANTA → COMPRAS (E10.3): a ida e volta ao banco. O cálculo vive em
// `utils/blueprintCompras.ts` (puro); aqui só se lê o que ele precisa e se
// grava o que ele devolve — em `procurement_plan_items`, a tabela do Plano de
// Aquisições, que a tela do plano, a cotação e o pedido já sabem consumir.
//
// Duas etapas de propósito, como no orçamento: PREVER (nada gravado) e depois
// LANÇAR. Quem lança pode ainda ABRIR UMA COTAÇÃO com os itens recém-lançados
// — `procurementService.generateQuotationFromItems`, o mesmo caminho da tela do
// plano, para que a cotação não saiba que nasceu de uma planta.

import { supabase } from '../lib/supabase';
import { getSnapshot, getStudy, recordAudit, tarefasDoCronograma } from './blueprintService';
import { preverLancamentos, resolverItens, type PreviaOrcamento } from './blueprintBudgetService';
import { inventoryService } from './inventoryService';
import { procurementService } from './procurementService';
import {
  datarInsumos,
  explodirEmInsumos,
  indexarTarefas,
  linhasDoPlano,
  precificarInsumos,
  prefixoDeCompras,
  resumirCompras,
  type ContextoDeCompras,
  type ExplosaoDeInsumos,
  type InsumoDatado,
  type LinhaDoPlano,
  type ResumoDeCompras,
} from '../utils/blueprintCompras';

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`blueprintCompras/${context}: ${error?.message ?? 'erro desconhecido'}`);
}

export interface NoPlano {
  /** Itens desta planta na obra ainda pendentes — os que um novo lançamento substitui. */
  pendentes: number;
  /** Já em cotação/pedido/recebidos — ficam, para rastreabilidade. */
  emAndamento: number;
}

export interface PreviaDeCompras {
  projectId: string;
  organizationId: string;
  contexto: PreviaOrcamento['contexto'];
  explosao: ExplosaoDeInsumos;
  insumos: InsumoDatado[];
  linhas: LinhaDoPlano[];
  resumo: ResumoDeCompras;
  noPlano: NoPlano;
  /** Quantas tarefas datadas o cronograma da obra tem — 0 explica por que nada veio "do cronograma". */
  tarefasDatadas: number;
}

/** Quantos itens desta planta já estão no plano da obra, por situação. */
export async function contarNoPlano(projectId: string, studyId: string): Promise<NoPlano> {
  const { data, error } = await supabase
    .from('procurement_plan_items')
    .select('id, status')
    .eq('project_id', projectId)
    .like('source_budget_item_id', `${prefixoDeCompras(studyId)}%`);
  if (error) fail('contarNoPlano', error);
  const rows = data ?? [];
  return {
    pendentes: rows.filter((r) => r.status === 'pending').length,
    emAndamento: rows.filter((r) => r.status !== 'pending' && r.status !== 'cancelled').length,
  };
}

/**
 * Prévia SEM gravar: as linhas do orçamento que a planta gera (o MESMO caminho
 * de `preverLancamentos` — versão publicada, de-para, camadas, acabamentos,
 * esquadrias) explodidas em insumos, datadas pelo cronograma da obra e com o
 * prazo do fornecedor.
 */
export async function preverCompras(snapshotId: string, projectId: string, dataPadrao: string): Promise<PreviaDeCompras> {
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) throw new Error(`blueprintCompras: snapshot ${snapshotId} não encontrado`);
  const study = await getStudy(snapshot.study_id);
  if (!study) throw new Error(`blueprintCompras: estudo ${snapshot.study_id} não encontrado`);

  const previa = await preverLancamentos(snapshotId);
  const bruta = explodirEmInsumos(previa.entries);
  // Os componentes do SINAPI importado vêm sem preço: o custo do insumo é o do
  // catálogo (SINAPI + base própria + biblioteca), pelo MESMO resolvedor do orçamento.
  const semPreco = bruta.insumos.filter((i) => i.custoUnitario === 0 && i.codigo).map((i) => i.codigo as string);
  const precos = new Map<string, number>();
  if (semPreco.length > 0) {
    try {
      for (const [codigo, item] of await resolverItens(semPreco, snapshot.organization_id)) precos.set(codigo, Number(item.price ?? 0));
    } catch (e) {
      console.warn('[compras] catálogo indisponível para precificar insumos:', e);
    }
  }
  const explosao = precificarInsumos(bruta, precos);

  // O que falha aqui não pode derrubar a prévia: sem cronograma vale a data padrão;
  // sem prazos vale 0; sem Almoxarifado compra-se tudo — e a tela diz cada coisa.
  const [tarefas, prazos, posicoes, noPlano] = await Promise.all([
    tarefasDoCronograma(projectId).catch(() => []),
    inventoryService.listLeadTimes(snapshot.organization_id).catch(() => []),
    inventoryService.getNetPositions(snapshot.organization_id).catch(() => []),
    contarNoPlano(projectId, study.id),
  ]);
  const posicaoLiquida = new Map<string, number>();
  for (const p of posicoes) posicaoLiquida.set(p.inputCode, (posicaoLiquida.get(p.inputCode) ?? 0) + p.netQty);

  const ctx: ContextoDeCompras = {
    studyId: study.id,
    studyName: study.name,
    revision: snapshot.revision,
    projectId,
    organizationId: snapshot.organization_id,
    dataPadrao,
    tarefas: indexarTarefas(tarefas),
    prazos,
    posicaoLiquida,
  };
  const insumos = datarInsumos(explosao, ctx);
  return {
    projectId,
    organizationId: snapshot.organization_id,
    contexto: previa.contexto,
    explosao,
    insumos,
    linhas: linhasDoPlano(explosao, ctx),
    resumo: resumirCompras(insumos),
    noPlano,
    tarefasDatadas: tarefas.filter((t) => Boolean(t.startDate)).length,
  };
}

/**
 * Lança no Plano de Aquisições da obra. SUBSTITUI os itens pendentes que esta
 * planta já havia gerado (regerar depois de publicar uma versão nova é o caso
 * normal); os que já viraram cotação ou pedido ficam.
 */
export async function lancarNoPlano(previa: PreviaDeCompras): Promise<{ removidas: number; inseridas: number; ids: string[] }> {
  const prefixo = prefixoDeCompras(previa.contexto.studyId);
  const { data: apagados, error: erroApagar } = await supabase
    .from('procurement_plan_items')
    .delete()
    .eq('project_id', previa.projectId)
    .eq('status', 'pending')
    .like('source_budget_item_id', `${prefixo}%`)
    .select('id');
  if (erroApagar) fail('lancarNoPlano/substituir', erroApagar);

  const ids: string[] = [];
  const LOTE = 200;
  for (let i = 0; i < previa.linhas.length; i += LOTE) {
    const { data, error } = await supabase
      .from('procurement_plan_items')
      .insert(previa.linhas.slice(i, i + LOTE))
      .select('id');
    if (error) fail('lancarNoPlano/inserir', error);
    for (const r of data ?? []) ids.push(r.id as string);
  }

  await recordAudit({
    organizationId: previa.organizationId,
    studyId: previa.contexto.studyId,
    action: 'COMPRAS_LANCADAS',
    targetType: 'PROJECT',
    targetId: previa.projectId,
    metadata: {
      snapshot_id: previa.contexto.snapshotId,
      revision: previa.contexto.revision,
      removidas: apagados?.length ?? 0,
      inseridas: ids.length,
      total_estimado: previa.resumo.totalEstimado,
    },
  });

  return { removidas: apagados?.length ?? 0, inseridas: ids.length, ids };
}

/** Abre uma Solicitação de Cotação com os itens recém-lançados — o mesmo caminho da tela do plano. */
export async function abrirCotacao(previa: PreviaDeCompras, ids: string[]): Promise<{ quotationId: string; quotationNumber: string }> {
  const r = await procurementService.generateQuotationFromItems(ids, previa.projectId, previa.organizationId, {
    title: `Planta "${previa.contexto.studyName}" rev. ${previa.contexto.revision}`,
    description: `Insumos explodidos das linhas da Planta Inteligente (${previa.resumo.linhasDaPlanta} linha(s), versão ${previa.contexto.revision}, hash ${previa.contexto.snapshotHash.slice(0, 12)}).`,
  });
  await recordAudit({
    organizationId: previa.organizationId,
    studyId: previa.contexto.studyId,
    action: 'COTACAO_ABERTA',
    targetType: 'PROJECT',
    targetId: previa.projectId,
    metadata: { quotation_id: r.quotationId, quotation_number: r.quotationNumber, itens: ids.length },
  });
  return r;
}

/** Nome da obra vinculada — para a tela dizer ONDE o plano vai cair. */
export async function nomeDaObra(projectId: string): Promise<string> {
  const { data, error } = await supabase.from('projects').select('name').eq('id', projectId).single();
  if (error) fail('nomeDaObra', error);
  return (data?.name as string) ?? projectId.slice(0, 8);
}
