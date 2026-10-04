import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { MergedTourStep } from '../../utils/portalHelpDefaults';
import { elementoDaAncora, posicaoDoPopover, type Caixa } from '../../utils/portalTour';

/**
 * Tour guiado dos portais externos — motor v2 (04/10/2026).
 *
 * Cada passo aponta para um elemento com `data-tour="<anchor>"` (âncoras em
 * utils/portalHelpDefaults.ts › TOURS; título/texto editáveis pela construtora).
 * O passo é resolvido QUANDO o tour chega nele (não na largada):
 *  1. procura a âncora no documento onde o tour está montado — que pode ser o
 *     <iframe> da prévia mobile (`ownerDocument`, nunca `document` solto);
 *  2. não achou e o passo é de outra aba → pede `onNavigate(section)` uma vez
 *     e espera a aba montar;
 *  3. esgotou a espera: com `quando` mostra o passo centralizado com a nota
 *     "Disponível quando…" (falta dado, não falta tela); sem `quando` pula em
 *     silêncio na direção do movimento (ex.: `conta` no celular).
 * Clique fora NÃO encerra (o usuário perdia o tour por engano); fecham X,
 * Pular, Escape e Concluir. A volta para a aba de origem é do PortalHelp.
 * Nenhuma âncora na tela → termina como 'pulado' sem aparecer.
 */
export interface PortalTourProps {
  steps: readonly MergedTourStep[];
  onFinish: (motivo: 'concluido' | 'pulado', passoAlcancado: number) => void;
  accent?: 'orange' | 'coral' | 'indigo';
  /** aba ativa do portal */
  currentSection?: string | null;
  /** o portal troca de aba (e fecha detalhe aberto) */
  onNavigate?: (section: string) => void;
  /** espera longa: primeiro alvo do tour ou depois de navegar */
  maxTentativas?: number;
  /** espera curta: elemento da tela atual que não está lá (layout sem ele) */
  tentativasCurtas?: number;
  intervaloMs?: number;
}

const ACCENT = {
  orange: { btn: 'bg-orange-500 hover:bg-orange-600', dot: 'bg-orange-500', ring: 'ring-orange-400' },
  coral: { btn: 'bg-[#E1553C] hover:bg-[#C24428]', dot: 'bg-[#E1553C]', ring: 'ring-[#E1553C]' },
  indigo: { btn: 'bg-indigo-600 hover:bg-indigo-700', dot: 'bg-indigo-600', ring: 'ring-indigo-500' },
};

const POPOVER = { width: 320, height: 210 };
type Fase = 'procurando' | 'alvo' | 'sem-alvo';

export const PortalTour: React.FC<PortalTourProps> = ({
  steps, onFinish, accent = 'orange', currentSection = null, onNavigate,
  maxTentativas = 16, tentativasCurtas = 3, intervaloMs = 300,
}) => {
  const a = ACCENT[accent];
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [fase, setFase] = useState<Fase>('procurando');
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [janela, setJanela] = useState({ width: 1024, height: 768 });
  const [pulados, setPulados] = useState<ReadonlySet<number>>(() => new Set());

  const direcao = useRef<1 | -1>(1);
  const alvo = useRef<HTMLElement | null>(null);
  const jaAchou = useRef(false);
  const terminou = useRef(false);
  const secaoAtual = useRef(currentSection);
  secaoAtual.current = currentSection;
  const navegar = useRef(onNavigate);
  navegar.current = onNavigate;
  const fim = useRef(onFinish);
  fim.current = onFinish;

  const terminar = useCallback((motivo: 'concluido' | 'pulado', alcancado: number) => {
    if (terminou.current) return;
    terminou.current = true;
    fim.current(motivo, alcancado);
  }, []);

  const medir = useCallback(() => {
    const win = raiz?.ownerDocument.defaultView;
    if (!win) return;
    setJanela({ width: win.innerWidth, height: win.innerHeight });
    const el = alvo.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCaixa({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [raiz]);

  // Resolve o passo atual.
  useEffect(() => {
    if (!raiz) return;
    if (steps.length === 0) { terminar('pulado', 0); return; }
    const passo = steps[idx];
    if (!passo) { terminar('concluido', steps.length); return; }
    const doc = raiz.ownerDocument;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tentativas = 0;
    let navegou = false;
    alvo.current = null;
    setFase('procurando');
    setCaixa(null);

    const semAlvo = () => {
      setPulados(prev => new Set(prev).add(idx));
      const prox = idx + direcao.current;
      if (prox < 0) { direcao.current = 1; setIdx(idx + 1); }
      else if (prox >= steps.length) terminar('concluido', steps.length);
      else setIdx(prox);
    };

    const tentar = () => {
      if (cancelado) return;
      const el = elementoDaAncora(passo.anchor, doc);
      if (el) {
        jaAchou.current = true;
        alvo.current = el;
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* jsdom */ }
        setPulados(prev => {
          if (!prev.has(idx)) return prev;
          const n = new Set(prev); n.delete(idx); return n;
        });
        medir();
        setFase('alvo');
        return;
      }
      if (!navegou && passo.section && passo.section !== secaoAtual.current && navegar.current) {
        navegou = true;
        navegar.current(passo.section);
      }
      const limite = navegou || !jaAchou.current ? maxTentativas : tentativasCurtas;
      if (tentativas >= limite) {
        if (!jaAchou.current) {
          // nada do tour na tela (layout sem âncoras): não insiste
          if (!steps.some(s => elementoDaAncora(s.anchor, doc))) { terminar('pulado', 0); return; }
          jaAchou.current = true;
        }
        if (passo.quando) { medir(); setFase('sem-alvo'); return; }
        semAlvo();
        return;
      }
      tentativas += 1;
      timer = setTimeout(tentar, intervaloMs);
    };
    tentar();
    return () => { cancelado = true; if (timer) clearTimeout(timer); };
  }, [raiz, idx, steps, terminar, medir, maxTentativas, tentativasCurtas, intervaloMs]);

  // Re-mede enquanto há alvo: scroll, resize e conteúdo que carrega depois.
  useEffect(() => {
    if (fase !== 'alvo' || !raiz) return;
    const win = raiz.ownerDocument.defaultView;
    if (!win) return;
    win.addEventListener('resize', medir);
    win.addEventListener('scroll', medir, true);
    const t = win.setInterval(medir, 400);
    return () => {
      win.removeEventListener('resize', medir);
      win.removeEventListener('scroll', medir, true);
      win.clearInterval(t);
    };
  }, [fase, raiz, medir]);

  useEffect(() => {
    if (!raiz) return;
    const doc = raiz.ownerDocument;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') terminar('pulado', idx + 1); };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [raiz, idx, terminar]);

  const passo = steps[idx];
  const total = steps.length;
  // Último de verdade: depois deste só sobram passos de cromo (sem aba) que não
  // estão nesta tela (ex.: `ajuda`/`conta` no celular) — seriam pulados.
  const docAtual = raiz?.ownerDocument;
  const ultimo = idx === total - 1 || (!!docAtual && steps.slice(idx + 1).every(s =>
    s.section === null && !s.quando && !elementoDaAncora(s.anchor, docAtual)));
  const temAnterior = steps.some((_, i) => i < idx && !pulados.has(i));
  const mostrando = !!passo && (fase === 'sem-alvo' || (fase === 'alvo' && !!caixa));
  const pos = fase === 'alvo' && caixa
    ? posicaoDoPopover(caixa, POPOVER, janela)
    : { top: Math.max(16, (janela.height - POPOVER.height) / 2), left: Math.max(16, (janela.width - POPOVER.width) / 2) };
  const pad = 6;

  return (
    <div ref={setRaiz} className={`fixed inset-0 z-[400] ${mostrando ? '' : 'pointer-events-none'}`} aria-live="polite">
      {mostrando && passo && (
        <>
          {fase === 'alvo' && caixa ? (
            <div
              className={`absolute rounded-xl ring-2 ${a.ring} pointer-events-none transition-all duration-200`}
              style={{
                top: caixa.top - pad, left: caixa.left - pad, width: caixa.width + pad * 2, height: caixa.height + pad * 2,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-slate-900/55" />
          )}
          {/* bloqueia cliques no portal durante o tour, sem encerrá-lo */}
          <div aria-hidden className="absolute inset-0" />
          <div
            role="dialog"
            aria-label="Tour do portal"
            className="absolute bg-white rounded-2xl shadow-2xl border border-gray-100 p-5"
            style={{ top: pos.top, left: pos.left, width: POPOVER.width, maxWidth: 'calc(100vw - 32px)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-gray-900">{passo.title}</h3>
              <button type="button" onClick={() => terminar('pulado', idx + 1)} title="Pular o tour" aria-label="Pular o tour" className="p-1 -m-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{passo.body}</p>
            {fase === 'sem-alvo' && passo.quando && (
              <p className="mt-2 text-xs font-semibold text-gray-500">Disponível {passo.quando}.</p>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-hidden>
                {steps.map((_, i) => (
                  <span
                    key={i}
                    data-ponto={i === idx ? 'atual' : pulados.has(i) ? 'pulado' : 'outro'}
                    className={`h-1.5 rounded-full transition-all ${i === idx ? `w-4 ${a.dot}` : `w-1.5 ${i < idx ? 'bg-gray-400' : 'bg-gray-200'}`} ${pulados.has(i) ? 'opacity-30' : ''}`}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Passo {idx + 1} de {total}</span>
            </div>
            <div className="mt-3 flex items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                {temAnterior && (
                  <button type="button" onClick={() => { direcao.current = -1; setIdx(i => i - 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Anterior
                  </button>
                )}
                {!ultimo && (
                  <button type="button" onClick={() => terminar('pulado', idx + 1)} className="h-8 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                    Pular
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (ultimo ? terminar('concluido', total) : (direcao.current = 1, setIdx(i => i + 1)))}
                  className={`h-8 px-3 rounded-[6px] text-sm font-medium text-white ${a.btn}`}
                >
                  {ultimo ? 'Concluir' : 'Próximo'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PortalTour;
