// utils/blueprintItemPorMedida.ts
//
// ACHAR O ITEM DE CATÁLOGO PELA MEDIDA DA ESQUADRIA (P2.53, 24/09/2026).
//
// ─── O ÚLTIMO PASSO ATÉ O PREÇO ─────────────────────────────────────────────
//
// Depois da P2.49 (nomear) e da P2.50 (unificar), a planta real tem 29 tipos de
// esquadria nomeados e **zero com item de catálogo** — e sem item o orçamento
// levanta a divergência, mas não tem preço para pôr na linha. Escolher à mão são
// 29 idas ao catálogo, cada uma com uma busca cujo termo a pessoa precisa
// inventar ("porta 80 210 madeira"?).
//
// Só que o SINAPI já diz a medida no nome do item:
//
//     KIT PORTA PRONTA DE MADEIRA, FOLHA MEDIA (NBR 15930) DE 800 X 2100 MM…
//     KIT DE PORTA DE MADEIRA PARA PINTURA, SEMI-OCA…, 80X210CM, ESPESSURA…
//     PORTA SALA LIMPA 90X210 CM COM VISOR…
//     PROTECAO COMPLETA PARA PORTA DE POCO DE ELEVADOR, VAO DE *120 X 240* CM
//
// São 390 itens de porta e 89 de janela com medida no texto. Este módulo lê essa
// medida e casa com a do desenho.
//
// ⚠️ SUGESTÃO, NUNCA APLICAÇÃO. O que sai daqui entra no rascunho da gaveta,
// para a pessoa conferir e aplicar. "Porta 80×210" casa com dezenas de itens —
// madeira, alumínio, corta-fogo, sala limpa — e a diferença entre eles é preço,
// não medida. Escolher por conta própria seria orçar a obra no escuro.
//
// ─── CENTÍMETRO OU MILÍMETRO ────────────────────────────────────────────────
//
// O sufixo manda, quando existe (`MM` ou `CM`). Sem sufixo, decide a ordem de
// grandeza: esquadria de 400 mm não existe (nem porta nem janela cabem nisso),
// então `80X210` é centímetro e `800 X 2100` é milímetro. O corte em 400 vale
// para os dois lados da medida, e é conservador: na dúvida o item simplesmente
// não casa, e ninguém sugere nada.

/** Acima disto, um número solto na descrição é milímetro; abaixo, centímetro. */
const CORTE_CM_MM = 400;

/** Quanto a medida do item pode diferir da do desenho, em mm. */
export const TOLERANCIA_DO_ITEM_MM = 20;

export interface MedidaDoItem {
  larguraMm: number;
  alturaMm: number;
}

/**
 * As medidas "L × A" que aparecem no texto de um item de catálogo.
 *
 * Devolve todas — um item pode citar mais de um par (o vão e a folha, por
 * exemplo), e casar com qualquer um deles é suficiente para sugerir.
 */
export function medidasNaDescricao(texto: string): MedidaDoItem[] {
  const saida: MedidaDoItem[] = [];
  // `120 X 240`, `80X210`, `0,80 X 2,10` — com ou sem espaço, vírgula decimal, e
  // um sufixo de unidade que pode vir colado (`80X210CM`) ou depois de `*`.
  const padrao = /(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*\*?\s*(MM|CM|M)?\b/g;
  for (const m of texto.matchAll(padrao)) {
    const bruto = [m[1], m[2]].map((v) => Number(v.replace(',', '.')));
    if (bruto.some((v) => !Number.isFinite(v) || v <= 0)) continue;
    const sufixo = (m[3] ?? '').toUpperCase();
    let fator: number;
    if (sufixo === 'MM') fator = 1;
    else if (sufixo === 'CM') fator = 10;
    else if (sufixo === 'M') fator = 1000;
    // Sem sufixo: a ordem de grandeza decide. Um par com decimal (`0,80 X 2,10`)
    // só pode ser metro — não existe esquadria de 0,8 mm nem de 0,8 cm.
    else if (bruto.some((v) => !Number.isInteger(v))) fator = 1000;
    else fator = bruto.every((v) => v < CORTE_CM_MM) ? 10 : 1;
    const [larguraMm, alturaMm] = bruto.map((v) => Math.round(v * fator));
    // Descarta o que não pode ser esquadria: pega números de norma ("NBR 15930")
    // e espessuras que por acaso caíram no padrão.
    if (larguraMm < 200 || alturaMm < 200 || larguraMm > 10000 || alturaMm > 10000) continue;
    saida.push({ larguraMm, alturaMm });
  }
  return saida;
}

export interface ItemDeCatalogo {
  code: string;
  description: string;
  unit?: string;
}

export interface SugestaoDeItem {
  item: ItemDeCatalogo;
  /** Quanto a medida do item se afasta da do desenho, em mm (soma L + A). */
  desvioMm: number;
}

/** O texto do item fala deste tipo de esquadria? */
function ehDoTipo(texto: string, tipo: 'door' | 'window' | 'sliding'): boolean {
  const t = texto.toUpperCase();
  if (tipo === 'window') return t.includes('JANELA') || t.includes('BASCULANTE') || t.includes('MAXIM-AR');
  // Porta de correr aceita o item de porta comum: o SINAPI raramente separa, e
  // quem escolhe vê a descrição inteira antes de aplicar.
  return t.includes('PORTA') || t.includes('PORTAO');
}

/**
 * Os itens do catálogo que servem a uma esquadria desta medida, do mais
 * próximo ao mais distante.
 *
 * `limite` corta a lista: a tela mostra a melhor e guarda as outras para quem
 * quiser trocar sem abrir o catálogo inteiro.
 */
export function sugerirItens(
  medida: MedidaDoItem,
  tipo: 'door' | 'window' | 'sliding',
  itens: readonly ItemDeCatalogo[],
  toleranciaMm = TOLERANCIA_DO_ITEM_MM,
  limite = 5,
): SugestaoDeItem[] {
  const saida: SugestaoDeItem[] = [];
  for (const item of itens) {
    if (!ehDoTipo(item.description, tipo)) continue;
    let melhor = Infinity;
    for (const m of medidasNaDescricao(item.description)) {
      const dl = Math.abs(m.larguraMm - medida.larguraMm);
      const da = Math.abs(m.alturaMm - medida.alturaMm);
      if (dl > toleranciaMm || da > toleranciaMm) continue;
      melhor = Math.min(melhor, dl + da);
    }
    if (melhor !== Infinity) saida.push({ item, desvioMm: melhor });
  }
  // Empate pelo CÓDIGO, para a mesma planta sugerir sempre o mesmo item: uma
  // sugestão que muda de um carregamento para o outro não se confere.
  saida.sort((a, b) => a.desvioMm - b.desvioMm || a.item.code.localeCompare(b.item.code));
  return saida.slice(0, limite);
}
