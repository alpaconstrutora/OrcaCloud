/**
 * O LOTE DIGITADO (03/10/2026) — *"hoje o terreno ou lote é criado apenas
 * desenhando. implementar também digitando"*.
 *
 * Quatro formas de dizer o mesmo contorno, todas com o que a escritura ou o
 * levantamento traz:
 *
 *  1. FRENTE × FUNDO — o lote retangular, o caso mais comum de loteamento.
 *  2. LADOS E ÂNGULOS — medida de cada lado e o ângulo INTERNO no vértice
 *     inicial dele (o que a trena e o esquadro dão).
 *  3. AZIMUTES/RUMOS — o memorial: "azimute 45°30' e distância 32,50 m".
 *  4. COORDENADAS — E/N dos vértices (locais em m/mm, ou UTM com a
 *     georreferência do estudo).
 *
 * Tudo aqui é PURO: devolve o contorno e os comandos do kernel; quem chama
 * aplica a lista inteira de uma vez (um Ctrl+Z desfaz tudo).
 *
 * ⚠️ Três convenções que valem papel:
 *
 *  - O AZIMUTE digitado é o da escritura — contra o NORTE. Num estudo com
 *    `rotacaoNorteDeg`, o +Y do desenho não é o norte, e a direção no desenho
 *    sai de `direcaoDoAzimute` (o inverso exato de `azimuteDaDirecao`). Sem
 *    isto, o memorial do próprio Roteiro voltava girado.
 *  - O percurso dos LADOS E ÂNGULOS é HORÁRIO (o interior fica à direita, como
 *    o roteiro): Azᵢ = Azᵢ₋₁ + 180° − ângulo interno no vértice i.
 *  - O que não fecha NÃO é fechado calado. Até a tolerância (o maior entre
 *    10 mm e perímetro/5000) o erro é distribuído e DITO; acima dela, quem
 *    digitou escolhe: distribuir (Bowditch) ou fechar com uma divisa de ajuste.
 */
import type { BlueprintModel, BoundaryPapel, Command, Georreferencia, Point } from './blueprintKernel';
import { applyBatch, isSimplePolygon, signedArea } from './blueprintKernel';
import { lerAngulo } from './blueprintRoteiroPerimetrico';
import { importarPontos, numeroFlexivel } from './blueprintTopografiaImportacao';

export type ModoDoLoteDigitado = 'RETANGULO' | 'LADOS' | 'AZIMUTES' | 'COORDENADAS' | 'MEMORIAL';

/** Um lado do contorno digitado — do vértice `i` ao `i + 1`. */
export interface LadoDigitado {
  papel?: BoundaryPapel | null;
  /** A medida DIGITADA (a da escritura), em mm. Ausente nas coordenadas. */
  medidaMm?: number | null;
  confrontante?: string | null;
  /** true na divisa que fecha o erro (`DIVISA_DE_AJUSTE`) — não veio da escritura. */
  ajuste?: boolean;
}

/**
 * O contorno como foi DIGITADO, antes de fechar: `caminho` tem n + 1 pontos
 * (o último deveria cair sobre o primeiro); `lados` e `vertices` têm n.
 */
export interface LoteDigitado {
  caminho: Point[];
  lados: LadoDigitado[];
  /** Nome do vértice inicial de cada lado; `null` = sem nome. */
  vertices: (string | null)[];
  /** Distância entre o fim do caminho e o início, em mm. Zero = fechou. */
  erroDeFechamentoMm: number;
  /** Só nos lados e ângulos com o ângulo do 1º vértice: Σ internos − (n − 2)·180°. */
  erroAngularGraus: number | null;
  perimetroMm: number;
  /** O que impede lançar, dito em português; `null` = dá para fechar. */
  problema: string | null;
  avisos: string[];
}

export type DecisaoDeFechamento = 'DISTRIBUIR' | 'DIVISA_DE_AJUSTE';

export interface LoteFechado {
  /** Anel ABERTO, em mm inteiros. */
  anel: Point[];
  lados: LadoDigitado[];
  vertices: (string | null)[];
  areaMm2: number;
  perimetroMm: number;
  erroDeFechamentoMm: number;
  compensacao: 'NENHUMA' | 'DISTRIBUIDA' | 'DIVISA_DE_AJUSTE';
  /** `null` = pronto para lançar. */
  problema: string | null;
  /** Frase para a tela: o que foi feito com o erro. */
  descricao: string;
}

const PAPEIS_DO_RETANGULO: BoundaryPapel[] = ['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'];

const normalizar = (g: number) => ((g % 360) + 360) % 360;
const rad = (g: number) => (g * Math.PI) / 180;

/**
 * A direção no desenho de um azimute verdadeiro — o inverso de
 * `azimuteDaDirecao` (blueprintGrafoEspacial): lá, norte = (sen θ, cos θ) e
 * leste = (cos θ, −sen θ); aqui, norte·cos A + leste·sen A = (sen(A+θ), cos(A+θ)).
 */
export function direcaoDoAzimute(azimuteGraus: number, rotacaoNorteDeg: number | null | undefined): Point {
  const a = rad(azimuteGraus + (rotacaoNorteDeg ?? 0));
  return { x: Math.sin(a), y: Math.cos(a) };
}

/** A rotação do norte do estudo (graus); 0 quando o desenho aponta para o norte. */
export function rotacaoDoNorte(model: Pick<BlueprintModel, 'georreferencia'>): number {
  const r = model.georreferencia?.rotacaoNorteDeg;
  return Number.isFinite(r) ? (r as number) : 0;
}

// ── Leitura do que se digita ─────────────────────────────────────────────

/** Medida em metros ("12,50", "12.5", "12,50 m") → mm inteiros; `null` se não lê. */
export function lerMedidaEmMetros(texto: string): number | null {
  const t = texto.trim().replace(/\s*m$/i, '');
  if (t === '') return null;
  const v = numeroFlexivel(t);
  return v !== null && v > 0 ? Math.round(v * 1000) : null;
}

/**
 * Ângulo digitado: `45°30'10"`, `45 30 10`, `45,5`. Devolve graus decimais.
 */
export function lerAnguloDigitado(texto: string): number | null {
  const t = texto.trim();
  if (t === '') return null;
  const espacos = t.match(/^(\d{1,3})\s+(\d{1,2})(?:\s+(\d{1,2}(?:[.,]\d+)?))?$/);
  if (espacos) return Number(espacos[1]) + Number(espacos[2]) / 60 + (espacos[3] ? Number(espacos[3].replace(',', '.')) : 0) / 3600;
  // Só o ângulo: nada sobrando depois dele (senão "12 m" passaria por 12°).
  if (!/^[\d°º'′"″.,\s]+$/.test(t)) return null;
  return lerAngulo(t);
}

/**
 * Azimute OU rumo: `135°30'`, `45°30' SE`, `S 45°30' E`. Devolve o azimute em
 * graus [0, 360), ou `null` com o motivo em `erro`.
 */
export function lerAzimuteOuRumo(texto: string): { azimute: number | null; erro: string | null } {
  const t = texto.trim().toUpperCase().replace(/\s+/g, ' ');
  if (t === '') return { azimute: null, erro: 'vazio' };
  // Rumo com o quadrante no fim ("45°30' SE") ou nas pontas ("S 45°30' E").
  const fim = t.match(/^(.*?)\s*(NE|SE|SW|NW|SO|NO)$/);
  const pontas = t.match(/^([NS])\s*(.*?)\s*([EWLOW])$/);
  let quadrante: string | null = null;
  let corpo = t;
  if (fim) {
    quadrante = fim[2];
    corpo = fim[1];
  } else if (pontas) {
    quadrante = pontas[1] + pontas[3];
    corpo = pontas[2];
  }
  const ang = lerAnguloDigitado(corpo);
  if (ang === null) return { azimute: null, erro: `não deu para ler o ângulo em "${texto.trim()}"` };
  if (quadrante) {
    const q = quadrante.replace('SO', 'SW').replace('NO', 'NW').replace('L', 'E').replace(/O$/, 'W');
    if (ang > 90) return { azimute: null, erro: `rumo vai de 0° a 90° (leu ${ang.toFixed(4).replace('.', ',')}°)` };
    const az = q === 'NE' ? ang : q === 'SE' ? 180 - ang : q === 'SW' ? 180 + ang : 360 - ang;
    return { azimute: normalizar(az), erro: null };
  }
  if (ang >= 360) return { azimute: null, erro: `azimute vai de 0° a 360° (leu ${ang.toFixed(4).replace('.', ',')}°)` };
  return { azimute: ang, erro: null };
}

// ── Os geradores ─────────────────────────────────────────────────────────

function caminhar(inicio: Point, passos: { direcao: Point; distanciaMm: number }[]): Point[] {
  const pts: Point[] = [{ ...inicio }];
  let x = inicio.x;
  let y = inicio.y;
  for (const p of passos) {
    x += p.direcao.x * p.distanciaMm;
    y += p.direcao.y * p.distanciaMm;
    pts.push({ x, y });
  }
  return pts;
}

function montar(caminho: Point[], lados: LadoDigitado[], vertices: (string | null)[], extra: Partial<LoteDigitado> = {}): LoteDigitado {
  const n = lados.length;
  let perimetro = 0;
  for (let i = 0; i + 1 < caminho.length; i += 1) perimetro += Math.hypot(caminho[i + 1].x - caminho[i].x, caminho[i + 1].y - caminho[i].y);
  const fim = caminho[caminho.length - 1];
  const erro = caminho.length > 1 ? Math.hypot(fim.x - caminho[0].x, fim.y - caminho[0].y) : 0;
  return {
    caminho,
    lados,
    vertices,
    erroDeFechamentoMm: Math.round(erro * 10) / 10,
    erroAngularGraus: null,
    perimetroMm: Math.round(perimetro),
    problema: n < 3 ? 'O lote precisa de pelo menos três lados.' : null,
    avisos: [],
    ...extra,
  };
}

/**
 * O LOTE RETANGULAR: frente × profundidade. A frente corre em +X e o lote fica
 * para +Y (a rua embaixo, no desenho). Com `frenteVoltadaPara` (azimuto da
 * direção do lote para a rua), o retângulo gira para a frente olhar para lá.
 *
 * Papéis já definidos, na convenção do `papeisSugeridos`: direita e esquerda
 * de quem está NA RUA, olhando para o lote.
 */
export function loteRetangular(entrada: {
  frenteMm: number;
  profundidadeMm: number;
  frenteVoltadaPara?: number | null;
  rotacaoNorteDeg?: number | null;
  confrontantes?: Partial<Record<BoundaryPapel, string | null>>;
}): LoteDigitado {
  const { frenteMm: f, profundidadeMm: p } = entrada;
  if (!(f > 0) || !(p > 0)) {
    return { ...montar([], [], []), problema: 'Informe a frente e a profundidade, em metros.' };
  }
  // Normal interna (da rua para dentro do lote) e a mão direita de quem olha nela.
  let n: Point = { x: 0, y: 1 };
  if (entrada.frenteVoltadaPara != null && Number.isFinite(entrada.frenteVoltadaPara)) {
    const fora = direcaoDoAzimute(entrada.frenteVoltadaPara, entrada.rotacaoNorteDeg);
    n = { x: -fora.x, y: -fora.y };
  }
  const direita: Point = { x: n.y, y: -n.x };
  const anel: Point[] = [
    { x: 0, y: 0 },
    { x: direita.x * f, y: direita.y * f },
    { x: direita.x * f + n.x * p, y: direita.y * f + n.y * p },
    { x: n.x * p, y: n.y * p },
  ];
  const medidas = [f, p, f, p];
  const lados = PAPEIS_DO_RETANGULO.map((papel, i) => ({ papel, medidaMm: medidas[i], confrontante: entrada.confrontantes?.[papel]?.trim() || null }));
  return montar([...anel, { ...anel[0] }], lados, [null, null, null, null]);
}

export interface LadoComAngulo {
  distanciaMm: number;
  /** Ângulo INTERNO no vértice inicial do lado, em graus. O do 1º é opcional. */
  anguloInternoGraus: number | null;
  confrontante?: string | null;
  verticeNome?: string | null;
}

/**
 * LADOS E ÂNGULOS, percurso horário. O 1º lado sai na direção
 * `azimuteDoPrimeiro` (verdadeiro; ausente = +X do desenho). O ângulo do 1º
 * vértice não entra no traçado — só confere o fechamento angular.
 */
export function lotePorLadosEAngulos(
  lados: LadoComAngulo[],
  opcoes: { azimuteDoPrimeiro?: number | null; rotacaoNorteDeg?: number | null } = {},
): LoteDigitado {
  const n = lados.length;
  const faltaAngulo = lados.findIndex((l, i) => i > 0 && (l.anguloInternoGraus == null || !(l.anguloInternoGraus > 0 && l.anguloInternoGraus < 360)));
  const faltaMedida = lados.findIndex((l) => !(l.distanciaMm > 0));
  // Sem azimute informado, o 1º lado corre em +X do DESENHO (não do norte).
  const usarNorte = opcoes.azimuteDoPrimeiro != null && Number.isFinite(opcoes.azimuteDoPrimeiro);
  let az = usarNorte ? (opcoes.azimuteDoPrimeiro as number) : 90;
  const rot = usarNorte ? opcoes.rotacaoNorteDeg : 0;
  const passos: { direcao: Point; distanciaMm: number }[] = [];
  if (faltaAngulo < 0 && faltaMedida < 0) {
    lados.forEach((l, i) => {
      if (i > 0) az = normalizar(az + 180 - (l.anguloInternoGraus as number));
      passos.push({ direcao: direcaoDoAzimute(az, rot), distanciaMm: l.distanciaMm });
    });
  }
  const caminho = passos.length ? caminhar({ x: 0, y: 0 }, passos) : [];
  const lote = montar(
    caminho,
    lados.map((l) => ({ medidaMm: l.distanciaMm > 0 ? Math.round(l.distanciaMm) : null, confrontante: l.confrontante?.trim() || null })),
    lados.map((l) => l.verticeNome?.trim() || null),
  );
  const primeiro = lados[0]?.anguloInternoGraus;
  if (n >= 3 && faltaAngulo < 0 && primeiro != null && primeiro > 0) {
    const soma = lados.reduce((s, l) => s + (l.anguloInternoGraus as number), 0);
    lote.erroAngularGraus = Math.round((soma - (n - 2) * 180) * 1e6) / 1e6;
  }
  if (n >= 3 && faltaMedida >= 0) lote.problema = `Lado ${faltaMedida + 1}: informe a medida, em metros.`;
  else if (n >= 3 && faltaAngulo >= 0) lote.problema = `Lado ${faltaAngulo + 1}: informe o ângulo interno no vértice inicial (entre 0° e 360°).`;
  return lote;
}

export interface TrechoPorAzimute {
  azimute: number;
  distanciaMm: number;
  confrontante?: string | null;
  verticeNome?: string | null;
}

/** AZIMUTES (verdadeiros) e distâncias, a partir da origem, girados pelo norte do estudo. */
export function lotePorAzimutes(trechos: TrechoPorAzimute[], opcoes: { rotacaoNorteDeg?: number | null } = {}): LoteDigitado {
  const faltaMedida = trechos.findIndex((t) => !(t.distanciaMm > 0));
  const faltaAz = trechos.findIndex((t) => !Number.isFinite(t.azimute));
  const caminho =
    faltaMedida < 0 && faltaAz < 0
      ? caminhar({ x: 0, y: 0 }, trechos.map((t) => ({ direcao: direcaoDoAzimute(t.azimute, opcoes.rotacaoNorteDeg), distanciaMm: t.distanciaMm })))
      : [];
  const lote = montar(
    caminho,
    trechos.map((t) => ({ medidaMm: t.distanciaMm > 0 ? Math.round(t.distanciaMm) : null, confrontante: t.confrontante?.trim() || null })),
    trechos.map((t) => t.verticeNome?.trim() || null),
  );
  if (trechos.length >= 3 && faltaMedida >= 0) lote.problema = `Trecho ${faltaMedida + 1}: informe a distância, em metros.`;
  else if (trechos.length >= 3 && faltaAz >= 0) lote.problema = `Trecho ${faltaAz + 1}: informe o azimute ou o rumo.`;
  return lote;
}

/**
 * COORDENADAS dos vértices, uma linha por vértice: `[nome] E N` (ou `N E`),
 * separadas por espaço, tabulação ou ponto e vírgula; vírgula decimal aceita.
 * Reaproveita o importador do levantamento (UTM e georreferência), na ordem
 * em que foram digitadas. Locais (m/mm) vão para a origem do desenho pelo 1º
 * vértice, a menos que `manterCoordenadas`.
 */
export function lotePorCoordenadas(
  texto: string,
  ctx: { georreferencia: Georreferencia | null },
  opcoes: { ordem: 'EN' | 'NE'; unidade?: 'AUTO' | 'M' | 'MM' | 'UTM'; manterCoordenadas?: boolean },
): LoteDigitado & { naoLidas: string[]; unidadeLida: string | null } {
  const naoLidas: string[] = [];
  const linhas: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim();
    if (l === '' || l.startsWith('#')) continue;
    const campos = (/[;\t]/.test(l) ? l.split(/[;\t]/) : l.split(/\s+/)).map((c) => c.trim()).filter(Boolean);
    const nums = campos.map((c) => numeroFlexivel(c));
    const idx = nums.flatMap((v, i) => (v === null ? [] : [i]));
    let nome = campos.find((_, i) => nums[i] === null) ?? '';
    let a: number;
    let b: number;
    if (idx.length < 2) {
      naoLidas.push(l);
      continue;
    } else if (idx.length === 2) {
      [a, b] = [nums[idx[0]]!, nums[idx[1]]!];
    } else if (idx.length === 3 && !nome && Number.isInteger(nums[idx[0]]!) && Math.abs(nums[idx[0]]!) < 10000) {
      // "1 7512345,12 654321,45": o primeiro é o número do ponto.
      nome = campos[idx[0]];
      [a, b] = [nums[idx[1]]!, nums[idx[2]]!];
    } else if (idx.length >= 4 && !nome) {
      nome = campos[idx[0]];
      [a, b] = [nums[idx[1]]!, nums[idx[2]]!];
    } else {
      [a, b] = [nums[idx[0]]!, nums[idx[1]]!];
    }
    linhas.push(`${nome.replace(/;/g, '')};${a};${b};0`);
  }
  const vazio = { ...montar([], [], []), naoLidas, unidadeLida: null };
  if (linhas.length < 3) return { ...vazio, problema: naoLidas.length ? `Pelo menos três vértices com duas coordenadas — ${naoLidas.length} linha(s) não lida(s).` : 'Digite pelo menos três vértices, um por linha.' };
  let pontos: Point[];
  let nomes: (string | null)[];
  let unidadeLida: string;
  try {
    const r = importarPontos(linhas.join('\n'), 'TEXTO', { anel: null, georreferencia: ctx.georreferencia }, { ordem: opcoes.ordem === 'EN' ? 'ENZ' : 'NEZ', unidade: opcoes.unidade ?? 'AUTO', ancoragem: 'DIRETO' });
    pontos = r.pontos.map((p) => ({ x: p.x, y: p.y }));
    nomes = r.pontos.map((p) => p.nome?.trim() || null);
    unidadeLida = r.detectado.unidade;
  } catch (e) {
    return { ...vazio, problema: e instanceof Error ? e.message : String(e) };
  }
  if (pontos.length < 3) return { ...vazio, problema: 'Pelo menos três vértices.' };
  if (unidadeLida !== 'UTM' && !opcoes.manterCoordenadas) {
    const o = pontos[0];
    pontos = pontos.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  }
  // Repetir o 1º vértice no fim é comum (quem copia de planilha fecha o anel).
  const ult = pontos[pontos.length - 1];
  if (pontos.length > 3 && Math.hypot(ult.x - pontos[0].x, ult.y - pontos[0].y) < 1) {
    pontos = pontos.slice(0, -1);
    nomes = nomes.slice(0, -1);
  }
  const lote = montar([...pontos, { ...pontos[0] }], pontos.map(() => ({})), nomes);
  return { ...lote, naoLidas, unidadeLida };
}

// ── Fechamento ───────────────────────────────────────────────────────────

/** Até aqui o erro se distribui sozinho (e é dito): o maior entre 10 mm e 1:5000 do perímetro. */
export function toleranciaDeFechamentoMm(perimetroMm: number): number {
  return Math.max(10, perimetroMm / 5000);
}

const mm = (v: number) => (v / 1000).toFixed(2).replace('.', ',');

/**
 * Fecha o contorno digitado. Até a tolerância, distribui o erro (Bowditch) e
 * diz; acima, exige a `decisao`.
 */
export function fecharLote(lote: LoteDigitado, decisao?: DecisaoDeFechamento | null): LoteFechado {
  const base: LoteFechado = {
    anel: [],
    lados: lote.lados,
    vertices: lote.vertices,
    areaMm2: 0,
    perimetroMm: lote.perimetroMm,
    erroDeFechamentoMm: lote.erroDeFechamentoMm,
    compensacao: 'NENHUMA',
    problema: lote.problema,
    descricao: '',
  };
  if (lote.problema || lote.caminho.length < 4) return { ...base, problema: lote.problema ?? 'O lote precisa de pelo menos três lados.' };

  const n = lote.lados.length;
  const c = lote.caminho;
  const erro = lote.erroDeFechamentoMm;
  const tolerancia = toleranciaDeFechamentoMm(lote.perimetroMm);
  let anel: Point[];
  let lados = lote.lados;
  let vertices = lote.vertices;
  let compensacao: LoteFechado['compensacao'] = 'NENHUMA';
  let descricao = 'Fechou.';

  const escolha: DecisaoDeFechamento | null = erro < 1 ? null : erro <= tolerancia ? 'DISTRIBUIR' : (decisao ?? null);
  if (erro >= 1 && escolha === null) {
    return { ...base, problema: `Não fecha: sobram ${mm(erro)} m (tolerância ${mm(tolerancia)} m). Confira as medidas ou escolha como fechar.` };
  }
  if (escolha === 'DIVISA_DE_AJUSTE') {
    anel = c.slice(0, n + 1);
    lados = [...lote.lados, { papel: null, medidaMm: null, confrontante: null, ajuste: true }];
    vertices = [...lote.vertices, null];
    compensacao = 'DIVISA_DE_AJUSTE';
    descricao = `Fechado com uma divisa de ajuste de ${mm(erro)} m, que não está na escritura.`;
  } else if (escolha === 'DISTRIBUIR') {
    // Bowditch: cada vértice corrige na proporção do caminho andado até ele.
    const dx = c[n].x - c[0].x;
    const dy = c[n].y - c[0].y;
    const total = lote.perimetroMm || 1;
    let andado = 0;
    anel = [];
    for (let i = 0; i < n; i += 1) {
      if (i > 0) andado += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
      anel.push({ x: c[i].x - (dx * andado) / total, y: c[i].y - (dy * andado) / total });
    }
    compensacao = 'DISTRIBUIDA';
    descricao = `Erro de fechamento de ${mm(erro)} m distribuído pelos lados, na proporção de cada um.`;
  } else {
    anel = c.slice(0, n);
  }
  anel = anel.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

  let problema: string | null = null;
  for (let i = 0; i < anel.length; i += 1) {
    const q = anel[(i + 1) % anel.length];
    if (anel[i].x === q.x && anel[i].y === q.y) {
      problema = `O lado ${i + 1} ficou com comprimento zero.`;
      break;
    }
  }
  const area = Math.abs(signedArea(anel));
  // O cruzamento ANTES da área: num laço em oito as duas metades se anulam e
  // a área sai zero — "lados alinhados" seria o diagnóstico errado.
  if (!problema && !isSimplePolygon(anel)) problema = 'O contorno se cruza: confira os ângulos (internos, no sentido horário) ou a ordem dos vértices.';
  if (!problema && area < 1e6) problema = 'O contorno não tem área — os lados estão alinhados.';
  let perimetro = 0;
  for (let i = 0; i < anel.length; i += 1) perimetro += Math.hypot(anel[(i + 1) % anel.length].x - anel[i].x, anel[(i + 1) % anel.length].y - anel[i].y);
  return { ...base, anel, lados, vertices, areaMm2: Math.round(area), perimetroMm: Math.round(perimetro), compensacao, problema, descricao };
}

// ── Para o kernel ────────────────────────────────────────────────────────

/**
 * A lista de comandos que lança o lote — UMA lista, para `editor.runBatch`
 * (um Ctrl+Z desfaz tudo). Simula com `applyBatch` para saber os ids das
 * divisas novas (são determinísticos: o editor, partindo do mesmo modelo, cria
 * os mesmos) e grava medida da escritura, confrontante e nome dos vértices.
 *
 * Com `substituir`, apaga antes as divisas do lote atual e os nomes de vértice
 * dele. Sem `substituir` e com lote existente, recusa: dois contornos de
 * terreno no mesmo estudo não fecham nada.
 */
export function comandosDoLote(
  model: BlueprintModel,
  levelId: string,
  lote: LoteFechado,
  opcoes: { substituir?: boolean; medidasDaEscritura?: boolean } = {},
): Command[] {
  if (lote.problema) throw new Error(lote.problema);
  const atuais = (model.boundaries ?? []).filter((b) => b.kind === 'TERRENO');
  if (atuais.length > 0 && !opcoes.substituir) throw new Error('O estudo já tem divisas de lote: marque "Substituir o lote atual" para trocar.');
  const apagar: Command[] = opcoes.substituir
    ? [
        ...atuais.map((b) => ({ type: 'DeleteBoundary' as const, boundaryId: b.id })),
        ...(model.verticesDoTerreno ?? []).map((v) => ({ type: 'RemoverVerticeDoTerreno' as const, ponto: v.ponto })),
      ]
    : [];
  const n = lote.anel.length;
  const criar: Command[] = lote.anel.map((a, i) => ({
    type: 'AddBoundary' as const,
    levelId,
    a,
    b: lote.anel[(i + 1) % n],
    kind: 'TERRENO' as const,
    ...(lote.lados[i]?.papel ? { papel: lote.lados[i].papel } : {}),
  }));
  const antes = new Set((model.boundaries ?? []).map((b) => b.id));
  const simulado = applyBatch(model, [...apagar, ...criar]).model;
  const novas = (simulado.boundaries ?? []).filter((b) => !antes.has(b.id) && b.kind === 'TERRENO');
  if (novas.length !== n) throw new Error(`O desenho criou ${novas.length} divisas para ${n} lados.`);
  const escritura: Command[] = [];
  lote.lados.forEach((l, i) => {
    const medida = opcoes.medidasDaEscritura && l.medidaMm ? Math.round(l.medidaMm) : null;
    const confrontante = l.confrontante?.trim() || null;
    if (medida !== null || confrontante !== null) escritura.push({ type: 'SetBoundaryEscritura', boundaryId: novas[i].id, medidaMm: medida, confrontante });
  });
  const nomes: Command[] = lote.vertices.flatMap((nome, i) => (nome ? [{ type: 'SetVerticeDoTerreno' as const, ponto: lote.anel[i], nome }] : []));
  const comandos = [...apagar, ...criar, ...escritura, ...nomes];
  // A lista inteira tem de passar — melhor recusar aqui do que no meio do lote.
  applyBatch(model, comandos);
  return comandos;
}
