/**
 * Catálogo do que a Planta Inteligente EXIBE (24/10/2026).
 *
 * Cada chave do menu Vista › Exibir era um `usePersistedState('blueprint:…')`: valia só naquele
 * navegador. Desligar "Grade" e "Eixos" num computador e abrir a planta em outro trazia tudo de
 * volta. Estas escolhas passam a ser preferências do USUÁRIO na tabela `preferencias`, com chave
 * `planta.exibir.<item>`; este arquivo é a LISTA ÚNICA delas — o hook do editor, a aba
 * Preferências e a migração do navegador leem daqui.
 *
 * Regras que moram aqui:
 *  - `item` = a chave antiga sem `blueprint:` e sem `:v2`; `chaveAntiga` guarda a original, para
 *    a migração do que a pessoa já escolheu;
 *  - `padrao` é EXATAMENTE o que o `usePersistedState` do editor usa hoje: sem nada gravado e sem
 *    nada no navegador, a planta abre igual;
 *  - item que aparece em mais de um menu (Eixos, Cotas das sub-regiões, Medidas do lote e da
 *    massa, Preenchimento do terreno, Curvas de nível) entra UMA vez, no grupo da planta;
 *  - valor fora do tipo ou fora das opções vale como "sem escolha" (`undefined`) — nunca lança,
 *    para um dado estranho no banco não deixar a planta em branco.
 *
 * Fora do catálogo (não são exibição): aba aberta, vista atual, pavimento, seções do painel
 * ("Camadas por disciplina"), `filtroDeFase`, `casasDaLegenda`, e as hipóteses de projeto.
 *
 * Puro: sem React, sem Supabase.
 */
import type { LinhaDePreferencia } from './resolver';

export type GrupoDeExibicao = 'PLANTA' | 'VISTAS' | '3D' | 'ESTILOS';

export type ValorDeExibicao = boolean | string | null;

export interface OpcaoDeExibicao {
  valor: string;
  rotulo: string;
}

export interface ItemDeExibicao {
  /** Ex.: 'mostrarGrade' — a chave antiga sem 'blueprint:' e sem ':v2'. */
  item: string;
  /** Ex.: 'blueprint:mostrarGrade' — a do `usePersistedState` de hoje. */
  chaveAntiga: string;
  /** O mesmo rótulo do menu Exibir. */
  rotulo: string;
  grupo: GrupoDeExibicao;
  /** 'automatico' = boolean | null (terreno 3D: null liga sozinho quando há curvas). */
  tipo: 'booleano' | 'opcao' | 'automatico';
  /** Só em 'opcao'. */
  opcoes?: readonly OpcaoDeExibicao[];
  padrao: ValorDeExibicao;
}

function bool(item: string, rotulo: string, grupo: GrupoDeExibicao, padrao: boolean): ItemDeExibicao {
  return { item, chaveAntiga: `blueprint:${item}`, rotulo, grupo, tipo: 'booleano', padrao };
}

// Opções copiadas de ESTILOS_DA_PLANTA / ESTILOS_3D / MODOS_DE_COR e dos seus rótulos
// (o teste confere que continuam iguais).
const OPCOES_ESTILO_PLANTA: readonly OpcaoDeExibicao[] = [
  { valor: 'TECNICA', rotulo: 'Técnica' },
  { valor: 'HUMANIZADA', rotulo: 'Humanizada' },
];
const OPCOES_ESTILO_3D: readonly OpcaoDeExibicao[] = [
  { valor: 'SOMBREADO', rotulo: 'Sombreado' },
  { valor: 'LINHA_OCULTA', rotulo: 'Linha oculta' },
  { valor: 'TRANSPARENTE', rotulo: 'Transparente' },
];
const OPCOES_MODO_DE_COR: readonly OpcaoDeExibicao[] = [
  { valor: 'NENHUM', rotulo: 'Sem cor (cinza)' },
  { valor: 'AMBIENTE', rotulo: 'Uma cor por ambiente' },
  { valor: 'TIPO_DE_AMBIENTE', rotulo: 'Tipo de ambiente (NBR 5410)' },
  { valor: 'UNIDADE', rotulo: 'Unidade' },
  { valor: 'USO', rotulo: 'Uso do programa' },
  { valor: 'PAVIMENTO', rotulo: 'Pavimento' },
  { valor: 'DEPARTAMENTO', rotulo: 'Departamento (setor)' },
];

/** A ORDEM do array é a ordem das linhas na tela (a do menu Exibir, grupo a grupo). */
export const ITENS_DE_EXIBICAO: readonly ItemDeExibicao[] = [
  // ── Planta baixa (menu Exibir da planta) ──────────────────────────────────────────────
  bool('mostrarMedidas', 'Medidas das paredes', 'PLANTA', false),
  bool('mostrarMedidasLoteMassa', 'Medidas do lote e da massa', 'PLANTA', true),
  bool('cotasSubRegioes', 'Cotas das sub-regiões', 'PLANTA', false),
  bool('mostrarCamadas', 'Camadas das paredes', 'PLANTA', false),
  bool('mostrarCotas', 'Cadeias de cota', 'PLANTA', false),
  bool('mostrarEixos', 'Eixos', 'PLANTA', true),
  bool('mostrarCotaInterna', 'Cota interna dos ambientes', 'PLANTA', false),
  bool('mostrarCircuitos', 'Circuito nos pontos', 'PLANTA', true),
  bool('mostrarRotulos', 'Nome, área, nível e etiquetas', 'PLANTA', false),
  bool('mostrarGrade', 'Grade', 'PLANTA', true),
  bool('mostrarPreenchimento', 'Preenchimento dos ambientes', 'PLANTA', true),
  bool('mostrarPreenchimentoTerreno', 'Preenchimento do terreno', 'PLANTA', true),
  bool('mostrarCurvasDeNivel', 'Curvas de nível', 'PLANTA', true),
  bool('mostrarDeclividade', 'Declividade', 'PLANTA', false),
  bool('mostrarHipsometria', 'Hipsométrico', 'PLANTA', false),
  bool('mostrarFeicoesDoLevantamento', 'Feições do levantamento', 'PLANTA', true),
  bool('nosDaGrade', 'Nós da grade', 'PLANTA', false),
  bool('mostrarTerraplenagem', 'Corte e aterro', 'PLANTA', true),
  bool('mostrarEnvelope', 'Envelope construtivo', 'PLANTA', true),
  bool('cotaAltoContraste', 'Cota em alto contraste', 'PLANTA', false),

  // ── Vistas (corte e elevação) ─────────────────────────────────────────────────────────
  bool('vistaCotasAltura', 'Cotas de altura', 'VISTAS', true),
  bool('vistaRegua', 'Régua e escala', 'VISTAS', true),
  bool('corteCotasDoTerreno', 'Cotas do terreno', 'VISTAS', true),
  bool('corteComprimentos', 'Comprimentos', 'VISTAS', true),
  bool('vistaRotulosEsquadria', 'Rótulos de esquadria', 'VISTAS', true),
  bool('vistaParedesInternas', 'Paredes internas', 'VISTAS', false),
  bool('vistaEstrutura', 'Estrutura', 'VISTAS', true),

  // ── 3D ────────────────────────────────────────────────────────────────────────────────
  bool('vista3dPisosELajes', 'Pisos e lajes', '3D', true),
  bool('vista3dArestas', 'Arestas', '3D', true),
  bool('vista3dRotulosDeRede', 'Diâmetros das redes', '3D', true),
  bool('vista3dArmadura', 'Armadura', '3D', false),
  {
    item: 'vista3dTerreno',
    chaveAntiga: 'blueprint:vista3dTerreno:v2',
    rotulo: 'Terreno',
    grupo: '3D',
    tipo: 'automatico',
    padrao: null,
  },
  bool('vista3dEnvelope', 'Envelope edificável', '3D', true),
  bool('vista3dMassa', 'Blocos de massa', '3D', true),

  // ── Estilos ───────────────────────────────────────────────────────────────────────────
  {
    item: 'estiloPlanta',
    chaveAntiga: 'blueprint:estiloPlanta',
    rotulo: 'Estilo da planta',
    grupo: 'ESTILOS',
    tipo: 'opcao',
    opcoes: OPCOES_ESTILO_PLANTA,
    padrao: 'TECNICA',
  },
  {
    item: 'vista3dEstilo',
    chaveAntiga: 'blueprint:vista3dEstilo',
    rotulo: 'Estilo do 3D',
    grupo: 'ESTILOS',
    tipo: 'opcao',
    opcoes: OPCOES_ESTILO_3D,
    padrao: 'SOMBREADO',
  },
  {
    item: 'modoDeCor',
    chaveAntiga: 'blueprint:modoDeCor',
    rotulo: 'Uma cor por ambiente',
    grupo: 'ESTILOS',
    tipo: 'opcao',
    opcoes: OPCOES_MODO_DE_COR,
    // Hoje: `coresPorAmbiente ? 'AMBIENTE' : 'NENHUM'`, e `coresPorAmbiente` nasce `false`.
    padrao: 'NENHUM',
  },
];

const POR_ITEM: ReadonlyMap<string, ItemDeExibicao> = new Map(ITENS_DE_EXIBICAO.map((i) => [i.item, i]));

/** Chave gravada no banco: `planta.exibir.<item>`. */
export function chaveDeExibicao(item: string): string {
  return `planta.exibir.${item}`;
}

/** O valor cabe no tipo (e nas opções) do item? `null` só vale no 'automatico'. */
function valorValido(def: ItemDeExibicao, valor: unknown): valor is ValorDeExibicao {
  switch (def.tipo) {
    case 'booleano':
      return typeof valor === 'boolean';
    case 'automatico':
      return typeof valor === 'boolean' || valor === null;
    case 'opcao':
      return typeof valor === 'string' && (def.opcoes ?? []).some((o) => o.valor === valor);
  }
}

/** Linha válida do USUARIO para o item; havendo repetida, vale a última. */
function valorDoUsuario(linhas: readonly LinhaDePreferencia[], def: ItemDeExibicao): ValorDeExibicao | undefined {
  if (!Array.isArray(linhas)) return undefined;
  const chave = chaveDeExibicao(def.item);
  let achado: ValorDeExibicao | undefined;
  for (const l of linhas) {
    if (l && l.escopo === 'USUARIO' && l.chave === chave && valorValido(def, l.valor)) achado = l.valor;
  }
  return achado;
}

/**
 * O que o usuário escolheu para o item. `undefined` = sem escolha válida (sem linha, valor de
 * outro tipo, opção fora de `opcoes`, item que não existe) → quem chama usa o padrão.
 * `null` só no item 'automatico' com `null` gravado (= automático, escolha explícita).
 */
export function valorDeExibicao(linhas: readonly LinhaDePreferencia[], item: string): ValorDeExibicao | undefined {
  const def = POR_ITEM.get(item);
  return def ? valorDoUsuario(linhas, def) : undefined;
}

/**
 * Migração única do navegador: para cada item SEM escolha válida no banco e COM valor válido no
 * navegador, uma linha para gravar. `lerDoNavegador` recebe a chave antiga e devolve o JSON já
 * parseado (ou `undefined`). Não devolve nada para o que já está no banco (a escolha do banco
 * nunca é sobrescrita) nem para `null` (ausente e "automático" se confundem na leitura, e
 * automático já é o padrão). Leitura do navegador que lança vale como "sem valor".
 */
export function linhasParaMigrar(
  linhasDoUsuario: readonly LinhaDePreferencia[],
  lerDoNavegador: (chaveAntiga: string) => unknown,
): { chave: string; valor: boolean | string | null }[] {
  const saida: { chave: string; valor: boolean | string | null }[] = [];
  for (const def of ITENS_DE_EXIBICAO) {
    if (valorDoUsuario(linhasDoUsuario, def) !== undefined) continue;
    let doNavegador: unknown;
    try {
      doNavegador = lerDoNavegador(def.chaveAntiga);
    } catch {
      continue;
    }
    if (doNavegador === null || !valorValido(def, doNavegador)) continue;
    saida.push({ chave: chaveDeExibicao(def.item), valor: doNavegador });
  }
  return saida;
}
