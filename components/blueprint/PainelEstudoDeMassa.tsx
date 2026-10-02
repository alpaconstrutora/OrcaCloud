/**
 * A gaveta "Estudo de massa" (Estudo de Massa, fase M1 — plano
 * `2026-10-01-estudo-de-massa.md`): o que a lei deixa no lote (envelope legal),
 * o que os blocos desenhados usam dele (TO, CA, gabarito, permeabilidade,
 * aproveitamento do potencial), os avisos, a tabela por bloco e as hipóteses
 * do que não conta no CA.
 *
 * Apresentacional: a medida vem pronta de `medirMassa` (puro). Nada é gravado
 * aqui — mudar um bloco, um recuo ou a zona recalcula tudo na hora.
 */
import React from 'react';
import { AlertTriangle, ArrowUpFromLine, Banknote, Building2, CarFront, Droplets, Gauge, Hammer, Home, Layers, LandPlot, Percent, Ruler, Scale, Send, SquareStack, TrendingUp, Users, Wallet } from 'lucide-react';
import { KpiCard, type KpiColor } from '../ui/KpiCard';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { ROTULO_DO_USO_DO_BLOCO, USOS_DO_BLOCO, type UsoDoBloco } from '../../utils/blueprintKernel';
import type { EstadoDoIndicador, HipotesesDaMassa, IndicadorDaMassa, MedidaDaMassa, MedidaDoBloco } from '../../utils/blueprintMassa';
import type { ProdutoDoBloco, ResultadoDoProduto } from '../../utils/blueprintProduto';
import type { ResultadoFinanceiro } from '../../utils/blueprintFinanceiroMassa';

interface Props {
  medida: MedidaDaMassa;
  hipoteses: HipotesesDaMassa;
  onHipoteses: (h: HipotesesDaMassa) => void;
  onSelecionarBloco: (id: string) => void;
  onDesenharBloco: () => void;
  /** M2: a distribuição do produto na massa; `null` = sem produto ainda. */
  produto?: ResultadoDoProduto | null;
  onAbrirProduto?: () => void;
  /** Lança os elevadores sugeridos + um shaft como peças reais no centro do bloco. */
  onLancarNucleo?: (blocoId: string, elevadores: number) => void;
  /** M3: VGV, custo e margem do cenário; `null` = sem produto. */
  financeiro?: ResultadoFinanceiro | null;
  /** M3: enviar o cenário ao Empreendimento (estrutura: torres e unidades). */
  envio?: {
    empreendimentos: { id: string; name: string }[];
    alvo: string;
    onAlvo: (id: string) => void;
    onEnviar: () => void;
    enviando: boolean;
    resultado: string | null;
  };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/** "R$ 46,1 mi" — o cartão lê ordem de grandeza; o valor exato vai no `title`. */
const mi = (v: number) => (Math.abs(v) >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi` : brl(v));

const COLUNAS_DO_PRODUTO: StandardTableColumn[] = [
  { key: 'nome', label: 'Bloco', sortable: true, width: 140 },
  { key: 'porPav', label: 'Un./pav.', sortable: true, width: 90, align: 'right' },
  { key: 'unidades', label: 'Unidades', sortable: true, width: 100, align: 'right' },
  { key: 'privativa', label: 'Privativa (m²)', sortable: true, width: 120, align: 'right' },
  { key: 'eficiencia', label: 'Efic. pav. (%)', sortable: true, width: 120, align: 'right' },
  { key: 'nucleo', label: 'Núcleo (m²/pav)', sortable: true, width: 200 },
  { key: 'vagas', label: 'Vagas', sortable: true, width: 80, align: 'right' },
];

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const m2 = (v: number | null) => (v == null ? '—' : `${n2(v)} m²`);

const COR_DO_ESTADO: Record<EstadoDoIndicador, KpiColor> = { ATENDE: 'emerald', EXCEDE: 'red', SEM_LIMITE: 'gray', SEM_DADO: 'gray' };

/** "60,0 % de 60 %" · "6,00 de 3,00 — excede" · "sem dado: …". */
function legenda(ind: IndicadorDaMassa, fmt: (v: number) => string): string {
  if (ind.estado === 'SEM_DADO') return ind.motivo ?? 'sem dado';
  if (ind.estado === 'SEM_LIMITE') return ind.motivo ?? 'sem limite na zona';
  return `limite ${fmt(ind.limite!)} · ${ind.estado === 'ATENDE' ? 'atende' : 'excede'}`;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Bloco', sortable: true, width: 150 },
  { key: 'uso', label: 'Uso', sortable: true, width: 110 },
  { key: 'pavimentos', label: 'Pav.', sortable: true, width: 70, align: 'right' },
  { key: 'projecao', label: 'Projeção (m²)', sortable: true, width: 120, align: 'right' },
  { key: 'construida', label: 'Construída (m²)', sortable: true, width: 130, align: 'right' },
  { key: 'computavel', label: 'Computável (m²)', sortable: true, width: 130, align: 'right' },
  { key: 'altura', label: 'Altura (m)', sortable: true, width: 100, align: 'right' },
  { key: 'problemas', label: 'Conferência', sortable: true, width: 200 },
];

function problemasDoBloco(b: MedidaDoBloco): string {
  const partes: string[] = [];
  if (b.pisosForaDoEnvelope > 0) partes.push(`${b.pisosForaDoEnvelope} pav. fora do envelope`);
  if (b.pisosAcimaDoGabarito > 0) partes.push(`${b.pisosAcimaDoGabarito} pav. acima do gabarito`);
  if (partes.length) return partes.join(' · ');
  return b.pisos.some((p) => p.cabe === null) ? 'sem lote para conferir' : 'cabe no envelope';
}

export default function PainelEstudoDeMassa({ medida: r, hipoteses: h, onHipoteses, onSelecionarBloco, onDesenharBloco, produto: pr = null, onAbrirProduto, onLancarNucleo, financeiro: fi = null, envio }: Props) {
  const l = r.legal;
  const campo = 'h-9 rounded-[6px] border border-gray-200 bg-white px-2 text-sm font-normal text-gray-800';
  return (
    <div className="space-y-6 text-sm text-gray-700" data-testid="tarefa-massa">
      <p className="text-gray-600">
        O volume do empreendimento antes da planta: desenhe <strong>blocos</strong> (contorno, pavimentos, piso a piso e uso) e veja na hora o que a lei deixa e o que
        a massa usa. Recuos, afastamento progressivo, faixas restritas e gabarito são os da zona do estudo (Terreno › Dados do lote).
      </p>

      <section className="space-y-3" data-testid="envelope-legal">
        <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">Envelope legal — o que a lei deixa no lote</h3>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Lote" value={m2(l.loteM2)} icon={<LandPlot />} color="gray" />
          <KpiCard label="Implantação máxima" value={m2(l.implantacaoEfetivaM2)} sub={l.implantacaoMaxM2 != null && l.envelopeTerreoM2 != null ? `TO ${m2(l.implantacaoMaxM2)} · envelope ${m2(l.envelopeTerreoM2)}` : undefined} icon={<SquareStack />} color="blue" />
          <KpiCard label="Área computável máxima" value={m2(l.potencialM2)} sub="CA × lote" icon={<Scale />} color="indigo" />
          <KpiCard
            label="Pavimentos possíveis"
            value={l.pavimentosPossiveis == null ? '—' : String(l.pavimentosPossiveis)}
            sub={l.alturaMaxM != null ? `altura máxima ${n2(l.alturaMaxM)} m` : undefined}
            icon={<Layers />}
            color="violet"
          />
        </div>
        {l.faltam.length > 0 && <p className="text-xs text-gray-500">Para completar o envelope falta: {l.faltam.join('; ')}.</p>}
      </section>

      <section className="space-y-3" data-testid="indicadores-da-massa">
        <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">A massa desenhada</h3>
        {r.blocos.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-gray-200 py-8 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-semibold text-gray-900">Nenhum bloco ainda</p>
            <p className="mt-1 text-xs text-gray-500">Um bloco é o contorno do prédio em planta com os pavimentos — torre, podium, subsolo.</p>
            <button type="button" onClick={onDesenharBloco} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-[13px] font-medium text-white hover:bg-blue-700">
              Desenhar bloco
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Taxa de ocupação" value={r.to.usado == null ? '—' : `${n1(r.to.usado)} %`} sub={legenda(r.to, (v) => `${n1(v)} %`)} icon={<SquareStack />} color={COR_DO_ESTADO[r.to.estado]} />
              <KpiCard label="Coeficiente (CA)" value={r.ca.usado == null ? '—' : n2(r.ca.usado)} sub={legenda(r.ca, n2)} icon={<Scale />} color={COR_DO_ESTADO[r.ca.estado]} />
              <KpiCard label="Pavimentos" value={r.gabaritoPavimentos.usado == null ? '—' : String(r.gabaritoPavimentos.usado)} sub={legenda(r.gabaritoPavimentos, (v) => String(v))} icon={<Layers />} color={COR_DO_ESTADO[r.gabaritoPavimentos.estado]} />
              <KpiCard label="Altura" value={r.gabaritoAltura.usado == null ? '—' : `${n2(r.gabaritoAltura.usado)} m`} sub={legenda(r.gabaritoAltura, (v) => `${n2(v)} m`)} icon={<ArrowUpFromLine />} color={COR_DO_ESTADO[r.gabaritoAltura.estado]} />
              <KpiCard label="Área construída" value={m2(r.areaConstruidaM2)} sub={`computável ${m2(r.areaComputavelM2)} · não computável ${m2(r.areaNaoComputavelM2)}`} icon={<Building2 />} color="blue" />
              <KpiCard
                label="Aproveitamento do potencial"
                value={r.aproveitamentoDoPotencialPct == null ? '—' : `${n1(r.aproveitamentoDoPotencialPct)} %`}
                sub={r.aproveitamentoDoPotencialPct == null ? 'sem CA ou sem lote' : 'computável ÷ área computável máxima'}
                icon={<Gauge />}
                color={r.aproveitamentoDoPotencialPct != null && r.aproveitamentoDoPotencialPct > 100.05 ? 'red' : 'teal'}
              />
              <KpiCard label="Área ocupada" value={m2(r.areaOcupadaM2)} sub="união das projeções acima do solo" icon={<Ruler />} color="sky" />
              <KpiCard
                label="Permeabilidade"
                value={r.permeabilidade.usado == null ? '—' : `${n1(r.permeabilidade.usado)} %`}
                sub={r.permeabilidade.estado === 'ATENDE' || r.permeabilidade.estado === 'EXCEDE' ? `mínimo ${n1(r.permeabilidade.limite!)} % · ${r.permeabilidade.estado === 'ATENDE' ? 'atende' : 'abaixo'}` : r.permeabilidade.motivo ?? undefined}
                icon={<Droplets />}
                color={r.permeabilidade.estado === 'EXCEDE' ? 'red' : r.permeabilidade.estado === 'ATENDE' ? 'emerald' : 'gray'}
              />
            </div>

            {r.avisos.length > 0 && (
              <ul className="space-y-1 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="avisos-da-massa">
                {r.avisos.map((a) => (
                  <li key={a} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Sem busca: são poucos blocos por estudo, e todos cabem na tela. */}
            <StandardTable<MedidaDoBloco>
              storageKey="blueprint:massa:blocos"
              columns={COLUNAS}
              rows={r.blocos}
              rowKey={(b) => b.blocoId}
              dense
              onRowClick={(b) => onSelecionarBloco(b.blocoId)}
              sortValue={(key, b) =>
                key === 'nome' ? b.nome
                : key === 'uso' ? ROTULO_DO_USO_DO_BLOCO[b.uso]
                : key === 'pavimentos' ? b.pavimentos
                : key === 'projecao' ? b.projecaoM2
                : key === 'construida' ? b.areaConstruidaM2
                : key === 'computavel' ? b.areaComputavelM2
                : key === 'altura' ? b.alturaM
                : b.pisosForaDoEnvelope + b.pisosAcimaDoGabarito
              }
              renderCell={(key, b) => {
                if (key === 'nome') return <span className="block truncate text-sm font-normal text-gray-700" title={b.nome}>{b.nome}</span>;
                if (key === 'uso') return <span className="text-sm font-normal text-gray-700">{ROTULO_DO_USO_DO_BLOCO[b.uso]}</span>;
                if (key === 'pavimentos') return <span className="text-sm font-normal text-gray-600">{b.pavimentos}{b.pavimentosNoSubsolo ? ` (${b.pavimentosNoSubsolo} sub.)` : ''}</span>;
                if (key === 'projecao') return <span className="text-sm font-normal text-gray-600">{n2(b.projecaoM2)}</span>;
                if (key === 'construida') return <span className="text-sm font-normal text-gray-600">{n2(b.areaConstruidaM2)}</span>;
                if (key === 'computavel') return <span className="text-sm font-normal text-gray-600">{n2(b.areaComputavelM2)}</span>;
                if (key === 'altura') return <span className="text-sm font-normal text-gray-600">{n2(b.alturaM)}</span>;
                const p = problemasDoBloco(b);
                const ruim = b.pisosForaDoEnvelope + b.pisosAcimaDoGabarito > 0;
                return <span className={`block truncate text-sm font-normal ${ruim ? 'text-red-600' : 'text-emerald-700'}`} title={p}>{p}</span>;
              }}
              empty={{ title: 'Nenhum bloco' }}
            />
          </>
        )}
      </section>

      {r.blocos.length > 0 && (
        <section className="space-y-3" data-testid="produto-da-massa">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-semibold text-gray-900">Produto e eficiência</h3>
            {onAbrirProduto && (
              <button type="button" onClick={onAbrirProduto} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                Editar o produto
              </button>
            )}
          </div>
          {!pr || pr.porTipologia.length === 0 ? (
            <p className="text-xs text-gray-500">Sem produto: defina as tipologias (ou aplique uma semente) na gaveta Produto para ver unidades, eficiência e vagas.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Unidades"
                  value={String(pr.unidades)}
                  sub={pr.meta ? `meta ${pr.meta.unidades} · ${pr.meta.diferenca >= 0 ? `sobram ${pr.meta.diferenca}` : `faltam ${-pr.meta.diferenca}`}` : pr.porTipologia.filter((t) => t.unidades > 0).map((t) => `${t.unidades} × ${t.nome}`).join(' · ') || undefined}
                  icon={<Home />}
                  color={pr.meta && pr.meta.diferenca < 0 ? 'red' : 'blue'}
                />
                <KpiCard label="Área privativa" value={m2(pr.privativaTotalM2)} sub={pr.privativaMediaM2 != null ? `média ${n2(pr.privativaMediaM2)} m² por unidade` : undefined} icon={<SquareStack />} color="indigo" />
                <KpiCard label="Eficiência do pavimento" value={pr.eficienciaDoPavimentoPct == null ? '—' : `${n1(pr.eficienciaDoPavimentoPct)} %`} sub="privativa ÷ área do pavimento tipo" icon={<Percent />} color="teal" />
                <KpiCard label="Eficiência global" value={pr.eficienciaGlobalPct == null ? '—' : `${n1(pr.eficienciaGlobalPct)} %`} sub="privativa ÷ construída" icon={<Gauge />} color="emerald" />
                <KpiCard label="Área comum por unidade" value={pr.areaComumPorUnidadeM2 == null ? '—' : `${n2(pr.areaComumPorUnidadeM2)} m²`} sub={`comum ${m2(pr.areaComumM2)}`} icon={<Users />} color="violet" />
                <KpiCard
                  label="Vagas"
                  value={`${pr.vagasQueCabem} de ${pr.vagasExigidas}`}
                  sub={pr.vagasFaltando > 0 ? `faltam ${pr.vagasFaltando}${pr.vagasDaZona != null ? ` · zona pede ${pr.vagasDaZona}` : ''}` : `atende${pr.indiceDeGaragemM2 != null ? ` · ${n2(pr.indiceDeGaragemM2)} m² de garagem por vaga` : ''}`}
                  icon={<CarFront />}
                  color={pr.vagasFaltando > 0 ? 'red' : 'emerald'}
                />
              </div>
              {pr.avisos.length > 0 && (
                <ul className="space-y-1 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="avisos-do-produto">
                  {pr.avisos.map((a) => (
                    <li key={a} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Sem busca: poucos blocos por estudo. */}
              <StandardTable<ProdutoDoBloco>
                storageKey="blueprint:massa:produto-por-bloco"
                columns={COLUNAS_DO_PRODUTO}
                rows={pr.blocos}
                rowKey={(b) => b.blocoId}
                dense
                onRowClick={(b) => onSelecionarBloco(b.blocoId)}
                sortValue={(k, b) =>
                  k === 'nome' ? b.nome
                  : k === 'porPav' ? b.unidadesPorPavimento
                  : k === 'unidades' ? b.unidades
                  : k === 'privativa' ? b.privativaM2
                  : k === 'eficiencia' ? b.eficienciaDoPavimentoPct ?? -1
                  : k === 'nucleo' ? b.nucleo.m2
                  : b.vagas
                }
                renderCell={(k, b) => {
                  if (k === 'nome') return <span className="block truncate text-sm font-normal text-gray-700" title={b.nome}>{b.nome}</span>;
                  if (k === 'porPav') return <span className="text-sm font-normal text-gray-600">{b.uso === 'GARAGEM' ? `${b.vagasPorPavimento} vagas` : b.unidadesPorPavimento}</span>;
                  if (k === 'unidades') return <span className="text-sm font-normal text-gray-600">{b.unidades}</span>;
                  if (k === 'privativa') return <span className="text-sm font-normal text-gray-600">{n2(b.privativaM2)}</span>;
                  if (k === 'eficiencia') return <span className="text-sm font-normal text-gray-600">{b.eficienciaDoPavimentoPct == null ? '—' : n1(b.eficienciaDoPavimentoPct)}</span>;
                  if (k === 'nucleo') {
                    const rotulo = b.nucleo.origem === 'NENHUM' ? '—' : `${n2(b.nucleo.m2)} · ${b.nucleo.origem === 'DESENHADO' ? 'desenhado' : 'hipótese'}${b.nucleo.elevadores ? ` · ${b.nucleo.elevadores} elev.` : ''}`;
                    return <span className="block truncate text-sm font-normal text-gray-600" title={b.nucleo.explicacao}>{rotulo}</span>;
                  }
                  return <span className="text-sm font-normal text-gray-600">{b.uso === 'GARAGEM' ? b.vagas : '—'}</span>;
                }}
                actions={
                  onLancarNucleo
                    ? {
                        width: 130,
                        render: (b) =>
                          b.nucleo.origem === 'SUGERIDO' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onLancarNucleo(b.blocoId, b.nucleo.elevadores);
                              }}
                              title={`Lança ${b.nucleo.elevadores} elevador(es) da ficha de 8 passageiros e um shaft no centro do bloco — peças reais, desfazíveis`}
                              className="rounded-lg p-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                            >
                              Lançar núcleo
                            </button>
                          ) : null,
                      }
                    : undefined
                }
                empty={{ title: 'Nenhum bloco' }}
              />
            </>
          )}
        </section>
      )}

      {fi && pr && pr.unidades > 0 && (
        <section className="space-y-3" data-testid="financeiro-da-massa">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-semibold text-gray-900">Financeiro — pré-viabilidade</h3>
            {onAbrirProduto && (
              <button type="button" onClick={onAbrirProduto} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                Editar hipóteses
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="VGV" value={mi(fi.vgv)} title={brl(fi.vgv)} sub={fi.semPreco.length ? `sem preço: ${fi.semPreco.join(', ')}` : `${pr.unidades} unidades · ${n2(pr.privativaTotalM2)} m²`} icon={<Banknote />} color="blue" />
            <KpiCard
              label="Custo de obra"
              value={fi.custoObra == null ? '—' : mi(fi.custoObra)}
              title={fi.custoObra == null ? undefined : brl(fi.custoObra)}
              sub={fi.custoM2Base == null ? 'sem CUB e sem custo digitado' : `${brl(fi.custoM2Base)}/m² · ${fi.origemDoCusto === 'MANUAL' ? 'digitado' : fi.origemDoCusto === 'CUB' ? `CUB ${fi.cub?.referencia ?? ''}` : 'CUB estimado'}`}
              icon={<Hammer />}
              color={fi.custoObra == null ? 'gray' : 'orange'}
            />
            <KpiCard
              label="Custo total"
              value={fi.custoTotal == null ? '—' : mi(fi.custoTotal)}
              title={fi.custoTotal == null ? undefined : brl(fi.custoTotal)}
              sub={`terreno ${mi(fi.terreno)} · despesas ${mi(fi.despesasComerciais + fi.impostos + fi.outrasDespesas)}`}
              icon={<Wallet />}
              color="amber"
            />
            <KpiCard
              label="Resultado"
              value={fi.resultado == null ? '—' : mi(fi.resultado)}
              title={fi.resultado == null ? undefined : brl(fi.resultado)}
              sub={fi.margemPct == null ? 'sem custo, sem margem' : `margem ${n1(fi.margemPct)} % do VGV`}
              icon={<TrendingUp />}
              color={fi.resultado == null ? 'gray' : fi.resultado >= 0 ? 'emerald' : 'red'}
            />
            <KpiCard label="VGV ÷ custo" value={fi.vgvSobreCusto == null ? '—' : n2(fi.vgvSobreCusto)} sub="quanto cada real de custo vira de venda" icon={<Scale />} color="indigo" />
            <KpiCard label="Obra por m² privativo" value={fi.custoPorM2Privativo == null ? '—' : brl(fi.custoPorM2Privativo)} sub="custo de obra ÷ área privativa" icon={<Ruler />} color="violet" />
          </div>
          {fi.avisos.length > 0 && (
            <ul className="space-y-1 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="avisos-do-financeiro">
              {fi.avisos.map((a) => (
                <li key={a} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {envio && pr && pr.unidades > 0 && (
        <section className="space-y-3" data-testid="envio-ao-empreendimento">
          <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">Enviar ao Empreendimento</h3>
          <p className="text-xs text-gray-500">
            Os blocos da versão <strong>publicada</strong> viram torres e o produto vira unidades no cadastro (espelho de vendas). Daí a Viabilidade recebe pelo caminho de
            sempre. Preço e status de unidades que já existem lá não são tocados; divergências vão para a Curadoria; o que sumir do estudo é avisado, nunca apagado.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="massa-empreendimento" className="text-xs font-semibold text-slate-500">Empreendimento</label>
              <select id="massa-empreendimento" value={envio.alvo} onChange={(e) => envio.onAlvo(e.target.value)} className="h-9 w-full rounded-[6px] border border-gray-200 bg-white px-2 text-sm font-normal text-gray-800">
                <option value="">Escolha o empreendimento…</option>
                {envio.empreendimentos.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={envio.onEnviar}
              disabled={!envio.alvo || envio.enviando}
              title={!envio.alvo ? 'Escolha o empreendimento que recebe o cenário' : envio.enviando ? 'Enviando…' : 'Mostra a prévia antes de gravar'}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3.5 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-[15px] w-[15px]" /> {envio.enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          {!envio.alvo && <p className="text-xs text-gray-500">Escolha o empreendimento para habilitar o envio.</p>}
          {envio.resultado && (
            <p role="status" className="text-xs text-gray-700" data-testid="resultado-do-envio">
              {envio.resultado}
            </p>
          )}
        </section>
      )}

      <section className="space-y-3" data-testid="hipoteses-da-massa">
        <h3 className="border-b border-gray-100 pb-3 text-sm font-semibold text-gray-900">Hipóteses — o que não conta no CA</h3>
        <p className="text-xs text-gray-500">Cada município escreve a sua lista. Estes valores são do estudo (ficam neste navegador) e não são norma: confira na lei da zona.</p>
        <div className="grid grid-cols-3 gap-x-6 gap-y-4">
          {USOS_DO_BLOCO.map((u: UsoDoBloco) => (
            <div key={u} className="space-y-1.5">
              <label htmlFor={`massa-nc-${u}`} className="text-xs font-semibold text-slate-500">
                {ROTULO_DO_USO_DO_BLOCO[u]} fora do CA (%)
              </label>
              <input
                id={`massa-nc-${u}`}
                type="number"
                min={0}
                max={100}
                step={5}
                value={Math.round((h.naoComputavelPorUso[u] ?? 0) * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v)) return;
                  onHipoteses({ ...h, naoComputavelPorUso: { ...h.naoComputavelPorUso, [u]: Math.min(100, Math.max(0, v)) / 100 } });
                }}
                className={`${campo} w-full`}
              />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={h.subsoloNaoComputavel} onChange={(e) => onHipoteses({ ...h, subsoloNaoComputavel: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          Subsolo fora do CA
        </label>
        <div className="space-y-1.5">
          <label htmlFor="massa-pd-ref" className="text-xs font-semibold text-slate-500">
            Piso a piso de referência para "pavimentos possíveis" (m)
          </label>
          <input
            id="massa-pd-ref"
            type="number"
            min={2}
            max={15}
            step={0.05}
            value={h.peDireitoDeReferenciaMm / 1000}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 2 && v <= 15) onHipoteses({ ...h, peDireitoDeReferenciaMm: Math.round(v * 1000) });
            }}
            className={`${campo} w-40`}
          />
        </div>
      </section>
    </div>
  );
}
