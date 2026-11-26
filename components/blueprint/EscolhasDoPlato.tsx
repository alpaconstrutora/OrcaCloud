/**
 * AS DUAS ESCOLHAS DO PLATÔ (25/11/2026, reel da Hektar — "Mass balance" e "Side slope"): cartões com ícone, um
 * grupo de rádio cada. Usadas pelo painel Terreno › Corte e aterro e pelo painel do platô no 3D — uma definição só
 * (textos em `MODOS_DO_BALANCO` / `FORMAS_DO_TALUDE`, ao lado da conta).
 */
import React from 'react';
import {
  FORMAS_DO_TALUDE,
  MODOS_DO_BALANCO,
  type FormaDoTalude,
  type ModoDoBalanco,
} from '../../utils/blueprintTopografiaAnalises';

const CORTE = '#ef4444';
const ATERRO = '#3b82f6';

/** O desenho de cada modo: o terreno (linha cinza), a cota (tracejada) e o que sai (vermelho) ou entra (azul). */
function IconeDoBalanco({ modo }: { modo: ModoDoBalanco }) {
  const corta = modo !== 'ATERRO';
  const aterra = modo !== 'CORTE';
  return (
    <svg viewBox="0 0 40 20" className="h-5 w-10" aria-hidden="true">
      {corta && <path d="M4 15 L14 4 L20 10 Z" fill={CORTE} opacity="0.75" />}
      {aterra && <path d="M20 10 L28 16 L36 10 Z" fill={ATERRO} opacity="0.75" />}
      <path d="M2 17 L14 4 L28 16 L38 8" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="2" y1="10" x2="38" y2="10" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

function IconeDaForma({ forma }: { forma: FormaDoTalude }) {
  return (
    <svg viewBox="0 0 40 20" className="h-5 w-10" aria-hidden="true">
      <line x1="2" y1="6" x2="12" y2="6" stroke="#1e293b" strokeWidth="1.5" />
      {forma === 'RETO' ? (
        <path d="M12 6 L28 16 L38 16" fill="none" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
      ) : (
        <path d="M12 6 C20 6 20 16 28 16 L38 16" fill="none" stroke="#475569" strokeWidth="1.5" />
      )}
    </svg>
  );
}

function Cartoes<T extends string>({
  rotulo,
  opcoes,
  valor,
  onEscolher,
  icone,
}: {
  rotulo: string;
  opcoes: readonly { valor: T; rotulo: string }[];
  valor: T;
  onEscolher: (v: T) => void;
  icone: (v: T) => React.ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={`grid gap-1.5 ${opcoes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={o.rotulo}
            onClick={() => onEscolher(o.valor)}
            className={`flex flex-col items-center gap-0.5 rounded-[6px] border px-1 py-1.5 text-[11px] transition-colors ${
              ativo ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {icone(o.valor)}
            <span className="leading-tight">{o.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Balanço de massa: Corte / Corte e aterro / Aterro, com a explicação do escolhido logo abaixo. */
export function EscolhaDoBalanco({ valor, onEscolher }: { valor: ModoDoBalanco; onEscolher: (v: ModoDoBalanco) => void }) {
  const atual = MODOS_DO_BALANCO.find((m) => m.valor === valor) ?? MODOS_DO_BALANCO[1];
  return (
    <div>
      <Cartoes rotulo="Balanço de massa" opcoes={MODOS_DO_BALANCO} valor={valor} onEscolher={onEscolher} icone={(v) => <IconeDoBalanco modo={v} />} />
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{atual.explicacao}</p>
    </div>
  );
}

/** Forma do talude: Reto (1:h) / Suave (largura em planta). */
export function EscolhaDaFormaDoTalude({ valor, onEscolher }: { valor: FormaDoTalude; onEscolher: (v: FormaDoTalude) => void }) {
  const atual = FORMAS_DO_TALUDE.find((f) => f.valor === valor) ?? FORMAS_DO_TALUDE[0];
  return (
    <div>
      <Cartoes rotulo="Forma do talude" opcoes={FORMAS_DO_TALUDE} valor={valor} onEscolher={onEscolher} icone={(v) => <IconeDaForma forma={v} />} />
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{atual.explicacao}</p>
    </div>
  );
}
