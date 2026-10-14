/**
 * TELA "Áreas NBR 12721" da Planta Inteligente (13/10/2026, Fase 6 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`) — o que era o módulo
 * separado "Motor de Áreas", agora dentro do estudo.
 *
 * Tudo é DERIVADO ao vivo: o adaptador (`entradaDoEstudo`) lê o desenho, as
 * classificações e as hipóteses; o motor puro (`calcularNbr12721`) devolve os
 * Quadros I, II e IV-B, as frações e as pendências. Mudar o coeficiente de uma
 * varanda muda o QII-31 na hora — sem "calcular", sem versão de rascunho.
 *
 * Abas (§19.1, `TabsBar`):
 *   - Classificação — cada ambiente (desenhado ou declarado) com cobertura,
 *     coeficiente, divisão e escopo; seleção em lote (§10) + drawer (§26);
 *     "Aplicar sugestões" para os que ainda não foram classificados;
 *   - Quadro I · Quadro II · Quadro IV-B — as linhas da norma, com totais;
 *   - Frações — decimal, percentual e milésimos fechados em 1000;
 *   - Pendências — o que impede o cálculo e o que faz o prédio não fechar;
 *   - Hipóteses — o que é do estudo e não de um ambiente (coeficientes padrão,
 *     escopo, área da vaga, numeração dos andares copiados).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Layers, Ruler, Sparkles, Tags } from 'lucide-react';
import type { BlueprintModel, ClassificacaoNbr12721, CoberturaNbr12721, Command } from '../../utils/blueprintKernel';
import {
  ambientesParaClassificar,
  entradaDoEstudo,
  hipotesesNbr12721DaColuna,
  type AmbienteParaClassificar,
  type HipotesesNbr12721,
} from '../../utils/blueprintNbr12721';
import { calcularNbr12721 } from '../../utils/nbr12721/quadros';
import type { FracaoIdeal, LinhaQuadroI, LinhaQuadroII, LinhaQuadroIVB, Pendencia } from '../../utils/nbr12721/tipos';
import { KpiCard } from '../ui/KpiCard';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar } from '../ui/TabsBar';
import { Sheet, SheetFooter, SheetHeader, SheetPanel, SheetTitle, SheetDescription } from '../ui/sheet';

type Aba = 'classificacao' | 'quadro-i' | 'quadro-ii' | 'quadro-ivb' | 'fracoes' | 'pendencias' | 'hipoteses';

interface Props {
  model: BlueprintModel;
  hipoteses: HipotesesNbr12721;
  /** Grava as hipóteses do estudo; `null` = sem permissão de editar (o botão diz por quê). */
  onSalvarHipoteses: ((h: HipotesesNbr12721) => Promise<void>) | null;
  onRunBatch: (cs: Command[]) => void;
  /** A última recusa do kernel — a faixa do editor fica escondida enquanto a tela está aberta. */
  erro: string | null;
}

export const ROTULO_DA_COBERTURA: Record<CoberturaNbr12721, string> = {
  PADRAO: 'Coberta de padrão',
  DIFERENTE: 'Coberta de padrão diferente',
  DESCOBERTA: 'Descoberta',
};

const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const coef = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} %`;
const mil = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const numero = (texto: string) => <span className="block text-right text-sm font-normal tabular-nums text-gray-700">{texto}</span>;
const somar = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/** O que a linha mostra como classificação — a gravada, ou a sugestão marcada como tal. */
function resumoDaClassificacao(c: ClassificacaoNbr12721, privativo: boolean): string {
  const partes = [ROTULO_DA_COBERTURA[c.cobertura]];
  if (c.coeficiente != null) partes.push(`coef. ${c.coeficiente.toLocaleString('pt-BR')}`);
  if (privativo && c.natureza === 'ACESSORIA') partes.push('acessória');
  if (!privativo) partes.push(c.divisao === 'NAO_PROPORCIONAL' ? 'não proporcional' : c.divisao === 'PROPORCIONAL' ? 'proporcional' : 'sem divisão');
  if (!privativo && c.escopo) partes.push(c.escopo === 'BLOCO' ? 'por bloco' : 'global');
  return partes.join(' · ');
}

// ── colunas ─────────────────────────────────────────────────────────────────
// Soma das larguras ≤ ~1270 px (memória: acima disso a última coluna some com a barra lateral).

const COLUNAS_CLASSIFICACAO: StandardTableColumn[] = [
  { key: 'nome', label: 'Ambiente', width: 200 },
  { key: 'pavimento', label: 'Pavimento', width: 160 },
  { key: 'dono', label: 'Unidade', width: 120 },
  { key: 'area', label: 'Área (m²)', width: 110, align: 'right' },
  { key: 'classificacao', label: 'Classificação', width: 310 },
  { key: 'origem', label: 'Origem', width: 110 },
  { key: 'copias', label: 'Cópias', width: 90, align: 'right' },
];

const COLUNAS_QI: StandardTableColumn[] = [
  { key: 'floor_label', label: 'Pavimento', width: 170 },
  { key: 'qi_05_private_real_total_raw', label: 'Priv. real', width: 135, align: 'right' },
  { key: 'qi_06_private_equivalent_total_raw', label: 'Priv. equiv.', width: 135, align: 'right' },
  { key: 'qi_10_common_nonprop_real_total_raw', label: 'Não prop. real', width: 135, align: 'right' },
  { key: 'qi_11_common_nonprop_equivalent_total_raw', label: 'Não prop. equiv.', width: 135, align: 'right' },
  { key: 'qi_15_common_prop_real_total_raw', label: 'Prop. real', width: 135, align: 'right' },
  { key: 'qi_16_common_prop_equivalent_total_raw', label: 'Prop. equiv.', width: 135, align: 'right' },
  { key: 'qi_17_floor_real_total_raw', label: 'Total real', width: 135, align: 'right' },
  { key: 'qi_18_floor_equivalent_total_raw', label: 'Total equiv.', width: 135, align: 'right' },
];

const COLUNAS_QII: StandardTableColumn[] = [
  { key: 'unit_label', label: 'Unidade', width: 130 },
  { key: 'qii_23_private_real_total_raw', label: 'Priv. real', width: 125, align: 'right' },
  { key: 'qii_24_private_equivalent_total_raw', label: 'Priv. equiv.', width: 125, align: 'right' },
  { key: 'qii_28_common_nonprop_real_total_raw', label: 'Não prop. real', width: 125, align: 'right' },
  { key: 'qii_29_common_nonprop_equivalent_total_raw', label: 'Não prop. equiv.', width: 125, align: 'right' },
  { key: 'qii_31_proportionality_coefficient_raw', label: 'Coef. proporc.', width: 125, align: 'right' },
  { key: 'qii_35_common_prop_real_total_raw', label: 'Prop. real', width: 125, align: 'right' },
  { key: 'qii_36_common_prop_equivalent_total_raw', label: 'Prop. equiv.', width: 125, align: 'right' },
  { key: 'qii_37_unit_real_total_raw', label: 'Total real', width: 125, align: 'right' },
  { key: 'qii_38_unit_equivalent_total_raw', label: 'Total equiv.', width: 125, align: 'right' },
];

const COLUNAS_QIVB: StandardTableColumn[] = [
  { key: 'unit_label', label: 'Unidade', width: 140 },
  { key: 'qivb_b_private_main_area_raw', label: 'Privativa principal', width: 140, align: 'right' },
  { key: 'qivb_c_private_accessory_area_raw', label: 'Privativa acessória', width: 140, align: 'right' },
  { key: 'qivb_d_private_total_area_raw', label: 'Privativa total', width: 130, align: 'right' },
  { key: 'qivb_e_common_area_raw', label: 'Comum', width: 120, align: 'right' },
  { key: 'qivb_f_real_total_area_raw', label: 'Real total', width: 130, align: 'right' },
  { key: 'qivb_g_proportionality_coefficient_raw', label: 'Coef. proporc.', width: 130, align: 'right' },
];

const COLUNAS_FRACOES: StandardTableColumn[] = [
  { key: 'unidade', label: 'Unidade', width: 160 },
  { key: 'fraction_decimal_raw', label: 'Fração (decimal)', width: 170, align: 'right' },
  { key: 'fraction_percent_raw', label: 'Fração (%)', width: 150, align: 'right' },
  { key: 'milesimos', label: 'Milésimos (fechados em 1000)', width: 220, align: 'right' },
];

const COLUNAS_PENDENCIAS: StandardTableColumn[] = [
  { key: 'tipo', label: 'Tipo', width: 120 },
  { key: 'codigo', label: 'Código', width: 140 },
  { key: 'mensagem', label: 'O que acontece', width: 640, sortable: false },
  { key: 'itens', label: 'Itens', width: 280, sortable: false },
];

/** Linha de pendência unificada: as do motor + as do adaptador (avisos e "a classificar"). */
interface LinhaDePendencia {
  chave: string;
  tipo: 'Bloqueia' | 'Aviso' | 'A classificar';
  codigo: string;
  mensagem: string;
  itens: string;
}

// ── formulário de classificação (drawer) ────────────────────────────────────

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

interface FormDaClassificacao {
  cobertura: CoberturaNbr12721;
  coeficiente: string;
  natureza: '' | 'ACESSORIA';
  divisao: '' | 'PROPORCIONAL' | 'NAO_PROPORCIONAL';
  escopo: '' | 'GLOBAL' | 'BLOCO';
}

function DrawerDeClassificacao({
  linhas,
  aberto,
  onFechar,
  onAplicar,
}: {
  linhas: AmbienteParaClassificar[];
  aberto: boolean;
  onFechar: () => void;
  onAplicar: (c: ClassificacaoNbr12721 | null) => void;
}) {
  const privativos = linhas.filter((l) => l.unidade || l.acessorioDe).length;
  const comuns = linhas.length - privativos;
  const [form, setForm] = useState<FormDaClassificacao>({ cobertura: 'PADRAO', coeficiente: '', natureza: '', divisao: 'PROPORCIONAL', escopo: '' });
  useEffect(() => {
    if (!aberto) return;
    // Abre com a classificação comum a todos (ou a primeira), para editar em vez de redigitar.
    const c = linhas[0]?.classificacao ?? linhas[0]?.sugerida ?? { cobertura: 'PADRAO' };
    setForm({
      cobertura: c.cobertura,
      coeficiente: c.coeficiente != null ? String(c.coeficiente).replace('.', ',') : '',
      natureza: c.natureza === 'ACESSORIA' ? 'ACESSORIA' : '',
      divisao: c.divisao ?? (comuns ? 'PROPORCIONAL' : ''),
      escopo: c.escopo ?? '',
    });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const coeficiente = form.coeficiente.trim() ? Number(form.coeficiente.replace(',', '.')) : null;
  const coeficienteInvalido = coeficiente !== null && !(Number.isFinite(coeficiente) && coeficiente > 0 && coeficiente <= 10);
  const motivo = linhas.length === 0 ? 'Selecione ao menos um ambiente' : coeficienteInvalido ? 'O coeficiente tem de estar entre 0 e 10' : null;

  const aplicar = () => {
    if (motivo) return;
    onAplicar({
      cobertura: form.cobertura,
      ...(coeficiente !== null ? { coeficiente } : {}),
      ...(form.natureza ? { natureza: 'ACESSORIA' as const } : {}),
      ...(form.divisao ? { divisao: form.divisao } : {}),
      ...(form.escopo ? { escopo: form.escopo } : {}),
    });
  };

  return (
    <Sheet open={aberto} onClose={onFechar} size="md">
      <SheetHeader onClose={onFechar}>
        <SheetTitle>Classificar {linhas.length} ambiente(s)</SheetTitle>
        <SheetDescription>
          {privativos} privativo(s) e {comuns} comum(ns). A divisão e o escopo só valem para os comuns; a natureza acessória, só para os privativos.
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="p-6 space-y-8">
        <div className="space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-sm font-semibold text-gray-900">Cobertura e equivalência</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1.5 col-span-2">
              <label className={ROTULO} htmlFor="nbr-cobertura">Cobertura</label>
              <select id="nbr-cobertura" className={CAMPO} value={form.cobertura} onChange={(e) => setForm({ ...form, cobertura: e.target.value as CoberturaNbr12721 })}>
                {(Object.keys(ROTULO_DA_COBERTURA) as CoberturaNbr12721[]).map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_DA_COBERTURA[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="nbr-coeficiente">Coeficiente de equivalência</label>
              <input
                id="nbr-coeficiente"
                className={CAMPO}
                inputMode="decimal"
                placeholder={form.cobertura === 'PADRAO' ? '1 (padrão)' : 'usa o das hipóteses'}
                value={form.coeficiente}
                onChange={(e) => setForm({ ...form, coeficiente: e.target.value })}
              />
            </div>
            {privativos > 0 && (
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="nbr-natureza">Natureza (privativos)</label>
                <select id="nbr-natureza" className={CAMPO} value={form.natureza} onChange={(e) => setForm({ ...form, natureza: e.target.value as FormDaClassificacao['natureza'] })}>
                  <option value="">Principal</option>
                  <option value="ACESSORIA">Acessória (depósito, vaga dentro da unidade)</option>
                </select>
              </div>
            )}
          </div>
        </div>
        {comuns > 0 && (
          <div className="space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h3 className="text-sm font-semibold text-gray-900">Área comum</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="nbr-divisao">Divisão</label>
                <select id="nbr-divisao" className={CAMPO} value={form.divisao} onChange={(e) => setForm({ ...form, divisao: e.target.value as FormDaClassificacao['divisao'] })}>
                  <option value="PROPORCIONAL">Proporcional</option>
                  <option value="NAO_PROPORCIONAL">Não proporcional</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="nbr-escopo">Rateio</label>
                <select id="nbr-escopo" className={CAMPO} value={form.escopo} onChange={(e) => setForm({ ...form, escopo: e.target.value as FormDaClassificacao['escopo'] })} disabled={form.divisao !== 'PROPORCIONAL'}>
                  <option value="">O padrão do estudo</option>
                  <option value="GLOBAL">O prédio todo</option>
                  <option value="BLOCO">Só o bloco</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </SheetPanel>
      <SheetFooter>
        <button type="button" onClick={() => onAplicar(null)} className="h-9 px-3.5 mr-auto text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
          Voltar a "a classificar"
        </button>
        <button type="button" onClick={onFechar} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">
          Cancelar
        </button>
        <button
          type="button"
          onClick={aplicar}
          disabled={motivo !== null}
          title={motivo ?? undefined}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:bg-slate-300"
        >
          Aplicar
        </button>
      </SheetFooter>
    </Sheet>
  );
}

// ── formulário de hipóteses ─────────────────────────────────────────────────

function FormDeHipoteses({ hipoteses, onSalvar }: { hipoteses: HipotesesNbr12721; onSalvar: Props['onSalvarHipoteses'] }) {
  const paraTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
  const [diferente, setDiferente] = useState(paraTexto(hipoteses.coeficientesPadrao.DIFERENTE));
  const [descoberta, setDescoberta] = useState(paraTexto(hipoteses.coeficientesPadrao.DESCOBERTA));
  const [escopo, setEscopo] = useState(hipoteses.escopoPadrao);
  const [vaga, setVaga] = useState(hipoteses.areaDaVagaMm2 == null ? '' : paraTexto(hipoteses.areaDaVagaMm2 / 1e6));
  const [regra, setRegra] = useState(hipoteses.numeracao.regra);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const num = (t: string) => (t.trim() ? Number(t.replace(',', '.')) : null);
  const proposta = hipotesesNbr12721DaColuna({
    ...hipoteses,
    coeficientesPadrao: { DIFERENTE: num(diferente), DESCOBERTA: num(descoberta) },
    escopoPadrao: escopo,
    areaDaVagaMm2: num(vaga) === null ? null : Math.round((num(vaga) as number) * 1e6),
    numeracao: { regra },
  });
  const sujo = JSON.stringify(proposta) !== JSON.stringify(hipoteses);
  const invalido =
    [diferente, descoberta].some((t) => t.trim() && !(Number(t.replace(',', '.')) > 0 && Number(t.replace(',', '.')) <= 10)) ||
    (vaga.trim() !== '' && !(Number(vaga.replace(',', '.')) > 0));
  const motivo = !onSalvar ? 'Sem permissão para editar as hipóteses deste estudo' : invalido ? 'Coeficiente entre 0 e 10; área da vaga positiva' : !sujo ? 'Nada mudou' : null;

  const salvar = async () => {
    if (motivo || !onSalvar) return;
    setSalvando(true);
    setMensagem(null);
    try {
      await onSalvar(proposta);
      setMensagem('Hipóteses salvas.');
    } catch (e) {
      setMensagem(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
        <div className="space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-sm font-semibold text-gray-900">Coeficientes padrão</h3>
            <p className="text-xs text-gray-500 mt-1">
              Usados quando o ambiente fora do padrão não diz o seu. A norma não fixa esses números — quem fixa é o responsável técnico. Vazio = sem padrão: o ambiente sem coeficiente vira pendência.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-diferente">Coberta de padrão diferente</label>
              <input id="hip-diferente" className={CAMPO} inputMode="decimal" placeholder="ex.: 0,75" value={diferente} onChange={(e) => setDiferente(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-descoberta">Descoberta</label>
              <input id="hip-descoberta" className={CAMPO} inputMode="decimal" placeholder="ex.: 0,50" value={descoberta} onChange={(e) => setDescoberta(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-sm font-semibold text-gray-900">Rateio, vagas e numeração</h3>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-escopo">Rateio do comum proporcional</label>
              <select id="hip-escopo" className={CAMPO} value={escopo} onChange={(e) => setEscopo(e.target.value as HipotesesNbr12721['escopoPadrao'])}>
                <option value="GLOBAL">O prédio todo</option>
                <option value="BLOCO">Só o bloco</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-vaga">Área da vaga vinculada (m²)</label>
              <input id="hip-vaga" className={CAMPO} inputMode="decimal" placeholder="a desenhada" value={vaga} onChange={(e) => setVaga(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-numeracao">Numeração dos andares copiados</label>
              <select id="hip-numeracao" className={CAMPO} value={regra} onChange={(e) => setRegra(e.target.value as HipotesesNbr12721['numeracao']['regra'])}>
                <option value="ANDAR_E_POSICAO">Andar + posição (101 → 501)</option>
                <option value="PAVIMENTO_E_NUMERO">Pavimento · número</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-4">
        {mensagem && <span className="text-xs text-gray-500" role="status">{mensagem}</span>}
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || motivo !== null}
          title={motivo ?? undefined}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:bg-slate-300"
        >
          {salvando ? 'Salvando…' : 'Salvar hipóteses'}
        </button>
      </div>
    </div>
  );
}

// ── a tela ──────────────────────────────────────────────────────────────────

export default function TelaAreasNbr12721({ model, hipoteses, onSalvarHipoteses, onRunBatch, erro }: Props) {
  const [aba, setAba] = useState<Aba>('classificacao');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [drawerAberto, setDrawerAberto] = useState(false);

  const montado = useMemo(() => entradaDoEstudo(model, hipoteses), [model, hipoteses]);
  const saida = useMemo(() => calcularNbr12721(montado.entrada), [montado]);
  const linhas = useMemo(() => ambientesParaClassificar(model), [model]);

  const bloqueantes = saida.pendencias.filter((p) => p.bloqueante);
  const avisosDoMotor = saida.pendencias.filter((p) => !p.bloqueante);
  const pendencias: LinhaDePendencia[] = useMemo(
    () => [
      ...saida.pendencias.map((p: Pendencia, i) => ({ chave: `m${i}`, tipo: p.bloqueante ? ('Bloqueia' as const) : ('Aviso' as const), codigo: p.codigo, mensagem: p.mensagem, itens: p.itens.join(', ') })),
      ...montado.avisos.map((a, i) => ({ chave: `a${i}`, tipo: 'Aviso' as const, codigo: 'PLANTA', mensagem: a, itens: '' })),
      ...(montado.aClassificar.length
        ? [{ chave: 'c', tipo: 'A classificar' as const, codigo: 'SUGESTAO', mensagem: `${montado.aClassificar.length} ambiente(s) entraram pela sugestão da Planta — confirme na aba Classificação.`, itens: montado.aClassificar.slice(0, 12).join(', ') + (montado.aClassificar.length > 12 ? '…' : '') }]
        : []),
    ],
    [saida, montado],
  );

  const totalReal = somar(saida.quadroI, (l) => l.qi_17_floor_real_total_raw);
  const totalEquiv = somar(saida.quadroI, (l) => l.qi_18_floor_equivalent_total_raw);
  const naoClassificados = linhas.filter((l) => !l.classificacao);
  const selecionadas = linhas.filter((l) => selecionados.has(l.chave));

  const classificar = (alvos: AmbienteParaClassificar[], c: ClassificacaoNbr12721 | null) => {
    const labelIds = alvos.filter((l) => l.tipo === 'ETIQUETA').map((l) => l.id);
    const declaradoIds = alvos.filter((l) => l.tipo === 'DECLARADO').map((l) => l.id);
    if (!labelIds.length && !declaradoIds.length) return;
    onRunBatch([{ type: 'SetNbr12721DoAmbiente', labelIds, declaradoIds, nbr12721: c }]);
  };
  const aplicarSugestoes = () => {
    // Uma classificação por linha (as sugestões diferem) — um lote só, um Ctrl+Z.
    onRunBatch(
      naoClassificados.map((l) => ({
        type: 'SetNbr12721DoAmbiente',
        ...(l.tipo === 'ETIQUETA' ? { labelIds: [l.id] } : { declaradoIds: [l.id] }),
        nbr12721: l.sugerida,
      })) as Command[],
    );
  };

  /** Linha de total numa célula só (`colSpan`): o StandardTable não expõe quais colunas estão visíveis, e total por coluna desalinharia ao esconder uma. */
  const linhaDeTotais = (partes: [string, string][]) => (visiveis: number) => (
    <tr className="border-t border-gray-200 bg-white">
      <td colSpan={visiveis} className="px-6 py-2.5 text-sm font-medium text-gray-800">
        <span className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <span>Total</span>
          <span className="flex flex-wrap gap-x-6 tabular-nums">
            {partes.map(([rotulo, valor]) => (
              <span key={rotulo}>
                <span className="font-normal text-gray-500">{rotulo}</span> {valor}
              </span>
            ))}
          </span>
        </span>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6" data-testid="tela-areas-nbr12721">
      <TabsBar<Aba>
        tabs={[
          { id: 'classificacao', label: 'Classificação', badge: naoClassificados.length || undefined },
          { id: 'quadro-i', label: 'Quadro I' },
          { id: 'quadro-ii', label: 'Quadro II' },
          { id: 'quadro-ivb', label: 'Quadro IV-B' },
          { id: 'fracoes', label: 'Frações' },
          { id: 'pendencias', label: 'Pendências', badge: pendencias.length || undefined },
          { id: 'hipoteses', label: 'Hipóteses' },
        ]}
        value={aba}
        onChange={setAba}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Área real" value={`${m2(totalReal)} m²`} sub="Quadro I, todos os pavimentos" icon={<Ruler />} color="blue" />
        <KpiCard label="Área equivalente" value={`${m2(totalEquiv)} m²`} sub="Com os coeficientes de equivalência" icon={<Calculator />} color="indigo" />
        <KpiCard label="Unidades" value={saida.quadroII.length} sub={`${montado.entrada.pavimentos.length} pavimento(s)`} icon={<Layers />} color="emerald" />
        <KpiCard
          label={saida.status === 'success' ? 'Pendências' : 'Cálculo bloqueado'}
          value={saida.status === 'success' ? avisosDoMotor.length + montado.avisos.length + (montado.aClassificar.length ? 1 : 0) : bloqueantes.length}
          sub={saida.status === 'success' ? 'Avisos — os quadros já saem' : 'Corrija para os quadros saírem'}
          icon={saida.status === 'success' ? <CheckCircle2 /> : <AlertTriangle />}
          color={saida.status === 'success' ? 'amber' : 'red'}
          onClick={() => setAba('pendencias')}
        />
      </div>

      {erro && (
        <p className="text-sm text-red-700" role="alert">
          {erro}
        </p>
      )}

      {aba === 'classificacao' && (
        <>
          <StandardTable<AmbienteParaClassificar>
            columns={COLUNAS_CLASSIFICACAO}
            storageKey="blueprint:nbr12721:classificacao"
            rows={linhas}
            rowKey={(l) => l.chave}
            searchText={(l) => `${l.nome} ${l.pavimento} ${l.unidade ?? ''}`}
            searchPlaceholder="Buscar ambiente, pavimento ou unidade…"
            selection={{ selected: selecionados, onChange: setSelecionados }}
            sortValue={(key, l) =>
              key === 'area' ? l.areaMm2 : key === 'dono' ? (l.unidade ?? l.acessorioDe ?? '') : key === 'classificacao' ? resumoDaClassificacao(l.classificacao ?? l.sugerida, !!(l.unidade || l.acessorioDe)) : key === 'origem' ? l.tipo : key === 'copias' ? l.copias : key === 'pavimento' ? l.pavimento : l.nome
            }
            renderCell={(key, l) => {
              const privativo = !!(l.unidade || l.acessorioDe);
              switch (key) {
                case 'nome':
                  return <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome}</span>;
                case 'pavimento':
                  return <span className="block truncate text-sm font-normal text-gray-600" title={l.pavimento}>{l.pavimento}</span>;
                case 'dono':
                  return (
                    <span className="text-sm font-normal text-gray-700">
                      {l.unidade ?? (l.acessorioDe ? `acessório de ${l.acessorioDe}` : <span className="text-gray-500">comum</span>)}
                    </span>
                  );
                case 'area':
                  return numero(m2(l.areaMm2 / 1e6));
                case 'classificacao':
                  return l.classificacao ? (
                    <span className="block truncate text-sm font-normal text-gray-700" title={resumoDaClassificacao(l.classificacao, privativo)}>
                      {resumoDaClassificacao(l.classificacao, privativo)}
                    </span>
                  ) : (
                    <span className="block truncate text-sm font-normal text-amber-700" title={`Sugestão: ${resumoDaClassificacao(l.sugerida, privativo)}`}>
                      sugestão: {resumoDaClassificacao(l.sugerida, privativo)}
                    </span>
                  );
                case 'origem':
                  return <span className="text-sm font-normal text-gray-600">{l.tipo === 'ETIQUETA' ? 'Desenhado' : 'Declarado'}</span>;
                case 'copias':
                  return numero(l.copias ? String(l.copias) : '—');
                default:
                  return null;
              }
            }}
            actions={{
              width: 120,
              render: (l) => (
                <button
                  type="button"
                  onClick={() => {
                    setSelecionados(new Set([l.chave]));
                    setDrawerAberto(true);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                >
                  Classificar
                </button>
              ),
            }}
            toolbarRight={
              <button
                type="button"
                onClick={aplicarSugestoes}
                disabled={naoClassificados.length === 0}
                title={naoClassificados.length === 0 ? 'Todos os ambientes já têm classificação' : 'Grava a sugestão da Planta em cada ambiente ainda não classificado — confira depois'}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> Aplicar sugestões ({naoClassificados.length})
              </button>
            }
            empty={{ icon: <Tags className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum ambiente ainda', subtitle: 'Desenhe e nomeie os ambientes, ou declare as áreas, para classificá-los.' }}
          />
          {selecionados.size > 0 && !drawerAberto && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
              <span className="flex-1 text-sm font-bold whitespace-nowrap">{selecionados.size} selecionado(s)</span>
              <button type="button" onClick={() => setDrawerAberto(true)} className="h-9 px-3.5 rounded-[6px] bg-white text-blue-700 text-sm font-medium hover:bg-blue-50">
                Classificar em lote
              </button>
              <button type="button" onClick={() => setSelecionados(new Set())} className="h-9 px-3 rounded-[6px] bg-blue-500 text-sm font-medium hover:bg-blue-400">
                Desmarcar
              </button>
            </div>
          )}
          <DrawerDeClassificacao
            linhas={selecionadas}
            aberto={drawerAberto}
            onFechar={() => setDrawerAberto(false)}
            onAplicar={(c) => {
              classificar(selecionadas, c);
              setDrawerAberto(false);
              setSelecionados(new Set());
            }}
          />
        </>
      )}

      {/* Quadro I sem busca: uma linha por pavimento, poucas, todas lidas juntas. */}
      {aba === 'quadro-i' && (
        <StandardTable<LinhaQuadroI>
          columns={COLUNAS_QI}
          storageKey="blueprint:nbr12721:quadroI"
          rows={saida.quadroI}
          rowKey={(l) => `${l.bloco}:${l.pavimento}`}
          sortValue={(key, l) => (key === 'floor_label' ? l.row_order : (l as unknown as Record<string, number>)[key])}
          renderCell={(key, l) => (key === 'floor_label' ? <span className="text-sm font-normal text-gray-700">{l.floor_label}</span> : numero(m2((l as unknown as Record<string, number>)[key])))}
          renderTotals={linhaDeTotais([['real', `${m2(totalReal)} m²`], ['equivalente', `${m2(totalEquiv)} m²`]])}
          empty={{ title: saida.status === 'success' ? 'Sem pavimentos' : 'Cálculo bloqueado', subtitle: saida.status === 'success' ? undefined : 'Veja a aba Pendências.' }}
        />
      )}

      {aba === 'quadro-ii' && (
        <StandardTable<LinhaQuadroII>
          columns={COLUNAS_QII}
          storageKey="blueprint:nbr12721:quadroII"
          rows={saida.quadroII}
          rowKey={(l) => l.unidade}
          searchText={(l) => l.unit_label}
          searchPlaceholder="Buscar unidade…"
          sortValue={(key, l) => (l as unknown as Record<string, number | string>)[key]}
          renderCell={(key, l) =>
            key === 'unit_label'
              ? <span className="text-sm font-normal text-gray-700">{l.unit_label}</span>
              : numero(key === 'qii_31_proportionality_coefficient_raw' ? coef(l.qii_31_proportionality_coefficient_raw) : m2((l as unknown as Record<string, number>)[key]))
          }
          renderTotals={linhaDeTotais([['real', `${m2(somar(saida.quadroII, (l) => l.qii_37_unit_real_total_raw))} m²`], ['equivalente', `${m2(somar(saida.quadroII, (l) => l.qii_38_unit_equivalent_total_raw))} m²`], ['Σ coeficientes', coef(somar(saida.quadroII, (l) => l.qii_31_proportionality_coefficient_raw))]])}
          empty={{ title: saida.status === 'success' ? 'Nenhuma unidade' : 'Cálculo bloqueado', subtitle: saida.status === 'success' ? 'Crie unidades na tela Unidades.' : 'Veja a aba Pendências.' }}
        />
      )}

      {aba === 'quadro-ivb' && (
        <StandardTable<LinhaQuadroIVB>
          columns={COLUNAS_QIVB}
          storageKey="blueprint:nbr12721:quadroIVB"
          rows={saida.quadroIVB}
          rowKey={(l) => l.unidade}
          searchText={(l) => l.unit_label}
          searchPlaceholder="Buscar unidade…"
          sortValue={(key, l) => (l as unknown as Record<string, number | string>)[key]}
          renderCell={(key, l) =>
            key === 'unit_label'
              ? <span className="text-sm font-normal text-gray-700">{l.unit_label}</span>
              : numero(key === 'qivb_g_proportionality_coefficient_raw' ? coef(l.qivb_g_proportionality_coefficient_raw) : m2((l as unknown as Record<string, number>)[key]))
          }
          renderTotals={linhaDeTotais([['privativa', `${m2(somar(saida.quadroIVB, (l) => l.qivb_d_private_total_area_raw))} m²`], ['comum', `${m2(somar(saida.quadroIVB, (l) => l.qivb_e_common_area_raw))} m²`], ['real', `${m2(somar(saida.quadroIVB, (l) => l.qivb_f_real_total_area_raw))} m²`]])}
          empty={{ title: saida.status === 'success' ? 'Nenhuma unidade' : 'Cálculo bloqueado', subtitle: saida.status === 'success' ? undefined : 'Veja a aba Pendências.' }}
        />
      )}

      {aba === 'fracoes' && (
        <StandardTable<FracaoIdeal>
          columns={COLUNAS_FRACOES}
          storageKey="blueprint:nbr12721:fracoes"
          rows={saida.fracoes}
          rowKey={(f) => f.unidade}
          searchText={(f) => f.unidade}
          searchPlaceholder="Buscar unidade…"
          sortValue={(key, f) => (f as unknown as Record<string, number | string>)[key]}
          renderCell={(key, f) => {
            if (key === 'unidade') return <span className="text-sm font-normal text-gray-700">{f.unidade}</span>;
            if (key === 'fraction_decimal_raw') return <span className="block text-right text-sm font-normal tabular-nums text-gray-700" title={String(f.fraction_decimal_raw)}>{f.fraction_decimal_raw.toFixed(10)}</span>;
            if (key === 'fraction_percent_raw') return numero(pct(f.fraction_percent_raw));
            return numero(mil(f.milesimos));
          }}
          renderTotals={linhaDeTotais([['decimal', somar(saida.fracoes, (f) => f.fraction_decimal_raw).toFixed(10)], ['percentual', pct(somar(saida.fracoes, (f) => f.fraction_percent_raw))], ['milésimos', mil(somar(saida.fracoes, (f) => f.milesimos))]])}
          empty={{ title: saida.status === 'success' ? 'Nenhuma unidade' : 'Cálculo bloqueado', subtitle: saida.status === 'success' ? undefined : 'Veja a aba Pendências.' }}
        />
      )}

      {aba === 'pendencias' && (
        <StandardTable<LinhaDePendencia>
          columns={COLUNAS_PENDENCIAS}
          storageKey="blueprint:nbr12721:pendencias"
          rows={pendencias}
          rowKey={(p) => p.chave}
          searchText={(p) => `${p.codigo} ${p.mensagem} ${p.itens}`}
          searchPlaceholder="Buscar pendência…"
          sortValue={(key, p) => (p as unknown as Record<string, string>)[key]}
          renderCell={(key, p) => {
            if (key === 'tipo') return <span className={`text-sm font-normal ${p.tipo === 'Bloqueia' ? 'text-red-600' : p.tipo === 'Aviso' ? 'text-amber-700' : 'text-blue-600'}`}>{p.tipo}</span>;
            if (key === 'codigo') return <span className="text-sm font-normal text-gray-600">{p.codigo}</span>;
            if (key === 'mensagem') return <span className="text-sm font-normal text-gray-700">{p.mensagem}</span>;
            return <span className="block truncate text-sm font-normal text-gray-600" title={p.itens}>{p.itens || '—'}</span>;
          }}
          empty={{ icon: <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma pendência', subtitle: 'Os quadros fecham e todos os ambientes estão classificados.' }}
        />
      )}

      {aba === 'hipoteses' && <FormDeHipoteses key={JSON.stringify(hipoteses)} hipoteses={hipoteses} onSalvar={onSalvarHipoteses} />}
    </div>
  );
}
