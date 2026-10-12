/**
 * CAPTURA DA IMAGEM DO 3D (12/10/2026 — F13 do plano `2026-10-11-planta-recursos-video-synaps.md`): o PNG
 * do que a câmera vê, na resolução escolhida. É a entrada do render por IA (F14).
 *
 * ─── POR QUE NÃO `canvas.toBlob()` DA TELA ──────────────────────────────────
 *
 * O canvas WebGL da tela é criado sem `preserveDrawingBuffer` (deixá-lo ligado custa desempenho em todo
 * quadro): lido fora do quadro, ele vem PRETO. E a resolução seria a da janela. A captura desenha a cena
 * de novo num alvo fora da tela (`WebGLRenderTarget`, com MSAA) do tamanho pedido e lê os pixels de lá —
 * o viewer faz isso; aqui moram as contas que dá para testar sem WebGL.
 */

export const RESOLUCOES_DA_CAPTURA = [
  { id: 'HD', rotulo: 'HD 1920 × 1080', largura: 1920, altura: 1080 },
  { id: 'QHD', rotulo: 'QHD 2560 × 1440', largura: 2560, altura: 1440 },
  { id: '4K', rotulo: '4K 3840 × 2160', largura: 3840, altura: 2160 },
] as const;
export type ResolucaoDaCaptura = (typeof RESOLUCOES_DA_CAPTURA)[number]['id'];

/** O tamanho que a placa de vídeo aceita: o pedido, reduzido na MESMA proporção quando passa do limite dela. */
export function dimensoesDaCaptura(largura: number, altura: number, maximoPx: number): { largura: number; altura: number; reduzida: boolean } {
  const fator = Math.min(1, maximoPx / largura, maximoPx / altura);
  if (fator >= 1) return { largura, altura, reduzida: false };
  return { largura: Math.floor(largura * fator), altura: Math.floor(altura * fator), reduzida: true };
}

/** O WebGL lê de BAIXO para cima; a imagem é de cima para baixo. Devolve uma cópia com as linhas invertidas. */
export function inverterLinhas(px: Uint8Array | Uint8ClampedArray, largura: number, altura: number): Uint8ClampedArray {
  const linha = largura * 4;
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < altura; y++) out.set(px.subarray((altura - 1 - y) * linha, (altura - y) * linha), y * linha);
  return out;
}

/**
 * A fração de pixels que NÃO são preto puro nem transparentes (amostrando até ~10 mil). A captura confere
 * a si mesma: abaixo de 1 %, ela saiu vazia — melhor recusar com o motivo do que baixar um PNG preto.
 */
export function fracaoComConteudo(px: Uint8Array | Uint8ClampedArray): number {
  const n = px.length / 4;
  if (!n) return 0;
  const passo = Math.max(1, Math.floor(n / 10_000));
  let total = 0;
  let com = 0;
  for (let i = 0; i < n; i += passo) {
    total++;
    const k = i * 4;
    if (px[k + 3] > 0 && px[k] + px[k + 1] + px[k + 2] > 0) com++;
  }
  return com / total;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'planta';

/** "planta-11-10-2026--sala-da-varanda--2026-10-12.png" — estudo, vista e dia. */
export function nomeDaCaptura(estudo: string, vista: string | null, data: Date): string {
  const dia = data.toISOString().slice(0, 10);
  return `${slug(estudo)}--${slug(vista ?? '3d')}--${dia}.png`;
}
