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

/** Como o "automático" (null no editor) é guardado no banco. */
export const AUTOMATICO_NO_BANCO = 'AUTOMATICO';

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
  /**
   * 'automatico' = boolean | null no editor (terreno 3D: null liga sozinho quando há curvas). No BANCO
   * o "automático" é o texto 'AUTOMATICO' (a coluna é jsonb NOT NULL: null não se guarda).
   */
  tipo: 'booleano' | 'opcao' | 'automatico';
  /** Só em 'opcao'. */
  opcoes?: readonly OpcaoDeExibicao[];
  padrao: ValorDeExibicao;
}

/**
 * O que o hook `usePreferenciaDaPlanta` precisa de um item, venha ele de que catálogo vier (exibir, lançamento —
 * 24/10/2026): tudo do item de exibição menos o grupo do menu Exibir.
 */
export type DefinicaoDePreferencia = Omit<ItemDeExibicao, 'grupo'>;

/**
 * Um catálogo de preferências da Planta para o hook: acha a definição do item e diz a chave gravada no banco.
 * Os catálogos são constantes de módulo (o hook os usa como dependência estável).
 */
export interface CatalogoDePreferenciasDaPlanta {
  /** Para mensagens: "exibição", "lançamento". */
  nome: string;
  definicaoDe(item: string): DefinicaoDePreferencia | undefined;
  chaveDe(item: string): string;
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

/** Valores = `ArrumacaoDasUnidades` (utils/blueprintUnidadesNoPavimento). */
export const OPCOES_UNIDADES_NO_PAVIMENTO: readonly OpcaoDeExibicao[] = [
  { valor: 'AUTOMATICA', rotulo: 'Automática (pelo número)' },
  { valor: 'EMPREENDIMENTO', rotulo: 'Ordem do Empreendimento' },
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
  // A arrumação das unidades do Empreendimento em cada pavimento da massa (27/10/2026).
  {
    item: 'vista3dUnidadesNoPavimento',
    chaveAntiga: 'blueprint:vista3dUnidadesNoPavimento',
    rotulo: 'Unidades no pavimento da massa',
    grupo: '3D',
    tipo: 'opcao',
    opcoes: OPCOES_UNIDADES_NO_PAVIMENTO,
    padrao: 'AUTOMATICA',
  },

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

/** O valor cabe no tipo (e nas opções) do item? No 'automatico' vale também o texto 'AUTOMATICO' (o do banco). */
export function valorValido(def: DefinicaoDePreferencia, valor: unknown): valor is ValorDeExibicao {
  switch (def.tipo) {
    case 'booleano':
      return typeof valor === 'boolean';
    case 'automatico':
      return typeof valor === 'boolean' || valor === AUTOMATICO_NO_BANCO;
    case 'opcao':
      return typeof valor === 'string' && (def.opcoes ?? []).some((o) => o.valor === valor);
  }
}

/**
 * Linha válida do USUARIO na `chave` dada, para o item `def`; havendo repetida, vale a última. Genérica: serve a
 * qualquer catálogo (o de lançamento passa `planta.lancamento.<item>`).
 */
export function valorNaChave(
  linhas: readonly LinhaDePreferencia[],
  def: DefinicaoDePreferencia,
  chave: string,
): ValorDeExibicao | undefined {
  if (!Array.isArray(linhas)) return undefined;
  let achado: ValorDeExibicao | undefined;
  for (const l of linhas) {
    if (l && l.escopo === 'USUARIO' && l.chave === chave && valorValido(def, l.valor)) achado = l.valor;
  }
  return achado;
}

/** Linha válida do USUARIO para o item; havendo repetida, vale a última. */
function valorDoUsuario(linhas: readonly LinhaDePreferencia[], def: ItemDeExibicao): ValorDeExibicao | undefined {
  return valorNaChave(linhas, def, chaveDeExibicao(def.item));
}

/** O catálogo de EXIBIÇÃO para o hook (o padrão de `usePreferenciaDaPlanta`). */
export const CATALOGO_DE_EXIBICAO: CatalogoDePreferenciasDaPlanta = {
  nome: 'exibição',
  definicaoDe: (item) => POR_ITEM.get(item),
  chaveDe: chaveDeExibicao,
};

/**
 * O que o usuário escolheu para o item, COMO ESTÁ NO BANCO. `undefined` = sem escolha válida (sem linha,
 * valor de outro tipo, opção fora de `opcoes`, item que não existe) → quem chama usa o padrão.
 * No item 'automatico' o "automático" volta como o texto 'AUTOMATICO' (escolha explícita); quem
 * entrega o valor ao editor troca por `null` (ver `AUTOMATICO_NO_BANCO`).
 */
export function valorDeExibicao(linhas: readonly LinhaDePreferencia[], item: string): ValorDeExibicao | undefined {
  const def = POR_ITEM.get(item);
  return def ? valorDoUsuario(linhas, def) : undefined;
}

/**
 * Migração única do navegador: para cada item SEM escolha válida no banco e COM valor válido no
 * navegador, uma linha para gravar. `lerDoNavegador` recebe a chave antiga e devolve o JSON já
 * parseado (ou `undefined`). Não devolve nada para o que já está no banco (a escolha do banco
 * nunca é sobrescrita), nem para `null` (no terreno 3D é o automático, que já é o padrão), nem para
 * valor IGUAL ao padrão do item (não é escolha — ver abaixo). O terreno 3D migra quando o navegador
 * tem `true`/`false` explícito.
 * Leitura do navegador que lança vale como "sem valor".
 */
export function linhasParaMigrar(
  linhasDoUsuario: readonly LinhaDePreferencia[],
  lerDoNavegador: (chaveAntiga: string) => unknown,
): { chave: string; valor: boolean | string }[] {
  const saida: { chave: string; valor: boolean | string }[] = [];
  for (const def of ITENS_DE_EXIBICAO) {
    if (valorDoUsuario(linhasDoUsuario, def) !== undefined) continue;
    let doNavegador: unknown;
    try {
      doNavegador = lerDoNavegador(def.chaveAntiga);
    } catch {
      continue;
    }
    if (doNavegador === null || !valorValido(def, doNavegador)) continue;
    // O navegador nunca guarda o texto 'AUTOMATICO' (é do banco): no terreno 3D só vale true/false.
    if (def.tipo === 'automatico' && typeof doNavegador !== 'boolean') continue;
    // Igual ao padrão: o `usePersistedState` grava o padrão no navegador ao montar, então isso não é
    // uma escolha — migrar congelaria o padrão como se fosse (e mudar o padrão um dia não valeria).
    if (Object.is(doNavegador, def.padrao)) continue;
    saida.push({ chave: chaveDeExibicao(def.item), valor: doNavegador as boolean | string });
  }
  return saida;
}

/** Uma mudança que a escolha de um item exige em OUTRO item. */
export interface ConsequenciaDaEscolha {
  item: string;
  valor: boolean;
}

/**
 * Regra ÚNICA das consequências de escolher um item — usada pelo menu Vista e pela aba Preferências.
 * `estado(item)` devolve o valor ATUAL de um item; só voltam as mudanças que de fato mudam algo.
 *
 *  - Cor dos ambientes (`modoDeCor` ≠ 'NENHUM') ou estilo 'HUMANIZADA' sem o "Preenchimento dos
 *    ambientes" ligado não mostra piso nenhum: liga o preenchimento junto;
 *  - Declividade e Hipsométrico pintam a mesma grade ("as duas pinturas juntas não se leem"): ligar um
 *    desliga o outro.
 */
export function consequenciasDaEscolha(
  item: string,
  valor: unknown,
  estado: (item: string) => unknown,
): ConsequenciaDaEscolha[] {
  const saida: ConsequenciaDaEscolha[] = [];
  const ligaPreenchimento =
    (item === 'modoDeCor' && typeof valor === 'string' && valor !== 'NENHUM') ||
    (item === 'estiloPlanta' && valor === 'HUMANIZADA');
  if (ligaPreenchimento && estado('mostrarPreenchimento') !== true) {
    saida.push({ item: 'mostrarPreenchimento', valor: true });
  }
  if (valor === true) {
    const outra = item === 'mostrarDeclividade' ? 'mostrarHipsometria' : item === 'mostrarHipsometria' ? 'mostrarDeclividade' : null;
    if (outra && estado(outra) === true) saida.push({ item: outra, valor: false });
  }
  return saida;
}
