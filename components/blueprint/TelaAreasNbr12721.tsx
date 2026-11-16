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
 * Desde a crítica `/impeccable` de 15/11/2026 (20/40,
 * `docs/planos/2026-11-15-areas-nbr12721-critica.md`):
 *   - a FAIXA DE ETAPAS diz onde o documento está (rascunho → versão publicada →
 *     aprovações → frações no Empreendimento) e qual é o próximo passo; "Baixar prévia"
 *     leva o rascunho em PDF/XLSX, marcado como prévia;
 *   - as PENDÊNCIAS ficam sempre à vista, legíveis (ambiente · pavimento · unidade) e
 *     com "Resolver" — antes eram uma aba entre nove, com o UUID do espaço;
 *   - abas em dois grupos (§19.1, `TabsBar` com `grupo`):
 *       Entrada — Classificação · Ambientes declarados · Acessórios · Hipóteses;
 *       Quadros — Quadro I · Quadro II · Quadro IV-B · Frações, com as colunas da norma
 *       (as mesmas do documento publicado, `utils/nbr12721/documento.ts`);
 *   - travas: "Aplicar sugestões" confirma com o resumo e a área equivalente antes →
 *     depois; o aviso depois de gravar tem "Desfazer"; o lote não atropela valores
 *     diferentes; "Voltar à sugestão" confirma.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Car, Check, CheckCircle2, ChevronRight, Circle, Download, FileSpreadsheet, Info, Layers, Plus, Ruler, Sparkles, Tags } from 'lucide-react';
import { applyBatch, sha256, stableStringify, type BlueprintModel, type ClassificacaoNbr12721, type CoberturaNbr12721, type Command } from '../../utils/blueprintKernel';
import {
  acessoriosParaVincular,
  ambientesParaClassificar,
  comandosDaPlanilhaDeDeclarados,
  comandosDoAcessorio,
  COLUNAS_DA_PLANILHA_DE_DECLARADOS,
  entradaDoEstudo,
  hipotesesNbr12721DaColuna,
  type AcessorioParaVincular,
  type AmbienteParaClassificar,
  type HipotesesNbr12721,
} from '../../utils/blueprintNbr12721';
import type { AmbienteDeclarado } from '../../utils/blueprintKernel';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { calcularNbr12721, VERSAO_DO_MOTOR_NBR12721 } from '../../utils/nbr12721/quadros';
import { celulaFormatada, documentoDaPrevia, tabelasDoDocumentoNbr12721, type TabelaDoDocumento } from '../../utils/nbr12721/documento';
import { ondeEsta, pendenciasLegiveis, type AlvoDaPendencia, type PendenciaLegivel } from '../../utils/nbr12721/pendenciasLegiveis';
import { etapasDoDocumentoNbr12721, type SituacaoDoDocumentoNbr } from '../../utils/nbr12721/etapas';
import { KpiCard } from '../ui/KpiCard';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar } from '../ui/TabsBar';
import { FilterPopover } from '../ui/FilterPopover';
import { usePersistedState } from '../ui/TableUtils';
import { Sheet, SheetFooter, SheetHeader, SheetPanel, SheetTitle, SheetDescription } from '../ui/sheet';

type Aba = 'classificacao' | 'declarados' | 'acessorios' | 'hipoteses' | 'quadro-i' | 'quadro-ii' | 'quadro-ivb' | 'fracoes';
type CampoDaHipotese = 'diferente' | 'descoberta' | 'escopo';

/** O que a tela sabe das versões publicadas — a faixa de etapas. Lida pelo editor. */
export type SituacaoDoDocumentoNaTela =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; versao: SituacaoDoDocumentoNbr['versao']; empreendimento: SituacaoDoDocumentoNbr['empreendimento'] };

interface Props {
  model: BlueprintModel;
  hipoteses: HipotesesNbr12721;
  /** Grava as hipóteses do estudo; `null` = sem permissão de editar (o botão diz por quê). */
  onSalvarHipoteses: ((h: HipotesesNbr12721) => Promise<void>) | null;
  onRunBatch: (cs: Command[]) => void;
  /** A última recusa do kernel — a faixa do editor fica escondida enquanto a tela está aberta. */
  erro: string | null;
  /**
   * SÓ LEITURA (Fase 10, permissão `canEditAreaEngine`): o motivo. Com ele, tudo o
   * que grava fica desligado dizendo por quê; ler, buscar e baixar a prévia continuam.
   */
  somenteLeitura?: string | null;
  /** Nome do estudo — título e nome do arquivo da prévia. */
  nomeDoEstudo?: string;
  /** Desfaz o último comando do editor: o "Desfazer" do aviso depois de classificar. */
  onDesfazer?: () => void;
  /** Abre a tela Unidades da Planta (criar unidades, ligar ambientes). */
  onAbrirUnidades?: () => void;
  /** Abre o painel Versões do editor (publicar, aprovar, levar ao Empreendimento). */
  onAbrirVersoes?: () => void;
  /** Versões publicadas e Empreendimento — sem ela, a faixa de etapas não aparece. */
  situacaoDoDocumento?: SituacaoDoDocumentoNaTela;
  onRecarregarSituacao?: () => void;
}

export const ROTULO_DA_COBERTURA: Record<CoberturaNbr12721, string> = {
  PADRAO: 'Coberta de padrão',
  DIFERENTE: 'Coberta de padrão diferente',
  DESCOBERTA: 'Descoberta',
};

const m2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = (texto: string) => <span className="block text-right text-sm font-normal tabular-nums text-gray-700">{texto}</span>;
const somar = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
/** "1 ambiente" / "3 ambientes" — sem "(s)" (crítica 15/11/2026). */
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
/** "Hall, Circulação e Lavabo" / "Hall, Circulação, Lavabo e mais 9". */
function listaCurta(nomes: string[], max = 3): string {
  if (nomes.length <= max) return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`;
}

/** O que a linha mostra como classificação — a gravada, ou a sugestão marcada como tal. */
function resumoDaClassificacao(c: ClassificacaoNbr12721, privativo: boolean): string {
  const partes = [ROTULO_DA_COBERTURA[c.cobertura]];
  if (c.coeficiente != null) partes.push(`coef. ${c.coeficiente.toLocaleString('pt-BR')}`);
  if (privativo && c.natureza === 'ACESSORIA') partes.push('acessória');
  if (!privativo) partes.push(c.divisao === 'NAO_PROPORCIONAL' ? 'não proporcional' : c.divisao === 'PROPORCIONAL' ? 'proporcional' : 'sem divisão');
  if (!privativo && c.escopo) partes.push(c.escopo === 'BLOCO' ? 'por bloco' : 'global');
  return partes.join(' · ');
}

const ehPrivativo = (l: AmbienteParaClassificar) => !!(l.unidade || l.acessorioDe);
/** O comando que grava uma classificação nas linhas (etiquetas e declarados juntos). */
function comandoDeClassificar(alvos: AmbienteParaClassificar[], c: ClassificacaoNbr12721 | null): Command | null {
  const labelIds = alvos.filter((l) => l.tipo === 'ETIQUETA').map((l) => l.id);
  const declaradoIds = alvos.filter((l) => l.tipo === 'DECLARADO').map((l) => l.id);
  if (!labelIds.length && !declaradoIds.length) return null;
  return { type: 'SetNbr12721DoAmbiente', labelIds, declaradoIds, nbr12721: c } as Command;
}

// ── colunas ─────────────────────────────────────────────────────────────────
// Classificação: 962 px + 40 da caixa — cabe nos 1.122 px úteis a 1440 sem rolar (a crítica
// mediu 1.260 px, com "Classificar" fora da tela). A ação é a própria linha (§9.1).

const COLUNAS_CLASSIFICACAO: StandardTableColumn[] = [
  { key: 'nome', label: 'Ambiente', width: 180 },
  { key: 'pavimento', label: 'Pavimento', width: 130 },
  { key: 'dono', label: 'Unidade', width: 110 },
  { key: 'area', label: 'Área (m²)', width: 140, align: 'right' },
  { key: 'classificacao', label: 'Classificação', width: 226 },
  { key: 'origem', label: 'Origem', width: 100 },
  { key: 'copias', label: 'Cópias', width: 76, align: 'right' },
];

type FiltroDaClassificacao = '' | 'a-classificar' | 'classificados';
const OPCOES_DO_FILTRO: { value: FiltroDaClassificacao; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'a-classificar', label: 'A classificar' },
  { value: 'classificados', label: 'Classificados' },
];

/** Título e linha de apoio de cada aba (§19.1: o título acompanha a aba). */
const TITULO_DA_ABA: Record<Aba, { titulo: string; apoio: string }> = {
  classificacao: { titulo: 'Classificação dos ambientes', apoio: 'Cobertura, coeficiente de equivalência e divisão do comum de cada ambiente. Clique na linha para classificar.' },
  declarados: { titulo: 'Ambientes declarados', apoio: 'Área digitada, sem desenho — projeto que veio de fora ou pavimento não desenhado.' },
  acessorios: { titulo: 'Acessórios', apoio: 'Vaga, depósito ou área ligados a uma unidade: se entram na privativa e no coeficiente.' },
  hipoteses: { titulo: 'Hipóteses do estudo', apoio: 'O que vale para o estudo inteiro quando o ambiente não diz o seu.' },
  'quadro-i': { titulo: 'Quadro I — Áreas por pavimento', apoio: 'Colunas 2 a 18 da norma.' },
  'quadro-ii': { titulo: 'Quadro II — Áreas por unidade autônoma', apoio: 'Colunas 20 a 38 da norma.' },
  'quadro-ivb': { titulo: 'Quadro IV-B — Áreas das unidades autônomas', apoio: 'Para a especificação de condomínio, colunas (b) a (g).' },
  fracoes: { titulo: 'Frações ideais', apoio: 'Os milésimos fechados em 1000 (maior resto) são os que vão ao cartório.' },
};

// ── formulário de classificação (drawer) ────────────────────────────────────

const ROTULO = 'block text-xs font-semibold text-slate-500';
const CAMPO = 'w-full h-9 px-3 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
/** Valor de um campo que difere entre os ambientes do lote: aplicar MANTÉM o de cada um. */
const MISTO = '__misto';

interface FormDaClassificacao {
  cobertura: CoberturaNbr12721 | typeof MISTO;
  /** `MISTO` = mantém o de cada ambiente; '' = sem coeficiente próprio (usa o padrão). */
  coeficiente: string;
  natureza: '' | 'ACESSORIA' | typeof MISTO;
  divisao: '' | 'PROPORCIONAL' | 'NAO_PROPORCIONAL' | typeof MISTO;
  escopo: '' | 'GLOBAL' | 'BLOCO' | typeof MISTO;
}

/** O valor comum a todos, ou MISTO. */
function comum<V>(valores: V[], vazio: V): V | typeof MISTO {
  if (!valores.length) return vazio;
  return valores.every((v) => v === valores[0]) ? valores[0] : MISTO;
}

function DrawerDeClassificacao({
  linhas,
  aberto,
  onFechar,
  onAplicar,
  onVoltarASugestao,
  somenteLeitura,
}: {
  linhas: AmbienteParaClassificar[];
  aberto: boolean;
  onFechar: () => void;
  /** Uma classificação por grupo de ambientes — um lote só, um Ctrl+Z. */
  onAplicar: (grupos: { alvos: AmbienteParaClassificar[]; c: ClassificacaoNbr12721 }[]) => void;
  onVoltarASugestao: () => void;
  somenteLeitura?: string | null;
}) {
  const privativos = linhas.filter(ehPrivativo);
  const comuns = linhas.filter((l) => !ehPrivativo(l));
  const atual = (l: AmbienteParaClassificar) => l.classificacao ?? l.sugerida;
  const [form, setForm] = useState<FormDaClassificacao>({ cobertura: 'PADRAO', coeficiente: '', natureza: '', divisao: 'PROPORCIONAL', escopo: '' });
  useEffect(() => {
    if (!aberto) return;
    // Abre com o que os ambientes TÊM em comum; o que difere fica "valores diferentes" e
    // aplicar mantém o de cada um (antes: herdava a 1ª linha e atropelava as outras).
    setForm({
      cobertura: comum(linhas.map((l) => atual(l).cobertura), 'PADRAO' as CoberturaNbr12721),
      coeficiente: (() => {
        const v = comum(linhas.map((l) => (atual(l).coeficiente != null ? String(atual(l).coeficiente).replace('.', ',') : '')), '');
        return v;
      })(),
      natureza: comum(privativos.map((l) => (atual(l).natureza === 'ACESSORIA' ? 'ACESSORIA' : '') as '' | 'ACESSORIA'), ''),
      divisao: comum(comuns.map((l) => (atual(l).divisao ?? '') as FormDaClassificacao['divisao']), 'PROPORCIONAL'),
      escopo: comum(comuns.map((l) => (atual(l).escopo ?? '') as FormDaClassificacao['escopo']), ''),
    });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const coefMisto = form.coeficiente === MISTO;
  const coeficiente = coefMisto || !form.coeficiente.trim() ? null : Number(form.coeficiente.replace(',', '.'));
  const coeficienteInvalido = coeficiente !== null && !(Number.isFinite(coeficiente) && coeficiente > 0 && coeficiente <= 10);
  const motivo = somenteLeitura ? somenteLeitura : linhas.length === 0 ? 'Selecione ao menos um ambiente' : coeficienteInvalido ? 'O coeficiente tem de estar entre 0 e 10' : null;
  const algumGravado = linhas.some((l) => l.classificacao);

  const aplicar = () => {
    if (motivo) return;
    const porClassificacao = new Map<string, { alvos: AmbienteParaClassificar[]; c: ClassificacaoNbr12721 }>();
    for (const l of linhas) {
      const base = atual(l);
      const privativo = ehPrivativo(l);
      const c: ClassificacaoNbr12721 = { cobertura: form.cobertura === MISTO ? base.cobertura : form.cobertura };
      const coef = coefMisto ? (base.coeficiente ?? null) : coeficiente;
      if (coef !== null) c.coeficiente = coef;
      if (privativo) {
        const natureza = form.natureza === MISTO ? (base.natureza === 'ACESSORIA' ? 'ACESSORIA' : '') : form.natureza;
        if (natureza === 'ACESSORIA') c.natureza = 'ACESSORIA';
      } else {
        const divisao = form.divisao === MISTO ? (base.divisao ?? '') : form.divisao;
        const escopo = form.escopo === MISTO ? (base.escopo ?? '') : form.escopo;
        if (divisao) c.divisao = divisao;
        if (escopo && divisao === 'PROPORCIONAL') c.escopo = escopo;
      }
      const chave = JSON.stringify(c);
      const g = porClassificacao.get(chave);
      if (g) g.alvos.push(l);
      else porClassificacao.set(chave, { alvos: [l], c });
    }
    onAplicar([...porClassificacao.values()]);
  };

  const opcaoMista = (ativo: boolean) => (ativo ? <option value={MISTO}>— valores diferentes (mantém cada um)</option> : null);
  const um = linhas.length === 1 ? linhas[0] : null;

  return (
    <Sheet open={aberto} onClose={onFechar} size="md">
      <SheetHeader onClose={onFechar}>
        <SheetTitle>{um ? `Classificar ${um.nome}` : `Classificar ${plural(linhas.length, 'ambiente', 'ambientes')}`}</SheetTitle>
        <SheetDescription>
          {um
            ? `${um.pavimento} · ${um.unidade ? `unidade ${um.unidade}` : um.acessorioDe ? `acessório de ${um.acessorioDe}` : 'área comum'} · ${m2(um.areaMm2 / 1e6)} m²`
            : `${listaCurta(linhas.map((l) => l.nome))}. ${plural(privativos.length, 'privativo', 'privativos')} e ${plural(comuns.length, 'comum', 'comuns')}: a divisão e o rateio só valem para os comuns; a natureza acessória, só para os privativos.`}
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
              <select id="nbr-cobertura" className={CAMPO} value={form.cobertura} onChange={(e) => setForm({ ...form, cobertura: e.target.value as FormDaClassificacao['cobertura'] })}>
                {opcaoMista(form.cobertura === MISTO)}
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
                placeholder={coefMisto ? 'valores diferentes' : form.cobertura === 'PADRAO' ? '1 (padrão)' : 'vazio = o das hipóteses'}
                value={coefMisto ? '' : form.coeficiente}
                onChange={(e) => setForm({ ...form, coeficiente: e.target.value })}
                aria-describedby={coeficienteInvalido ? 'nbr-coeficiente-erro' : undefined}
              />
              {coeficienteInvalido && (
                <p id="nbr-coeficiente-erro" className="text-xs text-red-700">
                  Use um número entre 0 e 10, com vírgula (ex.: 0,75).
                </p>
              )}
            </div>
            {privativos.length > 0 && (
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="nbr-natureza">Natureza (privativos)</label>
                <select id="nbr-natureza" className={CAMPO} value={form.natureza} onChange={(e) => setForm({ ...form, natureza: e.target.value as FormDaClassificacao['natureza'] })}>
                  {opcaoMista(form.natureza === MISTO)}
                  <option value="">Principal</option>
                  <option value="ACESSORIA">Acessória (depósito, vaga dentro da unidade)</option>
                </select>
              </div>
            )}
          </div>
        </div>
        {comuns.length > 0 && (
          <div className="space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h3 className="text-sm font-semibold text-gray-900">Área comum</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="nbr-divisao">Divisão</label>
                <select id="nbr-divisao" className={CAMPO} value={form.divisao} onChange={(e) => setForm({ ...form, divisao: e.target.value as FormDaClassificacao['divisao'] })}>
                  {opcaoMista(form.divisao === MISTO)}
                  <option value="PROPORCIONAL">Proporcional</option>
                  <option value="NAO_PROPORCIONAL">Não proporcional</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={ROTULO} htmlFor="nbr-escopo">Rateio</label>
                <select
                  id="nbr-escopo"
                  className={`${CAMPO} disabled:cursor-not-allowed`}
                  value={form.escopo}
                  onChange={(e) => setForm({ ...form, escopo: e.target.value as FormDaClassificacao['escopo'] })}
                  disabled={form.divisao === 'NAO_PROPORCIONAL'}
                  title={form.divisao === 'NAO_PROPORCIONAL' ? 'O rateio só vale para a área comum proporcional' : undefined}
                >
                  {opcaoMista(form.escopo === MISTO)}
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
        <span className="mr-auto" title={somenteLeitura ?? (algumGravado ? undefined : 'Nenhum destes ambientes tem classificação gravada')}>
          <button
            type="button"
            onClick={onVoltarASugestao}
            disabled={!!somenteLeitura || !algumGravado}
            className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px] disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            Voltar à sugestão da Planta
          </button>
        </span>
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

function FormDeHipoteses({
  hipoteses,
  onSalvar,
  somenteLeitura,
  foco,
  onFocado,
  onSujo,
}: {
  hipoteses: HipotesesNbr12721;
  onSalvar: Props['onSalvarHipoteses'];
  somenteLeitura?: string | null;
  /** Campo a focar (vindo do "Resolver" de uma pendência). */
  foco: CampoDaHipotese | null;
  onFocado: () => void;
  /** Avisa a tela de que há o que salvar — o rótulo da aba diz "não salvas". */
  onSujo: (sujo: boolean) => void;
}) {
  const paraTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
  const [diferente, setDiferente] = useState(paraTexto(hipoteses.coeficientesPadrao.DIFERENTE));
  const [descoberta, setDescoberta] = useState(paraTexto(hipoteses.coeficientesPadrao.DESCOBERTA));
  const [escopo, setEscopo] = useState(hipoteses.escopoPadrao);
  const [vaga, setVaga] = useState(hipoteses.areaDaVagaMm2 == null ? '' : paraTexto(hipoteses.areaDaVagaMm2 / 1e6));
  const [regra, setRegra] = useState(hipoteses.numeracao.regra);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const refs = { diferente: useRef<HTMLInputElement>(null), descoberta: useRef<HTMLInputElement>(null), escopo: useRef<HTMLSelectElement>(null) };
  // As hipóteses chegam do banco (ao abrir) e voltam do salvar: os campos acompanham SEM remontar o
  // formulário — remontar apagava o "Hipóteses salvas." logo depois de salvar (achado na prova no app
  // real, 14/10/2026; o teste com o salvar simulado não devolvia hipóteses novas e não via).
  useEffect(() => {
    setDiferente(paraTexto(hipoteses.coeficientesPadrao.DIFERENTE));
    setDescoberta(paraTexto(hipoteses.coeficientesPadrao.DESCOBERTA));
    setEscopo(hipoteses.escopoPadrao);
    setVaga(hipoteses.areaDaVagaMm2 == null ? '' : paraTexto(hipoteses.areaDaVagaMm2 / 1e6));
    setRegra(hipoteses.numeracao.regra);
  }, [hipoteses]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!foco) return;
    refs[foco].current?.focus();
    onFocado();
  }, [foco]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (t: string) => (t.trim() ? Number(t.replace(',', '.')) : null);
  const proposta = hipotesesNbr12721DaColuna({
    ...hipoteses,
    coeficientesPadrao: { DIFERENTE: num(diferente), DESCOBERTA: num(descoberta) },
    escopoPadrao: escopo,
    areaDaVagaMm2: num(vaga) === null ? null : Math.round((num(vaga) as number) * 1e6),
    numeracao: { regra },
  });
  const sujo = JSON.stringify(proposta) !== JSON.stringify(hipoteses);
  useEffect(() => {
    onSujo(sujo);
  }, [sujo]); // eslint-disable-line react-hooks/exhaustive-deps
  const coefInvalido = (t: string) => !!t.trim() && !(Number(t.replace(',', '.')) > 0 && Number(t.replace(',', '.')) <= 10);
  const vagaInvalida = vaga.trim() !== '' && !(Number(vaga.replace(',', '.')) > 0);
  const invalido = coefInvalido(diferente) || coefInvalido(descoberta) || vagaInvalida;
  const motivo = somenteLeitura ? somenteLeitura : !onSalvar ? 'Sem permissão para editar as hipóteses deste estudo' : invalido ? 'Coeficiente entre 0 e 10; área da vaga positiva' : !sujo ? 'Nada mudou' : null;

  const salvar = async () => {
    if (motivo || !onSalvar) return;
    setSalvando(true);
    setMensagem(null);
    try {
      await onSalvar(proposta);
      setMensagem('Hipóteses salvas.');
    } catch (e) {
      setMensagem(`Não foi possível salvar as hipóteses. ${e instanceof Error ? e.message : String(e)} Os valores digitados continuam aqui; tente de novo.`);
    } finally {
      setSalvando(false);
    }
  };

  const erroDoCampo = (id: string, texto: string) => (
    <p id={id} className="text-xs text-red-700">
      {texto}
    </p>
  );

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
              <input ref={refs.diferente} id="hip-diferente" className={CAMPO} inputMode="decimal" placeholder="ex.: 0,75" value={diferente} onChange={(e) => setDiferente(e.target.value)} aria-describedby={coefInvalido(diferente) ? 'hip-diferente-erro' : undefined} />
              {coefInvalido(diferente) && erroDoCampo('hip-diferente-erro', 'Um número entre 0 e 10, com vírgula.')}
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-descoberta">Descoberta</label>
              <input ref={refs.descoberta} id="hip-descoberta" className={CAMPO} inputMode="decimal" placeholder="ex.: 0,50" value={descoberta} onChange={(e) => setDescoberta(e.target.value)} aria-describedby={coefInvalido(descoberta) ? 'hip-descoberta-erro' : undefined} />
              {coefInvalido(descoberta) && erroDoCampo('hip-descoberta-erro', 'Um número entre 0 e 10, com vírgula.')}
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
              <select ref={refs.escopo} id="hip-escopo" className={CAMPO} value={escopo} onChange={(e) => setEscopo(e.target.value as HipotesesNbr12721['escopoPadrao'])}>
                <option value="GLOBAL">O prédio todo</option>
                <option value="BLOCO">Só o bloco</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="hip-vaga">Área da vaga vinculada (m²)</label>
              <input id="hip-vaga" className={CAMPO} inputMode="decimal" placeholder="a desenhada" value={vaga} onChange={(e) => setVaga(e.target.value)} aria-describedby="hip-vaga-ajuda" />
              <p id="hip-vaga-ajuda" className={`text-xs ${vagaInvalida ? 'text-red-700' : 'text-gray-500'}`}>
                {vagaInvalida ? 'Uma área positiva, em m².' : 'Vazio = a área desenhada de cada vaga.'}
              </p>
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
        {mensagem && (
          <span className={`text-xs ${mensagem.startsWith('Não foi') ? 'text-red-700' : 'text-gray-600'}`} role="status">
            {mensagem}
          </span>
        )}
        {!mensagem && sujo && !somenteLeitura && <span className="text-xs text-amber-800">Alterações não salvas</span>}
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

// ── acessórios ──────────────────────────────────────────────────────────────

const COLUNAS_ACESSORIOS: StandardTableColumn[] = [
  { key: 'nome', label: 'Item', width: 220 },
  { key: 'tipo', label: 'Tipo', width: 120 },
  { key: 'pavimento', label: 'Pavimento', width: 160 },
  { key: 'area', label: 'Área (m²)', width: 110, align: 'right' },
  { key: 'dona', label: 'Unidade dona', width: 200 },
  { key: 'privativa', label: 'Na privativa', width: 130, align: 'center' },
  { key: 'coeficiente', label: 'No coeficiente', width: 140, align: 'center' },
];
const ROTULO_DO_TIPO_DE_ACESSORIO: Record<AcessorioParaVincular['tipo'], string> = { VAGA: 'Vaga', AMBIENTE: 'Ambiente', DECLARADO: 'Declarado' };
/** §7.1: campo editável na célula com a MESMA tipografia do texto da célula. Vazio em gray-500
 *  (não 400: 2,6:1 — crítica 15/11/2026), com a borda tracejada dizendo "vazio". */
const SELECT_NA_CELULA = 'w-full text-sm font-normal px-2 py-1 rounded border appearance-none cursor-pointer';
const SELECT_VAZIO = 'text-gray-500 bg-white border-dashed border-gray-300';
const SELECT_CHEIO = 'text-gray-900 bg-gray-50 border-gray-100';

function AbaAcessorios({ model, hipoteses, onRunBatch, somenteLeitura, onAbrirUnidades }: { model: BlueprintModel; hipoteses: HipotesesNbr12721; onRunBatch: (cs: Command[]) => void; somenteLeitura?: string | null; onAbrirUnidades?: () => void }) {
  const { linhas, unidades } = useMemo(() => acessoriosParaVincular(model, hipoteses), [model, hipoteses]);
  const mudar = (l: AcessorioParaVincular, donaChave: string | null, flags = { afetaPrivativa: l.afetaPrivativa, afetaCoeficiente: l.afetaCoeficiente }) => {
    const cs = comandosDoAcessorio(model, l.uid, donaChave, flags);
    if (cs.length) onRunBatch(cs);
  };
  const semUnidades = unidades.length === 0;
  return (
    <StandardTable<AcessorioParaVincular>
      columns={COLUNAS_ACESSORIOS}
      storageKey="blueprint:nbr12721:acessorios"
      rows={linhas}
      rowKey={(l) => l.uid}
      searchText={(l) => `${l.nome} ${l.pavimento} ${l.donaNumero ?? ''}`}
      searchPlaceholder="Buscar vaga, ambiente ou unidade…"
      colunaFixa
      sortValue={(key, l) =>
        key === 'area' ? l.areaMm2 : key === 'dona' ? (l.donaNumero ?? '') : key === 'privativa' ? l.afetaPrivativa : key === 'coeficiente' ? l.afetaCoeficiente : key === 'tipo' ? l.tipo : key === 'pavimento' ? l.pavimento : l.nome
      }
      toolbarTop={
        semUnidades ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-amber-800" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />O estudo não tem unidades: não há dona para escolher.
            {onAbrirUnidades && (
              <button type="button" onClick={onAbrirUnidades} className="font-medium text-blue-700 hover:underline">
                Criar unidades
              </button>
            )}
          </p>
        ) : undefined
      }
      renderCell={(key, l) => {
        switch (key) {
          case 'nome':
            return <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome || '—'}</span>;
          case 'tipo':
            return <span className="text-sm font-normal text-gray-600">{ROTULO_DO_TIPO_DE_ACESSORIO[l.tipo]}</span>;
          case 'pavimento':
            return <span className="block truncate text-sm font-normal text-gray-600" title={l.pavimento}>{l.pavimento}</span>;
          case 'area':
            return numero(m2(l.areaMm2 / 1e6));
          case 'dona':
            return (
              <select
                aria-label={`Unidade dona de ${l.nome}`}
                value={l.donaChave ?? ''}
                onChange={(e) => mudar(l, e.target.value || null)}
                disabled={!!somenteLeitura || semUnidades}
                title={somenteLeitura ?? (semUnidades ? 'Crie as unidades primeiro (tela Unidades)' : undefined)}
                className={`${SELECT_NA_CELULA} disabled:cursor-not-allowed ${l.donaChave ? SELECT_CHEIO : SELECT_VAZIO}`}
              >
                <option value="">Sem dona</option>
                {unidades.map((u) => (
                  <option key={u.chave} value={u.chave}>
                    {u.numero}
                  </option>
                ))}
              </select>
            );
          case 'privativa':
          case 'coeficiente': {
            const campo = key === 'privativa' ? 'afetaPrivativa' : 'afetaCoeficiente';
            return (
              <input
                type="checkbox"
                aria-label={`${l.nome}: ${key === 'privativa' ? 'entra na privativa' : 'entra no coeficiente'}`}
                // Sem dona, nada a marcar: caixa marcada e desligada sugeriria um vínculo que não existe.
                checked={l.donaChave ? l[campo] : false}
                disabled={!!somenteLeitura || !l.donaChave}
                title={somenteLeitura ?? (l.donaChave ? undefined : 'Escolha a unidade dona primeiro')}
                onChange={(e) => mudar(l, l.donaChave, { afetaPrivativa: l.afetaPrivativa, afetaCoeficiente: l.afetaCoeficiente, [campo]: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 disabled:opacity-40"
              />
            );
          }
          default:
            return null;
        }
      }}
      empty={{ icon: <Car className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhuma vaga ou área disponível', subtitle: 'Desenhe vagas, ou declare depósitos, para ligá-los a uma unidade.' }}
    />
  );
}

// ── ambientes declarados ────────────────────────────────────────────────────

const COLUNAS_DECLARADOS: StandardTableColumn[] = [
  { key: 'nome', label: 'Ambiente', width: 260 },
  { key: 'pavimento', label: 'Pavimento', width: 190 },
  { key: 'area', label: 'Área (m²)', width: 130, align: 'right' },
  { key: 'unidade', label: 'Unidade', width: 170 },
  { key: 'classificacao', label: 'Classificação', width: 330 },
];
const CAMPO_NA_CELULA = 'w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-normal text-gray-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white';
/** "1.234,5" e "12.5" → número (ponto de milhar só some quando há vírgula). */
const lerM2 = (t: string) => Number((t.includes(',') ? t.replace(/\./g, '') : t).replace(',', '.'));
const CAMPO_DA_BARRA = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-500 disabled:cursor-not-allowed disabled:bg-slate-50';

function AbaDeclarados({ model, onRunBatch, somenteLeitura, onClassificar }: { model: BlueprintModel; onRunBatch: (cs: Command[]) => void; somenteLeitura?: string | null; onClassificar: (declaradoId: string) => void }) {
  const ro = somenteLeitura ?? null;
  const confirmar = useConfirm();
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('');
  const [nivel, setNivel] = useState(model.levels[0]?.id ?? '');
  const [aviso, setAviso] = useState<string | null>(null);
  const declarados = model.ambientesDeclarados ?? [];
  const nomeDoNivel = (id: string) => model.levels.find((l) => l.id === id)?.name ?? '?';
  const numeroDe = (uid: string | null | undefined) => (uid ? ((model.unidades ?? []).find((u) => u.uid === uid)?.numero ?? '?') : null);
  const areaNum = lerM2(area);
  const motivo = ro ? ro : !nome.trim() ? 'Dê um nome ao ambiente' : !(areaNum > 0) ? 'Informe a área em m²' : !nivel ? 'O estudo não tem pavimento' : null;

  const criar = () => {
    if (motivo) return;
    onRunBatch([{ type: 'AddAmbienteDeclarado', levelId: nivel, nome, areaMm2: Math.round(areaNum * 1e6) }]);
    setAviso(`"${nome.trim()}" declarado. Classifique-o na aba Classificação.`);
    setNome('');
    setArea('');
  };
  const importar = async (arquivo: File) => {
    setAviso(null);
    try {
      const XLSX = await import('xlsx');
      const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(livro.Sheets[livro.SheetNames[0]], { defval: '' });
      const { comandos, erros } = comandosDaPlanilhaDeDeclarados(model, linhas);
      if (comandos.length) onRunBatch(comandos);
      setAviso(`${plural(comandos.length, 'ambiente importado', 'ambientes importados')}${erros.length ? `; ${plural(erros.length, 'linha recusada', 'linhas recusadas')}: ${erros.slice(0, 5).join(' ')}${erros.length > 5 ? '…' : ''}` : '.'}`);
    } catch (e) {
      setAviso(`Não foi possível ler a planilha (${e instanceof Error ? e.message : String(e)}). Confira se é .xlsx, .xls ou .csv com as colunas da planilha-modelo.`);
    }
  };
  const baixarModelo = async () => {
    const XLSX = await import('xlsx');
    const folha = XLSX.utils.aoa_to_sheet([[...COLUNAS_DA_PLANILHA_DE_DECLARADOS], [model.levels[0]?.name ?? 'Térreo', 'Hall', '24,5', '', 'padrão', '', 'proporcional']]);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, folha, 'Ambientes');
    XLSX.writeFile(livro, 'ambientes-declarados.xlsx');
  };
  const excluir = async (a: AmbienteDeclarado) => {
    const ok = await confirmar({ title: `Excluir "${a.nome}"?`, message: 'O ambiente sai dos quadros. Ctrl+Z no editor desfaz.', variant: 'danger', confirmLabel: 'Excluir' });
    if (ok) onRunBatch([{ type: 'DeleteAmbienteDeclarado', declaradoId: a.id }]);
  };

  return (
    <StandardTable<AmbienteDeclarado>
      columns={COLUNAS_DECLARADOS}
      storageKey="blueprint:nbr12721:declarados"
      rows={declarados}
      rowKey={(a) => a.id}
      searchText={(a) => `${a.nome} ${nomeDoNivel(a.levelId)} ${numeroDe(a.unidadeUid) ?? ''}`}
      searchPlaceholder="Buscar ambiente, pavimento ou unidade…"
      colunaFixa
      sortValue={(key, a) =>
        key === 'area' ? a.areaMm2 : key === 'pavimento' ? nomeDoNivel(a.levelId) : key === 'unidade' ? (numeroDe(a.unidadeUid) ?? '') : key === 'classificacao' ? (a.nbr12721 ? resumoDaClassificacao(a.nbr12721, !!a.unidadeUid) : '') : a.nome
      }
      // A criação mora numa linha própria acima da busca (crítica 15/11/2026: na mesma linha,
      // espremia a busca até cortar o texto de exemplo).
      toolbarTop={
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Declarar um ambiente">
          <span className="px-1 text-sm font-medium text-gray-700">Novo ambiente:</span>
          <select aria-label="Pavimento do novo ambiente" value={nivel} onChange={(e) => setNivel(e.target.value)} disabled={!!ro} title={ro ?? undefined} className={`${CAMPO_DA_BARRA} w-40`}>
            {model.levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} placeholder="Nome (ex.: Hall)" aria-label="Nome do novo ambiente" disabled={!!ro} title={ro ?? undefined} className={`${CAMPO_DA_BARRA} w-48`} />
          <input value={area} onChange={(e) => setArea(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} placeholder="Área (m²)" inputMode="decimal" aria-label="Área do novo ambiente (m²)" disabled={!!ro} title={ro ?? undefined} className={`${CAMPO_DA_BARRA} w-28`} />
          <span title={motivo ?? undefined}>
            <button type="button" onClick={criar} disabled={motivo !== null} className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white disabled:bg-slate-300">
              <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
            </button>
          </span>
          <span className="hidden md:block w-px h-6 bg-gray-200" aria-hidden="true" />
          <label
            title={ro ?? 'Lê .xlsx, .xls ou .csv com as colunas da planilha-modelo'}
            className={`inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 ${ro ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Importar planilha
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!!ro}
              className="hidden"
              aria-label="Importar planilha de ambientes"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importar(f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" onClick={() => void baixarModelo()} title="Baixa a planilha com as colunas que a importação lê" className="inline-flex h-9 items-center gap-1.5 rounded-[6px] px-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
            <Download className="h-4 w-4" aria-hidden="true" /> Baixar planilha-modelo
          </button>
        </div>
      }
      renderCell={(key, a) => {
        switch (key) {
          case 'nome':
            return (
              <input
                key={`${a.id}-${a.nome}`}
                defaultValue={a.nome}
                aria-label={`Nome do ambiente declarado ${a.nome}`}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== a.nome && onRunBatch([{ type: 'SetAmbienteDeclaradoProps', declaradoId: a.id, nome: e.target.value }])}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                disabled={!!ro}
                title={ro ?? undefined}
                className={CAMPO_NA_CELULA}
              />
            );
          case 'pavimento':
            return (
              <select aria-label={`Pavimento de ${a.nome}`} value={a.levelId} onChange={(e) => onRunBatch([{ type: 'SetAmbienteDeclaradoProps', declaradoId: a.id, levelId: e.target.value }])} disabled={!!ro} title={ro ?? undefined} className={`${SELECT_NA_CELULA} ${SELECT_CHEIO} disabled:cursor-not-allowed`}>
                {model.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            );
          case 'area':
            return (
              <input
                key={`${a.id}-${a.areaMm2}`}
                defaultValue={(a.areaMm2 / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                inputMode="decimal"
                aria-label={`Área (m²) de ${a.nome}`}
                onBlur={(e) => {
                  const v = lerM2(e.target.value);
                  if (v > 0 && Math.round(v * 1e6) !== a.areaMm2) onRunBatch([{ type: 'SetAmbienteDeclaradoProps', declaradoId: a.id, areaMm2: Math.round(v * 1e6) }]);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                disabled={!!ro}
                title={ro ?? undefined}
                className={`${CAMPO_NA_CELULA} text-right tabular-nums`}
              />
            );
          case 'unidade':
            return (
              <select
                aria-label={`Unidade de ${a.nome}`}
                value={(model.unidades ?? []).find((u) => u.uid === a.unidadeUid)?.id ?? ''}
                onChange={(e) => onRunBatch([{ type: 'SetAmbienteDeclaradoProps', declaradoId: a.id, unidadeId: e.target.value || null }])}
                disabled={!!ro}
                title={ro ?? undefined}
                className={`${SELECT_NA_CELULA} disabled:cursor-not-allowed ${a.unidadeUid ? SELECT_CHEIO : SELECT_VAZIO}`}
              >
                <option value="">Comum</option>
                {(model.unidades ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.numero}
                  </option>
                ))}
              </select>
            );
          case 'classificacao':
            return a.nbr12721 ? (
              <span className="block truncate text-sm font-normal text-gray-700" title={resumoDaClassificacao(a.nbr12721, !!a.unidadeUid)}>
                {resumoDaClassificacao(a.nbr12721, !!a.unidadeUid)}
              </span>
            ) : (
              <button type="button" onClick={() => onClassificar(a.id)} disabled={!!ro} title={ro ?? 'Abre a classificação deste ambiente'} className="text-sm font-normal text-amber-800 hover:underline disabled:no-underline disabled:cursor-not-allowed">
                A classificar — classificar agora
              </button>
            );
          default:
            return null;
        }
      }}
      actions={{
        width: 80,
        // O botão desligado não recebe hover (pointer-events-none): o motivo fica no invólucro.
        render: (a) => (
          <span title={ro ?? undefined}>
            <ActionIconButton kind="delete" title={ro ?? `Excluir ${a.nome}`} disabled={!!ro} onClick={() => void excluir(a)} />
          </span>
        ),
      }}
      empty={{ icon: <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum ambiente declarado', subtitle: 'Para projeto que veio de fora (DWG/PDF) ou pavimento não desenhado: digite a área acima ou importe a planilha.' }}
      footer={aviso ? <div className="px-5 py-2 text-xs text-slate-600" role="status">{aviso}</div> : undefined}
    />
  );
}

// ── os quadros (as colunas do documento) ────────────────────────────────────

/** Uma linha do documento + o índice (chave estável da tabela). */
interface LinhaDoQuadro {
  i: number;
  celulas: (string | number)[];
}

function TabelaDoQuadro({ tabela, storageKey, buscarPor, bloqueado, onVerPendencias }: { tabela: TabelaDoDocumento; storageKey: string; buscarPor?: string; bloqueado: boolean; onVerPendencias: () => void }) {
  const colunas: StandardTableColumn[] = useMemo(
    () =>
      tabela.colunas.map((c, i) => {
        const rotulo = c.curto ?? c.titulo;
        // A 1ª é o nome (pavimento/unidade); as de número cabem o rótulo da norma, que quebra em 2 linhas.
        return { key: `c${i}`, label: rotulo, width: i === 0 ? 170 : Math.min(200, Math.max(130, Math.ceil(rotulo.length * 5.4) + 64)), align: c.formato === 'texto' ? undefined : ('right' as const) };
      }),
    [tabela],
  );
  const grupos = useMemo(() => {
    if (!tabela.grupos) return undefined;
    let k = 1;
    return tabela.grupos.map((g) => {
      const cols = Array.from({ length: g.colunas }, (_, j) => `c${k + j}`);
      k += g.colunas;
      return { rotulo: g.titulo, colunas: cols };
    });
  }, [tabela]);
  const linhas: LinhaDoQuadro[] = useMemo(() => tabela.linhas.map((celulas, i) => ({ i, celulas })), [tabela]);
  const idx = (key: string) => Number(key.slice(1));
  return (
    <StandardTable<LinhaDoQuadro>
      columns={colunas}
      storageKey={storageKey}
      rows={linhas}
      rowKey={(l) => String(l.i)}
      {...(buscarPor ? { searchText: (l: LinhaDoQuadro) => String(l.celulas[0]), searchPlaceholder: buscarPor } : {})}
      gruposDeColunas={grupos}
      colunaFixa
      sortValue={(key, l) => l.celulas[idx(key)]}
      renderCell={(key, l) => {
        const i = idx(key);
        const v = l.celulas[i];
        if (i === 0) return <span className="block truncate text-sm font-normal text-gray-700" title={String(v)}>{String(v)}</span>;
        return <span className="block text-right text-sm font-normal tabular-nums text-gray-700" title={tabela.colunas[i].titulo}>{celulaFormatada(v, tabela.colunas[i].formato)}</span>;
      }}
      totaisPorColuna={
        tabela.total
          ? (key, ls) => {
              const i = idx(key);
              if (i === 0) return <span className="text-xs font-semibold text-gray-500">Total</span>;
              const c = tabela.colunas[i];
              if (c.formato === 'texto') return null;
              const soma = ls.reduce((s, l) => s + (typeof l.celulas[i] === 'number' ? (l.celulas[i] as number) : 0), 0);
              return <span className="block text-right text-sm font-medium tabular-nums text-gray-800">{celulaFormatada(soma, c.formato)}</span>;
            }
          : undefined
      }
      empty={
        bloqueado
          ? { title: 'Cálculo bloqueado', subtitle: 'Os quadros saem quando as pendências que bloqueiam forem resolvidas.', acao: { rotulo: 'Ver o que bloqueia', onClick: onVerPendencias } }
          : { title: 'Nada a mostrar', subtitle: tabela.aba === 'Quadro I' ? 'O estudo não tem pavimento com ambientes.' : 'Nenhuma unidade autônoma — crie as unidades na tela Unidades.' }
      }
    />
  );
}

// ── faixa de etapas ─────────────────────────────────────────────────────────

function FaixaDeEtapas({
  situacao,
  bloqueado,
  hashDoRascunho,
  onAbrirVersoes,
  onVerPendencias,
  onRecarregar,
  previa,
}: {
  situacao: SituacaoDoDocumentoNaTela | undefined;
  bloqueado: boolean;
  hashDoRascunho: string | null;
  onAbrirVersoes?: () => void;
  onVerPendencias: () => void;
  onRecarregar?: () => void;
  previa: React.ReactNode;
}) {
  // Fileira de etapas na linha TODA; embaixo, o próximo passo e a prévia lado a lado
  // (dividindo a linha com a prévia, a fileira quebrava em duas a 1440).
  let fileira: React.ReactNode = null;
  let corpo: React.ReactNode;
  if (!situacao) corpo = null;
  else if (situacao.estado === 'carregando') corpo = <p className="text-sm text-gray-500" aria-busy="true">Lendo as versões publicadas…</p>;
  else if (situacao.estado === 'erro')
    corpo = (
      <p className="text-sm text-gray-700" role="status">
        Não foi possível ler as versões publicadas.{' '}
        {onRecarregar && (
          <button type="button" onClick={onRecarregar} className="font-medium text-blue-700 hover:underline">
            Tentar de novo
          </button>
        )}
      </p>
    );
  else {
    const { etapas, proximo } = etapasDoDocumentoNbr12721({ bloqueado, versao: situacao.versao, hashDoRascunho, empreendimento: situacao.empreendimento });
    const acao = proximo.acao === 'pendencias' ? onVerPendencias : proximo.acao === 'versoes' ? onAbrirVersoes : undefined;
    fileira = (
        <ol aria-label="Etapas do documento da incorporação" className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {etapas.map((e, i) => (
            <li key={e.id} aria-current={e.estado === 'atual' ? 'step' : undefined} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
              {e.estado === 'feita' ? (
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <Circle className={`h-3 w-3 ${e.estado === 'atual' ? 'fill-blue-600 text-blue-600' : 'text-gray-400'}`} aria-hidden="true" />
              )}
              <span className={`text-sm ${e.estado === 'atual' ? 'font-medium text-gray-900' : e.estado === 'feita' ? 'text-gray-700' : 'text-gray-500'}`}>{e.rotulo}</span>
              <span className="sr-only">{e.estado === 'feita' ? '(feita)' : e.estado === 'atual' ? '(etapa atual)' : '(a fazer)'}</span>
            </li>
          ))}
        </ol>
    );
    corpo = (
        <p className="min-w-0 text-sm text-gray-600">
          {proximo.texto}{' '}
          {acao && proximo.rotuloDaAcao && (
            <button type="button" onClick={acao} className="inline-flex items-center gap-0.5 font-medium text-blue-700 hover:underline">
              {proximo.rotuloDaAcao}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </p>
    );
  }
  return (
    <section aria-label="Situação do documento" className="space-y-2 bg-white px-4 py-3 rounded-[10px] border border-gray-100 shadow-sm">
      {fileira}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {corpo ?? <p className="text-sm text-gray-600">Calculado ao vivo a partir do desenho: a prévia leva o que está na tela agora.</p>}
        <div className="flex shrink-0 items-center gap-2">{previa}</div>
      </div>
    </section>
  );
}

// ── faixa de pendências ─────────────────────────────────────────────────────

const ROTULO_DO_TOM: Record<PendenciaLegivel['tom'], { texto: string; cor: string; Icone: React.ElementType }> = {
  bloqueia: { texto: 'Bloqueia', cor: 'text-red-700', Icone: AlertTriangle },
  classificar: { texto: 'A confirmar', cor: 'text-amber-800', Icone: Sparkles },
  aviso: { texto: 'Aviso', cor: 'text-gray-700', Icone: Info },
};

const FaixaDePendencias = React.forwardRef<HTMLElement, { pendencias: PendenciaLegivel[]; bloqueado: boolean; onResolver: (a: AlvoDaPendencia) => void; motivoDesligado: (a: AlvoDaPendencia) => string | null }>(function FaixaDePendencias(
  { pendencias, bloqueado, onResolver, motivoDesligado },
  ref,
) {
  // Com algo bloqueando, só o que bloqueia fica aberto (é a única coisa que impede o quadro de
  // sair); "a confirmar" e avisos ficam a um clique. Sem bloqueio, tudo aparece.
  const bloqueiam = pendencias.filter((p) => p.tom === 'bloqueia');
  const resto = pendencias.filter((p) => p.tom !== 'bloqueia');
  const [verResto, setVerResto] = useState(false);
  const recolhe = bloqueiam.length > 0 && resto.length > 0;
  if (!pendencias.length) return null;
  const nConfirmar = resto.filter((p) => p.tom === 'classificar').length;
  const nAvisos = resto.length - nConfirmar;
  const titulo = bloqueado
    ? `O cálculo está bloqueado: ${plural(bloqueiam.length, 'pendência impede', 'pendências impedem')} os quadros de sair`
    : nConfirmar
      ? 'Os quadros já saem — falta confirmar'
      : 'Os quadros já saem — avisos do cálculo';
  const resumoDoResto = [nConfirmar ? plural(nConfirmar, 'item a confirmar', 'itens a confirmar') : null, nAvisos ? plural(nAvisos, 'aviso', 'avisos') : null].filter(Boolean).join(' e ');
  const visiveis = recolhe && !verResto ? bloqueiam : [...bloqueiam, ...resto];
  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="nbr-pendencias-titulo" className="bg-white rounded-[10px] border border-gray-100 shadow-sm mb-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
        <h2 id="nbr-pendencias-titulo" className={`flex items-center gap-2 text-sm font-semibold ${bloqueado ? 'text-red-700' : 'text-gray-900'}`}>
          {bloqueado ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
          {titulo}
        </h2>
        {recolhe && (
          <button type="button" aria-expanded={verResto} onClick={() => setVerResto((v) => !v)} className="text-sm font-medium text-blue-700 hover:underline">
            {verResto ? `Esconder ${resumoDoResto}` : `Mostrar também ${resumoDoResto}`}
          </button>
        )}
      </div>
      <ul className="divide-y divide-gray-100">
        {visiveis.map((p) => {
          const tom = ROTULO_DO_TOM[p.tom];
          const nomes = p.itens.map(ondeEsta);
          return (
            <li key={p.chave} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm text-gray-900" title={`Código ${p.codigo}`}>
                  <span className={`mr-1.5 inline-flex items-center gap-1 text-xs font-semibold ${tom.cor}`}>
                    <tom.Icone className="h-3.5 w-3.5" aria-hidden="true" />
                    {tom.texto}:
                  </span>
                  <span className="font-medium">{p.titulo}</span>
                </p>
                {nomes.length > 0 && <p className="text-sm text-gray-700">{listaCurta(nomes, 4)}</p>}
                {p.conserto && <p className="text-sm text-gray-600">{p.conserto}</p>}
              </div>
              {p.acoes.length > 0 && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {p.acoes.map((a) => {
                    const motivo = motivoDesligado(a.alvo);
                    return (
                      <span key={a.rotulo} title={motivo ?? undefined}>
                        <button
                          type="button"
                          onClick={() => onResolver(a.alvo)}
                          disabled={motivo !== null}
                          className="h-8 rounded-[6px] border border-gray-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-white"
                        >
                          {a.rotulo}
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});

// ── a tela ──────────────────────────────────────────────────────────────────

export default function TelaAreasNbr12721({
  model,
  hipoteses,
  onSalvarHipoteses,
  onRunBatch,
  erro,
  somenteLeitura = null,
  nomeDoEstudo = 'Estudo',
  onDesfazer,
  onAbrirUnidades,
  onAbrirVersoes,
  situacaoDoDocumento,
  onRecarregarSituacao,
}: Props) {
  const confirmar = useConfirm();
  const [aba, setAba] = usePersistedState<Aba>('blueprint:nbr12721:aba', 'classificacao');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  /** O drawer abre para um conjunto: a linha clicada, ou a seleção em lote — sem trocar a seleção. */
  const [drawer, setDrawer] = useState<{ chaves: string[]; doLote: boolean } | null>(null);
  const [filtro, setFiltro] = usePersistedState<FiltroDaClassificacao>('blueprint:nbr12721:classificacao:filtro', '');
  const [focoHipotese, setFocoHipotese] = useState<CampoDaHipotese | null>(null);
  const [hipotesesSujas, setHipotesesSujas] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; desfazer: boolean; erro?: boolean } | null>(null);
  const [baixando, setBaixando] = useState<'pdf' | 'xlsx' | null>(null);
  const pendenciasRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 8000);
    return () => clearTimeout(t);
  }, [aviso]);

  const montado = useMemo(() => entradaDoEstudo(model, hipoteses), [model, hipoteses]);
  const saida = useMemo(() => calcularNbr12721(montado.entrada), [montado]);
  const linhas = useMemo(() => ambientesParaClassificar(model), [model]);
  const bloqueado = saida.status !== 'success';
  const abaValida: Aba = aba in TITULO_DA_ABA ? aba : 'classificacao';

  const pendencias = useMemo(() => pendenciasLegiveis({ pendencias: saida.pendencias, entrada: montado.entrada, avisos: montado.avisos, linhas }), [saida, montado, linhas]);
  /** O documento na tela é o MESMO desenho do documento publicado (colunas, grupos e números da norma). */
  const documento = useMemo(() => documentoDaPrevia(nomeDoEstudo, saida, VERSAO_DO_MOTOR_NBR12721), [nomeDoEstudo, saida]);
  const tabelas = useMemo(() => tabelasDoDocumentoNbr12721(documento), [documento]);
  const tabelaDe = (aba: string) => tabelas.find((t) => t.aba === aba)!;
  // O hash do rascunho é o que o congelamento gravaria — só vale quando há quadro a congelar.
  const hashDoRascunho = useMemo(() => {
    if (situacaoDoDocumento?.estado !== 'pronto' || !situacaoDoDocumento.versao) return null;
    if (!(model.unidades ?? []).length && !(model.ambientesDeclarados ?? []).length) return null;
    return sha256(stableStringify(saida));
  }, [situacaoDoDocumento, model.unidades, model.ambientesDeclarados, saida]);

  const totalReal = somar(saida.quadroI, (l) => l.qi_17_floor_real_total_raw);
  const totalEquiv = somar(saida.quadroI, (l) => l.qi_18_floor_equivalent_total_raw);
  const unidadesAutonomas = montado.entrada.unidades.filter((u) => u.ativa && u.autonoma).length;
  const naoClassificados = linhas.filter((l) => !l.classificacao);
  const linhasDaTabela = filtro === 'a-classificar' ? naoClassificados : filtro === 'classificados' ? linhas.filter((l) => l.classificacao) : linhas;
  const alvosDoDrawer = drawer ? linhas.filter((l) => drawer.chaves.includes(l.chave)) : [];

  const irParaPendencias = () => {
    pendenciasRef.current?.scrollIntoView({ block: 'nearest' });
    pendenciasRef.current?.focus();
  };
  const abrirDrawer = (chaves: string[], doLote = false) => {
    if (somenteLeitura || !chaves.length) return;
    setAba('classificacao');
    setDrawer({ chaves, doLote });
  };
  const resolver = (alvo: AlvoDaPendencia) => {
    if (alvo.tipo === 'classificar') abrirDrawer(alvo.chaves);
    else if (alvo.tipo === 'hipoteses') {
      setAba('hipoteses');
      setFocoHipotese(alvo.campo);
    } else if (alvo.tipo === 'aba') {
      setAba(alvo.aba);
      if (alvo.soAClassificar) setFiltro('a-classificar');
    } else onAbrirUnidades?.();
  };
  const motivoDesligado = (alvo: AlvoDaPendencia): string | null => {
    if (alvo.tipo === 'unidades') return onAbrirUnidades ? null : 'A tela Unidades abre pela Planta (Analisar › Unidades)';
    if (alvo.tipo === 'classificar' && somenteLeitura) return somenteLeitura;
    return null;
  };

  const avisar = (texto: string) => setAviso({ texto, desfazer: !!onDesfazer });
  const aplicarClassificacao = (grupos: { alvos: AmbienteParaClassificar[]; c: ClassificacaoNbr12721 | null }[], texto: string) => {
    const cmds = grupos.map((g) => comandoDeClassificar(g.alvos, g.c)).filter((c): c is Command => c !== null);
    if (!cmds.length) return;
    onRunBatch(cmds);
    avisar(texto);
  };

  const aplicarSugestoes = async () => {
    const alvos = naoClassificados;
    if (!alvos.length || somenteLeitura) return;
    const cmds = alvos.map((l) => comandoDeClassificar([l], l.sugerida)).filter((c): c is Command => c !== null);
    // O que muda: as classes e a área equivalente antes → depois (o mesmo motor, sobre o modelo com o lote).
    const porClasse = new Map<string, number>();
    for (const l of alvos) {
      const r = resumoDaClassificacao(l.sugerida, ehPrivativo(l));
      porClasse.set(r, (porClasse.get(r) ?? 0) + 1);
    }
    let depois = '—';
    try {
      const s = calcularNbr12721(entradaDoEstudo(applyBatch(model, cmds).model, hipoteses).entrada);
      depois = s.status === 'success' ? `${m2(somar(s.quadroI, (l) => l.qi_18_floor_equivalent_total_raw))} m²` : 'continua bloqueado';
    } catch {
      depois = 'não foi possível prever';
    }
    const antes = bloqueado ? 'bloqueado' : `${m2(totalEquiv)} m²`;
    const ok = await confirmar({
      title: `Gravar a sugestão da Planta em ${plural(alvos.length, 'ambiente', 'ambientes')}?`,
      message: (
        <div className="space-y-2 text-left text-sm text-gray-700">
          <ul className="list-disc space-y-0.5 pl-5">
            {[...porClasse].map(([classe, n]) => (
              <li key={classe}>
                {classe}: {plural(n, 'ambiente', 'ambientes')}
              </li>
            ))}
          </ul>
          <p>
            Área equivalente: {antes} → {depois}.
          </p>
          {unidadesAutonomas === 0 && (
            <p className="text-amber-800">
              O estudo não tem unidades: TODOS os ambientes vão como área comum. Se o prédio tem apartamentos ou salas, crie as unidades antes (tela Unidades).
            </p>
          )}
          <p className="text-gray-600">Confira depois na tabela. Desfazer no aviso, ou Ctrl+Z no editor.</p>
        </div>
      ),
      variant: 'warning',
      confirmLabel: unidadesAutonomas === 0 ? 'Gravar mesmo assim' : 'Gravar sugestões',
    });
    if (!ok) return;
    onRunBatch(cmds);
    avisar(`${plural(alvos.length, 'ambiente classificado', 'ambientes classificados')} pela sugestão da Planta.`);
  };

  const voltarASugestao = async () => {
    const alvos = alvosDoDrawer.filter((l) => l.classificacao);
    if (!alvos.length) return;
    const ok = await confirmar({
      title: `Voltar ${alvos.length === 1 ? `"${alvos[0].nome}"` : plural(alvos.length, 'ambiente', 'ambientes')} à sugestão da Planta?`,
      message: 'A classificação gravada sai e o ambiente volta a entrar no cálculo pela sugestão, marcado "a classificar". Desfazer no aviso, ou Ctrl+Z no editor.',
      variant: 'warning',
      confirmLabel: 'Voltar à sugestão',
    });
    if (!ok) return;
    aplicarClassificacao([{ alvos, c: null }], `${plural(alvos.length, 'ambiente voltou', 'ambientes voltaram')} à sugestão da Planta.`);
    if (drawer?.doLote) setSelecionados(new Set());
    setDrawer(null);
  };

  const baixarPrevia = async (formato: 'pdf' | 'xlsx') => {
    setBaixando(formato);
    try {
      const { nbr12721ExportService } = await import('../../services/nbr12721ExportService');
      if (formato === 'pdf') await nbr12721ExportService.exportarPdf(documento);
      else nbr12721ExportService.exportarXlsx(documento);
    } catch (e) {
      setAviso({ texto: `Não foi possível gerar a prévia (${e instanceof Error ? e.message : String(e)}). Tente de novo.`, desfazer: false, erro: true });
    } finally {
      setBaixando(null);
    }
  };

  const previa = (
    <>
      <span className="text-sm text-gray-600">Prévia do rascunho:</span>
      {(['pdf', 'xlsx'] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => void baixarPrevia(f)}
          disabled={baixando !== null}
          title={baixando ? 'Aguarde o arquivo em preparo' : `Baixa os quadros de agora em ${f.toUpperCase()}, marcados como prévia (sem versão, sem hash, sem aprovação)`}
          className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {baixando === f ? 'Gerando…' : f.toUpperCase()}
        </button>
      ))}
    </>
  );

  const quadro = (nomeDaAba: 'Quadro I' | 'Quadro II' | 'Quadro IV-B' | 'Frações', storageKey: string, buscarPor?: string) => (
    <TabelaDoQuadro tabela={tabelaDe(nomeDaAba)} storageKey={storageKey} buscarPor={buscarPor} bloqueado={bloqueado} onVerPendencias={irParaPendencias} />
  );

  return (
    <div className="space-y-6" data-testid="tela-areas-nbr12721">
      <FaixaDeEtapas
        situacao={situacaoDoDocumento}
        bloqueado={bloqueado}
        hashDoRascunho={hashDoRascunho}
        onAbrirVersoes={onAbrirVersoes}
        onVerPendencias={irParaPendencias}
        onRecarregar={onRecarregarSituacao}
        previa={previa}
      />

      <div>
        <TabsBar<Aba>
          tabs={[
            { id: 'classificacao', label: 'Classificação', grupo: 'Entrada', badge: naoClassificados.length || undefined, badgeTitulo: `${plural(naoClassificados.length, 'ambiente', 'ambientes')} a classificar` },
            // "Declarados" (o título da aba diz "Ambientes declarados"): com o nome inteiro, a 1280
            // a última aba caía sozinha numa 2ª linha.
            { id: 'declarados', label: 'Declarados', grupo: 'Entrada', badge: (model.ambientesDeclarados ?? []).length || undefined, badgeTitulo: 'Ambientes declarados' },
            { id: 'acessorios', label: 'Acessórios', grupo: 'Entrada' },
            { id: 'hipoteses', label: 'Hipóteses', grupo: 'Entrada', badge: hipotesesSujas ? 'não salvas' : undefined, badgeTom: 'alerta', badgeTitulo: 'Há alterações nas hipóteses que ainda não foram salvas' },
            { id: 'quadro-i', label: 'Quadro I', grupo: 'Quadros' },
            { id: 'quadro-ii', label: 'Quadro II', grupo: 'Quadros' },
            { id: 'quadro-ivb', label: 'Quadro IV-B', grupo: 'Quadros' },
            { id: 'fracoes', label: 'Frações', grupo: 'Quadros' },
          ]}
          value={abaValida}
          onChange={setAba}
        />

        {/* Três cartões: a situação do cálculo mora na faixa de pendências logo abaixo — um 4º
            cartão "Cálculo bloqueado" só repetia o título dela (distill, 15/11/2026). */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <KpiCard label="Área real" value={bloqueado ? '—' : `${m2(totalReal)} m²`} sub={bloqueado ? 'Sai quando o cálculo desbloquear' : 'Quadro I, todos os pavimentos'} icon={<Ruler />} color={bloqueado ? 'gray' : 'blue'} />
          <KpiCard label="Área equivalente" value={bloqueado ? '—' : `${m2(totalEquiv)} m²`} sub={bloqueado ? 'Sai quando o cálculo desbloquear' : 'Com os coeficientes de equivalência'} icon={<Calculator />} color={bloqueado ? 'gray' : 'indigo'} />
          <KpiCard
            label="Unidades"
            value={unidadesAutonomas}
            sub={unidadesAutonomas === 0 ? 'Tudo conta como área comum' : plural(montado.entrada.pavimentos.length, 'pavimento', 'pavimentos')}
            icon={<Layers />}
            color={unidadesAutonomas === 0 ? 'amber' : 'emerald'}
            onClick={onAbrirUnidades}
            title={onAbrirUnidades ? 'Abrir a tela Unidades' : undefined}
          />
        </div>

        <FaixaDePendencias ref={pendenciasRef} pendencias={pendencias} bloqueado={bloqueado} onResolver={resolver} motivoDesligado={motivoDesligado} />

        {erro && (
          <p className="mb-3 text-sm text-red-700" role="alert">
            {erro}
          </p>
        )}
        {somenteLeitura && (
          <p className="mb-3 flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status" data-testid="areas-somente-leitura">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            Só leitura: {somenteLeitura}
          </p>
        )}
      </div>

      <section aria-labelledby="nbr-aba-titulo" className="space-y-3">
        <div>
          <h2 id="nbr-aba-titulo" className="text-base font-semibold text-gray-900">
            {TITULO_DA_ABA[abaValida].titulo}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">{TITULO_DA_ABA[abaValida].apoio}</p>
        </div>

        {abaValida === 'classificacao' && (
          <>
            <StandardTable<AmbienteParaClassificar>
              columns={COLUNAS_CLASSIFICACAO}
              storageKey="blueprint:nbr12721:classificacao"
              rows={linhasDaTabela}
              rowKey={(l) => l.chave}
              searchText={(l) => `${l.nome} ${l.pavimento} ${l.unidade ?? ''}`}
              searchPlaceholder="Buscar ambiente, pavimento ou unidade…"
              colunaFixa
              selection={somenteLeitura ? undefined : { selected: selecionados, onChange: setSelecionados, label: (l) => `Selecionar ${l.nome} (${l.pavimento})` }}
              onRowClick={somenteLeitura ? undefined : (l) => abrirDrawer([l.chave])}
              rowLabel={(l) => `Classificar ${l.nome} — ${l.pavimento}`}
              sortValue={(key, l) =>
                key === 'area' ? l.areaMm2 : key === 'dono' ? (l.unidade ?? l.acessorioDe ?? '') : key === 'classificacao' ? resumoDaClassificacao(l.classificacao ?? l.sugerida, ehPrivativo(l)) : key === 'origem' ? l.tipo : key === 'copias' ? l.copias : key === 'pavimento' ? l.pavimento : l.nome
              }
              filters={<FilterPopover<FiltroDaClassificacao> label="Situação" value={filtro} onChange={setFiltro} options={OPCOES_DO_FILTRO} />}
              renderCell={(key, l) => {
                const privativo = ehPrivativo(l);
                switch (key) {
                  case 'nome':
                    return <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome}</span>;
                  case 'pavimento':
                    return <span className="block truncate text-sm font-normal text-gray-600" title={l.pavimento}>{l.pavimento}</span>;
                  case 'dono':
                    return <span className="block truncate text-sm font-normal text-gray-700">{l.unidade ?? (l.acessorioDe ? `acessório de ${l.acessorioDe}` : <span className="text-gray-600">comum</span>)}</span>;
                  case 'area':
                    return numero(m2(l.areaMm2 / 1e6));
                  case 'classificacao':
                    return l.classificacao ? (
                      <span className="block truncate text-sm font-normal text-gray-700" title={resumoDaClassificacao(l.classificacao, privativo)}>
                        {resumoDaClassificacao(l.classificacao, privativo)}
                      </span>
                    ) : (
                      <span className="block truncate text-sm font-normal text-amber-800" title={`Ainda não classificado. A sugestão da Planta é: ${resumoDaClassificacao(l.sugerida, privativo)}`}>
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
              toolbarRight={
                <span title={somenteLeitura ?? (naoClassificados.length === 0 ? 'Todos os ambientes já têm classificação' : undefined)}>
                  <button
                    type="button"
                    onClick={() => void aplicarSugestoes()}
                    disabled={!!somenteLeitura || naoClassificados.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" /> Aplicar sugestões ({naoClassificados.length})
                  </button>
                </span>
              }
              empty={
                filtro === 'a-classificar'
                  ? { icon: <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum ambiente a classificar', subtitle: 'Todos têm classificação gravada.' }
                  : { icon: <Tags className="w-12 h-12 text-gray-300 mx-auto mb-4" />, title: 'Nenhum ambiente ainda', subtitle: 'Desenhe e nomeie os ambientes, ou declare as áreas, para classificá-los.' }
              }
            />
            {selecionados.size > 0 && !drawer && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
                <span className="flex-1 text-sm font-bold whitespace-nowrap">{plural(selecionados.size, 'ambiente selecionado', 'ambientes selecionados')}</span>
                <button type="button" onClick={() => abrirDrawer([...selecionados], true)} className="h-9 px-3.5 rounded-[6px] bg-white text-blue-700 text-sm font-medium hover:bg-blue-50">
                  Classificar em lote
                </button>
                <button type="button" onClick={() => setSelecionados(new Set())} className="h-9 px-3 rounded-[6px] bg-blue-500 text-sm font-medium hover:bg-blue-400">
                  Desmarcar
                </button>
              </div>
            )}
          </>
        )}

        {abaValida === 'acessorios' && <AbaAcessorios model={model} hipoteses={hipoteses} onRunBatch={onRunBatch} somenteLeitura={somenteLeitura} onAbrirUnidades={onAbrirUnidades} />}
        {abaValida === 'declarados' && (
          <AbaDeclarados
            model={model}
            onRunBatch={onRunBatch}
            somenteLeitura={somenteLeitura}
            onClassificar={(id) => abrirDrawer(linhas.filter((l) => l.tipo === 'DECLARADO' && l.id === id).map((l) => l.chave))}
          />
        )}

        {/* Hipóteses fica MONTADA (escondida) ao trocar de aba: o que foi digitado e não salvo não some. */}
        <div hidden={abaValida !== 'hipoteses'}>
          <FormDeHipoteses hipoteses={hipoteses} onSalvar={onSalvarHipoteses} somenteLeitura={somenteLeitura} foco={focoHipotese} onFocado={() => setFocoHipotese(null)} onSujo={setHipotesesSujas} />
        </div>

        {/* Quadro I sem busca: uma linha por pavimento, poucas, todas lidas juntas. */}
        {abaValida === 'quadro-i' && quadro('Quadro I', 'blueprint:nbr12721:quadroI:norma')}
        {abaValida === 'quadro-ii' && quadro('Quadro II', 'blueprint:nbr12721:quadroII:norma', 'Buscar unidade…')}
        {abaValida === 'quadro-ivb' && quadro('Quadro IV-B', 'blueprint:nbr12721:quadroIVB:norma', 'Buscar unidade…')}
        {abaValida === 'fracoes' && quadro('Frações', 'blueprint:nbr12721:fracoes:norma', 'Buscar unidade…')}
      </section>

      <DrawerDeClassificacao
        linhas={alvosDoDrawer}
        aberto={!!drawer}
        somenteLeitura={somenteLeitura}
        onFechar={() => setDrawer(null)}
        onVoltarASugestao={() => void voltarASugestao()}
        onAplicar={(grupos) => {
          const n = grupos.reduce((s, g) => s + g.alvos.length, 0);
          aplicarClassificacao(grupos, `${plural(n, 'ambiente classificado', 'ambientes classificados')}.`);
          // A seleção em lote sai depois de aplicar a ELA; a classificação de uma linha não mexe na seleção.
          if (drawer?.doLote) setSelecionados(new Set());
          setDrawer(null);
        }}
      />

      {aviso && (
        <div role={aviso.erro ? 'alert' : 'status'} className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-medium text-white shadow-xl animate-in slide-in-from-bottom-4 duration-300 ${aviso.erro ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {aviso.erro ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{aviso.texto}</span>
          {aviso.desfazer && onDesfazer && (
            <button
              type="button"
              onClick={() => {
                onDesfazer();
                setAviso(null);
              }}
              className="rounded-[6px] px-2 py-1 font-semibold underline underline-offset-2 hover:bg-emerald-700"
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
