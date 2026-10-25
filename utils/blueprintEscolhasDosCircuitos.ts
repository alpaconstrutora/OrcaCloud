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
 * "do motor, alterado"). Correção 1 (I3): o NÚMERO do nome ("C3 — ") fica fora — "Renumerar circuitos" não muda o
 * circuito. A `fase` fica FORA da assinatura: é do balanceamento do quadro (refazível pelo botão de lá), e
 * a confirmação avisa que os novos nascem sem fase. Os PONTOS também ficam fora: apagar ou mover um ponto não é editar
 * o circuito (e o uid do ponto criado pela casa não sobrevive à reexecução).
 * Circuito com ponto em OUTRO pavimento nunca é do motor deste (o motor só junta pontos de um pavimento).
 * Circuitos criados antes do registro (correção 1, I1 — a planta Garden, 31 circuitos): nenhum é identificável, e o
 * painel oferece "Refazer todos os circuitos deste pavimento" (os com pontos só nele) com uma confirmação FORTE — cada
 * circuito pelo nome, o que estava editado à mão e se perde, os eletrodutos apagados. Antes, o motivo do botão mandava
 * apagar os circuitos no Quadro de cargas: isso deixava os 319 eletrodutos órfãos e o relançar seguinte saía FORA do
 * forro, por cima deles. Nenhum motivo manda apagar circuito.
 *
 * ─── O QUE O REFAZER FAZ ────────────────────────────────────────────────────
 * Num lote só (Ctrl+Z volta tudo): apaga os circuitos do motor (o `DeleteCircuito` do kernel solta os pontos, tira o
 * circuito dos eletrodutos e dos DRs), apaga os ELETRODUTOS que só levavam esses circuitos (e as caixas de passagem dos
 * nós deles) — sem isso, eles ficariam órfãos (sem circuito nenhum): o planejador dos eletrodutos não os vê como rede e
 * lançaria trechos novos por cima deles —, recria os circuitos dos pontos soltos do pavimento com as escolhas atuais e
 * grava o registro. O eletroduto que leva também outro circuito fica (sem os refeitos). Depois, o painel dos eletrodutos
 * mostra os pontos a ligar ("Lançar em todos (N)") — a fiação é derivada dos eletrodutos e acompanha. Correção 1: a rede
 * antiga no forro ganha, no mesmo lote, o registro dos eletrodutos com o forro da casa (o relançar continua no forro); e
 * os DRs são refeitos (os vazios saem; os circuitos novos que pedem DR ganham o da norma).
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
  secaoMinimaDaFuncaoMm2,
  type CriterioDeCircuito,
  type FuncaoDoCircuito,
  type HipotesesDeCircuitos,
  type PlanoDeCircuitos,
} from './blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO, type HipotesesEletricas } from './blueprintEletricaDimensionamento';
import { caixasDaRedeDoQuadro, type HipotesesDeEletroduto } from './blueprintEletrodutos';
import {
  MOTIVO_REDE_NO_FORRO_SEM_REGISTRO,
  escolhasAtuaisDoQuadro,
  forroDaCasaQueVale,
  motivoParaNaoRelancar,
  redeNoForroSemRegistro,
  type ForroDaCasaOuEstado,
} from './blueprintEscolhasDoEletroduto';
import { comandosDasSugestoesDeDR, sugerirDRs } from './blueprintNbr5410';
import {
  TEXTO_NADA_MUDOU,
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

/**
 * O nome SEM o número ("C3 — Iluminação Sala" → "Iluminação Sala"). Correção 1 (I3): "Renumerar circuitos" troca só o
 * número — o circuito continua o mesmo que o motor criou e não pode deixar de ser reconhecido por isso.
 */
const nomeSemNumero = (nome: string) => nome.replace(/^C\s*\d+\s*(?:—|–|-)?\s*/i, '').trim();

/** As duas metades da assinatura: o nome (sem o número) e o resto das propriedades (a `fase` fica fora). */
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
  return { nome: fnv(nomeSemNumero(c.nome)), resto: fnv(JSON.stringify(resto)) };
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
  /**
   * Correção 1 (I1): SEM registro no pavimento, os circuitos com pontos SÓ neste pavimento (pelo menos um) — não se sabe
   * quais o motor criou; o Refazer, com a confirmação forte, refaz todos eles. Com registro: vazio.
   */
  legados: Circuito[];
  /** Os demais com ponto neste pavimento: criados à mão, renomeados, com ponto em outro pavimento — ficam. */
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
 * Classifica os circuitos do pavimento. Com registro: do motor (a assinatura bate inteira), do motor alterados (só o
 * nome bate) e os outros. Sem registro: os legados (pontos só aqui) e os outros. Circuito com ponto em outro pavimento
 * nunca é do motor deste. Correção 1 (M1): circuito SEM ponto só conta como do motor se estiver num quadro dos circuitos
 * do motor que têm ponto aqui — senão a assinatura de um circuito vazio de outro pavimento bateria por acaso.
 */
export function circuitosDoPavimento(model: BlueprintModel, levelId: ObjectId): CircuitosDoPavimento {
  const registro = registroDe(model, 'CIRCUITOS', levelId);
  const assinaturas = new Set(assinaturasDoRegistro(registro?.escolhas));
  const nomes = new Set([...assinaturas].map((a) => a.split('.')[0]));
  const pavimentos = pavimentosPorCircuito(model);
  const out: CircuitosDoPavimento = { temRegistro: !!registro, doMotor: [], alterados: [], legados: [], outros: [] };
  const semPonto: { c: Circuito; inteiro: boolean }[] = [];
  for (const c of model.circuitos ?? []) {
    const ps = pavimentos.get(c.id) ?? new Set<ObjectId>();
    const aqui = ps.has(levelId);
    const soAqui = aqui && ps.size === 1;
    if (!registro) {
      if (soAqui) out.legados.push(c);
      else if (aqui) out.outros.push(c);
      continue;
    }
    const inteiro = assinaturas.has(assinaturaDoCircuito(c));
    const peloNome = !inteiro && nomes.has(metadesDaAssinatura(c).nome);
    if (ps.size === 0) {
      if (inteiro || peloNome) semPonto.push({ c, inteiro });
      continue;
    }
    if (soAqui && inteiro) out.doMotor.push(c);
    else if (soAqui && peloNome) out.alterados.push(c);
    else if (aqui) out.outros.push(c);
  }
  const quadrosDoMotor = new Set([...out.doMotor, ...out.alterados].map((c) => c.quadroId));
  for (const { c, inteiro } of semPonto) if (quadrosDoMotor.has(c.quadroId)) (inteiro ? out.doMotor : out.alterados).push(c);
  return out;
}

/** Os circuitos que o Refazer do pavimento refaz: com registro, os do motor; sem registro, os legados. */
const refaziveis = (cls: CircuitosDoPavimento) => (cls.temRegistro ? cls.doMotor : cls.legados);

/** O quadro dos circuitos a refazer do pavimento (o primeiro) — o padrão do seletor do painel. `null` = nenhum. */
export function quadroDosCircuitosDoMotor(model: BlueprintModel, levelId: ObjectId): ObjectId | null {
  return refaziveis(circuitosDoPavimento(model, levelId))[0]?.quadroId ?? null;
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

/** Correção 1 (M2): os OUTROS pavimentos cujos circuitos do motor foram criados com outras escolhas (os nomes). */
export function pavimentosComDiferenca(model: BlueprintModel, atuais: Record<string, ValorDeEscolha | undefined>, exceto: ObjectId | null): string[] {
  return model.levels.filter((l) => l.id !== exceto && diferencasDosCircuitos(model, l.id, atuais).length > 0).map((l) => l.name);
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

/**
 * Correção 1 (I1): o painel dos eletrodutos, para o Refazer dos circuitos não tirar a rede do forro. A rede antiga no
 * forro (sem registro dos eletrodutos) só é reconhecida enquanto os trechos têm circuito — apagados os circuitos, ela
 * sai de `redeDoQuadro` e o "Lançar em todos" seguinte desce para a cota do painel. Por isso, no MESMO lote e antes de
 * apagar, o Refazer grava o registro dos eletrodutos do quadro COM o forro da casa (`forroDaCasaQueVale`); sem como
 * saber o forro, o Refazer fica bloqueado com o motivo dos eletrodutos.
 */
export interface EletrodutosDoPainel {
  hip: HipotesesDeEletroduto;
  hipEletricas: HipotesesEletricas;
  forroDaCasa?: ForroDaCasaOuEstado;
}

export interface OpcoesDoRefazer {
  hipEletricas?: HipotesesEletricas;
  eletrodutos?: EletrodutosDoPainel | null;
}

/** Um circuito que sai, com o que estava declarado nele à mão e se perde. */
export interface EdicaoQueSePerde {
  nome: string;
  /** "disjuntor 20 A", "seção 4 mm²", "curva C", "DR declarado", "fase R"… */
  oQue: string[];
}

export interface CircuitosARefazer {
  levelId: ObjectId;
  nomeDoPavimento: string;
  /** `MOTOR` = os do motor (há registro); `TODOS` = sem registro, todos os circuitos com pontos só neste pavimento. */
  modo: 'MOTOR' | 'TODOS';
  /** Os circuitos que saem e são recriados. */
  circuitos: Circuito[];
  /** Os pontos desses circuitos (voltam a ser distribuídos). */
  pontos: number;
  /** O que estava declarado à mão nesses circuitos e se perde (só os que têm algo). */
  edicoes: EdicaoQueSePerde[];
  /** Os que ficam: do motor alterados, e os demais com ponto neste pavimento. */
  alterados: Circuito[];
  outros: Circuito[];
  /** Os eletrodutos que SÓ levavam esses circuitos (saem) e as caixas de passagem dos nós deles. */
  trechos: Trecho[];
  caixas: Terminal[];
  /** Eletrodutos que levam esses circuitos E outros — ficam, sem os refeitos. */
  trechosQueFicam: number;
  /** DRs do quadro que citavam algum desses circuitos — os que ficarem vazios saem; os circuitos novos ganham os da norma. */
  drs: number;
  /** Os nomes dos quadros onde eles estavam. */
  quadros: string[];
  /** Os quadros cuja rede está no forro sem registro e que o lote registra com o forro da casa (para relançar nele). */
  quadrosNoForro: string[];
  /** Comandos que o lote põe ANTES de apagar (o registro dos eletrodutos com o forro). */
  antes: Command[];
  /** Por que o Refazer não pode rodar (`null` = pode). */
  bloqueio: string | null;
}

const FUNCOES = new Set(['ILUMINACAO', 'TUG', 'TUE']);

/** O que estava declarado à mão no circuito (o que o motor não põe) — e se perde quando ele é refeito. */
function edicoesDoCircuito(c: Circuito, hipEletricas: HipotesesEletricas): string[] {
  const out: string[] = [];
  if (c.disjuntorA != null) out.push(`disjuntor ${num(c.disjuntorA)} A`);
  if (c.secaoMm2 != null && (!c.tipo || !FUNCOES.has(c.tipo) || c.secaoMm2 !== secaoMinimaDaFuncaoMm2(c.tipo as FuncaoDoCircuito, hipEletricas))) {
    out.push(`seção ${num(c.secaoMm2)} mm²`);
  }
  if (c.secaoNeutroMm2 != null) out.push(`neutro ${num(c.secaoNeutroMm2)} mm²`);
  if (c.secaoPeMm2 != null) out.push(`PE ${num(c.secaoPeMm2)} mm²`);
  if (c.curva != null) out.push(`curva ${c.curva}`);
  if (c.protecaoDR != null) out.push('DR declarado');
  if (c.fase != null) out.push(`fase ${c.fase}`);
  return out;
}

/** O que o Refazer do pavimento apaga, e o que fica — para a confirmação, para o botão e para o lote. */
export function circuitosARefazer(model: BlueprintModel, levelId: ObjectId, opcoes: OpcoesDoRefazer = {}): CircuitosARefazer {
  const hipEletricas = opcoes.hipEletricas ?? HIPOTESES_PADRAO;
  const cls = circuitosDoPavimento(model, levelId);
  const circuitos = refaziveis(cls);
  const ids = new Set(circuitos.map((c) => c.id));
  const eletricos = (model.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && (t.circuitoIds ?? []).some((id) => ids.has(id)));
  const trechos = eletricos.filter((t) => (t.circuitoIds ?? []).every((id) => ids.has(id)));
  const caixas = trechos.length ? caixasDaRedeDoQuadro(model, { id: '' }, trechos) : [];
  const nomeDoQuadro = new Map((model.quadros ?? []).map((q) => [q.id, q.nome]));
  // O forro: a rede dos quadros desses circuitos, no forro e sem registro dos eletrodutos.
  const antes: Command[] = [];
  const quadrosNoForro: string[] = [];
  let bloqueio: string | null = null;
  if (trechos.length) {
    const quadros = [...new Set(circuitos.map((c) => c.quadroId))];
    for (const q of quadros) {
      if (!redeNoForroSemRegistro(model, q)) continue;
      const e = opcoes.eletrodutos;
      if (e && forroDaCasaQueVale(model, q, e.forroDaCasa)) {
        antes.push(comandoDeRegistro('ELETRODUTOS', q, escolhasAtuaisDoQuadro(model, q, e.hip, e.hipEletricas, e.forroDaCasa)));
        quadrosNoForro.push(nomeDoQuadro.get(q) ?? q);
      } else {
        bloqueio ??= `Os eletrodutos de ${nomeDoQuadro.get(q) ?? q} saem com esses circuitos: ${motivoParaNaoRelancar(model, q, e?.forroDaCasa) ?? MOTIVO_REDE_NO_FORRO_SEM_REGISTRO}`;
      }
    }
  }
  return {
    levelId,
    nomeDoPavimento: model.levels.find((l) => l.id === levelId)?.name ?? '',
    modo: cls.temRegistro ? 'MOTOR' : 'TODOS',
    circuitos,
    pontos: (model.terminais ?? []).filter((t) => t.circuitoId != null && ids.has(t.circuitoId)).length,
    edicoes: circuitos.flatMap((c) => {
      const oQue = edicoesDoCircuito(c, hipEletricas);
      return oQue.length ? [{ nome: c.nome, oQue }] : [];
    }),
    alterados: cls.alterados,
    outros: cls.outros,
    trechos,
    caixas,
    trechosQueFicam: eletricos.length - trechos.length,
    drs: (model.quadros ?? []).reduce((n, q) => n + (q.drs ?? []).filter((d) => d.circuitoIds.some((id) => ids.has(id))).length, 0),
    quadros: [...new Set(circuitos.map((c) => nomeDoQuadro.get(c.quadroId) ?? ''))].filter(Boolean),
    quadrosNoForro,
    antes,
    bloqueio,
  };
}

/**
 * REFAZER os circuitos do pavimento (os do motor; sem registro, todos os com pontos só aqui), num lote só (Ctrl+Z volta
 * tudo): o registro dos eletrodutos com o forro (quando a rede antiga está no forro), apaga os eletrodutos que só levavam
 * esses circuitos e as caixas de passagem dos nós deles, apaga os circuitos (os pontos ficam soltos), recria os
 * circuitos dos pontos soltos do pavimento com as escolhas atuais no quadro dado, refaz os DRs (correção 1, I2: os que
 * ficaram vazios saem; os circuitos novos que pedem DR ganham o da norma, como a Casa Automática faz) e grava o
 * registro. Nada a refazer, ou bloqueado: nada. Se nada for recriado, o registro sai. Recusa do kernel → `Error`.
 */
export function comandosDeRefazerCircuitos(
  model: BlueprintModel,
  levelId: ObjectId,
  quadroId: ObjectId | null,
  hip: HipotesesDeCircuitos,
  hipEletricas: HipotesesEletricas,
  eletrodutos?: EletrodutosDoPainel | null,
): { comandos: Command[]; plano: PlanoDeCircuitos | null } {
  const alvo = circuitosARefazer(model, levelId, { hipEletricas, eletrodutos });
  if (!quadroId || alvo.circuitos.length === 0 || alvo.bloqueio) return { comandos: [], plano: null };
  const ids = new Set(alvo.circuitos.map((c) => c.id));
  const remocoes: Command[] = [
    ...alvo.antes,
    ...alvo.trechos.map((t): Command => ({ type: 'DeleteTrecho', trechoId: t.id })),
    ...alvo.caixas.map((x): Command => ({ type: 'DeleteTerminal', terminalId: x.id })),
    ...alvo.circuitos.map((c): Command => ({ type: 'DeleteCircuito', circuitoId: c.id })),
  ];
  const semOsAntigos = applyBatch(model, remocoes).model;
  // Os DRs que citavam algum dos refeitos e ficaram vazios saem (o geral, que vale para o quadro todo, fica).
  const drsVazios: Command[] = [];
  for (const q of model.quadros ?? []) {
    for (const d of q.drs ?? []) {
      if (d.geral || !d.circuitoIds.some((id) => ids.has(id))) continue;
      if (d.circuitoIds.every((id) => ids.has(id))) drsVazios.push({ type: 'DeleteDR', drId: d.id });
    }
  }
  const plano = planejarCircuitos(semOsAntigos, levelId, quadroId, hip, hipEletricas);
  if (plano.comandos.length === 0) {
    return { comandos: [...remocoes, ...drsVazios, { type: 'ApagarRegistroDeLancamento', motor: 'CIRCUITOS', alvoId: levelId }], plano };
  }
  const depois = modeloDepoisDoPlano(semOsAntigos, plano);
  const comDrsVazios = drsVazios.length ? applyBatch(depois, drsVazios).model : depois;
  const novos = new Set(plano.circuitos.map((c) => c.idPrevisto));
  const drs = plano.quadroId ? comandosDasSugestoesDeDR(sugerirDRs(comDrsVazios, plano.quadroId, hipEletricas).filter((s) => novos.has(s.circuitoId))) : [];
  // Os alterados continuam reconhecidos como "do motor, alterados" (a confirmação seguinte ainda os nomeia assim).
  const nomesAlterados = new Set(alvo.alterados.map((c) => metadesDaAssinatura(c).nome));
  const alterados = assinaturasDoRegistro(registroDe(model, 'CIRCUITOS', levelId)?.escolhas).filter((a) => nomesAlterados.has(a.split('.')[0]));
  const escolhas = { ...escolhasDosCircuitos(hip, hipEletricas), [CHAVE_DOS_CIRCUITOS_DO_MOTOR]: textoDasAssinaturas([...alterados, ...assinaturasDoPlano(depois, plano)]) };
  return { comandos: [...remocoes, ...plano.comandos, ...drsVazios, ...drs, comandoDeRegistro('CIRCUITOS', levelId, escolhas)], plano };
}

const nomes = (cs: readonly Circuito[], max = 4) =>
  cs.length <= max ? cs.map((c) => c.nome).join(', ') : `${cs.slice(0, max).map((c) => c.nome).join(', ')}… (+${cs.length - max})`;

export interface ContextoDaConfirmacao {
  /** Quantos circuitos o Refazer recria (o plano sobre o modelo já sem os antigos). */
  novos: number;
  /** O quadro onde eles nascem. */
  quadro: string | null;
  diferencas: readonly DiferencaDeEscolha[];
}

/**
 * A confirmação do Refazer — HONESTA: o que sai e volta, o que se perde (edições à mão), os eletrodutos e a fiação a
 * relançar, os DRs refeitos e o que FICA. Correção 1 (I1): sem registro ("TODOS") é a confirmação FORTE — diz que são
 * todos os circuitos do pavimento e lista cada um pelo nome. Nada a refazer: `null`.
 */
export function textoDaConfirmacaoDosCircuitos(alvo: CircuitosARefazer, ctx: ContextoDaConfirmacao): string | null {
  if (alvo.circuitos.length === 0) return null;
  const partes: string[] = [];
  const pav = alvo.nomeDoPavimento ? `${alvo.nomeDoPavimento}: ` : '';
  const antes = ctx.quadro && alvo.quadros.length > 0 && !(alvo.quadros.length === 1 && alvo.quadros[0] === ctx.quadro) ? ` (antes: ${alvo.quadros.join(', ')})` : '';
  const voltam = `os ${alvo.pontos} ponto(s) deles — inclusive algum que você tenha posto à mão num deles — voltam a ser distribuídos com as escolhas atuais: ${ctx.novos} circuito(s) novo(s)${ctx.quadro ? ` no quadro ${ctx.quadro}${antes}` : ''}`;
  if (alvo.modo === 'TODOS') {
    partes.push(
      `${pav}saem TODOS os ${alvo.circuitos.length} circuito(s) deste pavimento — foram criados antes do registro, e não há como saber quais o motor criou: ${alvo.circuitos.map((c) => c.nome).join(', ')}. E ${voltam}.`,
    );
  } else {
    partes.push(`${pav}saem ${alvo.circuitos.length} circuito(s) do motor (${nomes(alvo.circuitos)}) e ${voltam}.`);
  }
  if (ctx.diferencas.length) partes.push(`O que mudou: ${textoDasDiferencas([...ctx.diferencas])}.`);
  else if (alvo.modo === 'MOTOR') partes.push(TEXTO_NADA_MUDOU);
  if (alvo.edicoes.length) {
    partes.push(`Perdem-se as edições à mão: ${alvo.edicoes.map((e) => `${e.nome} (${e.oQue.join(', ')})`).join('; ')}.`);
  } else if (alvo.modo === 'TODOS') {
    partes.push('Nenhum deles tem disjuntor, seção, DR ou fase editados à mão.');
  }
  if (alvo.trechos.length > 0 || alvo.trechosQueFicam > 0) {
    const sai = alvo.trechos.length
      ? `${alvo.trechos.length} eletroduto(s) que só os levavam são apagados (${alvo.trechos.filter((t) => !t.sugerido).length} confirmado(s))${alvo.caixas.length ? `, com ${alvo.caixas.length} caixa(s) de passagem` : ''}`
      : '';
    const fica = alvo.trechosQueFicam ? `${alvo.trechosQueFicam} eletroduto(s) que levam também outros circuitos ficam, sem eles` : '';
    partes.push(
      `Os eletrodutos e a fiação desses circuitos precisarão ser relançados: ${[sai, fica].filter(Boolean).join('; ')}. Depois, relance os eletrodutos — o painel dos eletrodutos mostra os pontos a ligar.`,
    );
    if (alvo.quadrosNoForro.length) {
      partes.push(`A rede de ${alvo.quadrosNoForro.join(', ')} está no forro: o registro dos eletrodutos guarda o forro da casa, e o relançamento continua nele.`);
    }
  } else {
    partes.push('Esses circuitos ainda não têm eletroduto; ao lançar os eletrodutos, eles saem pelos circuitos novos.');
  }
  if (alvo.drs > 0) partes.push(`Os DRs são refeitos: ${alvo.drs} DR(s) do quadro citavam esses circuitos — os que ficarem vazios saem, e os circuitos novos que pedem DR ganham o de 30 mA da norma.`);
  if (alvo.alterados.length || alvo.outros.length) {
    const ficam = [
      alvo.alterados.length ? `${alvo.alterados.length} do motor alterado(s) depois de criado(s) — disjuntor, seção, curva, DR… (${nomes(alvo.alterados)})` : '',
      alvo.outros.length ? `${alvo.outros.length} criado(s) à mão, renomeado(s) ou com ponto em outro pavimento (${nomes(alvo.outros)})` : '',
    ].filter(Boolean);
    partes.push(`Ficam como estão, com os pontos deles: ${ficam.join('; ')} — a escolha nova não se aplica a eles.`);
  }
  return partes.join(' ');
}

// ─── Regra A: o botão do rodapé ──────────────────────────────────────────────

export interface BotaoDosCircuitos {
  /** `CRIAR` = o "Criar N circuito(s)"; `RELANCAR` = o Refazer com as escolhas atuais (sempre com confirmação). */
  modo: 'CRIAR' | 'RELANCAR';
  rotulo: string;
  /** Por que está desligado (`null` = ligado). */
  motivo: string | null;
  /**
   * Correção 1 (M4): o "Refazer tudo" ao lado do "Criar" (no modo `CRIAR`, sempre à vista) — `null` = ligado; texto = o
   * motivo de estar desligado.
   */
  refazer: string | null;
}

const NADA_A_REFAZER = 'Nada a refazer: nenhum circuito deste pavimento é do motor (criados à mão, renomeados ou com ponto em outro pavimento).';

/**
 * REGRA A: há o que criar → "Criar N circuito(s)" (e "Refazer tudo" ao lado); nada a criar e há o que refazer → com
 * registro, "Relançar com as escolhas atuais"; sem registro (correção 1, I1), "Refazer todos os circuitos deste
 * pavimento" — os dois com confirmação; nada → desligado, SEMPRE dizendo por quê, e NUNCA mandando apagar circuito.
 */
export function botaoDosCircuitos(
  model: BlueprintModel,
  levelId: ObjectId,
  plano: Pick<PlanoDeCircuitos, 'circuitos' | 'quadroId' | 'motivo'>,
  eletrodutos?: EletrodutosDoPainel | null,
): BotaoDosCircuitos {
  // Sem quadro, nada nasce: o Refazer apagaria os circuitos e deixaria os pontos soltos.
  const SEM_QUADRO = 'Nenhum quadro no desenho — coloque um quadro de distribuição (Instalações › Componentes).';
  if (!plano.quadroId) return { modo: 'CRIAR', rotulo: `Criar ${plano.circuitos.length} circuito(s)`, motivo: SEM_QUADRO, refazer: SEM_QUADRO };
  const alvo = circuitosARefazer(model, levelId, { eletrodutos });
  const temOQueRefazer = alvo.circuitos.length > 0;
  const refazer = temOQueRefazer ? alvo.bloqueio : NADA_A_REFAZER;
  const criar = `Criar ${plano.circuitos.length} circuito(s)`;
  if (plano.circuitos.length > 0) return { modo: 'CRIAR', rotulo: criar, motivo: null, refazer };
  if (temOQueRefazer) {
    return { modo: 'RELANCAR', rotulo: alvo.modo === 'MOTOR' ? 'Relançar com as escolhas atuais' : 'Refazer todos os circuitos deste pavimento', motivo: alvo.bloqueio, refazer };
  }
  const desligado = (motivo: string): BotaoDosCircuitos => ({ modo: 'CRIAR', rotulo: criar, motivo, refazer });
  if (alvo.alterados.length > 0) {
    return desligado(`Nada a criar: os circuitos do motor neste pavimento foram alterados depois de criados (${nomes(alvo.alterados, 2)}) — ficam como estão; o motor não refaz circuito alterado à mão.`);
  }
  if (alvo.outros.length > 0) {
    return desligado(
      alvo.modo === 'MOTOR'
        ? 'Nada a criar: os circuitos deste pavimento foram criados à mão ou renomeados — o motor não os refaz.'
        : 'Nada a criar: os circuitos deste pavimento têm pontos também em outro pavimento — o motor não os refaz.',
    );
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
