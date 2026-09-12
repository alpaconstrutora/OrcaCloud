/**
 * IMPORTAÇÃO de pontos cotados (fase 9 da topografia) — o levantamento do
 * topógrafo entrando por arquivo, em vez de digitado.
 *
 * ─── QUATRO FORMATOS, UMA SAÍDA ─────────────────────────────────────────────
 *
 * - TEXTO (CSV/TXT de estação total ou GNSS): linhas `P,N,E,Z,D` (o PNEZD do
 *   CAD) ou `P,E,N,Z,D`, com ou sem cabeçalho, separador `;` `,` tab ou
 *   espaço, vírgula ou ponto decimal. Detecta o que dá; o resto é opção.
 * - GEOJSON e KML: pontos em latitude/longitude com elevação — entram pela
 *   georreferência do lote ("Onde fica"). Sem ela, não há onde pôr.
 * - DXF: POINT (com Z) ou POINT/CIRCLE emparelhado com o TEXT numérico mais
 *   próximo (a cota escrita ao lado da marca).
 * - SVG: `<circle>` (ou marca pequena) emparelhado com o `<text>` numérico
 *   mais próximo; o SVG não tem unidade nem norte, então escala e origem são
 *   opção do usuário e o Y é invertido (no SVG cresce para baixo).
 *
 * Tudo sai em `PontoCotado` (mm do desenho, cota em m), pronto para
 * `amostrarPontosCotados`. A classe da versão continua "Levantamento
 * importado — pendente de validação" (RF-020), e a proveniência leva o nome e
 * o hash do arquivo (RF-014: checksum do insumo).
 *
 * ─── ONDE O ARQUIVO CAI NO DESENHO ──────────────────────────────────────────
 *
 * Coordenadas locais em metros (origem arbitrária do topógrafo) não sabem
 * onde fica o lote. Ancoragem: `DIRETO` (já são coordenadas do desenho),
 * `CENTRO_DO_LOTE` (o centro dos pontos vai para o centro do lote — o mesmo
 * critério de `deslocamentoDaImportacao` do IFC), ou `GEORREFERENCIA` (UTM,
 * lat/long). `AUTO` escolhe: geográfico → georreferência; pontos já sobre o
 * lote → direto; senão → centro do lote, com aviso.
 *
 * Puro, como o resto: texto entra, pontos saem.
 */

import type { Georreferencia, Point } from './blueprintKernel';
import { pointInPolygon } from './blueprintKernel';
import { geoParaLocal, type LatLon, type PontoCotado } from './blueprintTopografia';

/**
 * `PERFIL_SVG` e `PERFIL_CSV` (fase 10): as exportações de PERFIL do próprio
 * ÒPURA (`svgDoPerfil` / `csvDoPerfil`). O CSV traz x, y em mm e vira pontos
 * cotados direto; o SVG é um gráfico distância × cota e precisa de uma linha
 * do desenho para os pontos se apoiarem.
 */
export type FormatoDeImportacao = 'TEXTO' | 'GEOJSON' | 'KML' | 'DXF' | 'SVG' | 'PERFIL_SVG' | 'PERFIL_CSV' | 'CURVAS_SVG';

export type OrdemDasColunas = 'AUTO' | 'NEZ' | 'ENZ';
export type UnidadeDoArquivo = 'AUTO' | 'M' | 'MM' | 'UTM';
export type AncoragemDaImportacao = 'AUTO' | 'DIRETO' | 'CENTRO_DO_LOTE' | 'GEORREFERENCIA';

export interface OpcoesDeImportacao {
  ordem?: OrdemDasColunas;
  unidade?: UnidadeDoArquivo;
  ancoragem?: AncoragemDaImportacao;
  /** SVG: quantos mm do desenho vale uma unidade do SVG (padrão 1000 = 1 unidade por metro). */
  escalaSvgMmPorUnidade?: number;
  /** UTM: zona e hemisfério; sem eles, deduzidos da georreferência. */
  zonaUtm?: number | null;
  hemisferio?: 'N' | 'S' | null;
}

export interface PontoImportado extends PontoCotado {
  nome?: string;
  codigo?: string;
}

export interface ResultadoDaImportacao {
  formato: FormatoDeImportacao;
  /** Em mm do desenho, já ancorados. */
  pontos: PontoImportado[];
  detectado: {
    separador?: string;
    cabecalho?: boolean;
    ordem: 'NEZ' | 'ENZ' | 'GEO';
    unidade: 'M' | 'MM' | 'UTM' | 'GEO' | 'SVG';
    ancoragem: 'DIRETO' | 'CENTRO_DO_LOTE' | 'GEORREFERENCIA';
    zonaUtm?: number;
    linhasLidas: number;
    linhasIgnoradas: number;
    /** Fase 11: curvas de nível reconhecidas no SVG (com cota) e as que ficaram sem cota. */
    curvasLidas?: number;
    curvasSemCota?: number;
  };
  /** Quantos pontos caem dentro do lote (com anel) — o que a TIN vai usar de verdade. */
  dentroDoLote: number;
  avisos: string[];
}

export interface ContextoDaImportacao {
  anel: Point[] | null;
  georreferencia: Georreferencia | null;
  /**
   * A linha de perfil em uso (corte ou linha desenhada), amostrada com
   * distância e posição — onde um PERFIL importado se apoia (fase 10).
   */
  linhaDoPerfil?: { distM: number; x: number; y: number }[] | null;
}

// ── Perfil do ÒPURA (fase 10) ─────────────────────────────────────────────

export interface PerfilLido {
  titulo: string | null;
  /** (distância, cota) ao longo da linha, em metros. */
  pontos: { distM: number; cotaM: number }[];
  comprimentoM: number;
}

function ajusteLinear(pares: { px: number; valor: number }[]): ((px: number) => number) | null {
  if (pares.length < 2) return null;
  const n = pares.length;
  const mx = pares.reduce((s, p) => s + p.px, 0) / n;
  const mv = pares.reduce((s, p) => s + p.valor, 0) / n;
  const sxx = pares.reduce((s, p) => s + (p.px - mx) ** 2, 0);
  if (sxx === 0) return null;
  const b = pares.reduce((s, p) => s + (p.px - mx) * (p.valor - mv), 0) / sxx;
  return (px: number) => mv + b * (px - mx);
}

/**
 * Lê o SVG que `svgDoPerfil` escreve: os ticks dos eixos dão a escala
 * (px → m de distância, px → m de cota), a linha marrom dá os pontos. Os dois
 * círculos de início e fim, rotulados com duas casas, refinam a cota.
 */
export function lerPerfilSvgDoOpura(texto: string): PerfilLido {
  const textos = [...texto.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)].map((m) => ({
    x: atributo(m[1], 'x') ?? 0,
    y: atributo(m[1], 'y') ?? 0,
    ancora: m[1].match(/text-anchor="(\w+)"/)?.[1] ?? 'start',
    conteudo: m[2].replace(/<[^>]+>/g, '').trim(),
  }));
  const titulo = textos.find((t) => t.y === 14)?.conteudo ?? null;
  // Eixo X: rótulos "d m" centrados; eixo Y: rótulos com âncora "end" à esquerda.
  const ticksX = textos
    .filter((t) => t.ancora === 'middle' && /m$/.test(t.conteudo))
    .map((t) => ({ px: t.x, valor: numeroFlexivel(t.conteudo.replace(/\s*m$/, '')) }))
    .filter((t): t is { px: number; valor: number } => t.valor !== null);
  const ticksY = textos
    .filter((t) => t.ancora === 'end' && !/m$/.test(t.conteudo) && !/exagero/i.test(t.conteudo))
    .map((t) => ({ px: t.y - 3, valor: numeroFlexivel(t.conteudo) }))
    .filter((t): t is { px: number; valor: number } => t.valor !== null);
  const distDe = ajusteLinear(ticksX);
  let cotaDe = ajusteLinear(ticksY);
  if (!distDe || !cotaDe) throw new Error('Este SVG não tem os eixos do perfil do ÒPURA (ticks de distância e de cota).');
  // Círculos de início/fim com rótulo "c,cc m" 6 px acima: cota com duas casas.
  const circulos = [...texto.matchAll(/<circle\b([^>]*)\/>/gi)].map((m) => ({ cx: atributo(m[1], 'cx') ?? 0, cy: atributo(m[1], 'cy') ?? 0 }));
  const refin: { px: number; valor: number }[] = [];
  for (const c of circulos) {
    const rot = textos.find((t) => Math.abs(t.x - c.cx) < 0.6 && Math.abs(t.y - (c.cy - 6)) < 0.6 && /m$/.test(t.conteudo));
    const v = rot ? numeroFlexivel(rot.conteudo.replace(/\s*m$/, '')) : null;
    if (v !== null) refin.push({ px: c.cy, valor: v });
  }
  if (refin.length >= 2 && Math.abs(refin[0].valor - refin[1].valor) > 0.05) cotaDe = ajusteLinear(refin) ?? cotaDe;
  // A linha do perfil: os <path> sem fill (a terra sob a linha tem fill).
  const pontos: { distM: number; cotaM: number }[] = [];
  for (const m of texto.matchAll(/<path\b([^>]*)\/>/gi)) {
    if (!/fill="none"/.test(m[1])) continue;
    const d = m[1].match(/\bd="([^"]+)"/)?.[1] ?? '';
    for (const seg of d.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)) {
      pontos.push({ distM: distDe(Number(seg[1])), cotaM: cotaDe(Number(seg[2])) });
    }
  }
  if (pontos.length === 0) throw new Error('Este SVG não tem a linha do perfil (path sem preenchimento).');
  const comprimentoM = Math.max(...ticksX.map((t) => t.valor));
  return { titulo, pontos: pontos.map((p) => ({ distM: Math.round(p.distM * 1000) / 1000, cotaM: Math.round(p.cotaM * 100) / 100 })), comprimentoM };
}

/** Lê o CSV que `csvDoPerfil` escreve: `seq;dist_m;x_mm;y_mm;cota_m;status` — já com posição no desenho. */
export function lerPerfilCsvDoOpura(texto: string): { pontos: PontoImportado[]; ignoradas: number; titulo: string | null } {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const titulo = linhas.find((l) => l.startsWith('#'))?.replace(/^#\s*/, '') ?? null;
  const cab = linhas.find((l) => /dist_m/.test(l) && /x_mm/.test(l));
  if (!cab) throw new Error('Cabeçalho do CSV de perfil não encontrado.');
  const cols = cab.split(';').map((c) => c.trim());
  const iX = cols.indexOf('x_mm');
  const iY = cols.indexOf('y_mm');
  const iZ = cols.indexOf('cota_m');
  const pontos: PontoImportado[] = [];
  let ignoradas = 0;
  for (const l of linhas.slice(linhas.indexOf(cab) + 1)) {
    if (l.startsWith('#')) continue;
    const c = l.split(';');
    const x = numeroFlexivel(c[iX] ?? '');
    const y = numeroFlexivel(c[iY] ?? '');
    const z = numeroFlexivel(c[iZ] ?? '');
    if (x === null || y === null || z === null) {
      ignoradas++;
      continue;
    }
    pontos.push({ x, y, cotaM: z, nome: c[0] });
  }
  return { pontos, ignoradas, titulo };
}

/**
 * Apoia um perfil (distância, cota) sobre a linha amostrada: cada distância
 * vira o ponto da linha naquela distância (interpolado entre amostras). Além
 * do fim da linha, para no último ponto e avisa.
 */
export function perfilSobreLinha(
  perfil: { distM: number; cotaM: number }[],
  linha: { distM: number; x: number; y: number }[],
): { pontos: PontoImportado[]; foraDaLinha: number } {
  const pontos: PontoImportado[] = [];
  let fora = 0;
  if (linha.length < 2) return { pontos, foraDaLinha: perfil.length };
  const fim = linha[linha.length - 1].distM;
  // Os rótulos do eixo têm uma casa decimal: o último ponto do gráfico pode
  // passar do fim da linha por centímetros. Até 2 % (mín. 5 cm) encosta no
  // fim; além disso, fica de fora.
  const folga = Math.max(0.05, fim * 0.02);
  for (const ponto of perfil) {
    const p = ponto.distM > fim && ponto.distM <= fim + folga ? { ...ponto, distM: fim } : ponto;
    if (p.distM > fim + 1e-6) {
      fora++;
      continue;
    }
    let i = 0;
    while (i + 1 < linha.length && linha[i + 1].distM < p.distM) i++;
    const a = linha[i];
    const b = linha[Math.min(i + 1, linha.length - 1)];
    const t = b.distM > a.distM ? Math.max(0, Math.min(1, (p.distM - a.distM) / (b.distM - a.distM))) : 0;
    pontos.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, cotaM: p.cotaM });
  }
  return { pontos, foraDaLinha: fora };
}

/** Todos os pontos numa reta só (a menos de `tolMm`)? Aí a TIN não fecha. */
export function colineares(pontos: { x: number; y: number }[], tolMm = 50): boolean {
  if (pontos.length < 3) return true;
  const a = pontos[0];
  let b = pontos[0];
  let maior = 0;
  for (const p of pontos) {
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d > maior) {
      maior = d;
      b = p;
    }
  }
  if (maior === 0) return true;
  const ux = (b.x - a.x) / maior;
  const uy = (b.y - a.y) / maior;
  return pontos.every((p) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux) <= tolMm);
}

export function formatoPeloNome(nome: string): FormatoDeImportacao | null {
  const ext = (nome.split('.').pop() ?? '').toLowerCase();
  if (['csv', 'txt', 'pnezd', 'dat', 'pts', 'xyz'].includes(ext)) return 'TEXTO';
  if (['geojson', 'json'].includes(ext)) return 'GEOJSON';
  if (ext === 'kml') return 'KML';
  if (ext === 'dxf') return 'DXF';
  if (ext === 'svg') return 'SVG';
  return null;
}

/**
 * Pela extensão E pelo conteúdo: o SVG e o CSV de perfil do ÒPURA têm marcas
 * próprias ("exagero vertical" na legenda; cabeçalho `seq;dist_m;x_mm;y_mm;cota_m`).
 */
export function detectarFormato(nome: string, texto: string): FormatoDeImportacao | null {
  const base = formatoPeloNome(nome);
  const cabeca = texto.slice(0, 4000);
  if (base === 'SVG' && /exagero vertical/i.test(texto)) return 'PERFIL_SVG';
  // O SVG de curvas do ÒPURA (`svgDasCurvas`): cada curva leva `data-cota`,
  // e o desenho vive num grupo `scale(1,-1)` em mm do desenho.
  if (base === 'SVG' && /data-cota="/.test(texto) && /scale\(1,-1\)/.test(texto)) return 'CURVAS_SVG';
  if (base === 'TEXTO' && /dist_m/.test(cabeca) && /x_mm/.test(cabeca) && /cota_m/.test(cabeca)) return 'PERFIL_CSV';
  return base;
}

/** Aceita "1.234,56", "1234.56", "1234,56" e "-12.3e2". */
export function numeroFlexivel(texto: string): number | null {
  let t = texto.trim().replace(/^["']|["']$/g, '');
  if (t === '' || /[a-df-zA-DF-Z]/.test(t)) return null;
  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');
  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

// ── UTM ───────────────────────────────────────────────────────────────────

/** Zona UTM de uma longitude (1–60). */
export function zonaUtmDe(lon: number): number {
  return Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
}

/**
 * UTM (WGS 84 / SIRGAS 2000 — o mesmo elipsoide GRS80 para o que interessa)
 * → latitude/longitude. Fórmulas de Snyder; erro abaixo de 1 mm na zona.
 */
export function utmParaLatLon(este: number, norte: number, zona: number, hemisferio: 'N' | 'S'): LatLon {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = este - 500000;
  const y = hemisferio === 'S' ? norte - 10000000 : norte;
  const lon0 = ((zona - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const T1 = tan1 * tan1;
  const C1 = ep2 * cos1 * cos1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const D = x / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * tan1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon =
    lon0 +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      cos1;
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

// ── Leitura bruta por formato ─────────────────────────────────────────────

interface Bruto {
  /** Primeira e segunda coordenadas COMO ESTÃO no arquivo (ainda sem saber se N,E ou E,N). */
  a: number;
  b: number;
  z: number;
  nome?: string;
  codigo?: string;
}

const NOMES_N = /^(n|norte|north|northing|y|lat|latitude)$/i;
const NOMES_E = /^(e|este|east|easting|x|lon|long|longitude)$/i;
const NOMES_Z = /^(z|cota|cota_m|h|alt|altitude|elev|elevation|elevacao|elevação)$/i;
const NOMES_ID = /^(p|pt|ponto|point|id|nome|name|n[ºo]|num|numero|número|est|estaca)$/i;
const NOMES_COD = /^(d|desc|descricao|descrição|cod|codigo|código|code|obs)$/i;

function detectarSeparador(linhas: string[]): string {
  const amostra = linhas.slice(0, 20);
  const conta = (s: string) => amostra.reduce((n, l) => n + (l.split(s).length - 1), 0);
  const tab = conta('\t');
  const pv = conta(';');
  const virg = conta(',');
  if (tab > 0 && tab >= pv && tab >= virg / 2) return '\t';
  if (pv > 0) return ';';
  // Vírgula: separador OU decimal. Se há ponto decimal nas linhas, a vírgula separa.
  if (virg > 0 && amostra.some((l) => /\d\.\d/.test(l))) return ',';
  // Só vírgulas e sem ponto: se cada linha tem ≥ 3 vírgulas, separa; senão é decimal.
  if (virg > 0 && amostra.every((l) => l.split(',').length >= 4 || l.trim() === '')) return ',';
  return ' ';
}

function lerTexto(texto: string): { brutos: Bruto[]; separador: string; cabecalho: boolean; ordemPeloCabecalho: 'NEZ' | 'ENZ' | null; ignoradas: number; geo: boolean } {
  const linhas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith('//'));
  const separador = detectarSeparador(linhas);
  const dividir = (l: string) => (separador === ' ' ? l.split(/\s+/) : l.split(separador)).map((c) => c.trim());

  let cabecalho = false;
  let ordemPeloCabecalho: 'NEZ' | 'ENZ' | null = null;
  let colunas: { a: number; b: number; z: number; nome: number | null; codigo: number | null } | null = null;
  let geo = false;
  if (linhas.length > 0) {
    const primeira = dividir(linhas[0]);
    const numericos = primeira.filter((c) => numeroFlexivel(c) !== null).length;
    if (numericos < 3 && primeira.length >= 3) {
      cabecalho = true;
      const idx = (re: RegExp) => primeira.findIndex((c) => re.test(c.replace(/\s|\(.*\)/g, '')));
      const iN = idx(NOMES_N);
      const iE = idx(NOMES_E);
      const iZ = idx(NOMES_Z);
      const iId = idx(NOMES_ID);
      const iCod = idx(NOMES_COD);
      if (iN >= 0 && iE >= 0 && iZ >= 0) {
        geo = /lat/i.test(primeira[iN]) && /lon/i.test(primeira[iE]);
        // `a` recebe sempre a coluna N (ou lat), `b` a E (ou lon): ordem já resolvida.
        colunas = { a: iN, b: iE, z: iZ, nome: iId >= 0 ? iId : null, codigo: iCod >= 0 ? iCod : null };
        ordemPeloCabecalho = 'NEZ';
      }
    }
  }

  const brutos: Bruto[] = [];
  let ignoradas = 0;
  for (const linha of linhas.slice(cabecalho ? 1 : 0)) {
    const c = dividir(linha);
    if (colunas) {
      const a = numeroFlexivel(c[colunas.a] ?? '');
      const b = numeroFlexivel(c[colunas.b] ?? '');
      const z = numeroFlexivel(c[colunas.z] ?? '');
      if (a === null || b === null || z === null) {
        ignoradas++;
        continue;
      }
      brutos.push({ a, b, z, nome: colunas.nome !== null ? c[colunas.nome] : undefined, codigo: colunas.codigo !== null ? c[colunas.codigo] : undefined });
      continue;
    }
    // Sem cabeçalho: P? a b z D? — a primeira sequência de três números.
    const nums = c.map((x) => numeroFlexivel(x));
    let inicio = -1;
    for (let i = 0; i + 2 < nums.length; i++) {
      if (nums[i] !== null && nums[i + 1] !== null && nums[i + 2] !== null) {
        inicio = i;
        break;
      }
    }
    // Quatro números seguidos: o primeiro é o número do ponto (P, N, E, Z).
    // Sem olhar o VALOR da coordenada seguinte — a primeira versão exigia
    // ≥ 1 e uma linha com "0,500" virava cota 8,30 (achado em produção).
    if (inicio >= 0 && nums.length >= inicio + 4 && nums[inicio + 3] !== null) inicio += 1;
    if (inicio < 0 || nums.length < inicio + 3) {
      ignoradas++;
      continue;
    }
    const nome = inicio > 0 ? c[inicio - 1] : undefined;
    const resto = c.slice(inicio + 3).filter((x) => numeroFlexivel(x) === null);
    brutos.push({ a: nums[inicio]!, b: nums[inicio + 1]!, z: nums[inicio + 2]!, nome, codigo: resto[0] });
  }
  return { brutos, separador, cabecalho, ordemPeloCabecalho, ignoradas, geo };
}

function lerGeoJson(texto: string): { brutos: Bruto[]; ignoradas: number; avisos: string[] } {
  let raiz: unknown;
  try {
    raiz = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const brutos: Bruto[] = [];
  let ignoradas = 0;
  const avisos: string[] = [];
  const cotaDe = (props: Record<string, unknown> | null | undefined, coords: number[]): number | null => {
    if (coords.length >= 3 && Number.isFinite(coords[2])) return coords[2];
    for (const k of ['cota', 'cota_m', 'cotaM', 'z', 'Z', 'elev', 'elevation', 'altitude', 'alt', 'h', 'ele']) {
      const v = props?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = numeroFlexivel(v);
        if (n !== null) return n;
      }
    }
    return null;
  };
  const nomeDe = (props: Record<string, unknown> | null | undefined): string | undefined => {
    for (const k of ['nome', 'name', 'id', 'ponto', 'P']) {
      const v = props?.[k];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
    return undefined;
  };
  const visitar = (geom: { type?: string; coordinates?: unknown } | null, props: Record<string, unknown> | null | undefined) => {
    if (!geom) return;
    if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      const c = geom.coordinates as number[];
      const z = cotaDe(props, c);
      if (c.length >= 2 && z !== null) brutos.push({ a: c[1], b: c[0], z, nome: nomeDe(props) });
      else ignoradas++;
    } else if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates as number[][]) {
        const z = cotaDe(props, c);
        if (c.length >= 2 && z !== null) brutos.push({ a: c[1], b: c[0], z, nome: nomeDe(props) });
        else ignoradas++;
      }
    } else if (geom.type === 'GeometryCollection' && Array.isArray((geom as { geometries?: unknown }).geometries)) {
      for (const g of (geom as { geometries: { type?: string; coordinates?: unknown }[] }).geometries) visitar(g, props);
    } else {
      ignoradas++;
    }
  };
  const r = raiz as { type?: string; features?: unknown[]; geometry?: unknown; properties?: unknown };
  if (r?.type === 'FeatureCollection' && Array.isArray(r.features)) {
    for (const f of r.features as { geometry?: unknown; properties?: unknown }[]) visitar(f.geometry as never, f.properties as never);
  } else if (r?.type === 'Feature') {
    visitar(r.geometry as never, r.properties as never);
  } else if (r?.type) {
    visitar(r as never, null);
  } else {
    throw new Error('O JSON não é GeoJSON (sem type).');
  }
  if (ignoradas > 0) avisos.push(`${ignoradas} feição(ões) sem ponto ou sem cota foram ignoradas.`);
  return { brutos, ignoradas, avisos };
}

function lerKml(texto: string): { brutos: Bruto[]; ignoradas: number } {
  const brutos: Bruto[] = [];
  let ignoradas = 0;
  const placemarks = texto.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [];
  for (const pm of placemarks) {
    const nome = pm.match(/<name>([\s\S]*?)<\/name>/i)?.[1]?.trim();
    const ponto = pm.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);
    if (!ponto) {
      ignoradas++;
      continue;
    }
    const partes = ponto[1].trim().split(/[\s]+/)[0].split(',').map((v) => Number(v));
    if (partes.length < 2 || !Number.isFinite(partes[0]) || !Number.isFinite(partes[1])) {
      ignoradas++;
      continue;
    }
    let z = partes.length >= 3 && Number.isFinite(partes[2]) ? partes[2] : null;
    if (z === null) {
      const dado = pm.match(/<Data name="(?:cota|cota_m|z|elev|elevation|altitude)">[\s\S]*?<value>([\s\S]*?)<\/value>/i);
      z = dado ? numeroFlexivel(dado[1]) : null;
    }
    if (z === null) {
      ignoradas++;
      continue;
    }
    brutos.push({ a: partes[1], b: partes[0], z, nome });
  }
  return { brutos, ignoradas };
}

interface EntidadeDxf {
  tipo: string;
  x: number;
  y: number;
  z: number;
  texto?: string;
  altura?: number;
  raio?: number;
}

/** Só o que a importação de pontos precisa: POINT, CIRCLE, TEXT/MTEXT e $INSUNITS. */
function lerDxf(texto: string): { entidades: EntidadeDxf[]; insunits: number | null } {
  const linhas = texto.split(/\r?\n/);
  const entidades: EntidadeDxf[] = [];
  let insunits: number | null = null;
  let atual: EntidadeDxf | null = null;
  const fechar = () => {
    if (atual && ['POINT', 'CIRCLE', 'TEXT', 'MTEXT'].includes(atual.tipo)) entidades.push(atual);
    atual = null;
  };
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const codigo = Number(linhas[i].trim());
    const valor = linhas[i + 1].trim();
    if (codigo === 9 && valor === '$INSUNITS') {
      const c = Number(linhas[i + 2]?.trim());
      if (c === 70) insunits = Number(linhas[i + 3]?.trim());
      continue;
    }
    if (codigo === 0) {
      fechar();
      atual = { tipo: valor, x: 0, y: 0, z: 0 };
      continue;
    }
    if (!atual) continue;
    const v = Number(valor);
    if (codigo === 10) atual.x = v;
    else if (codigo === 20) atual.y = v;
    else if (codigo === 30) atual.z = v;
    else if (codigo === 40) {
      if (atual.tipo === 'CIRCLE') atual.raio = v;
      else atual.altura = v;
    } else if (codigo === 1) atual.texto = (atual.texto ?? '') + valor;
    else if (codigo === 3) atual.texto = (atual.texto ?? '') + valor;
  }
  fechar();
  return { entidades, insunits };
}

/** Número dentro de um texto de cota ("101,25", "Cota 101.25", "101.25 m"). */
function numeroNoTexto(t: string): number | null {
  const limpo = t.replace(/\\P|\{|\}|\\[A-Za-z][^;]*;/g, ' ');
  const m = limpo.match(/-?\d{1,4}(?:[.,]\d{1,3})?/);
  if (!m) return null;
  const v = numeroFlexivel(m[0]);
  return v !== null && Math.abs(v) < 10000 ? v : null;
}

/** Marcas (POINT/CIRCLE sem Z) casadas com o texto numérico mais próximo. */
function emparelharMarcasComTextos(
  marcas: { x: number; y: number; z: number }[],
  textos: { x: number; y: number; valor: number; alcance: number }[],
): { brutos: Bruto[]; semTexto: number } {
  const brutos: Bruto[] = [];
  let semTexto = 0;
  const usados = new Set<number>();
  for (const m of marcas) {
    if (m.z !== 0) {
      brutos.push({ a: m.y, b: m.x, z: m.z });
      continue;
    }
    let melhor = -1;
    let menor = Infinity;
    textos.forEach((t, i) => {
      if (usados.has(i)) return;
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d < menor && d <= t.alcance) {
        menor = d;
        melhor = i;
      }
    });
    if (melhor < 0) {
      semTexto++;
      continue;
    }
    usados.add(melhor);
    brutos.push({ a: m.y, b: m.x, z: textos[melhor].valor });
  }
  return { brutos, semTexto };
}

function lerDxfPontos(texto: string): { brutos: Bruto[]; ignoradas: number; avisos: string[]; unidade: 'M' | 'MM' | null } {
  const { entidades, insunits } = lerDxf(texto);
  const unidade: 'M' | 'MM' | null = insunits === 4 ? 'MM' : insunits === 6 ? 'M' : insunits === 5 ? 'MM' : null;
  const marcas = entidades.filter((e) => e.tipo === 'POINT' || e.tipo === 'CIRCLE').map((e) => ({ x: e.x, y: e.y, z: e.z }));
  const textos = entidades
    .filter((e) => (e.tipo === 'TEXT' || e.tipo === 'MTEXT') && e.texto)
    .map((e) => ({ x: e.x, y: e.y, valor: numeroNoTexto(e.texto!), alcance: Math.max(3, (e.altura ?? 1) * 6) }))
    .filter((t): t is { x: number; y: number; valor: number; alcance: number } => t.valor !== null);
  const avisos: string[] = [];
  const { brutos, semTexto } = emparelharMarcasComTextos(marcas, textos);
  if (semTexto > 0) avisos.push(`${semTexto} marca(s) sem cota em Z e sem texto numérico por perto foram ignoradas.`);
  if (marcas.length === 0) avisos.push('O DXF não tem POINT nem CIRCLE — nada para importar (blocos INSERT não são lidos).');
  return { brutos, ignoradas: semTexto, avisos, unidade };
}

function atributo(tag: string, nome: string): number | null {
  const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*"([^"]*)"`, 'i')) ?? tag.match(new RegExp(`\\b${nome}\\s*=\\s*'([^']*)'`, 'i'));
  return m ? numeroFlexivel(m[1].replace(/px|pt|mm|cm/i, '')) : null;
}

// ── Curvas de nível num SVG (fase 11) ─────────────────────────────────────

interface CurvaSvg {
  /** Vértices em unidades do arquivo, como escritos. */
  pontos: { x: number; y: number }[];
  /** Cota explícita (`data-cota`, `data-elevation`, `data-z`) ou casada com um texto. */
  cotaM: number | null;
  mestra: boolean;
}

/**
 * Vértices de um `d` de `<path>`: M/L/H/V/Z absolutos e relativos. Curvas
 * (C/S/Q/T/A) entram só pelo ponto final — para curva de nível, que o CAD
 * exporta como polilinha, é o suficiente; para uma spline de verdade sai um
 * traço mais grosseiro, com aviso.
 */
export function verticesDoPath(d: string): { pontos: { x: number; y: number }[]; temCurvasBezier: boolean }[] {
  const sub: { pontos: { x: number; y: number }[]; temCurvasBezier: boolean }[] = [];
  let atual: { x: number; y: number }[] = [];
  let bezier = false;
  let x = 0;
  let y = 0;
  let inicioX = 0;
  let inicioY = 0;
  const fechar = () => {
    if (atual.length > 0) sub.push({ pontos: atual, temCurvasBezier: bezier });
    atual = [];
    bezier = false;
  };
  const tokens = d.match(/[MmLlHhVvZzCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (atual.length > 0 && (atual[0].x !== x || atual[0].y !== y)) atual.push({ x: inicioX, y: inicioY });
        x = inicioX;
        y = inicioY;
        fechar();
        continue;
      }
      continue;
    }
    switch (cmd) {
      case 'M':
      case 'm': {
        if (cmd === 'M') {
          x = num();
          y = num();
        } else {
          x += num();
          y += num();
        }
        fechar();
        inicioX = x;
        inicioY = y;
        atual.push({ x, y });
        // Pares seguintes num M são L implícitos.
        cmd = cmd === 'M' ? 'L' : 'l';
        break;
      }
      case 'L':
        x = num();
        y = num();
        atual.push({ x, y });
        break;
      case 'l':
        x += num();
        y += num();
        atual.push({ x, y });
        break;
      case 'H':
        x = num();
        atual.push({ x, y });
        break;
      case 'h':
        x += num();
        atual.push({ x, y });
        break;
      case 'V':
        y = num();
        atual.push({ x, y });
        break;
      case 'v':
        y += num();
        atual.push({ x, y });
        break;
      case 'C':
      case 'c': {
        bezier = true;
        const rel = cmd === 'c';
        num();
        num();
        num();
        num();
        const ex = num();
        const ey = num();
        x = rel ? x + ex : ex;
        y = rel ? y + ey : ey;
        atual.push({ x, y });
        break;
      }
      case 'S':
      case 's':
      case 'Q':
      case 'q': {
        bezier = true;
        const rel = cmd === 's' || cmd === 'q';
        num();
        num();
        const ex = num();
        const ey = num();
        x = rel ? x + ex : ex;
        y = rel ? y + ey : ey;
        atual.push({ x, y });
        break;
      }
      case 'T':
      case 't': {
        bezier = true;
        const ex = num();
        const ey = num();
        x = cmd === 't' ? x + ex : ex;
        y = cmd === 't' ? y + ey : ey;
        atual.push({ x, y });
        break;
      }
      case 'A':
      case 'a': {
        bezier = true;
        num();
        num();
        num();
        num();
        num();
        const ex = num();
        const ey = num();
        x = cmd === 'a' ? x + ex : ex;
        y = cmd === 'a' ? y + ey : ey;
        atual.push({ x, y });
        break;
      }
      default:
        i++;
    }
    if (Number.isNaN(x) || Number.isNaN(y)) break;
  }
  fechar();
  return sub.filter((s) => s.pontos.length >= 2);
}

function cotaExplicita(tag: string): number | null {
  for (const nome of ['data-cota', 'data-elevation', 'data-elev', 'data-z', 'data-cota-m']) {
    const m = tag.match(new RegExp(`\\b${nome}\\s*=\\s*"([^"]*)"`, 'i'));
    if (m) {
      const v = numeroFlexivel(m[1]);
      if (v !== null) return v;
    }
  }
  return null;
}

function distanciaAPolilinhaSvg(p: { x: number; y: number }, pts: { x: number; y: number }[]): number {
  let menor = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < menor) menor = d;
  }
  return menor;
}

/**
 * As curvas de nível de um SVG: `<path>`, `<polyline>` e `<polygon>` com ≥ 3
 * vértices. A cota vem de `data-cota` (o SVG do ÒPURA e vários GIS escrevem
 * assim) ou do texto numérico mais próximo da linha — o rótulo que o CAD põe
 * sobre a curva. Cada texto serve a UMA curva (a mais próxima); curva sem
 * rótulo fica sem cota e não vira ponto.
 */
export function lerCurvasDoSvg(
  texto: string,
  opcoes: { textosParaCota?: { x: number; y: number; valor: number; alcance: number }[] } = {},
): { curvas: CurvaSvg[]; temBezier: boolean } {
  const curvas: CurvaSvg[] = [];
  let temBezier = false;
  for (const m of texto.matchAll(/<path\b([^>]*?)\/?>/gi)) {
    const tag = m[1];
    const d = tag.match(/\bd\s*=\s*"([^"]+)"/)?.[1] ?? tag.match(/\bd\s*=\s*'([^']+)'/)?.[1];
    if (!d) continue;
    const cota = cotaExplicita(tag);
    const mestra = /\bclass\s*=\s*"[^"]*mestra/.test(tag);
    for (const s of verticesDoPath(d)) {
      if (s.pontos.length < 3) continue;
      if (s.temCurvasBezier) temBezier = true;
      curvas.push({ pontos: s.pontos, cotaM: cota, mestra });
    }
  }
  for (const m of texto.matchAll(/<(polyline|polygon)\b([^>]*?)\/?>/gi)) {
    const tag = m[2];
    const pts = tag.match(/\bpoints\s*=\s*"([^"]+)"/)?.[1];
    if (!pts) continue;
    const nums = pts.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g)?.map(Number) ?? [];
    const pontos: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pontos.push({ x: nums[i], y: nums[i + 1] });
    if (m[1].toLowerCase() === 'polygon' && pontos.length > 0) pontos.push(pontos[0]);
    if (pontos.length < 3) continue;
    curvas.push({ pontos, cotaM: cotaExplicita(tag), mestra: false });
  }
  // Textos → curvas sem cota explícita: cada texto vai para a curva mais
  // próxima dele, desde que a distância caiba no alcance do texto.
  const textos = opcoes.textosParaCota ?? [];
  const usados = new Set<number>();
  for (const [ti, t] of textos.entries()) {
    let melhor = -1;
    let menor = Infinity;
    curvas.forEach((c, ci) => {
      if (c.cotaM !== null) return;
      const d = distanciaAPolilinhaSvg(t, c.pontos);
      if (d < menor && d <= t.alcance) {
        menor = d;
        melhor = ci;
      }
    });
    if (melhor >= 0) {
      curvas[melhor].cotaM = t.valor;
      usados.add(ti);
    }
  }
  return { curvas, temBezier };
}

/**
 * Pontos cotados a partir das curvas: cada curva reamostrada ao longo do
 * comprimento a um passo tal que o total fique perto de `alvo` pontos (a TIN
 * de milhares de vértices por curva só deixa a versão pesada sem melhorar
 * nada). Os vértices originais entram quando o passo é maior que o trecho.
 */
export function pontosDasCurvas(
  curvas: { pontos: { x: number; y: number }[]; cotaM: number }[],
  alvo = 1500,
  passoMinimo = 1,
): { x: number; y: number; z: number; curva: number }[] {
  const comprimentos = curvas.map((c) => {
    let s = 0;
    for (let i = 0; i + 1 < c.pontos.length; i++) s += Math.hypot(c.pontos[i + 1].x - c.pontos[i].x, c.pontos[i + 1].y - c.pontos[i].y);
    return s;
  });
  const total = comprimentos.reduce((a, b) => a + b, 0);
  const passo = Math.max(passoMinimo, total / Math.max(1, alvo));
  const saida: { x: number; y: number; z: number; curva: number }[] = [];
  curvas.forEach((c, ci) => {
    const pts = c.pontos;
    if (pts.length < 2) return;
    saida.push({ x: pts[0].x, y: pts[0].y, z: c.cotaM, curva: ci });
    let acumulado = 0;
    let proximo = passo;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (seg > 0 && proximo <= acumulado + seg) {
        const t = (proximo - acumulado) / seg;
        saida.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: c.cotaM, curva: ci });
        proximo += passo;
      }
      acumulado += seg;
    }
    const fim = pts[pts.length - 1];
    const ultimo = saida[saida.length - 1];
    if (ultimo.curva !== ci || Math.hypot(ultimo.x - fim.x, ultimo.y - fim.y) > passo * 0.25) {
      saida.push({ x: fim.x, y: fim.y, z: c.cotaM, curva: ci });
    }
  });
  return saida;
}

function lerSvgPontos(texto: string): { brutos: Bruto[]; ignoradas: number; avisos: string[]; alturaSvg: number; curvasLidas: number; curvasSemCota: number } {
  const avisos: string[] = [];
  let curvasLidas = 0;
  let curvasSemCota = 0;
  const viewBox = texto.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1]?.trim().split(/[\s,]+/).map(Number);
  const alturaAttr = atributo(texto.match(/<svg[^>]*>/i)?.[0] ?? '', 'height');
  const alturaSvg = viewBox && viewBox.length === 4 ? viewBox[1] + viewBox[3] : (alturaAttr ?? 0);
  if (/transform\s*=/.test(texto)) avisos.push('O SVG tem transform em algum elemento; as coordenadas são lidas como escritas (sem aplicar transform).');
  const marcas: { x: number; y: number; z: number }[] = [];
  for (const tag of texto.match(/<circle\b[^>]*>/gi) ?? []) {
    const cx = atributo(tag, 'cx');
    const cy = atributo(tag, 'cy');
    if (cx !== null && cy !== null) marcas.push({ x: cx, y: cy, z: 0 });
  }
  for (const tag of texto.match(/<ellipse\b[^>]*>/gi) ?? []) {
    const cx = atributo(tag, 'cx');
    const cy = atributo(tag, 'cy');
    if (cx !== null && cy !== null) marcas.push({ x: cx, y: cy, z: 0 });
  }
  for (const tag of texto.match(/<rect\b[^>]*>/gi) ?? []) {
    const x = atributo(tag, 'x');
    const y = atributo(tag, 'y');
    const w = atributo(tag, 'width') ?? 0;
    const h = atributo(tag, 'height') ?? 0;
    if (x !== null && y !== null && w > 0 && w <= 20 && h > 0 && h <= 20) marcas.push({ x: x + w / 2, y: y + h / 2, z: 0 });
  }
  const textos: { x: number; y: number; valor: number; alcance: number }[] = [];
  for (const m of texto.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)) {
    const x = atributo(m[1], 'x');
    const y = atributo(m[1], 'y');
    const conteudo = m[2].replace(/<[^>]+>/g, ' ').replace(/&#?\w+;/g, ' ');
    const valor = numeroNoTexto(conteudo);
    if (x !== null && y !== null && valor !== null) {
      const tamanho = atributo(m[1], 'font-size') ?? 12;
      textos.push({ x, y, valor, alcance: Math.max(30, tamanho * 4) });
    }
  }
  const { brutos, semTexto } = emparelharMarcasComTextos(marcas, textos);
  // Os textos que sobraram das marcas rotulam CURVAS (fase 11): uma polilinha
  // com um número ao lado é uma curva de nível com a cota escrita.
  const usadosPorMarca = new Set<number>();
  for (const b of brutos) {
    const i = textos.findIndex((t, k) => !usadosPorMarca.has(k) && t.valor === b.z && Math.hypot(t.x - b.b, t.y - b.a) <= t.alcance);
    if (i >= 0) usadosPorMarca.add(i);
  }
  const textosLivres = textos.filter((_, k) => !usadosPorMarca.has(k));
  const { curvas, temBezier } = lerCurvasDoSvg(texto, { textosParaCota: textosLivres });
  const comCota = curvas.filter((c): c is CurvaSvg & { cotaM: number } => c.cotaM !== null);
  curvasLidas = comCota.length;
  curvasSemCota = curvas.length - comCota.length;
  if (comCota.length > 0) {
    // Reamostra em unidades do arquivo; a escala para mm vem depois.
    for (const p of pontosDasCurvas(comCota, 1500, 0.5)) brutos.push({ a: p.y, b: p.x, z: p.z, codigo: `curva ${p.z}` });
    if (temBezier) avisos.push('Há curvas em Bézier/arco no SVG: entraram só pelos vértices de controle, mais grosseiras que o traço.');
  }
  if (curvasSemCota > 0) avisos.push(`${curvasSemCota} polilinha(s) sem cota (nem data-cota nem número ao lado) ficaram de fora.`);
  if (semTexto > 0) avisos.push(`${semTexto} marca(s) sem texto numérico por perto foram ignoradas.`);
  if (marcas.length === 0 && comCota.length === 0) avisos.push('O SVG não tem marcas de ponto nem curvas com cota — nada para importar.');
  return { brutos, ignoradas: semTexto, avisos, alturaSvg, curvasLidas, curvasSemCota };
}

/**
 * O SVG de curvas que o próprio ÒPURA exporta (`svgDasCurvas`): os `d` dos
 * paths trazem as coordenadas CRUAS do desenho, em mm — é o grupo
 * `<g transform="scale(1,-1)">` que vira a tela, não o número escrito. Então
 * o Y entra como está (nem negado, nem invertido pela viewBox). Cada curva
 * tem `data-cota`; os pontos cotados (cruz azul + texto) também entram.
 */
function lerCurvasSvgDoOpura(texto: string): { pontos: PontoImportado[]; curvasLidas: number; avisos: string[] } {
  const avisos: string[] = [];
  const { curvas } = lerCurvasDoSvg(texto);
  const comCota = curvas.filter((c): c is CurvaSvg & { cotaM: number } => c.cotaM !== null);
  const pontos: PontoImportado[] = pontosDasCurvas(comCota, 1500, 250).map((p) => ({
    x: p.x,
    y: p.y,
    cotaM: p.z,
    codigo: `curva ${p.z}`,
  }));
  // Pontos cotados originais: <text ... transform="scale(1,-1)"> azul (#1d4ed8)
  // a (x + 1,5r, -(y + 1,5r)) de uma cruz; recupera pela cruz (path com dois M).
  for (const m of texto.matchAll(/<path d="M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+) M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)" stroke="#1d4ed8"[^>]*\/>\s*<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>([^<]+)<\/text>/g)) {
    const cx = (Number(m[1]) + Number(m[3])) / 2;
    const cy = (Number(m[2]) + Number(m[4])) / 2;
    const cota = numeroFlexivel(m[11]);
    if (cota !== null) pontos.push({ x: cx, y: cy, cotaM: cota, codigo: 'ponto cotado' });
  }
  if (comCota.length === 0) avisos.push('Nenhuma curva com data-cota neste SVG.');
  const meta = texto.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
  if (meta) {
    const eq = meta.match(/equidistanciaM&quot;:([\d.]+)/) ?? meta.match(/equidistanciaM":([\d.]+)/);
    if (eq) avisos.push(`Curvas do ÒPURA com equidistância de ${eq[1]} m — os pontos reamostrados ao longo delas reconstroem o relevo entre curvas por triangulação.`);
  }
  return { pontos, curvasLidas: comCota.length, avisos };
}

// ── Ordem, unidade e ancoragem ────────────────────────────────────────────

function pareceUtm(brutos: Bruto[]): { sim: boolean; norteEmA: boolean } {
  if (brutos.length === 0) return { sim: false, norteEmA: true };
  const med = (xs: number[]) => xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)];
  const a = Math.abs(med(brutos.map((b) => b.a)));
  const b = Math.abs(med(brutos.map((b) => b.b)));
  const ehNorte = (v: number) => v >= 1_000_000 && v <= 10_000_000;
  const ehEste = (v: number) => v >= 100_000 && v <= 900_000;
  if (ehNorte(a) && ehEste(b)) return { sim: true, norteEmA: true };
  if (ehNorte(b) && ehEste(a)) return { sim: true, norteEmA: false };
  return { sim: false, norteEmA: true };
}

function centro(ps: { x: number; y: number }[]): Point {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * O importador. `formato` decide o leitor; as opções resolvem o que o arquivo
 * não diz (ordem N/E, unidade, onde cai no desenho, escala do SVG).
 */
export function importarPontos(
  texto: string,
  formato: FormatoDeImportacao,
  ctx: ContextoDaImportacao,
  opcoes: OpcoesDeImportacao = {},
): ResultadoDaImportacao {
  const avisos: string[] = [];
  let brutos: Bruto[] = [];
  let ignoradas = 0;
  let separador: string | undefined;
  let cabecalho: boolean | undefined;
  let ordem: 'NEZ' | 'ENZ' | 'GEO' = 'NEZ';
  let unidade: ResultadoDaImportacao['detectado']['unidade'] = 'M';
  let alturaSvg = 0;
  let unidadeDoDxf: 'M' | 'MM' | null = null;
  let curvasLidas: number | undefined;
  let curvasSemCota: number | undefined;
  const ordemPedida = opcoes.ordem ?? 'AUTO';
  const unidadePedida = opcoes.unidade ?? 'AUTO';

  // Curvas do próprio ÒPURA (fase 11): já em mm do desenho.
  if (formato === 'CURVAS_SVG') {
    const l = lerCurvasSvgDoOpura(texto);
    avisos.push(...l.avisos);
    let pontosC = l.pontos.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
    let ancC: ResultadoDaImportacao['detectado']['ancoragem'] = 'DIRETO';
    if (opcoes.ancoragem === 'CENTRO_DO_LOTE' && ctx.anel && ctx.anel.length >= 3 && pontosC.length > 0) {
      const cp = centro(pontosC);
      const cl = centro(ctx.anel);
      pontosC = pontosC.map((p) => ({ ...p, x: Math.round(p.x + cl.x - cp.x), y: Math.round(p.y + cl.y - cp.y) }));
      ancC = 'CENTRO_DO_LOTE';
    }
    const dentro = ctx.anel && ctx.anel.length >= 3 ? pontosC.filter((p) => pointInPolygon(ctx.anel!, p)).length : pontosC.length;
    if (pontosC.length > 0 && dentro === 0) avisos.push('Nenhum ponto cai dentro do lote: este SVG é de outro estudo? Use "Centro dos pontos no centro do lote".');
    return {
      formato,
      pontos: pontosC,
      detectado: { ordem: 'ENZ', unidade: 'MM', ancoragem: ancC, linhasLidas: pontosC.length, linhasIgnoradas: 0, curvasLidas: l.curvasLidas, curvasSemCota: 0 },
      dentroDoLote: dentro,
      avisos,
    };
  }

  // Perfis do próprio ÒPURA (fase 10): saída direta, sem passar por ordem/unidade.
  if (formato === 'PERFIL_CSV' || formato === 'PERFIL_SVG') {
    let pontosP: PontoImportado[];
    let lidas: number;
    let ignoradasP = 0;
    if (formato === 'PERFIL_CSV') {
      const l = lerPerfilCsvDoOpura(texto);
      pontosP = l.pontos;
      lidas = l.pontos.length + l.ignoradas;
      ignoradasP = l.ignoradas;
      if (l.ignoradas > 0) avisos.push(`${l.ignoradas} amostra(s) sem cota (nodata) ficaram de fora.`);
    } else {
      const perfil = lerPerfilSvgDoOpura(texto);
      lidas = perfil.pontos.length;
      if (!ctx.linhaDoPerfil || ctx.linhaDoPerfil.length < 2) {
        throw new Error(
          'O SVG de perfil só tem distância e cota: escolha em "Perfil altimétrico" a linha (um corte ou a linha desenhada) sobre a qual os pontos vão se apoiar, e importe de novo.',
        );
      }
      const compLinha = ctx.linhaDoPerfil[ctx.linhaDoPerfil.length - 1].distM;
      if (Math.abs(compLinha - perfil.comprimentoM) > Math.max(0.5, perfil.comprimentoM * 0.02)) {
        avisos.push(`O perfil tem ${perfil.comprimentoM.toFixed(1)} m e a linha escolhida tem ${compLinha.toFixed(1)} m: os pontos foram apoiados pela distância, do início da linha.`);
      }
      const r = perfilSobreLinha(perfil.pontos, ctx.linhaDoPerfil);
      pontosP = r.pontos;
      ignoradasP = r.foraDaLinha;
      if (r.foraDaLinha > 0) avisos.push(`${r.foraDaLinha} ponto(s) do perfil passam do fim da linha e ficaram de fora.`);
      avisos.push('Cotas lidas do gráfico: a precisão é a da escala do desenho (≈ 1 cm); o CSV do perfil traz os valores exatos.');
    }
    pontosP = pontosP.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
    if (pontosP.length >= 3 && colineares(pontosP)) {
      avisos.push('Todos os pontos estão numa reta só: sozinhos não triangulam. Acrescente aos pontos existentes ou importe outro perfil que cruze este.');
    }
    const dentro = ctx.anel && ctx.anel.length >= 3 ? pontosP.filter((p) => pointInPolygon(ctx.anel!, p)).length : pontosP.length;
    if (pontosP.length > 0 && dentro === 0) avisos.push('Nenhum ponto cai dentro do lote.');
    return {
      formato,
      pontos: pontosP,
      detectado: { ordem: 'ENZ', unidade: 'MM', ancoragem: 'DIRETO', linhasLidas: lidas, linhasIgnoradas: ignoradasP },
      dentroDoLote: dentro,
      avisos,
    };
  }

  if (formato === 'TEXTO') {
    const l = lerTexto(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    separador = l.separador === '\t' ? 'tab' : l.separador === ' ' ? 'espaço' : l.separador;
    cabecalho = l.cabecalho;
    if (l.geo) ordem = 'GEO';
    else if (l.ordemPeloCabecalho) ordem = l.ordemPeloCabecalho;
    else if (ordemPedida !== 'AUTO') ordem = ordemPedida;
    else {
      const utm = pareceUtm(brutos);
      ordem = utm.sim ? (utm.norteEmA ? 'NEZ' : 'ENZ') : 'NEZ';
      if (!utm.sim && brutos.length > 0) avisos.push('Sem cabeçalho: as colunas foram lidas como P, N, E, Z (PNEZD). Se o arquivo é P, E, N, Z, troque a ordem.');
    }
  } else if (formato === 'GEOJSON') {
    const l = lerGeoJson(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    avisos.push(...l.avisos);
    ordem = 'GEO';
  } else if (formato === 'KML') {
    const l = lerKml(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    ordem = 'GEO';
    if (ignoradas > 0) avisos.push(`${ignoradas} Placemark(s) sem Point ou sem altitude foram ignorados.`);
  } else if (formato === 'DXF') {
    const l = lerDxfPontos(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    avisos.push(...l.avisos);
    unidadeDoDxf = l.unidade;
    ordem = 'NEZ'; // as marcas saem como a = y (N), b = x (E)
  } else {
    const l = lerSvgPontos(texto);
    brutos = l.brutos;
    ignoradas = l.ignoradas;
    avisos.push(...l.avisos);
    alturaSvg = l.alturaSvg;
    curvasLidas = l.curvasLidas;
    curvasSemCota = l.curvasSemCota;
    ordem = 'NEZ';
  }

  // Em (E, N) metros (ou graus quando GEO), já na ordem certa.
  let pontosEN: { e: number; n: number; z: number; nome?: string; codigo?: string }[] = brutos.map((b) =>
    ordem === 'ENZ' ? { e: b.a, n: b.b, z: b.z, nome: b.nome, codigo: b.codigo } : { e: b.b, n: b.a, z: b.z, nome: b.nome, codigo: b.codigo },
  );

  let ancoragem: ResultadoDaImportacao['detectado']['ancoragem'] = 'DIRETO';
  let zonaUtm: number | undefined;
  let pontos: PontoImportado[] = [];

  if (formato === 'SVG') {
    unidade = 'SVG';
    const escala = opcoes.escalaSvgMmPorUnidade && opcoes.escalaSvgMmPorUnidade > 0 ? opcoes.escalaSvgMmPorUnidade : 1000;
    // Y do SVG cresce para baixo: inverte pela altura da caixa.
    pontos = pontosEN.map((p) => ({ x: p.e * escala, y: (alturaSvg - p.n) * escala, cotaM: p.z, nome: p.nome, codigo: p.codigo }));
    if (alturaSvg === 0) avisos.push('SVG sem viewBox/height: o Y foi invertido em torno de zero.');
  } else if (ordem === 'GEO') {
    unidade = 'GEO';
    if (!ctx.georreferencia) {
      throw new Error('Pontos em latitude/longitude precisam da georreferência do lote ("Onde fica") para cair no desenho.');
    }
    const geo = ctx.georreferencia;
    ancoragem = 'GEORREFERENCIA';
    pontos = pontosEN.map((p) => ({ ...geoParaLocal({ lat: p.n, lon: p.e }, geo), cotaM: p.z, nome: p.nome, codigo: p.codigo }));
  } else {
    const utm = unidadePedida === 'UTM' || (unidadePedida === 'AUTO' && pareceUtm(brutos).sim);
    if (utm) {
      unidade = 'UTM';
      if (!ctx.georreferencia && !(opcoes.zonaUtm && opcoes.hemisferio)) {
        throw new Error('Coordenadas UTM precisam da georreferência do lote ("Onde fica") ou da zona e do hemisfério.');
      }
      const zona = opcoes.zonaUtm ?? zonaUtmDe(ctx.georreferencia!.longitude);
      const hemi = opcoes.hemisferio ?? (ctx.georreferencia!.latitude < 0 ? 'S' : 'N');
      zonaUtm = zona;
      if (!ctx.georreferencia) {
        throw new Error('Sem a georreferência do lote não há como levar UTM para o desenho.');
      }
      const geo = ctx.georreferencia;
      ancoragem = 'GEORREFERENCIA';
      pontos = pontosEN.map((p) => ({ ...geoParaLocal(utmParaLatLon(p.e, p.n, zona, hemi), geo), cotaM: p.z, nome: p.nome, codigo: p.codigo }));
    } else {
      const maior = Math.max(0, ...pontosEN.map((p) => Math.max(Math.abs(p.e), Math.abs(p.n))));
      // Coordenada local em metros raramente passa de alguns milhares (a
      // origem do topógrafo costuma ser 1000,1000); em mm do desenho um lote
      // urbano já passa de 5000. UTM foi tratado antes.
      const emMm = unidadePedida === 'MM' || (unidadePedida === 'AUTO' && (unidadeDoDxf === 'MM' || (unidadeDoDxf === null && maior > 5000)));
      unidade = emMm ? 'MM' : 'M';
      const fator = emMm ? 1 : 1000;
      pontos = pontosEN.map((p) => ({ x: p.e * fator, y: p.n * fator, cotaM: p.z, nome: p.nome, codigo: p.codigo }));
    }
  }

  // Ancoragem para o que não veio pela georreferência.
  if (ancoragem !== 'GEORREFERENCIA' && pontos.length > 0) {
    const pedida = opcoes.ancoragem ?? 'AUTO';
    let escolha: 'DIRETO' | 'CENTRO_DO_LOTE' = 'DIRETO';
    if (pedida === 'CENTRO_DO_LOTE') escolha = 'CENTRO_DO_LOTE';
    else if (pedida === 'DIRETO' || pedida === 'GEORREFERENCIA') escolha = 'DIRETO';
    else if (ctx.anel && ctx.anel.length >= 3) {
      const dentro = pontos.filter((p) => pointInPolygon(ctx.anel!, p)).length;
      if (dentro < Math.max(1, Math.ceil(pontos.length * 0.3))) {
        escolha = 'CENTRO_DO_LOTE';
        avisos.push('Os pontos não caem sobre o lote como estão: o centro do conjunto foi levado ao centro do lote. Se as coordenadas já são as do desenho, escolha "Direto".');
      }
    }
    if (escolha === 'CENTRO_DO_LOTE' && ctx.anel && ctx.anel.length >= 3) {
      const cp = centro(pontos);
      const cl = centro(ctx.anel);
      const dx = cl.x - cp.x;
      const dy = cl.y - cp.y;
      pontos = pontos.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    }
    ancoragem = escolha;
  }

  pontos = pontos.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
  const dentroDoLote = ctx.anel && ctx.anel.length >= 3 ? pontos.filter((p) => pointInPolygon(ctx.anel!, p)).length : pontos.length;
  if (pontos.length > 0 && dentroDoLote === 0) avisos.push('Nenhum ponto cai dentro do lote: confira ordem N/E, unidade e ancoragem.');
  if (pontos.length > 0 && pontos.length < 3) avisos.push('Menos de três pontos: a triangulação precisa de pelo menos três, não alinhados.');
  if (pontos.length === 0 && ignoradas === 0) avisos.push('Nenhum ponto reconhecido no arquivo.');

  return {
    formato,
    pontos,
    detectado: { separador, cabecalho, ordem, unidade, ancoragem, zonaUtm, linhasLidas: brutos.length, linhasIgnoradas: ignoradas, curvasLidas, curvasSemCota },
    dentroDoLote,
    avisos,
  };
}
