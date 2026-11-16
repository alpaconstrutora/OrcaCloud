import type { Portal, TourId } from './portalHelpDefaults';
import { sha256 } from './blueprintKernel/hash';

/**
 * Tour guiado dos portais externos — "já viu" por aparelho.
 *
 * No link não há pessoa (o token é da empresa), então a marca fica no
 * localStorage por portal + identidade (token ou e-mail). Logado por e-mail,
 * trocar de aparelho repete o tour uma vez — aceito nesta entrega (F4, se
 * pedirem, guarda por e-mail em tabela).
 *
 * ⚠️ A identidade entra na chave como SHA-256, nunca crua: o token do link é a
 * credencial do portal (`/portal-*?token=` abre sem senha) e o localStorage não
 * é limpo no "Sair". O hash continua separando portal + pessoa, mas não devolve
 * o token. Marcas antigas (token cru na chave) migram em `migrarMarcasAntigas`.
 *
 * O tour geral mantém a chave sem sufixo (quem já viu antes do mini-tour por
 * aba existir não revê); cada aba ganha `:<aba>`.
 */
const PREFIXO = 'portalHelp:tourv2:';
/** formato anterior: `portalHelp:tour:<portal>:<token ou e-mail>[:<tour>]` */
const PREFIXO_ANTIGO = 'portalHelp:tour:';

const idDaChave = (id: string) => sha256(`portalHelp:tour:${id}`);

export const chaveDoTour = (portal: Portal, id: string, tourId: TourId = 'geral') =>
  tourId === 'geral' ? `${PREFIXO}${portal}:${idDaChave(id)}` : `${PREFIXO}${portal}:${idDaChave(id)}:${tourId}`;

/**
 * Regrava cada marca no formato antigo (token cru no nome da chave) no formato
 * novo, com o mesmo valor — quem já viu o tour não revê — e apaga a antiga.
 * Varre TODAS as identidades do aparelho, não só a atual: a de quem usou o
 * aparelho antes e não volta mais é justamente a que ficaria exposta.
 */
export function migrarMarcasAntigas(): void {
  const antigas: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO_ANTIGO)) antigas.push(k);
    }
  } catch { return; /* sem storage: nada a migrar */ }
  for (const antiga of antigas) {
    try {
      const valor = localStorage.getItem(antiga);
      localStorage.removeItem(antiga);
      const m = /^([^:]+):([^:]+)(?::(.+))?$/.exec(antiga.slice(PREFIXO_ANTIGO.length));
      if (!m || !valor) continue;
      const nova = chaveDoTour(m[1] as Portal, m[2], m[3] ?? 'geral');
      if (!localStorage.getItem(nova)) localStorage.setItem(nova, valor);
    } catch { /* idem: segue para a próxima */ }
  }
}

let migrou = false;
const garantirMigracao = () => {
  if (migrou) return;
  migrou = true;
  migrarMarcasAntigas();
};

export function tourVisto(chave: string): boolean {
  garantirMigracao();
  try { return !!localStorage.getItem(chave); } catch { return true; }
}

export function marcarTourVisto(chave: string, motivo: 'concluido' | 'pulado'): void {
  garantirMigracao();
  try { localStorage.setItem(chave, `${motivo}@${new Date().toISOString()}`); } catch { /* sem storage: não insiste */ }
}

export function esquecerTour(chave: string): void {
  garantirMigracao();
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
