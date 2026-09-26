/**
 * PRANCHA TOPOGRÁFICA (fase A1): a planta do imóvel com MALHA DE COORDENADAS,
 * vértices nomeados, cotas de lado e a tabela do roteiro perimétrico.
 *
 * É a folha que acompanha o memorial no registro de imóveis e no INCRA. O que
 * a distingue da planta de arquitetura é a malha: linhas de E e N constantes,
 * a cada passo redondo, rotuladas na margem — é por ela que alguém confere no
 * papel a coordenada de um vértice sem calculadora.
 *
 * ⚠️ A malha só existe com georreferência projetada. Sem ela, a folha sai com
 * os vértices e as cotas de lado e DIZ, no rodapé, que não há malha — desenhar
 * uma malha em milímetros locais com cara de UTM seria mentir com régua.
 */
import type { BlueprintModel, Point } from './blueprintKernel';
import type { Desenhista, Enquadramento, EstiloTraco } from './blueprintExport';
import { enquadrarPontos, paraPapel, type ContextoDoDesenho } from './blueprintPranchaLoteamento';
import { roteiroPerimetrico, type RoteiroPerimetrico } from './blueprintRoteiroPerimetrico';
import { numeroBr } from './blueprintMemorialLote';

const DIVISA: EstiloTraco = { espessuraMm: 0.5, cor: '#0f172a' };
const MALHA: EstiloTraco = { espessuraMm: 0.13, cor: '#94a3b8' };
const VERTICE: EstiloTraco = { espessuraMm: 0.35, cor: '#1d4ed8' };

/**
 * O passo da malha, em METROS, escolhido pela escala: quer-se entre 4 e 10
 * linhas por dimensão. Passos redondos (1, 2, 5 × 10ⁿ), porque rótulo de malha
 * com número quebrado não se lê.
 */
export function passoDaMalhaM(larguraDoDesenhoM: number): number {
  if (larguraDoDesenhoM <= 0) return 10;
  const alvo = larguraDoDesenhoM / 6;
  const expoente = Math.floor(Math.log10(alvo));
  const base = 10 ** expoente;
  for (const f of [1, 2, 5, 10]) {
    if (base * f >= alvo) return base * f;
  }
  return base * 10;
}

/** Cruz pequena no vértice, com o nome ao lado. */
function marcarVertice(d: Desenhista, p: { x: number; y: number }, nome: string, alturaMm: number): void {
  const r = alturaMm * 0.5;
  d.linha(p.x - r, p.y, p.x + r, p.y, VERTICE);
  d.linha(p.x, p.y - r, p.x, p.y + r, VERTICE);
  d.texto(p.x + r * 2.2, p.y - r * 1.2, nome, alturaMm, '#1d4ed8');
}

/**
 * A MALHA DE COORDENADAS sobre a área do desenho.
 *
 * Cada linha vertical é um E constante; cada horizontal, um N constante. O
 * rótulo vai na margem de cima (E) e na da esquerda (N), como nas cartas do
 * IBGE. A conversão modelo→E/N é a do roteiro: local → geográfica → projetada,
 * então a malha fica alinhada ao norte da QUADRÍCULA, que é o que o UTM é.
 */
export function desenharMalhaDeCoordenadas(
  d: Desenhista,
  roteiro: RoteiroPerimetrico,
  ctx: ContextoDoDesenho,
  enq: Enquadramento,
  alturaDoTextoMm = 2,
): { passoM: number; linhas: number } | null {
  if (!roteiro.georreferenciado) return null;
  const comEN = roteiro.vertices.filter((v) => v.este != null && v.norte != null);
  if (comEN.length < 2) return null;

  // A relação mm-de-modelo ↔ metro-projetado, ajustada por mínimos quadrados
  // simples entre dois vértices: para a malha basta a escala e a translação
  // (a rotação do norte já está no `rotacaoNorteDeg` do modelo).
  const a = comEN[0];
  const b = comEN[comEN.length - 1];
  const dModelo = Math.hypot(b.ponto.x - a.ponto.x, b.ponto.y - a.ponto.y);
  const dProj = Math.hypot((b.este as number) - (a.este as number), (b.norte as number) - (a.norte as number)) * 1000;
  if (dModelo === 0 || dProj === 0) return null;
  const k = dProj / dModelo; // mm projetados por mm de modelo (≈ 1)
  const esteDe = (p: Point) => (a.este as number) + ((p.x - a.ponto.x) * k) / 1000;
  const norteDe = (p: Point) => (a.norte as number) + ((p.y - a.ponto.y) * k) / 1000;
  const xDeEste = (e: number) => a.ponto.x + ((e - (a.este as number)) * 1000) / k;
  const yDeNorte = (n: number) => a.ponto.y + ((n - (a.norte as number)) * 1000) / k;

  const larguraM = ((ctx.caixa.maxX - ctx.caixa.minX) * k) / 1000;
  const passo = passoDaMalhaM(larguraM);

  const e0 = Math.ceil(esteDe({ x: ctx.caixa.minX, y: 0 }) / passo) * passo;
  const e1 = esteDe({ x: ctx.caixa.maxX, y: 0 });
  const n0 = Math.ceil(norteDe({ x: 0, y: ctx.caixa.minY }) / passo) * passo;
  const n1 = norteDe({ x: 0, y: ctx.caixa.maxY });

  let linhas = 0;
  const topo = enq.offsetYMm;
  const base = enq.offsetYMm + enq.utilAlturaMm;
  const esq = enq.offsetXMm;
  const dir = enq.offsetXMm + enq.utilLarguraMm;

  for (let e = e0; e <= e1; e += passo) {
    const x = paraPapel({ x: xDeEste(e), y: ctx.caixa.minY }, ctx).x;
    if (x < esq || x > dir) continue;
    d.linha(x, topo, x, base, MALHA);
    d.texto(x, topo - alturaDoTextoMm * 0.4, `E ${numeroBr(e, 0)}`, alturaDoTextoMm * 0.85, '#475569');
    linhas += 1;
  }
  for (let n = n0; n <= n1; n += passo) {
    const y = paraPapel({ x: ctx.caixa.minX, y: yDeNorte(n) }, ctx).y;
    if (y < topo || y > base) continue;
    d.linha(esq, y, dir, y, MALHA);
    d.texto(esq + alturaDoTextoMm * 4, y - alturaDoTextoMm * 0.3, `N ${numeroBr(n, 0)}`, alturaDoTextoMm * 0.85, '#475569');
    linhas += 1;
  }
  return { passoM: passo, linhas };
}

/**
 * A PLANTA TOPOGRÁFICA: divisa em traço grosso, vértices marcados e nomeados,
 * cota e azimute em cada lado, malha quando há georreferência, e o roteiro em
 * tabela no canto.
 */
export function desenharPlantaTopografica(
  d: Desenhista,
  model: BlueprintModel,
  enq: Enquadramento,
  alturaDoTextoMm = 2.2,
): { roteiro: RoteiroPerimetrico; malha: { passoM: number; linhas: number } | null } {
  const roteiro = roteiroPerimetrico(model);
  if (roteiro.vertices.length < 3) {
    d.texto(enq.offsetXMm + enq.utilLarguraMm / 2, enq.offsetYMm + enq.utilAlturaMm / 2, roteiro.avisos[0] ?? 'Sem lote fechado.', alturaDoTextoMm, '#94a3b8');
    return { roteiro, malha: null };
  }
  const anel = roteiro.vertices.map((v) => v.ponto);
  // Reserva ~35% da largura à direita para a tabela do roteiro.
  const areaDoDesenho: Enquadramento = { ...enq, utilLarguraMm: enq.utilLarguraMm * 0.62 };
  const ctx = enquadrarPontos(anel, areaDoDesenho, Math.max(2000, roteiro.perimetroMm * 0.05));
  if (!ctx) return { roteiro, malha: null };

  // 1. A malha, por baixo de tudo.
  const malha = desenharMalhaDeCoordenadas(d, roteiro, ctx, areaDoDesenho, alturaDoTextoMm);

  // 2. A divisa.
  const pts = anel.map((p) => paraPapel(p, ctx));
  for (let i = 0; i < pts.length; i += 1) {
    const q = pts[(i + 1) % pts.length];
    d.linha(pts[i].x, pts[i].y, q.x, q.y, DIVISA);
  }

  // 3. Cota e azimute por lado, no meio da aresta.
  roteiro.lados.forEach((l, i) => {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    d.texto(mx, my - alturaDoTextoMm * 0.5, `${numeroBr(l.distanciaMm / 1000)} m`, alturaDoTextoMm, '#0f172a');
    d.texto(mx, my + alturaDoTextoMm * 0.9, `Az ${l.azimuteTexto}`, alturaDoTextoMm * 0.8, '#475569');
  });

  // 4. Os vértices, por cima.
  roteiro.vertices.forEach((v, i) => marcarVertice(d, pts[i], v.nome, alturaDoTextoMm));

  // 5. A tabela do roteiro, à direita.
  const x0 = enq.offsetXMm + enq.utilLarguraMm * 0.65;
  const linhaAlt = alturaDoTextoMm * 1.7;
  let y = enq.offsetYMm + linhaAlt;
  const col = (i: number) => x0 + i * ((enq.utilLarguraMm * 0.35) / 5);
  d.texto(x0, y, 'ROTEIRO PERIMÉTRICO', alturaDoTextoMm * 1.2, '#0f172a');
  y += linhaAlt * 1.3;
  const cab = roteiro.georreferenciado ? ['Vértice', 'E (m)', 'N (m)', 'Azimute', 'Dist. (m)'] : ['Vértice', 'Azimute (des.)', 'Dist. (m)', 'Confronta', ''];
  cab.forEach((t, i) => d.texto(col(i), y, t, alturaDoTextoMm * 0.85, '#0f172a'));
  y += linhaAlt;
  const limite = enq.offsetYMm + enq.utilAlturaMm - linhaAlt * 3;
  for (let i = 0; i < roteiro.vertices.length; i += 1) {
    if (y > limite) {
      d.texto(x0, y, '… (continua no memorial)', alturaDoTextoMm * 0.8, '#94a3b8');
      break;
    }
    const v = roteiro.vertices[i];
    const l = roteiro.lados[i];
    const celulas = roteiro.georreferenciado
      ? [v.nome, numeroBr(v.este as number, 3), numeroBr(v.norte as number, 3), l.azimuteTexto, numeroBr((l.distanciaNoTerrenoMm ?? l.distanciaMm) / 1000)]
      : [v.nome, l.azimuteTexto, numeroBr(l.distanciaMm / 1000), l.confrontante ?? '—', ''];
    celulas.forEach((t, c) => d.texto(col(c), y, t, alturaDoTextoMm * 0.8, '#334155'));
    y += linhaAlt;
  }
  y += linhaAlt * 0.5;
  d.texto(x0, y, `Área ${numeroBr(roteiro.areaMm2 / 1e6)} m² · Perímetro ${numeroBr(roteiro.perimetroMm / 1000)} m`, alturaDoTextoMm * 0.85, '#0f172a');
  y += linhaAlt;
  if (malha) {
    d.texto(x0, y, `Malha ${roteiro.crs} a cada ${numeroBr(malha.passoM, 0)} m · azimutes verdadeiros`, alturaDoTextoMm * 0.75, '#475569');
  } else {
    d.texto(x0, y, 'Sem malha de coordenadas: imóvel não georreferenciado neste estudo. Azimutes de desenho.', alturaDoTextoMm * 0.75, '#b45309');
  }
  return { roteiro, malha };
}
