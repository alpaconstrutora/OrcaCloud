// utils/dxfLeitor.ts
//
// Ler o DXF ASCII: segmentos de reta e arcos por camada, blocos expandidos, e
// o que foi recusado.
//
// ─── O FORMATO, E A ARMADILHA QUE ELE TEM ────────────────────────────────────
//
// DXF é uma lista de PARES: uma linha com o código de grupo, a linha seguinte
// com o valor. `0` abre uma entidade, `8` é a camada, `10/20` é um ponto.
//
// ⚠️ O ESPAÇO À ESQUERDA. O nosso próprio export escreve o código como `0`; o
// AutoCAD escreve `  0`, alinhado à direita em três colunas. Um leitor que não
// apare os dois lados lê ZERO entidades no arquivo cheio — e não reclama, o que
// é pior. Foi exatamente o que aconteceu com a primeira contagem que fiz.
//
// ⚠️ E A PARIDADE. Quem procura a linha `ENTITIES` para no VALOR do par
// `(2, ENTITIES)`, não no código. Continuar de dois em dois dali desloca todos
// os pares em um, e o resultado é um arquivo cheio de códigos numéricos lidos
// como nomes de camada — sem erro nenhum. Também aconteceu.
//
// ─── RETA VIRA PAREDE; ARCO VIRA SÍMBOLO (P2.33) ─────────────────────────────
//
// Medido na camada `PAREDE` do projeto arquitetônico real da empresa (8,3 MB,
// aprovado na prefeitura): **2.373 LINE**, 22 DIMENSION, 21 ARC, 19 CIRCLE, 15
// LWPOLYLINE e 15 HATCH. A reta é 96% do que descreve parede.
//
// O arco NÃO vira parede — o kernel não tem parede curva, e retificá-la mudaria
// a área do ambiente em silêncio. Mas ele é lido (centro, raio, ângulos): no
// mesmo arquivo há **38 ARC na camada `PORTAS`**, e cada um é o giro de uma
// folha de porta — é assim que o reconhecimento de esquadrias (`dxfParaKernel`)
// sabe onde há porta. Elipse e spline continuam recusadas com nome.
//
// ─── BLOCOS (P2.33) ─────────────────────────────────────────────────────────
//
// `INSERT` é a instância de um bloco definido na seção `BLOCKS`. No arquivo
// real os blocos são cota (`*D…`), vegetação e carro — nada de parede nem
// esquadria —, mas arquivo de terceiro costuma ter porta e janela em bloco. As
// entidades do bloco são expandidas com a transformação do `INSERT` (escala →
// rotação → translação, descontado o ponto-base), até 4 níveis de aninhamento,
// e cada segmento/arco expandido carrega o NOME do bloco: "PORTA-80" é uma
// pista que o reconhecimento usa. Camada `0` dentro do bloco herda a camada do
// `INSERT`, como o CAD faz. Blocos anônimos (`*…`: cota, layout) não são
// expandidos; `INSERT` de bloco que não existe no arquivo vai para as recusas.

/** Um trecho de reta lido do arquivo, na unidade do DXF. */
export interface SegmentoDxf {
  camada: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Nome do bloco de onde veio, quando veio de um `INSERT` expandido. */
  bloco?: string;
}

/** Um arco (ou círculo: 0→360) lido do arquivo, na unidade do DXF; ângulos em graus, anti-horário. */
export interface ArcoDxf {
  camada: string;
  centro: { x: number; y: number };
  raio: number;
  anguloInicial: number;
  anguloFinal: number;
  bloco?: string;
}

/** P2.35: um `INSERT` do desenho (nível de cima), com os ATRIBUTOS que o acompanham — é assim que o Padrão ÒPURA declara largura, altura e peitoril. */
export interface InsercaoDxf {
  camada: string;
  nome: string;
  x: number;
  y: number;
  sx: number;
  sy: number;
  /** Graus, anti-horário. */
  rotacao: number;
  /** `ATTRIB` por TAG (maiúsculas) → valor. */
  atributos: Record<string, string>;
}

/** P2.35: um `TEXT`/`MTEXT` — o nome de ambiente do Padrão ÒPURA. */
export interface TextoDxf {
  camada: string;
  x: number;
  y: number;
  texto: string;
}

/** O que o arquivo tem e este leitor não converte, com a contagem. */
export interface RecusaDxf {
  camada: string;
  tipo: string;
  quantas: number;
}

export interface LeituraDxf {
  segmentos: SegmentoDxf[];
  /** P2.33: os arcos e círculos, para o reconhecimento de portas. */
  arcos: ArcoDxf[];
  /** P2.35: os blocos inseridos no desenho (nível de cima) com seus atributos. */
  insercoes: InsercaoDxf[];
  /** P2.35: os textos do desenho. */
  textos: TextoDxf[];
  recusas: RecusaDxf[];
  /** Quantos segmentos (e arcos) cada camada tem — é o que a tela oferece para escolher. */
  porCamada: { camada: string; segmentos: number; arcos: number; comprimento: number }[];
  /** Quantos `INSERT` foram expandidos (P2.33). */
  blocosExpandidos: number;
  /**
   * O que `$INSUNITS` declara, em milímetros por unidade do arquivo.
   *
   * ⚠️ É uma SUGESTÃO, não a verdade. O campo existe e muitos programas o
   * deixam em branco ou erram; medido nos arquivos reais, os dois declararam 4
   * (milímetro) e batiam — mas confiar cegamente daria uma casa de 12 cm num
   * arquivo em metro. A tela confirma com quem sabe.
   */
  mmPorUnidadeDeclarado: number | null;
}

/** `$INSUNITS` → milímetros por unidade. Só os casos que aparecem em projeto. */
const MM_POR_INSUNITS: Record<number, number> = {
  1: 25.4, // polegada
  2: 304.8, // pé
  4: 1, // milímetro
  5: 10, // centímetro
  6: 1000, // metro
};

/** As formas que descrevem geometria e este leitor não converte. */
const CURVAS_RECUSADAS = new Set(['ELLIPSE', 'SPLINE']);

/** Profundidade máxima de bloco dentro de bloco: acima disto é referência circular ou capricho. */
const PROFUNDIDADE_MAX = 4;

// ─── As entidades cruas, antes da expansão ──────────────────────────────────

type Entidade =
  | { tipo: 'LINE'; camada: string; a: { x: number; y: number }; b: { x: number; y: number } }
  | { tipo: 'ARC'; camada: string; centro: { x: number; y: number }; raio: number; anguloInicial: number; anguloFinal: number }
  | { tipo: 'INSERT'; camada: string; nome: string; x: number; y: number; sx: number; sy: number; rotacao: number; atributos: Record<string, string> }
  | { tipo: 'TEXT'; camada: string; x: number; y: number; texto: string }
  | { tipo: 'RECUSA'; camada: string; nome: string };

interface Bloco {
  nome: string;
  base: { x: number; y: number };
  entidades: Entidade[];
}

/**
 * Lê as entidades a partir do índice `i` (o primeiro CÓDIGO depois do nome da
 * seção) até o `ENDSEC`, emitindo cada uma. Dentro da seção `BLOCKS` também
 * reconhece `BLOCK`/`ENDBLK`, abrindo e fechando a definição corrente.
 */
function lerEntidades(linhas: string[], i: number, emitir: (e: Entidade) => void, blocos?: Map<string, Bloco>): void {
  /** Estado da entidade que está sendo lida. */
  let tipo = '';
  let camada = '';
  let xs: number[] = [];
  let ys: number[] = [];
  /** Ponto FINAL da `LINE` — códigos 11/21, e não 10/20. */
  let x2: number | null = null;
  let y2: number | null = null;
  let fechada = false;
  /** `POLYLINE` acumula pelos `VERTEX` que vêm depois dela. */
  let emPolyline = false;
  let raio = 0;
  let ang0 = 0;
  let ang1 = 360;
  let nome = '';
  let sx = 1;
  let sy = 1;
  let rotacao = 0;
  /** Conteúdo (código 1) de TEXT/MTEXT e valor de ATTRIB; `tag` é o código 2 do ATTRIB. */
  let conteudo = '';
  /** O último INSERT emitido: os `ATTRIB` que vêm logo depois dele (até o `SEQEND`) são os atributos dele. */
  let ultimoInsert: Extract<Entidade, { tipo: 'INSERT' }> | null = null;
  /** O bloco em definição (só na seção `BLOCKS`). */
  let blocoAtual: Bloco | null = null;

  const destino = (e: Entidade) => (blocoAtual ? blocoAtual.entidades.push(e) : emitir(e));

  const empurrar = (ax: number, ay: number, bx: number, by: number) => {
    if (ax === bx && ay === by) return;
    if (![ax, ay, bx, by].every(Number.isFinite)) return;
    destino({ tipo: 'LINE', camada, a: { x: ax, y: ay }, b: { x: bx, y: by } });
  };

  const fecharEntidade = () => {
    // ⚠️ A `LINE` guarda o ponto final em 11/21, NÃO num segundo par 10/20.
    // Colher só 10/20 fazia toda `LINE` ser descartada em silêncio — e num
    // projeto de arquitetura a camada de parede é 96% `LINE`. A primeira versão
    // deste leitor perdeu as 2.373 paredes do arquivo real sem reclamar de
    // nada, entregando as camadas erradas como se fossem tudo o que havia.
    if (tipo === 'LINE' && xs.length >= 1 && ys.length >= 1 && x2 !== null && y2 !== null) {
      empurrar(xs[0], ys[0], x2, y2);
    } else if ((tipo === 'LWPOLYLINE' || tipo === 'SEQEND') && xs.length >= 2) {
      for (let k = 0; k + 1 < xs.length; k++) empurrar(xs[k], ys[k], xs[k + 1], ys[k + 1]);
      if (fechada) empurrar(xs[xs.length - 1], ys[ys.length - 1], xs[0], ys[0]);
    } else if ((tipo === 'ARC' || tipo === 'CIRCLE') && xs.length >= 1 && ys.length >= 1 && raio > 0) {
      destino({ tipo: 'ARC', camada, centro: { x: xs[0], y: ys[0] }, raio, anguloInicial: tipo === 'CIRCLE' ? 0 : ang0, anguloFinal: tipo === 'CIRCLE' ? 360 : ang1 });
    } else if (tipo === 'INSERT' && nome && xs.length >= 1 && ys.length >= 1) {
      const ins: Extract<Entidade, { tipo: 'INSERT' }> = { tipo: 'INSERT', camada, nome, x: xs[0], y: ys[0], sx, sy, rotacao, atributos: {} };
      ultimoInsert = ins;
      destino(ins);
    } else if (tipo === 'ATTRIB' && ultimoInsert && nome) {
      // ⚠️ O ATTRIB vem DEPOIS do INSERT no arquivo; a emissão do INSERT já aconteceu, mas o objeto é o
      // mesmo — quem lê `atributos` depois do `lerEntidades` inteiro vê os valores.
      ultimoInsert.atributos[nome.toUpperCase()] = conteudo;
    } else if ((tipo === 'TEXT' || tipo === 'MTEXT') && xs.length >= 1 && ys.length >= 1 && conteudo.trim()) {
      destino({ tipo: 'TEXT', camada, x: xs[0], y: ys[0], texto: limparMtext(conteudo) });
    } else if (CURVAS_RECUSADAS.has(tipo)) {
      destino({ tipo: 'RECUSA', camada, nome: tipo });
    } else if (tipo === 'BLOCK' && blocos) {
      blocoAtual = { nome, base: { x: xs[0] ?? 0, y: ys[0] ?? 0 }, entidades: [] };
      blocos.set(nome, blocoAtual);
    } else if (tipo === 'ENDBLK') {
      blocoAtual = null;
    }
    xs = [];
    ys = [];
    x2 = null;
    y2 = null;
    fechada = false;
    raio = 0;
    ang0 = 0;
    ang1 = 360;
    nome = '';
    sx = 1;
    sy = 1;
    rotacao = 0;
    conteudo = '';
  };

  for (; i < linhas.length - 1; i += 2) {
    const codigo = linhas[i].trim();
    const valor = linhas[i + 1].trim();

    if (codigo === '0') {
      // `VERTEX` acumula na POLYLINE aberta em vez de fechar nada; `SEQEND`
      // é que encerra o conjunto.
      if (valor === 'VERTEX' && emPolyline) continue;
      if (valor === 'SEQEND' && emPolyline) {
        tipo = 'SEQEND';
        fecharEntidade();
        emPolyline = false;
        tipo = '';
        continue;
      }
      fecharEntidade();
      if (valor === 'SEQEND') ultimoInsert = null;
      if (valor === 'ENDSEC') {
        // Zerar ANTES de sair: o `fecharEntidade()` depois do laço existe para
        // o arquivo que acaba sem `ENDSEC`, e sem isto ele contaria a última
        // entidade DUAS vezes — uma recusa em dobro num relatório que a pessoa
        // vai usar para procurar o que faltou.
        tipo = '';
        return;
      }
      tipo = valor;
      camada = '';
      emPolyline = valor === 'POLYLINE';
      continue;
    }

    if (codigo === '8') {
      camada = valor;
      continue;
    }
    // A camada do VERTEX é a mesma da POLYLINE; a do bloco, a do INSERT.
    if (codigo === '10') xs.push(Number(valor));
    else if (codigo === '20') ys.push(Number(valor));
    else if (codigo === '11' && tipo === 'LINE') x2 = Number(valor);
    else if (codigo === '21' && tipo === 'LINE') y2 = Number(valor);
    else if (codigo === '70' && (tipo === 'LWPOLYLINE' || tipo === 'POLYLINE')) {
      fechada = (Number(valor) & 1) === 1;
    } else if (codigo === '40' && (tipo === 'ARC' || tipo === 'CIRCLE')) raio = Number(valor);
    else if (codigo === '50' && tipo === 'ARC') ang0 = Number(valor);
    else if (codigo === '51' && tipo === 'ARC') ang1 = Number(valor);
    else if (codigo === '2' && (tipo === 'INSERT' || tipo === 'BLOCK' || tipo === 'ATTRIB')) nome = valor;
    else if (codigo === '1' && (tipo === 'TEXT' || tipo === 'MTEXT' || tipo === 'ATTRIB')) conteudo = valor;
    else if (codigo === '3' && tipo === 'MTEXT') conteudo = valor + conteudo; // MTEXT longo: pedaços em 3, o resto em 1
    else if (codigo === '41' && tipo === 'INSERT') sx = Number(valor) || 1;
    else if (codigo === '42' && tipo === 'INSERT') sy = Number(valor) || 1;
    else if (codigo === '50' && tipo === 'INSERT') rotacao = Number(valor) || 0;
  }
  fecharEntidade();
}

/** Índice da primeira linha DEPOIS do valor `(2, <nome>)` de uma seção; −1 se não há. */
function inicioDaSecao(linhas: string[], nome: string): number {
  for (let i = 0; i < linhas.length - 1; i++) {
    if (linhas[i].trim() === '2' && linhas[i + 1].trim() === nome) {
      // ⚠️ A linha achada é o VALOR do par `(2, <nome>)`: os pares começam DEPOIS
      // dela. Sem este `+2` tudo sai deslocado em um, e sem erro.
      return i + 2;
    }
  }
  return -1;
}

/**
 * Lê os segmentos de reta e os arcos de um DXF ASCII.
 *
 * `LINE` vira um segmento; `LWPOLYLINE` e `POLYLINE`+`VERTEX` viram um por
 * lado, fechando o anel quando o desenho diz que ele é fechado; `ARC` e
 * `CIRCLE` viram arcos; `INSERT` expande o bloco (ver o cabeçalho).
 */
export function lerDxf(texto: string): LeituraDxf {
  const linhas = texto.split(/\r?\n/);

  // O cabeçalho, para a sugestão de unidade.
  let mmPorUnidadeDeclarado: number | null = null;
  for (let i = 0; i < linhas.length - 2; i++) {
    if (linhas[i].trim() !== '$INSUNITS') continue;
    const codigo = linhas[i + 1]?.trim();
    const valor = Number(linhas[i + 2]?.trim());
    if (codigo === '70' && Number.isFinite(valor)) {
      mmPorUnidadeDeclarado = MM_POR_INSUNITS[valor] ?? null;
    }
    break;
  }

  // As definições de bloco, para expandir os INSERT.
  const blocos = new Map<string, Bloco>();
  const iBlocos = inicioDaSecao(linhas, 'BLOCKS');
  if (iBlocos >= 0) lerEntidades(linhas, iBlocos, () => {}, blocos);

  const segmentos: SegmentoDxf[] = [];
  const arcos: ArcoDxf[] = [];
  const insercoes: InsercaoDxf[] = [];
  const textos: TextoDxf[] = [];
  const recusadas = new Map<string, { camada: string; tipo: string; quantas: number }>();
  let blocosExpandidos = 0;

  const recusar = (camada: string, tipo: string) => {
    const chave = `${camada}\n${tipo}`; // camada com espaço existe; com quebra de linha, não
    const r = recusadas.get(chave) ?? { camada, tipo, quantas: 0 };
    r.quantas++;
    recusadas.set(chave, r);
  };

  /** Transformação acumulada de um INSERT: p' = T + R(θ)·S·(p − base). */
  interface Transformacao {
    ex: number; // e(1,0)
    ey: number;
    fx: number; // e(0,1)
    fy: number;
    tx: number;
    ty: number;
    escalaRaio: number;
  }
  const IDENTIDADE: Transformacao = { ex: 1, ey: 0, fx: 0, fy: 1, tx: 0, ty: 0, escalaRaio: 1 };
  const aplicar = (t: Transformacao, p: { x: number; y: number }) => ({ x: t.tx + t.ex * p.x + t.fx * p.y, y: t.ty + t.ey * p.x + t.fy * p.y });

  const emitir = (e: Entidade, t: Transformacao, bloco: string | undefined, camadaHerdada: string | undefined, profundidade: number) => {
    // Camada `0` dentro de um bloco é "a camada do INSERT" — a convenção do CAD.
    const camada = bloco && e.camada === '0' && camadaHerdada ? camadaHerdada : e.camada;
    if (e.tipo === 'LINE') {
      const a = aplicar(t, e.a);
      const b = aplicar(t, e.b);
      if (a.x === b.x && a.y === b.y) return;
      segmentos.push({ camada, a, b, ...(bloco ? { bloco } : {}) });
    } else if (e.tipo === 'ARC') {
      // Os ângulos passam pela parte LINEAR da transformação (giro, escala, espelho), medidos
      // de novo nas pontas; espelho (determinante negativo) inverte o sentido, e as pontas trocam.
      const completo = e.anguloFinal - e.anguloInicial === 360;
      const angulo = (g: number) => {
        const r = (g * Math.PI) / 180;
        const x = t.ex * Math.cos(r) + t.fx * Math.sin(r);
        const y = t.ey * Math.cos(r) + t.fy * Math.sin(r);
        return normalizarAngulo((Math.atan2(y, x) * 180) / Math.PI);
      };
      const espelhada = t.ex * t.fy - t.fx * t.ey < 0;
      const a0 = angulo(espelhada ? e.anguloFinal : e.anguloInicial);
      const a1 = angulo(espelhada ? e.anguloInicial : e.anguloFinal);
      arcos.push({
        camada,
        centro: aplicar(t, e.centro),
        raio: e.raio * t.escalaRaio,
        anguloInicial: completo ? 0 : a0,
        anguloFinal: completo ? 360 : a1,
        ...(bloco ? { bloco } : {}),
      });
    } else if (e.tipo === 'RECUSA') {
      recusar(camada, e.nome);
    } else if (e.tipo === 'TEXT') {
      textos.push({ camada, ...aplicar(t, { x: e.x, y: e.y }), texto: e.texto });
    } else if (e.tipo === 'INSERT') {
      // O registro do bloco inserido, só no nível de cima: é o que o Padrão ÒPURA lê (com os atributos,
      // que chegam ao MESMO objeto depois — ver `ultimoInsert`).
      if (profundidade === 0) insercoes.push({ camada, nome: e.nome, x: e.x, y: e.y, sx: e.sx, sy: e.sy, rotacao: e.rotacao, atributos: e.atributos });
      const def = blocos.get(e.nome);
      // Anônimo (`*D12` é cota, `*Model_Space` é layout): não é desenho de arquitetura.
      if (e.nome.startsWith('*')) return;
      if (!def || profundidade >= PROFUNDIDADE_MAX) {
        recusar(camada, 'INSERT');
        return;
      }
      blocosExpandidos++;
      // Local: p_local = R(θ)·S·(p − base) + (x, y); depois a transformação de fora.
      const rad = (e.rotacao * Math.PI) / 180;
      const c = Math.cos(rad);
      const s = Math.sin(rad);
      const local: Transformacao = {
        ex: c * e.sx,
        ey: s * e.sx,
        fx: -s * e.sy,
        fy: c * e.sy,
        tx: e.x - (c * e.sx * def.base.x - s * e.sy * def.base.y),
        ty: e.y - (s * e.sx * def.base.x + c * e.sy * def.base.y),
        escalaRaio: (Math.abs(e.sx) + Math.abs(e.sy)) / 2,
      };
      const composta: Transformacao = {
        ex: t.ex * local.ex + t.fx * local.ey,
        ey: t.ey * local.ex + t.fy * local.ey,
        fx: t.ex * local.fx + t.fx * local.fy,
        fy: t.ey * local.fx + t.fy * local.fy,
        tx: t.tx + t.ex * local.tx + t.fx * local.ty,
        ty: t.ty + t.ey * local.tx + t.fy * local.ty,
        escalaRaio: t.escalaRaio * local.escalaRaio,
      };
      for (const filho of def.entidades) emitir(filho, composta, bloco ?? e.nome, camada, profundidade + 1);
    }
  };

  const iEntidades = inicioDaSecao(linhas, 'ENTITIES');
  if (iEntidades >= 0) lerEntidades(linhas, iEntidades, (e) => emitir(e, IDENTIDADE, undefined, undefined, 0));

  const porCamadaMapa = new Map<string, { segmentos: number; arcos: number; comprimento: number }>();
  const conta = (camada: string) => {
    const atual = porCamadaMapa.get(camada) ?? { segmentos: 0, arcos: 0, comprimento: 0 };
    porCamadaMapa.set(camada, atual);
    return atual;
  };
  for (const s of segmentos) {
    const atual = conta(s.camada);
    atual.segmentos++;
    atual.comprimento += Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  }
  for (const a of arcos) conta(a.camada).arcos++;

  return {
    segmentos: segmentos.filter((s) => Number.isFinite(s.a.x) && Number.isFinite(s.b.y)),
    arcos: arcos.filter((a) => Number.isFinite(a.centro.x) && Number.isFinite(a.centro.y) && Number.isFinite(a.raio)),
    insercoes: insercoes.filter((i) => Number.isFinite(i.x) && Number.isFinite(i.y)),
    textos: textos.filter((t) => Number.isFinite(t.x) && Number.isFinite(t.y)),
    recusas: [...recusadas.values()].sort((a, b) => b.quantas - a.quantas),
    porCamada: [...porCamadaMapa.entries()]
      .map(([camada2, v]) => ({ camada: camada2, ...v }))
      .sort((a, b) => b.comprimento - a.comprimento),
    blocosExpandidos,
    mmPorUnidadeDeclarado,
  };
}

/** Tira a formatação do MTEXT: `\\P` (parágrafo), `\\f…;` (fonte), `{…}` e `\\A1;` (alinhamento). */
function limparMtext(t: string): string {
  return t
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\[fFhHwWqQcCaAtT][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ângulo em [0, 360). */
function normalizarAngulo(g: number): number {
  const r = g % 360;
  return r < 0 ? r + 360 : r;
}
