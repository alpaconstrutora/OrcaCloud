import type { Portal, TourId } from './portalHelpDefaults';

/**
 * Tour guiado dos portais externos — "já viu" por aparelho.
 *
 * No link não há pessoa (o token é da empresa), então a marca fica no
 * localStorage por portal + identidade (token ou e-mail). Logado por e-mail,
 * trocar de aparelho repete o tour uma vez — aceito nesta entrega (F4, se
 * pedirem, guarda por e-mail em tabela).
 *
 * O tour geral mantém a chave sem sufixo (quem já viu antes do mini-tour por
 * aba existir não revê); cada aba ganha `:<aba>`.
 */
export const chaveDoTour = (portal: Portal, id: string, tourId: TourId = 'geral') =>
  tourId === 'geral' ? `portalHelp:tour:${portal}:${id}` : `portalHelp:tour:${portal}:${id}:${tourId}`;

export function tourVisto(chave: string): boolean {
  try { return !!localStorage.getItem(chave); } catch { return true; }
}

export function marcarTourVisto(chave: string, motivo: 'concluido' | 'pulado'): void {
  try { localStorage.setItem(chave, `${motivo}@${new Date().toISOString()}`); } catch { /* sem storage: não insiste */ }
}

export function esquecerTour(chave: string): void {
  try { localStorage.removeItem(chave); } catch { /* idem */ }
}

/** Elemento visível (com área) que carrega `data-tour="<anchor>"`; o primeiro que aparecer. */
export function elementoDaAncora(anchor: string, raiz: ParentNode = document): HTMLElement | null {
  const todos = raiz.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`);
  for (const el of Array.from(todos)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export interface Caixa { top: number; left: number; width: number; height: number }

/**
 * Onde pôr o popover em relação à caixa realçada: à direita se couber, senão
 * abaixo, senão acima; sempre dentro da janela. Pura, para teste.
 */
export function posicaoDoPopover(
  alvo: Caixa,
  popover: { width: number; height: number },
  janela: { width: number; height: number },
  margem = 16,
): { top: number; left: number; lado: 'direita' | 'abaixo' | 'acima' } {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  if (alvo.left + alvo.width + margem + popover.width <= janela.width - margem) {
    return { lado: 'direita', left: alvo.left + alvo.width + margem, top: clamp(alvo.top, margem, janela.height - popover.height - margem) };
  }
  const left = clamp(alvo.left, margem, janela.width - popover.width - margem);
  if (alvo.top + alvo.height + margem + popover.height <= janela.height - margem) {
    return { lado: 'abaixo', left, top: alvo.top + alvo.height + margem };
  }
  return { lado: 'acima', left, top: clamp(alvo.top - margem - popover.height, margem, janela.height - popover.height - margem) };
}
