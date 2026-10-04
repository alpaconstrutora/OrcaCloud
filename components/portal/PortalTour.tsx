import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { MergedTourStep } from '../../utils/portalHelpDefaults';
import { elementoDaAncora, posicaoDoPopover, type Caixa } from '../../utils/portalTour';

/**
 * Tour guiado dos portais externos (F3, 04/10/2026).
 *
 * Cada passo aponta para um elemento com `data-tour="<anchor>"` (âncoras fixas
 * em utils/portalHelpDefaults.ts › TOUR_STEPS; título/texto editáveis pela
 * construtora). O componente:
 *  - espera as âncoras aparecerem (o portal ainda pode estar carregando) por
 *    até ~5 s; passo sem âncora visível é pulado;
 *  - realça o elemento com um "holofote" (sombra ao redor) e põe o popover ao
 *    lado, dentro da janela;
 *  - "Pular" ou o último "Concluir" chamam `onFinish` — quem chama grava o
 *    "já viu" (utils/portalTour.ts) e desmonta.
 * Sem nenhuma âncora na tela (ex.: layout sem sidebar) termina sozinho como
 * 'pulado', para não ficar tentando a cada carga.
 */
export interface PortalTourProps {
  steps: readonly MergedTourStep[];
  onFinish: (motivo: 'concluido' | 'pulado') => void;
  accent?: 'orange' | 'coral' | 'indigo';
  /** tentativas de achar as âncoras antes de desistir (300 ms cada) */
  maxTentativas?: number;
}

const ACCENT = {
  orange: { btn: 'bg-orange-500 hover:bg-orange-600', dot: 'bg-orange-500', ring: 'ring-orange-400' },
  coral: { btn: 'bg-[#E1553C] hover:bg-[#C24428]', dot: 'bg-[#E1553C]', ring: 'ring-[#E1553C]' },
  indigo: { btn: 'bg-indigo-600 hover:bg-indigo-700', dot: 'bg-indigo-600', ring: 'ring-indigo-500' },
};

const POPOVER = { width: 320, height: 190 };

export const PortalTour: React.FC<PortalTourProps> = ({ steps, onFinish, accent = 'orange', maxTentativas = 16 }) => {
  const a = ACCENT[accent];
  // passos cuja âncora existe E está visível — resolvido depois de esperar o portal montar
  const [visiveis, setVisiveis] = useState<MergedTourStep[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const finished = useRef(false);

  const terminar = useCallback((motivo: 'concluido' | 'pulado') => {
    if (finished.current) return;
    finished.current = true;
    onFinish(motivo);
  }, [onFinish]);

  // 1) espera as âncoras
  useEffect(() => {
    let tentativas = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tentar = () => {
      const achados = steps.filter(s => elementoDaAncora(s.anchor));
      // o primeiro passo é o "bem-vindo" (menu): só começamos quando ele existir,
      // ou quando desistirmos de esperar
      const pronto = achados.length > 0 && (achados[0] === steps[0] || tentativas >= maxTentativas);
      if (pronto || tentativas >= maxTentativas) {
        if (achados.length === 0) terminar('pulado');
        else setVisiveis(achados);
        return;
      }
      tentativas += 1;
      timer = setTimeout(tentar, 300);
    };
    tentar();
    return () => { if (timer) clearTimeout(timer); };
  }, [steps, maxTentativas, terminar]);

  const passo = visiveis?.[idx] ?? null;

  // 2) mede o alvo do passo atual (e re-mede em scroll/resize)
  const medir = useCallback(() => {
    if (!passo) return;
    const el = elementoDaAncora(passo.anchor);
    if (!el) { setCaixa(null); return; }
    const r = el.getBoundingClientRect();
    setCaixa({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [passo]);

  useLayoutEffect(() => {
    if (!passo) return;
    const el = elementoDaAncora(passo.anchor);
    if (!el) {
      // sumiu entre a espera e agora (ex.: trocou de aba): pula
      if (visiveis && idx < visiveis.length - 1) setIdx(i => i + 1); else terminar('concluido');
      return;
    }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* jsdom */ }
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [passo, medir, visiveis, idx, terminar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') terminar('pulado'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [terminar]);

  if (!visiveis || !passo || !caixa) return null;

  const total = visiveis.length;
  const ultimo = idx === total - 1;
  const pos = posicaoDoPopover(caixa, POPOVER, { width: window.innerWidth, height: window.innerHeight });
  const pad = 6;

  return (
    <div className="fixed inset-0 z-[400]" aria-live="polite">
      {/* holofote: a sombra escurece tudo ao redor do alvo; clique fora = pular */}
      <div
        className={`absolute rounded-xl ring-2 ${a.ring} pointer-events-none transition-all duration-200`}
        style={{
          top: caixa.top - pad, left: caixa.left - pad, width: caixa.width + pad * 2, height: caixa.height + pad * 2,
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
        }}
      />
      <button type="button" aria-label="Fechar o tour" className="absolute inset-0 w-full h-full cursor-default" onClick={() => terminar('pulado')} />
      <div
        role="dialog"
        aria-label="Tour do portal"
        className="absolute bg-white rounded-2xl shadow-2xl border border-gray-100 p-5"
        style={{ top: pos.top, left: pos.left, width: POPOVER.width, maxWidth: 'calc(100vw - 32px)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-gray-900">{passo.title}</h3>
          <button type="button" onClick={() => terminar('pulado')} title="Pular o tour" aria-label="Pular o tour" className="p-1 -m-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">{passo.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Passo {idx + 1} de {total}</span>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button type="button" onClick={() => setIdx(i => i - 1)} className="h-8 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                Anterior
              </button>
            )}
            {!ultimo && (
              <button type="button" onClick={() => terminar('pulado')} className="h-8 px-3 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100">
                Pular
              </button>
            )}
            <button
              type="button"
              onClick={() => (ultimo ? terminar('concluido') : setIdx(i => i + 1))}
              className={`h-8 px-3 rounded-[6px] text-sm font-medium text-white ${a.btn}`}
            >
              {ultimo ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalTour;
