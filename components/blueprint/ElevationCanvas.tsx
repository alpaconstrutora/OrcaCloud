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
  /** ON (padrão) = a estrutura de concreto aparece na fachada. */
  mostrarEstrutura?: boolean;
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
/** Concreto — mais cheio que a alvenaria, a mesma hierarquia da planta baixa. */
const COR_ESTRUTURA = 'rgba(30, 41, 59, 0.55)';
const COR_ESTRUTURA_BORDA = '#1e293b';
/** Fundação — enterrada, então tom terroso e traço oculto. */
const COR_FUNDACAO = 'rgba(120, 53, 15, 0.20)';
const COR_FUNDACAO_BORDA = '#78350f';

const ROTULO_ABERTURA: Record<string, string> = {
  door: 'Porta',
  window: 'Janela',
  passage: 'Vão',
  sliding: 'Correr',
};

/**
 * A caixa do que está SENDO DESENHADO — não a do que a projeção conhece.
 *
 * `projetarElevacao` é pura e completa: o `bbox` dela desce até a ponta da
 * estaca, a 9 m abaixo do piso. Está certo, e é o que a exportação usa. Mas com
 * o toggle "Estrutura" DESLIGADO essa caixa passa a enquadrar o que ninguém vê:
 * a edificação encolhe para o alto da tela, sobra um vazio de 9 m embaixo, e a
 * cota de altura anuncia 12,02 m medindo até uma peça apagada.
 *
 * Foi visto na tela em 31/08/2026, ao desligar o toggle. Quem decide o
 * enquadramento é quem sabe o que pintou — a separação de sempre: a função pura
 * deriva tudo, o renderer escolhe o que mostrar.
 */
export function bboxVisivel(proj: ProjecaoElevacao, comEstrutura: boolean) {
  const pecas = proj.estruturas.filter((e) => !e.degenerada);
  if (comEstrutura && pecas.length > 0) return proj.bbox;

  const solidas = proj.paredes.filter((p) => !p.degenerada);
  if (solidas.length === 0) return proj.bbox;

  return {
    uMin: Math.min(...solidas.map((p) => p.uMin)),
    uMax: Math.max(...solidas.map((p) => p.uMax)),
    vMin: proj.linhaDoSolo.v,
    vMax: Math.max(...solidas.map((p) => p.vMax)),
  };
}

function bboxDaProjecao(proj: ProjecaoElevacao, comEstrutura: boolean): BBoxMundo {
  const { uMin, uMax, vMin, vMax } = bboxVisivel(proj, comEstrutura);
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
  mostrarEstrutura = true,
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
      enquadrar(bboxDaProjecao(projecao, mostrarEstrutura), tamanho);
    }
    // `mostrarEstrutura` NA LISTA: ligar e desligar o toggle muda a altura do
    // que está desenhado em 9 m. Sem reenquadrar, a fachada fica minúscula num
    // canto até alguém apertar "Enquadrar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direcao, chaveNiveis, tamanho.w, tamanho.h, enquadrarToken, mostrarEstrutura]);

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

    // 2. TUDO NUMA PASSADA SÓ, DO FUNDO PARA A FRENTE.
    //
    // ─── O QUE ISTO CONSERTA ────────────────────────────────────────────────
    //
    // Antes eram três passes independentes: todas as paredes, depois todas as
    // estruturas, depois todas as aberturas. Como cada passe reordenava a
    // profundidade do zero, o que era desenhado depois cobria o que estava na
    // frente — o oposto do que a vista mostra. Três defeitos vinham daí:
    //
    //  1. O VÃO DA PAREDE DO FUNDO furava a parede da frente. Uma janela dos
    //     fundos aparecia como um buraco branco no meio da fachada da frente,
    //     numa parede que não tem janela nenhuma.
    //  2. A PORTA DE PAREDE INTERNA continuava desenhada com "Paredes internas"
    //     DESLIGADO. A parede sumia; o vão dela ficava flutuando na fachada.
    //  3. A viga ATRÁS de uma parede aparecia por cima dela.
    //
    // Não é remoção de linha oculta de verdade — ninguém recorta aresta contra
    // superfície aqui. É o algoritmo do pintor feito direito: como tudo é
    // opaco, ordenar uma vez só e pintar em ordem dá o mesmo resultado visível,
    // por uma fração do custo. O que continua fora é o caso que exige recorte:
    // peça que atravessa parcialmente outra.
    //
    // A ABERTURA VAI COLADA NA PAREDE QUE A HOSPEDA, e não como item próprio:
    // ela é um furo naquela parede, não um objeto no espaço. Solta na ordenação,
    // um empate de profundidade poderia pô-la antes da própria parede — e o
    // furo sumiria sob o preenchimento dela.
    type ItemDaVista = { profundidade: number; pintar: () => void };
    const itens: ItemDaVista[] = [];

    for (const p of projecao.paredes) {
      if (p.degenerada) continue;
      if (!mostrarParedesInternas && !p.ehContorno) continue;
      const vaos = projecao.aberturas.filter((o) => o.wallId === p.wallId);
      itens.push({
        profundidade: p.profundidade,
        pintar: () => {
          const r = retangulo(p.uMin, p.uMax, p.vMin, p.vMax);
          ctx.fillStyle = COR_PAREDE;
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = COR_PAREDE_BORDA;
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x, r.y, r.w, r.h);

          for (const o of vaos) {
            const rv = retangulo(o.uMin, o.uMax, o.vMin, o.vMax);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(rv.x, rv.y, rv.w, rv.h);
            ctx.strokeStyle = COR_ABERTURA_BORDA;
            ctx.lineWidth = 1.25;
            ctx.strokeRect(rv.x, rv.y, rv.w, rv.h);

            if (mostrarRotulosEsquadria && Math.abs(rv.w) > 28 && Math.abs(rv.h) > 16) {
              ctx.fillStyle = COR_TEXTO;
              ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(ROTULO_ABERTURA[o.kind] ?? o.kind, rv.x + rv.w / 2, rv.y + rv.h / 2);
            }
          }
        },
      });
    }

    if (mostrarEstrutura) {
      for (const e of projecao.estruturas) {
        if (e.degenerada) continue;
        itens.push({
          profundidade: e.profundidade,
          pintar: () => {
            const r = retangulo(e.uMin, e.uMax, e.vMin, e.vMax);
            ctx.fillStyle = e.enterrada ? COR_FUNDACAO : COR_ESTRUTURA;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle = e.enterrada ? COR_FUNDACAO_BORDA : COR_ESTRUTURA_BORDA;
            ctx.lineWidth = 1.25;
            // Abaixo do piso = oculto, e oculto se desenha tracejado. É a mesma
            // convenção que a planta baixa usa para a fundação.
            ctx.setLineDash(e.enterrada ? [6, 4] : []);
            ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.setLineDash([]);

            if (e.rotulo && Math.abs(r.w) > 24 && Math.abs(r.h) > 14) {
              ctx.fillStyle = '#ffffff';
              ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(e.rotulo, r.x + r.w / 2, r.y + r.h / 2);
            }
          },
        });
      }
    }

    // Fundo primeiro. `profundidade` é `dot(centro, direçãoDeVisão)`, então
    // MAIOR = mais longe de quem olha.
    itens.sort((a, b) => b.profundidade - a.profundidade);
    for (const i of itens) i.pintar();

    // 3. Contorno externo do nível — traço forte, POR CIMA de tudo.
    //
    // Continua sendo passe próprio, e isso é deliberado: ele existe para esconder
    // as costuras de junção em T/L entre paredes da MESMA profundidade, onde não
    // há ordem que resolva. Pagar por isso uma linha de contorno que aparece
    // sobre uma parede da frente é mais barato do que a fachada sair costurada.
    ctx.strokeStyle = COR_CONTORNO;
    ctx.lineWidth = 2;
    for (const p of projecao.paredes) {
      if (p.degenerada || !p.ehContorno) continue;
      const r = retangulo(p.uMin, p.uMax, p.vMin, p.vMax);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }

    // 5. Cotas de altura — uma cadeia vertical à esquerda da edificação.
    if (mostrarCotasAltura && projecao.paredes.some((p) => !p.degenerada)) {
      // A MESMA caixa que enquadrou. A cota mede o que se vê — anunciar 12,02 m
      // com a fundação escondida seria cotar uma peça apagada.
      const bb = bboxVisivel(projecao, mostrarEstrutura);
      const xCota = paraTela({ x: bb.uMin, y: 0 }).x - 18;
      const yBase = paraTela({ x: 0, y: bb.vMin }).y;
      const yTopo = paraTela({ x: 0, y: bb.vMax }).y;
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
      ctx.fillText(metros(bb.vMax - bb.vMin), 0, 0);
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
    mostrarEstrutura,
  ]);

  // "Vazio" tem de contar a estrutura também: uma planta de fôrmas — só pilares
  // e vigas, sem parede nenhuma — mostrava o aviso "desenhe paredes" com o
  // esqueleto inteiro desenhado atrás dele.
  const vazio =
    projecao.paredes.every((p) => p.degenerada) &&
    projecao.estruturas.every((e) => e.degenerada);

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
