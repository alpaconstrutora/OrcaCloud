/**
 * Renderer 2D das ELEVAÇÕES — read-only, derivado do kernel.
 *
 * Canvas 2D (decisão DP-03, igual à planta baixa). Não edita nada: sem alças,
 * sem ferramentas, sem snap. Desenha pelo painter's algorithm — paredes opacas
 * da mais funda para a mais próxima, contorno externo do nível por cima,
 * recortes de abertura por último. Sem remoção de linha oculta na v1.
 *
 * A geometria vem inteira de `projetarElevacao` (`utils/blueprintElevation.ts`):
 * este arquivo só transforma mundo→tela e pinta.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import {
  type DirecaoElevacao,
  type ProjecaoElevacao,
  projetarElevacao,
} from '../../utils/blueprintElevation';
import { useCanvasVista, type BBoxMundo } from '../../hooks/useCanvasVista';

interface Props {
  model: BlueprintModel;
  direcao: DirecaoElevacao;
  /** Níveis a projetar. Omitido = todos. */
  levelIds?: string[];
  mostrarCotasAltura?: boolean;
  mostrarRotulosEsquadria?: boolean;
  /** OFF (padrão) = só silhueta + aberturas de fachada. */
  mostrarParedesInternas?: boolean;
  /** Muda de valor → reenquadra. O botão "Enquadrar" da barra bumpa isto. */
  enquadrarToken?: number;
  className?: string;
}

const COR_PAREDE = '#e2e8f0';
const COR_PAREDE_BORDA = '#94a3b8';
const COR_CONTORNO = '#0f172a';
const COR_SOLO = '#64748b';
const COR_ABERTURA_BORDA = '#475569';
const COR_COTA = '#2563eb';
const COR_TEXTO = '#334155';

const ROTULO_ABERTURA: Record<string, string> = {
  door: 'Porta',
  window: 'Janela',
  passage: 'Vão',
  sliding: 'Correr',
};

function bboxDaProjecao(proj: ProjecaoElevacao): BBoxMundo {
  const { uMin, uMax, vMin, vMax } = proj.bbox;
  // Uma folga de 10% para a edificação não colar nas bordas.
  const folgaU = Math.max(500, (uMax - uMin) * 0.1);
  const folgaV = Math.max(500, (vMax - vMin) * 0.1);
  return {
    minX: uMin - folgaU,
    maxX: uMax + folgaU,
    minY: vMin - folgaV,
    maxY: vMax + folgaV,
  };
}

const metros = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

export default function ElevationCanvas({
  model,
  direcao,
  levelIds,
  mostrarCotasAltura = false,
  mostrarRotulosEsquadria = false,
  mostrarParedesInternas = false,
  enquadrarToken = 0,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });

  const chaveNiveis = levelIds ? levelIds.join(',') : 'todos';
  const projecao = useMemo(
    () => projetarElevacao(model, { direcao, levelIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, direcao, chaveNiveis],
  );

  const { vista, paraTela, enquadrar, registrarTamanho, aoRolar, aoApontarBaixo, aoApontarMover, aoApontarCima } =
    useCanvasVista({ margemPx: 56 });

  // ── Tamanho ───────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setTamanho({ w, h });
      registrarTamanho(w, h);
    };
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    medir();
    return () => ro.disconnect();
  }, [registrarTamanho]);

  // ── Enquadramento: no primeiro tamanho válido, ao trocar de direção/níveis,
  //    e quando o botão "Enquadrar" bumpa o token. ──────────────────────────
  useEffect(() => {
    if (tamanho.w > 0 && tamanho.h > 0) {
      enquadrar(bboxDaProjecao(projecao), tamanho);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direcao, chaveNiveis, tamanho.w, tamanho.h, enquadrarToken]);

  // ── Desenho ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tamanho.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = tamanho.w * dpr;
    canvas.height = tamanho.h * dpr;
    canvas.style.width = `${tamanho.w}px`;
    canvas.style.height = `${tamanho.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tamanho.w, tamanho.h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tamanho.w, tamanho.h);

    const retangulo = (uMin: number, uMax: number, vMin: number, vMax: number) => {
      const p1 = paraTela({ x: uMin, y: vMax });
      const p2 = paraTela({ x: uMax, y: vMin });
      return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
    };

    // 1. Linha do solo — atravessa a tela toda na cota v.
    const solo = paraTela({ x: 0, y: projecao.linhaDoSolo.v });
    ctx.strokeStyle = COR_SOLO;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, solo.y);
    ctx.lineTo(tamanho.w, solo.y);
    ctx.stroke();

    // 2. Paredes opacas, fundo → frente (a lista já vem ordenada).
    ctx.lineWidth = 1;
    for (const p of projecao.paredes) {
      if (p.degenerada) continue;
      if (!mostrarParedesInternas && !p.ehContorno) continue;
      const r = retangulo(p.uMin, p.uMax, p.vMin, p.vMax);
      ctx.fillStyle = COR_PAREDE;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = COR_PAREDE_BORDA;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    // 3. Contorno externo do nível — traço forte por cima, esconde as costuras
    //    de junção em T/L.
    ctx.strokeStyle = COR_CONTORNO;
    ctx.lineWidth = 2;
    for (const p of projecao.paredes) {
      if (p.degenerada || !p.ehContorno) continue;
      const r = retangulo(p.uMin, p.uMax, p.vMin, p.vMax);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    // 4. Recortes de abertura — vazio branco + moldura fina.
    for (const o of projecao.aberturas) {
      const r = retangulo(o.uMin, o.uMax, o.vMin, o.vMax);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = COR_ABERTURA_BORDA;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      if (mostrarRotulosEsquadria && Math.abs(r.w) > 28 && Math.abs(r.h) > 16) {
        ctx.fillStyle = COR_TEXTO;
        ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          ROTULO_ABERTURA[o.kind] ?? o.kind,
          r.x + r.w / 2,
          r.y + r.h / 2,
        );
      }
    }

    // 5. Cotas de altura — uma cadeia vertical à esquerda da edificação.
    if (mostrarCotasAltura && projecao.paredes.some((p) => !p.degenerada)) {
      const xCota = paraTela({ x: projecao.bbox.uMin, y: 0 }).x - 18;
      const yBase = paraTela({ x: 0, y: projecao.bbox.vMin }).y;
      const yTopo = paraTela({ x: 0, y: projecao.bbox.vMax }).y;
      ctx.strokeStyle = COR_COTA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xCota, yBase);
      ctx.lineTo(xCota, yTopo);
      ctx.moveTo(xCota - 4, yBase);
      ctx.lineTo(xCota + 4, yBase);
      ctx.moveTo(xCota - 4, yTopo);
      ctx.lineTo(xCota + 4, yTopo);
      ctx.stroke();

      ctx.save();
      ctx.translate(xCota - 6, (yBase + yTopo) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = COR_COTA;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(metros(projecao.bbox.vMax - projecao.bbox.vMin), 0, 0);
      ctx.restore();
    }
  }, [
    projecao,
    vista,
    tamanho,
    paraTela,
    mostrarParedesInternas,
    mostrarRotulosEsquadria,
    mostrarCotasAltura,
  ]);

  const vazio = projecao.paredes.every((p) => p.degenerada);

  return (
    <div ref={containerRef} className={`relative h-full w-full bg-white ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onWheel={aoRolar}
        onPointerDown={aoApontarBaixo}
        onPointerMove={aoApontarMover}
        onPointerUp={aoApontarCima}
        onPointerLeave={aoApontarCima}
      />
      {vazio && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Nada para mostrar nesta vista — desenhe paredes na planta baixa.
          </p>
        </div>
      )}
    </div>
  );
}
