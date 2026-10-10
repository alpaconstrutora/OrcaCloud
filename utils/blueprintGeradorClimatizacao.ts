/**
 * CLIMATIZAÇÃO E11 (10/10/2026) — O GERADOR DE CLIMATIZAÇÃO: um botão que
 * encadeia os motores das etapas E2 a E10 e devolve UMA prévia, UM lote e UM
 * Ctrl+Z, com o relatório do que ele NÃO decidiu. Molde: `gerarPpci`.
 *
 * ─── A ORDEM ────────────────────────────────────────────────────────────────
 *
 * Cada etapa propõe sobre a CÓPIA de trabalho já com as anteriores aplicadas
 * (o kernel dá ids determinísticos — `seq` por prefixo —, então o lote
 * inteiro, reaplicado no original, cria os MESMOS ids):
 *
 *   carga térmica por ambiente (E2, só cálculo)
 *   → equipamento: seleção pelo catálogo e posição do split, com o ponto
 *     elétrico e o sistema ligado (E4)
 *   → linha frigorígena e dreno (E5) → VRF, quando há condensadora VRF (E6)
 *   → rede de dutos, quando há terminal de ar (E7)
 *   → circuito dos pontos de ar-condicionado (Elétrica) — só quando não leva
 *     junto o que o gerador não criou (ver abaixo)
 *   → conflitos que a proposta criou (E10.2) → quantitativo e medidas do
 *     orçamento (E9, só cálculo) → a conferência do resultado (E8).
 *
 * ─── O QUE ELE NÃO DECIDE (vai para o relatório) ───────────────────────────
 *
 * Premissa faltando (nenhum ambiente climatizado, catálogo sem modelo), tabela
 * CONFERIR NA NORMA em uso, ambiente sem modelo que atenda ou sem lugar para o
 * equipamento, o CIRCUITO quando o pavimento tem outros pontos soltos (o
 * planejador de circuitos liga o pavimento inteiro — o gerador não mexe na
 * elétrica de quem não pediu) ou não tem exatamente um quadro, o lançamento no
 * orçamento (precisa da composição de cada item, no painel Orçamento), conflito
 * criado e cada verificação que ainda FALTA no fim. "Zero FALTA ou a lista exata".
 *
 * ─── RODAR DE NOVO ──────────────────────────────────────────────────────────
 *
 * Os planejadores de split, linha, VRF e dutos apagam as próprias peças
 * SUGERIDAS antes de propor (relançar é refazer, não acumular). Por isso gerar
 * de novo sobre o resultado não dá lote vazio — dá o MESMO desenho: as mesmas
 * peças nos mesmos lugares (é a lei do teste). Aceitar as sugestões (painéis
 * Split e Linha e dreno) é o que as fixa.
 */
import type { BlueprintModel, Command, ObjectId } from './blueprintKernel';
import { POLITICA_PADRAO, applyBatch, computeQuantities, conflitosDoModelo, TIPOS_DE_EVAPORADORA, TIPOS_DE_TERMINAL_DE_AR } from './blueprintKernel';
import type { HipotesesClimatizacao } from './blueprintClimatizacao';
import { cargaTermicaDoEstudo, type CargaTermicaDoNivel, type ContextoDaCarga } from './blueprintCargaTermica';
import { selecaoDoNivel, type ModeloDoCatalogo } from './blueprintSelecaoClimatizacao';
import { planejarEquipamentosSplit } from './blueprintPosicaoSplit';
import { planejarLinhasFrigorigenas } from './blueprintLinhaFrigorigena';
import { planejarVrf } from './blueprintVrf';
import { planejarRedeDeAr, vazoesDosTerminais } from './blueprintRedeDeAr';
import { planejarCircuitos, type HipotesesDeCircuitos } from './blueprintCircuitosAutomaticos';
import type { HipotesesEletricas } from './blueprintEletricaDimensionamento';
import { volumesDasPecasDeClimatizacao } from './blueprintRede';
import { materiaisDeClimatizacao } from './blueprintMateriaisClimatizacao';
import { resumoDasMedidas } from './blueprintBudget';
import { ROTULO_DO_GRUPO_DE_CLIMATIZACAO, verificacoesClimatizacao } from './blueprintClimatizacaoExecutivo';
import { RESPONSAVEL_VAZIO } from './blueprintTopografiaExecutivo';
import { ROTULO_DA_PENDENCIA, type GrupoDaPendencia, type PendenciaDoPpci, type SituacaoDaEtapa } from './blueprintGeradorPpci';
import type { BlocoDoMemorial } from './blueprintMemorialHidro';

export interface EtapaDaClimatizacao {
  id: 'CARGA' | 'EQUIPAMENTOS' | 'LINHA' | 'VRF' | 'DUTOS' | 'CIRCUITOS' | 'QUANTITATIVO' | 'ORCAMENTO';
  rotulo: string;
  situacao: SituacaoDaEtapa;
  comandos: number;
  nota: string | null;
}

export interface PlanoDaClimatizacao {
  /** O LOTE: aplicado no modelo original de uma vez, um Ctrl+Z. */
  comandos: Command[];
  /** Os ids que o lote cria, na ordem — para conferir a reaplicação. */
  criados: ObjectId[];
  etapas: EtapaDaClimatizacao[];
  pendencias: PendenciaDoPpci[];
  /** O modelo DEPOIS do lote (a prévia). */
  resultado: BlueprintModel;
}

export interface ContextoDoGeradorDeClimatizacao {
  /** O mesmo contexto do painel de carga térmica (materiais da biblioteca, cidade da zona). */
  carga?: ContextoDaCarga;
  /** Os modelos do catálogo da organização (`modelosDoCatalogo`). */
  modelos: readonly ModeloDoCatalogo[];
  /** As premissas do planejador de circuitos da Elétrica; ausente = o circuito fica para lá. */
  circuitos?: { hip: HipotesesDeCircuitos; eletricas: HipotesesEletricas } | null;
}

/** Medidas do orçamento que a climatização alimenta (E9). */
const MEDIDAS_DA_CLIMATIZACAO = ['CONTAGEM_EQUIPAMENTOS_CLIMATIZACAO', 'COMPRIMENTO_TUBO_FRIGORIGENA', 'COMPRIMENTO_TUBO_DRENO_AC', 'AREA_CHAPA_DUTO', 'CONTAGEM_TERMINAIS_DE_AR'];

const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Os valores de norma EM USO, marcados CONFERIR desde as etapas que os introduziram. */
export function conferirDaClimatizacao(hip: HipotesesClimatizacao): string[] {
  return [
    `Condições externas de projeto: TBS ${hip.clima.tbsExternaC ?? '—'} °C / TBU ${hip.clima.tbuExternaC ?? '—'} °C${hip.clima.cidade ? ` (${hip.clima.cidade})` : ''} — tabela por cidade da NBR 16401-1, CONFERIR`,
    'Carga térmica: ganhos por pessoa, iluminação, equipamentos e insolação por orientação (NBR 16655-3 — a norma não está entre os textos fornecidos)',
    `Seleção: folga de ${um(hip.selecao.folgaPct, 0)} % sobre a carga e o catálogo de capacidades da organização (tabela do fabricante)`,
    'Linha frigorígena: diâmetros, comprimento e desnível máximos e carga adicional de gás pela tabela do fabricante',
  ];
}

export function gerarClimatizacao(original: BlueprintModel, hip: HipotesesClimatizacao, cx: ContextoDoGeradorDeClimatizacao): PlanoDaClimatizacao {
  let m = original;
  const comandos: Command[] = [];
  const criados: ObjectId[] = [];
  const etapas: EtapaDaClimatizacao[] = [];
  const pendencias: PendenciaDoPpci[] = [];
  const aplicar = (lote: Command[]): number => {
    if (lote.length === 0) return 0;
    const r = applyBatch(m, lote);
    m = r.model;
    comandos.push(...lote);
    criados.push(...r.diff.created);
    return lote.length;
  };
  const etapa = (id: EtapaDaClimatizacao['id'], rotulo: string, situacao: SituacaoDaEtapa, n: number, nota: string | null = null) =>
    etapas.push({ id, rotulo, situacao: situacao === 'LANCOU' && n === 0 ? 'NADA_A_FAZER' : situacao, comandos: n, nota });
  const pendencia = (grupo: GrupoDaPendencia, texto: string) => pendencias.push({ grupo, texto });
  const nomeDoNivel = (id: string) => original.levels.find((l) => l.id === id)?.name ?? id;
  const ROTULOS: Record<EtapaDaClimatizacao['id'], string> = {
    CARGA: 'Carga térmica por ambiente',
    EQUIPAMENTOS: 'Equipamentos — seleção pelo catálogo e posição do split',
    LINHA: 'Linha frigorígena e dreno',
    VRF: 'VRF — árvore e derivadores',
    DUTOS: 'Rede de dutos',
    CIRCUITOS: 'Circuito dos pontos de ar-condicionado',
    QUANTITATIVO: 'Quantitativo — lista de materiais',
    ORCAMENTO: 'Orçamento — medidas',
  };

  // ── Carga térmica (E2) ─────────────────────────────────────────────────────
  const cargas = cargaTermicaDoEstudo(m, hip, cx.carga ?? {});
  const climatizados = cargas.flatMap((n) => n.ambientes.filter((a) => a.climatizado));
  if (climatizados.length === 0) {
    pendencia('PREMISSA', 'Nenhum ambiente climatizado — nomeie os ambientes (sala e quarto entram pelo nome) ou marque-os em Premissas de climatização › Ambientes.');
    etapa('CARGA', ROTULOS.CARGA, 'NAO_RODOU', 0, 'nenhum ambiente climatizado');
    for (const id of ['EQUIPAMENTOS', 'LINHA', 'VRF', 'DUTOS', 'CIRCUITOS', 'QUANTITATIVO', 'ORCAMENTO'] as const) etapa(id, ROTULOS[id], 'NAO_RODOU', 0, 'sem carga térmica');
    return { comandos, criados, etapas, pendencias, resultado: m };
  }
  for (const n of cargas) if (n.deltaTExternoK == null && n.ambientes.some((a) => a.climatizado)) pendencia('PREMISSA', `${nomeDoNivel(n.levelId)}: sem TBS externa — escolha a cidade ou declare o clima em Premissas de climatização.`);
  for (const a of climatizados) for (const p of a.pendencias) pendencia('PREMISSA', `${a.nome}: ${p}`);
  for (const t of conferirDaClimatizacao(hip)) pendencia('CONFERIR', t);
  const totalBtuH = climatizados.reduce((s, a) => s + a.totalBtuH, 0);
  etapa('CARGA', ROTULOS.CARGA, 'CALCULOU', 0, `${climatizados.length} ambiente(s) climatizado(s), ${um(totalBtuH, 0)} BTU/h no total`);
  const niveisComCarga = cargas.filter((n) => n.ambientes.some((a) => a.climatizado));

  // ── Equipamentos: seleção e posição (E4) ──────────────────────────────────
  const temEvaporadora = cx.modelos.some((x) => (TIPOS_DE_EVAPORADORA as readonly string[]).includes(x.tipoHidraulico));
  if (!temEvaporadora) {
    pendencia('PREMISSA', 'Catálogo da organização sem modelo de evaporadora com capacidade — salve um tipo (ou semeie o catálogo) para o gerador escolher o equipamento.');
    etapa('EQUIPAMENTOS', ROTULOS.EQUIPAMENTOS, 'NAO_RODOU', 0, 'catálogo sem modelo');
  } else {
    let n = 0;
    const notas: string[] = [];
    for (const nivel of niveisComCarga) {
      const selecao = selecaoDoNivel(m, nivel, hip.selecao, cx.modelos);
      for (const a of selecao.ambientes) {
        if (!a.sugestao.escolhido && a.sugestao.motivo && a.evaporadoras.length === 0) pendencia('SEM_SOLUCAO', `${nomeDoNivel(nivel.levelId)} › ${a.nome}: ${a.sugestao.motivo}`);
        for (const p of a.pendencias) pendencia('NAO_DECIDIDO', `${nomeDoNivel(nivel.levelId)} › ${a.nome}: ${p}`);
      }
      const plano = planejarEquipamentosSplit(m, selecao, nivel, hip.selecao);
      n += aplicar(plano.comandos);
      for (const s of plano.semLugar) pendencia('SEM_SOLUCAO', `${nomeDoNivel(nivel.levelId)} › ${s.nome}: ${s.motivo}`);
      if (plano.aCriar.length) notas.push(`${nomeDoNivel(nivel.levelId)}: ${plano.aCriar.length} split(s)`);
      if (plano.jaAtendidos.length) notas.push(`${plano.jaAtendidos.length} ambiente(s) já atendido(s) por equipamento confirmado`);
    }
    etapa('EQUIPAMENTOS', ROTULOS.EQUIPAMENTOS, 'LANCOU', n, notas.join(' · ') || null);
  }

  // ── Linha frigorígena e dreno (E5); VRF (E6) ───────────────────────────────
  const niveis = m.levels.map((l) => l.id);
  {
    let n = 0;
    const notas: string[] = [];
    for (const levelId of niveis) {
      const plano = planejarLinhasFrigorigenas(m, levelId, hip.linha);
      n += aplicar(plano.comandos);
      for (const s of plano.semLugar) pendencia('SEM_SOLUCAO', `${nomeDoNivel(levelId)} › ${s.nome}: ${s.motivo}`);
      if (plano.aCriar.length) notas.push(`${nomeDoNivel(levelId)}: ${plano.aCriar.length} sistema(s)`);
    }
    etapa('LINHA', ROTULOS.LINHA, 'LANCOU', n, notas.join(' · ') || null);
  }
  const niveisComVrf = niveis.filter((id) => (m.terminais ?? []).some((t) => t.levelId === id && t.tipoHidraulico === 'CONDENSADORA_VRF'));
  if (niveisComVrf.length === 0) etapa('VRF', ROTULOS.VRF, 'NAO_EXIGIDA', 0, 'sem condensadora VRF no desenho');
  else {
    let n = 0;
    for (const levelId of niveisComVrf) {
      const plano = planejarVrf(m, levelId, hip.linha);
      n += aplicar(plano.comandos);
      for (const s of plano.semLugar) pendencia('SEM_SOLUCAO', `${nomeDoNivel(levelId)} › ${s.nome}: ${s.motivo}`);
    }
    etapa('VRF', ROTULOS.VRF, 'LANCOU', n);
  }

  // ── Rede de dutos (E7) ─────────────────────────────────────────────────────
  const temTerminalDeAr = (m.terminais ?? []).some((t) => (TIPOS_DE_TERMINAL_DE_AR as readonly string[]).includes(t.tipoHidraulico ?? ''));
  if (!temTerminalDeAr) etapa('DUTOS', ROTULOS.DUTOS, 'NAO_EXIGIDA', 0, 'sem terminal de ar no desenho');
  else {
    let n = 0;
    for (const nivel of cargas) {
      const vazoes = vazoesDosTerminais(m, nivel, hip.ar);
      if (vazoes.size === 0) continue;
      const plano = planejarRedeDeAr(m, nivel.levelId, vazoes, hip.ar);
      n += aplicar(plano.comandos);
      for (const s of plano.semLugar) pendencia('SEM_SOLUCAO', `${nomeDoNivel(nivel.levelId)} › ${s.nome}: ${s.motivo}`);
    }
    etapa('DUTOS', ROTULOS.DUTOS, 'LANCOU', n);
  }

  // ── Circuito dos pontos de ar-condicionado (Elétrica) ──────────────────────
  {
    let n = 0;
    const novos = new Set(criados);
    for (const levelId of niveis) {
      const soltos = (m.terminais ?? []).filter((t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId == null);
      const doGerador = soltos.filter((t) => novos.has(t.id));
      if (doGerador.length === 0) continue;
      const nome = nomeDoNivel(levelId);
      const outros = soltos.length - doGerador.length;
      // O quadro de destino: o único do pavimento; sem nenhum no pavimento, o único do desenho
      // (quadro de outro pavimento vale — 17/09/2026). Mais de um possível: o gerador não escolhe.
      const doPavimento = (m.quadros ?? []).filter((q) => q.levelId === levelId);
      const quadros = doPavimento.length > 0 ? doPavimento : (m.quadros ?? []);
      if (outros > 0) {
        pendencia('NAO_DECIDIDO', `${nome}: ${doGerador.length} ponto(s) de ar-condicionado sem circuito — há outros ${outros} ponto(s) solto(s) no pavimento, e o planejador de circuitos liga todos juntos; ligue pela Elétrica › Circuitos.`);
      } else if (quadros.length !== 1) {
        pendencia('NAO_DECIDIDO', `${nome}: ${doGerador.length} ponto(s) de ar-condicionado sem circuito — ${quadros.length === 0 ? 'não há quadro no desenho' : `há ${quadros.length} quadros possíveis; escolha o de destino`} na Elétrica › Circuitos.`);
      } else if (!cx.circuitos) {
        pendencia('NAO_DECIDIDO', `${nome}: ${doGerador.length} ponto(s) de ar-condicionado sem circuito — premissas da Elétrica indisponíveis aqui.`);
      } else {
        const plano = planejarCircuitos(m, levelId, quadros[0].id, cx.circuitos.hip, cx.circuitos.eletricas);
        if (plano.motivo) pendencia('NAO_DECIDIDO', `${nome}: circuito do ar-condicionado — ${plano.motivo}`);
        n += aplicar(plano.comandos);
        for (const f of plano.foraDoPlano) pendencia('SEM_SOLUCAO', `${nome}: ponto ${f.terminalId} fora do plano de circuitos — ${f.motivo}`);
      }
    }
    etapa('CIRCUITOS', ROTULOS.CIRCUITOS, 'LANCOU', n);
  }

  // ── Conflitos que a proposta criou (E10.2) ────────────────────────────────
  const novos = new Set(criados);
  for (const c of conflitosDoModelo(m, { pecas: volumesDasPecasDeClimatizacao(m) })) {
    if (!novos.has(c.trechoId) && !novos.has(c.outroId)) continue;
    pendencia('CONFLITO', `${c.classe.replace(/_/g, ' ').toLowerCase()}: trecho ${c.trechoId} × ${c.outroId} (${um(c.comprimentoDentroMm, 0)} mm dentro).`);
  }

  // ── Quantitativo e orçamento (E9) — só cálculo ────────────────────────────
  const quant = computeQuantities(m, POLITICA_PADRAO);
  const materiais = materiaisDeClimatizacao(m, hip, quant);
  etapa('QUANTITATIVO', ROTULOS.QUANTITATIVO, 'CALCULOU', 0, `${materiais.totais.length} item(ns) na lista, ${materiais.porSistema.length} sistema(s)`);
  for (const a of materiais.avisos) pendencia('NAO_DECIDIDO', `Lista de materiais: ${a}`);
  const medidas = resumoDasMedidas(quant).filter((x) => MEDIDAS_DA_CLIMATIZACAO.includes(x.medidaId) && x.quantidade > 0);
  etapa(
    'ORCAMENTO',
    ROTULOS.ORCAMENTO,
    'CALCULOU',
    0,
    medidas.length ? `${medidas.map((x) => `${x.rotulo}: ${um(x.quantidade, 2)}`).join(' · ')} — lance pelo painel Orçamento (a composição de cada item é escolha do orçamentista)` : 'nenhuma medida de climatização',
  );

  // ── A conferência do resultado (a da emissão, menos o responsável) ────────
  const r = verificacoesClimatizacao(m, cargaTermicaDoEstudo(m, hip, cx.carga ?? {}), hip, RESPONSAVEL_VAZIO, nomeDoNivel);
  for (const v of r.verificacoes) {
    if (v.atende || v.grupo === 'RESPONSAVEL') continue;
    pendencia('VERIFICACAO', `${ROTULO_DO_GRUPO_DE_CLIMATIZACAO[v.grupo]} — ${v.item}: exigido ${v.exigido}; obtido ${v.obtido}.`);
  }

  return { comandos, criados, etapas, pendencias, resultado: m };
}

/** Reaplicar o lote no original cria os MESMOS ids? (ids determinísticos — a trava antes de gravar). */
export function conferirPlanoDaClimatizacao(original: BlueprintModel, plano: PlanoDaClimatizacao): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: 'o gerador não tem nada a lançar' };
  try {
    const r = applyBatch(original, plano.comandos);
    const iguais = r.diff.created.length === plano.criados.length && r.diff.created.every((id, i) => id === plano.criados[i]);
    return iguais ? { ok: true } : { ok: false, motivo: 'o desenho mudou desde a prévia — gere de novo' };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

const ROTULO_DA_SITUACAO: Record<SituacaoDaEtapa, string> = { LANCOU: 'Lançou', NADA_A_FAZER: 'Nada a fazer', NAO_EXIGIDA: 'Não se aplica', NAO_RODOU: 'Não rodou', CALCULOU: 'Calculou' };

/** O RELATÓRIO do gerador — etapas e pendências — no formato dos memoriais (PDF/DOCX). */
export function relatorioDaClimatizacao(plano: PlanoDaClimatizacao, ctx: { nomeDoEstudo: string; geradoEm: string }): BlocoDoMemorial[] {
  const B: BlocoDoMemorial[] = [
    { tipo: 'titulo', texto: 'Gerador de climatização — relatório' },
    { tipo: 'paragrafo', texto: `Estudo: ${ctx.nomeDoEstudo}. Gerado em ${ctx.geradoEm.slice(0, 10).split('-').reverse().join('/')}. ${plano.comandos.length} comando(s) num lote só (um Ctrl+Z desfaz tudo).` },
    { tipo: 'secao', texto: 'Etapas' },
    { tipo: 'tabela', cabecalho: ['Etapa', 'Situação', 'Comandos', 'Observação'], linhas: plano.etapas.map((e) => [e.rotulo, ROTULO_DA_SITUACAO[e.situacao], String(e.comandos), e.nota ?? '—']) },
  ];
  for (const g of ['VERIFICACAO', 'PREMISSA', 'SEM_SOLUCAO', 'CONFLITO', 'NAO_DECIDIDO', 'CONFERIR'] as GrupoDaPendencia[]) {
    const lista = plano.pendencias.filter((p) => p.grupo === g);
    if (!lista.length) continue;
    B.push({ tipo: 'secao', texto: `${ROTULO_DA_PENDENCIA[g]} (${lista.length})` }, ...lista.map((p): BlocoDoMemorial => ({ tipo: 'paragrafo', texto: `• ${p.texto}` })));
  }
  if (!plano.pendencias.some((p) => p.grupo === 'VERIFICACAO')) B.push({ tipo: 'paragrafo', texto: 'Nenhuma verificação em falta no resultado.' });
  return B;
}
