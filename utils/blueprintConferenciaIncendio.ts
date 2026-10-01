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
import type { BlueprintModel, ObjectId } from './blueprintKernel';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { redeDeIncendio, type CalculoDeIncendio, type HipotesesHidraulicasDeIncendio } from './blueprintCalculoIncendio';
import type { MarcaDeVerificacao } from './blueprintVerificacaoRede';

/** As peças que precisam estar NA rede (as sobre o trecho vivem no meio do tubo). */
const PECAS_DE_NO = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'HIDRANTE_RECALQUE', 'SPRINKLER', 'VGA', 'BOMBA_INCENDIO', 'BOMBA_JOCKEY']);
const CONSUMIDORAS = new Set(['HIDRANTE_SIMPLES', 'HIDRANTE_DUPLO', 'MANGOTINHO', 'SPRINKLER']);

/** O diagnóstico do lançamento — sem cálculo. */
export function marcasDoLancamentoDeIncendio(model: BlueprintModel): MarcaDeVerificacao[] {
  const pecas = (model.terminais ?? []).filter((t) => t.disciplina === 'INCENDIO' && t.tipoHidraulico && PECAS_DE_NO.has(t.tipoHidraulico));
  if (pecas.length === 0) return [];
  const rede = redeDeIncendio(model);
  const marcas: MarcaDeVerificacao[] = [];
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
    marcas.push({ chave: `incsemfonte|${t.id}`, tipo: 'INCENDIO_SEM_BOMBA', levelId: t.levelId, at: { ...t.at }, texto: 'sem entrada de água — a rede não chega à bomba', severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
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
  if (!c.cenario) return [];
  const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const terminalPorId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const marcas: MarcaDeVerificacao[] = [];
  for (const x of c.cenario.trechos.filter((t) => t.velocidadeMs > hip.velocidadeMaxMs + 1e-9)) {
    const t = trechoPorId.get(x.trechoId)!;
    marcas.push({ chave: `incvel|${t.id}`, tipo: 'INCENDIO_VELOCIDADE', levelId: t.levelId, at: { x: Math.round((t.a.x + t.b.x) / 2), y: Math.round((t.a.y + t.b.y) / 2) }, texto: `${um(x.velocidadeMs, 2)} > ${um(hip.velocidadeMaxMs)} m/s`, severidade: 'ERRO', alvoId: t.id, disciplina: 'INCENDIO' });
  }
  for (const [id, p] of c.estaticaKpa) {
    if (p <= hip.pressaoMaximaKpa) continue;
    const t = terminalPorId.get(id)!;
    marcas.push({ chave: `incpmax|${id}`, tipo: 'INCENDIO_PRESSAO_ALTA', levelId: t.levelId, at: { ...t.at }, texto: `estática ${um(p, 0)} > ${um(hip.pressaoMaximaKpa, 0)} kPa`, severidade: 'ERRO', alvoId: id, disciplina: 'INCENDIO' });
  }
  for (const x of c.cenario.terminais.filter((t) => !t.atende)) {
    const t = terminalPorId.get(x.terminalId)!;
    marcas.push({ chave: `incnao|${x.terminalId}`, tipo: 'INCENDIO_NAO_ATENDE', levelId: t.levelId, at: { ...t.at }, texto: x.exigidoLmin != null ? `${um(x.vazaoLmin, 0)} < ${um(x.exigidoLmin, 0)} L/min` : `${um(x.pressaoNoBicoKpa, 0)} < ${um(x.exigidoKpa ?? 0, 0)} kPa`, severidade: 'ERRO', alvoId: x.terminalId, disciplina: 'INCENDIO' });
  }
  return marcas;
}

// ─── A conferência ───────────────────────────────────────────────────────────

export type EstadoDaConferencia = 'ATENDE' | 'FALTA' | 'NAO_AVALIADO';

export interface ItemDaConferencia {
  grupo: 'NBR 13714' | 'CBMMG' | 'Lançamento';
  item: string;
  exigido: string;
  obtido: string;
  estado: EstadoDaConferencia;
  /** As peças a selecionar quando falta. */
  alvos: ObjectId[];
}

/** A conferência da rede de hidrantes — o que o cálculo, as marcas e as premissas dizem juntos. */
export function conferenciaDeIncendio(model: BlueprintModel, c: CalculoDeIncendio, hip: HipotesesHidraulicasDeIncendio): ItemDaConferencia[] {
  const um = (v: number, casas = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
  const lanc = marcasDoLancamentoDeIncendio(model);
  const itens: ItemDaConferencia[] = [];
  const temRede = (model.trechos ?? []).some((t) => t.disciplina === 'INCENDIO');
  const semCalculo = !c.cenario;

  itens.push({ grupo: 'Lançamento', item: 'Bomba de incêndio ligada à rede', exigido: 'a origem do cálculo', obtido: c.motivo?.startsWith('sem bomba') ? 'não há' : 'ligada', estado: c.motivo?.startsWith('sem bomba') ? 'FALTA' : 'ATENDE', alvos: [] });
  const fora = lanc.filter((m) => m.tipo === 'INCENDIO_FORA_DA_REDE' || m.tipo === 'INCENDIO_SEM_BOMBA');
  itens.push({ grupo: 'Lançamento', item: 'Toda peça recebe água da bomba', exigido: 'nenhuma peça isolada', obtido: fora.length ? `${fora.length} fora` : 'todas', estado: !temRede ? 'NAO_AVALIADO' : fora.length ? 'FALTA' : 'ATENDE', alvos: fora.map((m) => m.alvoId) });
  const finos = lanc.filter((m) => m.tipo === 'INCENDIO_DN_PECA');
  itens.push({ grupo: 'Lançamento', item: 'Tubo à altura do DN de cada peça', exigido: 'DN do tubo ≥ DN da peça', obtido: finos.length ? `${finos.length} peça(s) maior(es) que o tubo` : 'todas', estado: !temRede ? 'NAO_AVALIADO' : finos.length ? 'FALTA' : 'ATENDE', alvos: finos.map((m) => m.alvoId) });

  const naoAtendem = c.cenario?.terminais.filter((t) => !t.atende) ?? [];
  itens.push({
    grupo: 'NBR 13714',
    item: `Vazão no esguicho dos ${c.abertos.length || hip.hidrantesSimultaneos} hidrante(s) mais desfavoráveis`,
    exigido: `≥ ${um(hip.vazaoMinimaHidranteLmin, 0)} L/min (mangotinho ${um(hip.vazaoMinimaMangotinhoLmin, 0)})`,
    obtido: semCalculo ? (c.motivo ?? '—') : `mínima ${um(Math.min(...c.cenario!.terminais.map((t) => t.vazaoLmin)), 0)} L/min com a bomba a ${um(c.cargaNecessariaM ?? 0)} mca`,
    estado: semCalculo ? 'NAO_AVALIADO' : naoAtendem.length ? 'FALTA' : 'ATENDE',
    alvos: naoAtendem.map((t) => t.terminalId),
  });
  const rapidos = c.cenario?.trechos.filter((t) => t.velocidadeMs > hip.velocidadeMaxMs + 1e-9) ?? [];
  itens.push({
    grupo: 'NBR 13714',
    item: 'Velocidade da água nos trechos',
    exigido: `≤ ${um(hip.velocidadeMaxMs)} m/s`,
    obtido: semCalculo ? '—' : `máxima ${um(Math.max(0, ...c.cenario!.trechos.map((t) => t.velocidadeMs)), 2)} m/s`,
    estado: semCalculo ? 'NAO_AVALIADO' : rapidos.length ? 'FALTA' : 'ATENDE',
    alvos: rapidos.map((t) => t.trechoId),
  });
  const altas = [...c.estaticaKpa].filter(([, p]) => p > hip.pressaoMaximaKpa);
  itens.push({
    grupo: 'NBR 13714',
    item: 'Pressão estática nos hidrantes',
    exigido: `≤ ${um(hip.pressaoMaximaKpa, 0)} kPa`,
    obtido: semCalculo ? '—' : `máxima ${um(Math.max(0, ...c.estaticaKpa.values()), 0)} kPa`,
    estado: semCalculo ? 'NAO_AVALIADO' : altas.length ? 'FALTA' : 'ATENDE',
    alvos: altas.map(([id]) => id),
  });
  itens.push({
    grupo: 'CBMMG',
    item: 'Simultaneidade considerada',
    exigido: `${hip.hidrantesSimultaneos} hidrante(s) — CONFERIR NA IT`,
    obtido: semCalculo ? '—' : `${c.abertos.length} aberto(s) no cálculo${c.abertos.length < hip.hidrantesSimultaneos ? ' (a rede tem menos hidrantes)' : ''}`,
    estado: semCalculo ? 'NAO_AVALIADO' : 'ATENDE',
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
  itens.push({ grupo: 'CBMMG', item: 'Reserva técnica de incêndio', exigido: 'volume pela IT', obtido: 'a RTI entra na E3.2 do roadmap', estado: 'NAO_AVALIADO', alvos: [] });
  return itens;
}
