/**
 * O DIAGNÓSTICO E A CONFERÊNCIA DA REDE DE INCÊNDIO (30/09/2026, E2.4 do
 * roadmap de incêndio).
 *
 * Duas camadas, como no AltoQi:
 *  - o diagnóstico do LANÇAMENTO, barato e sempre ligado (entra em
 *    `marcasDeVerificacao`): peça fora da rede, rede sem bomba (falta de fluxo
 *    de entrada), peça maior que o tubo (subdimensionada). A ponta aberta
 *    (tubo desconectado / falta de saída) já vinha das conexões derivadas.
 *  - o do CÁLCULO, que precisa do solver (só com a tarefa aberta): velocidade
 *    acima da máxima, pressão estática acima da máxima, hidrante que não atende.
 *
 * E a CONFERÊNCIA, em três estados + "não avaliada", com a norma de cada item
 * (molde: `blueprintHidroExecutivo.verificacoesHidro`).
 */
import { itensDaIT18 } from './blueprintIncendioChuveirosMG';
import type { BlueprintModel, ObjectId } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { redeDeIncendio, type CalculoDeIncendio, type CenarioCalculado, type HipotesesHidraulicasDeIncendio, criterioDaReserva } from './blueprintCalculoIncendio';
import { ROTULO_DO_RISCO } from './blueprintSprinklersIncendio';
import { metodoDasTabelas, vgasDaRede } from './blueprintRedeDeSprinklers';
import type { MarcaDeVerificacao } from './blueprintVerificacaoRede';
import type { AnaliseDaBomba, PressurizacaoDaRede } from './blueprintBombeamentoIncendio';

/** As peças que precisam estar NA rede (as sobre o trecho vivem no meio do tubo). */
const PECAS_DE_NO = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'HIDRANTE_RECALQUE', 'SPRINKLER', 'VGA', 'BOMBA_INCENDIO', 'BOMBA_JOCKEY', 'RESERVATORIO']);
const CONSUMIDORAS = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'SPRINKLER']);

/** A6: a menos disto, duas peças do mesmo tipo são "a mesma posição". */
export const MESMA_POSICAO_MM = 10;

/** A6: uma marca por peça que repete outra do mesmo tipo no mesmo ponto (a segunda em diante). */
export function marcasDeDuplicadas(model: BlueprintModel): MarcaDeVerificacao[] {
  const fogo = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico);
  const marcas: MarcaDeVerificacao[] = [];
  fogo.forEach((t, i) => {
    const antes = fogo.slice(0, i).find((u) => u.levelId === t.levelId && u.tipoHidraulico === t.tipoHidraulico && Math.hypot(u.at.x - t.at.x, u.at.y - t.at.y) < MESMA_POSICAO_MM);
    if (!antes) return;
    const nome = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!]?.rotulo ?? t.tipoHidraulico!;
    marcas.push({ chave: `incdup|${t.id}`, tipo: 'INCENDIO_DUPLICADA', levelId: t.levelId, at: { ...t.at }, texto: `${nome.toLowerCase()} duplicado — outro no mesmo ponto`, severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
  });
  return marcas;
}

/** O diagnóstico do lançamento — sem cálculo. */
export function marcasDoLancamentoDeIncendio(model: BlueprintModel): MarcaDeVerificacao[] {
  // A6 (plano pós-roadmap): PEÇA DUPLICADA — o mesmo tipo, no mesmo pavimento, a menos de 1 cm de
  // outra. É o rastro de uma proposta que empilha (a luminária da E7.3 empilhava): com a marca, o
  // defeito aparece no desenho em vez de sumir na contagem. Vale para TODA peça de incêndio.
  const duplicadas = marcasDeDuplicadas(model);
  const pecas = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && PECAS_DE_NO.has(t.tipoHidraulico));
  if (pecas.length === 0) return duplicadas;
  const rede = redeDeIncendio(model);
  const marcas: MarcaDeVerificacao[] = [...duplicadas];
  for (const t of pecas) {
    if (!rede.noDoTerminal.has(t.id)) {
      marcas.push({ chave: `incfora|${t.id}`, tipo: 'INCENDIO_FORA_DA_REDE', levelId: t.levelId, at: { ...t.at }, texto: 'fora da rede — nenhum tubo chega aqui', severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
    }
  }
  // Componentes da rede: os que têm consumidor e não chegam à bomba.
  const adj = new Map<string, string[]>();
  for (const x of rede.tubos) {
    adj.set(x.de, [...(adj.get(x.de) ?? []), x.para]);
    adj.set(x.para, [...(adj.get(x.para) ?? []), x.de]);
  }
  const daFonte = new Set<string>();
  if (rede.noDaFonte) {
    const fila = [rede.noDaFonte];
    daFonte.add(rede.noDaFonte);
    while (fila.length) for (const v of adj.get(fila.pop()!) ?? []) if (!daFonte.has(v)) (daFonte.add(v), fila.push(v));
  }
  const jaMarcado = new Set<string>();
  for (const t of pecas.filter((x) => CONSUMIDORAS.has(x.tipoHidraulico!))) {
    const no = rede.noDoTerminal.get(t.id);
    if (!no || daFonte.has(no) || jaMarcado.has(no)) continue;
    // Uma marca por componente: anda o componente e marca todos os nós dele como vistos.
    const fila = [no];
    jaMarcado.add(no);
    while (fila.length) for (const v of adj.get(fila.pop()!) ?? []) if (!jaMarcado.has(v)) (jaMarcado.add(v), fila.push(v));
    marcas.push({ chave: `incsemfonte|${t.id}`, tipo: 'INCENDIO_SEM_BOMBA', levelId: t.levelId, at: { ...t.at }, texto: 'sem entrada de água — a rede não chega à bomba nem à caixa de incêndio', severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
  }
  // Peça maior que o tubo: algum tubo que chega nela abaixo do DN mínimo da ficha.
  for (const t of pecas) {
    const no = rede.noDoTerminal.get(t.id);
    const min = FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].dnMinimoMm.INCENDIO;
    if (!no || min == null) continue;
    const finos = rede.tubos.filter((x) => (x.de === no || x.para === no) && x.trecho.bitolaMm < min);
    if (finos.length) {
      marcas.push({ chave: `incdn|${t.id}`, tipo: 'INCENDIO_DN_PECA', levelId: t.levelId, at: { ...t.at }, texto: `tubo DN ${Math.min(...finos.map((x) => x.trecho.bitolaMm))} < DN ${min} da peça`, severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
    }
  }
  return marcas;
}

/** O diagnóstico que só o cálculo dá. */
export function marcasDoCalculoDeIncendio(model: BlueprintModel, c: CalculoDeIncendio, hip: HipotesesHidraulicasDeIncendio): MarcaDeVerificacao[] {
  // E5.1: os cenários de CADA sistema (hidrantes e sprinklers), não só o que governa a bomba.
  const cenarios = cenariosDoCalculo(c);
  if (cenarios.length === 0) return [];
  const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const terminalPorId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const marcas: MarcaDeVerificacao[] = [];
  for (const x of cenarios.flatMap((cen) => cen.trechos).filter((t) => t.velocidadeMs > hip.velocidadeMaxMs + 1e-9)) {
    if (marcas.some((m) => m.chave === `incvel|${x.trechoId}`)) continue;
    const t = trechoPorId.get(x.trechoId)!;
    marcas.push({ chave: `incvel|${t.id}`, tipo: 'INCENDIO_VELOCIDADE', levelId: t.levelId, at: { x: Math.round((t.a.x + t.b.x) / 2), y: Math.round((t.a.y + t.b.y) / 2) }, texto: `${um(x.velocidadeMs, 2)} > ${um(hip.velocidadeMaxMs)} m/s`, severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
  }
  for (const [id, p] of c.estaticaKpa) {
    if (p <= hip.pressaoMaximaKpa) continue;
    const t = terminalPorId.get(id)!;
    marcas.push({ chave: `incpmax|${id}`, tipo: 'INCENDIO_PRESSAO_ALTA', levelId: t.levelId, at: { ...t.at }, texto: `estática ${um(p, 0)} > ${um(hip.pressaoMaximaKpa, 0)} kPa`, severidade: 'ERRO', alvoId: id, disciplina: 'INCENDIO' });
  }
  for (const x of cenarios.flatMap((cen) => cen.terminais).filter((t) => !t.atende)) {
    const t = terminalPorId.get(x.terminalId)!;
    marcas.push({ chave: `incnao|${x.terminalId}`, tipo: 'INCENDIO_NAO_ATENDE', levelId: t.levelId, at: { ...t.at }, texto: x.exigidoLmin != null ? `${um(x.vazaoLmin, 0)} < ${um(x.exigidoLmin, 0)} L/min` : `${um(x.pressaoNoBicoKpa, 0)} < ${um(x.exigidoKpa ?? 0, 0)} kPa`, severidade: 'ERRO', alvoId: x.terminalId, disciplina: 'INCENDIO' });
  }
  return marcas;
}

// ─── A conferência ───────────────────────────────────────────────────────────

export type EstadoDaConferencia = 'ATENDE' | 'FALTA' | 'NAO_AVALIADO';

/** Os cenários de projeto de cada sistema calculado (E5.1). */
export function cenariosDoCalculo(c: CalculoDeIncendio): CenarioCalculado[] {
  const lista = [c.porSistema.hidrantes?.cenario, c.porSistema.sprinklers?.cenario, c.porSistema.combinado?.cenario].filter((x): x is CenarioCalculado => !!x);
  return lista.length ? lista : c.cenario ? [c.cenario] : [];
}

export interface ItemDaConferencia {
  grupo: 'NBR 13714' | 'NBR 10897' | 'CBMMG' | 'Lançamento';
  item: string;
  exigido: string;
  obtido: string;
  estado: EstadoDaConferencia;
  /** As peças a selecionar quando falta. */
  alvos: ObjectId[];
}

/** A conferência da rede de hidrantes — o que o cálculo, as marcas e as premissas dizem juntos. */
export function conferenciaDeIncendio(model: BlueprintModel, c: CalculoDeIncendio, hip: HipotesesHidraulicasDeIncendio, bomba: AnaliseDaBomba | null = null, pressurizacao: PressurizacaoDaRede | null = null): ItemDaConferencia[] {
  const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const lanc = marcasDoLancamentoDeIncendio(model);
  const itens: ItemDaConferencia[] = [];
  const temRede = (model.trechos ?? []).some((t) => t.disciplina === 'INCENDIO');
  const semCalculo = !c.cenario;

  const semFonte = !!c.motivo?.startsWith('sem bomba');
  itens.push({ grupo: 'Lançamento', item: 'Fonte ligada à rede (bomba ou caixa de incêndio)', exigido: 'a origem do cálculo', obtido: semFonte ? 'não há' : c.porGravidade ? 'caixa de incêndio (gravidade)' : 'bomba', estado: semFonte ? 'FALTA' : 'ATENDE', alvos: [] });
  const fora = lanc.filter((m) => m.tipo === 'INCENDIO_FORA_DA_REDE' || m.tipo === 'INCENDIO_SEM_BOMBA');
  itens.push({ grupo: 'Lançamento', item: 'Toda peça recebe água da bomba', exigido: 'nenhuma peça isolada', obtido: fora.length ? `${fora.length} fora` : 'todas', estado: !temRede ? 'NAO_AVALIADO' : fora.length ? 'FALTA' : 'ATENDE', alvos: fora.map((m) => m.alvoId) });
  const finos = lanc.filter((m) => m.tipo === 'INCENDIO_DN_PECA');
  itens.push({ grupo: 'Lançamento', item: 'Tubo à altura do DN de cada peça', exigido: 'DN do tubo ≥ DN da peça', obtido: finos.length ? `${finos.length} peça(s) maior(es) que o tubo` : 'todas', estado: !temRede ? 'NAO_AVALIADO' : finos.length ? 'FALTA' : 'ATENDE', alvos: finos.map((m) => m.alvoId) });

  // Os itens de hidrante leem o cenário DOS HIDRANTES (E5.1: a bomba pode ser governada pelos sprinklers).
  const h = c.porSistema.hidrantes;
  const semHidrantes = !h?.cenario;
  const naoAtendem = h?.cenario?.terminais.filter((t) => !t.atende) ?? [];
  itens.push({
    grupo: 'NBR 13714',
    item: `Vazão no esguicho dos ${h?.abertos.length || hip.hidrantesSimultaneos} hidrante(s) mais desfavoráveis`,
    exigido: `≥ ${um(hip.vazaoMinimaHidranteLmin, 0)} L/min (mangotinho ${um(hip.vazaoMinimaMangotinhoLmin, 0)})`,
    obtido: semHidrantes ? (h?.motivo ?? c.motivo ?? 'nenhum hidrante na rede') : `mínima ${um(Math.min(...h!.cenario!.terminais.map((t) => t.vazaoLmin)), 0)} L/min com a bomba a ${um(h!.cargaNecessariaM ?? 0)} mca`,
    estado: semHidrantes ? 'NAO_AVALIADO' : naoAtendem.length ? 'FALTA' : 'ATENDE',
    alvos: naoAtendem.map((t) => t.terminalId),
  });
  // E5.1: os sprinklers — o critério (risco → densidade × área) e o cenário deles.
  const s = c.porSistema.sprinklers;
  const cr = s?.criterio ?? c.criterio;
  if (s) {
    itens.push({
      grupo: 'NBR 10897',
      item: 'Risco dos sprinklers definido',
      exigido: 'classe de risco da ocupação — CONFERIR NA NORMA',
      obtido: cr?.risco ? `${ROTULO_DO_RISCO[cr.risco.valor]} (${cr.risco.origem === 'DECLARADA' ? 'declarado' : 'sugerido pela divisão'})` : 'sem risco',
      estado: cr?.risco ? 'ATENDE' : 'FALTA',
      alvos: [],
    });
    const naoSpk = s.cenario?.terminais.filter((t) => !t.atende) ?? [];
    const minQ = s.cenario?.terminais.length ? Math.min(...s.cenario.terminais.map((t) => t.vazaoLmin)) : 0;
    const minP = s.cenario?.terminais.length ? Math.min(...s.cenario.terminais.map((t) => t.pressaoNoBicoKpa)) : 0;
    itens.push({
      grupo: 'NBR 10897',
      item: `Vazão e pressão nos ${s.abertos.length || cr?.sprinklersNaArea || 0} sprinkler(s) mais desfavoráveis`,
      exigido: cr?.vazaoPorSprinklerLmin != null ? `≥ ${um(cr.vazaoPorSprinklerLmin, 1)} L/min (${um(cr.densidade!.valorLminM2, 1)} L/min/m² × ${um(cr.areaPorSprinkler!.valorM2, 1)} m²) e ≥ ${um(hip.pressaoMinimaSprinklerKpa, 0)} kPa cada` : 'o critério do risco',
      obtido: !s.cenario ? (s.motivo ?? '—') : `mínimas ${um(minQ, 1)} L/min e ${um(minP, 0)} kPa com a bomba a ${um(s.cargaNecessariaM ?? 0)} mca`,
      estado: !s.cenario ? (cr?.risco ? 'FALTA' : 'NAO_AVALIADO') : naoSpk.length ? 'FALTA' : 'ATENDE',
      alvos: naoSpk.map((t) => t.terminalId),
    });
    if (s.cenario && cr?.vazaoDaAreaLmin != null) {
      const total = s.cenario.vazaoNaFonteLmin;
      itens.push({
        grupo: 'NBR 10897',
        item: 'Vazão da área de operação',
        exigido: `≥ ${um(cr.vazaoDaAreaLmin, 0)} L/min (${um(cr.densidade!.valorLminM2, 1)} L/min/m² × ${um(cr.areaDeOperacao!.valorM2, 0)} m²)`,
        obtido: `${um(total, 0)} L/min em ${s.abertos.length} sprinkler(s)${s.abertos.length < (cr.sprinklersNaArea ?? 0) ? ` — a rede tem menos que os ${cr.sprinklersNaArea} da área` : ''}`,
        estado: total + 1e-6 >= cr.vazaoDaAreaLmin ? 'ATENDE' : 'FALTA',
        alvos: [],
      });
    }
  }
  // E5.4: a demanda somada, o método das tabelas e a VGA.
  const comb = c.porSistema.combinado;
  if (comb) {
    const nao = comb.cenario?.terminais.filter((t) => !t.atende) ?? [];
    itens.push({
      grupo: 'NBR 10897',
      item: 'Demanda combinada (área de operação + hidrantes)',
      exigido: 'os sprinklers da área e os hidrantes simultâneos abertos juntos — CONFERIR NA IT',
      obtido: comb.cenario ? `${um(comb.cenario.vazaoNaFonteLmin, 0)} L/min a ${um(comb.cargaNecessariaM ?? 0)} mca na fonte` : (comb.motivo ?? '—'),
      estado: !comb.cenario ? 'FALTA' : nao.length ? 'FALTA' : 'ATENDE',
      alvos: nao.map((t) => t.terminalId),
    });
  }
  if (s) {
    const risco = cr?.risco?.valor ?? null;
    const mt = metodoDasTabelas(model, risco);
    const abaixo = mt.trechos.filter((t) => t.atende === false);
    itens.push({
      grupo: 'NBR 10897',
      item: 'DN pelo método das tabelas',
      exigido: 'DN pelo número de sprinklers a jusante — CONFERIR NA NORMA',
      obtido: !mt.aplicavel ? (mt.motivo ?? '—') : abaixo.length ? `${abaixo.length} trecho(s) abaixo da tabela` : `${mt.trechos.length} trecho(s) conferidos`,
      estado: !mt.aplicavel ? 'NAO_AVALIADO' : abaixo.length ? 'FALTA' : 'ATENDE',
      alvos: abaixo.map((t) => t.trechoId),
    });
    const v = vgasDaRede(model);
    itens.push({
      grupo: 'NBR 10897',
      item: 'Sprinklers a jusante de VGA',
      exigido: 'todo sprinkler protegido por uma válvula de governo e alarme',
      obtido: `${v.vgas.length} VGA(s) · ${v.semVga.length} sprinkler(s) sem VGA`,
      estado: v.semVga.length ? 'FALTA' : 'ATENDE',
      alvos: v.semVga,
    });
  }
  // E5.2: cada Área de Operação desenhada tem de ter, no mínimo, a área do critério dela.
  c.areas.forEach((x, i) => {
    const exigida = x.criterio.areaDeOperacao?.valorM2 ?? null;
    const a = (model.areasDeOperacao ?? []).find((y) => y.id === x.areaId);
    itens.push({
      grupo: 'NBR 10897',
      item: `Área de operação ${a?.nome ?? `AO-${i + 1}`}: tamanho`,
      exigido: exigida != null ? `≥ ${um(exigida, 0)} m² (${x.criterio.risco ? ROTULO_DO_RISCO[x.criterio.risco.valor].toLowerCase() : '—'})` : 'o risco da área',
      obtido: `${um(x.areaDesenhadaM2, 1)} m² desenhados, ${x.resultado.abertos.length} sprinkler(s) dentro`,
      estado: exigida == null ? 'NAO_AVALIADO' : x.areaDesenhadaM2 + 1e-6 >= exigida ? 'ATENDE' : 'FALTA',
      alvos: [x.areaId],
    });
  });
  const rapidos = cenariosDoCalculo(c).flatMap((cen) => cen.trechos).filter((t) => t.velocidadeMs > hip.velocidadeMaxMs + 1e-9);
  itens.push({
    grupo: 'NBR 13714',
    item: 'Velocidade da água nos trechos',
    exigido: `≤ ${um(hip.velocidadeMaxMs)} m/s`,
    obtido: semCalculo ? '—' : `máxima ${um(Math.max(0, ...cenariosDoCalculo(c).flatMap((cen) => cen.trechos).map((t) => t.velocidadeMs)), 2)} m/s`,
    estado: semCalculo ? 'NAO_AVALIADO' : rapidos.length ? 'FALTA' : 'ATENDE',
    alvos: [...new Set(rapidos.map((t) => t.trechoId))],
  });
  const altas = [...c.estaticaKpa].filter(([, p]) => p > hip.pressaoMaximaKpa);
  itens.push({
    grupo: 'NBR 13714',
    item: 'Pressão estática nos hidrantes e sprinklers',
    exigido: `≤ ${um(hip.pressaoMaximaKpa, 0)} kPa`,
    obtido: semCalculo ? '—' : `máxima ${um(Math.max(0, ...c.estaticaKpa.values()), 0)} kPa`,
    estado: semCalculo ? 'NAO_AVALIADO' : altas.length ? 'FALTA' : 'ATENDE',
    alvos: altas.map(([id]) => id),
  });
  itens.push({
    grupo: 'CBMMG',
    item: 'Simultaneidade considerada',
    exigido: `${hip.hidrantesSimultaneos} hidrante(s) — CONFERIR NA IT`,
    obtido: semHidrantes ? '—' : `${h!.abertos.length} aberto(s) no cálculo${h!.abertos.length < hip.hidrantesSimultaneos ? ' (a rede tem menos hidrantes)' : ''}`,
    estado: semHidrantes ? 'NAO_AVALIADO' : 'ATENDE',
    alvos: [],
  });
  // E3.1: o registro de recalque — por onde o caminhão do Corpo de Bombeiros alimenta a rede.
  const recalques = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico === 'HIDRANTE_RECALQUE');
  const rede = recalques.length ? redeDeIncendio(model) : null;
  const ligados = recalques.filter((t) => rede!.noDoTerminal.has(t.id));
  itens.push({
    grupo: 'CBMMG',
    item: 'Registro de recalque ligado à rede',
    exigido: 'no passeio, ligado à rede — CONFERIR NA IT',
    obtido: recalques.length === 0 ? 'não há' : ligados.length ? 'ligado' : 'lançado, mas fora da rede',
    estado: !temRede ? 'NAO_AVALIADO' : ligados.length ? 'ATENDE' : 'FALTA',
    alvos: recalques.filter((t) => !ligados.includes(t)).map((t) => t.id),
  });
  // E4.2: a bomba contra o ponto de projeto, o shutoff e o NPSH (só quando a fonte é bomba).
  if (bomba) {
    const est = (x: boolean | null): EstadoDaConferencia => (x == null ? 'NAO_AVALIADO' : x ? 'ATENDE' : 'FALTA');
    itens.push({
      grupo: 'NBR 13714',
      item: 'Bomba atende o ponto de projeto',
      exigido: bomba.projeto ? `${um(bomba.projeto.vazaoLmin, 0)} L/min a ${um(bomba.projeto.alturaM)} m` : '—',
      obtido: !bomba.temCurva ? 'bomba sem curva declarada' : bomba.alturaNaVazaoDeProjetoM == null ? 'fora da faixa da curva' : `${um(bomba.alturaNaVazaoDeProjetoM)} m na vazão de projeto`,
      estado: est(bomba.atendeProjeto),
      alvos: [bomba.terminalId],
    });
    if (bomba.shutoff) itens.push({ grupo: 'NBR 13714', item: 'Shutoff da bomba dentro da pressão máxima', exigido: `≤ ${um(hip.pressaoMaximaKpa, 0)} kPa no hidrante mais baixo`, obtido: `${um(bomba.shutoff.estaticaMaximaKpa, 0)} kPa`, estado: est(bomba.shutoff.atende), alvos: [bomba.terminalId] });
    if (bomba.npsh) itens.push({ grupo: 'NBR 13714', item: 'NPSH disponível ≥ requerido', exigido: bomba.npsh.requeridoM == null ? 'NPSH requerido do catálogo' : `≥ ${um(bomba.npsh.requeridoM, 2)} m`, obtido: `${um(bomba.npsh.disponivelM, 2)} m disponíveis`, estado: est(bomba.npsh.atende), alvos: [bomba.terminalId] });
  }
  // E4.3: a jockey e os pressostatos (só quando a fonte é bomba).
  if (pressurizacao) {
    const est = (x: boolean | null): EstadoDaConferencia => (x == null ? 'NAO_AVALIADO' : x ? 'ATENDE' : 'FALTA');
    itens.push({ grupo: 'CBMMG', item: 'Bomba jockey ligada à principal', exigido: 'pressurização da rede — CONFERIR NA IT', obtido: pressurizacao.jockeyId ? 'ligada' : 'não há jockey ligada à principal', estado: pressurizacao.jockeyId ? 'ATENDE' : 'FALTA', alvos: bomba ? [bomba.terminalId] : [] });
    itens.push({ grupo: 'CBMMG', item: 'Pressostatos (um por bomba)', exigido: pressurizacao.jockeyId ? '≥ 2' : '≥ 1', obtido: `${pressurizacao.pressostatos} na rede`, estado: pressurizacao.pressostatos >= (pressurizacao.jockeyId ? 2 : 1) ? 'ATENDE' : 'FALTA', alvos: [] });
    if (pressurizacao.jockeyId) itens.push({ grupo: 'CBMMG', item: 'Jockey alcança a pressão de parada', exigido: pressurizacao.ajustes ? `shutoff da jockey ≥ ${um(pressurizacao.ajustes.paradaJockeyKpa, 0)} kPa` : 'curva da principal', obtido: pressurizacao.jockeyAlcancaParada == null ? 'sem curva da jockey ou da principal' : pressurizacao.jockeyAlcancaParada ? 'alcança' : 'não alcança', estado: est(pressurizacao.jockeyAlcancaParada), alvos: [pressurizacao.jockeyId] });
    if (pressurizacao.topoPressurizado) itens.push({ grupo: 'CBMMG', item: 'Rede pressurizada no ponto mais alto', exigido: 'pressão > 0 com a rede na partida da principal', obtido: `${um(pressurizacao.topoPressurizado.pressaoKpa, 0)} kPa`, estado: est(pressurizacao.topoPressurizado.atende), alvos: [] });
  }
  // E3.2: a RTI — vazão do cálculo × autonomia, contra a reserva desenhada.
  const litros = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} L`;
  itens.push({
    grupo: 'CBMMG',
    item: 'Reserva técnica de incêndio',
    exigido: c.rti.exigidaL == null ? `vazão × ${c.rti.autonomiaMin} min — CONFERIR NA IT` : `≥ ${litros(c.rti.exigidaL)} (${criterioDaReserva(c)}${c.rti.porTabela ? '' : ' — CONFERIR NA IT'})`,
    obtido: c.rti.disponivelL > 0 ? `${litros(c.rti.disponivelL)} desenhados` : 'nenhuma reserva desenhada',
    estado: c.rti.exigidaL == null ? 'NAO_AVALIADO' : c.rti.disponivelL + 1e-6 >= c.rti.exigidaL ? 'ATENDE' : 'FALTA',
    alvos: c.rti.caixas,
  });
  // A saída de consumo da caixa compartilhada acima da RTI: o desenho não guarda a altura da tomada.
  const compartilhadas = (model.terminais ?? []).filter((t) => t.tipoHidraulico === 'RESERVATORIO' && t.disciplina === 'AGUA_FRIA' && (t.volumeRtiL ?? 0) > 0);
  for (const t of compartilhadas) {
    const area = t.larguraMm && t.profundidadeMm ? (t.larguraMm * t.profundidadeMm) / 1e6 : null;
    const alturaCm = area ? (t.volumeRtiL! / 1000 / area) * 100 : null;
    itens.push({
      grupo: 'CBMMG',
      item: 'Saída de consumo acima da reserva de incêndio',
      exigido: alturaCm != null ? `tomada de consumo ≥ ${um(alturaCm, 0)} cm acima do fundo` : 'tomada de consumo acima da RTI',
      obtido: 'o desenho não guarda a altura da tomada — confira na caixa',
      estado: 'NAO_AVALIADO',
      alvos: [t.id],
    });
  }
  // D1.2: o que a IT 18 do CBMMG acrescenta à NBR 10897 (hidrantes antes da VGA; recalque dos chuveiros).
  itens.push(...itensDaIT18(model));
  return itens;
}
