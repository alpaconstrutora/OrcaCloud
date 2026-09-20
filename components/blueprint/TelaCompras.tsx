/**
 * PLANTA → COMPRAS (20/09/2026, roadmap E10.3) — a tela in-flow que fecha a
 * cadeia "planta → quantitativo → orçamento → cronograma → compras": as linhas
 * que a planta gera no orçamento, explodidas em insumos, datadas pelo cronograma
 * da obra e lançadas no Plano de Aquisições (a MESMA tabela que Suprimentos ›
 * Plano de Aquisições lê); dali, uma cotação num clique.
 *
 * PREVER e LANÇAR são passos separados de propósito, como no orçamento: lançar
 * substitui o que esta planta já havia posto no plano, e ninguém deveria
 * descobrir o que vai ser substituído depois.
 */
import React, { useMemo, useState } from 'react';
import { CalendarDays, FileText, ShoppingCart, Warehouse } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { useConfirm } from '../ui/confirm';
import type { PreviaDeCompras } from '../../services/blueprintComprasService';
import type { InsumoDatado } from '../../utils/blueprintCompras';
import { memoriaDoInsumo } from '../../utils/blueprintCompras';

interface Props {
  /** Obra vinculada ao estudo (Analisar › Orçamento vincula). `null` = nada a fazer aqui. */
  obra: { id: string; nome: string } | null;
  /** Há versão publicada? Sem ela não há linha de orçamento — nem insumo. */
  temVersaoPublicada: boolean;
  dataPadrao: string;
  onDataPadrao: (iso: string) => void;
  previa: PreviaDeCompras | null;
  ocupado: boolean;
  erro: string | null;
  onPrever: () => Promise<void>;
  onLancar: () => Promise<{ removidas: number; inseridas: number }>;
  onCotar: () => Promise<{ quotationNumber: string }>;
  /** Ids lançados na última operação — só então a cotação faz sentido. */
  lancados: number;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'insumo', label: 'Insumo', width: 320 },
  { key: 'unidade', label: 'Un.', width: 60 },
  { key: 'quantidade', label: 'Quantidade', width: 110, align: 'right' },
  { key: 'estoque', label: 'Em estoque', width: 100, align: 'right' },
  { key: 'comprar', label: 'A comprar', width: 110, align: 'right' },
  { key: 'custo', label: 'Custo unit.', width: 110, align: 'right' },
  { key: 'total', label: 'Total', width: 120, align: 'right' },
  { key: 'necessario', label: 'Necessário em', width: 130 },
  { key: 'comprarAte', label: 'Comprar até', width: 120 },
  { key: 'origens', label: 'Linhas da planta', width: 130, align: 'right' },
];

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export default function TelaCompras({ obra, temVersaoPublicada, dataPadrao, onDataPadrao, previa, ocupado, erro, onPrever, onLancar, onCotar, lancados }: Props) {
  const confirmar = useConfirm();
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const linhas = useMemo(() => previa?.insumos ?? [], [previa]);
  const podePrever = Boolean(obra) && temVersaoPublicada && !ocupado;

  async function lancar() {
    if (!previa) return;
    const substitui = previa.noPlano.pendentes;
    const ok = await confirmar({
      title: 'Lançar no Plano de Aquisições',
      message:
        `${previa.resumo.insumos} insumo(s) entram no plano da obra "${obra?.nome ?? ''}" como pendentes` +
        (substitui > 0 ? `, substituindo ${substitui} item(ns) pendente(s) que esta planta já havia lançado.` : '.') +
        (previa.noPlano.emAndamento > 0 ? ` ${previa.noPlano.emAndamento} item(ns) já em cotação ou pedido ficam como estão.` : ''),
      confirmLabel: 'Lançar',
    });
    if (!ok) return;
    setFalha(null);
    try {
      const r = await onLancar();
      setAviso(`${r.inseridas} item(ns) no Plano de Aquisições da obra` + (r.removidas > 0 ? `, substituindo ${r.removidas} pendente(s) anteriores.` : '.'));
    } catch (e) {
      setFalha(e instanceof Error ? e.message : String(e));
    }
  }

  async function cotar() {
    const ok = await confirmar({
      title: 'Abrir cotação',
      message: `Cria uma Solicitação de Cotação (Suprimentos › Cotações) com os ${lancados} item(ns) recém-lançados e os marca como "em cotação" no plano. Fornecedores são convidados depois, na cotação.`,
      confirmLabel: 'Abrir cotação',
    });
    if (!ok) return;
    setFalha(null);
    try {
      const r = await onCotar();
      setAviso(`Cotação ${r.quotationNumber} aberta com ${lancados} item(ns). Convide os fornecedores em Suprimentos › Cotações.`);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4" data-testid="tela-compras">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="cabecalho-de-compras">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <p className="text-xs font-medium text-slate-600">Obra</p>
            <p className="mt-1 text-sm font-semibold text-slate-800" data-testid="obra-de-compras">{obra ? obra.nome : 'Nenhuma obra vinculada'}</p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Necessário em (quando o cronograma não data a linha)
            <input type="date" value={dataPadrao} onChange={(e) => onDataPadrao(e.target.value)} aria-label="Data padrão de necessidade" className="h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-slate-800" />
          </label>
          <button type="button" disabled={!podePrever} onClick={() => { setAviso(null); setFalha(null); void onPrever(); }} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="prever-compras">
            <ShoppingCart className="h-4 w-4" /> {ocupado ? 'Calculando…' : 'Prever compras'}
          </button>
        </div>
        {!obra && (
          <p className="mt-2 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="aviso-sem-obra">
            Vincule esta planta a uma obra em Analisar › Orçamento: o plano de aquisições é da obra, e é o cronograma dela que data as compras.
          </p>
        )}
        {obra && !temVersaoPublicada && (
          <p className="mt-2 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="aviso-sem-versao">
            Publique uma versão antes — insumo não sai de rascunho, pelo mesmo motivo que o orçamento não sai.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          As linhas que a planta gera no orçamento (de-para, camadas, acabamentos, guarda-corpos, esquadrias) são abertas pela composição do catálogo em <strong>materiais e equipamentos</strong> — mão de obra não entra. A data de cada insumo é o início da tarefa da linha no cronograma da obra; sem tarefa datada vale a data acima. O prazo de entrega vem de Suprimentos › Prazos por fornecedor; o estoque, do Almoxarifado.
        </p>
      </div>

      {erro && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="erro-de-compras">{erro}</p>}
      {falha && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="falha-de-compras">{falha}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="aviso-de-compras">{aviso}</p>}

      {previa && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="resumo-de-compras">
            {([
              ['Insumos', String(previa.resumo.insumos), ShoppingCart],
              ['Linhas da planta', String(previa.resumo.linhasDaPlanta), FileText],
              ['Datados pelo cronograma', `${previa.resumo.datadosPeloCronograma} de ${previa.resumo.insumos}`, CalendarDays],
              ['Total estimado', brl(previa.resumo.totalEstimado), Warehouse],
            ] as const).map(([rotulo, valor, Icone]) => (
              <div key={rotulo} className="rounded-[10px] border border-slate-200 bg-white p-3">
                <p className="flex items-center gap-1.5 text-xs text-slate-500"><Icone className="h-3.5 w-3.5" /> {rotulo}</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">{valor}</p>
              </div>
            ))}
          </div>

          {(previa.explosao.semComposicao.length > 0 || previa.explosao.soMaoDeObra > 0 || previa.tarefasDatadas === 0) && (
            <div className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="avisos-de-compras">
              {previa.tarefasDatadas === 0 && <p>A obra não tem tarefa datada no cronograma: todos os insumos ficaram em {dataBr(dataPadrao)}.</p>}
              {previa.explosao.soMaoDeObra > 0 && <p>{previa.explosao.soMaoDeObra} linha(s) só têm mão de obra na composição — nada a comprar.</p>}
              {previa.explosao.semComposicao.length > 0 && (
                <details>
                  <summary className="cursor-pointer">{previa.explosao.semComposicao.length} linha(s) sem composição no catálogo ficaram de fora</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {previa.explosao.semComposicao.map((l) => (
                      <li key={l.linhaId}>{l.descricao} — {num(l.quantidade, 3)} {l.unidade}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {(previa.noPlano.pendentes > 0 || previa.noPlano.emAndamento > 0) && (
            <p className="text-xs text-slate-600" data-testid="no-plano">
              Esta planta já tem {previa.noPlano.pendentes} item(ns) pendente(s) no plano da obra (lançar de novo os substitui) e {previa.noPlano.emAndamento} em cotação/pedido (ficam).
            </p>
          )}

          <StandardTable<InsumoDatado>
            columns={COLUNAS}
            storageKey="blueprint:compras"
            rows={linhas}
            rowKey={(i) => i.chave}
            empty={{ title: 'Nenhum insumo', subtitle: 'As linhas da planta não têm composição de material no catálogo — confira o de-para em Analisar › Orçamento.' }}
            toolbarRight={
              <div className="flex items-center gap-2">
                <button type="button" disabled={ocupado || linhas.length === 0} onClick={() => void lancar()} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="lancar-no-plano">
                  <ShoppingCart className="h-4 w-4" /> Lançar no Plano de Aquisições
                </button>
                <button type="button" disabled={ocupado || lancados === 0} onClick={() => void cotar()} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:text-slate-400" data-testid="abrir-cotacao" title={lancados === 0 ? 'Lance no plano primeiro' : `Cotação com os ${lancados} item(ns) lançados`}>
                  <FileText className="h-4 w-4" /> Abrir cotação
                </button>
              </div>
            }
            renderCell={(key, i) => {
              switch (key) {
                case 'insumo':
                  return (
                    <span className="text-sm text-gray-800">
                      {i.codigo && <code className="mr-1 text-[11px] text-slate-500">{i.codigo}</code>}
                      {i.descricao}
                      {i.direto && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">compra direta</span>}
                    </span>
                  );
                case 'unidade':
                  return <span className="text-xs text-gray-600">{i.unidade}</span>;
                case 'quantidade':
                  return <span className="text-sm text-gray-800">{num(i.quantidade, 3)}</span>;
                case 'estoque':
                  return <span className="text-sm text-gray-600">{i.emEstoque > 0 ? num(i.emEstoque, 3) : '—'}</span>;
                case 'comprar':
                  return <span className="text-sm font-medium text-gray-800">{num(i.aComprar, 3)}</span>;
                case 'custo':
                  return <span className="text-sm text-gray-700">{i.custoUnitario > 0 ? brl(i.custoUnitario) : '—'}</span>;
                case 'total':
                  return <span className="text-sm text-gray-800">{brl(i.aComprar * i.custoUnitario)}</span>;
                case 'necessario':
                  return (
                    <span className={`text-sm ${i.doCronograma ? 'text-gray-800' : 'text-gray-500'}`} title={i.doCronograma ? 'Início da tarefa no cronograma da obra' : 'Data padrão — linha sem tarefa datada'}>
                      {dataBr(i.necessarioEm)}{!i.doCronograma && ' *'}
                    </span>
                  );
                case 'comprarAte':
                  return <span className="text-sm text-gray-700" title={i.prazoDias > 0 ? `${i.prazoDias} dia(s) de prazo do fornecedor` : 'Sem prazo cadastrado'}>{dataBr(i.comprarAte)}</span>;
                case 'origens':
                  return <span className="cursor-help text-sm text-gray-700 underline decoration-dotted" title={memoriaDoInsumo(i)}>{i.origens.length}</span>;
                default:
                  return null;
              }
            }}
          />
          <p className="text-[11px] text-slate-500">* data padrão (sem tarefa datada no cronograma). Passe o mouse em "Linhas da planta" para ver a memória de cálculo; ela também vai nas observações de cada item do plano.</p>
        </>
      )}
    </div>
  );
}
