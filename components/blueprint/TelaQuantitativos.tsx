import React, { useMemo } from 'react';
import { Calculator } from 'lucide-react';
import { nomeDoTipoEstrutural, type computeQuantities } from '../../utils/blueprintKernel';
import type { ArmaduraQuantificada } from '../../utils/blueprintArmadura';
import type { BlueprintQuantitySnapshot } from '../../types/blueprint';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';

/**
 * TELA de Quantitativos (17/09/2026: *"Analisar < quantitativos: criar nova
 * tela também em vez de drawer"*).
 *
 * Era um drawer (`PainelQuantitativos`) com `<dl>` e cartões; virou tela em
 * fluxo, como a Armadura e o Quadro de cargas: cabeçalho com voltar (no
 * editor), a faixa OFICIAL × AO VIVO, `TabsBar` §19.1 + `StandardTable` §5.2.
 * Abas: **Resumo** (os totais, uma grandeza por linha, com a decomposição por
 * material e o aço esquemático), **Por ambiente**, **Por peça estrutural**
 * (clique seleciona no desenho) e **Sobreposições** (o volume que duas peças
 * dividem — a linha "contado duas vezes" é a razão da aba existir).
 *
 * O CONTEÚDO não mudou de sentido: cada regra de "só aparece se houver" do
 * painel antigo virou uma linha condicional aqui — quatro zeros empilhados
 * continuam sendo ruído numa planta sem estrutura.
 */

type Quant = ReturnType<typeof computeQuantities>;
type AbaDosQuantitativos = 'resumo' | 'ambientes' | 'estruturas' | 'sobreposicoes';

interface LinhaDoResumo {
  chave: string;
  grupo: 'Arquitetura' | 'Estrutura' | 'Aço' | 'Material';
  item: string;
  valor: number;
  unidade: string;
  detalhe: string;
  forte?: boolean;
}

const COLUNAS_RESUMO: StandardTableColumn[] = [
  { key: 'grupo', label: 'Grupo', width: 120 },
  { key: 'item', label: 'Item', width: 260 },
  { key: 'valor', label: 'Quantidade', width: 130, align: 'right' },
  { key: 'unidade', label: 'Unidade', width: 90 },
  { key: 'detalhe', label: 'Detalhe', width: 360, sortable: false },
];
const COLUNAS_AMBIENTE: StandardTableColumn[] = [
  { key: 'nome', label: 'Ambiente', width: 200 },
  { key: 'areaPisoM2', label: 'Piso (m²)', width: 110, align: 'right' },
  { key: 'areaEixoM2', label: 'Eixo (m²)', width: 110, align: 'right' },
  { key: 'areaEstruturaM2', label: 'Pilares (− m²)', width: 120, align: 'right' },
  { key: 'comprimentoRodapeM', label: 'Rodapé (m)', width: 110, align: 'right' },
  { key: 'formulaAreaPiso', label: 'Fórmula da área de piso', width: 380, sortable: false },
];
const COLUNAS_ESTRUTURA: StandardTableColumn[] = [
  { key: 'rotulo', label: 'Peça', width: 120 },
  { key: 'tipo', label: 'Tipo', width: 150 },
  { key: 'volumeConcretoM3', label: 'Concreto (m³)', width: 120, align: 'right' },
  { key: 'areaFormaM2', label: 'Fôrma (m²)', width: 110, align: 'right' },
  { key: 'kg', label: 'Aço (kg)', width: 100, align: 'right' },
  { key: 'aco', label: 'Esquema do aço', width: 260, sortable: false },
  { key: 'formula', label: 'Fórmula', width: 360, sortable: false },
];
const COLUNAS_SOBREPOSICAO: StandardTableColumn[] = [
  { key: 'volumeM3', label: 'Volume (m³)', width: 120, align: 'right' },
  { key: 'situacao', label: 'Situação', width: 220 },
  { key: 'explicacao', label: 'O que fazer', width: 520, sortable: false },
];

interface Props {
  quant: Quant;
  /** O aço esquemático — mesma conta do orçamento; opcional para quem lê só o concreto. */
  armadura?: ArmaduraQuantificada;
  revisao: number;
  oficial: BlueprintQuantitySnapshot | null;
  gerando: boolean;
  onGerar: () => void;
  dirty: boolean;
  /** Selecionar a peça no desenho a partir da linha. */
  onSelecionarPeca?: (id: string) => void;
}

type Fmt = (v: number) => string;
const num = (fmt: Fmt, v: number) => <span className="block text-right text-sm tabular-nums text-gray-700">{fmt(v)}</span>;

export default function TelaQuantitativos({ quant, armadura, revisao, oficial, gerando, onGerar, dirty, onSelecionarPeca }: Props) {
  const t = quant.totais;
  // As casas vêm da POLÍTICA (é ela que define o arredondamento do quantitativo);
  // o separador é o do pt-BR — `formatarQuantidade` do kernel devolve `toFixed`
  // com ponto, que serve ao payload, não à tela.
  const casas = quant.policy.casas;
  const fmt = useMemo<Fmt>(
    () => (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }),
    [casas],
  );
  const [aba, setAba] = usePersistedState<AbaDosQuantitativos>('blueprint:quantitativos:aba', 'resumo');

  const resumo = useMemo<LinhaDoResumo[]>(() => {
    const linhas: LinhaDoResumo[] = [];
    const add = (l: Omit<LinhaDoResumo, 'chave'>) => linhas.push({ ...l, chave: `${l.grupo}:${l.item}` });
    if (quant.ambientes.length > 0) {
      add({ grupo: 'Arquitetura', item: 'Área de piso', valor: t.areaPisoM2, unidade: 'm²', detalhe: 'Pela face interna, já descontada a seção dos pilares', forte: true });
      add({ grupo: 'Arquitetura', item: `Piso + perda ${(quant.policy.perdaRevestimento * 100).toFixed(0)}%`, valor: t.areaPisoComPerdaM2, unidade: 'm²', detalhe: 'Área de revestimento a comprar' });
      add({ grupo: 'Arquitetura', item: 'Parede (2 faces)', valor: t.areaParedeDuasFacesM2, unidade: 'm²', detalhe: 'Área líquida de face, descontadas as aberturas', forte: true });
      add({ grupo: 'Arquitetura', item: 'Alvenaria', valor: t.volumeAlvenariaM3, unidade: 'm³', detalhe: 'Volume das paredes, descontadas aberturas e o que cede à estrutura' });
      // POR MATERIAL: a decomposição da alvenaria — só quando alguma parede tem composição.
      for (const m of t.porMaterial) {
        add({ grupo: 'Material', item: m.descricao || m.itemCode || 'Sem material', valor: m.volumeM3, unidade: 'm³', detalhe: `${fmt(m.areaFaceM2)} m² de face · função ${m.funcao}` });
      }
      add({ grupo: 'Arquitetura', item: 'Rodapé', valor: t.comprimentoRodapeM, unidade: 'm', detalhe: 'Perímetro interno menos os vãos de porta' });
      add({ grupo: 'Arquitetura', item: 'Aberturas', valor: t.areaAberturasM2, unidade: 'm²', detalhe: `${t.portas} porta(s), ${t.janelas} janela(s)` });
    }
    if (quant.estruturas.length > 0) {
      if (t.volumeConcretoPilarM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — pilares', valor: t.volumeConcretoPilarM3, unidade: 'm³', detalhe: `${fmt(t.areaFormaPilarM2)} m² de fôrma`, forte: true });
      if (t.volumeConcretoVigaM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — vigas', valor: t.volumeConcretoVigaM3, unidade: 'm³', detalhe: `${fmt(t.areaFormaVigaM2)} m² de fôrma`, forte: true });
      if (t.volumeConcretoLajeM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — lajes', valor: t.volumeConcretoLajeM3, unidade: 'm³', detalhe: `${fmt(t.areaLajeM2)} m² de laje`, forte: true });
      if (t.volumeConcretoFundacaoM3 > 0) add({ grupo: 'Estrutura', item: 'Concreto — fundação', valor: t.volumeConcretoFundacaoM3, unidade: 'm³', detalhe: `${fmt(t.areaFormaFundacaoM2)} m² de fôrma`, forte: true });
      if (t.estacas > 0) add({ grupo: 'Estrutura', item: 'Estacas', valor: t.comprimentoEstacasM, unidade: 'm', detalhe: `${t.estacas} un · comprimento perfurado` });
      if (t.pilares > 0 || t.blocosCoroamento > 0) add({ grupo: 'Estrutura', item: 'Peças', valor: t.pilares + t.blocosCoroamento, unidade: 'un', detalhe: `${t.pilares} pilar(es), ${t.blocosCoroamento} bloco(s)` });
      if (armadura && armadura.totais.totalKg > 0) {
        const a = armadura.totais;
        if (a.pilarKg > 0) add({ grupo: 'Aço', item: 'Aço — pilares', valor: a.pilarKg, unidade: 'kg', detalhe: `${fmt(a.taxaPilarKgM3)} kg/m³` });
        if (a.vigaKg > 0) add({ grupo: 'Aço', item: 'Aço — vigas', valor: a.vigaKg, unidade: 'kg', detalhe: `${fmt(a.taxaVigaKgM3)} kg/m³` });
        if (a.lajeKg > 0) add({ grupo: 'Aço', item: 'Aço — lajes', valor: a.lajeKg, unidade: 'kg', detalhe: `${fmt(a.taxaLajeKgM3)} kg/m³` });
        if (a.fundacaoKg > 0) add({ grupo: 'Aço', item: 'Aço — fundação', valor: a.fundacaoKg, unidade: 'kg', detalhe: `${fmt(a.taxaFundacaoKgM3)} kg/m³` });
        add({ grupo: 'Aço', item: 'Aço — total (esquemático)', valor: a.totalKg, unidade: 'kg', detalhe: `CA-50 ${fmt(a.ca50Kg)} kg · CA-60 ${fmt(a.ca60Kg)} kg`, forte: true });
      }
    }
    return linhas;
  }, [quant, armadura, fmt, t]);

  const acoDe = (structuralId: string) => armadura?.pecas.find((p) => p.structuralId === structuralId);
  const conflitantes = quant.sobreposicoes.filter((s) => s.quemCede === 'NINGUEM').length;

  const abas: TabsBarItem<AbaDosQuantitativos>[] = [
    { id: 'resumo', label: 'Resumo', badge: resumo.length },
    { id: 'ambientes', label: 'Por ambiente', badge: quant.ambientes.length },
    { id: 'estruturas', label: 'Por peça estrutural', badge: quant.estruturas.length },
    { id: 'sobreposicoes', label: 'Sobreposições', badge: conflitantes > 0 ? `${conflitantes} !` : quant.sobreposicoes.length },
  ];

  const vazio = quant.ambientes.length === 0 && quant.estruturas.length === 0;

  return (
    <div className="space-y-4">
      {/* OFICIAL × AO VIVO. A distinção é o ponto: o orçamento cita o oficial. */}
      <div className="rounded-[10px] border border-slate-200 bg-white p-4" data-testid="quantitativo-oficial">
        {revisao === 0 ? (
          <p className="text-sm text-slate-600">
            Do desenho atual (política {quant.policy.version}). Publique uma versão para gerar o quantitativo oficial — o orçamento não cita rascunho.
          </p>
        ) : oficial ? (
          <>
            <p className="text-sm text-emerald-700">
              <strong>Oficial da revisão {revisao}</strong> gerado em {new Date(oficial.computed_at).toLocaleDateString('pt-BR')} · política {quant.policy.version}.
            </p>
            {dirty && (
              <p className="mt-1 text-sm text-amber-700">
                O desenho mudou desde então. Publique de novo para gerar o oficial da próxima revisão.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              A revisão {revisao} ainda não tem quantitativo oficial · política {quant.policy.version}.
            </p>
            <button
              type="button"
              onClick={onGerar}
              disabled={gerando}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Calculator className="h-4 w-4" />
              {gerando ? 'Gerando…' : 'Gerar oficial'}
            </button>
          </div>
        )}
      </div>

      <TabsBar tabs={abas} value={aba} onChange={setAba}>
        <span className="text-xs text-slate-500">
          {vazio
            ? 'Nenhum ambiente fechado — sem contorno fechado não há área para quantificar.'
            : `Piso ${fmt(t.areaPisoM2)} m² · alvenaria ${fmt(t.volumeAlvenariaM3)} m³ · concreto ${fmt(
                t.volumeConcretoPilarM3 + t.volumeConcretoVigaM3 + t.volumeConcretoLajeM3 + t.volumeConcretoFundacaoM3,
              )} m³${armadura && armadura.totais.totalKg > 0 ? ` · aço ${fmt(armadura.totais.totalKg)} kg` : ''}`}
        </span>
      </TabsBar>

      {aba === 'resumo' && (
        <StandardTable<LinhaDoResumo>
          columns={COLUNAS_RESUMO}
          storageKey="blueprint:quantitativosResumo"
          rows={resumo}
          rowKey={(l) => l.chave}
          renderCell={(key, l) => {
            switch (key) {
              case 'grupo':
                return <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{l.grupo}</span>;
              case 'item':
                return <span className={`text-sm ${l.forte ? 'font-semibold text-gray-900' : 'text-gray-700'} ${l.grupo === 'Material' ? 'pl-4' : ''}`}>{l.grupo === 'Material' ? '↳ ' : ''}{l.item}</span>;
              case 'valor':
                return <span className={`block text-right text-sm tabular-nums ${l.forte ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{fmt(l.valor)}</span>;
              case 'unidade':
                return <span className="text-sm text-gray-500">{l.unidade}</span>;
              case 'detalhe':
                return <span className="text-xs text-gray-500">{l.detalhe}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, l) => (key === 'valor' ? l.valor : (l as unknown as Record<string, string>)[key])}
          searchText={(l) => `${l.grupo} ${l.item} ${l.detalhe}`}
          searchPlaceholder="Buscar grandeza..."
          empty={{
            title: 'Nenhum ambiente fechado',
            subtitle: 'Sem contorno fechado não há área para quantificar. Feche o contorno das paredes ou lance a estrutura.',
          }}
        />
      )}

      {aba === 'ambientes' && (
        <StandardTable<Quant['ambientes'][number] & { indice: number }>
          columns={COLUNAS_AMBIENTE}
          storageKey="blueprint:quantitativosAmbientes"
          rows={quant.ambientes.map((a, i) => ({ ...a, indice: i + 1 }))}
          rowKey={(a) => a.spaceId}
          renderCell={(key, a) => {
            switch (key) {
              case 'nome':
                return <span className="text-sm font-medium text-gray-800">{a.nome ?? `Ambiente ${a.indice}`}</span>;
              case 'areaPisoM2':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(a.areaPisoM2)}</span>;
              case 'areaEixoM2':
                return num(fmt, a.areaEixoM2);
              case 'areaEstruturaM2':
                // Só quando há desconto: "− 0,00" em todo ambiente sem pilar ensinaria a ignorar a coluna.
                return a.areaEstruturaM2 > 0 ? <span className="block text-right text-sm tabular-nums text-gray-700">− {fmt(a.areaEstruturaM2)}</span> : <span className="block text-right text-sm text-gray-300">—</span>;
              case 'comprimentoRodapeM':
                return num(fmt, a.comprimentoRodapeM);
              case 'formulaAreaPiso':
                return <span className="text-xs italic text-gray-400">{a.formulaAreaPiso}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, a) => (key === 'nome' ? a.nome ?? `Ambiente ${a.indice}` : (a as unknown as Record<string, number>)[key])}
          searchText={(a) => `${a.nome ?? ''} ${a.formulaAreaPiso}`}
          searchPlaceholder="Buscar ambiente..."
          empty={{ title: 'Nenhum ambiente fechado', subtitle: 'Feche o contorno das paredes para o ambiente nascer.' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total dos ambientes</span>
                  <span className="tabular-nums">
                    piso {fmt(t.areaPisoM2)} m² · rodapé {fmt(t.comprimentoRodapeM)} m
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'estruturas' && (
        <StandardTable<Quant['estruturas'][number] & { indice: number }>
          columns={COLUNAS_ESTRUTURA}
          storageKey="blueprint:quantitativosEstruturas"
          rows={quant.estruturas.map((s, i) => ({ ...s, indice: i + 1 }))}
          rowKey={(s) => s.structuralId}
          renderCell={(key, s) => {
            const aco = acoDe(s.structuralId);
            switch (key) {
              case 'rotulo':
                return <span className="text-sm font-medium text-gray-800">{s.rotulo || `${nomeDoTipoEstrutural(s.kind)} ${s.indice}`}</span>;
              case 'tipo':
                return <span className="text-sm text-gray-700">{nomeDoTipoEstrutural(s.kind)}</span>;
              case 'volumeConcretoM3':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(s.volumeConcretoM3)}</span>;
              case 'areaFormaM2':
                return num(fmt, s.areaFormaM2);
              case 'kg':
                return aco ? num(fmt, aco.kg) : <span className="block text-right text-sm text-gray-300">—</span>;
              case 'aco':
                return <span className="text-xs text-gray-500">{aco?.descricao ?? ''}</span>;
              case 'formula':
                // A FÓRMULA junto do número (RF-121): um volume que não diz de onde veio não se confere.
                return <span className="text-xs italic text-gray-400">{s.formula}</span>;
              default:
                return null;
            }
          }}
          sortValue={(key, s) => {
            if (key === 'rotulo') return s.rotulo || s.structuralId;
            if (key === 'tipo') return nomeDoTipoEstrutural(s.kind);
            if (key === 'kg') return acoDe(s.structuralId)?.kg ?? 0;
            return (s as unknown as Record<string, number>)[key];
          }}
          searchText={(s) => `${s.rotulo} ${nomeDoTipoEstrutural(s.kind)} ${s.formula}`}
          searchPlaceholder="Buscar peça..."
          onRowClick={onSelecionarPeca ? (s) => onSelecionarPeca(s.structuralId) : undefined}
          empty={{ title: 'Nenhuma peça estrutural na planta', subtitle: 'Lance pilares, vigas, lajes ou fundações (Arquitetura › Estrutural).' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total da estrutura</span>
                  <span className="tabular-nums">
                    {fmt(quant.estruturas.reduce((a, s) => a + s.volumeConcretoM3, 0))} m³ · {fmt(quant.estruturas.reduce((a, s) => a + s.areaFormaM2, 0))} m² fôrma
                    {armadura ? ` · ${fmt(armadura.totais.totalKg)} kg` : ''}
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'sobreposicoes' && (
        <StandardTable<Quant['sobreposicoes'][number]>
          columns={COLUNAS_SOBREPOSICAO}
          storageKey="blueprint:quantitativosSobreposicoes"
          rows={quant.sobreposicoes}
          rowKey={(s) => `${s.aId}-${s.bId}`}
          rowClassName={(s) => (s.quemCede === 'NINGUEM' ? 'bg-amber-50' : '')}
          renderCell={(key, s) => {
            switch (key) {
              case 'volumeM3':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(s.volumeM3)}</span>;
              case 'situacao':
                return s.quemCede === 'NINGUEM' ? (
                  <span className="inline-flex rounded-[6px] bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Contado duas vezes</span>
                ) : (
                  <span className="text-sm text-gray-700">{s.quemCede === 'PAREDE' ? 'Descontado da alvenaria' : 'Descontado do concreto'}</span>
                );
              case 'explicacao':
                return (
                  <span className="text-xs text-gray-500">
                    {s.quemCede === 'NINGUEM'
                      ? 'Como concreto e como alvenaria. Selecione uma das duas peças e escolha quem cede.'
                      : 'Decisão registrada na peça que cede o volume.'}
                  </span>
                );
              default:
                return null;
            }
          }}
          sortValue={(key, s) => (key === 'volumeM3' ? s.volumeM3 : s.quemCede)}
          empty={{ title: 'Nenhuma sobreposição entre peças', subtitle: 'Quando uma estrutura atravessar uma parede, o volume dividido aparece aqui.' }}
        />
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">
        Estudo preliminar assistido; requer validação de profissional habilitado. Política {quant.policy.version} · kernel {quant.kernelVersion}.
        {quant.ambientes[0] ? ` Área de piso = ${quant.ambientes[0].formulaAreaPiso}` : ''}
      </p>
    </div>
  );
}
