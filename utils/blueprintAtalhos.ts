/**
 * ATALHOS DE FERRAMENTA (F1 do plano `2026-10-11-planta-recursos-video-synaps.md`).
 *
 * Uma letra arma a ferramenta, como em todo CAD: W parede, P porta, J janela.
 * O pedido veio do vídeo do Synaps.app, onde o desenho anda sem tirar a mão do
 * teclado — e quem chega de AutoCAD/Revit já desenha assim.
 *
 * ─── O QUE FICA DE FORA, E POR QUÊ ──────────────────────────────────────────
 *
 * - **Teclas com Ctrl/Cmd/Alt/Shift.** Ctrl+Z/D/A/C/V já têm dono, e Shift é a
 *   trava ortogonal enquanto se desenha. Letra com modificador nunca é atalho
 *   de ferramenta.
 * - **Campo de texto com foco.** Digitar "Sala" no nome do ambiente não pode
 *   armar a ferramenta Selecionar no "a" — nem nenhuma outra letra.
 * - **Tecla repetida** (segurar a tecla): arma uma vez só.
 * - **Fora da planta.** O passeio 3D anda com W/A/S/D (`utils/blueprint3dWalk.ts`)
 *   escutando a janela inteira; quem filtra a vista é o chamador, que sabe qual
 *   está aberta. Aqui fica só a regra da tecla.
 *
 * A letra escolhe o PAR (ferramenta, subtipo) — P e J são a mesma ferramenta
 * `abertura` com subtipos diferentes —, no mesmo formato da `EscolhaComponente`
 * do menu, para o atalho passar pelo mesmo `escolherComponente` que o clique.
 */

/** Ferramenta sem subtipo, armada direto (`editor.setTool`). */
export type FerramentaSimples = { tool: 'selecionar' | 'mover' | 'medir-linha' | 'ambiente' | 'separador' };
/** Mesmo formato da `EscolhaComponente` do menu — passa por `escolherComponente`. */
export type EscolhaDoAtalho = { tool: 'parede' | 'retangulo' } | { tool: 'abertura'; abertura: 'door' | 'window' };

export type AlvoDoAtalho = FerramentaSimples | EscolhaDoAtalho;

/** Ferramenta sem subtipo (arma direto) × par do menu (passa por `escolherComponente`). */
export function ehFerramentaSimples(alvo: AlvoDoAtalho): alvo is FerramentaSimples {
  return (
    alvo.tool === 'selecionar' ||
    alvo.tool === 'mover' ||
    alvo.tool === 'medir-linha' ||
    alvo.tool === 'ambiente' ||
    alvo.tool === 'separador'
  );
}

/** Letra minúscula → ferramenta. Uma letra, um alvo. */
export const ATALHOS_DE_FERRAMENTA: Readonly<Record<string, AlvoDoAtalho>> = {
  v: { tool: 'selecionar' },
  h: { tool: 'mover' },
  w: { tool: 'parede' },
  r: { tool: 'retangulo' },
  p: { tool: 'abertura', abertura: 'door' },
  j: { tool: 'abertura', abertura: 'window' },
  m: { tool: 'medir-linha' },
  a: { tool: 'ambiente' },
  s: { tool: 'separador' },
};

/** O mínimo do `KeyboardEvent` que a regra lê — testável sem DOM. */
export interface TeclaPressionada {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

/** O mínimo do alvo do evento: onde o foco estava quando a tecla desceu. */
export interface AlvoDaTecla {
  tagName?: string;
  isContentEditable?: boolean;
}

function ehCampoDeTexto(alvo: AlvoDaTecla | null | undefined): boolean {
  if (!alvo) return false;
  if (alvo.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName ?? '');
}

/** A ferramenta que a tecla arma, ou `null` quando a tecla não é atalho aqui. */
export function alvoDoAtalho(tecla: TeclaPressionada, alvo?: AlvoDaTecla | null): AlvoDoAtalho | null {
  if (tecla.ctrlKey || tecla.metaKey || tecla.altKey || tecla.shiftKey) return null;
  if (tecla.repeat) return null;
  if (ehCampoDeTexto(alvo)) return null;
  if (tecla.key.length !== 1) return null;
  return ATALHOS_DE_FERRAMENTA[tecla.key.toLowerCase()] ?? null;
}

/** A letra (maiúscula) que arma este alvo, para mostrar no menu e no tooltip. */
export function letraDoAtalho(alvo: { tool: string; abertura?: string }): string | null {
  for (const [letra, a] of Object.entries(ATALHOS_DE_FERRAMENTA)) {
    if (a.tool !== alvo.tool) continue;
    if ('abertura' in a && a.abertura !== alvo.abertura) continue;
    return letra.toUpperCase();
  }
  return null;
}
