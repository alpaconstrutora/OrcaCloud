import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type BlueprintModel,
  type Point,
  type Wall,
  point,
} from '../../utils/blueprintKernel';
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
/** Mesmo teto do kernel (MAX_COORD_MM). Ver o comentário em `capturar`. */
const LIMITE_MM = 1_000_000;

interface Props {
  model: BlueprintModel;
  tool: BlueprintTool;
  levelId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddWall: (a: Point, b: Point) => void;
  onDelete: () => void;
  espessuraMm: number;
  /** `null` = automático pelo zoom. Número = passo fixo em mm, escolhido pelo usuário. */
  passoGradeMm: number | null;
  /** Informa de volta qual passo está valendo, para a barra mostrar no modo automático. */
  onPassoEfetivo?: (mm: number) => void;
}

interface Vista {
  /** Pixels por milímetro. */
  escala: number;
  /** Deslocamento em pixels. */
  dx: number;
  dy: number;
}

export default function BlueprintCanvas({
  model,
  tool,
  levelId,
  selectedId,
  onSelect,
  onAddWall,
  onDelete,
  espessuraMm,
  passoGradeMm,
  onPassoEfetivo,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [vista, setVista] = useState<Vista>({ escala: 0.05, dx: 60, dy: 60 });
  const [tamanho, setTamanho] = useState({ w: 800, h: 600 });
  const [inicio, setInicio] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [arrastando, setArrastando] = useState(false);

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

    // Paredes
    ctx.lineCap = 'round';
    for (const w of paredesDoNivel) {
      const a = paraTela(w.a);
      const b = paraTela(w.b);
      ctx.strokeStyle = w.id === selectedId ? COR_SELECIONADA : COR_PAREDE;
      ctx.lineWidth = Math.max(1.5, w.thicknessMm * vista.escala);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
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

  function aoMover(e: React.PointerEvent) {
    const { px, py } = posicao(e);

    if (arrastando) {
      setVista((v) => ({ ...v, dx: v.dx + e.movementX, dy: v.dy + e.movementY }));
      return;
    }
    if (tool !== 'parede') {
      setCursor(null);
      return;
    }
    setCursor(capturar(paraMundo(px, py)));
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

    if (tool === 'selecionar') {
      onSelect(paredeSob(mundo)?.id ?? null);
      return;
    }

    const capturado = capturar(mundo);
    if (!inicio) {
      setInicio(capturado);
      return;
    }
    if (capturado.x !== inicio.x || capturado.y !== inicio.y) {
      onAddWall(inicio, capturado);
      // Encadeia: a ponta vira o início da próxima, que é como se desenha
      // um contorno sem reclicar no mesmo vértice.
      setInicio(capturado);
    }
  }

  function aoSoltar(e: React.PointerEvent) {
    if (arrastando) {
      setArrastando(false);
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
        style={{ cursor: arrastando ? 'grabbing' : tool === 'parede' ? 'crosshair' : 'default' }}
        onPointerMove={aoMover}
        onPointerDown={aoApertar}
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
          · grade {rotuloPasso(passoEfetivo)} · botão direito arrasta · roda dá zoom
        </span>
      </div>
    </div>
  );
}
