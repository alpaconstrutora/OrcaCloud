import { useCallback, useEffect, useState } from 'react';

/**
 * MODO TELA CHEIA de um editor — a mesma mecânica que nasceu na Planta
 * Inteligente (`BlueprintEditor.tsx`, 14/09/2026, pedido *"Modo tela cheia"*)
 * e que Engenharia › Planejamento pediu igual em 19/09/2026 (*"implementar
 * botão de tela cheia, da mesma forma que implementado em incorporação <
 * planta inteligente"*). Extraída para cá para os dois editores não
 * divergirem no detalhe que importa (sair por Esc do navegador).
 *
 * Dois níveis, um sobre o outro:
 * 1. `telaCheia` — estado INTERNO. Quem usa põe `fixed inset-0 z-40` na
 *    raiz do editor (z-40: abaixo dos Sheets em z-50, do confirm em 200 e
 *    dos toasts em 300; acima da sidebar z-20 e do topo z-30 do shell), e
 *    o shell do ÒPURA some atrás dele.
 * 2. Fullscreen do navegador — quando ele deixa. Sair por Esc/F11 dispara
 *    `fullscreenchange`, e o estado interno acompanha; senão o shell voltaria
 *    a aparecer atrás de um editor que ainda se acha em tela cheia.
 *
 * Estado de SESSÃO, não preferência persistida: reabrir a tela já em tela
 * cheia esconderia o shell sem o usuário ter pedido desta vez.
 *
 * Se `requestFullscreen` nem chega a entrar (iframe, permissão negada), não
 * há evento e o modo interno segue valendo sozinho — que é o que o botão
 * promete.
 *
 * Tela cheia aqui é EXPRESSAMENTE pedida e é um modo de um editor, não o
 * layout de um painel — ver a regra de nunca usar tela cheia para painéis.
 */
export function useTelaCheia(): { telaCheia: boolean; alternarTelaCheia: () => void } {
  const [telaCheia, setTelaCheia] = useState(false);

  const alternarTelaCheia = useCallback(() => {
    setTelaCheia((v) => {
      const proximo = !v;
      const doc = typeof document !== 'undefined' ? document : null;
      if (proximo) {
        void doc?.documentElement.requestFullscreen?.().catch(() => undefined);
      } else if (doc?.fullscreenElement) {
        void doc.exitFullscreen?.().catch(() => undefined);
      }
      return proximo;
    });
  }, []);

  useEffect(() => {
    if (!telaCheia || typeof document === 'undefined') return;
    // Só reage à SAÍDA feita pelo navegador.
    const aoMudar = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, [telaCheia]);

  return { telaCheia, alternarTelaCheia };
}
