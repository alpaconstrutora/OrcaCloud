/**
 * CAMADAS POR DISCIPLINA (04/10/2026) — a parte PURA.
 *
 * Pedido: *"cada um destes módulos (eletrico, hidraulico, terreno, incendio,
 * mecanica) fossem criados como se fossem camadas e que pudessem ser
 * exibir/ocultar … para verificar interferencias ele poderia exibir uma, duas
 * ou quantas ele quiser"*. Plano: `docs/planos/2026-10-04-planta-camadas-por-disciplina.md`.
 *
 * Toda peça do modelo cai em UMA camada, decidida aqui e em nenhum outro lugar
 * (canvas, 3D, contagem do painel e filtro de conflitos leem a mesma
 * classificação). A disciplina das redes já é dado do kernel (`Trecho`,
 * `Terminal`, `Nucleo.disciplina`); o resto se classifica pela coleção em que
 * a peça mora.
 *
 * É configuração de LEITURA, como os templates de vista: nada aqui vira
 * comando, entra no histórico ou muda quantitativo. Por isso o estado é
 * guardado por NOME de camada (persistir é seguro), ao contrário dos ids de
 * peça de `ocultosNoDesenho`, que não sobrevivem a troca de versão.
 */
import type { BlueprintModel, DisciplinaDeRede, ObjectId } from './blueprintKernel';
import { categoriaDoPonto, categoriaDoTrecho, categoriasDosCircuitos } from './blueprintRecorteEletrico';

export type Camada =
  | 'ARQUITETURA'
  | 'ESTRUTURA'
  | 'TERRENO'
  | 'ELETRICA_ILUMINACAO'
  | 'ELETRICA_FORCA'
  | 'AGUA_FRIA'
  | 'AGUA_QUENTE'
  | 'ESGOTO'
  | 'PLUVIAL'
  | 'INCENDIO'
  | 'MECANICA';

export type EstadoDaCamada = 'VISIVEL' | 'ATENUADA' | 'OCULTA';
export const ESTADOS_DA_CAMADA: readonly EstadoDaCamada[] = ['VISIVEL', 'ATENUADA', 'OCULTA'];
export type EstadosDasCamadas = Record<Camada, EstadoDaCamada>;

export type GrupoDeCamadas = 'ARQUITETURA' | 'ESTRUTURA' | 'TERRENO' | 'ELETRICA' | 'HIDRAULICA' | 'INCENDIO' | 'MECANICA';

export interface DefinicaoDoGrupo {
  id: GrupoDeCamadas;
  rotulo: string;
  /** Uma camada só = grupo sem subcamadas (a linha do grupo é a da camada). */
  camadas: readonly Camada[];
  /** O marcador de cor da linha no painel. */
  cor: string;
}

/**
 * Os grupos, na ordem do painel: a base (o que se constrói), o terreno, e as
 * instalações na ordem das abas do ribbon.
 */
export const GRUPOS_DE_CAMADAS: readonly DefinicaoDoGrupo[] = [
  { id: 'ARQUITETURA', rotulo: 'Arquitetura', camadas: ['ARQUITETURA'], cor: '#475569' },
  { id: 'ESTRUTURA', rotulo: 'Estrutura', camadas: ['ESTRUTURA'], cor: '#78716c' },
  { id: 'TERRENO', rotulo: 'Terreno', camadas: ['TERRENO'], cor: '#65a30d' },
  { id: 'ELETRICA', rotulo: 'Elétrica', camadas: ['ELETRICA_ILUMINACAO', 'ELETRICA_FORCA'], cor: '#d97706' },
  { id: 'HIDRAULICA', rotulo: 'Hidráulica', camadas: ['AGUA_FRIA', 'AGUA_QUENTE', 'ESGOTO', 'PLUVIAL'], cor: '#2563eb' },
  { id: 'INCENDIO', rotulo: 'Incêndio', camadas: ['INCENDIO'], cor: '#dc2626' },
  { id: 'MECANICA', rotulo: 'Mecânica', camadas: ['MECANICA'], cor: '#0d9488' },
];

export const CAMADAS: readonly Camada[] = GRUPOS_DE_CAMADAS.flatMap((g) => g.camadas);

export const ROTULO_DA_CAMADA: Record<Camada, string> = {
  ARQUITETURA: 'Arquitetura',
  ESTRUTURA: 'Estrutura',
  TERRENO: 'Terreno',
  ELETRICA_ILUMINACAO: 'Iluminação',
  ELETRICA_FORCA: 'Tomadas e força',
  AGUA_FRIA: 'Água fria',
  AGUA_QUENTE: 'Água quente',
  ESGOTO: 'Esgoto',
  PLUVIAL: 'Águas pluviais',
  INCENDIO: 'Incêndio',
  MECANICA: 'Mecânica',
};

/** O que cada camada abrange — o `title` da linha no painel. */
export const AJUDA_DA_CAMADA: Record<Camada, string> = {
  ARQUITETURA: 'Paredes, esquadrias, ambientes, cobertura, escadas, guarda-corpos, rodapés, vagas, mobiliário e louças, elevador e shaft geral.',
  ESTRUTURA: 'Pilares, vigas, lajes e fundações (estacas, blocos, vigas baldrame) — e a armadura no 3D.',
  TERRENO: 'Lote e divisas, loteamento (quadras, lotes, vias, áreas públicas), massa, pisos externos, curvas de nível, terraplenagem e envelope.',
  ELETRICA_ILUMINACAO: 'Luminárias, interruptores e os eletrodutos que só os servem.',
  ELETRICA_FORCA: 'Tomadas, TUE, ligação direta, equipamentos, dados e entrada, com os eletrodutos que só os servem.',
  AGUA_FRIA: 'Tubulação, pontos, reservatórios e conexões de água fria.',
  AGUA_QUENTE: 'Tubulação, pontos, aquecedores e conexões de água quente.',
  ESGOTO: 'Tubulação, pontos, caixas e conexões de esgoto.',
  PLUVIAL: 'Calhas, condutores e caixas de areia.',
  INCENDIO: 'Rede de hidrantes e sprinklers, bombas, VGA, preventivos (extintores, placas, detectores) e áreas de operação.',
  MECANICA: 'Dutos e difusores, shaft mecânico e reservas de climatização (condensadora, evaporadora, exaustor).',
};

/** Quadros, caixas de passagem e eletrodutos compartilhados: servem às duas subcamadas elétricas. */
export type Pertenca = Camada | 'ELETRICA_COMUM';

export const ESTADOS_PADRAO: EstadosDasCamadas = Object.fromEntries(CAMADAS.map((c) => [c, 'VISIVEL'])) as EstadosDasCamadas;

/** A camada de uma rede pela disciplina. Elétrica depende do tipo do ponto/circuito — fica de fora. */
const CAMADA_DA_DISCIPLINA: Record<Exclude<DisciplinaDeRede, 'ELETRICA'>, Camada> = {
  AGUA_FRIA: 'AGUA_FRIA',
  AGUA_QUENTE: 'AGUA_QUENTE',
  ESGOTO: 'ESGOTO',
  PLUVIAL: 'PLUVIAL',
  INCENDIO: 'INCENDIO',
  MECANICA: 'MECANICA',
  // Climatização E3.2 (0.92.0): linha e dreno são da mesma camada do duto e das reservas.
  FRIGORIGENA: 'MECANICA',
  DRENO_AC: 'MECANICA',
};

const pertencaEletrica = (c: 'COMUM' | 'ILUMINACAO' | 'FORCA'): Pertenca =>
  c === 'ILUMINACAO' ? 'ELETRICA_ILUMINACAO' : c === 'FORCA' ? 'ELETRICA_FORCA' : 'ELETRICA_COMUM';

/**
 * id → camada de TODA peça desenhável do modelo. Fica de fora (sempre visível)
 * o que é referência, não disciplina: pavimentos, cortes, eixos, anotações,
 * vistas dependentes, etapas, unidades e grupos.
 */
export function classificarPecas(model: BlueprintModel): Map<ObjectId, Pertenca> {
  const m = new Map<ObjectId, Pertenca>();
  const por = (lista: readonly { id: ObjectId }[] | undefined, p: Pertenca) => {
    for (const x of lista ?? []) m.set(x.id, p);
  };

  // ARQUITETURA — o que se constrói e não é estrutura.
  por(model.walls, 'ARQUITETURA');
  por(model.openings, 'ARQUITETURA');
  por(model.spaces, 'ARQUITETURA');
  por(model.labels, 'ARQUITETURA');
  por(model.roofs, 'ARQUITETURA');
  por(model.stairs, 'ARQUITETURA');
  por(model.guardaCorpos, 'ARQUITETURA');
  por(model.rodapes, 'ARQUITETURA');
  por(model.vagas, 'ARQUITETURA');
  // A reserva de climatização é o LUGAR do equipamento mecânico (E11.1) — o
  // mesmo critério de `ehReservaDeEquipamento`.
  for (const c of model.componentes ?? []) m.set(c.id, c.familia === 'CLIMATIZACAO' ? 'MECANICA' : 'ARQUITETURA');
  // Shaft com disciplina vai para ela; sem disciplina (geral) e elevador são arquitetura.
  for (const n of model.nucleos ?? []) {
    const d = n.tipo === 'SHAFT' ? n.disciplina : null;
    m.set(n.id, d && d !== 'ELETRICA' ? CAMADA_DA_DISCIPLINA[d] : 'ARQUITETURA');
  }

  por(model.structures, 'ESTRUTURA');

  // TERRENO — o lote, o loteamento, a massa e a implantação.
  // Os vértices nomeados (A1) não têm id: são o nome de um ponto da divisa e
  // somem com ela.
  por(model.boundaries, 'TERRENO');
  por(model.quadras, 'TERRENO');
  por(model.lotes, 'TERRENO');
  por(model.vias, 'TERRENO');
  por(model.areasPublicas, 'TERRENO');
  por(model.blocos, 'TERRENO');
  por(model.subRegioes, 'TERRENO');

  // A área de operação dos sprinklers (NBR 10897) é peça do incêndio.
  por(model.areasDeOperacao, 'INCENDIO');

  // REDES — pela disciplina; a elétrica pela categoria do recorte (E5.1).
  const porCircuito = categoriasDosCircuitos(model);
  for (const t of model.trechos ?? []) {
    m.set(t.id, t.disciplina === 'ELETRICA' ? pertencaEletrica(categoriaDoTrecho(t, porCircuito)) : CAMADA_DA_DISCIPLINA[t.disciplina]);
  }
  for (const t of model.terminais ?? []) {
    m.set(t.id, t.disciplina === 'ELETRICA' ? pertencaEletrica(categoriaDoPonto(t.tipoEletrico)) : CAMADA_DA_DISCIPLINA[t.disciplina]);
  }
  por(model.quadros, 'ELETRICA_COMUM');
  por(model.circuitos, 'ELETRICA_COMUM');
  return m;
}

const VISIBILIDADE: Record<EstadoDaCamada, number> = { VISIVEL: 2, ATENUADA: 1, OCULTA: 0 };
const maisVisivel = (a: EstadoDaCamada, b: EstadoDaCamada): EstadoDaCamada => (VISIBILIDADE[a] >= VISIBILIDADE[b] ? a : b);

/**
 * O estado em que a peça aparece. O comum elétrico segue a subcamada MAIS
 * visível — é a regra do recorte (E5.1): quadro e caixa ficam enquanto houver
 * planta elétrica na tela.
 */
export function estadoDaPertenca(p: Pertenca, estados: EstadosDasCamadas): EstadoDaCamada {
  if (p === 'ELETRICA_COMUM') return maisVisivel(estados.ELETRICA_ILUMINACAO, estados.ELETRICA_FORCA);
  return estados[p];
}

export function definicaoDoGrupo(id: GrupoDeCamadas): DefinicaoDoGrupo {
  return GRUPOS_DE_CAMADAS.find((g) => g.id === id)!;
}

/** O estado do grupo: o das subcamadas quando todas concordam; senão `MISTO`. */
export function estadoDoGrupo(id: GrupoDeCamadas, estados: EstadosDasCamadas): EstadoDaCamada | 'MISTO' {
  const s = new Set(definicaoDoGrupo(id).camadas.map((c) => estados[c]));
  return s.size === 1 ? [...s][0] : 'MISTO';
}

/**
 * O estado de um overlay que não é peça (curvas de nível, armadura 3D,
 * marcas da rede): o mais visível entre as camadas do grupo — com qualquer
 * subcamada à vista, o que é do grupo aparece.
 */
export function estadoDoOverlay(id: GrupoDeCamadas, estados: EstadosDasCamadas): EstadoDaCamada {
  return definicaoDoGrupo(id).camadas.map((c) => estados[c]).reduce(maisVisivel);
}

export interface IdsPorEstado {
  ocultos: Set<ObjectId>;
  atenuados: Set<ObjectId>;
}

export function idsPorEstado(classificacao: ReadonlyMap<ObjectId, Pertenca>, estados: EstadosDasCamadas): IdsPorEstado {
  const ocultos = new Set<ObjectId>();
  const atenuados = new Set<ObjectId>();
  if (CAMADAS.every((c) => estados[c] === 'VISIVEL')) return { ocultos, atenuados };
  for (const [id, p] of classificacao) {
    const e = estadoDaPertenca(p, estados);
    if (e === 'OCULTA') ocultos.add(id);
    else if (e === 'ATENUADA') atenuados.add(id);
  }
  return { ocultos, atenuados };
}

export type ContagemDasCamadas = Record<Camada, number> & { ELETRICA_COMUM: number };

/** Nível de cada peça, para a contagem por pavimento (esquadria herda o da parede). */
function nivelDasPecas(model: BlueprintModel): Map<ObjectId, ObjectId | null> {
  const m = new Map<ObjectId, ObjectId | null>();
  const nivelDaParede = new Map(model.walls.map((w) => [w.id, w.levelId]));
  for (const lista of Object.values(model as unknown as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    for (const x of lista as { id?: string; levelId?: string; wallId?: string }[]) {
      if (!x || typeof x !== 'object' || !x.id) continue;
      m.set(x.id, x.levelId ?? (x.wallId ? nivelDaParede.get(x.wallId) ?? null : null));
    }
  }
  return m;
}

/**
 * Quantas peças cada camada tem nos pavimentos pedidos (`null` = o estudo
 * todo). Peça sem pavimento (circuito, eixo do loteamento) conta em qualquer
 * recorte — não há pavimento em que ela não esteja.
 */
export function contagemPorCamada(model: BlueprintModel, classificacao: ReadonlyMap<ObjectId, Pertenca>, levelIds: readonly ObjectId[] | null): ContagemDasCamadas {
  const saida = Object.fromEntries([...CAMADAS, 'ELETRICA_COMUM'].map((c) => [c, 0])) as ContagemDasCamadas;
  const niveis = levelIds ? new Set(levelIds) : null;
  const nivelDe = niveis ? nivelDasPecas(model) : null;
  for (const [id, p] of classificacao) {
    if (niveis && nivelDe) {
      const n = nivelDe.get(id);
      if (n && !niveis.has(n)) continue;
    }
    saida[p] += 1;
  }
  return saida;
}

/** Peças do grupo (com o comum elétrico na Elétrica). */
export function contagemDoGrupo(id: GrupoDeCamadas, contagem: ContagemDasCamadas): number {
  const base = definicaoDoGrupo(id).camadas.reduce((s, c) => s + contagem[c], 0);
  return id === 'ELETRICA' ? base + contagem.ELETRICA_COMUM : base;
}

export type AlvoDeCamada = Camada | GrupoDeCamadas;

const camadasDoAlvo = (alvo: AlvoDeCamada): readonly Camada[] => {
  const g = GRUPOS_DE_CAMADAS.find((x) => x.id === alvo);
  return g ? g.camadas : [alvo as Camada];
};

function comEstado(estados: EstadosDasCamadas, camadas: readonly Camada[], e: EstadoDaCamada): EstadosDasCamadas {
  const saida = { ...estados };
  for (const c of camadas) saida[c] = e;
  return saida;
}

/**
 * O OLHO: tudo oculto → visível; qualquer outra coisa → oculto. Atenuada conta
 * como "à vista" — o olho de uma camada atenuada esconde.
 */
export function alternarVisibilidade(estados: EstadosDasCamadas, alvo: AlvoDeCamada): EstadosDasCamadas {
  const cs = camadasDoAlvo(alvo);
  const todasOcultas = cs.every((c) => estados[c] === 'OCULTA');
  return comEstado(estados, cs, todasOcultas ? 'VISIVEL' : 'OCULTA');
}

/** O MEIO-TOM: todas atenuadas → visíveis; senão → atenuadas (inclusive as ocultas, que voltam à tela em meio-tom). */
export function alternarAtenuacao(estados: EstadosDasCamadas, alvo: AlvoDeCamada): EstadosDasCamadas {
  const cs = camadasDoAlvo(alvo);
  const todasAtenuadas = cs.every((c) => estados[c] === 'ATENUADA');
  return comEstado(estados, cs, todasAtenuadas ? 'VISIVEL' : 'ATENUADA');
}

export function definirTodas(e: EstadoDaCamada): EstadosDasCamadas {
  return comEstado(ESTADOS_PADRAO, CAMADAS, e);
}

/**
 * ISOLAR: só o alvo visível. Com `baseAtenuada`, a arquitetura fica em
 * meio-tom como referência (não se lê uma rede de esgoto sem as paredes) —
 * a menos que o alvo seja a própria arquitetura.
 */
export function isolar(alvo: AlvoDeCamada, opcoes: { baseAtenuada: boolean }): EstadosDasCamadas {
  const saida = comEstado(definirTodas('OCULTA'), camadasDoAlvo(alvo), 'VISIVEL');
  if (opcoes.baseAtenuada && saida.ARQUITETURA === 'OCULTA') saida.ARQUITETURA = 'ATENUADA';
  return saida;
}

export function estadosIguais(a: EstadosDasCamadas, b: EstadosDasCamadas): boolean {
  return CAMADAS.every((c) => a[c] === b[c]);
}

/** O alvo isolado agora (o estado é EXATAMENTE o de `isolar(alvo)`), ou `null`. */
export function alvoIsolado(estados: EstadosDasCamadas, opcoes: { baseAtenuada: boolean }): AlvoDeCamada | null {
  if (estadosIguais(estados, ESTADOS_PADRAO)) return null;
  for (const g of GRUPOS_DE_CAMADAS) {
    if (estadosIguais(estados, isolar(g.id, opcoes))) return g.id;
    if (g.camadas.length > 1) for (const c of g.camadas) if (estadosIguais(estados, isolar(c, opcoes))) return c;
  }
  return null;
}

/** Saneia o que vem do navegador ou do JSONB do template: chave desconhecida cai, ausente/inválida vira o padrão. */
export function sanearEstados(raw: unknown, padrao: EstadosDasCamadas = ESTADOS_PADRAO): EstadosDasCamadas {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    CAMADAS.map((c) => [c, ESTADOS_DA_CAMADA.includes(o[c] as EstadoDaCamada) ? (o[c] as EstadoDaCamada) : padrao[c]]),
  ) as EstadosDasCamadas;
}

/**
 * As três chaves que existiam antes das camadas (Vista › Exibir: elétrica por
 * tipo de ponto, E5.1; rede de incêndio, E1.3) viram o estado inicial — quem
 * tinha desligado a iluminação continua sem ela na primeira abertura.
 */
export function estadosDasChavesAntigas(antigas: { iluminacao?: unknown; forca?: unknown; incendio?: unknown }): EstadosDasCamadas {
  const e = (v: unknown): EstadoDaCamada => (v === false ? 'OCULTA' : 'VISIVEL');
  return { ...ESTADOS_PADRAO, ELETRICA_ILUMINACAO: e(antigas.iluminacao), ELETRICA_FORCA: e(antigas.forca), INCENDIO: e(antigas.incendio) };
}

/**
 * O conflito está À VISTA? Os dois lados não podem estar ocultos (atenuado
 * conta: está na tela como referência). Lado que não é peça classificada
 * (não deveria acontecer) conta como visível — esconder um conflito por falta
 * de classificação seria pior que mostrar a mais.
 */
export function conflitoVisivel(ids: readonly ObjectId[], classificacao: ReadonlyMap<ObjectId, Pertenca>, estados: EstadosDasCamadas): boolean {
  return ids.every((id) => {
    const p = classificacao.get(id);
    return !p || estadoDaPertenca(p, estados) !== 'OCULTA';
  });
}
