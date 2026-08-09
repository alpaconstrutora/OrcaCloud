import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  travarOrtogonal,
  isFreeWallEnd,
  type BlueprintModel,
  type Opening,
  type Point,
  type Wall,
  point,
  wallLength,
} from '../../utils/blueprintKernel';
import {
  DIMENSAO_POR_TIPO,
  medir,
  pontosMinimos,
  type FormaMedida,
  type TipoMedida,
} from '../../utils/blueprintMedicoes';
import {
  modeloParaPixel,
  pixelParaModelo,
  type PontoPx,
  type Underlay,
} from '../../utils/blueprintUnderlay';
import type { BlueprintTool } from '../../hooks/useBlueprintEditor';

/**
 * Canvas do editor de plantas (épico E3).
 *
 * Renderer: CANVAS 2D, por decisão DP-03. O Spike B mediu os três candidatos com
 * 20 mil objetos em Chrome real: SVG, Canvas 2D e WebGL entregam 60 fps, mas o
 * custo do SVG se concentra justamente na operação mais frequente do editor —
 * mudança por elemento (0,40 ms no Canvas 2D contra 1,10 ms no SVG) — e ele ainda
 * carrega um nó de DOM por parede. WebGL não resolve problema que exista hoje.
 *
 * O que o canvas NÃO faz: alterar o modelo. Ele traduz gesto em intenção e chama
 * `onCommand`. Quem valida e transforma é o kernel (ADR-01).
 *
 * Acessibilidade: canvas é opaco para leitor de tela. A camada focável vive fora
 * daqui, em `BlueprintEditor` — é o "híbrido" que o Spike B recomendou. Aqui só
 * garantimos que o elemento é focável e que Esc/Delete funcionam por teclado.
 */

const COR_PAREDE = '#334155';
const COR_SELECIONADA = '#dc2626';
const COR_PREVIA = '#2563eb';
/** Âmbar: vão em aberto e ponta solta. Mesma cor do aviso no painel. */
const COR_ALERTA = '#d97706';
const COR_AMBIENTE = 'rgba(37, 99, 235, 0.08)';
const COR_GRADE = '#e2e8f0';
const COR_GRADE_FORTE = '#cbd5e1';

/**
 * Escada de passos de grade, em mm — série 1-2-5, que é a que o olho lê como
 * "redonda" em qualquer escala (1 cm, 2 cm, 5 cm, 10 cm, 20 cm…).
 */
const ESCADA_MM = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000];

/** Espaçamento mínimo em tela, em pixels, para uma linha de grade valer a pena. */
const MIN_PX_ENTRE_LINHAS = 9;

/**
 * Passo adaptativo: o MENOR da escada cujo espaçamento em tela ainda é legível.
 *
 * Era daqui que vinha o bug de a grade sumir no zoom out. Com passo fixo de
 * 100 mm, afastar a vista fazia o espaçamento cair abaixo do limiar e o desenho
 * da grade era pulado inteiro — inclusive as linhas de metro. Escolhendo o passo
 * em função da escala, a grade nunca desaparece: ela muda de granularidade.
 */
function passoAdaptativo(escala: number): number {
  for (const passo of ESCADA_MM) {
    if (passo * escala >= MIN_PX_ENTRE_LINHAS) return passo;
  }
  return ESCADA_MM[ESCADA_MM.length - 1];
}

/** Rótulo curto do passo, para o usuário saber a que ele está encaixando. */
export function rotuloPasso(mm: number): string {
  return mm >= 1000 ? `${mm / 1000} m` : `${mm} mm`;
}
/** Raio de captura de extremidade, em PIXELS de tela — não em mm. */
const SNAP_PX = 12;
/** Distância máxima, em pixels, para o clique selecionar uma parede. */
const HIT_PX = 8;
/** Espessura da linha de contorno da parede, em pixels de tela. */
const LINHA_PAREDE_PX = 1.2;
/** Mesmo teto do kernel (MAX_COORD_MM). Ver o comentário em `capturar`. */
const LIMITE_MM = 1_000_000;

interface Props {
  model: BlueprintModel;
  tool: BlueprintTool;
  levelId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddWall: (a: Point, b: Point) => void;
  /** Coloca abertura na parede indicada, com o offset ja medido a partir de `a`. */
  onAddOpening: (wallId: string, offsetMm: number) => void;
  onDelete: () => void;
  /** Largura da abertura em curso, para previa e para o comando. */
  larguraAberturaMm: number;
  espessuraMm: number;
  /** `null` = automático pelo zoom. Número = passo fixo em mm, escolhido pelo usuário. */
  passoGradeMm: number | null;
  /** Informa de volta qual passo está valendo, para a barra mostrar no modo automático. */
  onPassoEfetivo?: (mm: number) => void;
  /** Vãos que a lista do painel oferece para fechar — destacados aqui. */
  vaos?: { a: Point; b: Point; mm: number }[];
  /** Pontas de parede sem encontro. São elas que impedem o ambiente de fechar. */
  pontasSoltas?: Point[];
  /** Trava ortogonal ligada. Shift INVERTE o estado, como em todo CAD. */
  ortogonal?: boolean;
  /** Planta de fundo já carregada, com o posicionamento aferido. */
  fundo?: { imagem: HTMLImageElement; underlay: Underlay; opacidade: number } | null;
  /** Em calibração: recebe os dois pontos clicados, em PIXEL DA IMAGEM. */
  onCalibrar?: (p1: PontoPx, p2: PontoPx) => void;
  /** Formas MEDIDAS já gravadas, para desenhar. */
  medicoes?: FormaMedida[];
  /** Conclui uma forma medida. `null` em `pontos` cancela. */
  onMedicaoPronta?: (tipo: TipoMedida, pontos: Point[]) => void;
  /** Id da medição selecionada, para destacar. */
  medicaoSelecionada?: string | null;
  onSelecionarMedicao?: (id: string | null) => void;
  /** Move a ponta de uma parede. Sem isto, a alça é desenhada e não faz nada. */
  onMoveVertex?: (wallId: string, end: 'a' | 'b', to: Point) => void;
}

interface Vista {
  /** Pixels por milímetro. */
  escala: number;
  /** Deslocamento em pixels. */
  dx: number;
  dy: number;
}

/** Distância de clique para pegar a alça de uma ponta, em pixels de tela. */
const ALCA_PX = 9;

export default function BlueprintCanvas({
  model,
  tool,
  levelId,
  selectedId,
  onSelect,
  onAddWall,
  onAddOpening,
  onDelete,
  larguraAberturaMm,
  espessuraMm,
  passoGradeMm,
  onPassoEfetivo,
  vaos = [],
  pontasSoltas = [],
  ortogonal = false,
  fundo = null,
  onMoveVertex,
  onCalibrar,
  medicoes = [],
  onMedicaoPronta,
  medicaoSelecionada = null,
  onSelecionarMedicao,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [vista, setVista] = useState<Vista>({ escala: 0.05, dx: 60, dy: 60 });
  const [tamanho, setTamanho] = useState({ w: 800, h: 600 });
  const [inicio, setInicio] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [previaAbertura, setPreviaAbertura] = useState<{ wallId: string; offsetMm: number } | null>(null);
  /** Ponta em arraste, e para onde ela iria se soltasse agora. */
  const [movendo, setMovendo] = useState<{ wallId: string; end: 'a' | 'b' } | null>(null);
  const [destinoPonta, setDestinoPonta] = useState<Point | null>(null);
  /** Primeiro ponto da aferição, em milímetro do modelo. */
  const [calibP1, setCalibP1] = useState<Point | null>(null);
  /** Vértices da forma medida em curso. */
  const [medindo, setMedindo] = useState<Point[]>([]);

  // Passo em vigor: o escolhido pelo usuario, ou o adaptativo se ele deixou em
  // automatico. E o MESMO valor usado para desenhar e para encaixar — a grade
  // que se ve tem que ser a grade em que se encaixa, senao o clique "pula".
  const passoEfetivo = passoGradeMm ?? passoAdaptativo(vista.escala);

  useEffect(() => {
    onPassoEfetivo?.(passoEfetivo);
  }, [passoEfetivo, onPassoEfetivo]);

  const paredesDoNivel = model.walls.filter((w) => !levelId || w.levelId === levelId);
  const ambientesDoNivel = model.spaces.filter((s) => !levelId || s.levelId === levelId);

  // ── Conversões ────────────────────────────────────────────────────────────
  const paraTela = useCallback(
    (p: Point) => ({ x: p.x * vista.escala + vista.dx, y: p.y * vista.escala + vista.dy }),
    [vista],
  );

  const paraMundo = useCallback(
    (px: number, py: number) => ({
      x: (px - vista.dx) / vista.escala,
      y: (py - vista.dy) / vista.escala,
    }),
    [vista],
  );

  /**
   * Captura em duas etapas: primeiro extremidade de parede existente, depois
   * grade. Extremidade tem prioridade porque é o que fecha ambiente — cair na
   * grade a 1 mm de distância deixa um vão que não fecha e o usuário não vê.
   */
  const capturar = useCallback(
    (mundo: { x: number; y: number }): Point => {
      const limite = SNAP_PX / vista.escala;
      let melhor: Point | null = null;
      let melhorDist = Infinity;

      for (const w of paredesDoNivel) {
        for (const extremo of [w.a, w.b]) {
          const d = Math.hypot(extremo.x - mundo.x, extremo.y - mundo.y);
          if (d < limite && d < melhorDist) {
            melhor = extremo;
            melhorDist = d;
          }
        }
      }
      if (melhor) return point(melhor.x, melhor.y);

      // LIMITAR antes de chamar `point()`. O kernel recusa coordenada fora de
      // ±1.000.000 mm com KernelError, e `capturar` roda a cada movimento do
      // mouse — sem o limite, afastar a vista e mover o cursor levantaria uma
      // exceção não tratada dentro do handler de ponteiro e derrubaria a aba.
      const limitar = (v: number) => Math.max(-LIMITE_MM, Math.min(LIMITE_MM, v));

      return point(
        limitar(Math.round(mundo.x / passoEfetivo) * passoEfetivo),
        limitar(Math.round(mundo.y / passoEfetivo) * passoEfetivo),
      );
    },
    [paredesDoNivel, vista.escala, passoEfetivo],
  );

  /**
   * Onde, ao longo do eixo da parede, cai o cursor — em mm a partir de `a`.
   * O resultado ja vem preso dentro dos limites uteis para uma abertura de
   * `larguraAberturaMm`: e o kernel que recusaria, e recusar depois do clique
   * seria pior do que nao deixar errar.
   */
  const offsetNaParede = useCallback(
    (w: Wall, mundo: { x: number; y: number }): number => {
      const dx = w.b.x - w.a.x;
      const dy = w.b.y - w.a.y;
      const comp2 = dx * dx + dy * dy;
      if (comp2 === 0) return 0;
      const t = ((mundo.x - w.a.x) * dx + (mundo.y - w.a.y) * dy) / comp2;
      const comp = wallLength(w);
      const centro = t * comp;
      const bruto = centro - larguraAberturaMm / 2;
      return Math.round(Math.max(0, Math.min(comp - larguraAberturaMm, bruto)));
    },
    [larguraAberturaMm],
  );

  const paredeSob = useCallback(
    (mundo: { x: number; y: number }): Wall | null => {
      const limite = HIT_PX / vista.escala;
      for (const w of paredesDoNivel) {
        const dx = w.b.x - w.a.x;
        const dy = w.b.y - w.a.y;
        const comp2 = dx * dx + dy * dy;
        if (comp2 === 0) continue;
        let t = ((mundo.x - w.a.x) * dx + (mundo.y - w.a.y) * dy) / comp2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(w.a.x + t * dx - mundo.x, w.a.y + t * dy - mundo.y);
        if (d < limite + espessuraMm / 2) return w;
      }
      return null;
    },
    [paredesDoNivel, vista.escala, espessuraMm],
  );

  // ── Tamanho ───────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setTamanho({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setTamanho({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── Desenho ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // devicePixelRatio: sem isso a planta fica borrada em tela de alta densidade.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = tamanho.w * dpr;
    canvas.height = tamanho.h * dpr;
    canvas.style.width = `${tamanho.w}px`;
    canvas.style.height = `${tamanho.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, tamanho.w, tamanho.h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tamanho.w, tamanho.h);

    // ── Planta de fundo ──────────────────────────────────────────────────────
    //
    // ANTES de tudo, inclusive da grade. Geometria nunca pode ficar atrás da
    // imagem: o que se está desenhando sumiria sob o que se está copiando.
    //
    // A matriz sai da composição de duas transformações que já existem —
    // pixel da imagem → milímetro do modelo (a aferição) e milímetro → tela (a
    // vista). Compor evita reimplementar escala e deslocamento aqui, que é como
    // o fundo e o desenho saem de sincronia ao dar zoom.
    if (fundo) {
      // Os vetores da matriz saem de três pontos: onde cai a origem da imagem e
      // para onde apontam um pixel em x e um em y. Compor assim, em vez de
      // reconstruir escala e deslocamento à mão, é o que mantém o fundo colado
      // no desenho ao dar zoom — reimplementar a conta aqui é como os dois saem
      // de sincronia.
      const o = paraTela(pixelParaModelo(fundo.underlay, { px: 0, py: 0 }));
      const ex = paraTela(pixelParaModelo(fundo.underlay, { px: 1, py: 0 }));
      const ey = paraTela(pixelParaModelo(fundo.underlay, { px: 0, py: 1 }));

      ctx.save();
      ctx.globalAlpha = fundo.opacidade;
      ctx.setTransform(
        (ex.x - o.x) * dpr,
        (ex.y - o.y) * dpr,
        (ey.x - o.x) * dpr,
        (ey.y - o.y) * dpr,
        o.x * dpr,
        o.y * dpr,
      );
      ctx.drawImage(fundo.imagem, 0, 0);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Grade. Duas granularidades: fina no passo em vigor, forte a cada 5 —
    // a forte dá a referência de leitura sem que a fina precise ser densa.
    //
    // Sem `if` que possa pular o bloco inteiro: no modo automático o passo já é
    // escolhido para caber na tela, e no modo fixo a densidade é escolha do
    // usuário. Era o antigo `if (passoTela > 4)` que fazia a grade evaporar no
    // zoom out — o pior tipo de sumiço, porque parece que a tela quebrou.
    const passoTela = passoEfetivo * vista.escala;
    const desenhar = passoTela >= 3;

    if (desenhar) {
      const x0 = Math.floor(-vista.dx / passoTela);
      const y0 = Math.floor(-vista.dy / passoTela);
      const nx = Math.ceil(tamanho.w / passoTela) + 1;
      const ny = Math.ceil(tamanho.h / passoTela) + 1;
      // Com a grade muito fina, só as linhas fortes — senão vira mancha cinza.
      const soFortes = passoTela < 6;

      ctx.lineWidth = 1;
      for (let i = 0; i <= nx; i++) {
        const indice = x0 + i;
        const forte = indice % 5 === 0;
        if (soFortes && !forte) continue;
        ctx.strokeStyle = forte ? COR_GRADE_FORTE : COR_GRADE;
        const gx = Math.round(indice * passoTela + vista.dx) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, tamanho.h);
        ctx.stroke();
      }
      for (let i = 0; i <= ny; i++) {
        const indice = y0 + i;
        const forte = indice % 5 === 0;
        if (soFortes && !forte) continue;
        ctx.strokeStyle = forte ? COR_GRADE_FORTE : COR_GRADE;
        const gy = Math.round(indice * passoTela + vista.dy) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(tamanho.w, gy);
        ctx.stroke();
      }
    }

    // Ambientes derivados — pintados antes das paredes para ficarem por baixo.
    ctx.fillStyle = COR_AMBIENTE;
    for (const s of ambientesDoNivel) {
      if (s.ring.length < 3) continue;
      ctx.beginPath();
      const p0 = paraTela(s.ring[0]);
      ctx.moveTo(p0.x, p0.y);
      for (const p of s.ring.slice(1)) {
        const t = paraTela(p);
        ctx.lineTo(t.x, t.y);
      }
      ctx.closePath();
      for (const buraco of s.holes) {
        if (buraco.length < 3) continue;
        const h0 = paraTela(buraco[0]);
        ctx.moveTo(h0.x, h0.y);
        // Sentido inverso: é o que faz o `evenodd` recortar em vez de preencher.
        for (const p of [...buraco].slice(1).reverse()) {
          const t = paraTela(p);
          ctx.lineTo(t.x, t.y);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }

    // Paredes — desenhadas VAZADAS, na convencao de planta arquitetonica: duas
    // linhas paralelas com o miolo vazio, e nao um traco cheio.
    //
    // Feito em duas passadas em vez de calcular a uniao booleana dos corpos:
    //
    //   1. traco GROSSO na espessura da parede -> silhueta cheia. Nas junçoes as
    //      pinceladas se sobrepoem e a uniao sai de graca, sem geometria nenhuma.
    //   2. traco BRANCO mais fino por cima -> escava o miolo, deixando so a borda.
    //
    // O miolo escavado tambem se une nas junçoes, entao o interior fica continuo
    // de um comodo para o outro — que e exatamente o que a planta de referencia
    // mostra, sem linha cruzando dentro do encontro de paredes.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';


    // A regra de "ponta livre" vive no KERNEL, não aqui.
    //
    // Ela tinha uma cópia neste arquivo e a exportação nasceu sem ela — o canto
    // ficou certo na tela e aberto no papel. Regra de geometria duplicada é
    // regra que diverge; a definição e o porquê estão em `isFreeWallEnd`.
    const pontaLivre = (p: Point, id: string) => isFreeWallEnd(paredesDoNivel, p, id);

    // Geometria de desenho de cada parede.
    //
    // O detalhe que faz o canto funcionar: ESTENDER a pincelada em meia espessura
    // nas pontas que encontram outra parede. Com corte reto terminando no eixo,
    // sobra um quadrado vazio de meia espessura no canto externo — era o degrau
    // que aparecia em cada esquina. Estendendo, as pinceladas das duas paredes
    // cobrem esse quadrado exatamente, e o canto sai VIVO, não arredondado.
    //
    // Na ponta LIVRE não se estende: a parede ficaria meia espessura mais longa
    // do que é.
    const traco = paredesDoNivel.map((w) => {
      const a = paraTela(w.a);
      const b = paraTela(w.b);
      const comp = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = comp > 0 ? (b.x - a.x) / comp : 0;
      const uy = comp > 0 ? (b.y - a.y) / comp : 0;
      const cheia = Math.max(1, w.thicknessMm * vista.escala);
      const meia = cheia / 2;
      return {
        w,
        a,
        b,
        ux,
        uy,
        comp,
        cheia,
        // Recuo NEGATIVO estende; positivo encurta.
        extA: pontaLivre(w.a, w.id) ? 0 : meia,
        extB: pontaLivre(w.b, w.id) ? 0 : meia,
      };
    });

    // Passada 1 — silhueta
    for (const t of traco) {
      if (t.comp < 0.5) continue;
      ctx.strokeStyle = t.w.id === selectedId ? COR_SELECIONADA : COR_PAREDE;
      ctx.lineWidth = t.cheia;
      ctx.beginPath();
      ctx.moveTo(t.a.x - t.ux * t.extA, t.a.y - t.uy * t.extA);
      ctx.lineTo(t.b.x + t.ux * t.extB, t.b.y + t.uy * t.extB);
      ctx.stroke();
    }

    // Passada 2 — escavar o miolo, com a MESMA extensão nas junções para que o
    // interior de um cômodo continue no outro sem linha atravessando o encontro.
    ctx.strokeStyle = '#ffffff';
    for (const t of traco) {
      const miolo = t.cheia - 2 * LINHA_PAREDE_PX;
      // Muito longe, a parede vira uma linha e não há miolo para escavar. Deixar
      // sólida é o certo: contorno de meio pixel viraria sujeira cinza.
      if (miolo < 1 || t.comp < 0.5) continue;

      // O miolo avança MENOS que a silhueta — exatamente uma espessura de linha.
      //
      // Era daqui que vinha o canto aberto: estendendo o branco tanto quanto o
      // escuro, a escavação de uma parede alcançava a borda EXTERNA da outra e
      // apagava a linha dela. A silhueta estava certa o tempo todo; o branco é
      // que comia o contorno do vizinho.
      //
      // A mesma conta serve para a ponta livre, onde `ext` é 0 e o resultado fica
      // negativo — ou seja, recua e deixa borda fechando a extremidade.
      const recA = t.extA - LINHA_PAREDE_PX;
      const recB = t.extB - LINHA_PAREDE_PX;
      if (t.comp + recA + recB <= 0) continue;

      ctx.lineWidth = miolo;
      ctx.beginPath();
      ctx.moveTo(t.a.x - t.ux * recA, t.a.y - t.uy * recA);
      ctx.lineTo(t.b.x + t.ux * recB, t.b.y + t.uy * recB);
      ctx.stroke();
    }

    // Aberturas — desenhadas DEPOIS das paredes, em tres etapas:
    //   1. vao: branco atravessando a espessura inteira, abrindo o buraco;
    //   2. batentes: as duas linhas que fecham a parede nas laterais do vao;
    //   3. simbolo: arco de giro na porta, folha fina na janela.
    //
    // Sem os batentes o vao ficaria com as bordas da parede correndo soltas por
    // dentro dele, que e o erro classico de quem so apaga o trecho.
    const paredePorId = new Map(paredesDoNivel.map((w) => [w.id, w]));

    for (const o of model.openings) {
      const w = paredePorId.get(o.wallId);
      if (!w) continue;

      const comp = wallLength(w);
      if (comp <= 0) continue;
      const ux = (w.b.x - w.a.x) / comp;
      const uy = (w.b.y - w.a.y) / comp;
      // Normal do eixo, para atravessar a espessura.
      const nx = -uy;
      const ny = ux;
      const meia = w.thicknessMm / 2;

      const ini = { x: w.a.x + ux * o.offsetMm, y: w.a.y + uy * o.offsetMm };
      const fim = {
        x: w.a.x + ux * (o.offsetMm + o.widthMm),
        y: w.a.y + uy * (o.offsetMm + o.widthMm),
      };

      const t1 = paraTela({ x: ini.x + nx * meia, y: ini.y + ny * meia } as Point);
      const t2 = paraTela({ x: ini.x - nx * meia, y: ini.y - ny * meia } as Point);
      const t3 = paraTela({ x: fim.x - nx * meia, y: fim.y - ny * meia } as Point);
      const t4 = paraTela({ x: fim.x + nx * meia, y: fim.y + ny * meia } as Point);

      // 1. abrir o vao
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.lineTo(t4.x, t4.y);
      ctx.closePath();
      ctx.fill();

      // 2. batentes
      ctx.strokeStyle = o.id === selectedId ? COR_SELECIONADA : COR_PAREDE;
      ctx.lineWidth = LINHA_PAREDE_PX;
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.moveTo(t3.x, t3.y);
      ctx.lineTo(t4.x, t4.y);
      ctx.stroke();

      const larguraTela = Math.hypot(t4.x - t1.x, t4.y - t1.y);
      if (larguraTela < 4) continue;

      // 3. simbolo
      if (o.kind === 'window') {
        // Janela: folha fina no eixo da parede.
        const e1 = paraTela(ini as Point);
        const e2 = paraTela(fim as Point);
        ctx.beginPath();
        ctx.moveTo(e1.x, e1.y);
        ctx.lineTo(e2.x, e2.y);
        ctx.stroke();
      } else {
        // Porta: folha aberta a 90 graus mais o arco de giro, como em planta.
        const piv = paraTela({ x: ini.x + nx * meia, y: ini.y + ny * meia } as Point);
        const raio = larguraTela;
        const angEixo = Math.atan2(uy, ux);
        const angNormal = Math.atan2(ny, nx);

        ctx.beginPath();
        ctx.moveTo(piv.x, piv.y);
        ctx.lineTo(piv.x + Math.cos(angNormal) * raio, piv.y + Math.sin(angNormal) * raio);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(piv.x, piv.y, raio, angEixo, angNormal, false);
        ctx.stroke();
      }
    }

    // Prévia da parede em curso
    if (inicio && cursor) {
      const a = paraTela(inicio);
      const b = paraTela(cursor);
      ctx.strokeStyle = COR_PREVIA;
      ctx.lineWidth = Math.max(1.5, espessuraMm * vista.escala);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const comprimento = Math.round(Math.hypot(cursor.x - inicio.x, cursor.y - inicio.y));
      ctx.fillStyle = COR_PREVIA;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(
        `${(comprimento / 1000).toFixed(2)} m`,
        (a.x + b.x) / 2 + 8,
        (a.y + b.y) / 2 - 8,
      );
    }

    // ── Formas MEDIDAS ───────────────────────────────────────────────────────
    //
    // Desenhadas com traço TRACEJADO e preenchimento fraco, para não se
    // confundirem com a geometria derivada. A distinção não é estética: uma é
    // recalculável e a outra é a afirmação de uma pessoa, e quem olha a tela
    // precisa saber qual está vendo.
    for (const f of medicoes) {
      const pts = f.pontos.map(paraTela);
      if (pts.length === 0) continue;

      const selecionada = f.id === medicaoSelecionada;
      ctx.strokeStyle = f.cor;
      ctx.lineWidth = selecionada ? 2.5 : 1.5;
      ctx.setLineDash([6, 4]);

      if (f.tipo === 'PONTO') {
        for (const t of pts) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, selecionada ? 7 : 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const t of pts.slice(1)) ctx.lineTo(t.x, t.y);
        if (f.tipo === 'POLIGONO') {
          ctx.closePath();
          ctx.fillStyle = `${f.cor}22`;
          ctx.fill();
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // O valor medido, no próprio desenho: conferir na lista lateral obriga a
      // procurar qual forma é qual.
      const m = medir(f);
      const cx = pts.reduce((soma, t) => soma + t.x, 0) / pts.length;
      const cy = pts.reduce((soma, t) => soma + t.y, 0) / pts.length;
      ctx.fillStyle = f.cor;
      ctx.font = `${selecionada ? '600 12px' : '11px'} system-ui, sans-serif`;
      const rotulo =
        DIMENSAO_POR_TIPO[f.tipo] === 'UN'
          ? `${m.valor} un`
          : `${m.valor.toFixed(2).replace('.', ',')} ${DIMENSAO_POR_TIPO[f.tipo] === 'M2' ? 'm²' : 'm'}`;
      ctx.fillText(f.nome ? `${f.nome}: ${rotulo}` : rotulo, cx + 6, cy - 6);
    }

    // Forma medida em curso.
    if (medindo.length > 0) {
      const pts = medindo.map(paraTela);
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const t of pts.slice(1)) ctx.lineTo(t.x, t.y);
      if (cursor) {
        const c = paraTela(cursor);
        ctx.lineTo(c.x, c.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // O primeiro vértice fica marcado: é onde se clica para FECHAR.
      ctx.fillStyle = COR_ALERTA;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Alças da parede selecionada.
    //
    // Desenhá-las é o que torna o arraste DESCOBRÍVEL. Uma ponta arrastável sem
    // marca na tela é a mesma classe de defeito de um botão que não funciona: a
    // ação existe e ninguém encontra.
    const selecionadaParaAlca = paredesDoNivel.find((w) => w.id === selectedId);
    if (selecionadaParaAlca && !movendo) {
      for (const extremo of [selecionadaParaAlca.a, selecionadaParaAlca.b]) {
        const t = paraTela(extremo);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(t.x - 4, t.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Prévia do arraste: a parede como ficaria se soltasse agora.
    if (movendo && destinoPonta) {
      const w = paredePorId.get(movendo.wallId);
      if (w) {
        const fixa = paraTela(movendo.end === 'a' ? w.b : w.a);
        const solta = paraTela(destinoPonta);

        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = Math.max(1, w.thicknessMm * vista.escala);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(fixa.x, fixa.y);
        ctx.lineTo(solta.x, solta.y);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Comprimento em tempo real: é a informação que decide o arraste, e
        // conferi-la depois de soltar seria tarde.
        const comp = Math.hypot(destinoPonta.x - (movendo.end === 'a' ? w.b.x : w.a.x),
                                destinoPonta.y - (movendo.end === 'a' ? w.b.y : w.a.y));
        ctx.fillStyle = COR_SELECIONADA;
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillText(
          `${(comp / 1000).toFixed(2)} m`,
          (fixa.x + solta.x) / 2 + 8,
          (fixa.y + solta.y) / 2 - 8,
        );

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COR_SELECIONADA;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(solta.x - 4, solta.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Linha de aferição em curso.
    if (tool === 'calibrar' && calibP1) {
      const a = paraTela(calibP1);
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (cursor) {
        const b = paraTela(cursor);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COR_ALERTA;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pontas soltas e vãos candidatos.
    //
    // Desenhados por último, por cima de tudo: são o que impede o ambiente de
    // aparecer, e o usuário precisa achá-los sem procurar. Uma ponta solta de
    // 3 mm é invisível na planta e explica sozinha por que a área não saiu.
    if (pontasSoltas.length > 0) {
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 1.5;
      for (const p of pontasSoltas) {
        const t = paraTela(p);
        ctx.beginPath();
        ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const v of vaos) {
      const a = paraTela(v.a);
      const b = paraTela(v.b);
      ctx.strokeStyle = COR_ALERTA;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = COR_ALERTA;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(`${(v.mm / 1000).toFixed(2)} m`, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6);
    }

    // Prévia da abertura sob o cursor
    if (previaAbertura) {
      const w = paredePorId.get(previaAbertura.wallId);
      if (w) {
        const comp = wallLength(w);
        const ux = (w.b.x - w.a.x) / comp;
        const uy = (w.b.y - w.a.y) / comp;
        const a = paraTela({
          x: w.a.x + ux * previaAbertura.offsetMm,
          y: w.a.y + uy * previaAbertura.offsetMm,
        } as Point);
        const b = paraTela({
          x: w.a.x + ux * (previaAbertura.offsetMm + larguraAberturaMm),
          y: w.a.y + uy * (previaAbertura.offsetMm + larguraAberturaMm),
        } as Point);
        ctx.strokeStyle = COR_PREVIA;
        ctx.lineWidth = Math.max(2, w.thicknessMm * vista.escala);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Marcador de captura
    if (cursor && tool === 'parede') {
      const c = paraTela(cursor);
      ctx.strokeStyle = COR_PREVIA;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [
    model,
    tamanho,
    vista,
    inicio,
    cursor,
    selectedId,
    tool,
    espessuraMm,
    larguraAberturaMm,
    previaAbertura,
    vaos,
    pontasSoltas,
    fundo,
    calibP1,
    medicoes,
    medicaoSelecionada,
    medindo,
    movendo,
    destinoPonta,
    passoEfetivo,
    paraTela,
    paredesDoNivel,
    ambientesDoNivel,
  ]);

  // ── Interação ─────────────────────────────────────────────────────────────
  function posicao(e: React.PointerEvent | React.MouseEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  /**
   * Orto em vigor. Shift INVERTE o modo, como em todo CAD: com orto ligado ele
   * libera o traço livre; com orto desligado ele trava. Ter um botão que só liga
   * e uma tecla que só liga seria duas formas de fazer a mesma coisa.
   */
  function ortoAtivo(e: { shiftKey: boolean }): boolean {
    return ortogonal !== e.shiftKey;
  }

  /** Ponta OPOSTA à que está sendo arrastada — é dela que a trava se mede. */
  function ancoraDoArraste(): Point | null {
    if (!movendo) return null;
    const w = model.walls.find((x) => x.id === movendo.wallId);
    if (!w) return null;
    return movendo.end === 'a' ? w.b : w.a;
  }

  function aoMover(e: React.PointerEvent) {
    const { px, py } = posicao(e);

    if (arrastando) {
      setVista((v) => ({ ...v, dx: v.dx + e.movementX, dy: v.dy + e.movementY }));
      return;
    }

    if (movendo) {
      const ancora = ancoraDoArraste();
      let alvo = capturar(paraMundo(px, py));
      if (ancora && ortoAtivo(e)) alvo = travarOrtogonal(ancora, alvo);
      setDestinoPonta(alvo);
      return;
    }
    if (tool === 'abertura') {
      const mundo = paraMundo(px, py);
      const w = paredeSob(mundo);
      setPreviaAbertura(w ? { wallId: w.id, offsetMm: offsetNaParede(w, mundo) } : null);
      setCursor(null);
      return;
    }
    setPreviaAbertura(null);

    if (
      tool === 'calibrar' ||
      tool === 'medir-area' ||
      tool === 'medir-linha' ||
      tool === 'contar'
    ) {
      setCursor(paraMundo(px, py) as Point);
      return;
    }

    if (tool !== 'parede') {
      setCursor(null);
      return;
    }
    // A PRÉVIA TEM QUE APLICAR A MESMA TRAVA DO CLIQUE. Se ela mostrasse o traço
    // livre e o clique gravasse o travado, a linha "pularia" ao soltar — e o
    // usuário aprenderia a não confiar na prévia.
    let alvo = capturar(paraMundo(px, py));
    if (inicio && ortoAtivo(e)) alvo = travarOrtogonal(inicio, alvo);
    setCursor(alvo);
  }

  function aoApertar(e: React.PointerEvent) {
    // Botão do meio ou direito: panorâmica, em qualquer ferramenta.
    if (e.button === 1 || e.button === 2) {
      setArrastando(true);
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const { px, py } = posicao(e);
    const mundo = paraMundo(px, py);

    if (tool === 'medir-area' || tool === 'medir-linha' || tool === 'contar') {
      // SEM encaixe na grade: a pessoa está apontando um canto no DESENHO de
      // fundo, não construindo geometria. Encaixar deslocaria o vértice para o
      // ponto mais próximo da grade e a área medida sairia errada.
      const p = { x: mundo.x, y: mundo.y } as Point;

      if (tool === 'contar') {
        // Contagem fecha a cada clique: cada ponto é uma unidade.
        onMedicaoPronta?.('PONTO', [p]);
        return;
      }

      const tipo: TipoMedida = tool === 'medir-area' ? 'POLIGONO' : 'LINHA';
      const novos = [...medindo, p];

      // Clicar de novo no primeiro vértice FECHA a forma — é como se fecha
      // polilinha em qualquer CAD, e evita depender de um botão fora do desenho.
      const fechou =
        medindo.length >= pontosMinimos(tipo) &&
        Math.hypot(medindo[0].x - p.x, medindo[0].y - p.y) < SNAP_PX / vista.escala;

      if (fechou) {
        onMedicaoPronta?.(tipo, medindo);
        setMedindo([]);
        return;
      }
      setMedindo(novos);
      return;
    }

    if (tool === 'calibrar') {
      // SEM encaixe na grade, de propósito: aqui o usuário está apontando um
      // pixel da imagem, não desenhando. Encaixar deslocaria o ponto da cota e
      // a aferição sairia errada — justamente o número que tudo depois usa.
      if (!fundo) return;
      const p = { x: mundo.x, y: mundo.y };

      if (!calibP1) {
        setCalibP1(p);
        return;
      }
      onCalibrar?.(
        modeloParaPixel(fundo.underlay, calibP1.x, calibP1.y),
        modeloParaPixel(fundo.underlay, p.x, p.y),
      );
      setCalibP1(null);
      return;
    }

    if (tool === 'abertura') {
      const w = paredeSob(mundo);
      if (w) onAddOpening(w.id, offsetNaParede(w, mundo));
      return;
    }

    if (tool === 'selecionar') {
      // ALÇA ANTES DE SELEÇÃO. As alças só existem na parede JÁ selecionada —
      // é a convenção de CAD (selecionar, depois pegar o grip) e evita que um
      // clique para selecionar vire um arraste acidental de geometria.
      const selecionada = model.walls.find((w) => w.id === selectedId);
      if (selecionada) {
        const limite = ALCA_PX / vista.escala;
        for (const end of ['a', 'b'] as const) {
          const p = selecionada[end];
          if (Math.hypot(p.x - mundo.x, p.y - mundo.y) <= limite) {
            setMovendo({ wallId: selecionada.id, end });
            setDestinoPonta(p);
            canvasRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // Abertura antes de parede: ela esta POR CIMA e e menor, entao se o
      // clique cair nas duas o usuario quis a de cima.
      const w = paredeSob(mundo);
      const aberturaClicada = w
        ? model.openings.find((o) => {
            if (o.wallId !== w.id) return false;
            const off = offsetNaParede(w, mundo);
            return Math.abs(off - o.offsetMm) < Math.max(o.widthMm, larguraAberturaMm);
          })
        : undefined;
      onSelect(aberturaClicada?.id ?? w?.id ?? null);
      return;
    }

    let capturado = capturar(mundo);
    if (!inicio) {
      setInicio(capturado);
      return;
    }
    if (ortoAtivo(e)) capturado = travarOrtogonal(inicio, capturado);
    if (capturado.x !== inicio.x || capturado.y !== inicio.y) {
      onAddWall(inicio, capturado);
      // Encadeia: a ponta vira o início da próxima, que é como se desenha
      // um contorno sem reclicar no mesmo vértice.
      setInicio(capturado);
    }
  }

  /** Duplo clique encerra a forma em curso — a saída para quem não quer fechar. */
  function aoDuploClique() {
    if (medindo.length === 0) return;
    const tipo: TipoMedida = tool === 'medir-area' ? 'POLIGONO' : 'LINHA';
    if (medindo.length >= pontosMinimos(tipo)) onMedicaoPronta?.(tipo, medindo);
    setMedindo([]);
  }

  function aoSoltar(e: React.PointerEvent) {
    if (arrastando) {
      setArrastando(false);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }

    if (movendo) {
      const w = model.walls.find((x) => x.id === movendo.wallId);
      const outra = w ? (movendo.end === 'a' ? w.b : w.a) : null;
      // Soltar em cima da outra ponta faria uma parede de comprimento zero, que
      // o kernel recusa com erro. Descartar em silêncio é o certo: o usuário
      // desistiu do arraste, não pediu uma parede degenerada.
      if (
        destinoPonta &&
        outra &&
        (destinoPonta.x !== outra.x || destinoPonta.y !== outra.y)
      ) {
        onMoveVertex?.(movendo.wallId, movendo.end, destinoPonta);
      }
      setMovendo(null);
      setDestinoPonta(null);
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }
  }

  function aoRolar(e: React.WheelEvent) {
    const { px, py } = posicao(e);
    const antes = paraMundo(px, py);
    const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const escala = Math.max(0.002, Math.min(2, vista.escala * fator));

    // Mantém sob o cursor o mesmo ponto do mundo — zoom "para onde se olha".
    setVista({
      escala,
      dx: px - antes.x * escala,
      dy: py - antes.y * escala,
    });
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setInicio(null);
      setMovendo(null);
      setDestinoPonta(null);
      setCalibP1(null);
      setMedindo([]);
      onSelect(null);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      e.preventDefault();
      onDelete();
    }
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Área de desenho da planta. Use a lista de ambientes ao lado para navegar por teclado."
        className="block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        style={{
          cursor: arrastando || movendo
            ? 'grabbing'
            : tool !== 'selecionar' && tool !== 'abertura'
              ? 'crosshair'
              : 'default',
        }}
        onPointerMove={aoMover}
        onPointerDown={aoApertar}
        onDoubleClick={aoDuploClique}
        onPointerUp={aoSoltar}
        onWheel={aoRolar}
        onKeyDown={aoTeclar}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-500 shadow-sm">
        {tool === 'parede'
          ? inicio
            ? 'Clique para fechar o trecho · Esc cancela'
            : 'Clique para iniciar a parede'
          : 'Clique numa parede para selecionar · Delete remove'}
        <span className="ml-2 text-slate-400">
          · grade {rotuloPasso(passoEfetivo)}{ortogonal ? ' · orto (Shift libera)' : ' · Shift trava em 90°'} · botão direito arrasta · roda dá zoom
        </span>
      </div>
    </div>
  );
}
