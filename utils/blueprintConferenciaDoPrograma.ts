/**
 * CONFERÊNCIA DO PROGRAMA (19/09/2026, roadmap E4.3): programa (E4.1) × desenho,
 * pelo grafo espacial (E4.2). Sem bump — tudo derivado.
 *
 * CASAMENTO item ↔ ambiente desenhado: pelo USO que o nome do ambiente sugere
 * (`usoDoNome`, o mesmo casador do grafo). Quando o programa tem mais de um
 * item do mesmo uso ("Banheiro social" e "Banheiro da suíte"), o ambiente cujo
 * nome contém o nome do item (ou vice-versa, sem acento e caixa) vai para ele
 * primeiro; o resto entra na ordem do programa até fechar a quantidade. Um
 * ambiente casa com UM item. Os que sobram são "fora do programa" (INFO — pode
 * ser a circulação sem nome, um depósito a mais; não é erro).
 *
 * POR ITEM: quantidade (faltam N), área útil (face interna, como o painel do
 * ambiente) contra mín/ideal/máx, largura mínima (menor lado da caixa interna,
 * a mesma conta da E3.2), pé-direito (do pavimento), iluminação/ventilação
 * natural (janela numa fachada do ambiente — a porta para fora conta como
 * ventilação), fachada (algum lado dá para fora).
 *
 * POR RELAÇÃO: obrigatória = os dois casados e ligados por PORTA direta;
 * proibida = não dividem parede nem porta; desejável: peso ≥ 7 pede parede ou
 * porta em comum, 4–6 pede percurso de até 2 portas, ≤ 3 é só informação.
 * Item sem ambiente casado (ou casados em pavimentos diferentes) → não
 * avaliada, dizendo o porquê.
 *
 * GERAL: circulação % ≤ `circulacaoMaxPct`; percurso até a saída ≤
 * `percursoMaxM` por ambiente casado (sem saída no pavimento → não avaliada).
 *
 * `linhasParaLegislacao` traduz tudo em `ResultadoDeRegra` com a fonte
 * "Programa de necessidades", para a tela Verificar legislação listar, filtrar
 * e contar junto das demais regras. "Acusa, não trava."
 */
import { areaRecuada, type BlueprintModel, type ObjectId, type Space } from './blueprintKernel';
import { construirGrafoEspacial, percursoAteASaida, percursoEntre, vizinhosDe, type GrafoEspacial } from './blueprintGrafoEspacial';
import { FICHA_DO_USO, usoDoNome, type ItemDoPrograma, type Programa, type RelacaoDoPrograma } from './blueprintPrograma';
import { larguraMinimaMm, type EstadoDaRegra, type Regra, type ResultadoDeRegra, type SeveridadeDaRegra } from './blueprintRegras';
import { etiquetaDoAmbiente } from './blueprintDistribuicao';

export const FONTE_DO_PROGRAMA = 'Programa de necessidades';

export interface VerificacaoDoAmbiente {
  chave: 'AREA_MIN' | 'AREA_IDEAL' | 'AREA_MAX' | 'LARGURA' | 'PE_DIREITO' | 'ILUMINACAO' | 'VENTILACAO' | 'FACHADA' | 'PERCURSO';
  rotulo: string;
  estado: EstadoDaRegra;
  severidade: SeveridadeDaRegra;
  valor: string;
  exigido: string;
  motivo?: string;
}

export interface AmbienteCasado {
  spaceId: ObjectId;
  levelId: ObjectId;
  rotulo: string;
  etiquetaId: ObjectId | null;
  areaUtilM2: number;
  larguraMinM: number;
  peDireitoM: number;
  verificacoes: VerificacaoDoAmbiente[];
}

export interface ItemConferido {
  item: ItemDoPrograma;
  casados: AmbienteCasado[];
  /** quantidade − casados (0 quando fechou). */
  faltam: number;
  /** Casados além da quantidade não acontecem: o casamento para na quantidade. Sobras vão a `foraDoPrograma`. */
  estado: EstadoDaRegra;
}

export interface RelacaoConferida {
  relacao: RelacaoDoPrograma;
  a: ItemDoPrograma;
  b: ItemDoPrograma;
  estado: EstadoDaRegra;
  severidade: SeveridadeDaRegra;
  /** "porta direta", "dividem parede", "2 portas de distância", "vizinhos!" … */
  valor: string;
  motivo: string | null;
  /** Um par de ambientes representativo, para o clique. */
  spaceA: ObjectId | null;
  spaceB: ObjectId | null;
}

export interface ConferenciaDoPrograma {
  itens: ItemConferido[];
  relacoes: RelacaoConferida[];
  circulacao: { pct: number; maxPct: number; estado: EstadoDaRegra };
  /** Ambientes desenhados que nenhum item pediu. */
  foraDoPrograma: { spaceId: ObjectId; levelId: ObjectId; rotulo: string; etiquetaId: ObjectId | null; uso: string | null }[];
  resumo: { atendidos: number; faltas: number; avisos: number; naoAvaliados: number };
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const m2 = (v: number) => `${v.toFixed(2).replace('.', ',')} m²`;
const m = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;

interface AmbienteDoDesenho {
  s: Space;
  uso: ReturnType<typeof usoDoNome>;
  nomeNorm: string;
  grafo: GrafoEspacial;
}

function casar(programa: Programa, ambientes: AmbienteDoDesenho[]): Map<string, AmbienteDoDesenho[]> {
  const livres = new Set(ambientes);
  const porItem = new Map<string, AmbienteDoDesenho[]>();
  // 1ª passada: nome do item ⊂ nome do ambiente ou vice-versa (mesmo uso).
  for (const item of programa.itens) {
    const escolhidos: AmbienteDoDesenho[] = [];
    const nomeItem = normalizar(item.nome);
    const padrao = normalizar(FICHA_DO_USO[item.uso].rotulo);
    if (nomeItem && nomeItem !== padrao) {
      for (const a of livres) {
        if (escolhidos.length >= item.quantidade) break;
        if (a.uso !== item.uso) continue;
        if (a.nomeNorm.includes(nomeItem) || nomeItem.includes(a.nomeNorm)) {
          escolhidos.push(a);
          livres.delete(a);
        }
      }
    }
    porItem.set(item.id, escolhidos);
  }
  // 2ª passada: pelo uso, na ordem do programa.
  for (const item of programa.itens) {
    const escolhidos = porItem.get(item.id)!;
    for (const a of livres) {
      if (escolhidos.length >= item.quantidade) break;
      if (a.uso !== item.uso) continue;
      escolhidos.push(a);
      livres.delete(a);
    }
  }
  return porItem;
}

export function conferirPrograma(model: BlueprintModel, programa: Programa): ConferenciaDoPrograma {
  const grafos = new Map<ObjectId, GrafoEspacial>();
  for (const l of model.levels) grafos.set(l.id, construirGrafoEspacial(model, l.id));
  const ambientes: AmbienteDoDesenho[] = model.spaces
    .filter((s) => s.ring.length >= 3 && grafos.has(s.levelId))
    .map((s) => ({ s, uso: usoDoNome(s.name), nomeNorm: normalizar(s.name ?? ''), grafo: grafos.get(s.levelId)! }));
  const porItem = casar(programa, ambientes);
  const casadosPorSpace = new Set<ObjectId>();

  const itens: ItemConferido[] = programa.itens.map((item) => {
    const casados = (porItem.get(item.id) ?? []).map((a): AmbienteCasado => {
      casadosPorSpace.add(a.s.id);
      const paredes = model.walls.filter((w) => w.levelId === a.s.levelId);
      const nivel = model.levels.find((l) => l.id === a.s.levelId)!;
      const no = a.grafo.nos.find((n) => n.spaceId === a.s.id)!;
      const areaUtilM2 = Math.round(areaRecuada(a.s.ring, paredes).areaMm2 / 10_000) / 100;
      const larguraMinM = Math.round(larguraMinimaMm(a.s, paredes)) / 1000;
      const peDireitoM = nivel.defaultHeightMm / 1000;
      const janelas = no.fachadas.reduce((s, f) => s + f.aberturas.filter((x) => x.kind === 'window').length, 0);
      const portasParaFora = no.fachadas.reduce((s, f) => s + f.aberturas.filter((x) => x.kind !== 'window').length, 0);
      const v: VerificacaoDoAmbiente[] = [];
      v.push({ chave: 'AREA_MIN', rotulo: 'Área mínima', estado: areaUtilM2 + 0.005 >= item.areaMinM2 ? 'CONFORME' : 'VIOLADA', severidade: 'ERRO', valor: m2(areaUtilM2), exigido: `≥ ${m2(item.areaMinM2)}` });
      v.push({ chave: 'AREA_IDEAL', rotulo: 'Área ideal', estado: areaUtilM2 + 0.005 >= item.areaIdealM2 ? 'CONFORME' : 'VIOLADA', severidade: 'AVISO', valor: m2(areaUtilM2), exigido: `≥ ${m2(item.areaIdealM2)}` });
      if (item.areaMaxM2 != null) v.push({ chave: 'AREA_MAX', rotulo: 'Área máxima', estado: areaUtilM2 <= item.areaMaxM2 + 0.005 ? 'CONFORME' : 'VIOLADA', severidade: 'AVISO', valor: m2(areaUtilM2), exigido: `≤ ${m2(item.areaMaxM2)}` });
      v.push({ chave: 'LARGURA', rotulo: 'Largura mínima', estado: larguraMinM * 1000 + 1 >= item.larguraMinMm ? 'CONFORME' : 'VIOLADA', severidade: 'ERRO', valor: m(larguraMinM), exigido: `≥ ${m(item.larguraMinMm / 1000)}` });
      if (item.peDireitoMinMm != null) v.push({ chave: 'PE_DIREITO', rotulo: 'Pé-direito mínimo', estado: nivel.defaultHeightMm >= item.peDireitoMinMm ? 'CONFORME' : 'VIOLADA', severidade: 'ERRO', valor: m(peDireitoM), exigido: `≥ ${m(item.peDireitoMinMm / 1000)}` });
      if (item.exigeIluminacao) v.push({ chave: 'ILUMINACAO', rotulo: 'Iluminação natural', estado: janelas > 0 ? 'CONFORME' : 'VIOLADA', severidade: 'ERRO', valor: `${janelas} janela(s) na fachada`, exigido: '≥ 1 janela' });
      if (item.exigeVentilacao) v.push({ chave: 'VENTILACAO', rotulo: 'Ventilação natural', estado: janelas + portasParaFora > 0 ? 'CONFORME' : 'VIOLADA', severidade: 'ERRO', valor: `${janelas} janela(s), ${portasParaFora} porta(s) para fora`, exigido: '≥ 1 abertura para fora' });
      if (item.exigeFachada) v.push({ chave: 'FACHADA', rotulo: 'Contato com a fachada', estado: no.fachadas.length > 0 ? 'CONFORME' : 'VIOLADA', severidade: 'ERRO', valor: no.fachadas.length ? `${no.fachadas.map((f) => f.orientacao).join(', ')}` : 'nenhum lado dá para fora', exigido: 'algum lado externo' });
      if (programa.percursoMaxM != null) {
        if (a.grafo.saidas.length === 0) v.push({ chave: 'PERCURSO', rotulo: 'Percurso até a saída', estado: 'NAO_AVALIADA', severidade: 'AVISO', valor: '', exigido: `≤ ${m(programa.percursoMaxM)}`, motivo: 'o pavimento não tem porta para o exterior' });
        else {
          const p = percursoAteASaida(a.grafo, a.s.id);
          if (!p) v.push({ chave: 'PERCURSO', rotulo: 'Percurso até a saída', estado: 'NAO_AVALIADA', severidade: 'AVISO', valor: '', exigido: `≤ ${m(programa.percursoMaxM)}`, motivo: 'sem caminho por portas até a saída' });
          else v.push({ chave: 'PERCURSO', rotulo: 'Percurso até a saída', estado: p.mm <= programa.percursoMaxM * 1000 ? 'CONFORME' : 'VIOLADA', severidade: 'AVISO', valor: `${m(p.mm / 1000)} por ${p.portas.length} porta(s)`, exigido: `≤ ${m(programa.percursoMaxM)}` });
        }
      }
      return { spaceId: a.s.id, levelId: a.s.levelId, rotulo: a.s.name || 'Ambiente', etiquetaId: etiquetaDoAmbiente(a.s, model.labels)?.id ?? null, areaUtilM2, larguraMinM, peDireitoM, verificacoes: v };
    });
    const faltam = Math.max(0, item.quantidade - casados.length);
    return { item, casados, faltam, estado: faltam > 0 ? 'VIOLADA' : 'CONFORME' };
  });

  const spacesDoItem = (id: string) => itens.find((i) => i.item.id === id)?.casados ?? [];
  const relacoes: RelacaoConferida[] = programa.relacoes.flatMap((r): RelacaoConferida[] => {
    const a = programa.itens.find((i) => i.id === r.a);
    const b = programa.itens.find((i) => i.id === r.b);
    if (!a || !b) return [];
    const severidade: SeveridadeDaRegra = r.tipo === 'DESEJAVEL' ? (r.peso >= 7 ? 'AVISO' : 'INFO') : 'ERRO';
    const ca = spacesDoItem(a.id);
    const cb = spacesDoItem(b.id);
    const base = { relacao: r, a, b, severidade };
    if (ca.length === 0 || cb.length === 0) {
      const falta = [ca.length === 0 ? a.nome : null, cb.length === 0 ? b.nome : null].filter(Boolean).join(' e ');
      return [{ ...base, estado: 'NAO_AVALIADA' as const, valor: '', motivo: `${falta} sem ambiente casado no desenho`, spaceA: ca[0]?.spaceId ?? null, spaceB: cb[0]?.spaceId ?? null }];
    }
    // Melhor par no mesmo pavimento: o que mais se aproxima do pedido.
    let melhor: { estado: EstadoDaRegra; valor: string; sa: ObjectId; sb: ObjectId } | null = null;
    let algumMesmoNivel = false;
    for (const x of ca) {
      for (const y of cb) {
        if (x.levelId !== y.levelId || x.spaceId === y.spaceId) continue;
        algumMesmoNivel = true;
        const g = grafos.get(x.levelId)!;
        const viz = vizinhosDe(g, x.spaceId).find((v) => v.no?.spaceId === y.spaceId);
        const porta = !!viz?.arestas.some((e) => e.tipo !== 'PAREDE');
        const parede = !!viz?.arestas.some((e) => e.tipo === 'PAREDE');
        const percurso = percursoEntre(g, x.spaceId, y.spaceId);
        const nPortas = percurso ? percurso.portas.length : null;
        let estado: EstadoDaRegra;
        let valor: string;
        if (r.tipo === 'OBRIGATORIA') {
          estado = porta ? 'CONFORME' : 'VIOLADA';
          valor = porta ? 'porta direta' : parede ? 'dividem parede, sem porta' : nPortas != null ? `${nPortas} porta(s) de distância` : 'sem ligação por portas';
        } else if (r.tipo === 'PROIBIDA') {
          estado = porta || parede ? 'VIOLADA' : 'CONFORME';
          valor = porta ? 'porta direta!' : parede ? 'dividem parede!' : 'separados';
        } else if (r.peso >= 7) {
          estado = porta || parede ? 'CONFORME' : 'VIOLADA';
          valor = porta ? 'porta direta' : parede ? 'dividem parede' : nPortas != null ? `${nPortas} porta(s) de distância` : 'sem ligação por portas';
        } else if (r.peso >= 4) {
          estado = porta || parede || (nPortas != null && nPortas <= 2) ? 'CONFORME' : 'VIOLADA';
          valor = porta ? 'porta direta' : parede ? 'dividem parede' : nPortas != null ? `${nPortas} porta(s) de distância` : 'sem ligação por portas';
        } else {
          estado = 'CONFORME';
          valor = porta ? 'porta direta' : parede ? 'dividem parede' : nPortas != null ? `${nPortas} porta(s) de distância` : 'sem ligação por portas';
        }
        const nota = estado === 'CONFORME' ? 2 : 0;
        if (!melhor || nota > (melhor.estado === 'CONFORME' ? 2 : 0)) melhor = { estado, valor, sa: x.spaceId, sb: y.spaceId };
      }
    }
    if (!melhor) return [{ ...base, estado: 'NAO_AVALIADA' as const, valor: '', motivo: algumMesmoNivel ? 'sem par' : 'os ambientes estão em pavimentos diferentes', spaceA: ca[0].spaceId, spaceB: cb[0].spaceId }];
    return [{ ...base, estado: melhor.estado, valor: melhor.valor, motivo: null, spaceA: melhor.sa, spaceB: melhor.sb }];
  });

  let util = 0;
  let circ = 0;
  for (const g of grafos.values()) {
    util += g.areaUtilMm2;
    circ += g.areaCirculacaoMm2;
  }
  const pct = util > 0 ? Math.round((circ / util) * 1000) / 10 : 0;
  const circulacao = { pct, maxPct: programa.circulacaoMaxPct, estado: (util > 0 ? (pct <= programa.circulacaoMaxPct ? 'CONFORME' : 'VIOLADA') : 'NAO_AVALIADA') as EstadoDaRegra };

  const foraDoPrograma = ambientes
    .filter((a) => !casadosPorSpace.has(a.s.id))
    .map((a) => ({ spaceId: a.s.id, levelId: a.s.levelId, rotulo: a.s.name || `Ambiente ${model.spaces.indexOf(a.s) + 1}`, etiquetaId: etiquetaDoAmbiente(a.s, model.labels)?.id ?? null, uso: a.uso ? FICHA_DO_USO[a.uso].rotulo : null }));

  let atendidos = 0;
  let faltas = 0;
  let avisos = 0;
  let naoAvaliados = 0;
  const conta = (estado: EstadoDaRegra, sev: SeveridadeDaRegra) => {
    if (estado === 'CONFORME') atendidos++;
    else if (estado === 'NAO_AVALIADA') naoAvaliados++;
    else if (sev === 'ERRO') faltas++;
    else avisos++;
  };
  for (const i of itens) {
    conta(i.estado, 'ERRO');
    for (const c of i.casados) for (const v of c.verificacoes) conta(v.estado, v.severidade);
  }
  for (const r of relacoes) conta(r.estado, r.severidade);
  if (programa.itens.length > 0) conta(circulacao.estado, 'AVISO');
  return { itens, relacoes, circulacao, foraDoPrograma, resumo: { atendidos, faltas, avisos, naoAvaliados } };
}

/** As linhas que a tela "Verificar legislação" (E3.2) lista, com a fonte "Programa de necessidades". */
export function linhasParaLegislacao(conf: ConferenciaDoPrograma, programa: Programa): ResultadoDeRegra[] {
  const out: ResultadoDeRegra[] = [];
  if (programa.itens.length === 0) return out;
  const regra = (id: string, nome: string, escopo: Regra['escopo'], severidade: SeveridadeDaRegra, descricao?: string): Regra => ({ id, nome, escopo, expressao: '', severidade, fonte: FONTE_DO_PROGRAMA, descricao });
  for (const i of conf.itens) {
    const rq = regra(`prog-qtd-${i.item.id}`, `${i.item.nome}: quantidade`, 'EDIFICACAO', 'ERRO', `${i.item.quantidade} pedido(s)`);
    out.push({ regraId: rq.id, regra: rq, estado: i.estado, alvoId: null, alvoRotulo: 'Edificação', levelId: null, selecionarId: i.casados[0]?.etiquetaId ?? null, valores: `encontrados = ${i.casados.length} · pedidos = ${i.item.quantidade}${i.faltam ? ` · faltam ${i.faltam}` : ''}`, motivo: null });
    for (const c of i.casados) {
      for (const v of c.verificacoes) {
        const r = regra(`prog-${v.chave.toLowerCase()}-${i.item.id}`, `${i.item.nome}: ${v.rotulo.toLowerCase()}`, 'AMBIENTE', v.severidade, v.exigido);
        out.push({ regraId: r.id, regra: r, estado: v.estado, alvoId: c.spaceId, alvoRotulo: c.rotulo, levelId: c.levelId, selecionarId: c.etiquetaId, valores: v.estado === 'NAO_AVALIADA' ? '' : `${v.valor} · exigido ${v.exigido}`, motivo: v.motivo ?? null });
      }
    }
  }
  for (const r of conf.relacoes) {
    const rotuloTipo = r.relacao.tipo === 'OBRIGATORIA' ? 'obrigatória' : r.relacao.tipo === 'PROIBIDA' ? 'proibida' : `peso ${r.relacao.peso}`;
    const rr = regra(`prog-rel-${r.relacao.a}-${r.relacao.b}`, `${r.a.nome} × ${r.b.nome} (${rotuloTipo})`, 'EDIFICACAO', r.severidade);
    const conf2 = conf.itens.find((i) => i.item.id === r.a.id)?.casados.find((c) => c.spaceId === r.spaceA);
    out.push({ regraId: rr.id, regra: rr, estado: r.estado, alvoId: r.spaceA, alvoRotulo: conf2 ? conf2.rotulo : 'Edificação', levelId: conf2?.levelId ?? null, selecionarId: conf2?.etiquetaId ?? null, valores: r.valor, motivo: r.motivo });
  }
  const rc = regra('prog-circulacao', 'Circulação máxima', 'EDIFICACAO', 'AVISO', `≤ ${programa.circulacaoMaxPct} % da área útil`);
  out.push({ regraId: rc.id, regra: rc, estado: conf.circulacao.estado, alvoId: null, alvoRotulo: 'Edificação', levelId: null, selecionarId: null, valores: `circulacao = ${conf.circulacao.pct.toFixed(1).replace('.', ',')} % · máximo = ${conf.circulacao.maxPct} %`, motivo: conf.circulacao.estado === 'NAO_AVALIADA' ? 'sem ambientes fechados' : null });
  for (const f of conf.foraDoPrograma) {
    const rf = regra('prog-fora', 'Ambiente fora do programa', 'AMBIENTE', 'INFO', 'Nenhum item do programa pediu este ambiente');
    out.push({ regraId: rf.id, regra: rf, estado: 'VIOLADA', alvoId: f.spaceId, alvoRotulo: f.rotulo, levelId: f.levelId, selecionarId: f.etiquetaId, valores: f.uso ? `uso lido: ${f.uso}` : 'uso não reconhecido pelo nome', motivo: null });
  }
  return out;
}
