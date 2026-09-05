import React, { useMemo, useState } from 'react';
import { Blocks, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import type { Agua, Opening, Structural, Wall } from '../../utils/blueprintKernel';
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
 *   olho de exibir/ocultar por peça e por família. É read-only: no 3D não há
 *   seleção no canvas nem destaque na cena, então um clique na linha não teria
 *   resposta nenhuma — o mesmo defeito que a seleção tinha quando morava atrás
 *   da aba "Ambientes".
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
  /** Ids selecionados no editor — a lista destaca e o canvas acompanha. */
  selecionados: string[];
  /** Troca a seleção. Recebe a lista inteira, como o funil único do editor. */
  onSelecionar: (ids: string[]) => void;
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
   * Ids escondidos no desenho. **Presente = cada linha e cada família ganham o
   * olho.** Ausente = a lista não fala de visibilidade nenhuma.
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

/** As linhas de uma família dentro de UM pavimento. */
interface SubBloco {
  chave: string;
  /** `null` = não desenhar subcabeçalho (planta baixa, ou 3D de um pavimento só). */
  nome: string | null;
  linhas: LinhaDeComponente[];
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
  selecionados,
  onSelecionar,
  onExcluir,
  blocos,
  ocultos,
  onAlternarOculto,
  somenteLeitura = false,
  propriedades,
}: Props) {
  const linhasDaPlanta = useMemo(
    () => (blocos ? [] : linhasDeComponentes(paredes, aberturas, estruturas, aguas)),
    [blocos, paredes, aberturas, estruturas, aguas],
  );

  /** O olho só existe quando o pai sabe o que fazer com ele. */
  const podeOcultar = !!ocultos && !!onAlternarOculto;

  const grupos: Grupo[] = useMemo(() => {
    // Uma fonte só na planta baixa; uma por pavimento no 3D. O subcabeçalho de
    // pavimento só aparece com MAIS DE UM bloco: com um piso só, repetir
    // "Térreo" dentro de cada família é ruído puro.
    const fontes: SubBloco[] = blocos
      ? blocos.map((b) => ({
          chave: b.levelId,
          nome: blocos.length > 1 ? b.nome : null,
          linhas: b.linhas,
        }))
      : [{ chave: 'unico', nome: null, linhas: linhasDaPlanta }];

    const porGrupo = new Map<string, SubBloco[]>();
    for (const fonte of fontes) {
      const naFonte = new Map<string, LinhaDeComponente[]>();
      for (const linha of fonte.linhas) {
        const ficha = fichaDoComponente(linha.chave);
        if (!ficha) continue;
        const atual = naFonte.get(ficha.grupo);
        if (atual) atual.push(linha);
        else naFonte.set(ficha.grupo, [linha]);
      }
      for (const [titulo, linhas] of naFonte) {
        const subs = porGrupo.get(titulo);
        if (subs) subs.push({ ...fonte, linhas });
        else porGrupo.set(titulo, [{ ...fonte, linhas }]);
      }
    }

    // A ordem é a do catálogo — a da OBRA, de baixo para cima na sequência em
    // que se levanta. Grupo vazio não aparece: uma seção "Fundação · 0" em toda
    // planta sem estacas seria ruído em quatro de cada cinco estudos.
    return ORDEM_DOS_GRUPOS.filter((t) => porGrupo.has(t)).map((titulo) => {
      const subs = porGrupo.get(titulo) ?? [];
      return { titulo, subs, ids: subs.flatMap((s) => s.linhas.map((l) => l.id)) };
    });
  }, [blocos, linhasDaPlanta]);

  const totalDeLinhas = blocos
    ? blocos.reduce((n, b) => n + b.linhas.length, 0)
    : linhasDaPlanta.length;

  /**
   * Grupos recolhidos. Todos nascem abertos.
   *
   * Estado local, e não persistido como as seções do painel: aqui o arranjo
   * depende do que a planta TEM (uma planta sem fundação nem mostra o grupo), e
   * guardar "Estrutura fechado" faria o usuário abrir um estudo novo com o
   * grupo escondido sem lembrar de tê-lo fechado noutro desenho.
   */
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  function alternarGrupo(titulo: string) {
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(titulo)) proximo.delete(titulo);
      else proximo.add(titulo);
      return proximo;
    });
  }

  const marcados = useMemo(() => new Set(selecionados), [selecionados]);

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
          ) : blocos ? (
            <>
              {totalDeLinhas} {totalDeLinhas === 1 ? 'peça' : 'peças'} nos pavimentos
              visíveis. Use o olho para ocultar no 3D.
            </>
          ) : (
            <>
              {totalDeLinhas} {totalDeLinhas === 1 ? 'peça' : 'peças'} neste pavimento.
              Clique para selecionar no desenho; Ctrl+clique acrescenta à seleção.
            </>
          )}
        </p>
      </div>

      {grupos.map((grupo) => {
        const recolhido = recolhidos.has(grupo.titulo);
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
                        ? `Ocultar ${grupo.titulo} no 3D`
                        : `Exibir ${grupo.titulo} no 3D`
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
                    {/* Indentação com filete à esquerda quando há subcabeçalho —
                        o vocabulário de nível 2 do §19.2 do guia, na paleta
                        slate que o resto do módulo usa. */}
                    <ul
                      className={`divide-y divide-slate-100 ${
                        sub.nome ? 'ml-4 border-l border-slate-200' : ''
                      }`}
                    >
                      {sub.linhas.map((linha) => {
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
                                      ? `Exibir ${linha.rotulo} no 3D`
                                      : `Ocultar ${linha.rotulo} no 3D`
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
                          </li>
                        );
                      })}
                    </ul>
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
