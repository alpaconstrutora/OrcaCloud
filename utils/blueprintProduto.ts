/**
 * ESTUDO DE MASSA — o PRODUTO (fase M2 do plano `2026-10-01-estudo-de-massa.md`).
 *
 * Depois do envelope e da massa (M1), o que se vende: tipologias (dormitórios,
 * área privativa alvo, vagas por unidade, participação no mix), o padrão
 * construtivo (as chaves do CUB que o Estimador Paramétrico já usa — a M3 as
 * transforma em custo) e as hipóteses de perda do pavimento.
 *
 * ─── O QUE ESTE MÓDULO FAZ ──────────────────────────────────────────────────
 *
 * `distribuirProduto` pega a massa medida (M1) e, bloco a bloco, pavimento a
 * pavimento, desconta da área bruta o NÚCLEO (escada, hall, shafts, elevadores
 * — reservado ANTES da área vendável, como o pedido manda), as paredes e a
 * circulação do andar; o que sobra é a privativa disponível, repartida em
 * unidades pelo mix. Garagem conta vagas pelo MESMO lançador da E2.5
 * (`planejarVagas`), num modelo provisório com o contorno do bloco — fileiras
 * de verdade, não m²/vaga chutado.
 *
 * ─── PURO, E DIZ O QUE SUPÔS ────────────────────────────────────────────────
 *
 * Nada aqui grava nem lê banco. Toda hipótese tem nome e valor na tela; o núcleo
 * diz se veio do desenho ou da hipótese. Unidades por `floor` (nunca `round`):
 * arredondar para cima estouraria a área do pavimento.
 */
import {
  applyBatch,
  contornoDaEscada,
  emptyModel,
  pointInPolygon,
  signedArea,
  type BlueprintModel,
  type Bloco,
  type Command,
  type ObjectId,
  type Point,
  type UsoDoBloco,
} from './blueprintKernel';
import { centroDoAnel, type MedidaDaMassa, type MedidaDoBloco } from './blueprintMassa';
import { HIPOTESES_VAGAS_PADRAO, planejarVagas, type ArranjoDasVagas } from './blueprintVagasAutomaticas';
import { FICHA_DO_ELEVADOR } from './blueprintNucleoVertical';

// ─── Vocabulário ─────────────────────────────────────────────────────────────

/** As chaves do CUB (NBR 12721) do Estimador Paramétrico — `CUB_STANDARDS_DATA`. */
export const PADROES_DO_PRODUTO = ['PIS', 'PP-B', 'PP-N', 'R8-B', 'R8-N', 'R8-A', 'R16-N', 'R16-A', 'CSL8-N', 'CSL8-A', 'CSL16-N', 'CSL16-A', 'CAL8-N', 'CAL8-A', 'GI', 'R1-B', 'R1-N', 'R1-A', 'RP1Q'] as const;
export type PadraoDoProduto = (typeof PADROES_DO_PRODUTO)[number];

export const USOS_DA_TIPOLOGIA = ['RESIDENCIAL', 'COMERCIAL'] as const;
export type UsoDaTipologia = (typeof USOS_DA_TIPOLOGIA)[number];
export const ROTULO_DO_USO_DA_TIPOLOGIA: Record<UsoDaTipologia, string> = { RESIDENCIAL: 'Residencial', COMERCIAL: 'Comercial' };

export interface TipologiaDoProduto {
  id: string;
  /** "2 dorm.", "Studio", "Sala 40". */
  nome: string;
  uso: UsoDaTipologia;
  dormitorios: number;
  /** Área privativa ALVO, m². */
  areaPrivativaM2: number;
  /** Média por unidade (1,5 = metade com 2 vagas). */
  vagasPorUnidade: number;
  /** Participação no mix, em NÚMERO de unidades, 0–100. Normalizada entre as do mesmo uso. */
  proporcaoPct: number;
  /** M3: preço de venda por m² de área privativa, R$. 0 = sem preço (não entra no VGV). */
  precoM2: number;
}

export interface HipotesesDoProduto {
  /** Paredes e fachada: % da área bruta do pavimento que não é piso útil. */
  paredesPct: number;
  /** Corredor do andar: % da área útil (depois do núcleo e das paredes). */
  circulacaoPct: number;
  /** Escada enclausurada + hall + shafts, m² por pavimento. Some se a escada estiver desenhada. */
  nucleoBaseM2: number;
  /** Por elevador (caixa da ficha de 8 passageiros + folga), m² por pavimento. */
  elevadorM2: number;
  /** A partir de quantos pavimentos acima do solo o prédio tem 1 elevador; e 2. */
  pavimentosParaElevador: number;
  pavimentosParaSegundoElevador: number;
  /** Portaria/hall/lazer no 1º pavimento acima do solo de bloco com unidades, m². */
  areaComumTerreoM2: number;
  /** Arranjo das vagas na garagem (E2.5/P2.7). */
  arranjoDasVagas: ArranjoDasVagas;
}

export const HIPOTESES_DO_PRODUTO_PADRAO: HipotesesDoProduto = {
  paredesPct: 6,
  circulacaoPct: 8,
  nucleoBaseM2: 24,
  elevadorM2: 5,
  pavimentosParaElevador: 5,
  pavimentosParaSegundoElevador: 9,
  areaComumTerreoM2: 60,
  arranjoDasVagas: 'PERPENDICULAR',
};

/**
 * M3 — as hipóteses FINANCEIRAS do estudo. Ordem de grandeza de pré-viabilidade,
 * ditas na tela: o fluxo de caixa, a TIR e o VPL são da Viabilidade (Imovib),
 * que recebe a estrutura pelo Empreendimento.
 */
export interface HipotesesFinanceiras {
  /** UF do CUB (tabela `cub_parametric_data`). */
  uf: string;
  /** Custo de obra por m² digitado; `null` = CUB do padrão × (1 + acréscimos). */
  custoM2Manual: number | null;
  /** Itens fora do CUB pela NBR 12721 (fundações, elevadores, projetos, BDI…), % sobre o CUB. */
  acrescimosSobreCubPct: number;
  /** Custo relativo do m² de garagem acima do solo (1 = igual ao da torre). */
  fatorGaragem: number;
  /** Custo relativo do m² de subsolo (escavação, contenção, impermeabilização). */
  fatorSubsolo: number;
  /** Custo do terreno, R$. */
  terrenoR$: number;
  /** Corretagem + marketing, % do VGV. */
  despesasComerciaisPct: number;
  /** Tributos sobre a receita (RET ou presumido), % do VGV. */
  impostosPct: number;
  /** Incorporação, projetos, legalização, administração, % do VGV. */
  outrasDespesasPct: number;
}

export const HIPOTESES_FINANCEIRAS_PADRAO: HipotesesFinanceiras = {
  uf: 'MG',
  custoM2Manual: null,
  acrescimosSobreCubPct: 25,
  fatorGaragem: 0.6,
  fatorSubsolo: 1.3,
  terrenoR$: 0,
  despesasComerciaisPct: 6,
  impostosPct: 4,
  outrasDespesasPct: 5,
};

export interface Produto {
  nome: string;
  padrao: PadraoDoProduto;
  tipologias: TipologiaDoProduto[];
  /** "Quero 40 apartamentos": a meta, conferida contra o que cabe. `null` = sem meta. */
  metaUnidades: number | null;
  hipoteses: HipotesesDoProduto;
  /** M3. Ausente em produto gravado antes da M3 — `produtoDaColuna` preenche. */
  financeiro: HipotesesFinanceiras;
}

export function produtoVazio(): Produto {
  return { nome: 'Produto', padrao: 'R8-N', tipologias: [], metaUnidades: null, hipoteses: { ...HIPOTESES_DO_PRODUTO_PADRAO }, financeiro: { ...HIPOTESES_FINANCEIRAS_PADRAO } };
}

// ─── Sementes ────────────────────────────────────────────────────────────────

export const SEMENTES_DO_PRODUTO = {
  RESIDENCIAL_ECONOMICO: 'Residencial econômico',
  RESIDENCIAL_MEDIO: 'Residencial médio',
  RESIDENCIAL_ALTO: 'Residencial alto padrão',
  COMERCIAL: 'Comercial (salas e lojas)',
  MISTO: 'Uso misto',
} as const;
export type SementeDoProduto = keyof typeof SEMENTES_DO_PRODUTO;

const t = (id: string, nome: string, uso: UsoDaTipologia, dormitorios: number, areaPrivativaM2: number, vagasPorUnidade: number, proporcaoPct: number, precoM2: number): TipologiaDoProduto => ({
  id,
  nome,
  uso,
  dormitorios,
  areaPrivativaM2,
  vagasPorUnidade,
  proporcaoPct,
  precoM2,
});

/** Mixes de MERCADO, ditos como referência — não norma. O usuário ajusta. */
export function produtoSemente(s: SementeDoProduto): Produto {
  const base = { ...produtoVazio(), nome: SEMENTES_DO_PRODUTO[s] };
  switch (s) {
    case 'RESIDENCIAL_ECONOMICO':
      return { ...base, padrao: 'PP-N', tipologias: [t('2q', '2 dorm.', 'RESIDENCIAL', 2, 45, 1, 80, 5500), t('1q', '1 dorm.', 'RESIDENCIAL', 1, 35, 1, 20, 5800)] };
    case 'RESIDENCIAL_MEDIO':
      return { ...base, padrao: 'R8-N', tipologias: [t('2q', '2 dorm.', 'RESIDENCIAL', 2, 58, 1, 50, 8500), t('3q', '3 dorm. (1 suíte)', 'RESIDENCIAL', 3, 75, 2, 50, 8800)] };
    case 'RESIDENCIAL_ALTO':
      return { ...base, padrao: 'R16-A', hipoteses: { ...HIPOTESES_DO_PRODUTO_PADRAO, areaComumTerreoM2: 150 }, tipologias: [t('3q', '3 suítes', 'RESIDENCIAL', 3, 120, 2, 60, 13000), t('4q', '4 suítes', 'RESIDENCIAL', 4, 160, 3, 40, 14000)] };
    case 'COMERCIAL':
      return { ...base, padrao: 'CSL8-N', tipologias: [t('sala', 'Sala', 'COMERCIAL', 0, 40, 1, 80, 9000), t('loja', 'Loja', 'COMERCIAL', 0, 90, 2, 20, 11000)] };
    case 'MISTO':
      return {
        ...base,
        padrao: 'R8-N',
        tipologias: [t('2q', '2 dorm.', 'RESIDENCIAL', 2, 58, 1, 60, 8500), t('3q', '3 dorm. (1 suíte)', 'RESIDENCIAL', 3, 75, 2, 40, 8800), t('loja', 'Loja', 'COMERCIAL', 0, 90, 2, 100, 11000)],
      };
  }
}

// ─── Leitura tolerante da coluna JSONB ───────────────────────────────────────

const num = (v: unknown, padrao: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/** A coluna como veio do banco → um `Produto` válido; o que não serve cai no padrão. */
export function produtoDaColuna(raw: unknown): Produto {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const vazio = produtoVazio();
  const h = (o.hipoteses && typeof o.hipoteses === 'object' ? o.hipoteses : {}) as Record<string, unknown>;
  const ids = new Set<string>();
  const tipologias: TipologiaDoProduto[] = [];
  for (const x of Array.isArray(o.tipologias) ? o.tipologias : []) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    let id = typeof r.id === 'string' && r.id ? r.id : `t${tipologias.length + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    tipologias.push({
      id,
      nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome.trim().slice(0, 40) : `Tipologia ${tipologias.length + 1}`,
      uso: (USOS_DA_TIPOLOGIA as readonly string[]).includes(r.uso as string) ? (r.uso as UsoDaTipologia) : 'RESIDENCIAL',
      dormitorios: Math.round(num(r.dormitorios, 2, 0, 10)),
      areaPrivativaM2: num(r.areaPrivativaM2, 60, 10, 5000),
      vagasPorUnidade: num(r.vagasPorUnidade, 1, 0, 10),
      proporcaoPct: num(r.proporcaoPct, 0, 0, 100),
      precoM2: num(r.precoM2, 0, 0, 1_000_000),
    });
  }
  const P = HIPOTESES_DO_PRODUTO_PADRAO;
  const F = HIPOTESES_FINANCEIRAS_PADRAO;
  const f = (o.financeiro && typeof o.financeiro === 'object' ? o.financeiro : {}) as Record<string, unknown>;
  return {
    nome: typeof o.nome === 'string' && o.nome.trim() ? o.nome.trim().slice(0, 60) : vazio.nome,
    padrao: (PADROES_DO_PRODUTO as readonly string[]).includes(o.padrao as string) ? (o.padrao as PadraoDoProduto) : vazio.padrao,
    tipologias,
    metaUnidades: o.metaUnidades == null || o.metaUnidades === '' ? null : Math.round(num(o.metaUnidades, 0, 0, 100000)) || null,
    hipoteses: {
      paredesPct: num(h.paredesPct, P.paredesPct, 0, 40),
      circulacaoPct: num(h.circulacaoPct, P.circulacaoPct, 0, 50),
      nucleoBaseM2: num(h.nucleoBaseM2, P.nucleoBaseM2, 0, 500),
      elevadorM2: num(h.elevadorM2, P.elevadorM2, 0, 50),
      pavimentosParaElevador: Math.round(num(h.pavimentosParaElevador, P.pavimentosParaElevador, 1, 200)),
      pavimentosParaSegundoElevador: Math.round(num(h.pavimentosParaSegundoElevador, P.pavimentosParaSegundoElevador, 1, 200)),
      areaComumTerreoM2: num(h.areaComumTerreoM2, P.areaComumTerreoM2, 0, 10000),
      arranjoDasVagas: (['PERPENDICULAR', 'ESPINHA_45', 'PARALELA'] as const).includes(h.arranjoDasVagas as ArranjoDasVagas) ? (h.arranjoDasVagas as ArranjoDasVagas) : P.arranjoDasVagas,
    },
    financeiro: {
      uf: typeof f.uf === 'string' && /^[A-Z]{2}$/.test(f.uf) ? f.uf : F.uf,
      custoM2Manual: f.custoM2Manual == null || f.custoM2Manual === '' ? null : num(f.custoM2Manual, 0, 0, 1_000_000) || null,
      acrescimosSobreCubPct: num(f.acrescimosSobreCubPct, F.acrescimosSobreCubPct, 0, 300),
      fatorGaragem: num(f.fatorGaragem, F.fatorGaragem, 0, 5),
      fatorSubsolo: num(f.fatorSubsolo, F.fatorSubsolo, 0, 5),
      terrenoR$: num(f['terrenoR$'], F.terrenoR$, 0, 1e12),
      despesasComerciaisPct: num(f.despesasComerciaisPct, F.despesasComerciaisPct, 0, 50),
      impostosPct: num(f.impostosPct, F.impostosPct, 0, 50),
      outrasDespesasPct: num(f.outrasDespesasPct, F.outrasDespesasPct, 0, 50),
    },
  };
}

/** Problemas que a tela ACUSA (não trava): mix que não fecha, uso sem tipologia… */
export function problemasDoProduto(p: Produto): string[] {
  const out: string[] = [];
  for (const uso of USOS_DA_TIPOLOGIA) {
    const doUso = p.tipologias.filter((x) => x.uso === uso);
    if (doUso.length === 0) continue;
    const soma = doUso.reduce((s, x) => s + x.proporcaoPct, 0);
    if (soma === 0) out.push(`${ROTULO_DO_USO_DA_TIPOLOGIA[uso]}: nenhuma tipologia com participação no mix.`);
    else if (Math.abs(soma - 100) > 0.5) out.push(`${ROTULO_DO_USO_DA_TIPOLOGIA[uso]}: o mix soma ${soma.toLocaleString('pt-BR')} % — as participações são normalizadas para 100 %.`);
  }
  if (p.hipoteses.pavimentosParaSegundoElevador < p.hipoteses.pavimentosParaElevador) out.push('O 2º elevador está pedido antes do 1º — confira as hipóteses do núcleo.');
  return out;
}

// ─── Núcleo ──────────────────────────────────────────────────────────────────

export interface NucleoDoBloco {
  m2: number;
  elevadores: number;
  origem: 'DESENHADO' | 'SUGERIDO' | 'NENHUM';
  explicacao: string;
}

/** Elevadores pela hipótese: pelo número de pavimentos acima do solo do prédio. */
export function elevadoresSugeridos(pavimentosAcimaDoSolo: number, h: HipotesesDoProduto): number {
  if (pavimentosAcimaDoSolo >= h.pavimentosParaSegundoElevador) return 2;
  if (pavimentosAcimaDoSolo >= h.pavimentosParaElevador) return 1;
  return 0;
}

/**
 * O núcleo do bloco: o DESENHADO vence a hipótese. Conta como desenhado o
 * núcleo (shaft/elevador) e a escada cujo centro cai dentro do bloco, em
 * qualquer pavimento — o desenho é feito uma vez e vale para a prumada. Sem
 * escada desenhada, a escada/hall/shafts da hipótese continuam somados: um
 * elevador sozinho não é núcleo.
 */
export function nucleoDoBloco(model: BlueprintModel, b: Bloco, pavimentosAcimaDoSolo: number, h: HipotesesDoProduto): NucleoDoBloco {
  if (pavimentosAcimaDoSolo <= 1) return { m2: 0, elevadores: 0, origem: 'NENHUM', explicacao: 'um pavimento só: sem núcleo vertical' };
  const dentro = (anel: Point[]) => anel.length >= 3 && pointInPolygon(b.pontos, centroDoAnel(anel));
  const nucleos = (model.nucleos ?? []).filter((n) => dentro(n.ring));
  const escadas = (model.stairs ?? []).filter((e) => dentro(contornoDaEscada(e)));
  if (nucleos.length === 0 && escadas.length === 0) {
    const elevadores = elevadoresSugeridos(pavimentosAcimaDoSolo, h);
    return {
      m2: h.nucleoBaseM2 + elevadores * h.elevadorM2,
      elevadores,
      origem: 'SUGERIDO',
      explicacao: `hipótese: escada + hall + shafts ${fmt(h.nucleoBaseM2)} m²${elevadores ? ` + ${elevadores} elevador(es) × ${fmt(h.elevadorM2)} m²` : ' (sem elevador abaixo de ' + h.pavimentosParaElevador + ' pavimentos)'}`,
    };
  }
  const areaNucleos = nucleos.reduce((s, n) => s + Math.abs(signedArea(n.ring)), 0) / 1e6;
  const areaEscadas = escadas.reduce((s, e) => s + Math.abs(signedArea(contornoDaEscada(e))), 0) / 1e6;
  const semEscada = escadas.length === 0;
  const m2 = areaNucleos + areaEscadas + (semEscada ? h.nucleoBaseM2 : 0);
  return {
    m2: Math.round(m2 * 100) / 100,
    elevadores: nucleos.filter((n) => n.tipo === 'ELEVADOR').length,
    origem: 'DESENHADO',
    explicacao: `desenhado: ${nucleos.length} núcleo(s) ${fmt(areaNucleos)} m²${escadas.length ? ` + ${escadas.length} escada(s) ${fmt(areaEscadas)} m²` : ` + escada/hall/shafts da hipótese ${fmt(h.nucleoBaseM2)} m²`}`,
  };
}

/**
 * "Lançar núcleo": os elevadores sugeridos como peças reais (`AddNucleo`), no
 * centro do bloco, com a caixa da ficha de 8 passageiros, e um shaft ao lado.
 * A escada fica com o projetista (e a hipótese segue somando escada/hall).
 */
export function comandosDoNucleoSugerido(b: Bloco, elevadores: number): Command[] {
  const ficha = FICHA_DO_ELEVADOR.find((f) => f.capacidade === 8)!;
  const [w, d] = ficha.caixaMm;
  const c = centroDoAnel(b.pontos);
  const shaftMm = 1200;
  const total = elevadores * w + shaftMm;
  let x0 = Math.round(c.x - total / 2);
  const y0 = Math.round(c.y - d / 2);
  const ret = (x: number, y: number, lx: number, ly: number): Point[] => [
    { x, y },
    { x: x + lx, y },
    { x: x + lx, y: y + ly },
    { x, y: y + ly },
  ];
  const out: Command[] = [];
  for (let i = 0; i < elevadores; i++) {
    out.push({ type: 'AddNucleo', levelId: b.levelId, tipo: 'ELEVADOR', ring: ret(x0, y0, w, d), rotulo: `${b.nome} · E${i + 1}`.slice(0, 40), capacidade: 8, pocoMm: ficha.pocoMm, casaDeMaquinasMm: ficha.casaDeMaquinasMm });
    x0 += w;
  }
  out.push({ type: 'AddNucleo', levelId: b.levelId, tipo: 'SHAFT', ring: ret(x0, y0, shaftMm, shaftMm), rotulo: `${b.nome} · shaft`.slice(0, 40) });
  return out;
}

// ─── Garagem ─────────────────────────────────────────────────────────────────

/** O anel girado em torno da origem para o lado mais longo ficar horizontal (mm inteiros). */
function alinharAoLadoMaisLongo(anel: Point[]): Point[] {
  let ang = 0;
  let maior = -1;
  for (let i = 0; i < anel.length; i++) {
    const a = anel[i];
    const b = anel[(i + 1) % anel.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > maior + 1e-6) {
      maior = len;
      ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  // Já alinhado (a menos de 0,01°): não mexe — o arredondamento mudaria um anel exato.
  const resto = Math.abs(((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
  if (resto < 1.75e-4 || Math.PI / 2 - resto < 1.75e-4) return anel;
  const c = Math.cos(-ang);
  const sn = Math.sin(-ang);
  return anel.map((p) => ({ x: Math.round(p.x * c - p.y * sn), y: Math.round(p.x * sn + p.y * c) }));
}

/**
 * Quantas vagas cabem num pavimento de garagem com este contorno — pelo
 * lançador da E2.5, num modelo PROVISÓRIO (paredes de 20 cm no contorno do
 * bloco). Pilares não existem ainda na massa: o número é o teto, dito assim.
 */
export function vagasQueCabem(anelOriginal: Point[], arranjo: ArranjoDasVagas): number {
  if (anelOriginal.length < 3) return 0;
  // O lançador corre as fileiras nos eixos do desenho: a garagem girada (lote
  // fora do norte do desenho, M5) perderia vagas que existem. Gira-se o anel
  // para o lado mais longo ficar no eixo x — a contagem não depende da rotação.
  const anel = alinharAoLadoMaisLongo(anelOriginal);
  let m = applyBatch(emptyModel(), [{ type: 'AddLevel', name: 'Garagem', elevationMm: 0, defaultHeightMm: 3000 }]).model;
  const lv = m.levels[0].id;
  const paredes: Command[] = anel.map((a, i) => ({ type: 'AddWall', levelId: lv, a, b: anel[(i + 1) % anel.length], thicknessMm: 200, heightMm: 3000 }));
  try {
    m = applyBatch(m, paredes).model;
  } catch {
    return 0;
  }
  const plano = planejarVagas(m, lv, { ...HIPOTESES_VAGAS_PADRAO, arranjo, pcdPct: 2, idosoPct: 5, motoPct: 0, exigenciaManual: null, vagasPorUnidade: null }, { tipo: 'PAVIMENTO' });
  return plano.vagas.length;
}

// ─── A distribuição ──────────────────────────────────────────────────────────

export interface PisoComUnidades {
  indice: number;
  ordinal: number | null;
  brutaM2: number;
  nucleoM2: number;
  paredesM2: number;
  comumM2: number;
  circulacaoM2: number;
  privativaDisponivelM2: number;
  /** Unidades por tipologia neste piso. */
  porTipologia: Record<string, number>;
  unidades: number;
  privativaM2: number;
}

export interface ProdutoDoBloco {
  blocoId: ObjectId;
  nome: string;
  uso: UsoDoBloco;
  nucleo: NucleoDoBloco;
  pisos: PisoComUnidades[];
  unidades: number;
  privativaM2: number;
  /** Privativa ÷ bruta, %, no pavimento com unidades mais comum (o "tipo"). */
  eficienciaDoPavimentoPct: number | null;
  /** O número de unidades do pavimento tipo. */
  unidadesPorPavimento: number;
  /** Só garagem: vagas por pavimento e no total. */
  vagasPorPavimento: number;
  vagas: number;
  garagemM2: number;
}

export interface ResultadoDoProduto {
  blocos: ProdutoDoBloco[];
  porTipologia: { id: string; nome: string; uso: UsoDaTipologia; unidades: number; privativaM2: number }[];
  unidades: number;
  privativaTotalM2: number;
  privativaMediaM2: number | null;
  areaConstruidaM2: number;
  areaComumM2: number;
  /** Privativa ÷ construída, %. */
  eficienciaGlobalPct: number | null;
  /** Do pavimento tipo do maior bloco com unidades, %. */
  eficienciaDoPavimentoPct: number | null;
  areaComumPorUnidadeM2: number | null;
  vagasDoProduto: number;
  vagasDaZona: number | null;
  vagasExigidas: number;
  vagasQueCabem: number;
  vagasFaltando: number;
  /** m² de garagem ÷ vaga que cabe. */
  indiceDeGaragemM2: number | null;
  meta: { unidades: number; diferenca: number } | null;
  avisos: string[];
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tipologias que um bloco deste uso recebe. */
function tipologiasDoUso(uso: UsoDoBloco, p: Produto): TipologiaDoProduto[] {
  const quer: UsoDaTipologia[] = uso === 'RESIDENCIAL' ? ['RESIDENCIAL'] : uso === 'COMERCIAL' ? ['COMERCIAL'] : uso === 'MISTO' ? ['RESIDENCIAL', 'COMERCIAL'] : [];
  return p.tipologias.filter((x) => quer.includes(x.uso) && x.proporcaoPct > 0 && x.areaPrivativaM2 > 0);
}

/**
 * Reparte `disponivelM2` em unidades pelo mix. Quantas cabem pela área MÉDIA
 * ponderada (floor); quantas de cada pelo maior resto; se a soma das áreas
 * estourar (o resto favoreceu a maior), tira uma da maior até caber.
 */
export function unidadesNoPiso(disponivelM2: number, tipos: TipologiaDoProduto[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of tipos) out[x.id] = 0;
  const soma = tipos.reduce((s, x) => s + x.proporcaoPct, 0);
  if (disponivelM2 <= 0 || tipos.length === 0 || soma <= 0) return out;
  const media = tipos.reduce((s, x) => s + (x.proporcaoPct / soma) * x.areaPrivativaM2, 0);
  const n = Math.floor(disponivelM2 / media + 1e-9);
  if (n <= 0) {
    // Não cabe nem uma da média: cabe a menor?
    const menor = [...tipos].sort((a, b) => a.areaPrivativaM2 - b.areaPrivativaM2)[0];
    if (menor.areaPrivativaM2 <= disponivelM2 + 1e-9) out[menor.id] = Math.floor(disponivelM2 / menor.areaPrivativaM2 + 1e-9);
    return out;
  }
  const brutas = tipos.map((x) => ({ x, q: (n * x.proporcaoPct) / soma }));
  for (const b of brutas) out[b.x.id] = Math.floor(b.q);
  let faltam = n - brutas.reduce((s, b) => s + Math.floor(b.q), 0);
  for (const b of [...brutas].sort((a, c) => c.q - Math.floor(c.q) - (a.q - Math.floor(a.q)))) {
    if (faltam <= 0) break;
    out[b.x.id] += 1;
    faltam -= 1;
  }
  const area = () => tipos.reduce((s, x) => s + out[x.id] * x.areaPrivativaM2, 0);
  const porArea = [...tipos].sort((a, b) => b.areaPrivativaM2 - a.areaPrivativaM2);
  while (area() > disponivelM2 + 1e-6) {
    const alvo = porArea.find((x) => out[x.id] > 0);
    if (!alvo) break;
    out[alvo.id] -= 1;
  }
  return out;
}

/**
 * `cacheDeVagas`: vagas por pavimento já calculadas, por contorno + arranjo. O
 * gerador de massa (M5) mede centenas de cenários com a MESMA garagem — sem o
 * cache, o lançador de vagas rodaria de novo em cada um.
 */
export function distribuirProduto(model: BlueprintModel, massa: MedidaDaMassa, produto: Produto, vagasPorUnidadeDaZona: number | null = null, cacheDeVagas?: Map<string, number>): ResultadoDoProduto {
  const avisos: string[] = [];
  const blocos: ProdutoDoBloco[] = [];
  const garagens = cacheDeVagas ?? new Map<string, number>();

  for (const m of massa.blocos) {
    const b = (model.blocos ?? []).find((x) => x.id === m.blocoId);
    if (!b) continue;
    blocos.push(produtoDoBloco(model, b, m, produto, garagens, avisos));
  }

  const porTipologia = produto.tipologias.map((x) => {
    const unidades = blocos.reduce((s, b) => s + b.pisos.reduce((ss, p) => ss + (p.porTipologia[x.id] ?? 0), 0), 0);
    return { id: x.id, nome: x.nome, uso: x.uso, unidades, privativaM2: r2(unidades * x.areaPrivativaM2) };
  });
  const unidades = porTipologia.reduce((s, x) => s + x.unidades, 0);
  const privativa = porTipologia.reduce((s, x) => s + x.privativaM2, 0);
  const construida = massa.areaConstruidaM2;
  const vagasDoProduto = Math.ceil(produto.tipologias.reduce((s, x) => s + (porTipologia.find((p) => p.id === x.id)?.unidades ?? 0) * x.vagasPorUnidade, 0) - 1e-9);
  const vagasDaZona = vagasPorUnidadeDaZona != null ? Math.ceil(unidades * vagasPorUnidadeDaZona - 1e-9) : null;
  const vagasExigidas = Math.max(vagasDoProduto, vagasDaZona ?? 0);
  const vagasCabem = blocos.reduce((s, b) => s + b.vagas, 0);
  const garagemM2 = blocos.reduce((s, b) => s + b.garagemM2, 0);
  const comUnidades = blocos.filter((b) => b.unidades > 0).sort((a, b) => b.privativaM2 - a.privativaM2);

  if (produto.tipologias.length === 0) avisos.push('Sem tipologias: escolha uma semente ou cadastre o mix na tela Produto.');
  for (const b of blocos) {
    if ((b.uso === 'RESIDENCIAL' || b.uso === 'COMERCIAL' || b.uso === 'MISTO') && tipologiasDoUso(b.uso, produto).length === 0 && produto.tipologias.length > 0) {
      avisos.push(`"${b.nome}" (${b.uso.toLowerCase()}) não tem tipologia do seu uso no produto: ficou sem unidades.`);
    }
  }
  if (vagasExigidas > vagasCabem) {
    avisos.push(vagasCabem === 0 ? `Faltam ${vagasExigidas} vagas: não há bloco de garagem (desenhe um, de uso Garagem — subsolo com cota negativa).` : `Faltam ${vagasExigidas - vagasCabem} vagas: cabem ${vagasCabem}, o produto/zona pede ${vagasExigidas}.`);
  }
  const meta = produto.metaUnidades != null ? { unidades: produto.metaUnidades, diferenca: unidades - produto.metaUnidades } : null;
  if (meta && meta.diferenca < 0) avisos.push(`Meta de ${meta.unidades} unidades: a massa comporta ${unidades} (faltam ${-meta.diferenca}).`);

  return {
    blocos,
    porTipologia,
    unidades,
    privativaTotalM2: r2(privativa),
    privativaMediaM2: unidades > 0 ? r2(privativa / unidades) : null,
    areaConstruidaM2: construida,
    areaComumM2: r2(Math.max(0, construida - privativa)),
    eficienciaGlobalPct: construida > 0 && unidades > 0 ? Math.round((privativa / construida) * 1000) / 10 : null,
    eficienciaDoPavimentoPct: comUnidades[0]?.eficienciaDoPavimentoPct ?? null,
    areaComumPorUnidadeM2: unidades > 0 ? r2(Math.max(0, construida - privativa) / unidades) : null,
    vagasDoProduto,
    vagasDaZona,
    vagasExigidas,
    vagasQueCabem: vagasCabem,
    vagasFaltando: Math.max(0, vagasExigidas - vagasCabem),
    indiceDeGaragemM2: vagasCabem > 0 ? r2(garagemM2 / vagasCabem) : null,
    meta,
    avisos,
  };
}

function produtoDoBloco(model: BlueprintModel, b: Bloco, m: MedidaDoBloco, produto: Produto, garagens: Map<string, number>, avisos: string[]): ProdutoDoBloco {
  const h = produto.hipoteses;
  const brutaM2 = m.projecaoM2;
  const acima = m.pisos.filter((p) => !p.subsolo);
  const topo = Math.max(0, ...acima.map((p) => p.ordinal ?? 0));
  const vazio = { blocoId: b.id, nome: b.nome, uso: b.uso, pisos: [] as PisoComUnidades[], unidades: 0, privativaM2: 0, eficienciaDoPavimentoPct: null, unidadesPorPavimento: 0, vagasPorPavimento: 0, vagas: 0, garagemM2: 0 };

  if (b.uso === 'GARAGEM') {
    const chave = JSON.stringify(b.pontos) + h.arranjoDasVagas;
    let porPav = garagens.get(chave);
    if (porPav === undefined) {
      porPav = vagasQueCabem(b.pontos, h.arranjoDasVagas);
      garagens.set(chave, porPav);
    }
    if (porPav === 0) avisos.push(`"${b.nome}": nenhuma fileira de vagas com circulação cabe no contorno.`);
    return { ...vazio, nucleo: { m2: 0, elevadores: 0, origem: 'NENHUM', explicacao: 'garagem: a rampa e a circulação já estão nas fileiras' }, vagasPorPavimento: porPav, vagas: porPav * b.pavimentos, garagemM2: r2(brutaM2 * b.pavimentos) };
  }

  const tipos = tipologiasDoUso(b.uso, produto);
  const nucleo = nucleoDoBloco(model, b, topo, h);
  if (tipos.length === 0) return { ...vazio, nucleo };

  const pisos: PisoComUnidades[] = acima.map((p) => {
    const paredesM2 = r2((brutaM2 * h.paredesPct) / 100);
    const comumM2 = p.ordinal === 1 ? Math.min(h.areaComumTerreoM2, brutaM2) : 0;
    const util = Math.max(0, brutaM2 - nucleo.m2 - paredesM2 - comumM2);
    const circulacaoM2 = r2((util * h.circulacaoPct) / 100);
    const disponivel = Math.max(0, util - circulacaoM2);
    const porTipologia = unidadesNoPiso(disponivel, tipos);
    const unidades = Object.values(porTipologia).reduce((s, q) => s + q, 0);
    const privativaM2 = r2(tipos.reduce((s, x) => s + (porTipologia[x.id] ?? 0) * x.areaPrivativaM2, 0));
    return { indice: p.indice, ordinal: p.ordinal, brutaM2, nucleoM2: nucleo.m2, paredesM2, comumM2, circulacaoM2, privativaDisponivelM2: r2(disponivel), porTipologia, unidades, privativaM2 };
  });
  // O pavimento "tipo": o número de unidades que mais se repete (desempate: o maior).
  const freq = new Map<number, number>();
  for (const p of pisos) freq.set(p.unidades, (freq.get(p.unidades) ?? 0) + 1);
  const unidadesPorPavimento = [...freq.entries()].sort((a, c) => c[1] - a[1] || c[0] - a[0])[0]?.[0] ?? 0;
  const tipo = pisos.find((p) => p.unidades === unidadesPorPavimento) ?? null;
  const unidades = pisos.reduce((s, p) => s + p.unidades, 0);
  return {
    ...vazio,
    nucleo,
    pisos,
    unidades,
    privativaM2: r2(pisos.reduce((s, p) => s + p.privativaM2, 0)),
    eficienciaDoPavimentoPct: tipo && brutaM2 > 0 ? Math.round((tipo.privativaM2 / brutaM2) * 1000) / 10 : null,
    unidadesPorPavimento,
  };
}
