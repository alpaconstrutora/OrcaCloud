import React, { useMemo, useState } from 'react';
import { nomeDoTipoEstrutural } from '../../utils/blueprintKernel';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import {
  BITOLAS_DE_ESTRIBO_MM,
  BITOLAS_LONGITUDINAIS_MM,
  CLASSES_DE_AGRESSIVIDADE,
  FCKS_MPA,
  HIPOTESES_ARMADURA_PADRAO,
  PERDAS_PCT,
  ROTULO_DA_ORIGEM,
  TRECHOS_ARMADOS_DA_ESTACA_M,
  familiaDaPeca,
  tipoDeAco,
  type ArmaduraDaPeca,
  type ArmaduraQuantificada,
  type HipotesesDeArmadura,
} from '../../utils/blueprintArmadura';

/**
 * TELA "ARMADURA" — o pré-quantitativo de aço da planta (16/09/2026).
 *
 * Pedido: *"implementar armadura em vigas, lajes, pilares, blocos e estacas"*;
 * depois *"criar tela própria para armadura"* — nasceu gaveta e virou TELA em
 * fluxo (raiz `space-y-6 pb-20`, cabeçalho com voltar, `TabsBar` §19.1 +
 * `StandardTable` §5.2), como o Quadro de cargas. Abas: **Por peça** (a tabela
 * padrão, com busca, filtro por família, ajuste de colunas e totais), **Por
 * família** e **Hipóteses** (do estudo, gravadas no banco). O que se edita aqui
 * muda o painel da peça, os Quantitativos, a planilha e o orçamento — é a
 * mesma conta (`armaduraDoModelo`).
 *
 * Tudo aqui é pré-quantitativo: mínimos da NBR 6118 + taxa de referência. Não
 * dimensiona (não há esforço) nem detalha (não há lista de barras). Dito no
 * topo, para ninguém levar o número para a obra.
 */

const kg = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const m3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const bit = (mm: number) => mm.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type AbaDaArmadura = 'pecas' | 'familias' | 'hipoteses';

interface LinhaDeFamilia {
  chave: ReturnType<typeof familiaDaPeca>;
  nome: string;
  pecas: number;
  concretoM3: number;
  kg: number;
  taxa: number;
  /** A taxa de referência da hipótese, para ler ao lado da efetiva. */
  referencia: string;
}

const COLUNAS_POR_PECA: StandardTableColumn[] = [
  { key: 'rotulo', label: 'Peça', width: 120 },
  { key: 'tipo', label: 'Tipo', width: 140 },
  { key: 'volumeConcretoM3', label: 'Concreto (m³)', width: 120, align: 'right' },
  { key: 'kg', label: 'Aço (kg)', width: 100, align: 'right' },
  { key: 'taxaEfetivaKgM3', label: 'kg/m³', width: 90, align: 'right' },
  { key: 'kgCa50', label: 'CA-50 (kg)', width: 100, align: 'right' },
  { key: 'kgCa60', label: 'CA-60 (kg)', width: 100, align: 'right' },
  { key: 'origem', label: 'Origem', width: 140 },
  { key: 'esquema', label: 'Esquema (mínimos NBR 6118)', width: 320, sortable: false },
];
const COLUNAS_POR_FAMILIA: StandardTableColumn[] = [
  { key: 'nome', label: 'Família', width: 260 },
  { key: 'pecas', label: 'Peças', width: 80, align: 'right' },
  { key: 'concretoM3', label: 'Concreto (m³)', width: 120, align: 'right' },
  { key: 'kg', label: 'Aço (kg)', width: 110, align: 'right' },
  { key: 'taxa', label: 'kg/m³ efetivo', width: 110, align: 'right' },
  { key: 'referencia', label: 'Taxa de referência', width: 150, align: 'right' },
];

interface Props {
  hipoteses: HipotesesDeArmadura;
  onHipoteses: (h: HipotesesDeArmadura) => void;
  armadura: ArmaduraQuantificada;
  /** Selecionar a peça no desenho a partir da linha. */
  onSelecionarPeca?: (id: string) => void;
  carregando?: boolean;
  persistenciaIndisponivel?: boolean;
}

const SELECT = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs';
const INPUT = 'w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';

export default function TelaArmadura({ hipoteses: h, onHipoteses, armadura, onSelecionarPeca, carregando, persistenciaIndisponivel }: Props) {
  const set = (campo: Partial<HipotesesDeArmadura>) => onHipoteses({ ...h, ...campo });
  const t = armadura.totais;
  const familias: { nome: string; chave: ReturnType<typeof familiaDaPeca>; kg: number; taxa: number }[] = [
    { nome: 'Pilares', chave: 'PILAR', kg: t.pilarKg, taxa: t.taxaPilarKgM3 },
    { nome: 'Vigas', chave: 'VIGA', kg: t.vigaKg, taxa: t.taxaVigaKgM3 },
    { nome: 'Lajes', chave: 'LAJE', kg: t.lajeKg, taxa: t.taxaLajeKgM3 },
    { nome: 'Fundação (estacas, blocos, baldrames)', chave: 'FUNDACAO', kg: t.fundacaoKg, taxa: t.taxaFundacaoKgM3 },
  ];
  const pecasDe = (chave: ReturnType<typeof familiaDaPeca>) => armadura.pecas.filter((p) => familiaDaPeca(p.kind) === chave);
  const volumeDe = (chave: ReturnType<typeof familiaDaPeca>) => pecasDe(chave).reduce((a, p) => a + p.volumeConcretoM3, 0);

  const [aba, setAba] = usePersistedState<AbaDaArmadura>('blueprint:armadura:aba', 'pecas');
  const [familiaFiltro, setFamiliaFiltro] = useState<'' | ReturnType<typeof familiaDaPeca>>('');
  // Identidade estável do recorte: o `StandardTable` volta à página 1 quando `rows` muda.
  const linhasVisiveis = useMemo(
    () => (familiaFiltro ? armadura.pecas.filter((p) => familiaDaPeca(p.kind) === familiaFiltro) : armadura.pecas),
    [armadura.pecas, familiaFiltro],
  );
  const linhasDeFamilia: LinhaDeFamilia[] = familias
    .filter((f) => pecasDe(f.chave).length > 0)
    .map((f) => ({
      chave: f.chave,
      nome: f.nome,
      pecas: pecasDe(f.chave).length,
      concretoM3: volumeDe(f.chave),
      kg: f.kg,
      taxa: f.taxa,
      referencia:
        f.chave === 'PILAR'
          ? `${h.taxaPilarKgM3}`
          : f.chave === 'VIGA'
            ? `${h.taxaVigaKgM3}`
            : f.chave === 'LAJE'
              ? `${h.taxaLajeKgM3}`
              : `${h.taxaBlocoKgM3} / ${h.taxaEstacaKgM3} / ${h.taxaVigaKgM3}`,
    }));

  const celula = (key: string, p: ArmaduraDaPeca): React.ReactNode => {
    switch (key) {
      case 'rotulo':
        return (
          <span className="text-sm font-medium text-gray-800">
            {p.rotulo || nomeDoTipoEstrutural(p.kind)}
            <span className="block text-[11px] font-normal text-gray-400">{nomeDoTipoEstrutural(p.kind)}</span>
          </span>
        );
      case 'tipo':
        return <span className="text-sm text-gray-700">{nomeDoTipoEstrutural(p.kind)}</span>;
      case 'volumeConcretoM3':
        return <span className="block text-right text-sm tabular-nums text-gray-700">{m3(p.volumeConcretoM3)}</span>;
      case 'kg':
        return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{kg(p.kg)}</span>;
      case 'taxaEfetivaKgM3':
        return <span className="block text-right text-sm tabular-nums text-gray-700">{kg(p.taxaEfetivaKgM3)}</span>;
      case 'kgCa50':
        return <span className="block text-right text-sm tabular-nums text-gray-600">{kg(p.kgCa50)}</span>;
      case 'kgCa60':
        return <span className="block text-right text-sm tabular-nums text-gray-600">{kg(p.kgCa60)}</span>;
      case 'origem':
        return (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
              p.origem === 'MANUAL' ? 'bg-blue-50 text-blue-700' : p.origem === 'TAXA' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {ROTULO_DA_ORIGEM[p.origem]}
          </span>
        );
      case 'esquema':
        return (
          <span className="block text-sm text-gray-700" title={p.avisos.join(' · ')}>
            <span className="block truncate">{p.descricao}</span>
            {p.avisos.length > 0 && <span className="block truncate text-[11px] text-amber-800">{p.avisos.join(' · ')}</span>}
          </span>
        );
      default:
        return null;
    }
  };

  const bitolaSelect = (rotulo: string, campo: keyof HipotesesDeArmadura) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <select
        value={h[campo] as number}
        onChange={(e) => set({ [campo]: Number(e.target.value) } as Partial<HipotesesDeArmadura>)}
        aria-label={`Bitola longitudinal — ${rotulo.toLowerCase()}`}
        className={SELECT}
      >
        {BITOLAS_LONGITUDINAIS_MM.map((b) => (
          <option key={b} value={b}>
            Ø {bit(b)} mm
          </option>
        ))}
      </select>
    </label>
  );
  const taxaInput = (rotulo: string, campo: keyof HipotesesDeArmadura) => (
    <label className="flex items-center gap-2">
      {rotulo}
      <input
        type="number"
        min={0}
        step={5}
        value={h[campo] as number}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= 0) set({ [campo]: v } as Partial<HipotesesDeArmadura>);
        }}
        aria-label={`Taxa de referência — ${rotulo.toLowerCase()}`}
        className={INPUT}
      />
      kg/m³
    </label>
  );

  const abas: TabsBarItem<AbaDaArmadura>[] = [
    { id: 'pecas', label: 'Por peça', badge: armadura.pecas.length },
    { id: 'familias', label: 'Por família', badge: familias.filter((f) => pecasDe(f.chave).length > 0).length },
    { id: 'hipoteses', label: 'Hipóteses' },
  ];

  const manuais = Object.keys(h.porPeca ?? {}).length;

  return (
    <div>
      <TabsBar tabs={abas} value={aba} onChange={setAba}>
        <span className="text-xs text-slate-500">
          Total <strong className="tabular-nums text-slate-800">{kg(t.totalKg)} kg</strong> · CA-50 {kg(t.ca50Kg)} · CA-60 {kg(t.ca60Kg)}
          {manuais > 0 ? ` · ${manuais} manual(is)` : ''}
        </span>
      </TabsBar>

      {aba === 'pecas' && (
        <StandardTable<ArmaduraDaPeca>
          columns={COLUNAS_POR_PECA}
          storageKey="blueprint:armaduraPorPeca"
          rows={linhasVisiveis}
          rowKey={(p) => p.structuralId}
          renderCell={celula}
          sortValue={(key, p) => {
            switch (key) {
              case 'rotulo':
                return p.rotulo || p.structuralId;
              case 'tipo':
                return nomeDoTipoEstrutural(p.kind);
              case 'origem':
                return ROTULO_DA_ORIGEM[p.origem];
              case 'esquema':
                return p.descricao;
              default:
                return (p as unknown as Record<string, number>)[key];
            }
          }}
          searchText={(p) => `${p.rotulo} ${nomeDoTipoEstrutural(p.kind)} ${p.descricao} ${ROTULO_DA_ORIGEM[p.origem]}`}
          searchPlaceholder="Buscar peça..."
          filters={
            <select
              value={familiaFiltro}
              onChange={(e) => setFamiliaFiltro(e.target.value as typeof familiaFiltro)}
              aria-label="Filtrar por família"
              className="h-9 rounded-[6px] border border-gray-200 bg-white px-2 text-sm text-gray-700"
            >
              <option value="">Todas as famílias</option>
              <option value="PILAR">Pilares</option>
              <option value="VIGA">Vigas</option>
              <option value="LAJE">Lajes</option>
              <option value="FUNDACAO">Fundação</option>
            </select>
          }
          onRowClick={onSelecionarPeca ? (p) => onSelecionarPeca(p.structuralId) : undefined}
          empty={{
            title: 'Nenhuma peça estrutural na planta',
            subtitle: 'Lance pilares, vigas, lajes ou fundações (aba Arquitetura › Estrutural) para ver o aço.',
          }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total {familiaFiltro ? 'da família' : 'da estrutura'}</span>
                  <span className="tabular-nums">
                    {m3(linhasVisiveis.reduce((a, p) => a + p.volumeConcretoM3, 0))} m³ · {kg(linhasVisiveis.reduce((a, p) => a + p.kg, 0))} kg
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'familias' && (
        <StandardTable<LinhaDeFamilia>
          columns={COLUNAS_POR_FAMILIA}
          storageKey="blueprint:armaduraPorFamilia"
          rows={linhasDeFamilia}
          rowKey={(f) => f.chave}
          renderCell={(key, f) => {
            switch (key) {
              case 'nome':
                return <span className="text-sm font-medium text-gray-800">{f.nome}</span>;
              case 'pecas':
                return <span className="block text-right text-sm tabular-nums text-gray-700">{f.pecas}</span>;
              case 'concretoM3':
                return <span className="block text-right text-sm tabular-nums text-gray-700">{m3(f.concretoM3)}</span>;
              case 'kg':
                return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{kg(f.kg)}</span>;
              case 'taxa':
                return <span className="block text-right text-sm tabular-nums text-gray-700">{kg(f.taxa)}</span>;
              case 'referencia':
                return <span className="block text-right text-sm tabular-nums text-gray-500">{f.referencia}</span>;
              default:
                return null;
            }
          }}
          empty={{ title: 'Nenhuma peça estrutural na planta' }}
          renderTotals={(n) => (
            <tr className="bg-gray-50 text-sm font-semibold text-gray-700">
              <td colSpan={n} className="px-6 py-2.5">
                <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>Total · {armadura.pecas.length} peça(s)</span>
                  <span className="tabular-nums">
                    {m3(armadura.pecas.reduce((a, p) => a + p.volumeConcretoM3, 0))} m³ · {kg(t.totalKg)} kg (CA-50 {kg(t.ca50Kg)} · CA-60 {kg(t.ca60Kg)})
                  </span>
                </span>
              </td>
            </tr>
          )}
        />
      )}

      {aba === 'hipoteses' && (
        <div className="rounded-[10px] border border-gray-200 bg-white p-4 shadow-sm">
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Hipóteses da armadura</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <strong>Esquema pelos mínimos da NBR 6118</strong>, peça a peça: pilar 0,4 % Ac e ≥ 4 barras, estribos a min(20 cm, menor
              lado, 12 Ø); viga ρmin {(0.15).toLocaleString('pt-BR')} % (sobe acima de fck 30), estribos pela taxa mínima e 0,6 d; laje malha
              inferior nas duas direções; bloco malha inferior + estribos; estaca 0,5 % Ac no trecho armado + espiral. Perda de{' '}
              {h.perdaPct} % sobre o esquema.
            </li>
            <li>
              <strong>Piso por taxa de referência</strong> (kg/m³ por família): quando o mínimo dá menos aço que a taxa, vale a taxa — a
              linha diz qual dos dois mandou. Taxa 0 desliga o piso.
            </li>
            <li>
              fck {h.fckMpa} MPa · CAA {h.caa} (cobrimento pela tabela 7.2) · estribos Ø {bit(h.bitolaEstriboMm)} ({tipoDeAco(h.bitolaEstriboMm)}); demais
              barras CA-50.
            </li>
            <li>
              <strong>Não dimensiona nem detalha</strong>: sem esforço, sem verificação, sem lista de barras. Negativos de laje e tirantes
              de bloco não estão no esquema — o piso da taxa cobre. A armadura definitiva é do responsável técnico.
            </li>
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2">
              fck
              <select value={h.fckMpa} onChange={(e) => set({ fckMpa: Number(e.target.value) })} aria-label="fck do concreto" className={SELECT}>
                {FCKS_MPA.map((f) => (
                  <option key={f} value={f}>
                    {f} MPa
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              CAA
              <select value={h.caa} onChange={(e) => set({ caa: e.target.value as HipotesesDeArmadura['caa'] })} aria-label="Classe de agressividade ambiental" className={SELECT}>
                {CLASSES_DE_AGRESSIVIDADE.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Perda
              <select value={h.perdaPct} onChange={(e) => set({ perdaPct: Number(e.target.value) })} aria-label="Perda e emendas" className={SELECT}>
                {PERDAS_PCT.map((p) => (
                  <option key={p} value={p}>
                    {p} %
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Estribo
              <select value={h.bitolaEstriboMm} onChange={(e) => set({ bitolaEstriboMm: Number(e.target.value) })} aria-label="Bitola do estribo" className={SELECT}>
                {BITOLAS_DE_ESTRIBO_MM.map((b) => (
                  <option key={b} value={b}>
                    Ø {bit(b)} · {tipoDeAco(b)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Trecho armado da estaca
              <select
                value={h.trechoArmadoDaEstacaM == null ? 'TOTAL' : String(h.trechoArmadoDaEstacaM)}
                onChange={(e) => set({ trechoArmadoDaEstacaM: e.target.value === 'TOTAL' ? null : Number(e.target.value) })}
                aria-label="Trecho armado da estaca"
                className={SELECT}
              >
                {TRECHOS_ARMADOS_DA_ESTACA_M.map((v) => (
                  <option key={v ?? 'TOTAL'} value={v == null ? 'TOTAL' : String(v)}>
                    {v == null ? 'todo o comprimento' : `${v} m`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {bitolaSelect('Pilar', 'bitolaPilarMm')}
            {bitolaSelect('Viga', 'bitolaVigaMm')}
            {bitolaSelect('Laje', 'bitolaLajeMm')}
            {bitolaSelect('Bloco', 'bitolaBlocoMm')}
            {bitolaSelect('Estaca', 'bitolaEstacaMm')}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {taxaInput('Pilar', 'taxaPilarKgM3')}
            {taxaInput('Viga', 'taxaVigaKgM3')}
            {taxaInput('Laje', 'taxaLajeKgM3')}
            {taxaInput('Bloco', 'taxaBlocoKgM3')}
            {taxaInput('Estaca', 'taxaEstacaKgM3')}
            <button
              type="button"
              onClick={() => onHipoteses(HIPOTESES_ARMADURA_PADRAO)}
              className="rounded-[6px] border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Voltar ao padrão
            </button>
          </div>
          {Object.keys(h.porPeca ?? {}).length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <span>
                <strong>{Object.keys(h.porPeca ?? {}).length}</strong> peça(s) com armadura lançada manualmente (no painel da peça) — valem o
                que foi lançado, sem piso de taxa.
              </span>
              <button
                type="button"
                onClick={() => {
                  const { porPeca: _p, ...resto } = h;
                  void _p;
                  onHipoteses(resto);
                }}
                className="rounded-[6px] border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Voltar todas ao automático
              </button>
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            {carregando
              ? 'Carregando as hipóteses do estudo…'
              : persistenciaIndisponivel
                ? 'Sem persistência (migration ausente): as hipóteses valem só nesta sessão.'
                : 'Gravadas no estudo — quem abrir esta planta vê o mesmo aço, e o orçamento usa estas hipóteses.'}
          </p>
        </div>
        </div>
      )}
    </div>
  );
}
