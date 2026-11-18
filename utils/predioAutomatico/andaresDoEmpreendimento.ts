/**
 * Prédio pelo Empreendimento — O PAPEL DE CADA ANDAR da torre (PE1 do plano docs/planos/2026-11-18-predio-pelo-empreendimento.md,
 * 18/11/2026). Puro.
 *
 * O Prédio automático monta UM pavimento tipo e o copia (cópia viva). Pelo Empreendimento, quem diz o que cada andar é
 * são as unidades de Torres & Unidades:
 *  - GARAGEM: abaixo da torre (`EstruturaDaTorre.garagens`);
 *  - TIPO: o andar mais baixo com a "assinatura" mais frequente (o número de apartamentos, as áreas e as tipologias);
 *  - COPIA: os outros andares com a mesma assinatura (no Garden, a Torre B inteira — o térreo também);
 *  - PROPRIO: o andar da torre que difere (o térreo da Torre A, com 2 apartamentos e a área comum).
 *
 * Apartamento é a unidade com área, dormitórios ou tipologia; o resto do andar ("Área Comum Horizontal") é `comuns`. A
 * unidade criada pela própria massa ou o lote do loteamento fica fora (laço). Apartamento sem área toma a média do andar.
 */
import { pointInPolygon, type Boundary, type Point } from '../blueprintKernel';
import type { EstruturaDaTorre, PisoDaTorre, UnidadeDoPiso } from '../blueprintEstruturaDaTorre';
import { elevadoresSugeridos, type HipotesesDoProduto } from '../blueprintProduto';
import { medirTerreno } from '../blueprintTerreno';

export type PapelDoAndar = 'GARAGEM' | 'TIPO' | 'COPIA' | 'PROPRIO';

export interface AndarDoEmpreendimento {
  /** O andar do Empreendimento (0 = térreo, negativo abaixo da rua). */
  numero: number;
  nome: string;
  /** A elevação do piso, na referência da torre (a do cadastro). */
  elevacaoMm: number;
  papel: PapelDoAndar;
  /** Os apartamentos do andar, na ordem da aba (área sempre preenchida). */
  unidades: UnidadeDoPiso[];
  /** As "unidades" que não são apartamento (área comum, hall). */
  comuns: UnidadeDoPiso[];
}

const COMUM = /\b(comum|hall|portaria|lazer|condom[ií]nio|circula[cç][aã]o)\b/i;
const f0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/** A unidade é apartamento? (tem área, dormitórios ou tipologia, e o nome não diz área comum) */
function ehApartamento(u: UnidadeDoPiso): boolean {
  if (COMUM.test(u.nome)) return false;
  return (u.areaPrivativaM2 ?? 0) > 0 || (u.dormitorios ?? 0) > 0 || !!u.tipologia?.trim();
}

/** A assinatura do andar: apartamentos, áreas (em ordem) e tipologias (em ordem). */
function assinatura(unidades: readonly UnidadeDoPiso[]): string {
  const areas = unidades.map((u) => Math.round(u.areaPrivativaM2 ?? 0)).sort((a, b) => a - b);
  const tipos = unidades.map((u) => (u.tipologia ?? '').trim().toLocaleLowerCase('pt-BR')).sort();
  return `${unidades.length}|${areas.join(',')}|${tipos.join(',')}`;
}

export function papelDosAndares(e: EstruturaDaTorre): { andares: AndarDoEmpreendimento[]; avisos: string[] } {
  const avisos: string[] = [];
  const garagens: AndarDoEmpreendimento[] = e.garagens.map((p) => ({ numero: p.numero, nome: p.nome, elevacaoMm: p.elevacaoMm, papel: 'GARAGEM', unidades: [], comuns: [] }));
  const daTorre = e.acima.map((p: PisoDaTorre) => {
    const proprias = p.unidades.filter((u) => {
      if (!u.origemExterna) return true;
      avisos.push(`Torre "${e.nome}", ${p.nome}: a unidade "${u.nome}" ${u.origemExterna === 'MASSA' ? 'nasceu da própria massa (envio da planta)' : 'é lote do loteamento'} — fica fora do prédio.`);
      return false;
    });
    const aptos = proprias.filter(ehApartamento);
    const comuns = proprias.filter((u) => !ehApartamento(u));
    const comArea = aptos.filter((u) => (u.areaPrivativaM2 ?? 0) > 0);
    const media = comArea.length ? comArea.reduce((s, u) => s + u.areaPrivativaM2!, 0) / comArea.length : null;
    const unidades = aptos.map((u) => {
      if ((u.areaPrivativaM2 ?? 0) > 0 || media === null) return u;
      avisos.push(`Torre "${e.nome}", ${p.nome}: o apartamento "${u.nome}" não tem área privativa — tomada a média do andar (${f0(media)} m²).`);
      return { ...u, areaPrivativaM2: Math.round(media * 100) / 100 };
    });
    return { p, unidades, comuns, assinatura: assinatura(unidades) };
  });
  // O tipo: a assinatura mais frequente entre os andares com apartamento (empate: a do andar mais baixo).
  const conta = new Map<string, number>();
  for (const a of daTorre) if (a.unidades.length) conta.set(a.assinatura, (conta.get(a.assinatura) ?? 0) + 1);
  let doTipo: string | null = null;
  for (const a of daTorre) {
    if (!a.unidades.length) continue;
    if (doTipo === null || conta.get(a.assinatura)! > conta.get(doTipo)!) doTipo = a.assinatura;
  }
  let tipoJa = false;
  const andares = daTorre.map(({ p, unidades, comuns, assinatura: sig }): AndarDoEmpreendimento => {
    let papel: PapelDoAndar = 'PROPRIO';
    if (unidades.length && sig === doTipo) {
      papel = tipoJa ? 'COPIA' : 'TIPO';
      tipoJa = true;
    }
    return { numero: p.numero, nome: p.nome, elevacaoMm: p.elevacaoMm, papel, unidades, comuns };
  });
  return { andares: [...garagens, ...andares], avisos };
}

const areaM2 = (pts: readonly Point[]) => Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2e6;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A ÁREA BRUTA que o andar tipo pede — a conta do Produto ao contrário (`distribuirProduto`: o privativo disponível é a
 * bruta menos núcleo e paredes, menos a circulação): bruta = (privativos ÷ (1 − circulação) + núcleo) ÷ (1 − paredes). O
 * núcleo é o da hipótese (escada, hall, shafts e os elevadores pelos pavimentos). Com o contorno, diz se cabe.
 */
export function pegadaDaTorre(
  tipo: AndarDoEmpreendimento,
  pavimentos: number,
  h: HipotesesDoProduto,
  contorno: readonly Point[] | null,
): { privativosM2: number; nucleoM2: number; necessariaM2: number; disponivelM2: number | null; cabe: boolean | null } {
  const privativosM2 = r2(tipo.unidades.reduce((s, u) => s + (u.areaPrivativaM2 ?? 0), 0));
  const nucleoM2 = pavimentos <= 1 ? 0 : h.nucleoBaseM2 + elevadoresSugeridos(pavimentos, h) * h.elevadorM2;
  const necessariaM2 = r2((privativosM2 / (1 - h.circulacaoPct / 100) + nucleoM2) / (1 - h.paredesPct / 100));
  const disponivelM2 = contorno && contorno.length >= 3 ? r2(areaM2(contorno)) : null;
  return { privativosM2, nucleoM2, necessariaM2, disponivelM2, cabe: disponivelM2 === null ? null : disponivelM2 + 1e-6 >= necessariaM2 };
}

export interface RecuosDoLote {
  frontalMm: number;
  lateralMm: number;
  fundosMm: number;
}

export interface BlocoNoLote {
  torreId: string;
  nome: string;
  pontos: Point[];
  pavimentos: number;
}

/**
 * AS TORRES NO LOTE quando a planta ainda não tem o bloco delas (PE1, decisão de 18/11: "Use a planta Teste 01 como
 * referencia"). Cada torre com o andar tipo é um retângulo na largura útil do lote (a frente menos os recuos laterais, a
 * mais estreita entre a frente e o fundo da torre) com a profundidade da área que o andar tipo pede (`pegadaDaTorre`); as
 * torres vêm da frente para o fundo, na ordem do Empreendimento, com a distância da ficha entre elas. Nunca encolhe: o
 * que passa do fundo (com o recuo) vira aviso com os números. Sem recuos (sem zona), recuo zero e aviso.
 */
export function blocosDasTorresNoLote(
  divisas: readonly Boundary[],
  estruturas: readonly EstruturaDaTorre[],
  distancias: readonly { torreA: string; torreB: string; mm: number }[],
  recuos: RecuosDoLote | null,
  h: HipotesesDoProduto,
): { blocos: BlocoNoLote[]; avisos: string[] } {
  const avisos: string[] = [];
  const terreno = medirTerreno(divisas as Boundary[]);
  const frente = divisas.find((d) => d.kind === 'TERRENO' && d.papel === 'FRENTE');
  if (!terreno || !terreno.fechado || !frente) return { blocos: [], avisos: ['Sem o lote fechado com a FRENTE marcada, as torres não têm onde nascer — lance o lote (pela ficha) antes.'] };
  const anel = terreno.anel;
  const L = Math.hypot(frente.b.x - frente.a.x, frente.b.y - frente.a.y);
  const u = { x: (frente.b.x - frente.a.x) / L, y: (frente.b.y - frente.a.y) / L };
  let v = { x: -u.y, y: u.x };
  const meio = { x: (frente.a.x + frente.b.x) / 2 + v.x * 10, y: (frente.a.y + frente.b.y) / 2 + v.y * 10 };
  if (!pointInPolygon(anel, meio as Point)) v = { x: -v.x, y: -v.y };
  const o = frente.a;
  const loc = (p: Point) => ({ a: (p.x - o.x) * u.x + (p.y - o.y) * u.y, b: (p.x - o.x) * v.x + (p.y - o.y) * v.y });
  const mundo = (a: number, b: number) => ({ x: Math.round(o.x + u.x * a + v.x * b), y: Math.round(o.y + u.y * a + v.y * b) }) as Point;
  const local = anel.map(loc);
  const fundoDoLote = Math.max(...local.map((p) => p.b));
  /** O trecho [a0, a1] do lote na profundidade b. */
  const largura = (b: number): [number, number] => {
    const xs: number[] = [];
    for (let i = 0; i < local.length; i++) {
      const p = local[i];
      const q = local[(i + 1) % local.length];
      if ((p.b - b) * (q.b - b) > 0 || p.b === q.b) continue;
      xs.push(p.a + ((q.a - p.a) * (b - p.b)) / (q.b - p.b));
    }
    return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
  };
  const r = recuos ?? { frontalMm: 0, lateralMm: 0, fundosMm: 0 };
  if (!recuos) avisos.push('Sem a zona aplicada, as torres nascem sem recuo (frontal, laterais e fundos zero) — aplique a zona do Mapa Regulatório e ajuste.');
  const blocos: BlocoNoLote[] = [];
  let b0 = r.frontalMm;
  let anterior: EstruturaDaTorre | null = null;
  for (const e of estruturas) {
    if (e.acima.length === 0) continue;
    const tipo = papelDosAndares(e).andares.find((x) => x.papel === 'TIPO');
    if (!tipo) {
      avisos.push(`Torre "${e.nome}": sem andar com apartamentos no Empreendimento — fica sem bloco.`);
      continue;
    }
    if (anterior) {
      const prev = anterior;
      const d = distancias.find((x) => (x.torreA === prev.torreId && x.torreB === e.torreId) || (x.torreA === e.torreId && x.torreB === prev.torreId));
      if (!d) avisos.push(`Sem a distância entre "${prev.nome}" e "${e.nome}" na ficha — coladas.`);
      b0 += d?.mm ?? 0;
    }
    const { necessariaM2 } = pegadaDaTorre(tipo, e.acima.length, h, null);
    // A largura útil: a mais estreita entre a frente e o fundo da torre (duas voltas: o fundo depende da largura).
    let [a0, a1] = largura(b0 + 1);
    for (let k = 0; k < 2; k++) {
      const w = a1 - a0 - 2 * r.lateralMm;
      const prof = Math.ceil((necessariaM2 * 1e6) / Math.max(1, w));
      const [c0, c1] = largura(Math.min(b0 + prof, fundoDoLote) - 1);
      a0 = Math.max(a0, c0);
      a1 = Math.min(a1, c1);
    }
    const x0 = Math.round(a0 + r.lateralMm);
    const x1 = Math.round(a1 - r.lateralMm);
    const prof = Math.ceil((necessariaM2 * 1e6) / (x1 - x0));
    blocos.push({ torreId: e.torreId, nome: e.nome, pontos: [mundo(x0, b0), mundo(x1, b0), mundo(x1, b0 + prof), mundo(x0, b0 + prof)], pavimentos: e.acima.length });
    b0 += prof;
    anterior = e;
  }
  const limite = fundoDoLote - r.fundosMm;
  if (b0 > limite + 1) avisos.push(`As torres passam do fundo do lote em ${(Math.round((b0 - limite) / 10) / 100).toLocaleString('pt-BR')} m (com o recuo de fundos) — a área que o andar tipo pede não cabe; ajuste os blocos ou as áreas do Empreendimento.`);
  return { blocos, avisos };
}
