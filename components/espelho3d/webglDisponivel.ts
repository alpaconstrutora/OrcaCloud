/**
 * O navegador desenha 3D? Sem WebGL (máquina sem aceleração, navegador antigo, modo de economia), o Espelho de
 * Vendas 3D mostra só a lista por andar — nunca uma área em branco.
 */
export function webglDisponivel(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const tela = document.createElement('canvas');
    return !!(tela.getContext('webgl2') || tela.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A pessoa pediu menos movimento ao sistema: a câmera não desliza nem tem inércia. */
export const reduzMovimento = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
