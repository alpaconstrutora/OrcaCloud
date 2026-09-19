/**
 * PROGRAMA DE NECESSIDADES (19/09/2026, roadmap E4.1): o que a planta TEM de
 * ter, antes de haver planta — e o que o gerador (E6) vai receber.
 *
 * Um programa é uma lista de ITENS (tipo de uso, quantidade, área mín/ideal/máx,
 * largura mínima, pé-direito mínimo, exige iluminação/ventilação/fachada,
 * privacidade social/serviço/íntimo), uma lista de RELAÇÕES entre itens (peso
 * 0–10, desejável/obrigatória/proibida — a matriz de proximidade) e a
 * circulação máxima em % da área útil. Vive NO ESTUDO (`blueprint_programs`,
 * uma linha por estudo, JSONB), fora do payload do desenho: é intenção, não
 * geometria — não entra no hash nem no kernel.
 *
 * USO × TIPO NBR 5410: `TIPOS_DE_AMBIENTE` do kernel é grosso de propósito (é o
 * que a norma de tomadas distingue). O programa precisa de "sala", "suíte",
 * "lavabo", "circulação", "garagem" — por isso tem o SEU vocabulário
 * (`USOS_DO_AMBIENTE`), com a ponte para o tipo da norma e um casador de NOME
 * (`usoDoNome`), que é como a conferência (E4.3) vai ligar o item ao ambiente
 * desenhado: o projetista escreve "Dorm. 2", o programa entende DORMITORIO.
 *
 * Os valores padrão por uso são REFERÊNCIA de mercado (códigos de obras
 * municipais típicos e a prática de incorporação), não norma: a organização
 * ajusta item a item. As sementes por tipologia partem deles.
 */
import type { TipoDeAmbiente } from './blueprintKernel';

export const USOS_DO_AMBIENTE = [
  'SALA',
  'COZINHA',
  'DORMITORIO',
  'SUITE',
  'BANHEIRO',
  'LAVABO',
  'AREA_DE_SERVICO',
  'VARANDA',
  'CIRCULACAO',
  'GARAGEM',
  'ESCRITORIO',
  'DEPOSITO',
  'OUTRO',
] as const;
export type UsoDoAmbiente = (typeof USOS_DO_AMBIENTE)[number];

export const PRIVACIDADES = ['SOCIAL', 'SERVICO', 'INTIMO'] as const;
export type Privacidade = (typeof PRIVACIDADES)[number];
export const ROTULO_DA_PRIVACIDADE: Record<Privacidade, string> = { SOCIAL: 'Social', SERVICO: 'Serviço', INTIMO: 'Íntimo' };

export const TIPOS_DE_RELACAO = ['DESEJAVEL', 'OBRIGATORIA', 'PROIBIDA'] as const;
export type TipoDeRelacao = (typeof TIPOS_DE_RELACAO)[number];
export const ROTULO_DO_TIPO_DE_RELACAO: Record<TipoDeRelacao, string> = { DESEJAVEL: 'Desejável', OBRIGATORIA: 'Obrigatória', PROIBIDA: 'Proibida' };

export interface FichaDoUso {
  rotulo: string;
  /** O tipo que a NBR 5410 conta — a ponte para `SpaceLabel.tipoDeAmbiente`. */
  tipoNbr5410: TipoDeAmbiente;
  privacidade: Privacidade;
  areaMinM2: number;
  areaIdealM2: number;
  areaMaxM2: number | null;
  larguraMinMm: number;
  peDireitoMinMm: number;
  exigeIluminacao: boolean;
  exigeVentilacao: boolean;
  exigeFachada: boolean;
  /** Como o projetista costuma chamar — casa o nome do ambiente desenhado. */
  nomes: RegExp;
}

export const FICHA_DO_USO: Record<UsoDoAmbiente, FichaDoUso> = {
  SALA: { rotulo: 'Sala', tipoNbr5410: 'SALA_DORMITORIO', privacidade: 'SOCIAL', areaMinM2: 12, areaIdealM2: 18, areaMaxM2: 35, larguraMinMm: 2700, peDireitoMinMm: 2500, exigeIluminacao: true, exigeVentilacao: true, exigeFachada: true, nomes: /\b(sala|estar|jantar|living|home)\b/i },
  COZINHA: { rotulo: 'Cozinha', tipoNbr5410: 'COZINHA_SERVICO', privacidade: 'SERVICO', areaMinM2: 6, areaIdealM2: 9, areaMaxM2: 16, larguraMinMm: 1800, peDireitoMinMm: 2500, exigeIluminacao: true, exigeVentilacao: true, exigeFachada: false, nomes: /\b(coz(inha)?|copa|gourmet)\b/i },
  DORMITORIO: { rotulo: 'Dormitório', tipoNbr5410: 'SALA_DORMITORIO', privacidade: 'INTIMO', areaMinM2: 9, areaIdealM2: 11, areaMaxM2: 16, larguraMinMm: 2500, peDireitoMinMm: 2500, exigeIluminacao: true, exigeVentilacao: true, exigeFachada: true, nomes: /\b(dorm(it[oó]rio)?|quarto|q\d)\b/i },
  SUITE: { rotulo: 'Suíte', tipoNbr5410: 'SALA_DORMITORIO', privacidade: 'INTIMO', areaMinM2: 12, areaIdealM2: 15, areaMaxM2: 24, larguraMinMm: 2800, peDireitoMinMm: 2500, exigeIluminacao: true, exigeVentilacao: true, exigeFachada: true, nomes: /\bsu[ií]te\b/i },
  BANHEIRO: { rotulo: 'Banheiro', tipoNbr5410: 'BANHEIRO', privacidade: 'INTIMO', areaMinM2: 3, areaIdealM2: 4, areaMaxM2: 8, larguraMinMm: 1200, peDireitoMinMm: 2300, exigeIluminacao: false, exigeVentilacao: true, exigeFachada: false, nomes: /\b(banh(o|eiro)?|wc|bwc|sanit[aá]rio)\b/i },
  LAVABO: { rotulo: 'Lavabo', tipoNbr5410: 'BANHEIRO', privacidade: 'SOCIAL', areaMinM2: 1.5, areaIdealM2: 2.2, areaMaxM2: 4, larguraMinMm: 900, peDireitoMinMm: 2300, exigeIluminacao: false, exigeVentilacao: true, exigeFachada: false, nomes: /\blavabo\b/i },
  AREA_DE_SERVICO: { rotulo: 'Área de serviço', tipoNbr5410: 'COZINHA_SERVICO', privacidade: 'SERVICO', areaMinM2: 3, areaIdealM2: 4.5, areaMaxM2: 8, larguraMinMm: 1200, peDireitoMinMm: 2300, exigeIluminacao: false, exigeVentilacao: true, exigeFachada: false, nomes: /\b(serv(i[cç]o)?|lavand(eria)?|a\.?\s*s\.?)\b/i },
  VARANDA: { rotulo: 'Varanda', tipoNbr5410: 'VARANDA', privacidade: 'SOCIAL', areaMinM2: 3, areaIdealM2: 6, areaMaxM2: 15, larguraMinMm: 1200, peDireitoMinMm: 2300, exigeIluminacao: false, exigeVentilacao: false, exigeFachada: true, nomes: /\b(varanda|sacada|terra[cç]o)\b/i },
  CIRCULACAO: { rotulo: 'Circulação', tipoNbr5410: 'OUTRO', privacidade: 'INTIMO', areaMinM2: 0, areaIdealM2: 2, areaMaxM2: null, larguraMinMm: 900, peDireitoMinMm: 2300, exigeIluminacao: false, exigeVentilacao: false, exigeFachada: false, nomes: /\b(circ(ula[cç][aã]o)?|corredor|hall)\b/i },
  GARAGEM: { rotulo: 'Garagem', tipoNbr5410: 'OUTRO', privacidade: 'SERVICO', areaMinM2: 12.5, areaIdealM2: 15, areaMaxM2: null, larguraMinMm: 2500, peDireitoMinMm: 2200, exigeIluminacao: false, exigeVentilacao: true, exigeFachada: false, nomes: /\b(garag(em)?|vaga|abrigo)\b/i },
  ESCRITORIO: { rotulo: 'Escritório', tipoNbr5410: 'SALA_DORMITORIO', privacidade: 'SOCIAL', areaMinM2: 6, areaIdealM2: 8, areaMaxM2: 14, larguraMinMm: 2200, peDireitoMinMm: 2500, exigeIluminacao: true, exigeVentilacao: true, exigeFachada: true, nomes: /\b(escrit[oó]rio|office|estudo)\b/i },
  DEPOSITO: { rotulo: 'Depósito', tipoNbr5410: 'OUTRO', privacidade: 'SERVICO', areaMinM2: 1.5, areaIdealM2: 2.5, areaMaxM2: 6, larguraMinMm: 900, peDireitoMinMm: 2200, exigeIluminacao: false, exigeVentilacao: false, exigeFachada: false, nomes: /\b(dep[oó]sito|despensa|closet|rouparia)\b/i },
  OUTRO: { rotulo: 'Outro', tipoNbr5410: 'OUTRO', privacidade: 'SOCIAL', areaMinM2: 0, areaIdealM2: 6, areaMaxM2: null, larguraMinMm: 900, peDireitoMinMm: 2300, exigeIluminacao: false, exigeVentilacao: false, exigeFachada: false, nomes: /$^/ },
};

export interface ItemDoPrograma {
  id: string;
  uso: UsoDoAmbiente;
  /** Como aparece na tela e como o item casa com o nome desenhado ("Suíte master"). */
  nome: string;
  quantidade: number;
  areaMinM2: number;
  areaIdealM2: number;
  areaMaxM2: number | null;
  larguraMinMm: number;
  peDireitoMinMm: number | null;
  exigeIluminacao: boolean;
  exigeVentilacao: boolean;
  exigeFachada: boolean;
  privacidade: Privacidade;
}

export interface RelacaoDoPrograma {
  /** Ids de itens; par NÃO ordenado — `relacaoEntre` procura nos dois sentidos. */
  a: string;
  b: string;
  /** 0–10. Numa proibida vale 0; numa obrigatória, 10. */
  peso: number;
  tipo: TipoDeRelacao;
}

export interface Programa {
  nome: string;
  itens: ItemDoPrograma[];
  relacoes: RelacaoDoPrograma[];
  /** Circulação (corredores e halls) no máximo esta fração da área útil, em %. */
  circulacaoMaxPct: number;
  /** Percurso máximo de qualquer ambiente até a saída (m), pelo grafo espacial (E4.2). `null` = não confere. */
  percursoMaxM: number | null;
}

export const MAX_NOME_DO_PROGRAMA = 60;
export const MAX_NOME_DO_ITEM = 40;
export const MAX_QUANTIDADE_DO_ITEM = 99;

let contador = 0;
/** Id curto e único na sessão; o programa é JSON do estudo, não precisa de uid determinístico. */
export function idDeItem(): string {
  contador += 1;
  return `it_${Date.now().toString(36)}${contador.toString(36)}`;
}

export function programaVazio(nome = 'Programa'): Programa {
  return { nome, itens: [], relacoes: [], circulacaoMaxPct: 15, percursoMaxM: null };
}

/** Um item novo já com a ficha do uso preenchida. */
export function novoItem(uso: UsoDoAmbiente, nome?: string, quantidade = 1): ItemDoPrograma {
  const f = FICHA_DO_USO[uso];
  return {
    id: idDeItem(),
    uso,
    nome: nome ?? f.rotulo,
    quantidade,
    areaMinM2: f.areaMinM2,
    areaIdealM2: f.areaIdealM2,
    areaMaxM2: f.areaMaxM2,
    larguraMinMm: f.larguraMinMm,
    peDireitoMinMm: f.peDireitoMinMm,
    exigeIluminacao: f.exigeIluminacao,
    exigeVentilacao: f.exigeVentilacao,
    exigeFachada: f.exigeFachada,
    privacidade: f.privacidade,
  };
}

// ─── Relações (matriz de proximidade) ────────────────────────────────────────

export function relacaoEntre(p: Programa, a: string, b: string): RelacaoDoPrograma | null {
  if (a === b) return null;
  return p.relacoes.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null;
}

/**
 * Grava a célula (a, b) da matriz. Peso 0 numa desejável APAGA a relação
 * (célula vazia). Obrigatória força peso 10; proibida força 0. Imutável.
 */
export function definirRelacao(p: Programa, a: string, b: string, peso: number, tipo: TipoDeRelacao = 'DESEJAVEL'): Programa {
  if (a === b) return p;
  const semEla = p.relacoes.filter((r) => !((r.a === a && r.b === b) || (r.a === b && r.b === a)));
  const pesoFinal = tipo === 'OBRIGATORIA' ? 10 : tipo === 'PROIBIDA' ? 0 : Math.max(0, Math.min(10, Math.round(peso)));
  if (tipo === 'DESEJAVEL' && pesoFinal === 0) return { ...p, relacoes: semEla };
  return { ...p, relacoes: [...semEla, { a, b, peso: pesoFinal, tipo }] };
}

/** Rótulo curto da célula: "8", "Obrig.", "Proib." ou "". */
export function rotuloDaRelacao(r: RelacaoDoPrograma | null): string {
  if (!r) return '';
  if (r.tipo === 'OBRIGATORIA') return 'Obrig.';
  if (r.tipo === 'PROIBIDA') return 'Proib.';
  return String(r.peso);
}

// ─── Itens ───────────────────────────────────────────────────────────────────

export function adicionarItem(p: Programa, item: ItemDoPrograma): Programa {
  return { ...p, itens: [...p.itens, item] };
}

export function atualizarItem(p: Programa, id: string, mudanca: Partial<Omit<ItemDoPrograma, 'id'>>): Programa {
  return { ...p, itens: p.itens.map((i) => (i.id === id ? { ...i, ...mudanca } : i)) };
}

/** Remove o item e toda relação que o cita. */
export function removerItem(p: Programa, id: string): Programa {
  return { ...p, itens: p.itens.filter((i) => i.id !== id), relacoes: p.relacoes.filter((r) => r.a !== id && r.b !== id) };
}

/** Troca o uso do item e puxa a ficha nova para os campos que ainda estavam na ficha antiga. */
export function trocarUsoDoItem(p: Programa, id: string, uso: UsoDoAmbiente): Programa {
  return {
    ...p,
    itens: p.itens.map((i) => {
      if (i.id !== id) return i;
      const de = FICHA_DO_USO[i.uso];
      const para = FICHA_DO_USO[uso];
      const seIgual = <K extends keyof FichaDoUso & keyof ItemDoPrograma>(k: K): ItemDoPrograma[K] => ((i[k] as unknown) === (de[k] as unknown) ? (para[k] as unknown as ItemDoPrograma[K]) : i[k]);
      return {
        ...i,
        uso,
        nome: i.nome === de.rotulo ? para.rotulo : i.nome,
        areaMinM2: seIgual('areaMinM2'),
        areaIdealM2: seIgual('areaIdealM2'),
        areaMaxM2: seIgual('areaMaxM2'),
        larguraMinMm: seIgual('larguraMinMm'),
        peDireitoMinMm: seIgual('peDireitoMinMm'),
        exigeIluminacao: seIgual('exigeIluminacao'),
        exigeVentilacao: seIgual('exigeVentilacao'),
        exigeFachada: seIgual('exigeFachada'),
        privacidade: seIgual('privacidade'),
      };
    }),
  };
}

// ─── Validação e resumo ──────────────────────────────────────────────────────

export interface ProblemaDoPrograma {
  itemId: string | null;
  texto: string;
}

/** O que impede o programa de ser usado por uma conferência/gerador. Não trava a edição. */
export function problemasDoPrograma(p: Programa): ProblemaDoPrograma[] {
  const out: ProblemaDoPrograma[] = [];
  const ids = new Set<string>();
  for (const i of p.itens) {
    if (ids.has(i.id)) out.push({ itemId: i.id, texto: `item repetido: ${i.nome}` });
    ids.add(i.id);
    const nome = i.nome.trim() || FICHA_DO_USO[i.uso].rotulo;
    if (!i.nome.trim()) out.push({ itemId: i.id, texto: `${nome}: sem nome` });
    if (!Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > MAX_QUANTIDADE_DO_ITEM) out.push({ itemId: i.id, texto: `${nome}: quantidade deve ser inteira de 1 a ${MAX_QUANTIDADE_DO_ITEM}` });
    if (!(i.areaMinM2 >= 0)) out.push({ itemId: i.id, texto: `${nome}: área mínima inválida` });
    if (i.areaIdealM2 < i.areaMinM2) out.push({ itemId: i.id, texto: `${nome}: área ideal (${fmt(i.areaIdealM2)}) menor que a mínima (${fmt(i.areaMinM2)})` });
    if (i.areaMaxM2 != null && i.areaMaxM2 < i.areaIdealM2) out.push({ itemId: i.id, texto: `${nome}: área máxima (${fmt(i.areaMaxM2)}) menor que a ideal (${fmt(i.areaIdealM2)})` });
    if (!(i.larguraMinMm >= 0)) out.push({ itemId: i.id, texto: `${nome}: largura mínima inválida` });
    if (i.peDireitoMinMm != null && i.peDireitoMinMm < 2000) out.push({ itemId: i.id, texto: `${nome}: pé-direito mínimo abaixo de 2,00 m` });
  }
  const pares = new Set<string>();
  for (const r of p.relacoes) {
    const a = p.itens.find((i) => i.id === r.a);
    const b = p.itens.find((i) => i.id === r.b);
    if (!a || !b) {
      out.push({ itemId: null, texto: 'relação cita item que não existe' });
      continue;
    }
    if (r.a === r.b) out.push({ itemId: r.a, texto: `${a.nome}: relação consigo mesmo` });
    const chave = [r.a, r.b].sort().join('|');
    if (pares.has(chave)) out.push({ itemId: null, texto: `relação repetida: ${a.nome} × ${b.nome}` });
    pares.add(chave);
    if (!Number.isInteger(r.peso) || r.peso < 0 || r.peso > 10) out.push({ itemId: null, texto: `${a.nome} × ${b.nome}: peso fora de 0–10` });
    if (r.tipo === 'OBRIGATORIA' && r.peso !== 10) out.push({ itemId: null, texto: `${a.nome} × ${b.nome}: obrigatória tem peso 10` });
    if (r.tipo === 'PROIBIDA' && r.peso !== 0) out.push({ itemId: null, texto: `${a.nome} × ${b.nome}: proibida tem peso 0` });
  }
  if (!(p.circulacaoMaxPct >= 0 && p.circulacaoMaxPct <= 100)) out.push({ itemId: null, texto: 'circulação máxima fora de 0–100 %' });
  if (p.percursoMaxM != null && !(p.percursoMaxM > 0)) out.push({ itemId: null, texto: 'percurso máximo até a saída deve ser > 0' });
  return out;
}

export interface ResumoDoPrograma {
  /** Σ quantidade (ambientes a criar). */
  ambientes: number;
  itens: number;
  areaMinM2: number;
  areaIdealM2: number;
  /** `null` quando algum item não tem máximo. */
  areaMaxM2: number | null;
  porPrivacidade: Record<Privacidade, number>;
  relacoes: number;
  obrigatorias: number;
  proibidas: number;
  /** A área ideal já com a circulação máxima por cima: o que o lote precisa comportar. */
  areaIdealComCirculacaoM2: number;
}

export function resumoDoPrograma(p: Programa): ResumoDoPrograma {
  const porPrivacidade: Record<Privacidade, number> = { SOCIAL: 0, SERVICO: 0, INTIMO: 0 };
  let ambientes = 0;
  let min = 0;
  let ideal = 0;
  let max: number | null = 0;
  for (const i of p.itens) {
    const q = Math.max(0, i.quantidade);
    ambientes += q;
    min += i.areaMinM2 * q;
    ideal += i.areaIdealM2 * q;
    if (i.areaMaxM2 == null) max = null;
    else if (max != null) max += i.areaMaxM2 * q;
    porPrivacidade[i.privacidade] += i.areaIdealM2 * q;
  }
  const arred = (v: number) => Math.round(v * 100) / 100;
  const semCirculacao = p.itens.filter((i) => i.uso !== 'CIRCULACAO').reduce((s, i) => s + i.areaIdealM2 * Math.max(0, i.quantidade), 0);
  return {
    ambientes,
    itens: p.itens.length,
    areaMinM2: arred(min),
    areaIdealM2: arred(ideal),
    areaMaxM2: max == null ? null : arred(max),
    porPrivacidade: { SOCIAL: arred(porPrivacidade.SOCIAL), SERVICO: arred(porPrivacidade.SERVICO), INTIMO: arred(porPrivacidade.INTIMO) },
    relacoes: p.relacoes.length,
    obrigatorias: p.relacoes.filter((r) => r.tipo === 'OBRIGATORIA').length,
    proibidas: p.relacoes.filter((r) => r.tipo === 'PROIBIDA').length,
    areaIdealComCirculacaoM2: arred(semCirculacao * (1 + p.circulacaoMaxPct / 100)),
  };
}

function fmt(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

// ─── Casador de nome (ponte com o desenho, usada pela E4.3) ──────────────────

/**
 * O uso que um nome de ambiente sugere, ou `null`. A palavra que aparece
 * PRIMEIRO manda ("Varanda gourmet" é varanda; "Cozinha/Serviço" é cozinha);
 * em empate de posição vale a ordem mais específica (suíte antes de
 * dormitório, lavabo antes de banheiro).
 */
export function usoDoNome(nome: string | null | undefined): UsoDoAmbiente | null {
  const n = (nome ?? '').trim();
  if (!n) return null;
  const ordem: UsoDoAmbiente[] = ['SUITE', 'LAVABO', 'AREA_DE_SERVICO', 'COZINHA', 'BANHEIRO', 'DORMITORIO', 'SALA', 'VARANDA', 'CIRCULACAO', 'GARAGEM', 'ESCRITORIO', 'DEPOSITO'];
  let melhor: { uso: UsoDoAmbiente; pos: number } | null = null;
  for (const uso of ordem) {
    const m = FICHA_DO_USO[uso].nomes.exec(n);
    if (m && (!melhor || m.index < melhor.pos)) melhor = { uso, pos: m.index };
  }
  return melhor?.uso ?? null;
}

// ─── Leitura da coluna JSONB ─────────────────────────────────────────────────

/** Completa/sanitiza o JSON gravado: campo estranho cai, número inválido volta ao padrão do uso. */
export function programaDaColuna(raw: unknown): Programa {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, padrao: number, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : padrao);
  const numOuNulo = (v: unknown, padrao: number | null, min = 0) => (v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= min ? v : padrao);
  const bool = (v: unknown, padrao: boolean) => (typeof v === 'boolean' ? v : padrao);
  const em = <T,>(lista: readonly T[], v: unknown, padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao);
  const itens: ItemDoPrograma[] = [];
  const ids = new Set<string>();
  for (const it of Array.isArray(r.itens) ? r.itens : []) {
    const x = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const uso = em(USOS_DO_AMBIENTE, x.uso, 'OUTRO');
    const f = FICHA_DO_USO[uso];
    const id = typeof x.id === 'string' && x.id && !ids.has(x.id) ? x.id : idDeItem();
    ids.add(id);
    itens.push({
      id,
      uso,
      nome: typeof x.nome === 'string' ? x.nome.slice(0, MAX_NOME_DO_ITEM) : f.rotulo,
      quantidade: Math.min(MAX_QUANTIDADE_DO_ITEM, Math.max(1, Math.round(num(x.quantidade, 1, 1)))),
      areaMinM2: num(x.areaMinM2, f.areaMinM2),
      areaIdealM2: num(x.areaIdealM2, f.areaIdealM2),
      areaMaxM2: numOuNulo(x.areaMaxM2, f.areaMaxM2),
      larguraMinMm: num(x.larguraMinMm, f.larguraMinMm),
      peDireitoMinMm: numOuNulo(x.peDireitoMinMm, f.peDireitoMinMm),
      exigeIluminacao: bool(x.exigeIluminacao, f.exigeIluminacao),
      exigeVentilacao: bool(x.exigeVentilacao, f.exigeVentilacao),
      exigeFachada: bool(x.exigeFachada, f.exigeFachada),
      privacidade: em(PRIVACIDADES, x.privacidade, f.privacidade),
    });
  }
  const relacoes: RelacaoDoPrograma[] = [];
  for (const rel of Array.isArray(r.relacoes) ? r.relacoes : []) {
    const x = (rel && typeof rel === 'object' ? rel : {}) as Record<string, unknown>;
    if (typeof x.a !== 'string' || typeof x.b !== 'string' || x.a === x.b || !ids.has(x.a) || !ids.has(x.b)) continue;
    if (relacoes.some((q) => (q.a === x.a && q.b === x.b) || (q.a === x.b && q.b === x.a))) continue;
    const tipo = em(TIPOS_DE_RELACAO, x.tipo, 'DESEJAVEL');
    const peso = tipo === 'OBRIGATORIA' ? 10 : tipo === 'PROIBIDA' ? 0 : Math.max(0, Math.min(10, Math.round(num(x.peso, 5))));
    if (tipo === 'DESEJAVEL' && peso === 0) continue;
    relacoes.push({ a: x.a, b: x.b, peso, tipo });
  }
  return {
    nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome.slice(0, MAX_NOME_DO_PROGRAMA) : 'Programa',
    itens,
    relacoes,
    circulacaoMaxPct: Math.min(100, num(r.circulacaoMaxPct, 15)),
    percursoMaxM: typeof r.percursoMaxM === 'number' && Number.isFinite(r.percursoMaxM) && r.percursoMaxM > 0 ? r.percursoMaxM : null,
  };
}

// ─── Sementes por tipologia ──────────────────────────────────────────────────

export const TIPOLOGIAS_SEMENTE = ['APTO_2Q', 'APTO_3Q_SUITE', 'CASA_TERREA'] as const;
export type TipologiaSemente = (typeof TIPOLOGIAS_SEMENTE)[number];
export const ROTULO_DA_TIPOLOGIA: Record<TipologiaSemente, string> = {
  APTO_2Q: 'Apartamento 2 quartos',
  APTO_3Q_SUITE: 'Apartamento 3 quartos com suíte',
  CASA_TERREA: 'Casa térrea',
};

type EsbocoDeItem = { chave: string; uso: UsoDoAmbiente; nome?: string; quantidade?: number; areaIdealM2?: number; areaMinM2?: number; areaMaxM2?: number | null };
type EsbocoDeRelacao = [string, string, number | 'O' | 'P'];

function montar(nome: string, circulacaoMaxPct: number, esbocos: EsbocoDeItem[], relacoes: EsbocoDeRelacao[]): Programa {
  const porChave = new Map<string, ItemDoPrograma>();
  let p = programaVazio(nome);
  p.circulacaoMaxPct = circulacaoMaxPct;
  p.percursoMaxM = 30; // referência para residência: da porta mais funda à saída
  for (const e of esbocos) {
    const item = { ...novoItem(e.uso, e.nome, e.quantidade ?? 1), id: `${e.chave}` };
    if (e.areaIdealM2 != null) item.areaIdealM2 = e.areaIdealM2;
    if (e.areaMinM2 != null) item.areaMinM2 = e.areaMinM2;
    if (e.areaMaxM2 !== undefined) item.areaMaxM2 = e.areaMaxM2;
    porChave.set(e.chave, item);
    p = adicionarItem(p, item);
  }
  for (const [a, b, v] of relacoes) {
    const ia = porChave.get(a)!;
    const ib = porChave.get(b)!;
    p = v === 'O' ? definirRelacao(p, ia.id, ib.id, 10, 'OBRIGATORIA') : v === 'P' ? definirRelacao(p, ia.id, ib.id, 0, 'PROIBIDA') : definirRelacao(p, ia.id, ib.id, v);
  }
  return p;
}

/**
 * Sementes. Os ids dos itens são as chaves legíveis ("sala", "dorm") — quando
 * o programa é gravado no estudo eles seguem assim; um item novo ganha
 * `idDeItem()`. Pesos: 10 = tem de encostar; 7–9 = perto; 4–6 = indiferente
 * para perto; obrigatória = porta direta (suíte × banheiro da suíte, cozinha ×
 * serviço); proibida = nunca vizinhos (cozinha × dormitório; garagem × suíte).
 */
export function programaSemente(tipologia: TipologiaSemente): Programa {
  switch (tipologia) {
    case 'APTO_2Q':
      return montar(
        ROTULO_DA_TIPOLOGIA.APTO_2Q,
        15,
        [
          { chave: 'sala', uso: 'SALA', nome: 'Sala de estar/jantar', areaIdealM2: 18 },
          { chave: 'coz', uso: 'COZINHA' },
          { chave: 'serv', uso: 'AREA_DE_SERVICO' },
          { chave: 'dorm', uso: 'DORMITORIO', quantidade: 2 },
          { chave: 'banho', uso: 'BANHEIRO', nome: 'Banheiro social' },
          { chave: 'circ', uso: 'CIRCULACAO' },
          { chave: 'var', uso: 'VARANDA' },
        ],
        [
          ['sala', 'coz', 8],
          ['coz', 'serv', 'O'],
          ['sala', 'var', 9],
          ['sala', 'circ', 8],
          ['circ', 'dorm', 9],
          ['circ', 'banho', 9],
          ['dorm', 'banho', 7],
          ['coz', 'dorm', 'P'],
          ['serv', 'dorm', 'P'],
        ],
      );
    case 'APTO_3Q_SUITE':
      return montar(
        ROTULO_DA_TIPOLOGIA.APTO_3Q_SUITE,
        15,
        [
          { chave: 'sala', uso: 'SALA', nome: 'Sala de estar/jantar', areaIdealM2: 24, areaMinM2: 16 },
          { chave: 'coz', uso: 'COZINHA', areaIdealM2: 10 },
          { chave: 'serv', uso: 'AREA_DE_SERVICO' },
          { chave: 'lav', uso: 'LAVABO' },
          { chave: 'suite', uso: 'SUITE' },
          { chave: 'bsuite', uso: 'BANHEIRO', nome: 'Banheiro da suíte', areaIdealM2: 4.5 },
          { chave: 'dorm', uso: 'DORMITORIO', quantidade: 2 },
          { chave: 'banho', uso: 'BANHEIRO', nome: 'Banheiro social' },
          { chave: 'circ', uso: 'CIRCULACAO' },
          { chave: 'var', uso: 'VARANDA', areaIdealM2: 8 },
        ],
        [
          ['sala', 'coz', 8],
          ['coz', 'serv', 'O'],
          ['sala', 'var', 9],
          ['sala', 'lav', 7],
          ['sala', 'circ', 8],
          ['circ', 'suite', 8],
          ['circ', 'dorm', 9],
          ['circ', 'banho', 9],
          ['suite', 'bsuite', 'O'],
          ['dorm', 'banho', 7],
          ['coz', 'dorm', 'P'],
          ['coz', 'suite', 'P'],
          ['serv', 'suite', 'P'],
          ['lav', 'suite', 'P'],
        ],
      );
    case 'CASA_TERREA':
      return montar(
        ROTULO_DA_TIPOLOGIA.CASA_TERREA,
        12,
        [
          { chave: 'var', uso: 'VARANDA', nome: 'Varanda de entrada', areaIdealM2: 6 },
          { chave: 'sala', uso: 'SALA', nome: 'Sala de estar/jantar', areaIdealM2: 24, areaMinM2: 16 },
          { chave: 'coz', uso: 'COZINHA', areaIdealM2: 12 },
          { chave: 'serv', uso: 'AREA_DE_SERVICO', areaIdealM2: 6 },
          { chave: 'lav', uso: 'LAVABO' },
          { chave: 'suite', uso: 'SUITE' },
          { chave: 'bsuite', uso: 'BANHEIRO', nome: 'Banheiro da suíte', areaIdealM2: 4.5 },
          { chave: 'dorm', uso: 'DORMITORIO', quantidade: 2 },
          { chave: 'banho', uso: 'BANHEIRO', nome: 'Banheiro social' },
          { chave: 'circ', uso: 'CIRCULACAO' },
          { chave: 'gar', uso: 'GARAGEM', nome: 'Garagem (2 vagas)', areaIdealM2: 30, areaMinM2: 25 },
        ],
        [
          ['var', 'sala', 'O'],
          ['sala', 'coz', 8],
          ['coz', 'serv', 'O'],
          ['sala', 'lav', 7],
          ['sala', 'circ', 8],
          ['circ', 'suite', 8],
          ['circ', 'dorm', 9],
          ['circ', 'banho', 9],
          ['suite', 'bsuite', 'O'],
          ['dorm', 'banho', 7],
          ['gar', 'serv', 6],
          ['gar', 'coz', 5],
          ['coz', 'dorm', 'P'],
          ['coz', 'suite', 'P'],
          ['gar', 'suite', 'P'],
          ['gar', 'dorm', 'P'],
        ],
      );
  }
}
