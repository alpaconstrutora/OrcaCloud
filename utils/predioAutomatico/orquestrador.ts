/**
 * PRÉDIO AUTOMÁTICO — o orquestrador (PA2 do plano docs/planos/2026-11-12-predio-automatico.md, 13/11/2026). Do BLOCO da
 * massa ao prédio: o pavimento tipo (corredor, núcleo e unidades) com os demais andares como cópias vivas, a planta
 * interna de cada unidade, e o tipo marcado para levar as instalações aos andares (`copiaInstalacoes`, PA1) — numa
 * PRÉVIA e num lote só (um Ctrl+Z). Encadeia o que antes eram dois botões soltos do painel do bloco ("Montar neste
 * estudo" e "Gerar a planta das unidades"), com os mesmos motores. Molde: `utils/casaAutomatica/orquestrador.ts`.
 *
 * PA3 (14/11/2026): o térreo (salas do condomínio, acesso e o núcleo desde ele), a cobertura e os reservatórios — ver
 * `terreoECobertura.ts`.
 */
import { applyBatch, snapshotHash } from '../blueprintKernel';
import { localDoElemento } from '../blueprintLocalDaPendencia';
import type { LocalDaPendencia } from '../blueprintGeradorPpci';
import type { BlueprintModel, Command, ObjectId } from '../blueprintKernel';
import type { PendenciaDoPpci, SituacaoDaEtapa } from '../blueprintGeradorPpci';
import { direcaoDaRua, ordinalDoTipo, pavimentoTipoMontado, pisosAcimaDoSolo } from '../blueprintPavimentoTipoDaMassa';
import { dividirPavimentoDoBloco, montarPavimentoTipoDoBloco } from '../blueprintPavimentoOrtogonal';
import { plantasDasUnidades } from '../blueprintPlantaDaUnidade';
import type { Produto, ProdutoDoBloco } from '../blueprintProduto';
import {
  HIPOTESES_DO_PREDIO_PADRAO,
  ORDEM_DAS_ETAPAS_DO_PREDIO,
  ROTULO_DA_ETAPA_DO_PREDIO,
  type EtapaDoPredio,
  type EtapaDoPredioId,
  type HipotesesDoPredio,
  type OpcoesDoPlanoDoPredio,
  type PlanoDoPredio,
} from './hipoteses';
import { lancarReservatorios, montarCobertura, montarTerreo, SALA_BOMBAS, SALA_MEDICAO, SALA_MEDICAO_E_BOMBAS, type BaseDoPredio, type ContextoDoPredio } from './terreoECobertura';
import { lancarEstrutura, lancarFundacao, pendenciaDaFundacao } from './estrutura';
import { conferirEletricaDoPredio, lancarEletrica } from './eletrica';
import { lancarClimatizacao, lancarEletrodutosEPrumada, type ClimatizacaoDoPedido } from './climatizacaoERede';
import { conferirPressaoDaAgua, lancarAguaFria, lancarLoucasEPontos } from './agua';
import { HIPOTESES_PRESSAO_PADRAO } from '../blueprintPressaoDaRede';

/** O que o prédio lê além do desenho: o bloco, o produto do estudo e a distribuição dele NESTE bloco, e o norte. */
export interface EntradaDoPredio {
  blocoId: ObjectId;
  produto: Produto;
  /** `distribuirProduto(...).blocos` deste bloco; `null` = produto sem tipologia (não há unidade para dividir). */
  doBloco: ProdutoDoBloco | null;
  rotacaoNorteDeg: number | null;
  /** PA5b: o catálogo de evaporadoras e as premissas da carga térmica (do editor, como na casa); ausente = sem climatização. */
  climatizacao?: ClimatizacaoDoPedido | null;
}

/** Por que não dá para gerar o prédio deste bloco; `null` = dá. Os mesmos motivos do painel do bloco. */
export function motivoParaNaoGerarPredio(model: BlueprintModel, entrada: EntradaDoPredio): string | null {
  const b = (model.blocos ?? []).find((x) => x.id === entrada.blocoId);
  if (!b) return 'O bloco não está mais no desenho.';
  if (b.uso === 'GARAGEM' || b.uso === 'TECNICO' || b.uso === 'LAZER') return 'Bloco sem unidade (garagem, técnico ou lazer): não tem pavimento tipo.';
  const ja = pavimentoTipoMontado(model, b);
  if (ja) return `Pavimento tipo já montado: "${ja.name}". Para refazer, remova esse pavimento (as cópias se desvinculam) e gere de novo.`;
  if (!entrada.doBloco || entrada.doBloco.unidades === 0) return 'Defina o produto (Terreno › Massa › Produto): sem tipologias não há unidade para dividir o pavimento.';
  return null;
}

export function planejarPredio(original: BlueprintModel, entrada: EntradaDoPredio, hipParcial: Partial<HipotesesDoPredio> = {}, opcoes: OpcoesDoPlanoDoPredio = {}): PlanoDoPredio {
  const motivo = motivoParaNaoGerarPredio(original, entrada);
  if (motivo) throw new Error(motivo);
  const hip: HipotesesDoPredio = { ...HIPOTESES_DO_PREDIO_PADRAO, ...hipParcial };
  const b = (original.blocos ?? []).find((x) => x.id === entrada.blocoId)!;
  const pb = entrada.doBloco!;

  const etapas: EtapaDoPredio[] = [];
  const pendencias: PendenciaDoPpci[] = [];
  const decisoes: string[] = [];
  const comandos: Command[] = [];
  const criados: ObjectId[] = [];
  let m = original;
  const etapa = (id: EtapaDoPredioId, situacao: SituacaoDaEtapa, n: number, nota: string | null = null) => {
    etapas.push({ id, rotulo: ROTULO_DA_ETAPA_DO_PREDIO[id], situacao: situacao === 'LANCOU' && n === 0 ? 'NADA_A_FAZER' : situacao, comandos: n, nota });
    opcoes.aoConcluirEtapa?.(etapas[etapas.length - 1], etapas.length, ORDEM_DAS_ETAPAS_DO_PREDIO.length);
  };
  const aplicar = (lote: Command[]): number => {
    if (!lote.length) return 0;
    const r = applyBatch(m, lote);
    m = r.model;
    comandos.push(...lote);
    criados.push(...r.diff.created);
    return lote.length;
  };

  // ── Pavimento tipo: a divisão pelo produto distribuído no andar tipo do bloco, e a montagem com as cópias vivas.
  const ord = ordinalDoTipo(original, b);
  const piso = pb.pisos.find((p) => p.ordinal === ord) ?? pb.pisos.find((p) => p.unidades === pb.unidadesPorPavimento);
  if (!piso) throw new Error('O bloco não tem pavimento acima do solo.');
  const r = dividirPavimentoDoBloco({ bloco: b, produto: entrada.produto, porTipologia: piso.porTipologia, nucleoM2: pb.nucleo.m2, elevadores: pb.nucleo.elevadores, ordinalDoTipo: ord, rotacaoNorteDeg: entrada.rotacaoNorteDeg, direcaoDaRua: direcaoDaRua(original) });
  if (!r.ok) throw new Error(r.motivo);
  const dv = r.divisao;
  const mont = montarPavimentoTipoDoBloco(original, b, dv);
  decisoes.push(...dv.decisoes);
  etapa('PAVIMENTO_TIPO', 'LANCOU', aplicar(mont.comandos), `${dv.unidades.length} unidade(s) por andar · ${mont.copias} cópia(s) do tipo${dv.elevadores ? ` · núcleo com ${dv.elevadores} elevador(es)` : ''}`);
  // Com o térreo do prédio, o aviso de que o 1º pavimento "ficou para o projetista" deixa de valer.
  const avisosDoTipo = [...dv.avisos, ...mont.avisos.filter((a) => !(hip.terreo && /ficou para o projetista: portaria/.test(a)))];
  const ctx: ContextoDoPredio = {
    get m() {
      return m;
    },
    aplicar,
  };
  const pisos = pisosAcimaDoSolo(original, b);
  const copias = m.levels.filter((l) => l.tipoDeId === mont.tipoLevelId).sort((x, y) => x.elevationMm - y.elevationMm);
  const base: BaseDoPredio = { bloco: b, divisao: dv, tipoLevelId: mont.tipoLevelId, ultimoLevelId: copias.length ? copias[copias.length - 1].id : mont.tipoLevelId, pisos, rua: direcaoDaRua(original) };
  const avisosDoPredio: string[] = [];

  // ── Térreo: só quando o tipo é o 2º pavimento (há um piso abaixo dele). Roda antes das plantas — leva o esqueleto.
  let terreo: ReturnType<typeof montarTerreo> | null = null;
  if (!hip.terreo) etapa('TERREO', 'NAO_EXIGIDA', 0, 'Desligado nas hipóteses: o térreo fica para o projetista.');
  else if (dv.ordinalDoTipo < 2 || pisos.length < 2) etapa('TERREO', 'NAO_EXIGIDA', 0, 'O bloco tem um pavimento só: o tipo é o térreo.');
  else {
    terreo = montarTerreo(ctx, base, hip);
    avisosDoPredio.push(...terreo.avisos);
    etapa('TERREO', 'LANCOU', terreo.comandos, `${terreo.salas.map((x) => x.nome).join(' · ')}${terreo.acesso ? ' · porta de entrada para a rua' : ''}`);
  }

  // ── Estrutura (PA4): no tipo, ANTES das plantas (os pilares no esqueleto, não nas divisórias dos apartamentos); a
  // mesma malha no térreo.
  let estrutura: ReturnType<typeof lancarEstrutura> | null = null;
  if (!hip.estrutura) etapa('ESTRUTURA', 'NAO_EXIGIDA', 0, 'Desligada nas hipóteses.');
  else {
    estrutura = lancarEstrutura(ctx, mont.tipoLevelId, terreo?.levelId ?? null);
    for (const a of estrutura.avisos) pendencias.push({ grupo: 'VERIFICACAO', texto: `Estrutura: ${a}` });
    for (const f of estrutura.foraDoPlano) pendencias.push({ grupo: /a menos de uma seção de outro pilar/.test(f) ? 'CONFERIR' : 'VERIFICACAO', texto: `Estrutura: ${f}` });
    etapa(
      'ESTRUTURA',
      'LANCOU',
      estrutura.comandos,
      `${estrutura.pilares} pilar(es), ${estrutura.vigas} viga(s) e ${estrutura.lajes} laje(s) por andar${estrutura.noTerreo ? ', a mesma malha no térreo' : ''}${estrutura.eixos ? ` · ${estrutura.eixos} eixo(s)` : ''}`,
    );
  }

  // ── Fundações (PA4): sob os pilares do pavimento que assenta no chão — o térreo, ou o tipo quando ele É o térreo. Logo
  // depois da estrutura e ANTES das plantas: não dependem delas, e cada comando custa pelo tamanho do modelo (no RL, os
  // 303 comandos levavam 22 s depois das plantas dos 8 andares).
  let fundacao: ReturnType<typeof lancarFundacao> | null = null;
  const noChao = terreo?.levelId ?? (dv.ordinalDoTipo < 2 ? mont.tipoLevelId : null);
  if (!estrutura) etapa('FUNDACOES', 'NAO_EXIGIDA', 0, 'Sem a estrutura, a fundação fica para o projetista.');
  else if (!noChao) etapa('FUNDACOES', 'NAO_EXIGIDA', 0, 'Sem o térreo, o pavimento que assenta no chão fica para o projetista — e a fundação com ele.');
  else {
    fundacao = lancarFundacao(ctx, noChao);
    if (fundacao.comandos) pendencias.push({ grupo: 'VERIFICACAO', texto: pendenciaDaFundacao(pisos.length) });
    else if (fundacao.motivo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Fundações: ${fundacao.motivo}` });
    for (const a of fundacao.avisos) pendencias.push({ grupo: 'VERIFICACAO', texto: `Fundações: ${a}` });
    etapa('FUNDACOES', fundacao.comandos ? 'LANCOU' : 'NAO_RODOU', fundacao.comandos, fundacao.comandos ? `${fundacao.blocos} bloco(s), ${fundacao.estacas} estaca(s), ${fundacao.baldrames} baldrame(s) — pré-dimensionamento` : fundacao.motivo);
  }

  // ── Plantas internas: o gerador da E6.2 em cada unidade do tipo (as cópias recebem pela cópia viva).
  let plantas: PlanoDoPredio['resumo']['plantas'] = null;
  const semFachada: { numero: string; comodos: string[] }[] = [];
  let avisosDasPlantas: string[] = [];
  if (hip.plantas) {
    const pl = plantasDasUnidades(m, (m.blocos ?? []).find((x) => x.id === b.id) ?? b, entrada.produto);
    const n = aplicar(pl.comandos);
    const comodos = pl.unidades.reduce((s, u) => s + u.ambientes.length, 0);
    for (const u of pl.unidades) if (u.semFachada.length) semFachada.push({ numero: u.numero, comodos: u.semFachada });
    avisosDasPlantas = pl.avisos;
    plantas = { unidades: pl.unidades.filter((u) => u.ambientes.length > 0).length, comodos, grupos: pl.grupos.length, semFachada: semFachada.length };
    for (const g of pl.grupos) decisoes.push(`Unidades iguais: ${g.origem} → ${g.iguais.map((i) => `${i.numero} ${i.repeticao}`).join(', ')} (edite a planta da origem e a mudança vai para as iguais).`);
    etapa('PLANTAS', 'LANCOU', n, n ? `${plantas.unidades} unidade(s), ${comodos} cômodo(s), ${pl.geracoes} tentativa(s) do gerador` : pl.avisos.join(' ') || null);
  } else etapa('PLANTAS', 'NAO_EXIGIDA', 0, 'Desligada nas hipóteses: as unidades saem só com o perímetro.');

  // ── Cobertura: sobre o último andar. Sem o térreo, o elevador do tipo passa a parar no último andar com unidades (a
  // casa de máquinas assenta na laje da cobertura); com ele, o núcleo do térreo já para lá.
  let cobertura: ReturnType<typeof montarCobertura> | null = null;
  if (!hip.cobertura) etapa('COBERTURA', 'NAO_EXIGIDA', 0, 'Desligada nas hipóteses.');
  else {
    const lajeDaEstrutura = !!estrutura && estrutura.lajes > 0;
    cobertura = montarCobertura(ctx, base, hip, !lajeDaEstrutura);
    if (!terreo) cobertura.comandos += aplicar((m.nucleos ?? []).filter((x) => x.levelId === mont.tipoLevelId && x.tipo === 'ELEVADOR').map((x): Command => ({ type: 'SetNucleoProps', nucleoId: x.id, ateLevelId: base.ultimoLevelId })));
    avisosDoPredio.push(...cobertura.avisos);
    const laje = lajeDaEstrutura ? 'a laje é a do teto do último andar (estrutura)' : `laje de ${hip.espessuraDaLajeMm} mm`;
    etapa('COBERTURA', 'LANCOU', cobertura.comandos, `Piso a ${(cobertura.cotaMm / 1000).toLocaleString('pt-BR')} m, ${laje}, platibanda de ${hip.alturaDaPlatibandaMm} mm`);
  }

  // ── Reservatórios: depois das plantas (a população vem dos dormitórios de todos os andares).
  let reservacao: PlanoDoPredio['resumo']['reservacao'] = null;
  if (!terreo && !cobertura) etapa('RESERVATORIOS', 'NAO_EXIGIDA', 0, 'Sem térreo nem cobertura, os reservatórios ficam para o projetista.');
  else {
    const bombas = terreo?.salas.find((x) => x.nome === SALA_BOMBAS || x.nome === SALA_MEDICAO_E_BOMBAS)?.ponto ?? null;
    const r = lancarReservatorios(ctx, base, hip, terreo ? { levelId: terreo.levelId, bombas } : null, cobertura ? { levelId: cobertura.levelId } : null);
    avisosDoPredio.push(...r.avisos);
    if (r.totalL > 0) {
      reservacao = { pessoas: r.pessoas, totalL: r.totalL, inferiorL: r.inferiorL, superiorL: r.superiorL };
      decisoes.push(`Reservação: ${r.texto} Volumes declarados (moldados in loco); a ligação da água é da fase da água fria.`);
    }
    etapa('RESERVATORIOS', r.totalL > 0 ? 'LANCOU' : 'NAO_RODOU', r.comandos, r.totalL > 0 ? r.texto : 'Sem população contada.');
  }

  // ── Elétrica coletiva (PA5): ANTES da marca do tipo — sem ela cada comando no tipo custa ~13 ms, com ela ~21 ms (re-deriva
  // as cópias); a marca, depois, copia tudo numa sincronização só.
  let eletrica: ReturnType<typeof lancarEletrica> | null = null;
  if (!hip.eletrica) etapa('ELETRICA', 'NAO_EXIGIDA', 0, 'Desligada nas hipóteses.');
  else {
    const medicao = terreo?.salas.find((x) => x.nome === SALA_MEDICAO || x.nome === SALA_MEDICAO_E_BOMBAS)?.ponto ?? null;
    const bombasNoTerreo = terreo?.salas.find((x) => x.nome === SALA_BOMBAS || x.nome === SALA_MEDICAO_E_BOMBAS)?.ponto ?? null;
    eletrica = lancarEletrica(ctx, base, terreo ? { levelId: terreo.levelId, medicao, bombas: bombasNoTerreo } : null, cobertura ? { levelId: cobertura.levelId } : null);
    for (const a of eletrica.avisos) pendencias.push({ grupo: 'CONFERIR', texto: `Elétrica: ${a}` });
    etapa(
      'ELETRICA',
      'LANCOU',
      eletrica.comandos,
      `${eletrica.quadros} QD(s) e ${eletrica.circuitos} circuito(s) por andar · ${eletrica.servico.circuitos} circuito(s) de serviço · ${eletrica.medidores} medidor(es) · ${eletrica.drs} DR(s)`,
    );
  }

  // ── Climatização (PA5b): no tipo, cada ponto de ar no QD da unidade — também antes da marca.
  let splits: number | null = null;
  if (!eletrica || !hip.climatizacao) etapa('CLIMATIZACAO', 'NAO_EXIGIDA', 0, !eletrica ? 'Sem a elétrica, a climatização fica para o projetista.' : 'Desligada nas hipóteses.');
  else {
    const c = lancarClimatizacao(ctx, base, entrada.climatizacao ?? null);
    pendencias.push(...c.pendencias);
    if (c.motivo && !c.comandos) pendencias.push({ grupo: 'PREMISSA', texto: `Climatização: ${c.motivo}` });
    splits = c.equipamentos;
    etapa('CLIMATIZACAO', c.comandos ? 'LANCOU' : 'NAO_RODOU', c.comandos, c.comandos ? `${c.equipamentos} split(s) no tipo — cada andar repete` : c.motivo);
  }
  // ── Eletrodutos e a prumada no shaft (PA5b).
  let rede: ReturnType<typeof lancarEletrodutosEPrumada> | null = null;
  if (!eletrica) etapa('ELETRODUTOS', 'NAO_EXIGIDA', 0, 'Sem a elétrica.');
  else {
    rede = lancarEletrodutosEPrumada(ctx, base, terreo?.levelId ?? null);
    for (const a of new Set(rede.avisos)) pendencias.push({ grupo: 'CONFERIR', texto: `Eletrodutos: ${a}` });
    etapa('ELETRODUTOS', 'LANCOU', rede.comandos, `${rede.eletrodutos} trecho(s) de eletroduto${rede.bitolasAumentadas ? ` (${rede.bitolasAumentadas} com o diâmetro aumentado pela ocupação)` : ''} · prumada em ${rede.prumadas} pavimento(s)`);
  }

  // ── Água fria (PA6): as louças e os pontos no tipo, e a rede da rua à torneira — também antes da marca.
  let agua: ReturnType<typeof lancarAguaFria> | null = null;
  let pontosDaAgua = 0;
  if (!hip.agua) {
    etapa('LOUCAS', 'NAO_EXIGIDA', 0, 'Desligada nas hipóteses.');
    etapa('AGUA_FRIA', 'NAO_EXIGIDA', 0, 'Desligada nas hipóteses.');
  } else if (!hip.plantas) {
    etapa('LOUCAS', 'NAO_EXIGIDA', 0, 'Sem as plantas das unidades não há cômodo para as louças.');
    etapa('AGUA_FRIA', 'NAO_EXIGIDA', 0, 'Sem as plantas das unidades não há ponto de água.');
  } else {
    const lou = lancarLoucasEPontos(ctx, base);
    pendencias.push(...lou.pendencias);
    pontosDaAgua = lou.pontos;
    etapa('LOUCAS', 'LANCOU', lou.comandos, `${lou.pecas} peça(s) de mobiliário e ${lou.pontos} ponto(s) de água e esgoto no tipo — cada andar repete`);
    agua = lancarAguaFria(ctx, base, terreo ? { levelId: terreo.levelId } : null, cobertura ? { levelId: cobertura.levelId } : null, 1 + mont.copias);
    pendencias.push(...agua.pendencias);
    etapa(
      'AGUA_FRIA',
      agua.hidrometros ? 'LANCOU' : 'NAO_RODOU',
      agua.comandos,
      agua.hidrometros
        ? `${agua.hidrometros} hidrômetro(s) por andar · coluna DN ${agua.colunaDnMm}${agua.recalque ? ` · recalque DN ${agua.recalque.dnMm}, ${agua.recalque.motorCv.toLocaleString('pt-BR')} cv` : ''}${agua.rtiL ? ` · reserva de incêndio de ${(agua.rtiL / 1000).toLocaleString('pt-BR')} m³` : ''}`
        : agua.pendencias.find((x) => x.grupo === 'SEM_SOLUCAO')?.texto ?? null,
    );
  }

  // ── O tipo leva as instalações aos andares (PA1): as fases seguintes desenham no tipo e os andares acompanham.
  etapa('INSTALACOES_NO_TIPO', 'LANCOU', aplicar([{ type: 'SetLevelProps', levelId: mont.tipoLevelId, copiaInstalacoes: true }]), 'Pontos, trechos, quadros e circuitos desenhados no tipo vão às cópias.');

  // ── A pressão da água fria (PA6): só agora a rede do superior chega a todos os andares.
  let pressao: ReturnType<typeof conferirPressaoDaAgua> | null = null;
  if (!agua?.hidrometros) etapa('PRESSAO_DA_AGUA', 'NAO_EXIGIDA', 0, 'Sem a rede de água fria.');
  else {
    pressao = conferirPressaoDaAgua(ctx, base, agua.ramais, { ...HIPOTESES_PRESSAO_PADRAO, qMaxDoHidrometroM3h: agua.qMaxDoHidrometroM3h });
    pendencias.push(...pressao.pendencias);
    const kpa = (v: number | null) => (v == null ? '—' : `${Math.round(v)} kPa`);
    etapa(
      'PRESSAO_DA_AGUA',
      pressao.comandos ? 'LANCOU' : 'CALCULOU',
      pressao.comandos,
      `${pressao.pontos} ponto(s): dinâmica mínima ${kpa(pressao.dinamicaMinKpa)}, estática máxima ${kpa(pressao.estaticaMaxKpa)}${pressao.pressurizador ? ' · pressurizador no superior' : ''}${pressao.vrp ? ' · VRP no ramal de cada unidade' : ''}`,
    );
  }

  // ── Conferência: o que a divisão, a montagem e as plantas não resolveram vira pendência.
  for (const a of avisosDoTipo) pendencias.push({ grupo: 'CONFERIR', texto: `Pavimento tipo: ${a}` });
  for (const a of avisosDasPlantas) pendencias.push({ grupo: 'CONFERIR', texto: `Plantas: ${a}` });
  for (const a of avisosDoPredio) pendencias.push({ grupo: /população/.test(a) ? 'PREMISSA' : 'CONFERIR', texto: a });
  // PA5: a elétrica conferida DEPOIS da cópia viva — a entrada do QGBT soma os QDs de todos os andares.
  let resumoDaEletrica: PlanoDoPredio['resumo']['eletrica'] = null;
  if (eletrica?.qgbtId) {
    const { entrada, nbr } = conferirEletricaDoPredio(m, eletrica.qgbtId);
    for (const a of entrada?.achados ?? []) pendencias.push({ grupo: a.nivel === 'FALTA' ? 'VERIFICACAO' : 'CONFERIR', texto: `Entrada de energia (QGBT): ${a.mensagem}` });
    // A demanda acima da maior categoria do padrão de BAIXA tensão não é defeito do desenho: o prédio pede entrada em média
    // tensão — a decisão é do projeto com a concessionária.
    if (entrada && !entrada.categoria) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Entrada de energia: ${entrada.demandaKva.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kVA de demanda passam do padrão de baixa tensão — um prédio deste porte pede entrada em MÉDIA tensão (cabine/subestação): projeto com a concessionária.` });
    for (const r of nbr.regras) {
      for (const nivel of ['FALTA', 'AVISO'] as const) {
        const lista = r.achados.filter((a) => a.nivel === nivel);
        if (!lista.length) continue;
        const locais = lista.flatMap((a) => (a.ids.length ? [localDoElemento(m, a.ids)].filter((l): l is LocalDaPendencia => !!l) : []));
        pendencias.push({ grupo: nivel === 'FALTA' ? 'VERIFICACAO' : 'CONFERIR', texto: `Elétrica (${r.codigo} — ${r.titulo}): ${lista.length} ${nivel === 'FALTA' ? 'falta(s)' : 'aviso(s)'} — ${lista[0].mensagem}`, ...(locais.length ? { locais } : {}) });
      }
    }
    resumoDaEletrica = {
      pontos: eletrica.pontos.tomadas + eletrica.pontos.luzes + eletrica.pontos.interruptores,
      quadros: eletrica.quadros,
      circuitos: eletrica.circuitos,
      servico: eletrica.servico.circuitos,
      medidores: eletrica.medidores,
      drs: eletrica.drs,
      demandaKva: entrada ? Math.round(entrada.demandaKva * 10) / 10 : null,
      categoria: entrada?.categoria?.id ?? null,
      unidadesAtendidas: entrada?.unidadesAtendidas.length ?? 0,
      unidadesMedidas: entrada?.unidadesMedidas.length ?? 0,
      faltas: nbr.faltas,
      avisos: nbr.avisos,
      splits,
      eletrodutos: rede?.eletrodutos ?? 0,
      prumadas: rede?.prumadas ?? 0,
    };
  }
  const resumoDaAgua: PlanoDoPredio['resumo']['agua'] = agua
    ? {
        pontos: pontosDaAgua,
        hidrometros: agua.hidrometros,
        unidadesMedidas: agua.hidrometros * (1 + mont.copias),
        colunaDnMm: agua.colunaDnMm,
        recalque: agua.recalque ? { dnMm: agua.recalque.dnMm, motorCv: agua.recalque.motorCv, alturaManometricaM: Math.round(agua.recalque.alturaManometricaM * 10) / 10 } : null,
        alimentadorDnMm: agua.alimentador?.dnMm ?? null,
        rtiL: agua.rtiL,
        estaticaMaxKpa: pressao?.estaticaMaxKpa != null ? Math.round(pressao.estaticaMaxKpa) : null,
        dinamicaMinKpa: pressao?.dinamicaMinKpa != null ? Math.round(pressao.dinamicaMinKpa) : null,
        pressurizador: pressao?.pressurizador ?? false,
        vrp: pressao?.vrp ?? false,
        insuficientes: pressao?.insuficientes ?? 0,
        excessivas: pressao?.excessivas ?? 0,
        naoAvaliados: pressao?.naoAvaliados ?? 0,
      }
    : null;
  for (const s of semFachada) {
    const u = (m.unidades ?? []).find((x) => x.numero === s.numero);
    const etiquetas = u ? m.labels.filter((l) => l.levelId === mont.tipoLevelId && u.etiquetaUids.includes(l.uid)) : [];
    pendencias.push({
      grupo: 'SEM_SOLUCAO',
      texto: `Unidade ${s.numero}: ${s.comodos.join(', ')} sem fachada (sem onde pôr janela) — ajuste a planta.`,
      ...(etiquetas.length ? { locais: [{ levelId: mont.tipoLevelId, ids: etiquetas.map((l) => l.id), ponto: etiquetas[0].at }] } : {}),
    });
  }
  etapa('CONFERENCIA', 'CALCULOU', 0, pendencias.length ? `${pendencias.length} pendência(s)` : 'Nada pendente.');

  const pavimentos = 1 + mont.copias;
  const pavimentosLancados = pavimentos + (terreo ? 1 : 0) + (cobertura ? 1 : 0);
  return {
    blocoId: b.id,
    comandos,
    criados,
    etapas,
    pendencias,
    resultado: m,
    tipoLevelId: mont.tipoLevelId,
    hashDoOriginal: snapshotHash(original),
    hashDoResultado: snapshotHash(m),
    decisoes,
    resumo: {
      esquema: dv.esquema,
      pavimentos,
      pavimentosLancados,
      copias: mont.copias,
      unidadesPorAndar: dv.unidades.length,
      unidades: dv.unidades.length * pavimentos,
      elevadores: dv.elevadores,
      eficienciaDesenhadaPct: mont.eficienciaDesenhadaPct,
      plantas,
      terreo: terreo ? { salas: terreo.salas.map((x) => x.nome), acesso: terreo.acesso } : null,
      cobertura: cobertura ? { cotaM: cobertura.cotaMm / 1000 } : null,
      eletrica: resumoDaEletrica,
      estrutura: estrutura ? { pilares: estrutura.pilares, vigas: estrutura.vigas, lajes: estrutura.lajes, noTerreo: estrutura.noTerreo, eixos: estrutura.eixos, blocos: fundacao?.blocos ?? 0, estacas: fundacao?.estacas ?? 0 } : null,
      reservacao,
      agua: resumoDaAgua,
    },
  };
}
