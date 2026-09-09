import { useEffect, useRef } from 'react';

/**
 * A roda do mouse sobre um canvas de desenho: zoom, e SÓ zoom.
 *
 * ─── O DEFEITO QUE ISTO CORRIGE (09/09/2026, achado no uso) ─────────────────
 *
 * Rolar a roda sobre a planta dava zoom **e rolava a página junto** — o desenho
 * aproximava e a tela subia ou descia ao mesmo tempo. Os dois tratadores de roda
 * do módulo (`BlueprintCanvas` e `useCanvasVista`) calculavam a escala e nunca
 * chamavam `preventDefault`, então o evento seguia para o ancestral rolável e
 * fazia o que a roda faz numa página: rolar.
 *
 * ─── ⚠️ E POR QUE ISTO É UM HOOK, E NÃO UMA LINHA `e.preventDefault()` ──────
 *
 * Porque a linha óbvia **não funciona** e parece funcionar. Desde o React 17, os
 * eventos `wheel`, `touchstart` e `touchmove` são registrados no contêiner raiz
 * como **PASSIVOS**; um listener passivo declara ao navegador que não vai
 * cancelar nada, e o navegador ignora o `preventDefault` — rola a página do mesmo
 * jeito, com um aviso no console e mais nada.
 *
 * (O jsdom HONRA `passive` — medido em 09/09/2026, injetando `passive: true`
 * neste arquivo: o `defaultPrevented` foi a falso. Então o teste comportamental
 * também pega o defeito, e não só o que afirma a opção. Eu supus o contrário
 * antes de medir.)
 *
 * A saída é um listener NATIVO no próprio elemento, com `passive: false`
 * explícito, que é o que dá ao `preventDefault` autoridade real.
 *
 * ⚠️ Cancela SEMPRE, inclusive com Ctrl pressionado — Ctrl+roda é zoom do
 * navegador, e sobre uma planta em escala isso é ainda menos desejado que a
 * rolagem: mudaria o tamanho da interface inteira no meio de uma medição.
 */
export function useRodaNaoPassiva<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  aoRolar: (e: WheelEvent) => void,
): void {
  // O tratador vive numa ref para o listener ser registrado UMA vez. Sem isto
  // ele seria removido e recriado a cada render — e `aoRolar` fecha sobre a
  // vista, que muda a cada zoom, ou seja: a cada rolagem.
  const ultimo = useRef(aoRolar);
  useEffect(() => {
    ultimo.current = aoRolar;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tratar = (e: WheelEvent) => {
      e.preventDefault();
      ultimo.current(e);
    };
    el.addEventListener('wheel', tratar, { passive: false });
    return () => el.removeEventListener('wheel', tratar);
  }, [ref]);
}
