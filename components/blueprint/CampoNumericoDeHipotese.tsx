import React, { useEffect, useRef, useState } from 'react';

/**
 * Campo numérico de uma HIPÓTESE (14/10/2026). Digitar não grava: o valor vai ao
 * estudo ao sair do campo ou com Enter. Antes, cada tecla gravava
 * `Number(texto) || padrão` — digitar 0 numa cota que aceita 0 virava −150, e
 * apagar para redigitar pulava para o padrão no meio da digitação.
 *
 * Vazio, inválido ou Esc → volta ao último valor gravado (nada muda no estudo).
 * Fora da faixa → encosta no limite.
 */
interface Props {
  value: number;
  onCommit: (valor: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Casas decimais aceitas; 0 (padrão) arredonda para inteiro. */
  casas?: number;
  'aria-label': string;
  title?: string;
  className?: string;
}

const CLASSE_PADRAO = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

/** O texto do campo → o número a gravar, ou `null` quando não há número (vazio, "-", lixo). */
export function interpretarNumero(texto: string, { min, max, casas = 0 }: { min?: number; max?: number; casas?: number }): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '' || limpo === '-' || limpo === '.') return null;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  const fator = 10 ** casas;
  let v = Math.round(n * fator) / fator;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}

export default function CampoNumericoDeHipotese({ value, onCommit, min, max, step, casas = 0, title, className, ...rest }: Props) {
  const [rascunho, setRascunho] = useState(String(value));
  const editando = useRef(false);

  // O valor mudou por fora (carregou do estudo, outra gaveta): segue, a não ser no meio da digitação.
  useEffect(() => {
    if (!editando.current) setRascunho(String(value));
  }, [value]);

  const gravar = () => {
    editando.current = false;
    const v = interpretarNumero(rascunho, { min, max, casas });
    if (v == null) {
      setRascunho(String(value));
      return;
    }
    setRascunho(String(v));
    if (v !== value) onCommit(v);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={rascunho}
      onChange={(e) => {
        editando.current = true;
        setRascunho(e.target.value);
      }}
      onBlur={gravar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          gravar();
        } else if (e.key === 'Escape') {
          // Esc desfaz o rascunho sem fechar a gaveta em volta.
          e.stopPropagation();
          editando.current = false;
          setRascunho(String(value));
        }
      }}
      aria-label={rest['aria-label']}
      title={title ?? ([min != null ? `mín. ${min}` : null, max != null ? `máx. ${max}` : null].filter(Boolean).join(' · ') || undefined)}
      className={className ?? CLASSE_PADRAO}
    />
  );
}
