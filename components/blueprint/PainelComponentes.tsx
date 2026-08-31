import React, { useMemo, useState } from 'react';
import { Blocks, ChevronRight, Trash2 } from 'lucide-react';
import type { Opening, Structural, Wall } from '../../utils/blueprintKernel';
import { linhasDeComponentes, type LinhaDeComponente } from '../../utils/blueprintComponentes';
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
 */

interface Props {
  /** Paredes do pavimento ativo, na ordem do modelo. */
  paredes: Wall[];
  /** Aberturas hospedadas nessas paredes. */
  aberturas: Opening[];
  /** Peças estruturais do pavimento ativo. */
  estruturas: Structural[];
  /** Ids selecionados no editor — a lista destaca e o canvas acompanha. */
  selecionados: string[];
  /** Troca a seleção. Recebe a lista inteira, como o funil único do editor. */
  onSelecionar: (ids: string[]) => void;
  /** Exclui uma peça. O editor decide a ordem do lote (abertura antes da parede). */
  onExcluir: (id: string) => void;
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

/** Uma família de peças, já com as linhas dela. */
interface Grupo {
  titulo: string;
  linhas: LinhaDeComponente[];
}

export default function PainelComponentes({
  paredes,
  aberturas,
  estruturas,
  selecionados,
  onSelecionar,
  onExcluir,
  propriedades,
}: Props) {
  const linhas = useMemo(
    () => linhasDeComponentes(paredes, aberturas, estruturas),
    [paredes, aberturas, estruturas],
  );

  const grupos: Grupo[] = useMemo(() => {
    const porGrupo = new Map<string, LinhaDeComponente[]>();
    for (const linha of linhas) {
      const ficha = fichaDoComponente(linha.chave);
      if (!ficha) continue;
      const atual = porGrupo.get(ficha.grupo);
      if (atual) atual.push(linha);
      else porGrupo.set(ficha.grupo, [linha]);
    }
    // A ordem é a do catálogo — a da OBRA, de baixo para cima na sequência em
    // que se levanta. Grupo vazio não aparece: uma seção "Fundação · 0" em toda
    // planta sem estacas seria ruído em quatro de cada cinco estudos.
    return ORDEM_DOS_GRUPOS.filter((t) => porGrupo.has(t)).map((titulo) => ({
      titulo,
      linhas: porGrupo.get(titulo) ?? [],
    }));
  }, [linhas]);

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
          {linhas.length === 0 ? (
            <>
              Nada desenhado neste pavimento ainda. Use <strong>Componentes</strong> na
              barra para colocar parede, esquadria, estrutura ou fundação.
            </>
          ) : (
            <>
              {linhas.length} {linhas.length === 1 ? 'peça' : 'peças'} neste pavimento.
              Clique para selecionar no desenho; Ctrl+clique acrescenta à seleção.
            </>
          )}
        </p>
      </div>

      {grupos.map((grupo) => {
        const recolhido = recolhidos.has(grupo.titulo);
        const idGrupo = `componentes-${grupo.titulo.replace(/\s+/g, '-').toLowerCase()}`;
        return (
          <section key={grupo.titulo} className="border-b border-slate-100">
            <button
              type="button"
              onClick={() => alternarGrupo(grupo.titulo)}
              aria-expanded={!recolhido}
              aria-controls={`${idGrupo}-corpo`}
              className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
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
                {grupo.linhas.length}
              </span>
            </button>

            {!recolhido && (
              <ul
                id={`${idGrupo}-corpo`}
                aria-labelledby={idGrupo}
                className="divide-y divide-slate-100"
              >
                {grupo.linhas.map((linha) => {
                  const ficha = fichaDoComponente(linha.chave);
                  const Icone = ficha?.icone ?? Blocks;
                  const sel = marcados.has(linha.id);
                  return (
                    <li key={linha.id} className={sel ? 'bg-blue-50' : ''}>
                      <div className="flex items-center gap-1 px-3 py-1.5">
                        <button
                          type="button"
                          onClick={(e) => aoClicar(linha.id, e)}
                          aria-pressed={sel}
                          title={`${linha.rotulo} · ${linha.medida}`}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-1 py-0.5 text-left transition-colors hover:bg-slate-50"
                        >
                          <Icone
                            className={`h-3.5 w-3.5 shrink-0 ${
                              sel ? 'text-blue-600' : 'text-slate-400'
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-xs ${
                                sel ? 'font-medium text-blue-800' : 'text-slate-700'
                              }`}
                            >
                              {linha.rotulo}
                            </span>
                            {linha.detalhe && (
                              <span className="block truncate text-[11px] text-slate-400">
                                {linha.detalhe}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-600">
                            {linha.medida}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onExcluir(linha.id)}
                          aria-label={`Excluir ${linha.rotulo}`}
                          title={`Excluir ${linha.rotulo}`}
                          className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
