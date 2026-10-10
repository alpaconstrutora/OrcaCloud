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

/**
 * Lê um INTEIRO escrito à brasileira: o ponto é separador de milhar ("24.000"
 * = 24000), a vírgula é decimal (arredonda). `null` se não for número.
 */
export function lerInteiro(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? Math.round(valor) : null;
}

interface CampoInteiroProps {
  /** Valor atual. `null` deixa o campo vazio (o placeholder diz o que vale). */
  valor: number | null;
  /** Remonta o campo quando o valor muda por fora (troca de peça). */
  chave: string;
  /** Recebe o inteiro (> 0), ou `null` quando o campo foi esvaziado. */
  aoAplicar: (valor: number | null) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/**
 * Inteiro grande (capacidade em BTU/h, vazão em m³/h) que aplica no Enter e no
 * blur e desiste no Escape — como os outros campos deste arquivo. Mostra o número
 * com o separador de milhar ("24.000"), para um zero a mais saltar à vista; e
 * aplica UMA vez, ao terminar — digitar "24000" não grava 2, 24, 240… nem empilha
 * cinco passos de Ctrl+Z (10/10/2026: o campo gravava a cada tecla).
 */
export function CampoInteiro({ valor, chave, aoAplicar, ariaLabel, placeholder, className = 'w-full' }: CampoInteiroProps) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const cancelando = useRef(false);
  const texto = valor == null ? '' : valor.toLocaleString('pt-BR');

  function confirmar(digitado: string) {
    if (cancelando.current) {
      cancelando.current = false;
      setRascunho(null);
      return;
    }
    setRascunho(null);
    if (digitado.trim() === '') {
      if (valor != null) aoAplicar(null);
      return;
    }
    const lido = lerInteiro(digitado);
    if (lido !== null && lido > 0 && lido !== valor) aoAplicar(lido);
  }

  return (
    <input
      key={`${chave}|${valor ?? ''}`}
      type="text"
      inputMode="numeric"
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
      className={`rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums text-slate-800 ${className}`}
    />
  );
}
