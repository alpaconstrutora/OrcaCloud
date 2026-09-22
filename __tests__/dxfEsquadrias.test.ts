/**
 * ESQUADRIAS NA IMPORTAÇÃO DXF (21/09/2026, P2.33): porta pelo arco do giro da
 * folha, janela pelo símbolo (traços paralelos dentro do vão), vão livre pelo
 * buraco sem símbolo — e o buraco grande demais fica como duas paredes.
 *
 * Os DXF são gerados aqui, em milímetro, do jeito que o CAD desenha: faces da
 * parede na camada PAREDE que PARAM no batente, arco na camada PORTAS, linhas
 * do vidro na camada JANELAS. As alturas vêm das hipóteses (o DXF é planta).
 */
import { describe, expect, it } from 'vitest';
import { lerDxf } from '../utils/dxfLeitor';
import { aberturasDoDxf, HIPOTESES_ESQUADRIAS_PADRAO, paredesDoDxf, tirarDuplicadas, type ParedeComAberturas } from '../utils/dxfParaKernel';
import { applyBatch, applyCommand, emptyModel, novoUid, type Command } from '../utils/blueprintKernel';

type Par = [string, string];
const LINE = (x1: number, y1: number, x2: number, y2: number, camada = 'PAREDE'): Par[] => [['0', 'LINE'], ['8', camada], ['10', String(x1)], ['20', String(y1)], ['11', String(x2)], ['21', String(y2)]];
const ARC = (cx: number, cy: number, r: number, a0: number, a1: number, camada = 'PORTAS'): Par[] => [['0', 'ARC'], ['8', camada], ['10', String(cx)], ['20', String(cy)], ['40', String(r)], ['50', String(a0)], ['51', String(a1)]];
/** Parede horizontal de faces y0/y0+esp entre x0 e x1, com as faces interrompidas nos buracos [xa, xb] (e o batente fechado). */
function paredeH(y0: number, esp: number, x0: number, x1: number, buracos: [number, number][]): Par[] {
  const cortes = [x0, ...buracos.flat(), x1];
  const pares: Par[] = [];
  for (let i = 0; i + 1 < cortes.length; i += 2) {
    pares.push(...LINE(cortes[i], y0, cortes[i + 1], y0), ...LINE(cortes[i], y0 + esp, cortes[i + 1], y0 + esp));
  }
  for (const [xa, xb] of buracos) pares.push(...LINE(xa, y0, xa, y0 + esp), ...LINE(xb, y0, xb, y0 + esp));
  return pares;
}
function dxfTexto(entidades: Par[], blocos: Par[] = []): string {
  const pares: Par[] = [
    ['0', 'SECTION'], ['2', 'HEADER'], ['9', '$INSUNITS'], ['70', '4'], ['0', 'ENDSEC'],
    ...(blocos.length ? [['0', 'SECTION'] as Par, ['2', 'BLOCKS'] as Par, ...blocos, ['0', 'ENDSEC'] as Par] : []),
    ['0', 'SECTION'], ['2', 'ENTITIES'], ...entidades, ['0', 'ENDSEC'], ['0', 'EOF'],
  ];
  return pares.flatMap(([c, v]) => [c, v]).join('\n');
}

function reconhecer(texto: string, hip = HIPOTESES_ESQUADRIAS_PADRAO, alturaMm = 2800) {
  const leitura = lerDxf(texto);
  const paredes = tirarDuplicadas(paredesDoDxf(leitura.segmentos.filter((s) => s.camada === 'PAREDE'), 1)).paredes;
  return aberturasDoDxf(paredes, leitura, 1, 'PAREDE', alturaMm, hip);
}

/** A parede cujo eixo passa por y (as faces estão em y−esp/2 e y+esp/2). */
const naCota = (paredes: ParedeComAberturas[], y: number) => paredes.filter((p) => Math.abs(p.a.y - y) <= 1 && Math.abs(p.b.y - y) <= 1);
/** O offset esperado de um trecho [xa, xb] numa parede que pode ter sido lida em qualquer sentido. */
const offsetDe = (p: ParedeComAberturas, xa: number, xb: number) => (p.b.x > p.a.x ? xa - p.a.x : p.a.x - xb);

/**
 * O ARCO QUE O APP DESENHA, pela fórmula do canvas (`BlueprintCanvas`) e do PDF
 * (`blueprintExport`): pivô na ponta da dobradiça, deslocado meia espessura
 * para o lado que abre; folha na normal `n = (−uy, ux)` vezes o lado; raio =
 * largura do vão. Devolve o ponto médio do quarto de volta — é ele que diz,
 * sem ambiguidade, para que lado a porta abre no desenho.
 */
function meioDoArcoDesenhado(p: ParedeComAberturas, ab: ParedeComAberturas['aberturas'][number]) {
  const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1;
  const ux = (p.b.x - p.a.x) / L;
  const uy = (p.b.y - p.a.y) / L;
  const nx = -uy;
  const ny = ux;
  const ini = { x: p.a.x + ux * ab.offsetMm, y: p.a.y + uy * ab.offsetMm };
  const fim = { x: p.a.x + ux * (ab.offsetMm + ab.widthMm), y: p.a.y + uy * (ab.offsetMm + ab.widthMm) };
  const lado = ab.swingReversed ? -1 : 1;
  const meia = p.espessuraMm / 2;
  const base = ab.hingeAtStart ? ini : fim;
  const piv = { x: base.x + nx * meia * lado, y: base.y + ny * meia * lado };
  const eixo = { x: ab.hingeAtStart ? ux : -ux, y: ab.hingeAtStart ? uy : -uy };
  const folha = { x: nx * lado, y: ny * lado };
  const c45 = Math.SQRT1_2;
  return { x: piv.x + (eixo.x + folha.x) * c45 * ab.widthMm, y: piv.y + (eixo.y + folha.y) * c45 * ab.widthMm };
}

/** O ponto médio do arco do ARQUIVO, em mm — a verdade contra a qual o desenho é conferido. */
function meioDoArcoDoArquivo(cx: number, cy: number, r: number, a0: number, a1: number) {
  let v = (a1 - a0) % 360;
  if (v < 0) v += 360;
  const m = ((a0 + v / 2) * Math.PI) / 180;
  return { x: cx + r * Math.cos(m), y: cy + r * Math.sin(m) };
}

describe('esquadrias no DXF · o LADO da porta (P2.37)', () => {
  /**
   * As quatro combinações numa parede horizontal e duas numa vertical: dobradiça
   * em cada ponta × abrindo para cada lado. O arco do arquivo tem o centro na
   * dobradiça, na face do lado em que a porta abre — como o CAD desenha.
   */
  const VAOS: [number, number, 'E' | 'D', 1 | -1][] = [
    [2000, 2900, 'E', 1],
    [6000, 6900, 'D', 1],
    [10000, 10900, 'E', -1],
    [14000, 14900, 'D', -1],
  ];
  function dxfDasCombinacoes(): string {
    const pares: Par[] = [...paredeH(0, 150, 0, 20000, VAOS.map(([a, b]) => [a, b] as [number, number]))];
    for (const [x0, x1, dob, lado] of VAOS) {
      const cx = dob === 'E' ? x0 : x1;
      const cy = lado === 1 ? 150 : 0;
      const fechada = dob === 'E' ? 0 : 180;
      const aberta = lado === 1 ? 90 : 270;
      const d = (((aberta - fechada) % 360) + 360) % 360;
      pares.push(...(d === 90 ? ARC(cx, cy, 900, fechada, aberta) : ARC(cx, cy, 900, aberta, fechada)));
    }
    return dxfTexto(pares);
  }

  it('as quatro combinações de dobradiça × lado saem com o arco EM CIMA do arco do arquivo', () => {
    const { paredes, resumo } = reconhecer(dxfDasCombinacoes());
    expect(resumo).toMatchObject({ portas: 4, vaos: 0 });
    const parede = naCota(paredes, 75)[0];
    expect(parede.aberturas).toHaveLength(4);
    for (const [x0, x1, dob, lado] of VAOS) {
      const ab = parede.aberturas.find((o) => Math.abs(Math.min(offsetDe(parede, x0, x1), 1e9) - o.offsetMm) < 2)!;
      expect(ab, `vão ${x0}–${x1}`).toBeTruthy();
      const cx = dob === 'E' ? x0 : x1;
      const cy = lado === 1 ? 150 : 0;
      const fechada = dob === 'E' ? 0 : 180;
      const aberta = lado === 1 ? 90 : 270;
      const d = (((aberta - fechada) % 360) + 360) % 360;
      const esperado = d === 90 ? meioDoArcoDoArquivo(cx, cy, 900, fechada, aberta) : meioDoArcoDoArquivo(cx, cy, 900, aberta, fechada);
      const desenhado = meioDoArcoDesenhado(parede, ab);
      expect(Math.hypot(desenhado.x - esperado.x, desenhado.y - esperado.y), `vão ${x0}–${x1} (${dob}${lado === 1 ? '+' : '−'})`).toBeLessThan(100);
    }
  });

  it('⚠️ VIRAR A PAREDE NA EMENDA VIRA A PORTA: a peça que a emenda precisa inverter mantém o lado no mundo', () => {
    // Três trechos com dois vãos. O terceiro trecho é desenhado ao CONTRÁRIO (de x maior para menor):
    // a emenda tem de virá-lo, e a porta que ele já carrega tem de continuar abrindo para o mesmo lado.
    // Antes da P2.37 só o `offsetMm` era espelhado, e o arco saía do lado errado.
    const t = dxfTexto([
      ...paredeH(0, 150, 0, 20000, [[6000, 6900], [14000, 14900]]),
      ...ARC(6000, 150, 900, 0, 90),
      ...ARC(14900, 150, 900, 90, 180),
    ]);
    const { paredes } = reconhecer(t);
    const parede = naCota(paredes, 75)[0];
    expect(parede.aberturas).toHaveLength(2);
    for (const [cx, a0, a1] of [[6000, 0, 90], [14900, 90, 180]] as const) {
      const esperado = meioDoArcoDoArquivo(cx, 150, 900, a0, a1);
      const perto = parede.aberturas.map((ab) => meioDoArcoDesenhado(parede, ab)).map((q) => Math.hypot(q.x - esperado.x, q.y - esperado.y));
      expect(Math.min(...perto), `arco em ${cx}`).toBeLessThan(100);
    }
  });

  it('porta por NOME DE BLOCO usa o arco de dentro do bloco para a dobradiça e o lado', () => {
    const blocos: Par[] = [
      ['0', 'BLOCK'], ['8', '0'], ['2', 'PORTA-80'], ['10', '0'], ['20', '0'],
      ...LINE(0, 0, 0, 800, '0'),
      ['0', 'ARC'], ['8', '0'], ['10', '0'], ['20', '0'], ['40', '800'], ['50', '90'], ['51', '180'],
      ['0', 'ENDBLK'],
    ];
    // Bloco inserido em (2800, 150): a dobradiça é a ponta DIREITA do vão e a folha abre para +y.
    const t = dxfTexto([
      ...paredeH(0, 150, 0, 6000, [[2000, 2800]]),
      ['0', 'INSERT'], ['8', 'ESQUADRIAS'], ['2', 'PORTA-80'], ['10', '2800'], ['20', '150'],
    ], blocos);
    const { paredes, resumo } = reconhecer(t);
    expect(resumo).toMatchObject({ portas: 1 });
    const parede = paredes[0];
    const desenhado = meioDoArcoDesenhado(parede, parede.aberturas[0]);
    const esperado = meioDoArcoDoArquivo(2800, 150, 800, 90, 180);
    expect(Math.hypot(desenhado.x - esperado.x, desenhado.y - esperado.y)).toBeLessThan(100);
  });
});

describe('esquadrias no DXF · porta, janela e vão', () => {
  // Parede 1 (y 0..150): porta de 900 em [2000, 2900] com arco de dobradiça em x=2000 abrindo para +y;
  // janela de 1200 em [4000, 5200] com duas linhas de vidro na camada JANELAS.
  // Parede 2 (y 3000..3150): buraco de 1000 sem nada em [1000, 2000] (vão livre) e buraco de 3500 em [4000, 7500] (fica separado).
  const texto = dxfTexto([
    ...paredeH(0, 150, 0, 6000, [[2000, 2900], [4000, 5200]]),
    ...ARC(2000, 0, 900, 0, 90),
    ...LINE(4000, 50, 5200, 50, 'JANELAS'),
    ...LINE(4000, 100, 5200, 100, 'JANELAS'),
    ...paredeH(3000, 150, 0, 8000, [[1000, 2000], [4000, 7500]]),
    // Um arco de porta perdido no paisagismo, longe de qualquer parede.
    ...ARC(20000, 20000, 800, 0, 90, 'ARQ-LAYOUT'),
  ]);

  it('a porta vem do arco (largura = buraco, dobradiça e lado pelo arco), a janela dos traços paralelos, o vão do buraco vazio; buraco de 3,5 m fica como duas paredes', () => {
    const { paredes, resumo } = reconhecer(texto);
    expect(resumo).toEqual({ portas: 1, janelas: 1, vaos: 1, arcosSemParede: 1, tocosDeBatente: 0, encostadas: 0, pontasSoltas: 6, cantosFechados: 0 });
    expect(paredes).toHaveLength(3);

    const [p1] = naCota(paredes, 75);
    expect(p1.comprimentoMm).toBe(6000);
    expect(p1.aberturas.map((ab) => ab.kind)).toEqual(p1.b.x > p1.a.x ? ['door', 'window'] : ['window', 'door']);
    const porta = p1.aberturas.find((ab) => ab.kind === 'door')!;
    expect(porta.widthMm).toBe(900);
    expect(porta.offsetMm).toBe(offsetDe(p1, 2000, 2900));
    expect(porta.heightMm).toBe(2100);
    expect(porta.sillMm).toBe(0);
    // A dobradiça está em x=2000: é o começo do vão se a parede foi lida de x=0 para x=6000.
    expect(porta.hingeAtStart).toBe(p1.b.x > p1.a.x);
    // Abre para +y: é a normal positiva do kernel (n = (−uy, ux)) quando a parede vai para +x.
    expect(porta.swingReversed).toBe(!(p1.b.x > p1.a.x));
    const janela = p1.aberturas.find((ab) => ab.kind === 'window')!;
    expect(janela).toMatchObject({ widthMm: 1200, offsetMm: offsetDe(p1, 4000, 5200), sillMm: 1000, heightMm: 1200 });

    const p2 = naCota(paredes, 3075).sort((a, b) => b.comprimentoMm - a.comprimentoMm);
    expect(p2.map((p) => p.comprimentoMm)).toEqual([4000, 500]);
    expect(p2[0].aberturas).toEqual([{ kind: 'passage', offsetMm: offsetDe(p2[0], 1000, 2000), widthMm: 1000, heightMm: 2800, sillMm: 0 }]);
    expect(p2[1].aberturas).toEqual([]);
  });

  it('com o reconhecimento de símbolos desligado, só o vão livre pelo buraco: a porta e a janela viram passagem', () => {
    const { paredes, resumo } = reconhecer(texto, { ...HIPOTESES_ESQUADRIAS_PADRAO, reconhecerSimbolos: false });
    expect(resumo).toEqual({ portas: 0, janelas: 0, vaos: 3, arcosSemParede: 0, tocosDeBatente: 0, encostadas: 0, pontasSoltas: 6, cantosFechados: 0 });
    const [p1] = naCota(paredes, 75);
    expect(p1.aberturas.map((ab) => ab.kind)).toEqual(['passage', 'passage']);
  });

  it('as hipóteses mandam nas alturas, e nada passa do pé-direito', () => {
    const { paredes } = reconhecer(texto, { ...HIPOTESES_ESQUADRIAS_PADRAO, portaAlturaMm: 2400, janelaPeitorilMm: 1100, janelaAlturaMm: 1000 }, 2600);
    const [p1] = naCota(paredes, 75);
    expect(p1.aberturas.find((ab) => ab.kind === 'door')).toMatchObject({ heightMm: 2400 });
    expect(p1.aberturas.find((ab) => ab.kind === 'window')).toMatchObject({ sillMm: 1100, heightMm: 1000 });
    // Pé-direito baixo (2000): porta de 2100 vira 2000, janela de 1100+1200 encolhe até caber.
    const baixa = reconhecer(texto, HIPOTESES_ESQUADRIAS_PADRAO, 2000).paredes;
    expect(naCota(baixa, 75)[0].aberturas.find((ab) => ab.kind === 'door')).toMatchObject({ heightMm: 2000 });
    expect(naCota(baixa, 75)[0].aberturas.find((ab) => ab.kind === 'window')).toMatchObject({ sillMm: 1000, heightMm: 1000 });
  });

  it('vão livre até o teto de hipótese: com 800 mm o buraco de 1 m fica como duas paredes; com 0 não emenda nada', () => {
    const { paredes } = reconhecer(texto, { ...HIPOTESES_ESQUADRIAS_PADRAO, vaoLivreMaxMm: 800 });
    expect(naCota(paredes, 3075)).toHaveLength(3);
    const nada = reconhecer(texto, { ...HIPOTESES_ESQUADRIAS_PADRAO, vaoLivreMaxMm: 0 });
    // A porta e a janela continuam (o símbolo manda); só o buraco vazio deixa de emendar.
    expect(nada.resumo).toMatchObject({ portas: 1, janelas: 1, vaos: 0 });
    expect(naCota(nada.paredes, 3075)).toHaveLength(3);
  });

  it('o arco abrindo para o outro lado inverte o `swingReversed`; dobradiça na outra ponta inverte o `hingeAtStart`', () => {
    // Mesma porta, arco com centro em x=2900 (dobradiça na outra ponta), abrindo para −y (de 180° a 270°).
    const t = dxfTexto([...paredeH(0, 150, 0, 6000, [[2000, 2900]]), ...ARC(2900, 150, 900, 180, 270)]);
    const { paredes } = reconhecer(t);
    const porta = paredes[0].aberturas[0];
    const paraX = paredes[0].b.x > paredes[0].a.x;
    expect(porta.kind).toBe('door');
    expect(porta.hingeAtStart).toBe(!paraX);
    expect(porta.swingReversed).toBe(paraX);
  });

  it('arco em cima de parede CONTÍNUA (o desenhista não abriu o vão) ainda vira porta, com a largura do raio', () => {
    const t = dxfTexto([...paredeH(0, 150, 0, 4000, []), ...ARC(1000, 0, 800, 0, 90)]);
    const { paredes, resumo } = reconhecer(t);
    expect(resumo).toMatchObject({ portas: 1, arcosSemParede: 0 });
    expect(paredes).toHaveLength(1);
    const p = paredes[0];
    expect(p.aberturas).toHaveLength(1);
    expect(p.aberturas[0]).toMatchObject({ kind: 'door', widthMm: 800, offsetMm: offsetDe(p, 1000, 1800), hingeAtStart: p.b.x > p.a.x });
  });

  it('duas portas lado a lado com um pilarete entre elas: a emenda NÃO pula por cima do pilarete', () => {
    // Três peças colineares ([0,1000], [1800,2150], [2950,6000]) e dois arcos. Sem a guarda, o par das
    // pontas emendaria um "vão" de 1,95 m por cima do pilarete — foi o que o projeto real da empresa mostrou.
    const t = dxfTexto([
      ...paredeH(0, 150, 0, 6000, [[1000, 1800], [2150, 2950]]),
      ...ARC(1000, 0, 800, 0, 90),
      ...ARC(2950, 0, 800, 90, 180),
    ]);
    const { paredes, resumo } = reconhecer(t);
    expect(resumo).toMatchObject({ portas: 2, vaos: 0, tocosDeBatente: 1 });
    expect(paredes).toHaveLength(1);
    expect(paredes[0].comprimentoMm).toBe(6000);
    expect(paredes[0].aberturas.map((ab) => [ab.kind, ab.widthMm])).toEqual([['door', 800], ['door', 800]]);
  });

  it('porta de DUAS folhas: um arco em cada ponta do vão, cada raio metade da largura → duas portas de meia largura, dobradiças nas pontas', () => {
    const t = dxfTexto([...paredeH(0, 150, 0, 6000, [[2000, 3600]]), ...ARC(2000, 0, 800, 0, 90), ...ARC(3600, 0, 800, 90, 180)]);
    const { paredes, resumo } = reconhecer(t);
    expect(resumo).toMatchObject({ portas: 1, vaos: 0 });
    const p = paredes[0];
    expect(p.aberturas).toHaveLength(2);
    expect(p.aberturas.map((ab) => [ab.kind, ab.widthMm, ab.offsetMm, ab.hingeAtStart])).toEqual([
      ['door', 800, offsetDe(p, 2000, 2800), true],
      ['door', 800, offsetDe(p, 2800, 3600), false],
    ]);
    // As duas abrem para o mesmo lado (+y).
    expect(p.aberturas.map((ab) => ab.swingReversed)).toEqual([!(p.b.x > p.a.x), !(p.b.x > p.a.x)]);
  });

  // ── P2.34: o que fecha ambiente ────────────────────────────────────────────
  it('FRESTA (P2.34): o cruzamento em T deixa a parede que passa em dois trechos separados pela espessura da que chega — viram UMA parede, sem abertura, e a que chega encosta no eixo', () => {
    // Parede horizontal y=0..150 de 0 a 6000 com as faces interrompidas em [3000−75, 3000+75] (a parede vertical que chega por baixo);
    // parede vertical x=2925..3075 de y=−3000 até a face inferior (y=0).
    const t = dxfTexto([
      ...paredeH(0, 150, 0, 6000, [[2925, 3075]]),
      ...LINE(2925, 0, 2925, -3000), ...LINE(3075, 0, 3075, -3000),
    ]);
    const { paredes, resumo } = reconhecer(t);
    expect(paredes).toHaveLength(2);
    const h = naCota(paredes, 75)[0];
    expect(h.comprimentoMm).toBe(6000);
    expect(h.aberturas).toEqual([]);
    // A vertical foi da face (y=0) ao eixo (y=75).
    const v = paredes.find((p) => p !== h)!;
    expect(Math.max(v.a.y, v.b.y)).toBe(75);
    expect(resumo).toMatchObject({ encostadas: 1, vaos: 0 });
  });

  it('SOBREPOSIÇÃO pequena (P2.34): dois trechos colineares que avançam um sobre o outro alguns centímetros viram um só; sobreposição de meia peça é duplicata e fica', () => {
    // Duas paredes horizontais no mesmo eixo, a segunda começando 100 mm ANTES do fim da primeira.
    const t = dxfTexto([...paredeH(0, 150, 0, 3000, []), ...paredeH(0, 150, 2900, 6000, [])]);
    const { paredes } = reconhecer(t);
    // O pareamento das faces sobrepostas pode devolver peças de vários jeitos; o que importa é UMA parede de 6 m no fim.
    const h = naCota(paredes, 75);
    expect(h).toHaveLength(1);
    expect(h[0].comprimentoMm).toBe(6000);
  });

  it('CANTO em L (P2.34): uma peça avança e a outra para curta — as duas pontas soltas vão ao cruzamento dos eixos', () => {
    // Horizontal de 0 a 3075 (avança 75 além do eixo x=3000 da vertical); vertical de y=−3000 até y=−100 (para 175 antes do eixo y=75).
    const t = dxfTexto([
      ...LINE(0, 0, 3075, 0), ...LINE(0, 150, 3075, 150),
      ...LINE(2925, -3000, 2925, -100), ...LINE(3075, -3000, 3075, -100),
    ]);
    const { paredes, resumo } = reconhecer(t);
    expect(paredes).toHaveLength(2);
    const h = naCota(paredes, 75)[0];
    const v = paredes.find((p) => p !== h)!;
    const cantoH = h.a.x > h.b.x ? h.a : h.b;
    const cantoV = v.a.y > v.b.y ? v.a : v.b;
    expect(cantoH).toEqual({ x: 3000, y: 75 });
    expect(cantoV).toEqual({ x: 3000, y: 75 });
    expect(resumo.cantosFechados + resumo.encostadas).toBeGreaterThanOrEqual(1);
  });

  it('porta no CANTO: a folha encosta numa parede perpendicular e só há trecho colinear de um lado — a parede é esticada até o canto', () => {
    // Parede horizontal só de x=800 a x=4000 (o vão [0, 800] está entre o canto e ela); arco com dobradiça no canto (0,0).
    const t = dxfTexto([...paredeH(0, 150, 800, 4000, []), ...LINE(0, 0, 0, -3000), ...LINE(-150, 0, -150, -3000), ...ARC(0, 0, 800, 0, 90)]);
    const { paredes, resumo } = reconhecer(t);
    expect(resumo).toMatchObject({ portas: 1, arcosSemParede: 0 });
    const p = paredes.find((q) => Math.abs(q.a.y - 75) <= 1)!;
    // Esticada até o canto pela porta (x=0) e, depois, até o EIXO da perpendicular (x=−75) pelo fecho de canto da P2.34.
    expect(p.comprimentoMm).toBe(4075);
    expect(Math.min(p.a.x, p.b.x)).toBe(-75);
    expect(p.aberturas).toHaveLength(1);
    expect(p.aberturas[0]).toMatchObject({ kind: 'door', widthMm: 800, offsetMm: offsetDe(p, 0, 800) });
  });

  it('bloco com nome de porta no buraco vale como porta mesmo sem arco; bloco de janela, como janela', () => {
    const blocos: Par[] = [
      ['0', 'BLOCK'], ['8', '0'], ['2', 'PORTA-80'], ['10', '0'], ['20', '0'],
      ...LINE(0, 0, 0, 800, '0'),
      ['0', 'ENDBLK'],
      ['0', 'BLOCK'], ['8', '0'], ['2', 'JAN-120'], ['10', '0'], ['20', '0'],
      ...LINE(0, 75, 1200, 75, '0'),
      ['0', 'ENDBLK'],
    ];
    const t = dxfTexto([
      ...paredeH(0, 150, 0, 6000, [[1500, 2300], [4000, 5200]]),
      ['0', 'INSERT'], ['8', 'ESQUADRIAS'], ['2', 'PORTA-80'], ['10', '1500'], ['20', '0'],
      ['0', 'INSERT'], ['8', 'ESQUADRIAS'], ['2', 'JAN-120'], ['10', '4000'], ['20', '0'],
    ], blocos);
    const { paredes, resumo } = reconhecer(t);
    expect(resumo).toMatchObject({ portas: 1, janelas: 1, vaos: 0 });
    expect(paredes).toHaveLength(1);
    const kinds = new Map(paredes[0].aberturas.map((ab) => [ab.widthMm, ab.kind]));
    expect(kinds.get(800)).toBe('door');
    expect(kinds.get(1200)).toBe('window');
  });

  it('o lote AddWall(uid) + AddOpening(wallUid) que o painel monta é aceito pelo kernel', () => {
    const { paredes } = reconhecer(texto);
    const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
    const levelId = base.levels[0].id;
    const lote: Command[] = [];
    for (const p of paredes) {
      const uid = novoUid();
      lote.push({ type: 'AddWall', levelId, a: p.a, b: p.b, thicknessMm: p.espessuraMm, heightMm: 2800, uid });
      for (const ab of p.aberturas) lote.push({ type: 'AddOpening', wallId: '', wallUid: uid, kind: ab.kind, offsetMm: ab.offsetMm, widthMm: ab.widthMm, heightMm: ab.heightMm, sillMm: ab.sillMm, hingeAtStart: ab.hingeAtStart, swingReversed: ab.swingReversed });
    }
    const m = applyBatch(base, lote).model;
    expect(m.walls).toHaveLength(3);
    expect(m.openings.map((o) => o.kind).sort()).toEqual(['door', 'passage', 'window']);
  });
});
