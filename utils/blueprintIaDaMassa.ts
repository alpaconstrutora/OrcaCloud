/**
 * ESTUDO DE MASSA — a CONVERSA no vocabulário do produto (fase M5c do plano
 * `2026-10-01-estudo-de-massa.md`, §23 do pedido).
 *
 * Mesmo princípio da IA da planta (E6.4, `blueprintIa.ts`): o pedido NUNCA
 * vira geometria. Vira MUDANÇAS ESTRUTURADAS no PRODUTO (tipologias, faixa de
 * área, mix, preço, padrão, meta, hipóteses do pavimento) e na CONFIGURAÇÃO do
 * gerador de massa (implantações, objetivo, estacionamento, pavimentos,
 * unidades mínimas); o gerador re-gera e a resposta é o DELTA entre o melhor
 * cenário de antes e o de depois. "Duas torres", "apartamentos entre 65 e 75
 * m²", "reduzir área comum", "no máximo 12 pavimentos", "sem subsolo".
 *
 * Quem traduz é a Edge Function `planta-ia` no modo "massa" (Claude, esquema
 * fechado) — e, sem IA configurada, o INTÉRPRETE LOCAL abaixo. Os dois emitem
 * o MESMO `MudancasDaMassa`, validado e aplicado aqui: a IA propõe, o código
 * decide. O que não passa na validação vai para `recusadas`, dito na tela.
 */
import type { Produto, TipologiaDoProduto } from './blueprintProduto';
import { PADROES_DO_PRODUTO, type PadraoDoProduto } from './blueprintProduto';
import {
  MODOS_DE_ESTACIONAMENTO,
  OBJETIVOS_DA_MASSA,
  ROTULO_DA_IMPLANTACAO,
  ROTULO_DO_ESTACIONAMENTO,
  ROTULO_DO_OBJETIVO,
  TIPOS_DE_IMPLANTACAO,
  type CandidatoDeMassa,
  type ConfiguracaoDoGeradorDeMassa,
  type ModoDeEstacionamento,
  type ObjetivoDaMassa,
  type TipoDeImplantacao,
} from './blueprintGeradorDeMassa';
import { formatarDoComparador } from './blueprintComparadorDeMassa';

// ─── Esquema ─────────────────────────────────────────────────────────────────

export type MudancaDeTipologia =
  /** Área de uma tipologia: absoluta ou delta. */
  | { op: 'area'; alvo: string; areaM2?: number; deltaM2?: number }
  /** "Apartamentos entre 65 e 75 m²": toda tipologia RESIDENCIAL entra na faixa. */
  | { op: 'faixa_de_area'; minM2: number; maxM2: number }
  | { op: 'proporcao'; alvo: string; proporcaoPct: number }
  /** Preço/m²: de uma tipologia (`alvo`) ou de todas; absoluto ou % sobre o atual. */
  | { op: 'preco'; alvo?: string; precoM2?: number; deltaPct?: number }
  | { op: 'adicionar'; nome?: string; uso?: 'RESIDENCIAL' | 'COMERCIAL'; dormitorios?: number; areaPrivativaM2?: number; proporcaoPct?: number }
  | { op: 'remover'; alvo: string };

export interface MudancasDaMassa {
  produto?: {
    padrao?: string;
    metaUnidades?: number | null;
    tipologias?: MudancaDeTipologia[];
    hipoteses?: { circulacaoPct?: number; paredesPct?: number; areaComumTerreoM2?: number };
  };
  gerador?: {
    tipos?: string[];
    objetivo?: string;
    estacionamento?: string;
    pavimentosMax?: number | null;
    unidadesMin?: number | null;
    atenderVagas?: boolean;
  };
  /** O que foi entendido — mostrado ao usuário. */
  entendimento: string;
}

export interface ResultadoDaAplicacaoDaMassa {
  produto: Produto;
  configuracao: ConfiguracaoDoGeradorDeMassa;
  aplicadas: string[];
  recusadas: string[];
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** A tipologia que o texto designa: pelo nome, ou por "2 dorm" / "3 quartos" / "sala" / "loja". */
export function tipologiaPorAlvo(produto: Produto, alvo: string): TipologiaDoProduto | null {
  const a = normalizar(alvo);
  const porNome = produto.tipologias.find((t) => normalizar(t.nome) === a) ?? produto.tipologias.find((t) => normalizar(t.nome).includes(a) || (a.length >= 3 && a.includes(normalizar(t.nome))));
  if (porNome) return porNome;
  const d = a.match(/(\d+)\s*(?:dorm|quarto|q\b|suite)/);
  if (d) return produto.tipologias.find((t) => t.uso === 'RESIDENCIAL' && t.dormitorios === Number(d[1])) ?? null;
  if (/studio|kitnet|quitinete/.test(a)) return produto.tipologias.find((t) => t.uso === 'RESIDENCIAL' && t.dormitorios <= 1) ?? null;
  return null;
}

const AREA_PADRAO_POR_DORMITORIOS = [35, 42, 58, 75, 120, 160];

// ─── Aplicação ───────────────────────────────────────────────────────────────

/** Aplica com validação. Nunca lança: o que não dá vai para `recusadas`. */
export function aplicarMudancasDaMassa(m: MudancasDaMassa, produto: Produto, cfg: ConfiguracaoDoGeradorDeMassa): ResultadoDaAplicacaoDaMassa {
  let p: Produto = { ...produto, tipologias: produto.tipologias.map((t) => ({ ...t })), hipoteses: { ...produto.hipoteses } };
  const c: ConfiguracaoDoGeradorDeMassa = { ...cfg, restricoes: { ...cfg.restricoes }, hipoteses: { ...cfg.hipoteses } };
  const aplicadas: string[] = [];
  const recusadas: string[] = [];
  const mp = m.produto ?? {};

  for (const mt of mp.tipologias ?? []) {
    if (mt.op === 'faixa_de_area') {
      const min = Math.min(mt.minM2, mt.maxM2);
      const max = Math.max(mt.minM2, mt.maxM2);
      if (!(min >= 15) || !(max <= 1000)) {
        recusadas.push(`faixa ${f1(mt.minM2)}–${f1(mt.maxM2)} m² fora do razoável (15 a 1.000 m²)`);
        continue;
      }
      const res = p.tipologias.filter((t) => t.uso === 'RESIDENCIAL');
      if (res.length === 0) {
        recusadas.push('faixa de área: o produto não tem tipologia residencial');
        continue;
      }
      for (const t of res) {
        const nova = Math.min(max, Math.max(min, t.areaPrivativaM2));
        if (nova !== t.areaPrivativaM2) aplicadas.push(`${t.nome}: ${f1(t.areaPrivativaM2)} → ${f1(nova)} m² (faixa ${f1(min)}–${f1(max)})`);
        else aplicadas.push(`${t.nome}: ${f1(t.areaPrivativaM2)} m² já está na faixa`);
        t.areaPrivativaM2 = nova;
      }
      continue;
    }
    if (mt.op === 'adicionar') {
      const uso = mt.uso === 'COMERCIAL' ? 'COMERCIAL' : 'RESIDENCIAL';
      const dorm = Math.max(0, Math.min(5, Math.round(mt.dormitorios ?? (uso === 'COMERCIAL' ? 0 : 2))));
      const area = mt.areaPrivativaM2 ?? AREA_PADRAO_POR_DORMITORIOS[dorm];
      if (!(area >= 15 && area <= 1000)) {
        recusadas.push(`nova tipologia: área ${f1(area)} m² fora do razoável`);
        continue;
      }
      const precos = p.tipologias.filter((t) => t.uso === uso && t.precoM2 > 0).map((t) => t.precoM2);
      let id = uso === 'COMERCIAL' ? 'sala' : `${dorm}q`;
      while (p.tipologias.some((t) => t.id === id)) id += '_';
      const nome = (mt.nome?.trim() || (uso === 'COMERCIAL' ? 'Sala' : dorm === 0 ? 'Studio' : `${dorm} dorm.`)).slice(0, 40);
      p.tipologias.push({
        id,
        nome,
        uso,
        dormitorios: dorm,
        areaPrivativaM2: area,
        vagasPorUnidade: dorm >= 3 ? 2 : 1,
        proporcaoPct: Math.max(0, Math.min(100, mt.proporcaoPct ?? 20)),
        precoM2: precos.length ? Math.round(precos.reduce((s, x) => s + x, 0) / precos.length) : 0,
      });
      aplicadas.push(`+ tipologia ${nome} (${f1(area)} m², ${f1(mt.proporcaoPct ?? 20)} % do mix)`);
      continue;
    }
    if (mt.op === 'preco' && !mt.alvo) {
      if (p.tipologias.length === 0) {
        recusadas.push('preço: o produto não tem tipologia');
        continue;
      }
      for (const t of p.tipologias) {
        const novo = mt.precoM2 != null ? mt.precoM2 : t.precoM2 * (1 + (mt.deltaPct ?? 0) / 100);
        if (!(novo >= 0 && novo <= 200_000)) {
          recusadas.push(`${t.nome}: preço ${f1(novo)} fora do razoável`);
          continue;
        }
        aplicadas.push(`${t.nome}: preço ${formatarDoComparador(t.precoM2, 'num')} → ${formatarDoComparador(Math.round(novo), 'num')} R$/m²`);
        t.precoM2 = Math.round(novo);
      }
      continue;
    }
    const t = tipologiaPorAlvo(p, mt.alvo ?? '');
    if (!t) {
      recusadas.push(`não achei a tipologia "${mt.alvo}" no produto`);
      continue;
    }
    if (mt.op === 'area') {
      const nova = mt.areaM2 != null ? mt.areaM2 : t.areaPrivativaM2 + (mt.deltaM2 ?? 0);
      if (!(nova >= 15 && nova <= 1000)) {
        recusadas.push(`${t.nome}: área ${f1(nova)} m² fora do razoável`);
        continue;
      }
      aplicadas.push(`${t.nome}: ${f1(t.areaPrivativaM2)} → ${f1(nova)} m²`);
      t.areaPrivativaM2 = Math.round(nova * 100) / 100;
    } else if (mt.op === 'proporcao') {
      if (!(mt.proporcaoPct >= 0 && mt.proporcaoPct <= 100)) {
        recusadas.push(`${t.nome}: ${f1(mt.proporcaoPct)} % fora de 0–100`);
        continue;
      }
      // Os outros do mesmo uso dividem o resto na proporção que já tinham.
      const outros = p.tipologias.filter((x) => x !== t && x.uso === t.uso);
      const somaOutros = outros.reduce((s, x) => s + x.proporcaoPct, 0);
      const resto = 100 - mt.proporcaoPct;
      for (const x of outros) x.proporcaoPct = somaOutros > 0 ? Math.round(((x.proporcaoPct / somaOutros) * resto) * 10) / 10 : Math.round((resto / outros.length) * 10) / 10;
      aplicadas.push(`${t.nome}: ${f1(t.proporcaoPct)} → ${f1(mt.proporcaoPct)} % do mix${outros.length ? ` (os outros dividem ${f1(resto)} %)` : ''}`);
      t.proporcaoPct = mt.proporcaoPct;
    } else if (mt.op === 'preco') {
      const novo = mt.precoM2 != null ? mt.precoM2 : t.precoM2 * (1 + (mt.deltaPct ?? 0) / 100);
      if (!(novo >= 0 && novo <= 200_000)) {
        recusadas.push(`${t.nome}: preço ${f1(novo)} fora do razoável`);
        continue;
      }
      aplicadas.push(`${t.nome}: preço ${formatarDoComparador(t.precoM2, 'num')} → ${formatarDoComparador(Math.round(novo), 'num')} R$/m²`);
      t.precoM2 = Math.round(novo);
    } else if (mt.op === 'remover') {
      if (p.tipologias.length <= 1) {
        recusadas.push(`${t.nome}: é a única tipologia do produto — não removi`);
        continue;
      }
      p = { ...p, tipologias: p.tipologias.filter((x) => x !== t) };
      aplicadas.push(`− tipologia ${t.nome}`);
    }
  }

  if (mp.padrao != null) {
    const alvo = PADROES_DO_PRODUTO.find((x) => x.toLowerCase() === String(mp.padrao).toLowerCase());
    if (alvo) {
      aplicadas.push(`padrão ${p.padrao} → ${alvo}`);
      p = { ...p, padrao: alvo as PadraoDoProduto };
    } else recusadas.push(`padrão "${mp.padrao}" não é um padrão do CUB (${PADROES_DO_PRODUTO.slice(0, 6).join(', ')}…)`);
  }
  if (mp.metaUnidades !== undefined) {
    const v = mp.metaUnidades == null ? null : Math.round(mp.metaUnidades);
    if (v != null && !(v >= 1 && v <= 10000)) recusadas.push(`meta de ${v} unidades fora do razoável`);
    else {
      aplicadas.push(v == null ? 'sem meta de unidades' : `meta de ${v} unidades`);
      p = { ...p, metaUnidades: v };
    }
  }
  const h = mp.hipoteses ?? {};
  if (h.circulacaoPct != null) {
    if (h.circulacaoPct >= 0 && h.circulacaoPct <= 50) {
      aplicadas.push(`corredor do andar ${f1(p.hipoteses.circulacaoPct)} → ${f1(h.circulacaoPct)} % da área útil`);
      p.hipoteses.circulacaoPct = h.circulacaoPct;
    } else recusadas.push(`circulação de ${f1(h.circulacaoPct)} % fora de 0–50`);
  }
  if (h.paredesPct != null) {
    if (h.paredesPct >= 0 && h.paredesPct <= 40) {
      aplicadas.push(`paredes ${f1(p.hipoteses.paredesPct)} → ${f1(h.paredesPct)} %`);
      p.hipoteses.paredesPct = h.paredesPct;
    } else recusadas.push(`paredes de ${f1(h.paredesPct)} % fora de 0–40`);
  }
  if (h.areaComumTerreoM2 != null) {
    if (h.areaComumTerreoM2 >= 0 && h.areaComumTerreoM2 <= 10000) {
      aplicadas.push(`área comum do térreo ${f1(p.hipoteses.areaComumTerreoM2)} → ${f1(h.areaComumTerreoM2)} m²`);
      p.hipoteses.areaComumTerreoM2 = h.areaComumTerreoM2;
    } else recusadas.push(`área comum de ${f1(h.areaComumTerreoM2)} m² fora do razoável`);
  }

  const g = m.gerador ?? {};
  if (g.tipos) {
    const validos = g.tipos.filter((t): t is TipoDeImplantacao => (TIPOS_DE_IMPLANTACAO as readonly string[]).includes(t));
    const invalidos = g.tipos.filter((t) => !(TIPOS_DE_IMPLANTACAO as readonly string[]).includes(t));
    if (invalidos.length) recusadas.push(`implantação desconhecida: ${invalidos.join(', ')}`);
    if (validos.length) {
      c.hipoteses.tipos = TIPOS_DE_IMPLANTACAO.filter((t) => validos.includes(t));
      aplicadas.push(`implantações: ${c.hipoteses.tipos.map((t) => ROTULO_DA_IMPLANTACAO[t].toLowerCase()).join(', ')}`);
    }
  }
  if (g.objetivo != null) {
    if ((OBJETIVOS_DA_MASSA as readonly string[]).includes(g.objetivo)) {
      c.objetivo = g.objetivo as ObjetivoDaMassa;
      aplicadas.push(`objetivo: ${ROTULO_DO_OBJETIVO[c.objetivo].toLowerCase()}`);
    } else recusadas.push(`objetivo desconhecido: ${g.objetivo}`);
  }
  if (g.estacionamento != null) {
    if ((MODOS_DE_ESTACIONAMENTO as readonly string[]).includes(g.estacionamento)) {
      c.hipoteses.estacionamento = g.estacionamento as ModoDeEstacionamento;
      aplicadas.push(`estacionamento: ${ROTULO_DO_ESTACIONAMENTO[c.hipoteses.estacionamento].toLowerCase()}`);
    } else recusadas.push(`estacionamento desconhecido: ${g.estacionamento}`);
  }
  if (g.pavimentosMax !== undefined) {
    const v = g.pavimentosMax == null ? null : Math.round(g.pavimentosMax);
    if (v != null && !(v >= 1 && v <= 200)) recusadas.push(`${v} pavimentos fora do razoável`);
    else {
      c.restricoes.pavimentosMax = v;
      aplicadas.push(v == null ? 'pavimentos: só o que a lei deixa' : `no máximo ${v} pavimentos`);
    }
  }
  if (g.unidadesMin !== undefined) {
    const v = g.unidadesMin == null ? null : Math.round(g.unidadesMin);
    if (v != null && !(v >= 1 && v <= 10000)) recusadas.push(`${v} unidades fora do razoável`);
    else {
      c.restricoes.unidadesMin = v;
      aplicadas.push(v == null ? 'sem mínimo de unidades' : `pelo menos ${v} unidades`);
    }
  }
  if (g.atenderVagas !== undefined) {
    c.restricoes.atenderVagas = !!g.atenderVagas;
    aplicadas.push(g.atenderVagas ? 'vagas exigidas atendidas' : 'vagas NÃO exigidas');
  }
  return { produto: p, configuracao: c, aplicadas, recusadas };
}

// ─── Intérprete local (sem IA) ───────────────────────────────────────────────

const NUM = '(\\d+(?:[.,]\\d+)?)';
/** "9.500" é nove mil e quinhentos; "65,5" é sessenta e cinco e meio. */
const num = (s: string) => Number(/^\d{1,3}(?:\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(',', '.'));

const IMPLANTACOES_NO_TEXTO: [RegExp, TipoDeImplantacao][] = [
  [/\b(?:duas|2) torres\b/, 'DUAS_TORRES'],
  [/\b(?:torre unica|uma torre|1 torre|torre isolada|so uma torre)\b/, 'TORRE'],
  [/\b(?:lamina|bloco longitudinal|bloco linear|predio linear)\b/, 'LAMINA'],
  [/\bblocos paralelos\b/, 'BLOCOS_PARALELOS'],
  [/\b(?:em|formato de|bloco) l\b/, 'EM_L'],
  [/\b(?:em|formato de|bloco) u\b/, 'EM_U'],
  [/\b(?:em|formato de|bloco) h\b/, 'EM_H'],
  [/\b(?:embasamento|podium|podio)\b/, 'EMBASAMENTO_E_TORRE'],
];

const OBJETIVOS_NO_TEXTO: [RegExp, ObjetivoDaMassa][] = [
  [/(?:reduz|diminu|menos|minimiz|menor)\w*\s+(?:a\s+)?area comum/, 'MENOR_COMUM'],
  [/(?:reduz|diminu|menos|minimiz|menor)\w*\s+(?:o\s+|a\s+)?(?:area de\s+)?(?:estacionamento|garagem)/, 'MENOR_GARAGEM'],
  [/(?:reduz|diminu|minimiz|menor)\w*\s+(?:o\s+)?custo|mais barat/, 'MENOR_CUSTO'],
  [/(?:maximiz|mais|maior)\w*\s+(?:o\s+)?vgv/, 'VGV'],
  [/(?:maximiz|mais|maior)\w*\s+(?:o\s+)?(?:lucro|resultado|margem)/, 'RESULTADO'],
  [/(?:maximiz|mais|maior)\w*\s+(?:o\s+numero de\s+)?(?:unidades|apartamentos)\b(?!\s+(?:de|entre|com))/, 'UNIDADES'],
  [/(?:maximiz|mais|maior)\w*\s+(?:a\s+)?area vendavel/, 'VENDAVEL'],
  [/(?:maximiz|mais|maior)\w*\s+(?:a\s+)?eficiencia/, 'EFICIENCIA'],
  [/(?:maximiz|mais|maior)\w*\s+(?:o\s+)?sol\b|(?:maximiz|mais|maior|melhor)\w*\s+(?:a\s+)?insolacao/, 'INSOLACAO'],
];

/** Os pedidos comuns por padrão de texto. `null` quando não entendeu nada. */
export function interpretarPedidoDaMassaLocal(pedido: string, produto: Produto): MudancasDaMassa | null {
  const t = normalizar(pedido).replace(/m²/g, 'm2');
  const m: MudancasDaMassa = { entendimento: '' };
  const tip: MudancaDeTipologia[] = [];
  const ger: NonNullable<MudancasDaMassa['gerador']> = {};
  const prod: NonNullable<MudancasDaMassa['produto']> = {};
  const frases: string[] = [];
  let r: RegExpMatchArray | null;

  // Implantações citadas: a biblioteca passa a ser só elas.
  const tipos = IMPLANTACOES_NO_TEXTO.filter(([re]) => re.test(t)).map(([, tp]) => tp);
  if (tipos.length) {
    ger.tipos = tipos;
    frases.push(`implantações: ${tipos.map((x) => ROTULO_DA_IMPLANTACAO[x].toLowerCase()).join(', ')}`);
  }
  // "apartamentos entre 65 e 75 m2" / "unidades de 60 a 70 m2" / "entre 65 e 75 m2"
  if ((r = t.match(new RegExp(`(?:apartamentos?|aptos?|unidades?)?\\s*(?:entre|de)\\s+${NUM}\\s*(?:m2)?\\s*(?:e|a)\\s+${NUM}\\s*m2`)))) {
    tip.push({ op: 'faixa_de_area', minM2: num(r[1]), maxM2: num(r[2]) });
    frases.push(`apartamentos entre ${r[1]} e ${r[2]} m²`);
  } else if ((r = t.match(new RegExp(`(?:apartamentos?|aptos?)\\s+(?:de|com)\\s+${NUM}\\s*m2`)))) {
    tip.push({ op: 'faixa_de_area', minM2: num(r[1]), maxM2: num(r[1]) });
    frases.push(`apartamentos de ${r[1]} m²`);
  }
  // "3 dormitorios com 80 m2" / "o de 2 quartos com 60 m2" / "2 dorm +5 m2"
  const areaDeTipo = new RegExp(`(\\d)\\s*(?:dorm\\w*|quartos?|q)\\.?\\s+(?:com|de|para)\\s+${NUM}\\s*m2`, 'g');
  while ((r = areaDeTipo.exec(t))) {
    tip.push({ op: 'area', alvo: `${r[1]} dorm`, areaM2: num(r[2]) });
    frases.push(`${r[1]} dorm. com ${r[2]} m²`);
  }
  const deltaDeTipo = new RegExp(`(\\d)\\s*(?:dorm\\w*|quartos?|q)\\.?\\s*([+-])\\s*${NUM}\\s*m2`, 'g');
  while ((r = deltaDeTipo.exec(t))) {
    const d = (r[2] === '-' ? -1 : 1) * num(r[3]);
    tip.push({ op: 'area', alvo: `${r[1]} dorm`, deltaM2: d });
    frases.push(`${r[1]} dorm. ${d > 0 ? '+' : ''}${f1(d)} m²`);
  }
  // "60% de 2 dorm" / "60% dos apartamentos de 2 quartos"
  const prop = new RegExp(`${NUM}\\s*%\\s*(?:de|dos|das)?\\s*(?:apartamentos?\\s+de\\s+|unidades\\s+de\\s+)?(\\d)\\s*(?:dorm|quarto|q)`, 'g');
  while ((r = prop.exec(t))) {
    tip.push({ op: 'proporcao', alvo: `${r[2]} dorm`, proporcaoPct: num(r[1]) });
    frases.push(`${r[1]} % de ${r[2]} dorm.`);
  }
  // "sem 3 dormitorios" / "tire o de 1 quarto" / "remova o studio"
  const rem = /(?:sem|tire|tira|remov\w*|exclu\w*)\s+(?:o\s+|os\s+|a\s+|as\s+)?(?:de\s+|apartamentos?\s+de\s+)?(\d\s*(?:dorm|quarto|q)\w*|studio)/g;
  while ((r = rem.exec(t))) {
    tip.push({ op: 'remover', alvo: r[1] });
    frases.push(`sem ${r[1]}`);
  }
  // "adicione 1 dorm com 40 m2" / "inclua um studio de 32 m2"
  const add = new RegExp(`(?:adicion|inclu|acrescent)\\w*\\s+(?:um\\s+|uma\\s+|a\\s+tipologia\\s+)?(?:(\\d)\\s*(?:dorm|quarto|q)\\w*|(studio))(?:\\s+(?:com|de)\\s+${NUM}\\s*m2)?`, 'g');
  while ((r = add.exec(t))) {
    const dorm = r[2] ? 0 : Number(r[1]);
    tip.push({ op: 'adicionar', dormitorios: dorm, nome: r[2] ? 'Studio' : undefined, areaPrivativaM2: r[3] ? num(r[3]) : undefined });
    frases.push(`+ ${r[2] ? 'studio' : `${dorm} dorm.`}${r[3] ? ` de ${r[3]} m²` : ''}`);
  }
  // Preço: "preço de 9.500/m2" / "preco 9500 por m2" / "aumente o preço em 5%" / "reduza o preco em 3 %"
  if ((r = t.match(new RegExp(`(aument|reduz|diminu)\\w*\\s+(?:o\\s+)?(?:preco|valor de venda)\\w*\\s+(?:em\\s+)?${NUM}\\s*%`)))) {
    const d = (/^(reduz|diminu)/.test(r[1]) ? -1 : 1) * num(r[2]);
    tip.push({ op: 'preco', deltaPct: d });
    frases.push(`preço ${d > 0 ? '+' : ''}${f1(d)} %`);
  } else if ((r = t.match(/(?:preco|valor de venda)\w*\s+(?:de\s+)?(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(?:\/|por)\s*m2/))) {
    tip.push({ op: 'preco', precoM2: num(r[1]) });
    frases.push(`preço ${r[1]} R$/m²`);
  }
  // Objetivo: o primeiro citado no texto.
  const objs = OBJETIVOS_NO_TEXTO.map(([re, o]) => ({ o, i: t.search(re) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  if (objs.length) {
    ger.objetivo = objs[0].o;
    frases.push(`objetivo: ${ROTULO_DO_OBJETIVO[objs[0].o].toLowerCase()}`);
  }
  // Pavimentos: "no máximo 12 pavimentos" / "até 8 andares" / "10 pavimentos"
  if ((r = t.match(/(?:no maximo|ate|maximo de|limite de)?\s*(\d+)\s*(?:pavimentos|pav\b|andares)/))) {
    ger.pavimentosMax = Number(r[1]);
    frases.push(`até ${r[1]} pavimentos`);
  }
  // Unidades: "pelo menos 60 unidades" / "no minimo 40 apartamentos" / "quero 80 apartamentos"
  if ((r = t.match(/(?:pelo menos|no minimo|minimo de|quero|precis\w* de)\s+(\d+)\s*(?:unidades|apartamentos|aptos)/))) {
    ger.unidadesMin = Number(r[1]);
    frases.push(`pelo menos ${r[1]} unidades`);
  }
  if ((r = t.match(/meta de\s+(\d+)\s*(?:unidades|apartamentos|aptos)?/))) {
    prod.metaUnidades = Number(r[1]);
    frases.push(`meta de ${r[1]} unidades`);
  }
  // Estacionamento
  const est: [RegExp, ModoDeEstacionamento, string][] = [
    [/\bsem garagem\b|\bsem estacionamento\b/, 'SEM_GARAGEM', 'sem garagem'],
    [/\b(?:2|dois) subsolos\b/, 'SUBSOLO_2', '2 subsolos'],
    [/\b(?:1|um) subsolo\b/, 'SUBSOLO_1', '1 subsolo'],
    [/\bsem subsolo\b|\bpilotis\b/, 'PILOTIS', 'garagem em pilotis (sem subsolo)'],
  ];
  const e = est.find(([re]) => re.test(t));
  if (e) {
    ger.estacionamento = e[1];
    frases.push(e[2]);
  }
  if (/(?:nao|sem)\s+exig\w*\s+(?:as\s+)?vagas|ignor\w*\s+(?:as\s+)?vagas/.test(t)) {
    ger.atenderVagas = false;
    frases.push('sem exigir as vagas');
  } else if (/\bexij\w*\s+(?:as\s+)?vagas|atend\w*\s+(?:as\s+)?vagas/.test(t)) {
    ger.atenderVagas = true;
    frases.push('vagas exigidas');
  }
  // Padrão do CUB: "padrão R16-A"
  if ((r = t.match(/padrao\s+([a-z0-9]+-[a-z])\b/))) {
    prod.padrao = r[1].toUpperCase();
    frases.push(`padrão ${prod.padrao}`);
  }
  // Hipóteses do pavimento
  if ((r = t.match(new RegExp(`(?:corredor|circulacao)\\D*${NUM}\\s*%`)))) {
    prod.hipoteses = { ...prod.hipoteses, circulacaoPct: num(r[1]) };
    frases.push(`circulação ${r[1]} %`);
  }
  if ((r = t.match(new RegExp(`area comum (?:do terreo\\s+)?(?:de\\s+)?${NUM}\\s*m2`)))) {
    prod.hipoteses = { ...prod.hipoteses, areaComumTerreoM2: num(r[1]) };
    frases.push(`área comum do térreo ${r[1]} m²`);
  }

  if (tip.length) prod.tipologias = tip;
  if (Object.keys(prod).length) m.produto = prod;
  if (Object.keys(ger).length) m.gerador = ger;
  if (frases.length === 0) return null;
  m.entendimento = `Entendi (intérprete local): ${frases.join('; ')}.`;
  // Para alvos que o produto não tem, o aplicador recusa e diz — não adivinhamos aqui.
  void produto;
  return m;
}

/** Valida um objeto vindo de fora (a Edge Function) como `MudancasDaMassa`. Descarta o que não reconhece. */
export function mudancasDaMassaDaResposta(raw: unknown): MudancasDaMassa | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: MudancasDaMassa = { entendimento: typeof r.entendimento === 'string' ? r.entendimento : 'Mudanças propostas pela IA.' };
  if (r.produto && typeof r.produto === 'object') {
    const p = r.produto as Record<string, unknown>;
    out.produto = {};
    if (typeof p.padrao === 'string') out.produto.padrao = p.padrao;
    if (p.metaUnidades === null || typeof p.metaUnidades === 'number') out.produto.metaUnidades = p.metaUnidades as number | null;
    if (Array.isArray(p.tipologias)) out.produto.tipologias = p.tipologias.filter((x): x is MudancaDeTipologia => !!x && typeof x === 'object' && typeof (x as { op?: unknown }).op === 'string');
    if (p.hipoteses && typeof p.hipoteses === 'object') out.produto.hipoteses = p.hipoteses as NonNullable<MudancasDaMassa['produto']>['hipoteses'];
  }
  if (r.gerador && typeof r.gerador === 'object') {
    const g = r.gerador as Record<string, unknown>;
    out.gerador = {};
    if (Array.isArray(g.tipos)) out.gerador.tipos = g.tipos.filter((x): x is string => typeof x === 'string');
    if (typeof g.objetivo === 'string') out.gerador.objetivo = g.objetivo;
    if (typeof g.estacionamento === 'string') out.gerador.estacionamento = g.estacionamento;
    if (g.pavimentosMax === null || typeof g.pavimentosMax === 'number') out.gerador.pavimentosMax = g.pavimentosMax as number | null;
    if (g.unidadesMin === null || typeof g.unidadesMin === 'number') out.gerador.unidadesMin = g.unidadesMin as number | null;
    if (typeof g.atenderVagas === 'boolean') out.gerador.atenderVagas = g.atenderVagas;
  }
  return out;
}

// ─── Delta ───────────────────────────────────────────────────────────────────

/** "melhor: Torre única · 10 pav → Duas torres · 11 pav · unidades 59 → 64 (+5) · VGV R$ 33,9 mi → R$ 35,2 mi". */
export function deltaDaMassa(antes: CandidatoDeMassa | null, depois: CandidatoDeMassa | null): string {
  if (!depois) return antes ? 'nenhuma implantação atende ao pedido — veja os avisos' : 'nenhuma implantação viável';
  const d = depois.cenario;
  if (!antes) return `melhor: ${depois.rotulo} · ${d.unidades} unidades · VGV ${formatarDoComparador(d.vgv, 'brl')} · resultado ${formatarDoComparador(d.resultado, 'brl')}`;
  const a = antes.cenario;
  const partes = [antes.rotulo === depois.rotulo ? `melhor: ${depois.rotulo} (a mesma)` : `melhor: ${antes.rotulo} → ${depois.rotulo}`];
  const linha = (rot: string, va: number | null, vd: number | null, f: 'num' | 'brl' | 'm2' | 'pct' | 'h') => {
    if (va == null && vd == null) return;
    // Igual no que a tela mostra (65,2 → 65,4 m² formata "65 m²" nos dois): não é mudança para quem lê.
    if (formatarDoComparador(va, f) === formatarDoComparador(vd, f)) return;
    const dif = va != null && vd != null ? vd - va : null;
    partes.push(`${rot} ${formatarDoComparador(va, f)} → ${formatarDoComparador(vd, f)}${dif != null && f === 'num' ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}`);
  };
  linha('unidades', a.unidades, d.unidades, 'num');
  linha('pavimentos', a.pavimentosMax, d.pavimentosMax, 'num');
  linha('vendável', a.areaVendavelM2, d.areaVendavelM2, 'm2');
  linha('área comum/un.', a.areaComumPorUnidadeM2, d.areaComumPorUnidadeM2, 'm2');
  linha('VGV', a.vgv, d.vgv, 'brl');
  linha('resultado', a.resultado, d.resultado, 'brl');
  linha('sol nas fachadas', a.solNasFachadasH, d.solNasFachadasH, 'h');
  if (partes.length === 1) partes.push('indicadores iguais');
  return partes.join(' · ');
}
