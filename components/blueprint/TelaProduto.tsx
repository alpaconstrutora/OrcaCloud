/**
 * A TELA "Produto" do Estudo de Massa (fase M2): o que se vende — semente,
 * padrão construtivo (as chaves do CUB do Estimador), meta de unidades, o mix
 * de tipologias editável na linha, as hipóteses de perda do pavimento e as
 * hipóteses financeiras.
 *
 * Era gaveta até 03/10/2026 (*"o drawer produto deve ser transformado em
 * tela"*): a tabela de tipologias e os dois blocos de hipóteses (16 campos)
 * não cabiam na largura de um drawer sem rolar a página inteira. Na tela, o
 * produto ocupa um card, as tipologias a largura toda, e pavimento e
 * financeiro ficam lado a lado — desde 04/10/2026 em duas abas: "Produto e
 * tipologias" e "Hipóteses".
 *
 * Apresentacional: o produto vem de `useBlueprintProduto` (do ESTUDO, gravado
 * com respiro); a distribuição na massa aparece na tela "Estudo de massa".
 */
import React, { useMemo, useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { BASE_CUB_RATES, CUB_STANDARDS_DATA } from '../../constants';
import type { CubDoPadrao } from '../../services/cubService';
import {
  PADROES_DO_PRODUTO,
  ROTULO_DO_USO_DA_TIPOLOGIA,
  SEMENTES_DO_PRODUTO,
  USOS_DA_TIPOLOGIA,
  problemasDoProduto,
  produtoSemente,
  tipologiaNova,
  type HipotesesDoProduto,
  type HipotesesFinanceiras,
  type PadraoDoProduto,
  type Produto,
  type SementeDoProduto,
  type TipologiaDoProduto,
  type UsoDaTipologia,
} from '../../utils/blueprintProduto';
import { ROTULO_DO_ARRANJO, type ArranjoDasVagas } from '../../utils/blueprintVagasAutomaticas';
import { produtoDoEmpreendimento, type TorreParaOProduto } from '../../utils/blueprintProdutoDoEmpreendimento';
import MoneyCentsInput from '../ui/MoneyCentsInput';

interface Props {
  produto: Produto;
  onProduto: (p: Produto | ((atual: Produto) => Produto)) => void;
  persistenciaIndisponivel: boolean;
  erroDeGravacao: string | null;
  /** M3: o CUB do padrão na UF (null = carregando ou sem consulta). */
  cub?: CubDoPadrao | null;
  /**
   * 25/10/2026 ("construir através dos dados de incorporação > empreendimento"): o Empreendimento ligado ao estudo,
   * para "Importar do Empreendimento" — o mix sai das Torres & Unidades. `torres: null` = carregando; ausente = sem
   * empreendimento ligado.
   */
  empreendimento?: { nome: string; torres: TorreParaOProduto[] | null } | null;
  /** O que o editor preencheu sozinho (produto vazio + empreendimento vinculado), para a tela dizer. */
  avisoDoEmpreendimento?: string | null;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Tipologia', sortable: true, width: 170 },
  { key: 'uso', label: 'Uso', sortable: true, width: 130 },
  { key: 'dormitorios', label: 'Dorm.', sortable: true, width: 80, align: 'right' },
  { key: 'area', label: 'Área privativa (m²)', sortable: true, width: 150, align: 'right' },
  { key: 'vagas', label: 'Vagas/un.', sortable: true, width: 100, align: 'right' },
  { key: 'mix', label: 'Mix (%)', sortable: true, width: 90, align: 'right' },
  { key: 'preco', label: 'Preço (R$/m²)', sortable: true, width: 130, align: 'right' },
];

const UFS = Object.keys(BASE_CUB_RATES).sort();
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

/** Campo editável dentro da célula — §7.1: mesma tipografia do TD. */
const celula = 'h-8 w-full rounded border border-gray-100 bg-gray-50 px-2 text-sm font-normal text-gray-900';
const campo = 'h-9 w-full rounded-[6px] border border-gray-200 bg-white px-2 text-sm font-normal text-gray-800';

function numeroDe(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

type AbaDoProduto = 'PRODUTO' | 'HIPOTESES';
const ABAS_DO_PRODUTO: TabsBarItem<AbaDoProduto>[] = [
  { id: 'PRODUTO', label: 'Produto e tipologias' },
  { id: 'HIPOTESES', label: 'Hipóteses' },
];

export default function TelaProduto({ produto: p, onProduto, persistenciaIndisponivel, erroDeGravacao, cub = null, empreendimento = null, avisoDoEmpreendimento = null }: Props) {
  const confirmar = useConfirm();
  const [semente, setSemente] = useState<SementeDoProduto>('RESIDENCIAL_MEDIO');
  const [avisosDaImportacao, setAvisosDaImportacao] = useState<string[] | null>(null);
  const importacao = useMemo(() => (empreendimento?.torres ? produtoDoEmpreendimento(empreendimento.torres, p) : null), [empreendimento, p]);
  const motivoSemImportar = !empreendimento
    ? 'A planta não está ligada a um Empreendimento — vincule pela lista da Planta (Editar) ou pelo formulário do Empreendimento.'
    : !empreendimento.torres
      ? 'Carregando as Torres & Unidades do Empreendimento…'
      : (importacao?.motivo ?? null);
  const problemas = problemasDoProduto(p);
  // A aba escolhida fica guardada neste navegador; o valor guardado pode ser de uma versão com outras abas.
  const [aba, setAba] = usePersistedState<AbaDoProduto>('blueprint:produto:aba', 'PRODUTO');
  const abaValida: AbaDoProduto = ABAS_DO_PRODUTO.some((a) => a.id === aba) ? aba : 'PRODUTO';
  const h = p.hipoteses;

  const atualizarTipologia = (id: string, patch: Partial<TipologiaDoProduto>) =>
    onProduto((atual) => ({ ...atual, tipologias: atual.tipologias.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const hip = <K extends keyof HipotesesDoProduto>(k: K, v: HipotesesDoProduto[K]) => onProduto((atual) => ({ ...atual, hipoteses: { ...atual.hipoteses, [k]: v } }));
  const fin = <K extends keyof HipotesesFinanceiras>(k: K, v: HipotesesFinanceiras[K]) => onProduto((atual) => ({ ...atual, financeiro: { ...atual.financeiro, [k]: v } }));
  const f = p.financeiro;

  async function aplicarSemente() {
    if (p.tipologias.length > 0) {
      const ok = await confirmar({ title: 'Substituir o produto?', message: `As ${p.tipologias.length} tipologia(s) atuais e as hipóteses dão lugar à semente "${SEMENTES_DO_PRODUTO[semente]}".`, variant: 'warning', confirmLabel: 'Substituir' });
      if (!ok) return;
    }
    onProduto(produtoSemente(semente));
  }

  async function importarDoEmpreendimento() {
    if (!empreendimento || !importacao?.produto) return;
    if (p.tipologias.length > 0) {
      const ok = await confirmar({
        title: 'Substituir as tipologias?',
        message: `As ${p.tipologias.length} tipologia(s) atuais e a meta dão lugar às do Empreendimento "${empreendimento.nome}". Padrão, hipóteses e financeiro ficam.`,
        variant: 'warning',
        confirmLabel: 'Substituir',
      });
      if (!ok) return;
    }
    onProduto(importacao.produto);
    setAvisosDaImportacao(importacao.avisos);
  }

  function novaTipologia() {
    onProduto((atual) => ({ ...atual, tipologias: [...atual.tipologias, tipologiaNova(atual)] }));
  }

  return (
    <div className="space-y-6 text-sm text-gray-700" data-testid="tela-produto">
      {(persistenciaIndisponivel || erroDeGravacao) && (
        <p role="status" className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {persistenciaIndisponivel ? 'Sem gravação no banco: o produto vale só nesta sessão.' : `Não gravou o produto: ${erroDeGravacao}`}
        </p>
      )}

      {/* ABAS (04/10/2026): o pedido foi *"duas abas: 1. Produto + tipologia 2. hipoteses"*. O preço/m² (que alimenta
          o VGV) está na tabela, na primeira aba; a segunda junta as hipóteses do pavimento e as financeiras. */}
      <TabsBar tabs={ABAS_DO_PRODUTO} value={abaValida} onChange={setAba} />

      {abaValida === 'PRODUTO' && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">Produto</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 2xl:grid-cols-4">
              <div className="space-y-1.5">
                <label htmlFor="produto-semente" className="text-xs font-semibold text-slate-500">Começar de uma semente</label>
                <div className="flex gap-2">
                  <select id="produto-semente" value={semente} onChange={(e) => setSemente(e.target.value as SementeDoProduto)} className={campo}>
                    {(Object.keys(SEMENTES_DO_PRODUTO) as SementeDoProduto[]).map((s) => (
                      <option key={s} value={s}>{SEMENTES_DO_PRODUTO[s]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void aplicarSemente()} className="h-9 shrink-0 rounded-[6px] border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
                    Aplicar
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="produto-nome" className="text-xs font-semibold text-slate-500">Nome</label>
                <input id="produto-nome" type="text" maxLength={60} value={p.nome} onChange={(e) => onProduto((a) => ({ ...a, nome: e.target.value }))} className={campo} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="produto-padrao" className="text-xs font-semibold text-slate-500">Padrão construtivo (CUB)</label>
                <select id="produto-padrao" value={p.padrao} onChange={(e) => onProduto((a) => ({ ...a, padrao: e.target.value as PadraoDoProduto }))} className={campo}>
                  {PADROES_DO_PRODUTO.map((k) => (
                    <option key={k} value={k}>{CUB_STANDARDS_DATA[k]?.label ?? k}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="produto-meta" className="text-xs font-semibold text-slate-500">Meta de unidades</label>
                <input
                  id="produto-meta"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="sem meta"
                  value={p.metaUnidades ?? ''}
                  onChange={(e) => onProduto((a) => ({ ...a, metaUnidades: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) || null }))}
                  className={campo}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => void importarDoEmpreendimento()}
                disabled={!!motivoSemImportar}
                title={motivoSemImportar ?? `Tipologias, mix, área, vagas, preço/m² e meta pelas unidades de "${empreendimento?.nome}"`}
                data-testid="importar-do-empreendimento"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Building2 className="h-[15px] w-[15px]" /> {empreendimento ? `Importar do Empreendimento "${empreendimento.nome}"` : 'Importar do Empreendimento'}
              </button>
              <p className="text-xs text-gray-500">{motivoSemImportar ?? 'As tipologias e o mix saem das Torres & Unidades; padrão, hipóteses e financeiro ficam como estão.'}</p>
            </div>
            {(avisoDoEmpreendimento || (avisosDaImportacao && avisosDaImportacao.length > 0)) && (
              <ul className="space-y-0.5 text-xs text-gray-600" data-testid="avisos-da-importacao">
                {avisoDoEmpreendimento && <li>{avisoDoEmpreendimento}</li>}
                {(avisosDaImportacao ?? []).map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
            {problemas.length > 0 && (
              <ul className="space-y-0.5 text-xs text-amber-700" data-testid="problemas-do-produto">
                {problemas.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Tipologias e mix</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  A tela <strong className="font-semibold">Estudo de massa</strong> reparte este mix pelos blocos — depois de reservar núcleo, paredes e corredor — e confere as vagas.
                </p>
              </div>
              <button type="button" onClick={novaTipologia} className="flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-[13px] font-medium text-white hover:bg-blue-700">
                <Plus className="h-[15px] w-[15px]" /> Nova tipologia
              </button>
            </div>
            {/* Sem busca: poucas tipologias por estudo. */}
            <StandardTable<TipologiaDoProduto>
              storageKey="blueprint:massa:tipologias"
              columns={COLUNAS}
              rows={p.tipologias}
              rowKey={(x) => x.id}
              dense
              sortValue={(k, x) => (k === 'nome' ? x.nome : k === 'uso' ? x.uso : k === 'dormitorios' ? x.dormitorios : k === 'area' ? x.areaPrivativaM2 : k === 'vagas' ? x.vagasPorUnidade : k === 'preco' ? x.precoM2 : x.proporcaoPct)}
              renderCell={(k, x) => {
                if (k === 'nome') return <input aria-label={`Nome da tipologia ${x.nome}`} type="text" maxLength={40} value={x.nome} onChange={(e) => atualizarTipologia(x.id, { nome: e.target.value })} className={celula} />;
                if (k === 'uso')
                  return (
                    <select aria-label={`Uso da tipologia ${x.nome}`} value={x.uso} onChange={(e) => atualizarTipologia(x.id, { uso: e.target.value as UsoDaTipologia })} className={celula}>
                      {USOS_DA_TIPOLOGIA.map((u) => <option key={u} value={u}>{ROTULO_DO_USO_DA_TIPOLOGIA[u]}</option>)}
                    </select>
                  );
                const num = (valor: number, campoDe: keyof TipologiaDoProduto, step: number, rotulo: string) => (
                  <input
                    aria-label={`${rotulo} — ${x.nome}`}
                    type="number"
                    min={0}
                    step={step}
                    value={valor}
                    onChange={(e) => {
                      const v = numeroDe(e.target.value);
                      if (v !== null && v >= 0) atualizarTipologia(x.id, { [campoDe]: v } as Partial<TipologiaDoProduto>);
                    }}
                    className={`${celula} text-right`}
                  />
                );
                if (k === 'dormitorios') return num(x.dormitorios, 'dormitorios', 1, 'Dormitórios');
                if (k === 'area') return num(x.areaPrivativaM2, 'areaPrivativaM2', 1, 'Área privativa');
                if (k === 'vagas') return num(x.vagasPorUnidade, 'vagasPorUnidade', 0.5, 'Vagas por unidade');
                if (k === 'preco') return <MoneyCentsInput aria-label={`Preço por m² — ${x.nome}`} value={x.precoM2} onChange={(v) => atualizarTipologia(x.id, { precoM2: v === '' ? 0 : Number(v) })} className={`${celula} text-right`} />;
                return num(x.proporcaoPct, 'proporcaoPct', 5, 'Participação no mix');
              }}
              actions={{ width: 70, render: (x) => <ActionIconButton kind="delete" title={`Remover ${x.nome}`} onClick={() => onProduto((a) => ({ ...a, tipologias: a.tipologias.filter((y) => y.id !== x.id) }))} /> }}
              empty={{ title: 'Nenhuma tipologia', subtitle: 'Aplique uma semente ou crie a primeira.' }}
            />
            <p className="text-xs text-gray-500">O mix é em número de unidades e se normaliza por uso. Bloco residencial recebe as residenciais; comercial, as comerciais; misto, as duas.</p>
          </section>
        </div>
      )}

      {abaValida === 'HIPOTESES' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="space-y-4 rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm" data-testid="hipoteses-do-produto">
            <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">Hipóteses do pavimento</h3>
            <p className="text-xs text-gray-500">Referências de pré-projeto, não norma. O núcleo desenhado (shaft, elevador, escada dentro do bloco) substitui a hipótese.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {(
                [
                  ['paredesPct', 'Paredes e fachada (% da bruta)', 0.5],
                  ['circulacaoPct', 'Corredor do andar (% da útil)', 0.5],
                  ['nucleoBaseM2', 'Escada + hall + shafts (m²/pav)', 1],
                  ['elevadorM2', 'Por elevador (m²/pav)', 0.5],
                  ['pavimentosParaElevador', '1 elevador a partir de (pav.)', 1],
                  ['pavimentosParaSegundoElevador', '2 elevadores a partir de (pav.)', 1],
                  ['areaComumTerreoM2', 'Portaria/hall no térreo (m²)', 5],
                  // Folgas da garagem (04/10/2026, eram fixas no lançador de vagas).
                  ['recuoDasVagasMm', 'Vagas: afastamento do contorno (mm, mín. 100)', 50],
                  ['folgaDaFilaMm', 'Vagas em fila: manobra entre vagas (mm)', 100],
                ] as const
              ).map(([k, rotulo, step]) => (
                <div key={k} className="space-y-1.5">
                  <label htmlFor={`produto-h-${k}`} className="text-xs font-semibold text-slate-500">{rotulo}</label>
                  <input
                    id={`produto-h-${k}`}
                    type="number"
                    min={0}
                    step={step}
                    value={h[k]}
                    onChange={(e) => {
                      const v = numeroDe(e.target.value);
                      if (v !== null && v >= 0) hip(k, v);
                    }}
                    className={campo}
                  />
                </div>
              ))}
              <div className="space-y-1.5">
                <label htmlFor="produto-h-arranjo" className="text-xs font-semibold text-slate-500">Arranjo das vagas</label>
                <select id="produto-h-arranjo" value={h.arranjoDasVagas} onChange={(e) => hip('arranjoDasVagas', e.target.value as ArranjoDasVagas)} className={campo}>
                  {(Object.keys(ROTULO_DO_ARRANJO) as ArranjoDasVagas[]).map((a) => <option key={a} value={a}>{ROTULO_DO_ARRANJO[a]}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm" data-testid="financeiro-do-produto">
            <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">Financeiro — hipóteses de pré-viabilidade</h3>
            <p className="text-xs text-gray-500" data-testid="cub-do-padrao">
              {f.custoM2Manual
                ? `Custo de obra digitado: ${brl(f.custoM2Manual)}/m² (o CUB não é usado).`
                : cub
                  ? `CUB ${p.padrao}/${f.uf}: ${brl(cub.valorM2)}/m² ${cub.fonte === 'TABELA' ? `(${cub.referencia})` : '(estimado: base da UF × multiplicador do padrão — não está na tabela)'} + ${f.acrescimosSobreCubPct.toLocaleString('pt-BR')} % de itens fora do CUB = ${brl(cub.valorM2 * (1 + f.acrescimosSobreCubPct / 100))}/m².`
                  : `Buscando o CUB ${p.padrao}/${f.uf}…`}{' '}
              Fluxo de caixa, TIR e VPL ficam na Viabilidade, que recebe o cenário pelo Empreendimento.
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1.5">
                <label htmlFor="produto-f-uf" className="text-xs font-semibold text-slate-500">UF do CUB</label>
                <select id="produto-f-uf" value={f.uf} onChange={(e) => fin('uf', e.target.value)} className={campo}>
                  {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="produto-f-manual" className="text-xs font-semibold text-slate-500">Custo de obra digitado (R$/m²)</label>
                <MoneyCentsInput
                  id="produto-f-manual"
                  placeholder="pelo CUB"
                  value={f.custoM2Manual}
                  onChange={(v) => fin('custoM2Manual', v === '' ? null : Math.max(0, Number(v)) || null)}
                  className={campo}
                />
              </div>
              {(
                [
                  ['acrescimosSobreCubPct', 'Itens fora do CUB (% sobre o CUB)', 1],
                  ['fatorGaragem', 'Custo relativo da garagem (×)', 0.05],
                  ['fatorSubsolo', 'Custo relativo do subsolo (×)', 0.05],
                  ['terrenoR$', 'Terreno (R$)', 10000],
                  ['despesasComerciaisPct', 'Corretagem e marketing (% VGV)', 0.5],
                  ['impostosPct', 'Tributos (% VGV)', 0.5],
                  ['outrasDespesasPct', 'Incorporação, projetos, legal (% VGV)', 0.5],
                ] as const
              ).map(([k, rotulo, step]) => (
                <div key={k} className="space-y-1.5">
                  <label htmlFor={`produto-f-${k}`} className="text-xs font-semibold text-slate-500">{rotulo}</label>
                  {k === 'terrenoR$' ? (
                    <MoneyCentsInput
                      id={`produto-f-${k}`}
                      value={f[k]}
                      onChange={(v) => fin(k, v === '' ? 0 : Number(v))}
                      className={campo}
                    />
                  ) : (
                  <input
                    id={`produto-f-${k}`}
                    type="number"
                    min={0}
                    step={step}
                    value={f[k]}
                    onChange={(e) => {
                      const v = numeroDe(e.target.value);
                      if (v !== null && v >= 0) fin(k, v);
                    }}
                    className={campo}
                  />
                  )}
                </div>
              ))}
            </div>
          </section>
          </div>
      )}
    </div>
  );
}
