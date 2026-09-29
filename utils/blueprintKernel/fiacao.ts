/**
 * O MOTOR DE ESQUEMAS DE LIGAÇÃO — a fiação DERIVADA de cada eletroduto (E2.2
 * do roadmap elétrico, 29/09/2026).
 *
 * ─── O QUE ISTO RESOLVE ─────────────────────────────────────────────────────
 *
 * Até aqui o eletroduto guardava uma CONTAGEM de condutores (`Trecho.condutores`)
 * e o tipo de cada um era deduzido só ao desenhar, por uma base fixa da ligação
 * (F-N → fase, neutro, terra). O RETORNO — o fio que volta do interruptor à
 * lâmpada, o que distingue uma planta elétrica de uma lista de tomadas — nunca
 * era calculado: o projetista subia a contagem à mão e o desenho chamava o
 * excedente de retorno. O benchmark contra o AltoQi (29/09/2026) apontou este
 * motor como o maior buraco: sem ele não há metro de fio por tipo, o quadro de
 * cargas não sabe quantos condutores cada circuito tem, e "60 esquemas
 * predefinidos" era uma tabela de três linhas.
 *
 * ─── COMO A FIAÇÃO SE DERIVA ────────────────────────────────────────────────
 *
 * O ESQUEMA de cada ponto é o que ele exige do quadro, pela ligação do circuito
 * (NBR 5410 6.1.5 e a prática de prancha):
 *
 *   tomada / equipamento / dados   F-N: fase, neutro, terra · F-F: 2 fases, terra
 *                                  · trifásico: 3 fases, terra
 *   luz SEM comando                como a tomada
 *   luz COM comando                neutro e terra do quadro; a FASE chega por
 *                                  RETORNO, do interruptor
 *   interruptor                    fase do quadro (só o primeiro da cadeia); o
 *                                  retorno sai dele para a luz
 *   paralelo ↔ paralelo            dois retornos (os "travellers") entre eles;
 *                                  o intermediário fica no meio da cadeia
 *   aterramento, caixa de passagem nada
 *
 * Os condutores CAMINHAM pela rede: o que um ponto exige do quadro passa por
 * todo trecho do caminho ponto → quadro (BFS no grafo dos eletrodutos do
 * circuito — `caminhoEntre`, o mesmo do lançamento); o retorno passa pelos
 * trechos do caminho interruptor → luz (e paralelo → paralelo). Num trecho,
 * fase e neutro de um circuito contam UMA vez por quantos pontos servirem
 * (são os mesmos fios); retornos somam (cada comando é um fio).
 *
 * ─── DECLARADO VENCE, MAS APARECE ───────────────────────────────────────────
 *
 * `Trecho.condutores` continua existindo. Quando está declarado e DIFERE da
 * derivação, vale o declarado (é decisão de quem desenhou) e a composição sai
 * marcada `divergente` — o painel mostra os dois e oferece "usar derivado".
 * Sem declaração, ou igual, vale a derivação. Trecho cujo ponto não está
 * ligado à rede (nenhum caminho) cai na BASE antiga da ligação, e diz isso.
 *
 * Puro: modelo → composição. O canvas, a prancha, o painel do trecho, a
 * ocupação (6.2.11.1.6) e, na E2.3, o quantitativo de fio leem a MESMA lista.
 */
import type { BlueprintModel, Circuito, LigacaoDoCircuito, ObjectId, Terminal, Trecho } from './model';
import { caminhoEntre, comprimentoMm, distanciasDesde, fazerChave, type Aresta, type No } from './grafoDeRede';
import { comandosDoModelo } from './comandos';
import { condutoresDoEletroduto, secoesDosCondutores, type TipoDeCondutor } from './condutores';

export interface CondutorDerivado {
  tipo: TipoDeCondutor;
  circuitoId: ObjectId | null;
  /** A letra do comando, nos retornos. */
  comando?: string;
}

export interface ComposicaoDoTrecho {
  trechoId: ObjectId;
  /** O que se DESENHA e se conta: a derivação, ou a declaração quando ela vence. */
  lista: CondutorDerivado[];
  /** O que o motor derivou (vazio quando nenhum ponto do trecho está ligado à rede). */
  derivados: CondutorDerivado[];
  declarados: number | null;
  origem: 'DERIVADO' | 'DECLARADO' | 'BASE';
  /** Declarado ≠ derivado: os dois aparecem e o projetista escolhe. */
  divergente: boolean;
}

export type ComposicaoDaRede = Map<ObjectId, ComposicaoDoTrecho>;

interface Exigencia {
  fases: number;
  neutro: boolean;
  terra: boolean;
}

const fasesDa = (lig: LigacaoDoCircuito) => (lig === 'FFF' ? 3 : lig === 'FF' ? 2 : 1);
const ehLuz = (t: Terminal) => t.tipoEletrico?.startsWith('ILUMINACAO') ?? false;
const SEM_FIO: ReadonlySet<string> = new Set(['ATERRAMENTO', 'CAIXA_PASSAGEM', 'ENTRADA_SERVICO', 'MEDIDOR']);

/** O que o ponto exige DO QUADRO. `null` = nada (terra, caixa). */
export function exigenciaDoPonto(t: Terminal, lig: LigacaoDoCircuito, luzComComando: boolean, interruptorPrecisaDeFase: boolean): Exigencia | null {
  if (t.tipoEletrico && SEM_FIO.has(t.tipoEletrico)) return null;
  if (t.tipoEletrico === 'INTERRUPTOR') return interruptorPrecisaDeFase ? { fases: 1, neutro: false, terra: false } : null;
  if (ehLuz(t) && luzComComando) return { fases: 0, neutro: true, terra: true };
  return { fases: fasesDa(lig), neutro: lig === 'FN', terra: true };
}

interface Acumulado {
  fases: number;
  neutro: boolean;
  terra: boolean;
  retornos: { comando: string }[];
}

/** A composição de TODA a rede elétrica do desenho. */
export function composicaoDaRede(model: BlueprintModel): ComposicaoDaRede {
  const saida: ComposicaoDaRede = new Map();
  const trechos = (model.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA');
  const circuitos = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  const quadros = new Map((model.quadros ?? []).map((q) => [q.id, q]));
  const chave = fazerChave(model.levels);
  const arestas: Aresta[] = trechos.map((t) => ({
    ref: { existente: t.id },
    de: chave(t.levelId, t.a.x, t.a.y, t.cotaAMm),
    para: chave(t.levelId, t.b.x, t.b.y, t.cotaBMm),
    mm: comprimentoMm(t),
  }));
  const indiceDoTrecho = new Map(trechos.map((t, i) => [t.id, i]));
  const noDoPonto = (t: Terminal): No => chave(t.levelId, t.at.x, t.at.y, t.cotaMm);

  // acumulado[trecho][circuito]
  const acum = new Map<ObjectId, Map<ObjectId, Acumulado>>();
  const acumDe = (trechoId: ObjectId, circuitoId: ObjectId): Acumulado => {
    const porCircuito = acum.get(trechoId) ?? new Map<ObjectId, Acumulado>();
    acum.set(trechoId, porCircuito);
    const a = porCircuito.get(circuitoId) ?? { fases: 0, neutro: false, terra: false, retornos: [] };
    porCircuito.set(circuitoId, a);
    return a;
  };

  /** As arestas do circuito (os trechos que o carregam); vazio → todas. */
  const arestasDo = (c: Circuito): Aresta[] => {
    const proprias = arestas.filter((a) => {
      const t = trechos[indiceDoTrecho.get((a.ref as { existente: ObjectId }).existente)!];
      return (t.circuitoIds ?? []).includes(c.id);
    });
    return proprias.length > 0 ? proprias : arestas;
  };
  const caminho = (de: No, para: No, c: Circuito): ObjectId[] | null => {
    const tentar = (lista: readonly Aresta[]) => {
      const idx = caminhoEntre(de, para, lista);
      return idx ? idx.map((i) => (lista[i].ref as { existente: ObjectId }).existente) : null;
    };
    const proprias = arestasDo(c);
    return tentar(proprias) ?? (proprias === arestas ? null : tentar(arestas));
  };
  const noDoQuadro = (c: Circuito): No | null => {
    const q = quadros.get(c.quadroId);
    return q ? chave(q.levelId, q.at.x, q.at.y, q.cotaMm) : null;
  };

  // ── Os comandos: quem tem retorno, quem precisa de fase ─────────────────
  const terminais = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const comandos = comandosDoModelo(model);
  const luzesComComando = new Set<ObjectId>();
  const interruptoresComFase = new Set<ObjectId>();
  const retornos: { de: Terminal; para: Terminal; quantos: number; letra: string; circuito: Circuito }[] = [];
  for (const cmd of comandos) {
    const luzes = cmd.luzIds.map((id) => terminais.get(id)).filter((t): t is Terminal => !!t);
    const ints = cmd.interruptorIds.map((id) => terminais.get(id)).filter((t): t is Terminal => !!t);
    if (ints.length === 0) continue; // luz sem interruptor: exige fase do quadro, como tomada
    const circuitoId = luzes.find((l) => l.circuitoId)?.circuitoId ?? ints.find((i) => i.circuitoId)?.circuitoId ?? null;
    const c = circuitoId ? circuitos.get(circuitoId) : undefined;
    if (!c) continue;
    for (const l of luzes) luzesComComando.add(l.id);
    // A cadeia dos interruptores, do mais perto do quadro ao mais longe (pela rede).
    const raiz = noDoQuadro(c);
    const dist = raiz ? distanciasDesde(raiz, arestasDo(c)) : new Map<No, number>();
    const ordenados = [...ints].sort((a, b) => (dist.get(noDoPonto(a)) ?? Infinity) - (dist.get(noDoPonto(b)) ?? Infinity));
    interruptoresComFase.add(ordenados[0].id);
    const ehPar = (t: Terminal) => t.interruptor === 'PARALELO' || t.interruptor === 'INTERMEDIARIO';
    const cadeia = ordenados.some(ehPar);
    if (cadeia) {
      for (let k = 0; k + 1 < ordenados.length; k++) retornos.push({ de: ordenados[k], para: ordenados[k + 1], quantos: 2, letra: cmd.letra, circuito: c });
      const ultimo = ordenados[ordenados.length - 1];
      for (const l of luzes) retornos.push({ de: ultimo, para: l, quantos: 1, letra: cmd.letra, circuito: c });
    } else {
      // Interruptores simples com a mesma letra: cada um manda o seu retorno à luz.
      for (const i of ordenados) for (const l of luzes) retornos.push({ de: i, para: l, quantos: 1, letra: cmd.letra, circuito: c });
    }
  }

  // ── O que cada ponto exige do quadro, caminhando pela rede ──────────────
  for (const t of model.terminais ?? []) {
    if (t.disciplina !== 'ELETRICA' || !t.circuitoId) continue;
    const c = circuitos.get(t.circuitoId);
    if (!c) continue;
    const ex = exigenciaDoPonto(t, c.ligacao ?? 'FN', luzesComComando.has(t.id), interruptoresComFase.has(t.id) || !comandos.some((k) => k.interruptorIds.includes(t.id)));
    if (!ex) continue;
    const raiz = noDoQuadro(c);
    if (!raiz) continue;
    const trilha = caminho(noDoPonto(t), raiz, c);
    if (!trilha) continue;
    for (const id of trilha) {
      const a = acumDe(id, c.id);
      a.fases = Math.max(a.fases, ex.fases);
      a.neutro = a.neutro || ex.neutro;
      a.terra = a.terra || ex.terra;
    }
  }
  for (const r of retornos) {
    const trilha = caminho(noDoPonto(r.de), noDoPonto(r.para), r.circuito);
    if (!trilha) continue;
    for (const id of trilha) {
      const a = acumDe(id, r.circuito.id);
      for (let k = 0; k < r.quantos; k++) a.retornos.push({ comando: r.letra });
    }
  }

  // ── A composição de cada trecho ─────────────────────────────────────────
  for (const t of trechos) {
    const porCircuito = acum.get(t.id) ?? new Map<ObjectId, Acumulado>();
    const ordem = [...(t.circuitoIds ?? []), ...[...porCircuito.keys()].filter((id) => !(t.circuitoIds ?? []).includes(id))];
    const derivados: CondutorDerivado[] = [];
    for (const cid of ordem) {
      const a = porCircuito.get(cid);
      if (!a) continue;
      for (let k = 0; k < a.fases; k++) derivados.push({ tipo: 'FASE', circuitoId: cid });
      if (a.neutro) derivados.push({ tipo: 'NEUTRO', circuitoId: cid });
      for (const r of a.retornos) derivados.push({ tipo: 'RETORNO', circuitoId: cid, comando: r.comando });
      if (a.terra) derivados.push({ tipo: 'TERRA', circuitoId: cid });
    }
    const declarados = t.condutores ?? null;
    const circuitosDoTrecho = (t.circuitoIds ?? []).map((id) => circuitos.get(id)).filter((c): c is Circuito => !!c);
    // A BASE antiga: com contagem declarada, a repartição de sempre
    // (`condutoresDoEletroduto`); sem contagem, a base por ligação de cada
    // circuito — F N T, F F T, F F F T — sem depender de contagem nenhuma.
    const base = (): CondutorDerivado[] =>
      declarados != null
        ? condutoresDoEletroduto(t, circuitosDoTrecho.map((c) => ({ id: c.id, ligacao: c.ligacao ?? null }))).map((c) => ({ tipo: c.tipo, circuitoId: c.circuitoId }))
        : circuitosDoTrecho.flatMap((c) => {
            const lig = c.ligacao ?? 'FN';
            const fases: CondutorDerivado[] = Array.from({ length: fasesDa(lig) }, () => ({ tipo: 'FASE' as const, circuitoId: c.id }));
            return [...fases, ...(lig === 'FN' ? [{ tipo: 'NEUTRO' as const, circuitoId: c.id }] : []), { tipo: 'TERRA' as const, circuitoId: c.id }];
          });
    if (derivados.length === 0) {
      saida.set(t.id, { trechoId: t.id, lista: base(), derivados, declarados, origem: 'BASE', divergente: false });
      continue;
    }
    if (declarados != null && declarados !== derivados.length) {
      saida.set(t.id, { trechoId: t.id, lista: base(), derivados, declarados, origem: 'DECLARADO', divergente: true });
      continue;
    }
    saida.set(t.id, { trechoId: t.id, lista: derivados, derivados, declarados, origem: 'DERIVADO', divergente: false });
  }
  return saida;
}

/** A composição de UM trecho — conveniência para quem só tem um; quem itera use `composicaoDaRede`. */
export function composicaoDoTrecho(model: BlueprintModel, trecho: Trecho): ComposicaoDoTrecho | null {
  return composicaoDaRede(model).get(trecho.id) ?? null;
}

const SIGLA: Record<TipoDeCondutor, string> = { FASE: 'F', NEUTRO: 'N', RETORNO: 'R', TERRA: 'T' };

/** "C1: F N 2R T · C2: 2F T" — para o painel e o memorial. */
export function resumoDaComposicao(lista: readonly CondutorDerivado[], nomeDoCircuito: (id: ObjectId | null) => string): string {
  const grupos = new Map<ObjectId | null, CondutorDerivado[]>();
  for (const c of lista) grupos.set(c.circuitoId, [...(grupos.get(c.circuitoId) ?? []), c]);
  return [...grupos.entries()]
    .map(([cid, cs]) => {
      const contagem = new Map<TipoDeCondutor, number>();
      for (const c of cs) contagem.set(c.tipo, (contagem.get(c.tipo) ?? 0) + 1);
      const partes = (['FASE', 'NEUTRO', 'RETORNO', 'TERRA'] as TipoDeCondutor[])
        .filter((tipo) => contagem.has(tipo))
        .map((tipo) => `${(contagem.get(tipo) ?? 0) > 1 ? contagem.get(tipo) : ''}${SIGLA[tipo]}`);
      return `${nomeDoCircuito(cid)}: ${partes.join(' ')}`;
    })
    .join(' · ');
}

// ─── FIAÇÃO NA PLANTA E NO QUADRO DE CARGAS (E2.4, 29/09/2026) ──────────────

/**
 * Acima de tantos condutores os traços da NBR 5444 viram mancha no trecho: a
 * planta passa a escrever um NÚMERO no eletroduto e a folha traz a tabela com a
 * fiação de cada trecho numerado. HIPÓTESE de prancha (não é norma): seis é o
 * que ainda se lê em Ø25 a 1:50.
 */
export const LIMITE_DE_CONDUTORES_DESENHADOS = 6;

export interface TrechoNumerado {
  trechoId: ObjectId;
  levelId: ObjectId;
  /** O `Trecho.rotulo` quando há; senão um número sequencial por pavimento, na ordem dos ids. */
  rotulo: string;
  condutores: number;
  lista: CondutorDerivado[];
}

/**
 * Os eletrodutos com MAIS condutores que o limite, cada um com o seu rótulo.
 * O rótulo do projetista (`Trecho.rotulo`) vence; sem ele, "1", "2", … por
 * pavimento, na ordem dos ids — estável enquanto não se cria trecho cheio novo.
 */
export function trechosNumerados(model: BlueprintModel, fiacao: ComposicaoDaRede = composicaoDaRede(model), limite = LIMITE_DE_CONDUTORES_DESENHADOS): Map<ObjectId, TrechoNumerado> {
  const saida = new Map<ObjectId, TrechoNumerado>();
  const ordem = model.levels.map((l) => l.id);
  const cheios = (model.trechos ?? [])
    .filter((t) => t.disciplina === 'ELETRICA' && (fiacao.get(t.id)?.lista.length ?? 0) > limite)
    .sort((a, b) => ordem.indexOf(a.levelId) - ordem.indexOf(b.levelId) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const contador = new Map<ObjectId, number>();
  for (const t of cheios) {
    const lista = fiacao.get(t.id)?.lista ?? [];
    let rotulo = t.rotulo?.trim() || '';
    if (!rotulo) {
      const n = (contador.get(t.levelId) ?? 0) + 1;
      contador.set(t.levelId, n);
      rotulo = String(n);
    }
    saida.set(t.id, { trechoId: t.id, levelId: t.levelId, rotulo, condutores: lista.length, lista });
  }
  return saida;
}

/**
 * A composição de um trecho COM a seção de cada condutor, por circuito:
 * "C1: F N 2R T 2,5 mm² · C2: 3F T 50 mm² (PE 25)". É a linha da tabela dos
 * trechos numerados e o texto do painel do trecho.
 */
export function resumoComSecoes(lista: readonly CondutorDerivado[], circuitoPorId: ReadonlyMap<ObjectId, Circuito>): string {
  const grupos = new Map<ObjectId | null, CondutorDerivado[]>();
  for (const c of lista) grupos.set(c.circuitoId, [...(grupos.get(c.circuitoId) ?? []), c]);
  return [...grupos.entries()]
    .map(([cid, cs]) => {
      const c = cid ? circuitoPorId.get(cid) : undefined;
      const siglas = resumoDaComposicao(cs, () => '').replace(/^: /, '');
      const sec = secoesDosCondutores(c ?? {}, c?.secaoMm2 ?? null);
      const partes: string[] = [];
      if (sec.faseMm2 != null) partes.push(`${mm2(sec.faseMm2)} mm²`);
      const extras: string[] = [];
      if (sec.neutroMm2 != null && sec.neutroMm2 !== sec.faseMm2 && cs.some((x) => x.tipo === 'NEUTRO')) extras.push(`N ${mm2(sec.neutroMm2)}`);
      if (sec.peMm2 != null && sec.peMm2 !== sec.faseMm2 && cs.some((x) => x.tipo === 'TERRA')) extras.push(`PE ${mm2(sec.peMm2)}`);
      if (extras.length) partes.push(`(${extras.join(' · ')})`);
      return `${c?.nome ?? '?'}: ${siglas}${partes.length ? ` ${partes.join(' ')}` : ''}`;
    })
    .join(' · ');
}

/** As linhas da tabela "Fiação dos trechos numerados" da folha, uma por trecho. */
export function linhasDosTrechosNumerados(model: BlueprintModel, fiacao: ComposicaoDaRede = composicaoDaRede(model), limite = LIMITE_DE_CONDUTORES_DESENHADOS): { rotulo: string; pavimento: string; condutores: number; descricao: string }[] {
  const circuitoPorId = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  const nomeDoNivel = new Map(model.levels.map((l) => [l.id, l.name]));
  return [...trechosNumerados(model, fiacao, limite).values()].map((n) => ({
    rotulo: n.rotulo,
    pavimento: nomeDoNivel.get(n.levelId) ?? '?',
    condutores: n.condutores,
    descricao: resumoComSecoes(n.lista, circuitoPorId),
  }));
}

/**
 * Os CONDUTORES de um circuito como o quadro de cargas os lista: os que saem
 * do quadro pela ligação ("F+N+T", "2F+T", "3F+T") com a seção da fase, o PE e
 * o neutro quando diferem (Tab. 58 / 6.2.6.2 ou declarados) e quantos COMANDOS
 * o circuito serve (cada um é um retorno a mais em algum trecho — pela fiação
 * derivada). A fase é a declarada ou a que quem chama calculou.
 */
export function condutoresDoCircuito(
  circuito: Pick<Circuito, 'id' | 'ligacao' | 'secaoNeutroMm2' | 'secaoPeMm2'>,
  faseMm2: number | null,
  fiacao: ComposicaoDaRede | null,
): { texto: string; comandos: number } {
  const lig = circuito.ligacao ?? 'FN';
  const saida = lig === 'FFF' ? '3F+T' : lig === 'FF' ? '2F+T' : 'F+N+T';
  const sec = secoesDosCondutores(circuito, faseMm2);
  const partes = [saida];
  if (sec.faseMm2 != null) partes.push(`${mm2(sec.faseMm2)} mm²`);
  const extras: string[] = [];
  if (lig === 'FN' && sec.neutroMm2 != null && sec.neutroMm2 !== sec.faseMm2) extras.push(`N ${mm2(sec.neutroMm2)}`);
  if (sec.peMm2 != null && sec.peMm2 !== sec.faseMm2) extras.push(`PE ${mm2(sec.peMm2)}`);
  if (extras.length) partes.push(`(${extras.join(' · ')})`);
  const letras = new Set<string>();
  if (fiacao) for (const comp of fiacao.values()) for (const c of comp.lista) if (c.circuitoId === circuito.id && c.tipo === 'RETORNO' && c.comando) letras.add(c.comando);
  const comandos = letras.size;
  if (comandos > 0) partes.push(`· ${comandos} comando${comandos > 1 ? 's' : ''}`);
  return { texto: partes.join(' '), comandos };
}

function mm2(v: number): string {
  return String(v).replace('.', ',');
}
