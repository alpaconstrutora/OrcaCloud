/**
 * Leitura de valor do Mapa Regulatório — TEXT livre, em formato BR, para número.
 *
 * ─── POR QUE ISTO É UM ARQUIVO ──────────────────────────────────────────────
 *
 * As colunas de `regulatory_map_zones` / `empreendimento_regulatory_zones` são
 * TEXT de propósito: quem digita é o usuário lendo a lei do município, e a lei
 * diz "N.A.", "0,8", "3,00 m", "conforme art. 42". A DDL registra a escolha
 * (`20270218000001`).
 *
 * O preço disso é que TODO consumidor precisa converter, e a conversão já
 * existia CINCO vezes quando este arquivo nasceu:
 *
 *   • `services/sync/regulatoryAdapter.ts`  (`regNum` — a origem deste código)
 *   • `components/ImovibBlocksTypologyTab.tsx`  (`parseRegVal`)
 *   • `components/ImovibCapexForm.tsx`          (`parseRegVal`, cópia)
 *   • `components/ImovibStaticViability.tsx`    (`parseRegVal`, cópia)
 *   • `components/RegulatoryZoneTable.tsx`      (`parseNumeric`, só ordenação)
 *
 * ⚠️ E elas DIVERGEM em coisas que mudam resultado. As três do Imovib terminam
 * em `|| null`, então **`"0"` vira `null`**: um recuo de zero — perfeitamente
 * legal e comum em zona comercial de esquina — fica indistinguível de campo
 * vazio. Só a de `regulatoryAdapter` acerta esse caso, e é por isso que é ela
 * que virou este módulo.
 */

/**
 * Grafias de "não se aplica" vistas nas planilhas de prefeitura.
 *
 * Comparadas em minúsculas e sem espaço: a versão anterior testava `v === 'N.A.'`
 * exato e deixava passar `n.a.`, que o Excel de Cambuí/MG traz.
 */
const NAO_SE_APLICA = new Set(['n.a.', 'n.a', 'na', 'n/a', '-', '–', '—', '_']);

/**
 * Sufixos de unidade que podem acompanhar o número sem mudar o que ele é.
 * `"3,00 m"` é três metros; `"70%"` é setenta por cento.
 */
const SUFIXO_DE_UNIDADE = /\s*(m²|m2|m|%)\s*$/i;

/**
 * Número de um campo do Mapa Regulatório. `null` quando não há número.
 *
 * ⚠️ **Rejeita o que não é número INTEIRAMENTE, em vez de aproveitar o começo.**
 * `parseFloat("5 a 7")` devolve `5` calado, e `parseFloat("conforme art. 42")`
 * devolve `NaN` — mas `parseFloat("42 dias")` devolveria `42`. Um recuo "de 5 a
 * 7 metros" virar `5` é pior do que virar nada: nada aparece como campo não
 * aplicado, e `5` entra no desenho como se alguém tivesse conferido.
 *
 * `"0"` devolve `0`, não `null` — ver o cabeçalho do arquivo.
 */
export function lerValorRegulatorio(valor?: string | null): number | null {
  if (valor === null || valor === undefined) return null;

  const limpo = valor.trim();
  if (limpo === '') return null;
  if (NAO_SE_APLICA.has(limpo.toLowerCase())) return null;

  // Tira a unidade, troca a vírgula decimal e separador de milhar do BR.
  const semUnidade = limpo.replace(SUFIXO_DE_UNIDADE, '');
  const normalizado = semUnidade.replace(/\./g, '').replace(',', '.');

  // A string INTEIRA tem de ser o número. É esta âncora que separa "3,00 m" de
  // "5 a 7" — `parseFloat` aceitaria os dois.
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalizado)) return null;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * Campo de taxa, SEMPRE devolvido em porcentagem (80 = 80 %).
 *
 * ─── A AMBIGUIDADE É DA BASE, NÃO DESTA FUNÇÃO ──────────────────────────────
 *
 * O mesmo campo chega gravado das duas formas, e isso é anterior a este código:
 *
 *   • `ZONE_SELECT_OPTIONS.taxa_ocupacao_maxima` (`RegulatoryZoneTable.tsx`)
 *     oferece `'0,7'`, `'0,75'`, `'0,8'`, `'0,9'` — FRAÇÃO.
 *   • A importação de planilha traz o que a prefeitura publicou, normalmente
 *     `70`, `80` — PORCENTAGEM.
 *   • `plantaAiEngine.ts` faz `occupancy_rate / 100` (lê como %), enquanto o
 *     `Indicador` do painel de terreno compara `taxaOcupacao * 100` (espera %).
 *
 * A regra abaixo é a única que não erra na prática: **valor até 1 é fração**.
 * Não existe zona urbana com taxa de ocupação de 0,8 % nem de permeabilidade de
 * 0,9 % — o menor valor real que se vê é da ordem de 5 %.
 *
 * O caso de fronteira `1` entra como fração e vira **100 %**: "taxa de ocupação
 * 1,0" é como a lei escreve lote inteiro, e existe de verdade em zona comercial
 * de centro. A leitura alternativa — 1 % — seria absurda em qualquer zona.
 */
export function lerPorcentagem(valor?: string | null): number | null {
  const n = lerValorRegulatorio(valor);
  if (n === null) return null;
  if (n < 0) return null;
  return n <= 1 ? n * 100 : n;
}

/** Metro do campo regulatório para o milímetro inteiro do kernel. */
export function lerMilimetros(valor?: string | null): number | null {
  const metros = lerValorRegulatorio(valor);
  if (metros === null || metros < 0) return null;
  return Math.round(metros * 1000);
}
