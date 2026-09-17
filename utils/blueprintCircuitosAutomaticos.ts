/**
 * CRIAÇÃO AUTOMÁTICA DE CIRCUITOS (14/09/2026).
 *
 * Pedido: *"Criação automática de circuito: 1.1 por ambiente 1.2 Por carga
 * máxima 1.3 Por função: Iluminação, tomadas de uso geral (TUGs) e tomadas de
 * uso específico (TUEs, como chuveiros, ar-condicionado e micro-ondas) devem
 * ficar em circuitos independentes."* — e, junto, a seção mínima por função:
 * *"TUG 2,5 mm² · TUE 4,0 mm² · Iluminação 1,5 mm² (quando em circuito
 * exclusivo)"*.
 *
 * O mesmo molde do eletroduto automático: o sistema PROPÕE, quem projeta
 * confirma, Ctrl+Z desfaz o lote inteiro. Aqui a proposta é uma PRÉVIA em
 * tabela (não há flag "sugerido" em circuito — seria campo novo no modelo, e
 * um circuito ou existe ou não existe); gravar é um único `runBatch`.
 *
 * ─── O QUE É NORMA E O QUE É HIPÓTESE ───────────────────────────────────────
 *
 * Norma (NBR 5410):
 *   - luz, TUG e TUE NUNCA no mesmo circuito — 9.5.3.1 (ponto de força > 10 A
 *     em circuito próprio) e 9.5.3.3 (o circuito comum é exceção, não regra).
 *     Decisão com o usuário: a função separa SEMPRE; o critério escolhido só
 *     diz como dividir luz e TUG entre si.
 *   - tomadas de cozinha / copa / área de serviço em circuito exclusivo —
 *     9.5.3.2. Vale em qualquer critério, senão a conferência acusaria o
 *     plano recém-criado.
 *   - seção mínima: 1,5 mm² iluminação e 2,5 mm² força — Tabela 47.
 *
 * Hipóteses (nomeadas, editáveis, nunca "verdade do software"):
 *   - carga máxima por circuito de luz/TUG: 10 A × tensão do quadro
 *     (1.270 VA em 127 V, 2.200 VA em 220 V) — prática de projeto residencial;
 *   - TUE e ligação direta: UM circuito por ponto (a norma só obriga acima de
 *     10 A; a prática é sempre);
 *   - 4,0 mm² para TUE — `HipotesesEletricas.secaoMinimaTueMm2`; a Tab. 47
 *     pede 2,5.
 *
 * ─── O QUE FICA DE FORA, E POR QUÊ ──────────────────────────────────────────
 *
 * Ponto que JÁ tem circuito não é religado — o plano só olha os soltos do
 * pavimento. Ponto de dados (TV, telefone, rede, USB) não é circuito de
 * força. Ponto sem classificação não tem função para separar. O interruptor
 * acompanha a iluminação do próprio ambiente: não é carga, é comando. Ponto
 * sem potência declarada entra contando 0 VA — inventar carga aqui seria
 * decidir disfarçado; a prévia marca "k sem VA" e oferece o preenchimento pela
 * norma, que é outro gesto.
 */
import {
  applyBatch,
  type BlueprintModel,
  type Command,
  type LigacaoDoCircuito,
  type ObjectId,
  type Quadro,
  type Terminal,
  type TipoDePontoEletrico,
} from './blueprintKernel';
import { ambienteDoPonto, FORA_DE_AMBIENTE } from './blueprintAgrupamentoDePontos';
import { etiquetaDoAmbiente } from './blueprintDistribuicao';
import {
  SECAO_MINIMA_POR_USO_MM2,
  type HipotesesEletricas,
} from './blueprintEletricaDimensionamento';

export const CRITERIOS_DE_CIRCUITO = ['ambiente', 'carga', 'funcao'] as const;
export type CriterioDeCircuito = (typeof CRITERIOS_DE_CIRCUITO)[number];

export const ROTULO_DO_CRITERIO_DE_CIRCUITO: Record<CriterioDeCircuito, string> = {
  ambiente: 'Por ambiente (sugerido)',
  carga: 'Por carga máxima',
  funcao: 'Um por função',
};

/** O que a tela sugere quando ninguém escolheu: um circuito de luz e um de TUG por cômodo. */
export const CRITERIO_DE_CIRCUITO_SUGERIDO: CriterioDeCircuito = 'ambiente';

/** A função do circuito — o eixo que NUNCA se mistura. */
export type FuncaoDoCircuito = 'ILUMINACAO' | 'TUG' | 'TUE';
export const ROTULO_DA_FUNCAO: Record<FuncaoDoCircuito, string> = {
  ILUMINACAO: 'Iluminação',
  TUG: 'TUG',
  TUE: 'TUE',
};

export interface HipotesesDeCircuitos {
  criterio: CriterioDeCircuito;
  /** VA por circuito de luz/TUG. `null` = `correnteMaximaA` × tensão do quadro. */
  cargaMaximaVA: number | null;
  /** A corrente por circuito que define o padrão quando a carga não é declarada. */
  correnteMaximaA: number;
  /** Tensão assumida quando o quadro não declara a sua. */
  tensaoAssumidaV: number;
}

export const HIPOTESES_CIRCUITOS_PADRAO: HipotesesDeCircuitos = {
  criterio: CRITERIO_DE_CIRCUITO_SUGERIDO,
  cargaMaximaVA: null,
  correnteMaximaA: 10,
  tensaoAssumidaV: 127,
};

export interface CargaMaximaEfetiva {
  va: number;
  origem: 'DECLARADA' | 'CALCULADA';
  tensaoV: number;
  /** O quadro não declara tensão — a prévia diz "assumido". */
  tensaoAssumida: boolean;
}

/** A carga máxima que vale, e de onde veio — para a prévia dizer "1.270 VA (10 A × 127 V)". */
export function cargaMaximaEfetivaVA(
  quadro: Pick<Quadro, 'tensaoV'> | null,
  hip: HipotesesDeCircuitos,
): CargaMaximaEfetiva {
  const tensaoAssumida = quadro?.tensaoV == null;
  const tensaoV = quadro?.tensaoV ?? hip.tensaoAssumidaV;
  if (hip.cargaMaximaVA != null && hip.cargaMaximaVA > 0) {
    return { va: hip.cargaMaximaVA, origem: 'DECLARADA', tensaoV, tensaoAssumida };
  }
  return { va: Math.round(hip.correnteMaximaA * tensaoV), origem: 'CALCULADA', tensaoV, tensaoAssumida };
}

export interface CircuitoPrevisto {
  /** `cir_000N`, previsto de `model.seq.cir` — ver `idsPrevistos`. */
  idPrevisto: ObjectId;
  nome: string;
  funcao: FuncaoDoCircuito;
  /** Nome do ambiente de origem; `null` quando fora de ambiente ou quando o circuito atravessa vários. */
  ambiente: string | null;
  /** Na ordem canônica do modelo. */
  terminalIds: ObjectId[];
  /** Interruptor e ponto sem VA contam 0. */
  somaVA: number;
  pontosSemPotencia: number;
  /** A seção mínima da função com que o circuito nasce (declarada, editável). */
  secaoMm2: number;
  tensaoV: number | null;
  /** Quando a soma passa a carga máxima e mesmo assim não há como dividir. */
  aviso: string | null;
}

export interface PlanoDeCircuitos {
  quadroId: ObjectId | null;
  circuitos: CircuitoPrevisto[];
  /** Todos os `AddCircuito` (na ordem de `circuitos`) e depois os `SetTerminalProps`. Vazio sem quadro. */
  comandos: Command[];
  foraDoPlano: { terminalId: ObjectId; motivo: string }[];
  /** Por que não há plano: sem quadro, nenhum ponto. `null` quando há. */
  motivo: string | null;
  cargaMaxima: CargaMaximaEfetiva | null;
}

/**
 * A função do ponto para efeito de circuito: luz → iluminação; TUG → TUG; TUE
 * e ligação direta → TUE; interruptor → comando (vai junto da luz); dados e
 * sem classificação → nenhuma.
 */
export function funcaoDoPonto(tipo: TipoDePontoEletrico | null | undefined): FuncaoDoCircuito | 'COMANDO' | null {
  if (!tipo) return null;
  if (tipo.startsWith('ILUMINACAO')) return 'ILUMINACAO';
  if (tipo === 'TUG') return 'TUG';
  if (tipo === 'TUE' || tipo === 'LIGACAO_DIRETA') return 'TUE';
  if (tipo === 'INTERRUPTOR') return 'COMANDO';
  return null;
}

/** Os pontos elétricos do pavimento sem circuito, na ordem do modelo. */
function pontosSoltos(model: BlueprintModel, levelId: ObjectId): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) => t.levelId === levelId && t.disciplina === 'ELETRICA' && t.circuitoId == null,
  );
}

/**
 * Os pontos que o plano alcança: soltos, do pavimento, com função (inclui o
 * interruptor). É a contagem do botão no ribbon.
 */
export function pontosElegiveis(model: BlueprintModel, levelId: ObjectId): Terminal[] {
  return pontosSoltos(model, levelId).filter((t) => funcaoDoPonto(t.tipoEletrico) != null);
}

/**
 * Os quadros CANDIDATOS a receber os circuitos do pavimento: os do próprio
 * piso primeiro, depois os dos outros.
 *
 * 17/09/2026 (*"elimine essa regra, não faz nenhum sentido: exige um quadro no
 * mesmo pavimento"*): a regra antiga só aceitava quadro do mesmo piso, e uma
 * casa de dois pavimentos com um QDC no térreo ficava sem como criar os
 * circuitos do andar de cima. O quadro do térreo alimentar o piso superior é o
 * caso comum, não a exceção. A ordem existe para o padrão continuar sendo o
 * quadro do piso quando ele existe.
 */
export function quadrosDoNivel(model: BlueprintModel, levelId: ObjectId): Quadro[] {
  const todos = model.quadros ?? [];
  return [...todos.filter((q) => q.levelId === levelId), ...todos.filter((q) => q.levelId !== levelId)];
}

/** O nome do pavimento do quadro, para o seletor dizer de onde ele é. */
export function pavimentoDoQuadro(model: BlueprintModel, quadro: Quadro): string {
  return model.levels.find((l) => l.id === quadro.levelId)?.name ?? '';
}

/**
 * O próximo número livre no quadro (ou no desenho todo, sem quadro) — a mesma
 * conta do "Criar novo…" do Quadro de cargas, para os dois caminhos numerarem
 * igual.
 */
export function proximoNumeroDeCircuito(model: BlueprintModel, quadroId: ObjectId | null): number {
  return (model.circuitos ?? []).filter((c) => !quadroId || c.quadroId === quadroId).length + 1;
}

/**
 * Os ids que `applyBatch` vai dar a N `AddCircuito` seguidos. Espelha `nextId`
 * do kernel (`${prefixo}_${n em 4 dígitos}`, sequencial por `model.seq`).
 * É o que permite ligar os pontos NO MESMO LOTE que cria os circuitos — um
 * passo de undo. `conferirPlano` prova antes de gravar que a previsão bate.
 */
export function idsPrevistos(model: BlueprintModel, quantos: number): ObjectId[] {
  const base = model.seq['cir'] ?? 0;
  return Array.from({ length: quantos }, (_, k) => `cir_${String(base + k + 1).padStart(4, '0')}`);
}

/** A seção mínima com que o circuito nasce: luz 1,5 · TUG 2,5 (Tab. 47) · TUE pela hipótese. */
export function secaoMinimaDaFuncaoMm2(funcao: FuncaoDoCircuito, hipEletricas: HipotesesEletricas): number {
  if (funcao === 'ILUMINACAO') return SECAO_MINIMA_POR_USO_MM2.ILUMINACAO;
  if (funcao === 'TUG') return SECAO_MINIMA_POR_USO_MM2.FORCA;
  return Math.max(SECAO_MINIMA_POR_USO_MM2.FORCA, hipEletricas.secaoMinimaTueMm2);
}

/** Um grupo de pontos a caminho de virar circuito(s). */
interface Balde {
  funcao: FuncaoDoCircuito;
  /** Rótulo do agrupamento ("Sala", "Cozinha/serviço", "Chuveiro"); vazio = só a função. */
  rotulo: string;
  ambiente: string | null;
  pontos: Terminal[];
}

const va = (t: Terminal) => t.potenciaW ?? 0;

/**
 * Enche circuitos na ordem dada: fecha quando o próximo ponto passaria a carga
 * máxima — e o balde não está vazio. Ponto sozinho acima do máximo fica
 * sozinho: não há como dividir um ponto.
 */
function encher(pontos: readonly Terminal[], maxVA: number): Terminal[][] {
  const baldes: Terminal[][] = [];
  let atual: Terminal[] = [];
  let soma = 0;
  for (const p of pontos) {
    if (atual.length > 0 && soma + va(p) > maxVA) {
      baldes.push(atual);
      atual = [];
      soma = 0;
    }
    atual.push(p);
    soma += va(p);
  }
  if (atual.length > 0) baldes.push(atual);
  return baldes;
}

/**
 * O nome curto do ponto de TUE para o circuito: o rótulo ("Chuveiro",
 * "Micro-ondas"); sem rótulo, o ambiente ("TUE Cozinha"); sem os dois, só a
 * função. Repetidos ganham número — "TUE Cozinha 1 / 2".
 */
function sufixoDoTue(t: Terminal, ambiente: string | null): string {
  const rotulo = t.rotulo?.trim();
  if (rotulo) return rotulo;
  if (t.tipoEletrico === 'LIGACAO_DIRETA') return ambiente ? `Ligação direta ${ambiente}` : 'Ligação direta';
  return ambiente ?? '';
}

/**
 * O plano de circuitos para os pontos soltos de um pavimento. Puro: não grava
 * nada — devolve os comandos para quem chama aplicar num lote só.
 */
export function planejarCircuitos(
  model: BlueprintModel,
  levelId: ObjectId,
  quadroId: ObjectId | null,
  hip: HipotesesDeCircuitos,
  hipEletricas: HipotesesEletricas,
): PlanoDeCircuitos {
  const vazio = (motivo: string, extras: Partial<PlanoDeCircuitos> = {}): PlanoDeCircuitos => ({
    quadroId,
    circuitos: [],
    comandos: [],
    foraDoPlano: [],
    motivo,
    cargaMaxima: null,
    ...extras,
  });
  const quadro = quadroId ? (model.quadros ?? []).find((q) => q.id === quadroId) ?? null : null;
  // Sem quadro NENHUM no desenho o circuito não tem onde nascer. Quadro de
  // outro pavimento vale (17/09/2026) — ver `quadrosDoNivel`.
  if (!quadro) return vazio('sem quadro no desenho');

  const cargaMaxima = cargaMaximaEfetivaVA(quadro, hip);
  const soltos = pontosSoltos(model, levelId);
  const foraDoPlano: PlanoDeCircuitos['foraDoPlano'] = [];
  const luz: Terminal[] = [];
  const tug: Terminal[] = [];
  const tue: Terminal[] = [];
  const comandosDeLuz: Terminal[] = [];
  for (const t of soltos) {
    const f = funcaoDoPonto(t.tipoEletrico);
    if (f === 'ILUMINACAO') luz.push(t);
    else if (f === 'TUG') tug.push(t);
    else if (f === 'TUE') tue.push(t);
    else if (f === 'COMANDO') comandosDeLuz.push(t);
    else if (!t.tipoEletrico) foraDoPlano.push({ terminalId: t.id, motivo: 'sem classificação — escolha o tipo do ponto' });
    else foraDoPlano.push({ terminalId: t.id, motivo: 'ponto de dados não é circuito de força' });
  }
  if (luz.length + tug.length + tue.length === 0) {
    return vazio('nenhum ponto sem circuito', { foraDoPlano, cargaMaxima });
  }

  // O ambiente de cada ponto, uma vez. Chave estável para agrupar, nome para
  // batizar, e o tipo para a 9.5.3.2. Ordem de leitura = ordem dos ambientes
  // no pavimento, "Fora de ambiente" por último (a mesma da lista do quadro).
  const ordemDosAmbientes = model.spaces.filter((s) => s.levelId === levelId).map((s) => s.id);
  const ambienteDe = (t: Terminal) => {
    const a = ambienteDoPonto(model, t);
    if (!a) return { chave: 'fora', nome: null as string | null, cozinha: false, posicao: Number.MAX_SAFE_INTEGER };
    const tipo = etiquetaDoAmbiente(a.space, model.labels)?.tipoDeAmbiente ?? null;
    return { chave: a.space.id, nome: a.nome, cozinha: tipo === 'COZINHA_SERVICO', posicao: ordemDosAmbientes.indexOf(a.space.id) };
  };
  const porAmbiente = (pontos: readonly Terminal[]) => {
    const grupos = new Map<string, { nome: string | null; cozinha: boolean; posicao: number; pontos: Terminal[] }>();
    for (const t of pontos) {
      const a = ambienteDe(t);
      const g = grupos.get(a.chave) ?? { nome: a.nome, cozinha: a.cozinha, posicao: a.posicao, pontos: [] };
      g.pontos.push(t);
      grupos.set(a.chave, g);
    }
    return [...grupos.values()].sort((g, h) => g.posicao - h.posicao);
  };

  const baldes: Balde[] = [];
  const dividir = (funcao: FuncaoDoCircuito, rotulo: string, ambiente: string | null, pontos: readonly Terminal[]) => {
    const partes = encher(pontos, cargaMaxima.va);
    partes.forEach((parte, i) => {
      const numerado = partes.length > 1 ? `${rotulo} ${i + 1}`.trim() : rotulo;
      baldes.push({ funcao, rotulo: numerado, ambiente, pontos: parte });
    });
  };
  const nomeDosAmbientes = (pontos: readonly Terminal[]) => {
    const nomes = [...new Set(pontos.map((t) => ambienteDe(t).nome ?? FORA_DE_AMBIENTE))];
    return nomes.length <= 2 ? nomes.join(', ') : `${nomes.slice(0, 2).join(', ')}…`;
  };

  for (const funcao of ['ILUMINACAO', 'TUG'] as const) {
    const pontos = funcao === 'ILUMINACAO' ? luz : tug;
    if (pontos.length === 0) continue;
    if (hip.criterio === 'ambiente') {
      for (const g of porAmbiente(pontos)) {
        dividir(funcao, g.nome ?? FORA_DE_AMBIENTE, g.nome, g.pontos);
      }
      continue;
    }
    // 9.5.3.2 — tomadas de cozinha/serviço nunca dividem circuito com outro
    // cômodo, seja qual for o critério.
    const cozinha = funcao === 'TUG' ? pontos.filter((t) => ambienteDe(t).cozinha) : [];
    const demais = pontos.filter((t) => !cozinha.includes(t));
    if (hip.criterio === 'carga') {
      if (demais.length > 0) {
        const partes = encher(demais, cargaMaxima.va);
        partes.forEach((parte, i) => {
          const nomes = nomeDosAmbientes(parte);
          const rotulo = partes.length > 1 ? `${i + 1} (${nomes})` : `(${nomes})`;
          const unico = new Set(parte.map((t) => ambienteDe(t).chave)).size === 1 ? ambienteDe(parte[0]).nome : null;
          baldes.push({ funcao, rotulo, ambiente: unico, pontos: parte });
        });
      }
      for (const g of porAmbiente(cozinha)) dividir(funcao, g.nome ?? FORA_DE_AMBIENTE, g.nome, g.pontos);
      continue;
    }
    // 'funcao': um circuito só — e o aviso quando ele passa da carga máxima.
    if (demais.length > 0) baldes.push({ funcao, rotulo: '', ambiente: null, pontos: demais });
    for (const g of porAmbiente(cozinha)) baldes.push({ funcao, rotulo: g.nome ?? FORA_DE_AMBIENTE, ambiente: g.nome, pontos: g.pontos });
  }

  // Interruptor acompanha a luz do próprio ambiente; sem luz lá, a primeira
  // iluminação do plano; sem nenhuma, fica de fora com o motivo.
  for (const t of comandosDeLuz) {
    const a = ambienteDe(t);
    const doAmbiente = baldes.find((b) => b.funcao === 'ILUMINACAO' && b.pontos.some((p) => ambienteDe(p).chave === a.chave));
    const destino = doAmbiente ?? baldes.find((b) => b.funcao === 'ILUMINACAO');
    if (destino) destino.pontos.push(t);
    else foraDoPlano.push({ terminalId: t.id, motivo: 'interruptor sem ponto de luz para acompanhar' });
  }

  // TUE e ligação direta: um por ponto, na ordem canônica.
  const sufixosDeTue = tue.map((t) => sufixoDoTue(t, ambienteDe(t).nome));
  const repetidos = new Map<string, number>();
  for (const s of sufixosDeTue) repetidos.set(s, (repetidos.get(s) ?? 0) + 1);
  const vistos = new Map<string, number>();
  tue.forEach((t, i) => {
    const base = sufixosDeTue[i];
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const rotulo = (repetidos.get(base) ?? 0) > 1 ? `${base} ${n}`.trim() : base;
    baldes.push({ funcao: 'TUE', rotulo, ambiente: ambienteDe(t).nome, pontos: [t] });
  });

  // Ordem final: iluminação, TUG, TUE — como se lê um quadro de cargas.
  const peso: Record<FuncaoDoCircuito, number> = { ILUMINACAO: 0, TUG: 1, TUE: 2 };
  baldes.sort((b, c) => peso[b.funcao] - peso[c.funcao]);

  const n0 = proximoNumeroDeCircuito(model, quadro.id);
  const ids = idsPrevistos(model, baldes.length);
  // FFF é do quadro; um circuito terminal não herda três fases sem alguém decidir.
  const ligacao: LigacaoDoCircuito | null = quadro.ligacao && quadro.ligacao !== 'FFF' ? quadro.ligacao : null;
  const circuitos: CircuitoPrevisto[] = baldes.map((b, k) => {
    const cargas = b.pontos.filter((p) => p.tipoEletrico !== 'INTERRUPTOR');
    const somaVA = cargas.reduce((s, p) => s + va(p), 0);
    const passa = b.funcao !== 'TUE' && somaVA > cargaMaxima.va;
    return {
      idPrevisto: ids[k],
      nome: `C${n0 + k} — ${ROTULO_DA_FUNCAO[b.funcao]}${b.rotulo ? ` ${b.rotulo}` : ''}`,
      funcao: b.funcao,
      ambiente: b.ambiente,
      terminalIds: b.pontos.map((p) => p.id),
      somaVA,
      pontosSemPotencia: cargas.filter((p) => p.potenciaW == null).length,
      secaoMm2: secaoMinimaDaFuncaoMm2(b.funcao, hipEletricas),
      tensaoV: quadro.tensaoV ?? null,
      aviso: passa
        ? `soma ${somaVA} VA acima da carga máxima ${cargaMaxima.va} VA — o pré-dimensionamento vai acusar`
        : null,
    };
  });

  // Todos os AddCircuito antes de qualquer SetTerminalProps: a invariante do
  // kernel roda a cada comando do lote e recusa ponto apontando para circuito
  // que ainda não existe.
  const comandos: Command[] = [
    ...circuitos.map(
      (c): Command => ({
        type: 'AddCircuito',
        quadroId: quadro.id,
        nome: c.nome,
        tipo: c.funcao,
        tensaoV: c.tensaoV,
        ligacao,
        secaoMm2: c.secaoMm2,
      }),
    ),
    ...circuitos.flatMap((c) =>
      c.terminalIds.map((terminalId): Command => ({ type: 'SetTerminalProps', terminalId, circuitoId: c.idPrevisto })),
    ),
  ];

  return { quadroId: quadro.id, circuitos, comandos, foraDoPlano, motivo: null, cargaMaxima };
}

/**
 * Simula o lote e confere que os ids criados são os previstos e que cada
 * ponto aponta para o seu circuito. É a trava antes de gravar: se algum dia
 * outro comando consumir o prefixo `cir` no meio, a previsão falha AQUI, e
 * nada vai para o modelo.
 */
export function conferirPlano(model: BlueprintModel, plano: PlanoDeCircuitos): { ok: true } | { ok: false; motivo: string } {
  if (plano.comandos.length === 0) return { ok: false, motivo: plano.motivo ?? 'nada a criar' };
  try {
    const r = applyBatch(model, plano.comandos);
    const criados = r.diff.created.filter((id) => id.startsWith('cir_'));
    const previstos = plano.circuitos.map((c) => c.idPrevisto);
    if (criados.length !== previstos.length || criados.some((id, i) => id !== previstos[i])) {
      return { ok: false, motivo: `ids previstos (${previstos.join(', ')}) diferem dos criados (${criados.join(', ')})` };
    }
    const terminais = new Map((r.model.terminais ?? []).map((t) => [t.id, t]));
    for (const c of plano.circuitos) {
      for (const id of c.terminalIds) {
        if (terminais.get(id)?.circuitoId !== c.idPrevisto) {
          return { ok: false, motivo: `o ponto ${id} não ficou em ${c.idPrevisto}` };
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
