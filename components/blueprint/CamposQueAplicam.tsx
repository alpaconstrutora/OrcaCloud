import React, { useRef, useState } from 'react';

/**
 * Campos que aplicam no Enter e no blur, e desistem no Escape.
 *
 * ─── POR QUE ISTO É UM ARQUIVO, E NÃO UMA CÓPIA EM CADA PAINEL ──────────────
 *
 * ⚠️ A armadilha do Escape: `.blur()` dispara `onBlur` **sincronamente**, dentro
 * do mesmo handler de tecla, antes de o React aplicar qualquer `setState` pedido
 * ali. Por isso o cancelamento vive numa `ref`, lida na hora. Perder essa
 * sutileza faz o campo reaplicar um valor que o usuário abandonou — e ela já
 * estava duplicada em `PainelParedeSelecionada` e `PainelTerreno` quando o quadro
 * de divisas apareceu como terceiro chamador. Três cópias de uma sutileza é o
 * número em que uma delas fica para trás.
 */

/** Lê "4,10" ou "4.10" como número. `null` se não for número. */
function lerNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** Formata milímetro como metro em PT-BR: 12000 → "12,00". */
export function metrosDe(mm: number): string {
  return (mm / 1000).toFixed(2).replace('.', ',');
}

interface CampoEmMetrosProps {
  /** Valor atual em mm. `null` deixa o campo vazio. */
  valorMm: number | null;
  /**
   * Remonta o input quando o valor muda POR FORA (trocou a seleção, ou o arraste
   * no canvas mudou a medida). Sem isso, o campo não controlado ficaria exibindo
   * o número velho.
   */
  chave: string;
  /** Recebe mm inteiro, ou `null` quando o campo foi esvaziado. */
  aoAplicar: (mm: number | null) => void;
  /**
   * Se `true`, apagar o conteúdo aplica `null` — é o que permite tirar uma medida
   * de escritura digitada por engano. Se `false`, campo vazio é ignorado: uma
   * divisa sem comprimento não existe.
   */
  permitirVazio?: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

export function CampoEmMetros({
  valorMm,
  chave,
  aoAplicar,
  permitirVazio = false,
  ariaLabel,
  placeholder,
  className = 'w-20',
}: CampoEmMetrosProps) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const cancelando = useRef(false);
  const texto = valorMm === null ? '' : metrosDe(valorMm);

  function confirmar(digitado: string) {
    if (cancelando.current) {
      cancelando.current = false;
      setRascunho(null);
      return;
    }
    setRascunho(null);
    if (digitado.trim() === '') {
      if (permitirVazio) aoAplicar(null);
      return;
    }
    const metros = lerNumero(digitado);
    if (metros !== null && metros > 0) aoAplicar(Math.round(metros * 1000));
  }

  return (
    <input
      key={chave}
      type="text"
      inputMode="decimal"
      defaultValue={texto}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setRascunho(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelando.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={(e) => confirmar(rascunho ?? e.target.value)}
      className={`rounded-md border border-slate-300 px-2 py-1 text-sm font-normal text-slate-800 ${className}`}
    />
  );
}

interface CampoDeTextoProps {
  valor: string | null;
  chave: string;
  /** Recebe o texto aparado, ou `null` quando ficou vazio. */
  aoAplicar: (texto: string | null) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

export function CampoDeTexto({
  valor,
  chave,
  aoAplicar,
  ariaLabel,
  placeholder,
  className = 'w-full',
}: CampoDeTextoProps) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const cancelando = useRef(false);

  function confirmar(digitado: string) {
    if (cancelando.current) {
      cancelando.current = false;
      setRascunho(null);
      return;
    }
    setRascunho(null);
    const texto = digitado.trim();
    // Só aplica se MUDOU. Sem isto, sair do campo sem tocar em nada emitiria um
    // comando e sujaria o histórico de undo com passos que não fizeram nada.
    if (texto !== (valor ?? '')) aoAplicar(texto === '' ? null : texto);
  }

  return (
    <input
      key={chave}
      type="text"
      defaultValue={valor ?? ''}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setRascunho(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelando.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={(e) => confirmar(rascunho ?? e.target.value)}
      className={`rounded-md border border-slate-300 px-2 py-1 text-sm font-normal text-slate-800 ${className}`}
    />
  );
}
