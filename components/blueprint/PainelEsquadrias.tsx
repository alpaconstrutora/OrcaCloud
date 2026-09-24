import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookMarked, Combine, Search, Sparkles, Wand2 } from 'lucide-react';
import { nomeDoTipoDeAbertura, type Esquadria } from '../../utils/blueprintKernel';
import type { QuantidadePorEsquadria } from '../../utils/blueprintKernel/quantities';
import { cmParaMm, mmParaCm, textoEmCm } from '../../utils/blueprintMedidaCm';
import { TOLERANCIA_PADRAO_MM, type Unificacao } from '../../utils/blueprintUnificarEsquadrias';
import DatabasePickerModal from '../DatabasePickerModal';
import { useOrgContext, useOrgWriteTarget, forEachTargetOrg } from '../../hooks/useOrgContext';
import { listOpeningTypes, saveOpeningType, type TipoDeEsquadria } from '../../services/blueprintOpeningTypeService';
import { sinapiService } from '../../services/sinapiService';
import { sugerirItens } from '../../utils/blueprintItemPorMedida';

/**
 * ESQUADRIAS DO DESENHO, EM LOTE (24/09/2026, P2.49).
 *
 * ─── O BURACO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * Medido na planta real do usuário depois de toda a importação DXF: **104
 * esquadrias, 0 com tipo declarado, 0 com item de catálogo**. E o orçamento
 * (`blueprintBudget`) pula a esquadria sem tipo ANTES de gerar linha ou
 * divergência — `if (!e.declarada) continue`. Resultado: a planta inteira não
 * produz uma única linha de esquadria no orçamento **e não acusa nada**.
 *
 * Não era falta de vontade: até aqui o único caminho era abrir abertura por
 * abertura no painel do selecionado e digitar o nome — 104 vezes, com o mouse
 * acertando cada porta no desenho. Ninguém faz isso, e por isso o número é 0.
 *
 * ─── O GRUPO JÁ EXISTE ──────────────────────────────────────────────────────
 *
 * O quadro de esquadrias (`totais.porEsquadria`) já agrupa por assinatura —
 * kind, medidas, nome e item — e cada grupo carrega `openingIds`. Ou seja: a
 * lista de "tipos do desenho" está pronta; faltava uma tela onde ela fosse
 * EDITÁVEL. Nomear um grupo é um `SetOpeningEsquadria` por abertura dele, tudo
 * num lote só — um passo de desfazer.
 *
 * ⚠️ Nomear MUDA a assinatura (o nome entra nela), e portanto re-agrupa o
 * quadro na próxima renderização. Por isso o rascunho é indexado pela
 * assinatura ATUAL e aplicado de uma vez: editar linha a linha contra um quadro
 * que se reordena embaixo do cursor seria ingovernável.
 */

/** Sigla por tipo de abertura, como a prancha nomeia. */
const SIGLA: Record<QuantidadePorEsquadria['tipo'], string> = { door: 'P', sliding: 'PC', window: 'J' };

/** Portas, depois correr, depois janelas — a ordem em que a prancha lista. */
const ORDEM_DO_TIPO: Record<QuantidadePorEsquadria['tipo'], number> = { door: 0, sliding: 1, window: 2 };

export interface RascunhoDeEsquadria {
  nome: string;
  itemCode: string;
  descricao: string;
}

interface Props {
  /** O quadro do pavimento inteiro — `totais.porEsquadria`, já sem vão livre. */
  grupos: readonly QuantidadePorEsquadria[];
  /** Aplica o lote: para cada grupo tocado, a esquadria de todas as aberturas dele. */
  onAplicar: (mudancas: { openingIds: readonly string[]; esquadria: Esquadria }[]) => void;
  /** Mostra o grupo no desenho. */
  onSelecionar: (openingIds: readonly string[]) => void;
  /**
   * UNIFICAR TIPOS PRÓXIMOS (P2.50). A proposta chega pronta porque depende do
   * MODELO (saber se a medida nova cabe na parede), e este painel só conhece o
   * quadro. `toleranciaMm` sobe para quem calcula.
   */
  unificacoes?: readonly Unificacao[];
  toleranciaMm?: number;
  onTolerancia?: (mm: number) => void;
  onUnificar?: (quais: readonly Unificacao[]) => void;
  /**
   * Mirar a medida do DESENHO (a mais frequente) ou a do CATÁLOGO (comercial).
   *
   * ⚠️ A segunda muda TODAS as peças do agrupamento, inclusive as do tipo mais
   * numeroso — e em troca o tipo passa a ter item e preço. É escolha do usuário
   * porque a troca é real: mexer no desenho levantado para caber no que se
   * compra faz sentido em obra a construir, e não num as-built de reforma.
   */
  mirarCatalogo?: boolean;
  onMirarCatalogo?: (v: boolean) => void;
}

export default function PainelEsquadrias({
  grupos,
  onAplicar,
  onSelecionar,
  unificacoes = [],
  toleranciaMm = TOLERANCIA_PADRAO_MM,
  onTolerancia,
  onUnificar,
  mirarCatalogo = false,
  onMirarCatalogo,
}: Props) {
  const [rascunho, setRascunho] = useState<Record<string, RascunhoDeEsquadria>>({});
  const [escolhendoItemDe, setEscolhendoItemDe] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // ⚠️ REGRA #5: `orgId` do CONTEXTO; `null` ("Todas") não bloqueia a leitura.
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const [tipos, setTipos] = useState<TipoDeEsquadria[]>([]);

  const carregar = useCallback(() => {
    listOpeningTypes(orgId)
      .then(setTipos)
      // Catálogo indisponível não derruba a tela: o nome se digita sem ele.
      .catch(() => setTipos([]));
  }, [orgId]);
  useEffect(() => carregar(), [carregar]);

  /** O que a linha mostra: o rascunho, se houver; senão o que está no desenho. */
  const valorDe = useCallback(
    (g: QuantidadePorEsquadria): RascunhoDeEsquadria =>
      rascunho[g.assinatura] ?? { nome: g.declarada ? g.nome : '', itemCode: g.itemCode, descricao: g.descricao },
    [rascunho],
  );

  const editar = (g: QuantidadePorEsquadria, campos: Partial<RascunhoDeEsquadria>) =>
    setRascunho((r) => ({ ...r, [g.assinatura]: { ...valorDe(g), ...campos } }));

  /**
   * A tabela na MESMA ordem da numeração: tipo, depois o mais numeroso.
   *
   * ⚠️ Medido no app real antes de publicar: com a ordem que vem do quadro
   * (alfabética pelo nome derivado, "Janela 100×120" < "Janela 120×100"), o
   * botão de nomear devolvia "J5, J2, J4, J21, J20…" na tela — os números
   * certos, embaralhados. Numerar por quantidade e listar por outra coisa faz o
   * usuário desconfiar do botão.
   */
  const ordenados = useMemo(
    () =>
      [...grupos].sort(
        (a, b) => ORDEM_DO_TIPO[a.tipo] - ORDEM_DO_TIPO[b.tipo] || b.quantidade - a.quantidade || b.larguraM - a.larguraM,
      ),
    [grupos],
  );

  const resumo = useMemo(() => {
    const total = grupos.reduce((s, g) => s + g.quantidade, 0);
    const nomeados = grupos.filter((g) => valorDe(g).nome.trim() !== '');
    const comItem = grupos.filter((g) => valorDe(g).itemCode !== '');
    return {
      total,
      tipos: grupos.length,
      pecasNomeadas: nomeados.reduce((s, g) => s + g.quantidade, 0),
      gruposNomeados: nomeados.length,
      gruposComItem: comItem.length,
    };
  }, [grupos, valorDe]);

  /**
   * Numera os grupos SEM nome: P1, P2… por tipo, do mais numeroso ao menos.
   *
   * ⚠️ Não sobrescreve o que já tem nome — nem no desenho nem no rascunho. Quem
   * já chamou uma porta de "PE-01" não quer que um botão a renomeie para "P3".
   * A numeração continua de onde os nomes existentes pararam, para não repetir
   * um "P1" que já está no desenho.
   */
  function nomearAutomaticamente() {
    const usados = new Set(grupos.map((g) => valorDe(g).nome.trim()).filter(Boolean));
    const contador: Record<string, number> = {};
    const proximo = (sigla: string) => {
      let n = (contador[sigla] ?? 0) + 1;
      while (usados.has(`${sigla}${n}`)) n += 1;
      contador[sigla] = n;
      usados.add(`${sigla}${n}`);
      return `${sigla}${n}`;
    };
    const semNome = ordenados.filter((g) => valorDe(g).nome.trim() === '');
    if (semNome.length === 0) {
      setAviso('Todos os tipos já têm nome.');
      return;
    }
    const novo: Record<string, RascunhoDeEsquadria> = { ...rascunho };
    for (const g of semNome) novo[g.assinatura] = { ...valorDe(g), nome: proximo(SIGLA[g.tipo]) };
    setRascunho(novo);
    setAviso(`${semNome.length} tipo(s) nomeados. Confira e clique em Aplicar.`);
  }

  /**
   * Preenche o ITEM de cada tipo com a melhor sugestão do catálogo (P2.53).
   *
   * O SINAPI escreve a medida no nome do item ("KIT PORTA… DE 800 X 2100 MM",
   * "… 80X210CM"), e são 240 itens de esquadria com medida no texto. Medido na
   * planta real: 14 dos 41 tipos recebem sugestão dentro de 2 cm — 46% das
   * peças —, e 19 com 5 cm.
   *
   * ⚠️ SÓ PREENCHE O RASCUNHO. "Porta 80×210" casa com dezenas de itens —
   * madeira, alumínio, corta-fogo — e a diferença entre eles é preço, não
   * medida. Quem aplica é a pessoa, depois de olhar a descrição.
   *
   * A TOLERÂNCIA É A MESMA da unificação, de propósito: é a mesma pergunta
   * ("quanta diferença eu aceito?"), e dois campos para ela seriam dois lugares
   * para o usuário desconfiar de qual vale.
   */
  const [sugerindo, setSugerindo] = useState(false);
  async function sugerirDoCatalogo() {
    setSugerindo(true);
    try {
      const achados = await Promise.all([
        sinapiService.search('PORTA').catch(() => []),
        sinapiService.search('JANELA').catch(() => []),
      ]);
      const catalogo = achados.flat().map((i) => ({ code: i.code, description: i.description, unit: i.unit }));
      if (catalogo.length === 0) {
        setAviso('Não consegui ler o catálogo agora. Escolha o item pelo botão da linha.');
        return;
      }
      const novo: Record<string, RascunhoDeEsquadria> = { ...rascunho };
      let n = 0;
      for (const g of ordenados) {
        const v = valorDe(g);
        // Não sobrescreve item já escolhido: sugestão não desfaz decisão.
        if (v.itemCode) continue;
        const [melhor] = sugerirItens(
          { larguraMm: Math.round(g.larguraM * 1000), alturaMm: Math.round(g.alturaM * 1000) },
          g.tipo,
          catalogo,
          toleranciaMm,
        );
        if (!melhor) continue;
        novo[g.assinatura] = { ...v, itemCode: melhor.item.code, descricao: melhor.item.description };
        n += 1;
      }
      setRascunho(novo);
      setAviso(
        n === 0
          ? `Nenhum item do catálogo bate com estas medidas dentro de ${textoEmCm(toleranciaMm)} cm. Aumente a tolerância ou escolha pelo botão da linha.`
          : `${n} tipo(s) com item sugerido pela medida. ⚠️ Confira a descrição — a mesma medida serve a madeira, alumínio e corta-fogo — e clique em Aplicar.`,
      );
    } finally {
      setSugerindo(false);
    }
  }

  /** Só o que mudou em relação ao desenho — nomear tudo de novo não é um lote. */
  const pendentes = useMemo(
    () =>
      grupos.filter((g) => {
        const v = rascunho[g.assinatura];
        if (!v) return false;
        const atual = { nome: g.declarada ? g.nome : '', itemCode: g.itemCode, descricao: g.descricao };
        return v.nome.trim() !== atual.nome || v.itemCode !== atual.itemCode;
      }),
    [grupos, rascunho],
  );

  function aplicar() {
    const mudancas = pendentes
      // Nome vazio não vira esquadria: o kernel recusa, e "sem nome" é a ausência de tipo.
      .filter((g) => valorDe(g).nome.trim() !== '')
      .map((g) => {
        const v = valorDe(g);
        return {
          openingIds: g.openingIds,
          esquadria: { nome: v.nome.trim(), itemCode: v.itemCode, descricao: v.descricao } satisfies Esquadria,
        };
      });
    if (mudancas.length === 0) {
      setAviso('Nada para aplicar: dê um nome ao tipo antes.');
      return;
    }
    onAplicar(mudancas);
    setRascunho({});
    const pecas = mudancas.reduce((s, m) => s + m.openingIds.length, 0);
    setAviso(`${pecas} esquadria(s) de ${mudancas.length} tipo(s) atualizadas. Desfazer reverte tudo de uma vez.`);
  }

  /** Guarda no catálogo da organização os tipos nomeados — para a próxima planta. */
  async function salvarNoCatalogo() {
    const nomeados = grupos.filter((g) => valorDe(g).nome.trim() !== '');
    if (nomeados.length === 0) {
      setAviso('Nomeie ao menos um tipo antes de salvar no catálogo.');
      return;
    }
    const target = await resolveWriteOrg('all-allowed');
    if (!target) return;
    let ok = 0;
    let falhas = 0;
    for (const g of nomeados) {
      const v = valorDe(g);
      const r = await forEachTargetOrg(target, (org) =>
        saveOpeningType(org, {
          nome: v.nome.trim(),
          kind: g.tipo,
          widthMm: Math.round(g.larguraM * 1000),
          heightMm: Math.round(g.alturaM * 1000),
          // O peitoril não vem no quadro (não distingue tipo); o catálogo aceita 0
          // e o painel do selecionado ajusta quando importar.
          sillMm: 0,
          embutida: false,
          itemCode: v.itemCode,
          descricao: v.descricao,
        }),
      );
      ok += r.ok;
      falhas += r.failed.length;
    }
    setAviso(falhas === 0 ? `${ok} tipo(s) salvos no catálogo.` : `${ok} salvos; ${falhas} falharam.`);
    carregar();
  }

  if (grupos.length === 0) {
    return (
      <p className="text-xs text-slate-500" data-testid="esquadrias-vazio">
        Nenhuma esquadria no pavimento. Vão livre não entra: não há caixilho a orçar.
      </p>
    );
  }

  return (
    <div data-testid="painel-esquadrias">
      <p className="text-xs text-slate-600" data-testid="resumo-esquadrias-lote">
        {resumo.total} esquadria(s) em {resumo.tipos} tipo(s) · {resumo.gruposNomeados} tipo(s) com nome ·{' '}
        {resumo.gruposComItem} com item de catálogo.
      </p>
      {resumo.gruposNomeados < resumo.tipos && (
        <p className="mt-1 text-[11px] text-amber-700" data-testid="aviso-sem-tipo">
          ⚠️ Esquadria sem nome de tipo <strong>não entra no orçamento</strong> — nem como divergência. São{' '}
          {resumo.total - resumo.pecasNomeadas} peça(s) fora hoje.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={nomearAutomaticamente}
          title="Numera os tipos sem nome: P1, P2… (porta), PC1 (correr), J1 (janela), do mais numeroso ao menos. Não renomeia o que já tem nome."
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          data-testid="nomear-automaticamente"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Nomear automaticamente
        </button>
        <button
          type="button"
          onClick={sugerirDoCatalogo}
          disabled={sugerindo}
          title="Procura no catálogo (SINAPI e base própria) o item cuja medida bate com a do tipo. Só preenche o rascunho — confira a descrição antes de aplicar."
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          data-testid="sugerir-itens"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {sugerindo ? 'Procurando…' : 'Sugerir itens pela medida'}
        </button>
        <button
          type="button"
          onClick={aplicar}
          disabled={pendentes.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          data-testid="aplicar-esquadrias"
        >
          Aplicar {pendentes.length || ''} alteração(ões)
        </button>
        <button
          type="button"
          onClick={salvarNoCatalogo}
          title="Guarda os tipos nomeados no catálogo da organização, para a próxima planta"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          data-testid="salvar-tipos-catalogo"
        >
          <BookMarked className="h-3.5 w-3.5" />
          Salvar no catálogo
        </button>
      </div>

      {aviso && (
        <p className="mt-2 text-[11px] text-slate-600" role="status" data-testid="aviso-esquadrias-lote">
          {aviso}
        </p>
      )}

      {/* UNIFICAR TIPOS PRÓXIMOS (P2.50).
          ⚠️ É a única ação do módulo que muda GEOMETRIA em lote — unificar
          802 → 800 mm reescreve a abertura no desenho. Por isso a prévia vem
          antes do botão, item a item, e a tolerância é do usuário. */}
      {onUnificar && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2" data-testid="unificar-tipos">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Unificar tipos que diferem até
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={mmParaCm(toleranciaMm)}
                onChange={(e) => onTolerancia?.(cmParaMm(Number(e.target.value) || 0))}
                aria-label="Tolerância para unificar tipos (cm)"
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800"
              />
              cm
            </label>
            {onMirarCatalogo && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Mirar
                <select
                  value={mirarCatalogo ? 'CATALOGO' : 'DESENHO'}
                  onChange={(e) => onMirarCatalogo(e.target.value === 'CATALOGO')}
                  aria-label="Medida alvo da unificação"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="DESENHO">a medida do desenho</option>
                  <option value="CATALOGO">a medida de catálogo</option>
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => onUnificar(unificacoes)}
              disabled={unificacoes.length === 0}
              title="Reescreve a medida das peças absorvidas no desenho. Um passo de desfazer."
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="unificar-agora"
            >
              <Combine className="h-3.5 w-3.5" />
              Unificar {unificacoes.length || ''} agrupamento(s)
            </button>
          </div>

          {mirarCatalogo && (
            <p className="mt-1.5 text-[11px] text-blue-700" data-testid="aviso-mira-catalogo">
              ⚠️ Mirando o catálogo, <strong>todas</strong> as peças do agrupamento mudam de medida — inclusive as do
              tipo mais numeroso. O desenho passa a ter a medida que se compra.
            </p>
          )}

          {unificacoes.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-slate-500" data-testid="unificar-nada">
              Nenhum tipo a menos de {textoEmCm(toleranciaMm)} cm de outro. Aumente a tolerância para ver mais — ou
              está tudo padronizado.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-0.5" data-testid="previa-unificacao">
              {unificacoes.map((u) => (
                <li key={u.chave} className="text-[11px] text-slate-600">
                  <strong>
                    {u.grupos.map((g) => `${textoEmCm(g.larguraMm)}×${textoEmCm(g.alturaMm)}`).join(', ')}
                  </strong>{' '}
                  → {textoEmCm(u.larguraMm)}×{textoEmCm(u.alturaMm)} cm
                  {u.esquadria?.nome ? ` (${u.esquadria.nome})` : ''}
                  {/* De onde veio a medida: o desenho ou o catálogo. Com o
                      catálogo TODAS as peças mudam — inclusive as do tipo mais
                      numeroso — e a tela tem de dizer isso antes do clique. */}
                  {u.origem === 'CATALOGO' && <span className="text-blue-700"> · medida de catálogo</span>} · {u.pecas} peça(s)
                  {u.naoCabem.length > 0 && (
                    <span className="text-amber-700"> · {u.naoCabem.length} não cabe(m) e fica(m) como está</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <table className="mt-3 w-full text-left text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="py-1 pr-2 font-medium">Tipo</th>
            <th className="py-1 pr-2 text-right font-medium">L × A (cm)</th>
            <th className="py-1 pr-2 text-right font-medium">Qtd.</th>
            <th className="py-1 pr-2 font-medium">Nome</th>
            <th className="py-1 font-medium">Item</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((g) => {
            const v = valorDe(g);
            const mudou = pendentes.includes(g);
            return (
              <tr key={g.assinatura} className={`border-t border-slate-100 ${mudou ? 'bg-blue-50' : ''}`} aria-label={`Tipo ${g.nome}`}>
                <td className="py-1 pr-2">
                  <button
                    type="button"
                    onClick={() => onSelecionar(g.openingIds)}
                    title="Selecionar estas esquadrias no desenho"
                    className="text-left text-slate-700 hover:text-blue-700 hover:underline"
                  >
                    {nomeDoTipoDeAbertura(g.tipo)}
                  </button>
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-slate-600">
                  {textoEmCm(Math.round(g.larguraM * 1000))} × {textoEmCm(Math.round(g.alturaM * 1000))}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{g.quantidade}</td>
                <td className="py-1 pr-2">
                  <input
                    type="text"
                    value={v.nome}
                    onChange={(e) => editar(g, { nome: e.target.value })}
                    placeholder="P1"
                    aria-label={`Nome do tipo ${nomeDoTipoDeAbertura(g.tipo)} ${textoEmCm(Math.round(g.larguraM * 1000))}×${textoEmCm(Math.round(g.alturaM * 1000))}`}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
                  />
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => setEscolhendoItemDe(g.assinatura)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                    aria-label={`Item do tipo ${nomeDoTipoDeAbertura(g.tipo)} ${textoEmCm(Math.round(g.larguraM * 1000))}×${textoEmCm(Math.round(g.alturaM * 1000))}`}
                  >
                    <Search className="h-3 w-3" />
                    {v.itemCode || 'Escolher item'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {tipos.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          {tipos.length} tipo(s) no catálogo da organização. O painel da esquadria selecionada aplica um deles com as
          medidas dele — aqui o nome e o item entram sem mexer na geometria.
        </p>
      )}

      <DatabasePickerModal
        isOpen={escolhendoItemDe !== null}
        onClose={() => setEscolhendoItemDe(null)}
        title="Item da esquadria"
        subtitle="SINAPI ou base própria. Item em UN entra no orçamento por contagem; em m², pela área do vão."
        onSelect={(item) => {
          const g = grupos.find((x) => x.assinatura === escolhendoItemDe);
          if (g) editar(g, { itemCode: item.code, descricao: item.description });
          setEscolhendoItemDe(null);
        }}
      />

      {orgTargetModal}
    </div>
  );
}
