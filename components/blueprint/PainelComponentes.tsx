import React, { useMemo, useState } from 'react';
import { Blocks, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import type {
  Agua,
  BlueprintModel,
  Escada,
  Opening,
  Quadro,
  Structural,
  Terminal,
  Trecho,
  Wall,
} from '../../utils/blueprintKernel';
import {
  linhasDeComponentes,
  type BlocoDeNivel,
  type LinhaDeComponente,
} from '../../utils/blueprintComponentes';
import { ORDEM_DOS_GRUPOS, fichaDoComponente } from './MenuComponentes';

/**
 * COMPONENTES — o gerenciador do que já está desenhado.
 *
 * ─── POR QUE ELE EXISTE ─────────────────────────────────────────────────────
 *
 * Pedido do usuário (31/08/2026): *"quando seleciono um componente ele aparece
 * em Ambiente no painel lateral. Crie um novo acordion chamado Componentes e
 * inclua todos os componentes que estão em uso de forma a ser um gerenciador"*.
 *
 * Havia dois defeitos no arranjo antigo, e o pedido resolve os dois de uma vez:
 *
 * 1. **A peça selecionada aparecia dentro de "Ambientes"**, uma seção cujo
 *    subtítulo diz "derivados da topologia — não são desenhados à mão". Parede,
 *    porta e pilar são exatamente o contrário disso: são o que se desenha. Quem
 *    procurava as medidas da parede tinha de abrir a seção dos ambientes.
 * 2. **Não havia lista.** O único jeito de chegar numa peça era acertá-la com o
 *    clique no canvas. Pilar atrás de parede, janela estreita em zoom de
 *    trabalho, viga sob a laje — todas essas eram inalcançáveis sem caçar zoom.
 *
 * ─── O QUE É "COMPONENTE" AQUI ──────────────────────────────────────────────
 *
 * O mesmo recorte do `MenuComponentes`, e de propósito o mesmo: alvenaria,
 * esquadria, estrutura e fundação. Divisa e terreno são limite jurídico e vivem
 * no `PainelTerreno`; medição é afirmação sobre a planta de fundo e tem painel
 * próprio; ambiente é derivado. Nenhum dos três é algo que a obra levanta.
 *
 * Nome, ícone e grupo saem de `fichaDoComponente` — o catálogo do menu que
 * OFERECE as peças. Uma segunda tabela aqui divergiria no primeiro componente
 * novo, e o gerenciador mostraria a porta de correr com outro ícone.
 *
 * ─── OS DOIS MODOS (01/09/2026) ─────────────────────────────────────────────
 *
 * Pedido: *"Na visualização 3d, incluir accordion componentes e com botão
 * exibir / ocultar em cada um dos componentes"*.
 *
 * O painel passou a servir a duas vistas com necessidades diferentes, e as
 * props novas são todas OPCIONAIS justamente para que a planta baixa não mude:
 *
 * - **planta baixa** — `paredes`/`aberturas`/`estruturas` do pavimento ativo.
 *   Lista clicável (seleciona no canvas), lixeira, painel de propriedades.
 * - **3D** — `blocos`, o inventário dos pavimentos EMPILHADOS na cena, com o
 *   olho de exibir/ocultar por peça e por família. Nasceu read-only porque o 3D
 *   não tinha seleção; desde 16/09/2026 a cena seleciona e destaca, e o editor
 *   abre as propriedades embaixo — então a linha volta a ser clicável ali
 *   também (`somenteLeitura` fica para quem ainda não tiver resposta ao clique).
 */

interface Props {
  /** Paredes do pavimento ativo, na ordem do modelo. Ignorado quando há `blocos`. */
  paredes: Wall[];
  /** Aberturas hospedadas nessas paredes. Ignorado quando há `blocos`. */
  aberturas: Opening[];
  /** Peças estruturais do pavimento ativo. Ignorado quando há `blocos`. */
  estruturas: Structural[];
  /** Águas de telhado do pavimento ativo. Opcional: chamadas antigas não a conhecem. */
  aguas?: Agua[];
  /**
   * Escadas e rampas do pavimento ativo, com o MODELO: a linha diz quantos
   * degraus, e isso vem do desnível entre pavimentos.
   */
  escadas?: { model: BlueprintModel; itens: Escada[] };
  /**
   * As INSTALAÇÕES do pavimento.
   *
   * ⚠️ Este painel monta a lista de DOIS jeitos: no 3D, a partir de `blocos`
   * (já prontos, por pavimento); na planta baixa, a partir das props de peça,
   * aqui dentro. Ligar a rede só no primeiro caminho — que foi o que eu fiz em
   * 09/09/2026 — deixou o grupo de instalações aparecendo no 3D e ausente na
   * planta baixa, que é onde se desenha. O relato veio com print: "veja que em
   * componentes não existe nenhum grupo elétrico".
   */
  rede?: { trechos: Trecho[]; terminais: Terminal[]; quadros: Quadro[] };
  /** Ids selecionados no editor — a lista destaca e o canvas acompanha. */
  selecionados: string[];
  /** Troca a seleção. Recebe a lista inteira, como o funil único do editor. */
  onSelecionar: (ids: string[]) => void;
  /**
   * DUPLO clique na linha: seleciona SÓ esta peça, sem o grupo. Um clique numa
   * estaca ou num bloco seleciona o grupo de fundação inteiro (o editor expande
   * em `selecionar`); o duplo clique é a saída para a peça sozinha.
   */
  onSelecionarPeca?: (id: string) => void;
  /** Exclui uma peça. O editor decide a ordem do lote (abertura antes da parede). */
  onExcluir: (id: string) => void;
  /**
   * O inventário JÁ recortado por pavimento — o modo da vista 3D.
   *
   * Substitui `paredes`/`aberturas`/`estruturas`. Vem de
   * `linhasDeComponentesPorNivel`, que é quem sabe reiniciar a numeração em cada
   * piso; refazer esse agrupamento aqui seria a segunda cópia da mesma regra.
   */
  blocos?: BlocoDeNivel[];
  /**
   * Ids escondidos no desenho. **Presente = cada linha, cada tipo e cada família
   * ganham o olho** — na planta baixa e no 3D (16/09/2026). Ausente = a lista
   * não fala de visibilidade nenhuma.
   */
  ocultos?: Set<string>;
  /**
   * Recebe o LOTE de ids: a linha manda um, o cabeçalho da família manda a lista
   * inteira dela. Um callback por id obrigaria o pai a agrupar N `setState`
   * seguidos para o clique de uma família com quarenta paredes.
   */
  onAlternarOculto?: (ids: string[], ocultar: boolean) => void;
  /** Vista read-only (3D): some a lixeira e a linha deixa de ser clicável. */
  somenteLeitura?: boolean;
  /**
   * As propriedades da peça selecionada — `PainelParedeSelecionada` e
   * `PainelEstruturaSelecionada`, que antes moravam em "Ambientes".
   *
   * Slot, e não import direto: os dois painéis dependem de uma dúzia de
   * callbacks que só o editor tem (esticar, dividir, unir, virar a folha), e
   * repassá-los por aqui só para renderizá-los faria deste arquivo um túnel de
   * props sem opinião nenhuma sobre eles.
   */
  propriedades?: React.ReactNode;
}

/**
 * As peças de UM TIPO (Pilar, Viga, Laje…) dentro de uma família, num pavimento.
 *
 * Pedido do usuário (16/09/2026): *"Painel lateral › Componentes › Estrutura:
 * implementar subgrupos (laje; viga; pilar), faça o mesmo para os demais
 * componentes"*. Antes a família listava as peças corridas — dezesseis pilares,
 * sete vigas e quatro lajes numa lista só de 27 linhas, e achar a viga era
 * rolar. Agora cada TIPO do catálogo é um subgrupo recolhível, com contagem e,
 * no 3D, o olho da família inteira dele.
 *
 * O subgrupo é a FICHA do componente (`fichaDoComponente`): mesmo nome, mesmo
 * ícone e a ordem do catálogo (Pilar, Viga, Laje — a ordem em que o menu
 * oferece). Família de um tipo só (Alvenaria › Parede) também ganha o
 * subgrupo: a árvore é a mesma em toda família, e é isso que a torna previsível.
 */
interface Subgrupo {
  chave: string;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
  /** As linhas do tipo — sem as que são PARTE de outra (essas estão em `filhas`). */
  linhas: LinhaDeComponente[];
  /**
   * Linhas aninhadas sob uma linha deste subgrupo, pelo id do pai — a estaca
   * dentro do bloco (16/09/2026: *"a estaca e seu bloco deve estar agrupado"*).
   * Entram nos `ids` do subgrupo (o olho do tipo esconde o grupo inteiro) e não
   * aparecem no subgrupo do próprio tipo, que fica só com as órfãs.
   */
  filhas: Map<string, LinhaDeComponente[]>;
  ids: string[];
}

/** Os subgrupos de uma família dentro de UM pavimento. */
interface SubBloco {
  chave: string;
  /** `null` = não desenhar subcabeçalho (planta baixa, ou 3D de um pavimento só). */
  nome: string | null;
  subgrupos: Subgrupo[];
}

/** Uma família de peças, já com as linhas dela. */
interface Grupo {
  titulo: string;
  subs: SubBloco[];
  /** Todos os ids da família — é o lote que o olho do cabeçalho alterna. */
  ids: string[];
}

/**
 * O olho de exibir/ocultar.
 *
 * Mesmo vocabulário das camadas de `PainelMedicoes`: `Eye` azul quando visível,
 * `EyeOff` cinza quando oculto, `aria-pressed` dizendo o estado. Dois dialetos
 * de visibilidade no mesmo editor fariam o usuário aprender duas vezes a mesma
 * coisa.
 */
function Olho({
  oculto,
  titulo,
  onClick,
}: {
  oculto: boolean;
  titulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!oculto}
      aria-label={titulo}
      title={titulo}
      className="shrink-0 rounded-[6px] p-1 transition-colors hover:bg-slate-100"
    >
      {oculto ? (
        <EyeOff className="h-3.5 w-3.5 text-slate-400" />
      ) : (
        <Eye className="h-3.5 w-3.5 text-blue-600" />
      )}
    </button>
  );
}

export default function PainelComponentes({
  paredes,
  aberturas,
  estruturas,
  aguas = [],
  escadas,
  rede,
  selecionados,
  onSelecionar,
  onSelecionarPeca,
  onExcluir,
  blocos,
  ocultos,
  onAlternarOculto,
  somenteLeitura = false,
  propriedades,
}: Props) {
  const linhasDaPlanta = useMemo(
    () =>
      blocos
        ? []
        : linhasDeComponentes(
            paredes,
            aberturas,
            estruturas,
            aguas,
            escadas ?? null,
            rede ?? null,
          ),
    [blocos, paredes, aberturas, estruturas, aguas, escadas, rede],
  );

  /** O olho só existe quando o pai sabe o que fazer com ele. */
  const podeOcultar = !!ocultos && !!onAlternarOculto;

  const grupos: Grupo[] = useMemo(() => {
    // Uma fonte só na planta baixa; uma por pavimento no 3D. O subcabeçalho de
    // pavimento só aparece com MAIS DE UM bloco: com um piso só, repetir
    // "Térreo" dentro de cada família é ruído puro.
    const fontes: { chave: string; nome: string | null; linhas: LinhaDeComponente[] }[] = blocos
      ? blocos.map((b) => ({
          chave: b.levelId,
          nome: blocos.length > 1 ? b.nome : null,
          linhas: b.linhas,
        }))
      : [{ chave: 'unico', nome: null, linhas: linhasDaPlanta }];

    const porGrupo = new Map<string, SubBloco[]>();
    for (const fonte of fontes) {
      // família → tipo → linhas. O tipo é a chave do catálogo (`PILAR`, `door`,
      // `PONTO_TUG`…); a ficha dá nome, ícone e a posição no catálogo.
      const naFonte = new Map<string, Map<string, Subgrupo>>();
      const porId = new Map(fonte.linhas.map((l) => [l.id, l]));
      const subgrupoDe = (linha: LinhaDeComponente): Subgrupo | null => {
        const ficha = fichaDoComponente(linha.chave);
        if (!ficha) return null;
        let tipos = naFonte.get(ficha.grupo);
        if (!tipos) {
          tipos = new Map();
          naFonte.set(ficha.grupo, tipos);
        }
        let sg = tipos.get(linha.chave);
        if (!sg) {
          sg = { chave: linha.chave, rotulo: ficha.rotulo, icone: ficha.icone, linhas: [], filhas: new Map(), ids: [] };
          tipos.set(linha.chave, sg);
        }
        return sg;
      };
      // Pais e órfãs primeiro, na ordem do inventário; as filhas vão para o
      // subgrupo do PAI (a estaca aparece dentro do bloco, não em "Estaca").
      for (const linha of fonte.linhas) {
        if (linha.paiId && porId.has(linha.paiId)) continue;
        const sg = subgrupoDe(linha);
        if (!sg) continue;
        sg.linhas.push(linha);
        sg.ids.push(linha.id);
      }
      for (const linha of fonte.linhas) {
        const pai = linha.paiId ? porId.get(linha.paiId) : undefined;
        if (!pai) continue;
        const sg = subgrupoDe(pai);
        if (!sg) continue;
        const irmas = sg.filhas.get(pai.id);
        if (irmas) irmas.push(linha);
        else sg.filhas.set(pai.id, [linha]);
        sg.ids.push(linha.id);
      }
      for (const [titulo, tipos] of naFonte) {
        const subgrupos = [...tipos.values()].sort(
          (a, b) => (fichaDoComponente(a.chave)?.ordem ?? 0) - (fichaDoComponente(b.chave)?.ordem ?? 0),
        );
        const subs = porGrupo.get(titulo);
        if (subs) subs.push({ chave: fonte.chave, nome: fonte.nome, subgrupos });
        else porGrupo.set(titulo, [{ chave: fonte.chave, nome: fonte.nome, subgrupos }]);
      }
    }

    // A ordem é a do catálogo — a da OBRA, de baixo para cima na sequência em
    // que se levanta. Grupo vazio não aparece: uma seção "Fundação · 0" em toda
    // planta sem estacas seria ruído em quatro de cada cinco estudos.
    return ORDEM_DOS_GRUPOS.filter((t) => porGrupo.has(t)).map((titulo) => {
      const subs = porGrupo.get(titulo) ?? [];
      return { titulo, subs, ids: subs.flatMap((s) => s.subgrupos.flatMap((g) => g.ids)) };
    });
  }, [blocos, linhasDaPlanta]);

  const totalDeLinhas = blocos
    ? blocos.reduce((n, b) => n + b.linhas.length, 0)
    : linhasDaPlanta.length;

  /**
   * Grupos ABERTOS. Todos nascem RECOLHIDOS (17/09/2026: *"os popover estão
   * por padrão todos expandidos; por padrão devem ser recolhidos"*) — uma
   * planta com 160 peças abria como uma lista de três telas de altura. O
   * grupo que contém uma peça SELECIONADA abre sozinho enquanto ela estiver
   * selecionada: clicar no desenho tem de mostrar a linha, senão a seleção
   * parece sem resposta.
   *
   * Estado local, e não persistido como as seções do painel: aqui o arranjo
   * depende do que a planta TEM (uma planta sem fundação nem mostra o grupo), e
   * guardar "Estrutura aberto" faria o usuário abrir um estudo novo com o
   * grupo escancarado sem lembrar de tê-lo aberto noutro desenho.
   */
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  /** Chave da família, ou `família/pavimento/tipo` para um subgrupo — o mesmo conjunto serve aos dois níveis. */
  function alternarGrupo(chave: string) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  const marcados = useMemo(() => new Set(selecionados), [selecionados]);
  /** Aberto = escolhido pelo usuário, ou abriga uma peça selecionada. */
  const aberto = (chave: string, ids: readonly string[]) => abertos.has(chave) || ids.some((id) => marcados.has(id));

  /**
   * Clique na linha.
   *
   * Ctrl/⌘ ou Shift ACRESCENTA à seleção, em vez de trocar — é o mesmo gesto que
   * o canvas já usa, e é o que torna a lista útil para pegar de uma vez as três
   * paredes que se quer mover juntas (o `TranslateEntities` só faz sentido com
   * as peças selecionadas ao mesmo tempo).
   */
  function aoClicar(id: string, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      onSelecionar(
        marcados.has(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id],
      );
      return;
    }
    onSelecionar(marcados.has(id) && selecionados.length === 1 ? [] : [id]);
  }

  /**
   * Uma linha do inventário — e, aninhadas nela, as peças de que ela é o pai
   * (as estacas do bloco). A mesma função para os dois níveis: o clique, o olho
   * e a lixeira valem igual para a filha.
   */
  function linhaDe(linha: LinhaDeComponente, filhas: LinhaDeComponente[]): React.ReactNode {
    const ficha = fichaDoComponente(linha.chave);
    const Icone = ficha?.icone ?? Blocks;
    const sel = marcados.has(linha.id);
    const oculto = !!ocultos?.has(linha.id);
    const conteudo = (
      <>
        <Icone
          className={`h-3.5 w-3.5 shrink-0 ${
            oculto
              ? 'text-slate-300'
              : sel
                ? 'text-blue-600'
                : 'text-slate-400'
          }`}
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-xs ${
              oculto
                ? 'text-slate-400'
                : sel
                  ? 'font-medium text-blue-800'
                  : 'text-slate-700'
            }`}
          >
            {linha.rotulo}
          </span>
          {linha.detalhe && (
            <span
              className={`block truncate text-[11px] ${
                oculto ? 'text-slate-300' : 'text-slate-400'
              }`}
            >
              {linha.detalhe}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-[11px] tabular-nums ${
            oculto ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {linha.medida}
        </span>
      </>
    );
    return (
      <li key={linha.id} className={sel ? 'bg-blue-50' : ''}>
        <div className="flex items-center gap-1 px-3 py-1.5">
          {somenteLeitura ? (
            // Sem `<button>`: no 3D não há seleção no canvas
            // nem destaque na cena, e um clique que não
            // responde é pior que nenhum afeto de clique.
            <span
              title={`${linha.rotulo} · ${linha.medida}`}
              className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5"
            >
              {conteudo}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => aoClicar(linha.id, e)}
              onDoubleClick={() => onSelecionarPeca?.(linha.id)}
              aria-pressed={sel}
              title={`${linha.rotulo} · ${linha.medida}`}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1 py-0.5 text-left transition-colors hover:bg-slate-50"
            >
              {conteudo}
            </button>
          )}
          {podeOcultar && (
            <Olho
              oculto={oculto}
              titulo={
                oculto
                  ? `Exibir ${linha.rotulo} no desenho`
                  : `Ocultar ${linha.rotulo} no desenho`
              }
              onClick={() => onAlternarOculto?.([linha.id], !oculto)}
            />
          )}
          {!somenteLeitura && (
            <button
              type="button"
              onClick={() => onExcluir(linha.id)}
              aria-label={`Excluir ${linha.rotulo}`}
              title={`Excluir ${linha.rotulo}`}
              className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {filhas.length > 0 && (
          <ul className="ml-6 divide-y divide-slate-100 border-l border-slate-200">
            {filhas.map((f) => linhaDe(f, []))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div>
      {/* As propriedades da peça vêm ANTES da lista: quem acabou de selecionar
          está olhando para o topo da seção, e empurrá-las para depois de
          quarenta linhas de inventário faria a seleção parecer sem resposta. */}
      {propriedades}

      <div className="border-b border-slate-200 px-4 py-2">
        <p className="text-xs text-slate-500">
          {totalDeLinhas === 0 ? (
            blocos ? (
              <>Nenhuma peça nos pavimentos visíveis.</>
            ) : (
              <>
                Nada desenhado neste pavimento ainda. Use <strong>Componentes</strong> na
                barra para colocar parede, esquadria, estrutura ou fundação.
              </>
            )
          ) : (
            // UMA linha (17/09/2026: *"desempilhar texto na seção
            // componentes"*): a contagem visível; as dicas de gesto ficam no
            // `title`, para quem parar o mouse — três linhas de instrução em
            // cima de uma lista de 160 peças empurravam a lista para baixo.
            <span
              className="block truncate"
              title={
                blocos
                  ? `${somenteLeitura ? '' : 'Clique para selecionar na cena. '}${podeOcultar ? 'O olho oculta no desenho.' : ''}`.trim()
                  : `Clique para selecionar no desenho; Ctrl+clique acrescenta à seleção${podeOcultar ? '; o olho oculta no desenho' : ''}.`
              }
            >
              {totalDeLinhas} {totalDeLinhas === 1 ? 'peça' : 'peças'} {blocos ? 'nos pavimentos visíveis' : 'neste pavimento'} ·{' '}
              {grupos.length} {grupos.length === 1 ? 'família' : 'famílias'}
            </span>
          )}
        </p>
      </div>

      {grupos.map((grupo) => {
        const recolhido = !aberto(grupo.titulo, grupo.ids);
        const idGrupo = `componentes-${grupo.titulo.replace(/\s+/g, '-').toLowerCase()}`;
        // Um clique no olho da família esconde tudo enquanto sobrar UMA peça
        // visível, e só devolve quando todas estão ocultas. Meio a meio conta
        // como visível: o gesto esperado de quem vê o olho aceso é apagar.
        const algumVisivel = grupo.ids.some((id) => !ocultos?.has(id));
        return (
          <section key={grupo.titulo} className="border-b border-slate-100">
            {/* O olho é IRMÃO do botão do chevron, nunca filho: botão dentro de
                botão é HTML inválido — o mesmo motivo pelo qual `SecaoAccordion`
                tem o slot `acoes` separado do cabeçalho clicável. */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => alternarGrupo(grupo.titulo)}
                aria-expanded={!recolhido}
                aria-controls={`${idGrupo}-corpo`}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ChevronRight
                  aria-hidden
                  className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
                    recolhido ? '' : 'rotate-90'
                  }`}
                />
                <span id={idGrupo} className="truncate">
                  {grupo.titulo}
                </span>
                <span className="ml-auto shrink-0 rounded-[6px] bg-slate-100 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600">
                  {grupo.ids.length}
                </span>
              </button>
              {podeOcultar && (
                <div className="shrink-0 pr-2">
                  <Olho
                    oculto={!algumVisivel}
                    titulo={
                      algumVisivel
                        ? `Ocultar ${grupo.titulo} no desenho`
                        : `Exibir ${grupo.titulo} no desenho`
                    }
                    onClick={() => onAlternarOculto?.(grupo.ids, algumVisivel)}
                  />
                </div>
              )}
            </div>

            {!recolhido && (
              <div id={`${idGrupo}-corpo`} aria-labelledby={idGrupo}>
                {grupo.subs.map((sub) => (
                  <div key={sub.chave}>
                    {sub.nome && (
                      <p className="px-3 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {sub.nome}
                      </p>
                    )}
                    {/* Indentação com filete à esquerda — o vocabulário de nível 2
                        do §19.2 do guia, na paleta slate que o resto do módulo
                        usa. Com pavimento nomeado (3D empilhado), os subgrupos
                        descem mais um nível. */}
                    <div className={sub.nome ? 'ml-4 border-l border-slate-200' : ''}>
                      {sub.subgrupos.map((sg) => {
                        const chaveSg = `${grupo.titulo}/${sub.chave}/${sg.chave}`;
                        const sgRecolhido = !aberto(chaveSg, sg.ids);
                        const idSg = `${idGrupo}-${sub.chave}-${sg.chave}`.replace(/[^\w-]+/g, '-').toLowerCase();
                        const sgVisivel = sg.ids.some((id) => !ocultos?.has(id));
                        const IconeSg = sg.icone;
                        return (
                          <div key={sg.chave}>
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => alternarGrupo(chaveSg)}
                                aria-expanded={!sgRecolhido}
                                aria-controls={`${idSg}-corpo`}
                                // Nome acessível explícito: "Parede" + "2" leria
                                // "Parede 2" — o mesmo nome da segunda parede da
                                // lista, e quem procura a peça pelo nome acharia
                                // o cabeçalho.
                                // A contagem é a das peças do TIPO (16 blocos), não a do que o
                                // olho alcança (blocos + estacas aninhadas) — "Bloco · 34" leria
                                // como 34 blocos.
                                aria-label={`${sg.rotulo}: ${sg.linhas.length} ${sg.linhas.length === 1 ? 'peça' : 'peças'}`}
                                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-3 pr-2 text-left text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
                              >
                                <ChevronRight
                                  aria-hidden
                                  className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${
                                    sgRecolhido ? '' : 'rotate-90'
                                  }`}
                                />
                                <IconeSg aria-hidden className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="truncate">{sg.rotulo}</span>
                                <span className="ml-auto shrink-0 rounded-[6px] bg-slate-50 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
                                  {sg.linhas.length}
                                </span>
                              </button>
                              {podeOcultar && (
                                <div className="shrink-0 pr-2">
                                  <Olho
                                    oculto={!sgVisivel}
                                    titulo={sgVisivel ? `Ocultar ${sg.rotulo} no desenho` : `Exibir ${sg.rotulo} no desenho`}
                                    onClick={() => onAlternarOculto?.(sg.ids, sgVisivel)}
                                  />
                                </div>
                              )}
                            </div>
                            {!sgRecolhido && (
                              <ul
                                id={`${idSg}-corpo`}
                                className="ml-4 divide-y divide-slate-100 border-l border-slate-200"
                              >
                                {sg.linhas.map((linha) => linhaDe(linha, sg.filhas.get(linha.id) ?? []))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
