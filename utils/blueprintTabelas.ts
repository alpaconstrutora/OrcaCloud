/**
 * TABELAS PERSONALIZADAS (21/09/2026, backlog P2 — P2.16): os "schedules" do
 * Revit — uma tabela definida pelo usuário sobre uma FAMÍLIA de peças, com as
 * colunas que ele escolher, filtro, agrupamento, ordenação e totais.
 *
 * ─── A DECISÃO ──────────────────────────────────────────────────────────────
 *
 * Nada de vocabulário novo: as colunas são as VARIÁVEIS que as fórmulas de
 * parâmetro já enxergam (`variaveisDaPeca` — nativas, do pavimento, parâmetros
 * gravados e calculados), e o filtro é uma EXPRESSÃO da mesma linguagem das
 * fórmulas e das regras (`avaliar`). O que o usuário aprendeu para escrever
 * uma fórmula serve para montar uma tabela — e a tabela nunca inventa um
 * número que a peça não tenha.
 *
 * A DEFINIÇÃO é da organização (`blueprint_table_definitions`, JSONB
 * sanitizado aqui); a TABELA é derivação pura sobre o modelo aberto. Nada
 * entra no payload nem no hash.
 */
import { rotuloCurto, type BlueprintModel, type FamiliaComParametros } from './blueprintKernel';
import { avaliar, parsear, pecasComParametros, variaveisDaPeca, VARIAVEIS_DO_PAVIMENTO, VARIAVEIS_NATIVAS, type Peca, type Valor, type Variaveis } from './blueprintFormulas';

export const FAMILIAS_DE_TABELA: readonly FamiliaComParametros[] = ['wall', 'opening', 'structural', 'roof', 'stair', 'trecho', 'terminal', 'quadro'];
export const ROTULO_DA_FAMILIA_DE_TABELA: Record<FamiliaComParametros, string> = {
  wall: 'Paredes',
  opening: 'Esquadrias e vãos',
  structural: 'Estrutura',
  roof: 'Águas de telhado',
  stair: 'Escadas e rampas',
  trecho: 'Trechos de instalação',
  terminal: 'Pontos de instalação',
  quadro: 'Quadros elétricos',
};

export type TotalDaColuna = 'SOMA' | 'MEDIA' | 'CONTAGEM' | 'MIN' | 'MAX';
export const TOTAIS_DA_COLUNA: readonly TotalDaColuna[] = ['SOMA', 'MEDIA', 'CONTAGEM', 'MIN', 'MAX'];
export const ROTULO_DO_TOTAL: Record<TotalDaColuna, string> = { SOMA: 'Soma', MEDIA: 'Média', CONTAGEM: 'Contagem', MIN: 'Mínimo', MAX: 'Máximo' };

export interface ColunaDeTabela {
  /** A chave da variável ("comprimento", "pavimento.nome", "custo_interno"). */
  chave: string;
  /** Rótulo do cabeçalho; vazio = a chave. */
  rotulo?: string;
  total?: TotalDaColuna | null;
}

export interface DefinicaoDeTabela {
  nome: string;
  familia: FamiliaComParametros;
  colunas: ColunaDeTabela[];
  /** Expressão booleana da linguagem das fórmulas; vazio = todas as peças. */
  filtro: string;
  /** Chave da coluna de agrupamento; null = sem grupos. */
  agruparPor: string | null;
  ordenarPor: string | null;
  ordem: 'ASC' | 'DESC';
}

export interface TabelaSalva extends DefinicaoDeTabela {
  id: string;
  organizationId: string;
  active: boolean;
}

export const MAX_NOME_DE_TABELA = 80;
export const MAX_COLUNAS_DE_TABELA = 16;

// ─── Sanitização do JSONB ────────────────────────────────────────────────────

function chaveValida(k: unknown): k is string {
  return typeof k === 'string' && /^[a-zA-Z_][a-zA-Z0-9_.]{0,60}$/.test(k);
}

/** A definição lida da coluna JSONB, tolerante a lixo: o que não é válido cai fora. */
export function definicaoDaColuna(json: unknown, nome = ''): DefinicaoDeTabela {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const familia = FAMILIAS_DE_TABELA.includes(o.familia as FamiliaComParametros) ? (o.familia as FamiliaComParametros) : 'wall';
  const colunas = (Array.isArray(o.colunas) ? o.colunas : [])
    .map((c): ColunaDeTabela | null => {
      const cc = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      if (!chaveValida(cc.chave)) return null;
      return {
        chave: cc.chave,
        ...(typeof cc.rotulo === 'string' && cc.rotulo.trim() ? { rotulo: cc.rotulo.trim().slice(0, 40) } : {}),
        total: TOTAIS_DA_COLUNA.includes(cc.total as TotalDaColuna) ? (cc.total as TotalDaColuna) : null,
      };
    })
    .filter((c): c is ColunaDeTabela => c !== null)
    .slice(0, MAX_COLUNAS_DE_TABELA);
  return {
    nome: (typeof o.nome === 'string' && o.nome.trim() ? o.nome : nome).trim().slice(0, MAX_NOME_DE_TABELA),
    familia,
    colunas,
    filtro: typeof o.filtro === 'string' ? o.filtro.slice(0, 300) : '',
    agruparPor: chaveValida(o.agruparPor) ? o.agruparPor : null,
    ordenarPor: chaveValida(o.ordenarPor) ? o.ordenarPor : null,
    ordem: o.ordem === 'DESC' ? 'DESC' : 'ASC',
  };
}

/** Problemas da definição, em português — vazio = pode salvar. */
export function validarDefinicao(d: DefinicaoDeTabela): string[] {
  const erros: string[] = [];
  if (!d.nome.trim()) erros.push('Dê um nome à tabela.');
  if (d.nome.length > MAX_NOME_DE_TABELA) erros.push(`Nome com mais de ${MAX_NOME_DE_TABELA} caracteres.`);
  if (d.colunas.length === 0) erros.push('Escolha ao menos uma coluna.');
  const vistas = new Set<string>();
  for (const c of d.colunas) {
    if (vistas.has(c.chave)) erros.push(`Coluna repetida: ${c.chave}.`);
    vistas.add(c.chave);
  }
  if (d.filtro.trim()) {
    try {
      parsear(d.filtro);
    } catch (e) {
      erros.push(`Filtro inválido: ${(e as Error).message}`);
    }
  }
  return erros;
}

// ─── As colunas disponíveis para uma família ────────────────────────────────

export interface ColunaDisponivel {
  chave: string;
  unidade: string;
  origem: 'NATIVA' | 'PAVIMENTO' | 'PARAMETRO';
}

/**
 * O que se pode pôr na tabela desta família: as nativas, as do pavimento e as
 * chaves de parâmetro (definidas na organização ou gravadas em alguma peça do
 * modelo aberto).
 */
export function colunasDisponiveis(model: BlueprintModel, familia: FamiliaComParametros, definicoes: readonly { chave: string; familia: FamiliaComParametros | null; unidade?: string | null }[] = []): ColunaDisponivel[] {
  const saida: ColunaDisponivel[] = [
    ...VARIAVEIS_NATIVAS[familia].map((v) => ({ chave: v.nome, unidade: v.unidade, origem: 'NATIVA' as const })),
    ...VARIAVEIS_DO_PAVIMENTO.map((v) => ({ chave: v.nome, unidade: v.unidade, origem: 'PAVIMENTO' as const })),
  ];
  const vistas = new Set(saida.map((c) => c.chave));
  for (const d of definicoes) {
    if (d.familia && d.familia !== familia) continue;
    if (vistas.has(d.chave)) continue;
    vistas.add(d.chave);
    saida.push({ chave: d.chave, unidade: d.unidade ?? '', origem: 'PARAMETRO' });
  }
  for (const p of pecasComParametros(model)) {
    if (p.familia !== familia) continue;
    for (const k of Object.keys((p.peca as { parametros?: Record<string, Valor> }).parametros ?? {})) {
      if (vistas.has(k)) continue;
      vistas.add(k);
      saida.push({ chave: k, unidade: '', origem: 'PARAMETRO' });
    }
  }
  return saida;
}

// ─── Montar a tabela ────────────────────────────────────────────────────────

export interface LinhaDaTabela {
  id: string;
  uid: string;
  rotulo: string;
  valores: (Valor | null)[];
}
export interface GrupoDaTabela {
  chave: Valor | null;
  rotulo: string;
  linhas: LinhaDaTabela[];
  totais: (Valor | null)[];
}
export interface TabelaMontada {
  definicao: DefinicaoDeTabela;
  colunas: { chave: string; rotulo: string; total: TotalDaColuna | null }[];
  grupos: GrupoDaTabela[];
  totais: (Valor | null)[];
  /** Linhas depois do filtro. */
  linhas: number;
  /** Peças da família no modelo, antes do filtro. */
  pecas: number;
  /** Erro de filtro (uma vez), ou null. */
  erroDoFiltro: string | null;
}

const FAMILIA_DO_ROTULO: Record<FamiliaComParametros, Parameters<typeof rotuloCurto>[1]> = {
  wall: 'wall',
  opening: 'opening',
  structural: 'structural',
  roof: 'roof',
  stair: 'stair',
  trecho: 'trecho',
  terminal: 'terminal',
  quadro: 'quadro',
};

function comparar(a: Valor | null, b: Valor | null): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
}

function total(tipo: TotalDaColuna | null, valores: (Valor | null)[]): Valor | null {
  if (!tipo) return null;
  const nums = valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  switch (tipo) {
    case 'CONTAGEM':
      return valores.filter((v) => v !== null && v !== undefined && v !== '').length;
    case 'SOMA':
      return nums.length ? Math.round(nums.reduce((s, v) => s + v, 0) * 1000) / 1000 : null;
    case 'MEDIA':
      return nums.length ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 1000) / 1000 : null;
    case 'MIN':
      return nums.length ? Math.min(...nums) : null;
    case 'MAX':
      return nums.length ? Math.max(...nums) : null;
  }
}

/** As peças da família, como `Peca`. */
export function pecasDaFamilia(model: BlueprintModel, familia: FamiliaComParametros): Peca[] {
  return pecasComParametros(model).filter((p) => p.familia === familia);
}

/**
 * A tabela pronta: filtro aplicado, colunas resolvidas (nativas, pavimento,
 * gravadas e — quando dadas — calculadas por fórmula), grupos e totais.
 * Coluna que a peça não tem sai `null` (célula vazia), nunca erro.
 */
export function montarTabela(model: BlueprintModel, def: DefinicaoDeTabela, calculados?: Map<string, Record<string, Valor>>): TabelaMontada {
  const colunas = def.colunas.map((c) => ({ chave: c.chave, rotulo: c.rotulo?.trim() || c.chave, total: c.total ?? null }));
  const pecas = pecasDaFamilia(model, def.familia);
  const filtro = def.filtro.trim();
  let erroDoFiltro: string | null = null;
  const linhas: { linha: LinhaDaTabela; vars: Variaveis }[] = [];
  for (const p of pecas) {
    const uid = (p.peca as { uid: string }).uid;
    const vars: Variaveis = { ...variaveisDaPeca(model, p), ...(calculados?.get(uid) ?? {}) };
    if (filtro) {
      try {
        const v = avaliar(filtro, vars);
        if (!v) continue;
      } catch (e) {
        if (!erroDoFiltro) erroDoFiltro = (e as Error).message;
        continue;
      }
    }
    linhas.push({
      linha: {
        id: (p.peca as { id: string }).id,
        uid,
        rotulo: rotuloCurto(uid, FAMILIA_DO_ROTULO[def.familia]),
        valores: colunas.map((c) => (c.chave in vars ? vars[c.chave] : null)),
      },
      vars,
    });
  }
  const chaveDe = (vars: Variaveis, k: string | null): Valor | null => (k && k in vars ? vars[k] : null);
  if (def.ordenarPor) {
    const k = def.ordenarPor;
    const sinal = def.ordem === 'DESC' ? -1 : 1;
    linhas.sort((x, y) => sinal * comparar(chaveDe(x.vars, k), chaveDe(y.vars, k)) || x.linha.rotulo.localeCompare(y.linha.rotulo));
  } else {
    linhas.sort((x, y) => x.linha.rotulo.localeCompare(y.linha.rotulo));
  }
  const grupos: GrupoDaTabela[] = [];
  if (def.agruparPor) {
    const k = def.agruparPor;
    const porChave = new Map<string, GrupoDaTabela>();
    for (const l of linhas) {
      const v = chaveDe(l.vars, k);
      const id = v === null ? '\n' : String(v);
      const g = porChave.get(id) ?? { chave: v, rotulo: v === null || v === '' ? '(sem valor)' : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v), linhas: [], totais: [] };
      g.linhas.push(l.linha);
      porChave.set(id, g);
    }
    grupos.push(...[...porChave.values()].sort((a, b) => comparar(a.chave, b.chave)));
  } else {
    grupos.push({ chave: null, rotulo: '', linhas: linhas.map((l) => l.linha), totais: [] });
  }
  for (const g of grupos) g.totais = colunas.map((c, i) => total(c.total, g.linhas.map((l) => l.valores[i])));
  const todas = linhas.map((l) => l.linha);
  return {
    definicao: def,
    colunas,
    grupos,
    totais: colunas.map((c, i) => total(c.total, todas.map((l) => l.valores[i]))),
    linhas: todas.length,
    pecas: pecas.length,
    erroDoFiltro,
  };
}

/** Célula em texto: número com vírgula e até 3 casas, booleano sim/não, vazio para null. */
export function celula(v: Valor | null): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return (Math.round(v * 1000) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v);
}

/** A tabela como linhas de planilha (cabeçalho, grupos com subtotal, total geral). */
export function tabelaParaPlanilha(t: TabelaMontada): (string | number | null)[][] {
  const cab = ['Peça', ...t.colunas.map((c) => c.rotulo)];
  const linhas: (string | number | null)[][] = [[t.definicao.nome], cab];
  const temTotal = t.colunas.some((c) => c.total);
  const cel = (v: Valor | null): string | number | null => (typeof v === 'boolean' ? (v ? 'sim' : 'não') : v ?? null);
  for (const g of t.grupos) {
    if (t.definicao.agruparPor) linhas.push([`${t.definicao.agruparPor}: ${g.rotulo}`]);
    for (const l of g.linhas) linhas.push([l.rotulo, ...l.valores.map(cel)]);
    if (temTotal && t.definicao.agruparPor) linhas.push(['Subtotal', ...g.totais.map(cel)]);
  }
  if (temTotal) linhas.push(['Total', ...t.totais.map(cel)]);
  return linhas;
}

// ─── Sementes ────────────────────────────────────────────────────────────────

export const SEMENTES_DE_TABELAS: DefinicaoDeTabela[] = [
  {
    nome: 'Quadro de esquadrias',
    familia: 'opening',
    colunas: [{ chave: 'tipo' }, { chave: 'largura', total: null }, { chave: 'altura' }, { chave: 'peitoril' }, { chave: 'area', rotulo: 'Área (m²)', total: 'SOMA' }, { chave: 'pavimento.nome', rotulo: 'Pavimento' }],
    filtro: '',
    agruparPor: 'tipo',
    ordenarPor: 'largura',
    ordem: 'ASC',
  },
  {
    nome: 'Paredes por pavimento',
    familia: 'wall',
    colunas: [{ chave: 'comprimento', rotulo: 'Comprimento (m)', total: 'SOMA' }, { chave: 'espessura', rotulo: 'Espessura (m)' }, { chave: 'altura', rotulo: 'Altura (m)' }, { chave: 'area', rotulo: 'Área bruta (m²)', total: 'SOMA' }, { chave: 'volume', rotulo: 'Volume (m³)', total: 'SOMA' }],
    filtro: '',
    agruparPor: 'pavimento.nome',
    ordenarPor: 'comprimento',
    ordem: 'DESC',
  },
  {
    nome: 'Pontos elétricos com potência',
    familia: 'terminal',
    colunas: [{ chave: 'tipo' }, { chave: 'cota', rotulo: 'Cota (m)' }, { chave: 'potencia_va', rotulo: 'Potência (VA)', total: 'SOMA' }, { chave: 'pavimento.nome', rotulo: 'Pavimento' }],
    filtro: 'disciplina == "eletrica" e potencia_va > 0',
    agruparPor: 'pavimento.nome',
    ordenarPor: 'potencia_va',
    ordem: 'DESC',
  },
  {
    nome: 'Pilares e vigas',
    familia: 'structural',
    colunas: [{ chave: 'tipo' }, { chave: 'largura', rotulo: 'Largura (m)' }, { chave: 'profundidade', rotulo: 'Profundidade (m)' }, { chave: 'altura', rotulo: 'Altura (m)' }, { chave: 'comprimento', rotulo: 'Comprimento (m)', total: 'SOMA' }, { chave: 'volume', rotulo: 'Volume (m³)', total: 'SOMA' }],
    filtro: 'tipo == "pilar" ou tipo == "viga"',
    agruparPor: 'tipo',
    ordenarPor: 'volume',
    ordem: 'DESC',
  },
];

/** As sementes que a organização ainda não tem (pelo nome). */
export function faltamSementesDeTabela(existentes: readonly { nome: string }[]): DefinicaoDeTabela[] {
  const nomes = new Set(existentes.map((e) => e.nome.trim().toLowerCase()));
  return SEMENTES_DE_TABELAS.filter((s) => !nomes.has(s.nome.toLowerCase()));
}
