/**
 * CIRCUITOS AUTOMÁTICOS — COM QUE ESCOLHAS OS CIRCUITOS FORAM CRIADOS, QUAIS SÃO DO MOTOR, E O QUE FAZER QUANDO AS
 * ESCOLHAS MUDAM (F5 do plano `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026).
 *
 * Pedido (sessão 9e26b316, 24/10/2026):
 * > *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de eletroduto
 * > para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para relançar e
 * > incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*
 *
 * Decisões do usuário (mesma sessão): vale para TODOS os motores; rede já aceita + escolha mudou → refaz tudo, PEDINDO
 * CONFIRMAÇÃO.
 *
 * ─── O ALVO: O PAVIMENTO ────────────────────────────────────────────────────
 * O motor (`planejarCircuitos`) cria os circuitos dos pontos SOLTOS de UM pavimento, num quadro escolhido (que pode ser
 * de outro pavimento — o QDC do térreo alimenta o andar de cima). O registro é então por pavimento (`alvoId` = o
 * `levelId`): é a unidade em que o motor trabalha. Nada aqui lê "o pavimento ativo" — quem chama diz qual.
 *
 * ─── QUAIS CIRCUITOS SÃO DO MOTOR ───────────────────────────────────────────
 * O `Circuito` do kernel não tem flag `sugerido` nem `origem`, e o kernel ficou como está. O registro guarda, numa
 * chave SEM rótulo (`circuitosDoMotor`, fora do aviso), uma ASSINATURA por circuito que o motor criou: dois resumos
 * FNV-1a — um do NOME e um do resto das propriedades (tipo, tensão, disjuntor, seções, ligação, DR, curva, reserva) —,
 * ordenados e unidos por espaço. Por que assinatura e não id/uid:
 * - o `id` (`cir_0003`) é endereço de sessão: o kernel o REATRIBUI por posição a cada leitura do payload;
 * - o `uid` é aleatório e nasce DENTRO do lote — o registro (que vai no mesmo lote) não tem como sabê-lo, e a Casa
 *   Automática monta o lote numa simulação e o editor o REEXECUTA (outros uids);
 * - o nome sozinho (opção "padrão de nome") confundiria o circuito que o usuário batizou igual ("C3 — Iluminação Sala").
 * A assinatura sobrevive ao payload e à reexecução, e responde exatamente a pergunta: "o circuito está como o motor o
 * criou?". Circuito do motor com o nome trocado, ou com disjuntor/seção/curva/DR/ligação declarados depois, deixa de
 * bater: conta como do USUÁRIO e FICA (`alterados`, quando só o resto mudou e o nome ainda bate — a confirmação diz
 * "do motor, alterado"). A `fase` fica FORA da assinatura: é do balanceamento do quadro (refazível pelo botão de lá), e
 * a confirmação avisa que os novos nascem sem fase. Os PONTOS também ficam fora: apagar ou mover um ponto não é editar
 * o circuito (e o uid do ponto criado pela casa não sobrevive à reexecução).
 * Circuito com ponto em OUTRO pavimento nunca é do motor deste (o motor só junta pontos de um pavimento).
 * Rede antiga, criada antes do registro: nenhum circuito é identificável — o botão desliga com o motivo.
 *
 * ─── O QUE O REFAZER FAZ ────────────────────────────────────────────────────
 * Num lote só (Ctrl+Z volta tudo): apaga os circuitos do motor (o `DeleteCircuito` do kernel solta os pontos, tira o
 * circuito dos eletrodutos e dos DRs), apaga os ELETRODUTOS que só levavam esses circuitos (e as caixas de passagem dos
 * nós deles) — sem isso, eles ficariam órfãos (sem circuito nenhum): o planejador dos eletrodutos não os vê como rede e
 * lançaria trechos novos por cima deles —, recria os circuitos dos pontos soltos do pavimento com as escolhas atuais e
 * grava o registro. O eletroduto que leva também outro circuito fica (sem os refeitos). Depois, o painel dos eletrodutos
 * mostra os pontos a ligar ("Lançar em todos (N)") — a fiação é derivada dos eletrodutos e acompanha.
 *
 * Puro: sem React, sem banco.
 */
import {
  applyBatch,
  type BlueprintModel,
  type Circuito,
  type Command,
  type ObjectId,
  type Terminal,
  type Trecho,
  type ValorDeEscolha,
} from './blueprintKernel';
import {
  CRITERIO_DE_CIRCUITO_SUGERIDO,
  HIPOTESES_CIRCUITOS_PADRAO,
  conferirPlano,
  planejarCircuitos,
  type CriterioDeCircuito,
  type HipotesesDeCircuitos,
  type PlanoDeCircuitos,
} from './blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO, type HipotesesEletricas } from './blueprintEletricaDimensionamento';
import { caixasDaRedeDoQuadro } from './blueprintEletrodutos';
import {
  comandoDeRegistro,
  diferencasDasEscolhas,
  registroDe,
  textoDasDiferencas,
  type DiferencaDeEscolha,
  type EscolhasDoLancamento,
  type OpcoesDaComparacao,
} from './blueprintRegistroDeLancamento';

/** A chave (sem rótulo) que guarda as assinaturas dos circuitos que o motor criou. */
export const CHAVE_DOS_CIRCUITOS_DO_MOTOR = 'circuitosDoMotor';

/** Carga máxima não declarada: `correnteMaximaA` × a tensão do quadro. Texto, não `null`: `null` conta como ausente. */
const CARGA_PADRAO = 'PADRAO';

/**
 * As escolhas com que o motor cria os circuitos, achatadas para o registro: o critério e a carga máxima do painel
 * (`blueprint:circuitosAutomaticos`, no navegador) e, das hipóteses elétricas do estudo, a única que o motor lê — a
 * seção mínima de TUE (`secaoMinimaDaFuncaoMm2`). Corrente máxima e tensão assumida são constantes do motor (o painel
 * não as muda); a tensão do quadro é do desenho, não escolha.
 */
export function escolhasDosCircuitos(hip: HipotesesDeCircuitos, hipEletricas: Pick<HipotesesEletricas, 'secaoMinimaTueMm2'>): EscolhasDoLancamento {
  return {
    criterio: hip.criterio,
    cargaMaximaVA: hip.cargaMaximaVA != null && hip.cargaMaximaVA > 0 ? hip.cargaMaximaVA : CARGA_PADRAO,
    secaoMinimaTueMm2: hipEletricas.secaoMinimaTueMm2,
  };
}

const ROTULO_CURTO_DO_CRITERIO: Record<CriterioDeCircuito, string> = {
  ambiente: 'por ambiente',
  carga: 'por carga máxima',
  funcao: 'um por função',
};
const num = (v: ValorDeEscolha) => String(v).replace('.', ',');

/** Rótulos, formatadores e padrões das escolhas dos circuitos — para o aviso (regra B). */
export const ESCOLHAS_DOS_CIRCUITOS: OpcoesDaComparacao = {
  rotulos: {
    criterio: 'Dividir luz e TUG',
    cargaMaximaVA: 'Carga máxima por circuito',
    secaoMinimaTueMm2: 'Seção mínima de TUE (hipóteses elétricas do estudo)',
  },
  valores: {
    criterio: (v) => ROTULO_CURTO_DO_CRITERIO[v as CriterioDeCircuito] ?? String(v),
    cargaMaximaVA: (v) =>
      v === CARGA_PADRAO ? `padrão (${HIPOTESES_CIRCUITOS_PADRAO.correnteMaximaA} A × tensão do quadro)` : `${Number(v).toLocaleString('pt-BR')} VA`,
    secaoMinimaTueMm2: (v) => `${num(v)} mm²`,
  },
  padroes: {
    criterio: CRITERIO_DE_CIRCUITO_SUGERIDO,
    cargaMaximaVA: CARGA_PADRAO,
    secaoMinimaTueMm2: HIPOTESES_PADRAO.secaoMinimaTueMm2,
  },
};

/**
 * As opções da comparação entre o gravado e o atual. Com o critério "um por função" (de qualquer lado) a carga máxima
 * não divide nada — o painel até desliga o campo —, então ela sai da comparação: trocá-la não pede relançar.
 */
function opcoesDaComparacao(gravadas: Record<string, ValorDeEscolha | undefined>, atuais: Record<string, ValorDeEscolha | undefined>): OpcoesDaComparacao {
  const porFuncao = (e: Record<string, ValorDeEscolha | undefined>) => (e.criterio ?? CRITERIO_DE_CIRCUITO_SUGERIDO) === 'funcao';
  if (!porFuncao(gravadas) && !porFuncao(atuais)) return ESCOLHAS_DOS_CIRCUITOS;
  const { cargaMaximaVA: _fora, ...rotulos } = ESCOLHAS_DOS_CIRCUITOS.rotulos;
  return { ...ESCOLHAS_DOS_CIRCUITOS, rotulos };
}

// ─── A assinatura de um circuito ─────────────────────────────────────────────

function fnv(texto: string): string {
  let x = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    x ^= texto.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x.toString(16).padStart(8, '0');
}

/** As duas metades da assinatura: o nome e o resto das propriedades (a `fase` fica fora — ver o cabeçalho). */
function metadesDaAssinatura(c: Circuito): { nome: string; resto: string } {
  const resto = [
    c.tipo ?? null,
    c.tensaoV ?? null,
    c.disjuntorA ?? null,
    c.secaoMm2 ?? null,
    c.secaoNeutroMm2 ?? null,
    c.secaoPeMm2 ?? null,
    c.ligacao ?? null,
    c.protecaoDR ?? null,
    c.curva ?? null,
    c.reserva ?? null,
  ];
  return { nome: fnv(c.nome), resto: fnv(JSON.stringify(resto)) };
}

/** A assinatura de um circuito como o registro a guarda: `<nome>.<resto>`, 17 caracteres. */
export function assinaturaDoCircuito(c: Circuito): string {
  const { nome, resto } = metadesDaAssinatura(c);
  return `${nome}.${resto}`;
}

function assinaturasDoRegistro(escolhas: Record<string, ValorDeEscolha> | null | undefined): string[] {
  const v = escolhas?.[CHAVE_DOS_CIRCUITOS_DO_MOTOR];
  return typeof v === 'string' ? v.split(' ').filter((s) => /^[0-9a-f]{8}\.[0-9a-f]{8}$/.test(s)) : [];
}

const textoDasAssinaturas = (assinaturas: Iterable<string>) => [...new Set(assinaturas)].sort().join(' ');

// ─── Os circuitos de um pavimento ────────────────────────────────────────────

export interface CircuitosDoPavimento {
  /** Há registro do motor neste pavimento. */
  temRegistro: boolean;
  /** Do motor, exatamente como ele os criou — o que o Refazer apaga e recria. */
  doMotor: Circuito[];
  /** Do motor, mas alterados depois (o nome ainda bate; disjuntor, seção, curva, DR… mudaram) — ficam. */
  alterados: Circuito[];
  /** Os demais com ponto neste pavimento: criados à mão, renomeados, de antes do registro — ficam. */
  outros: Circuito[];
}

/** Os pavimentos dos pontos de cada circuito. */
function pavimentosPorCircuito(model: BlueprintModel): Map<ObjectId, Set<ObjectId>> {
  const out = new Map<ObjectId, Set<ObjectId>>();
  for (const t of model.terminais ?? []) {
    if (t.circuitoId == null) continue;
    const s = out.get(t.circuitoId) ?? new Set<ObjectId>();
    s.add(t.levelId);
    out.set(t.circuitoId, s);
  }
  return out;
}

/**
 * Classifica os circuitos do pavimento pelo registro: do motor (a assinatura bate inteira), do motor alterados (só o
 * nome bate) e os outros (com ponto aqui). Circuito com ponto em outro pavimento nunca é do motor deste.
 */
export function circuitosDoPavimento(model: BlueprintModel, levelId: ObjectId): CircuitosDoPavimento {
  const registro = registroDe(model, 'CIRCUITOS', levelId);
  const assinaturas = new Set(assinaturasDoRegistro(registro?.escolhas));
  const nomes = new Set([...assinaturas].map((a) => a.split('.')[0]));
  const pavimentos = pavimentosPorCircuito(model);
  const out: CircuitosDoPavimento = { temRegistro: !!registro, doMotor: [], alterados: [], outros: [] };
  for (const c of model.circuitos ?? []) {
    const ps = pavimentos.get(c.id) ?? new Set<ObjectId>();
    const aqui = ps.has(levelId);
    const soAqui = [...ps].every((l) => l === levelId);
    if (soAqui && assinaturas.size > 0) {
      const { nome } = metadesDaAssinatura(c);
      if (assinaturas.has(assinaturaDoCircuito(c))) {
        out.doMotor.push(c);
        continue;
      }
      if (nomes.has(nome)) {
        out.alterados.push(c);
        continue;
      }
    }
    if (aqui) out.outros.push(c);
  }
  return out;
}

/** O quadro dos circuitos do motor do pavimento (o primeiro) — o padrão do seletor do painel. `null` = nenhum. */
export function quadroDosCircuitosDoMotor(model: BlueprintModel, levelId: ObjectId): ObjectId | null {
  return circuitosDoPavimento(model, levelId).doMotor[0]?.quadroId ?? null;
}

/**
 * REGRA B: o que mudou desde a criação. Sem registro (circuitos antigos) → `[]`. Sem nenhum circuito do motor ainda
 * no pavimento (apagados ou alterados todos) → `[]`: o Refazer não teria o que refazer — o aviso seria fantasma.
 */
export function diferencasDosCircuitos(
  model: BlueprintModel,
  levelId: ObjectId,
  atuais: Record<string, ValorDeEscolha | undefined>,
): DiferencaDeEscolha[] {
  const registro = registroDe(model, 'CIRCUITOS', levelId);
  if (!registro) return [];
  if (circuitosDoPavimento(model, levelId).doMotor.length === 0) return [];
  return diferencasDasEscolhas(registro.escolhas, atuais, opcoesDaComparacao(registro.escolhas, atuais));
}

/** As escolhas do registro sem as assinaturas. */
function semAssinaturas(escolhas: Record<string, ValorDeEscolha>): EscolhasDoLancamento {
  const { [CHAVE_DOS_CIRCUITOS_DO_MOTOR]: _fora, ...resto } = escolhas;
  return resto;
}

/** As assinaturas que continuam valendo: as que ainda batem com um circuito do motor (inteiro ou alterado). */
function assinaturasMantidas(model: BlueprintModel, levelId: ObjectId, cls = circuitosDoPavimento(model, levelId)): string[] {
  const registro = registroDe(model, 'CIRCUITOS', levelId);
  const nomesVivos = new Set([...cls.doMotor, ...cls.alterados].map((c) => metadesDaAssinatura(c).nome));
  return assinaturasDoRegistro(registro?.escolhas).filter((a) => nomesVivos.has(a.split('.')[0]));
}

/** As assinaturas dos circuitos previstos pelo plano, lidas do modelo DEPOIS do lote (o que o kernel gravou). */
function assinaturasDoPlano(depois: BlueprintModel, plano: PlanoDeCircuitos): string[] {
  const porId = new Map((depois.circuitos ?? []).map((c) => [c.id, c]));
  return plano.circuitos.flatMap((c) => {
    const criado = porId.get(c.idPrevisto);
    return criado ? [assinaturaDoCircuito(criado)] : [];
  });
}

/** O lote do plano, provado (`conferirPlano`: os ids previstos batem). Recusa → `Error` com o motivo. */
function modeloDepoisDoPlano(model: BlueprintModel, plano: PlanoDeCircuitos): BlueprintModel {
  const prova = conferirPlano(model, plano);
  if (!prova.ok) throw new Error(prova.motivo);
  return applyBatch(model, plano.comandos).model;
}

/**
 * O LOTE DE CRIAR (o "Criar N circuito(s)"): o plano e o registro NO MESMO lote (o Ctrl+Z volta os dois).
 *
 * Regra do lote PARCIAL: sobrando circuitos do motor criados com OUTRAS escolhas, o registro mantém as escolhas
 * antigas (o aviso continua certo: aqueles circuitos não mudaram) e só acrescenta as assinaturas dos novos. Sem sobra,
 * ou com as mesmas escolhas, grava as atuais. Os circuitos de antes do registro não entram (não são identificáveis).
 * Recusa do kernel, ou ids previstos que não batem → `Error` (quem chama diz o motivo; nada é gravado).
 */
export function comandosDeCriarCircuitos(
  model: BlueprintModel,
  levelId: ObjectId,
  quadroId: ObjectId | null,
  hip: HipotesesDeCircuitos,
  hipEletricas: HipotesesEletricas,
): { comandos: Command[]; plano: PlanoDeCircuitos } {
  const plano = planejarCircuitos(model, levelId, quadroId, hip, hipEletricas);
  if (plano.comandos.length === 0) return { comandos: [], plano };
  const depois = modeloDepoisDoPlano(model, plano);
  const atuais = escolhasDosCircuitos(hip, hipEletricas);
  const registro = registroDe(model, 'CIRCUITOS', levelId);
  const cls = circuitosDoPavimento(model, levelId);
  const sobra = cls.doMotor.length > 0;
  const iguais = !!registro && diferencasDasEscolhas(registro.escolhas, atuais, opcoesDaComparacao(registro.escolhas, atuais)).length === 0;
  const base = registro && sobra && !iguais ? semAssinaturas(registro.escolhas) : atuais;
  const assinaturas = [...assinaturasMantidas(model, levelId, cls), ...assinaturasDoPlano(depois, plano)];
  return {
    comandos: [...plano.comandos, comandoDeRegistro('CIRCUITOS', levelId, { ...base, [CHAVE_DOS_CIRCUITOS_DO_MOTOR]: textoDasAssinaturas(assinaturas) })],
    plano,
  };
}

// ─── O Refazer ───────────────────────────────────────────────────────────────

export interface CircuitosARefazer {
  levelId: ObjectId;
  nomeDoPavimento: string;
  /** Os circuitos do motor (inteiros) — saem e são recriados. */
  circuitos: Circuito[];
  /** Os pontos desses circuitos (voltam a ser distribuídos). */
  pontos: number;
  /** Os que ficam: do motor alterados, e os demais com ponto neste pavimento. */
  alterados: Circuito[];
  outros: Circuito[];
  /** Os eletrodutos que SÓ levavam esses circuitos (saem) e as caixas de passagem dos nós deles. */
  trechos: Trecho[];
  caixas: Terminal[];
  /** Eletrodutos que levam esses circuitos E outros — ficam, sem os refeitos. */
  trechosQueFicam: number;
  /** DRs do quadro que citavam algum desses circuitos (deixam de citá-los). */
  drs: number;
  /** Desses circuitos, quantos tinham fase (balanceamento) — os novos nascem sem. */
  comFase: number;
  /** Os nomes dos quadros onde eles estavam. */
  quadros: string[];
}

/** O que o Refazer do pavimento apaga, e o que fica — para a confirmação e para o lote. */
export function circuitosARefazer(model: BlueprintModel, levelId: ObjectId): CircuitosARefazer {
  const cls = circuitosDoPavimento(model, levelId);
  const ids = new Set(cls.doMotor.map((c) => c.id));
  const eletricos = (model.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && (t.circuitoIds ?? []).some((id) => ids.has(id)));
  const trechos = eletricos.filter((t) => (t.circuitoIds ?? []).every((id) => ids.has(id)));
  const caixas = trechos.length ? caixasDaRedeDoQuadro(model, { id: '' }, trechos) : [];
  const nomeDoQuadro = new Map((model.quadros ?? []).map((q) => [q.id, q.nome]));
  return {
    levelId,
    nomeDoPavimento: model.levels.find((l) => l.id === levelId)?.name ?? '',
    circuitos: cls.doMotor,
    pontos: (model.terminais ?? []).filter((t) => t.circuitoId != null && ids.has(t.circuitoId)).length,
    alterados: cls.alterados,
    outros: cls.outros,
    trechos,
    caixas,
    trechosQueFicam: eletricos.length - trechos.length,
    drs: (model.quadros ?? []).reduce((n, q) => n + (q.drs ?? []).filter((d) => d.circuitoIds.some((id) => ids.has(id))).length, 0),
    comFase: cls.doMotor.filter((c) => c.fase != null).length,
    quadros: [...new Set(cls.doMotor.map((c) => nomeDoQuadro.get(c.quadroId) ?? ''))].filter(Boolean),
  };
}

/**
 * REFAZER os circuitos do motor do pavimento: apaga os circuitos do motor (os pontos ficam soltos), os eletrodutos que
 * só os levavam e as caixas de passagem dos nós deles, recria os circuitos dos pontos soltos do pavimento com as
 * escolhas atuais no quadro dado e grava o registro — tudo num lote (Ctrl+Z volta tudo). Sem circuito do motor: nada.
 * Se nada for recriado, o registro sai. Recusa do kernel → `Error` (quem chama diz o motivo).
 */
export function comandosDeRefazerCircuitos(
  model: BlueprintModel,
  levelId: ObjectId,
  quadroId: ObjectId | null,
  hip: HipotesesDeCircuitos,
  hipEletricas: HipotesesEletricas,
): { comandos: Command[]; plano: PlanoDeCircuitos | null } {
  const alvo = circuitosARefazer(model, levelId);
  if (alvo.circuitos.length === 0) return { comandos: [], plano: null };
  const remocoes: Command[] = [
    ...alvo.trechos.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...alvo.caixas.map((x): Command => ({ type: 'DeleteTerminal', terminalId: x.id })),
    ...alvo.circuitos.map((c): Command => ({ type: 'DeleteCircuito', circuitoId: c.id })),
  ];
  const semOsDoMotor = applyBatch(model, remocoes).model;
  const plano = planejarCircuitos(semOsDoMotor, levelId, quadroId, hip, hipEletricas);
  if (plano.comandos.length === 0) {
    return { comandos: [...remocoes, { type: 'ApagarRegistroDeLancamento', motor: 'CIRCUITOS', alvoId: levelId }], plano };
  }
  const depois = modeloDepoisDoPlano(semOsDoMotor, plano);
  // Os alterados continuam reconhecidos como "do motor, alterados" (a confirmação seguinte ainda os nomeia assim).
  const nomesAlterados = new Set(alvo.alterados.map((c) => metadesDaAssinatura(c).nome));
  const alterados = assinaturasDoRegistro(registroDe(model, 'CIRCUITOS', levelId)?.escolhas).filter((a) => nomesAlterados.has(a.split('.')[0]));
  const escolhas = { ...escolhasDosCircuitos(hip, hipEletricas), [CHAVE_DOS_CIRCUITOS_DO_MOTOR]: textoDasAssinaturas([...alterados, ...assinaturasDoPlano(depois, plano)]) };
  return { comandos: [...remocoes, ...plano.comandos, comandoDeRegistro('CIRCUITOS', levelId, escolhas)], plano };
}

const nomes = (cs: readonly Circuito[], max = 4) =>
  cs.length <= max ? cs.map((c) => c.nome).join(', ') : `${cs.slice(0, max).map((c) => c.nome).join(', ')}… (+${cs.length - max})`;

export interface ContextoDaConfirmacao {
  /** Quantos circuitos o Refazer recria (o plano sobre o modelo já sem os do motor). */
  novos: number;
  /** O quadro onde eles nascem. */
  quadro: string | null;
  diferencas: readonly DiferencaDeEscolha[];
}

/**
 * A confirmação do Refazer — HONESTA: o que sai e volta, o que precisa ser relançado depois (eletrodutos e fiação), o
 * que perde (DR, fase) e o que FICA (e a que a escolha nova não se aplica). Sem circuito do motor: `null`.
 */
export function textoDaConfirmacaoDosCircuitos(alvo: CircuitosARefazer, ctx: ContextoDaConfirmacao): string | null {
  if (alvo.circuitos.length === 0) return null;
  const partes: string[] = [];
  const pav = alvo.nomeDoPavimento ? `${alvo.nomeDoPavimento}: ` : '';
  const antes = ctx.quadro && alvo.quadros.length > 0 && !(alvo.quadros.length === 1 && alvo.quadros[0] === ctx.quadro) ? ` (antes: ${alvo.quadros.join(', ')})` : '';
  partes.push(
    `${pav}saem ${alvo.circuitos.length} circuito(s) do motor (${nomes(alvo.circuitos)}) e os ${alvo.pontos} ponto(s) deles — inclusive algum que você tenha posto à mão num deles — voltam a ser distribuídos com as escolhas atuais: ${ctx.novos} circuito(s) novo(s)${ctx.quadro ? ` no quadro ${ctx.quadro}${antes}` : ''}.`,
  );
  if (ctx.diferencas.length) partes.push(`O que mudou: ${textoDasDiferencas([...ctx.diferencas])}.`);
  if (alvo.trechos.length > 0 || alvo.trechosQueFicam > 0) {
    const sai = alvo.trechos.length
      ? `${alvo.trechos.length} eletroduto(s) que só os levavam saem (${alvo.trechos.filter((t) => !t.sugerido).length} confirmado(s))${alvo.caixas.length ? `, com ${alvo.caixas.length} caixa(s) de passagem` : ''}`
      : '';
    const fica = alvo.trechosQueFicam ? `${alvo.trechosQueFicam} eletroduto(s) que levam também outros circuitos ficam, sem eles` : '';
    partes.push(
      `Os eletrodutos e a fiação desses circuitos precisam ser relançados: ${[sai, fica].filter(Boolean).join('; ')}. Depois, relance os eletrodutos — o painel dos eletrodutos mostra os pontos a ligar.`,
    );
  } else {
    partes.push('Esses circuitos ainda não têm eletroduto; ao lançar os eletrodutos, eles saem pelos circuitos novos.');
  }
  if (alvo.drs > 0) partes.push(`${alvo.drs} DR(s) do quadro deixam de proteger esses circuitos — os novos nascem sem DR (o quadro volta a sugerir).`);
  if (alvo.comFase > 0) partes.push(`${alvo.comFase} deles tinham fase (balanceamento) — os novos nascem sem fase; balanceie o quadro de novo.`);
  if (alvo.alterados.length || alvo.outros.length) {
    const ficam = [
      alvo.alterados.length ? `${alvo.alterados.length} do motor alterado(s) depois de criado(s) — disjuntor, seção, curva, DR… (${nomes(alvo.alterados)})` : '',
      alvo.outros.length ? `${alvo.outros.length} criado(s) à mão, renomeado(s) ou de antes do registro (${nomes(alvo.outros)})` : '',
    ].filter(Boolean);
    partes.push(`Ficam como estão, com os pontos deles: ${ficam.join('; ')} — a escolha nova não se aplica a eles.`);
  }
  return partes.join(' ');
}

// ─── Regra A: o botão do rodapé ──────────────────────────────────────────────

export const MOTIVO_CIRCUITOS_SEM_REGISTRO =
  'Circuitos criados antes do registro — o motor não sabe quais são dele; refaça-os à mão ou apague os circuitos (Quadro de cargas) para relançar.';

export interface BotaoDosCircuitos {
  /** `CRIAR` = o "Criar N circuito(s)"; `RELANCAR` = o Refazer com as escolhas atuais (sempre com confirmação). */
  modo: 'CRIAR' | 'RELANCAR';
  rotulo: string;
  /** Por que está desligado (`null` = ligado). */
  motivo: string | null;
  /** Há circuitos do motor no pavimento: o "Refazer circuitos automáticos" aparece ao lado do "Criar". */
  podeRefazer: boolean;
}

/**
 * REGRA A: há o que criar → "Criar N circuito(s)"; nada a criar e há circuitos do motor → "Relançar com as escolhas
 * atuais"; nada → desligado, SEMPRE dizendo por quê (sem quadro; circuitos de antes do registro; só circuitos à mão ou
 * alterados; nenhum ponto solto).
 */
export function botaoDosCircuitos(model: BlueprintModel, levelId: ObjectId, plano: Pick<PlanoDeCircuitos, 'circuitos' | 'quadroId' | 'motivo'>): BotaoDosCircuitos {
  const cls = circuitosDoPavimento(model, levelId);
  const podeRefazer = cls.doMotor.length > 0;
  const criar = `Criar ${plano.circuitos.length} circuito(s)`;
  if (plano.circuitos.length > 0) return { modo: 'CRIAR', rotulo: criar, motivo: null, podeRefazer };
  if (podeRefazer) return { modo: 'RELANCAR', rotulo: 'Relançar com as escolhas atuais', motivo: null, podeRefazer };
  const desligado = (motivo: string): BotaoDosCircuitos => ({ modo: 'CRIAR', rotulo: criar, motivo, podeRefazer: false });
  if (!plano.quadroId) return desligado('Nenhum quadro no desenho — coloque um quadro de distribuição (Instalações › Componentes).');
  if (cls.alterados.length > 0) {
    return desligado(
      `Nada a criar: os circuitos do motor neste pavimento foram alterados depois de criados (${nomes(cls.alterados, 2)}) — ficam como estão; para relançar, apague-os (Quadro de cargas).`,
    );
  }
  if (cls.outros.length > 0) {
    return desligado(cls.temRegistro ? 'Nada a criar: os circuitos deste pavimento foram criados à mão ou renomeados — o motor não os refaz.' : MOTIVO_CIRCUITOS_SEM_REGISTRO);
  }
  return desligado('Nada a criar: nenhum ponto elétrico sem circuito neste pavimento.');
}

// ─── Casa Automática ─────────────────────────────────────────────────────────

/**
 * O registro dos circuitos que a CASA AUTOMÁTICA criou num pavimento (`criados` = os ids de circuito que o lote dela
 * acrescentou — pelo motor, nos circuitos do pavimento e nos do ar-condicionado, ambos com as mesmas escolhas). Só
 * entram os circuitos com pontos SÓ neste pavimento. Nenhum → `null`.
 */
export function comandoDeRegistroDosCircuitosCriados(
  model: BlueprintModel,
  levelId: ObjectId,
  criados: ReadonlySet<ObjectId>,
  hip: HipotesesDeCircuitos,
  hipEletricas: Pick<HipotesesEletricas, 'secaoMinimaTueMm2'>,
): Command | null {
  const pavimentos = pavimentosPorCircuito(model);
  const doPavimento = (model.circuitos ?? []).filter((c) => {
    if (!criados.has(c.id)) return false;
    const ps = pavimentos.get(c.id);
    return !!ps && ps.size === 1 && ps.has(levelId);
  });
  if (doPavimento.length === 0) return null;
  return comandoDeRegistro('CIRCUITOS', levelId, {
    ...escolhasDosCircuitos(hip, hipEletricas),
    [CHAVE_DOS_CIRCUITOS_DO_MOTOR]: textoDasAssinaturas(doPavimento.map(assinaturaDoCircuito)),
  });
}
