/**
 * TELA "Casa automática" (F10 da casa automática, 15/10/2026): o programa curto e as hipóteses do estudo, o botão
 * que gera a PRÉVIA da casa inteira num Web Worker (a etapa em curso aparece), o resumo (área, índices da lei,
 * custo pelo CUB), as etapas com a situação de cada uma, o relatório de pendências por grupo, a lista dos furos previstos
 * para o calculista (F14c) e as duas saídas:
 * "Lançar no pavimento" (um lote, um Ctrl+Z — com a trava `conferirPlanoDaCasa` antes) e "Criar alternativa" (um
 * ramo novo com a casa, o desenho atual intacto). Molde: `TelaGerador` (tela in-flow do editor) e
 * `PainelGeradorPpci` (etapas e relatório).
 *
 * 22/10/2026: em abas — Programa · Hipóteses · Resultado · Relatório · Furos · Terraplenagem — com Gerar, Criar
 * alternativa e Lançar na barra das abas (`docs/planos/2026-10-22-casa-automatica-abas.md`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Building2, Check, CircleDot, ClipboardList, Droplets, HelpCircle, Home, Info, Layers, ListChecks, Mountain, Play, Ruler, Square, Wand2 } from 'lucide-react';

import Button from '../ui/Button';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { TabelaFurosPrevistos } from './TabelaFurosPrevistos';
import { ROTULO_DA_PENDENCIA, type GrupoDaPendencia, type SituacaoDaEtapa } from '../../utils/blueprintGeradorPpci';
import { PADROES_DA_CASA, ROTULO_DO_PADRAO_DA_CASA, type PadraoDaCasa } from '../../utils/blueprintPrograma';
import { PREMISSAS_DA_CASA_PADRAO, type PremissasDaCasa } from '../../utils/blueprintPremissasDaCasa';
import type { EstadoDaCasaAutomatica } from '../../hooks/useCasaAutomatica';
import type { EstadoDoPasso, PassoDaCasa, PassosDaCasa } from '../../utils/blueprintCasaPeloEmpreendimento';
import { AREA_DA_INTENSIDADE_PADRAO_M2, INTENSIDADE_ATE_100M2_MMH, INTENSIDADE_POR_CIDADE, PERIODOS_DE_RETORNO, type HipotesesPluviais, type PeriodoDeRetorno } from '../../utils/blueprintPluvial';

const COR_DA_SITUACAO: Record<SituacaoDaEtapa, string> = {
  LANCOU: 'text-emerald-700',
  NADA_A_FAZER: 'text-slate-500',
  NAO_EXIGIDA: 'text-slate-400',
  NAO_RODOU: 'text-amber-700',
  CALCULOU: 'text-sky-700',
};
const ROTULO_DA_SITUACAO: Record<SituacaoDaEtapa, string> = { LANCOU: 'lança', NADA_A_FAZER: 'nada a fazer', NAO_EXIGIDA: 'desligada', NAO_RODOU: 'não rodou', CALCULOU: 'calcula' };
const ORDEM: GrupoDaPendencia[] = ['VERIFICACAO', 'PREMISSA', 'SEM_SOLUCAO', 'CONFLITO', 'NAO_DECIDIDO', 'CONFERIR'];
const DISCIPLINAS: { chave: keyof PremissasDaCasa['disciplinas']; rotulo: string }[] = [
  { chave: 'estrutura', rotulo: 'Estrutura' },
  { chave: 'telhado', rotulo: 'Telhado' },
  { chave: 'ancoras', rotulo: "Caixa d'água, aquecedor e vagas" },
  { chave: 'mobiliario', rotulo: 'Mobiliário e louças' },
  { chave: 'hidraulica', rotulo: 'Água, esgoto e pluvial' },
  { chave: 'eletrica', rotulo: 'Elétrica' },
  { chave: 'climatizacao', rotulo: 'Climatização' },
];

const f1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Uma unidade do Empreendimento que pode preencher o programa. */
export interface UnidadeParaOPrograma {
  id: string;
  rotulo: string;
}

interface Props {
  casa: EstadoDaCasaAutomatica;
  premissas: PremissasDaCasa;
  onPremissas: (p: PremissasDaCasa) => void;
  /** Sem a tabela do estudo: as premissas valem só nesta sessão. */
  persistenciaIndisponivel: boolean;
  /** Por que não dá para gerar (sem lote, sem FRENTE, pavimento com paredes…); `null` = pode. */
  motivoParaNaoGerar: string | null;
  onGerar: () => void;
  /** A trava antes de gravar: o lote recria os mesmos ids no desenho atual? */
  prova: { ok: true } | { ok: false; motivo: string } | null;
  onLancar: () => Promise<void>;
  onCriarAlternativa: () => Promise<void>;
  /** O que aconteceu no último lançamento. */
  lancado: string | null;
  /** O CUB do padrão escolhido (R$/m²), para o custo da prévia; `null` = indisponível. */
  cub: { valorM2: number; estimado: boolean; referencia: string | null } | null;
  /** Unidades do Empreendimento ligado ao estudo, para preencher o programa. */
  unidades: UnidadeParaOPrograma[];
  /**
   * F15: escolher a unidade preenche o programa por ela e a grava como A unidade desta casa (o sincronismo atualiza
   * ela); `null` desfaz o vínculo sem mexer no programa.
   */
  onUnidade: (id: string | null) => void;
  /**
   * F28 (item 10 da casa automática): a CHUVA DE PROJETO — as hipóteses pluviais do estudo (as mesmas do painel Pluvial).
   * Sem ela, a casa com mais de 100 m² de projeção (o sobrado, a de 3 pavimentos com terraço) ficava com o pluvial sem
   * rodar e ninguém via por quê. Ausente = a seção não aparece.
   */
  chuva?: HipotesesPluviais;
  onChuva?: (h: HipotesesPluviais) => void;
  /**
   * 25/10/2026 ("construir através dos dados de incorporação > empreendimento"): o Empreendimento ligado ao estudo e
   * os passos do "Construir pelo Empreendimento" — lote pela ficha, zona, unidade e gerar num clique. `onResolver`
   * leva ao lugar de responder um passo que PERGUNTA (lote digitado, zona, unidade). Ausente = sem empreendimento.
   */
  peloEmpreendimento?: {
    nome: string;
    passos: PassosDaCasa;
    construindo: boolean;
    onConstruir: () => void;
    onResolver: (passo: PassoDaCasa) => void;
    /** O que o último "Construir" fez (ou por que parou). */
    mensagem?: { texto: string; erro: boolean } | null;
  } | null;
}

/** O estado de cada passo em texto colorido (§8), com ícone — nunca só a cor. */
const DO_ESTADO: Record<EstadoDoPasso, { rotulo: string; cor: string; Icone: typeof Check }> = {
  FEITO: { rotulo: 'feito', cor: 'text-emerald-700', Icone: Check },
  FAZER: { rotulo: 'o botão faz', cor: 'text-blue-700', Icone: CircleDot },
  PERGUNTAR: { rotulo: 'escolha sua', cor: 'text-amber-700', Icone: HelpCircle },
  FALTA: { rotulo: 'falta', cor: 'text-red-700', Icone: AlertCircle },
  AVISO: { rotulo: 'aviso', cor: 'text-slate-600', Icone: Info },
};
const ONDE_RESPONDER: Partial<Record<PassoDaCasa, string>> = { LOTE: 'Abrir o lote digitado', ZONA: 'Abrir Dados do lote', UNIDADE: 'Escolher a unidade' };

const PERIODO_DA_CHUVA: Record<PeriodoDeRetorno, string> = { 1: '1 ano', 5: '5 anos (coberturas e terraços)', 25: '25 anos' };

/** F28: a intensidade que vale para a casa, e de onde vem — antes de gerar (a projeção ainda não se sabe). */
export function chuvaDaCasa(h: HipotesesPluviais): { texto: string; falta: boolean } {
  if (h.intensidadeMmH != null && h.intensidadeMmH > 0) return { texto: `${h.intensidadeMmH} mm/h, informada no estudo`, falta: false };
  const linha = h.cidade ? INTENSIDADE_POR_CIDADE[h.cidade] : undefined;
  if (linha) return { texto: `${linha[h.periodoDeRetornoAnos]} mm/h — tabela da NBR 10844 para ${h.cidade}, ${h.periodoDeRetornoAnos} ano(s); confira na norma`, falta: false };
  return {
    texto: `sem cidade nem intensidade: até ${AREA_DA_INTENSIDADE_PADRAO_M2} m² de projeção vale ${INTENSIDADE_ATE_100M2_MMH} mm/h (NBR 10844, 5.1.4); acima disso o pluvial não roda — escolha a cidade ou informe a intensidade`,
    falta: true,
  };
}

const rotuloCls = 'text-xs font-semibold text-slate-500';
const campoCls = 'h-9 w-full rounded-[6px] border border-gray-200 bg-white px-3 text-sm text-gray-900 tabular-nums focus:border-blue-500 focus:outline-none';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className={rotuloCls}>{rotulo}</span>
      {children}
    </label>
  );
}

/**
 * Número com faixa: o TEXTO é livre enquanto se digita (limitar a cada tecla transformava o "5" de "5500" em 2000);
 * o valor sobe quando já cabe na faixa, e ao sair do campo ele volta para dentro dela. `anulavel`: vazio = `null`.
 */
function Numero({ rotulo, valor, onValor, min, max, passo = 1, anulavel = false, placeholder }: { rotulo: string; valor: number | null; onValor: (v: number | null) => void; min: number; max: number; passo?: number; anulavel?: boolean; placeholder?: string }) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor));
  useEffect(() => setTexto(valor == null ? '' : String(valor)), [valor]);
  const cabe = (v: number) => Number.isFinite(v) && v >= min && v <= max;
  return (
    <Campo rotulo={rotulo}>
      <input
        type="number"
        min={min}
        max={max}
        step={passo}
        value={texto}
        placeholder={placeholder}
        aria-label={rotulo}
        onChange={(e) => {
          setTexto(e.target.value);
          if (e.target.value === '') {
            if (anulavel) onValor(null);
            return;
          }
          const v = Number(e.target.value);
          if (cabe(v)) onValor(v);
        }}
        onBlur={() => {
          if (texto === '') {
            if (!anulavel) setTexto(valor == null ? '' : String(valor));
            return;
          }
          const v = Number(texto);
          const dentro = Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : (valor ?? min);
          setTexto(String(dentro));
          if (dentro !== valor) onValor(dentro);
        }}
        className={campoCls}
      />
    </Campo>
  );
}

/**
 * As abas da tela (22/10/2026, a pedido do usuário: "o resultado na tela fica bastante extensa"). Medido na Garden
 * Cambuhy, a tela inteira tinha 3.603 px — Gerar abaixo da 1ª tela, Lançar depois de 64 linhas de furos. As do
 * resultado só existem com a prévia, e Furos/Terraplenagem só quando há o que mostrar (aba vazia não aparece, §19.5).
 */
type Aba = 'programa' | 'hipoteses' | 'resultado' | 'relatorio' | 'furos' | 'terraplenagem';

const cardCls = 'rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm';
const caixaCls = 'h-4 w-4 rounded border-gray-300';
const marcaCls = 'flex items-center gap-2 self-end pb-2 text-sm text-gray-700';

export default function TelaCasaAutomatica(props: Props) {
  const { casa, premissas: p, onPremissas, prova, cub } = props;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<GrupoDaPendencia | null>('VERIFICACAO');
  const plano = casa.plano;
  const [aba, setAba] = useState<Aba>(plano ? 'resultado' : 'programa');
  const set = <K extends keyof PremissasDaCasa>(k: K, v: Partial<PremissasDaCasa[K]>) =>
    onPremissas({ ...p, [k]: typeof v === 'object' && v !== null ? { ...(p[k] as object), ...(v as object) } : v } as PremissasDaCasa);

  // Ao terminar de gerar, o resultado — a menos que se esteja lendo outra aba dele (o relatório, os furos).
  const rodava = useRef(casa.rodando);
  useEffect(() => {
    if (rodava.current && !casa.rodando && casa.plano) setAba((a) => (a === 'relatorio' || a === 'furos' || a === 'terraplenagem' ? a : 'resultado'));
    rodava.current = casa.rodando;
  }, [casa.rodando, casa.plano]);

  const motivoDeLancar = !plano
    ? 'Gere a prévia primeiro'
    : plano.comandos.length === 0
      ? 'A prévia não tem nada a lançar'
      : prova && !prova.ok
        ? prova.motivo
        : ocupado
          ? 'Aguarde a ação em curso'
          : undefined;
  const motivoDeCriar = !plano ? 'Gere a prévia primeiro' : plano.comandos.length === 0 ? 'A prévia não tem nada a lançar' : ocupado ? 'Aguarde a ação em curso' : undefined;

  const agir = async (nome: string, fn: () => Promise<void>) => {
    setOcupado(nome);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const med = plano?.implantacao?.medidas ?? null;
  const area = plano?.resumo.areaConstruidaM2 ?? null;
  const furos = plano?.resumo.furos && plano.resumo.furos.lista.length > 0 ? plano.resumo.furos : null;
  const terra = plano?.resumo.terraplenagem ?? null;
  const verificacoes = plano ? plano.pendencias.filter((x) => x.grupo === 'VERIFICACAO').length : 0;
  const premissasFaltando = plano ? plano.pendencias.filter((x) => x.grupo === 'PREMISSA').length : 0;

  const abas: TabsBarItem<Aba>[] = [
    { id: 'programa', label: 'Programa' },
    { id: 'hipoteses', label: 'Hipóteses' },
    ...(plano
      ? ([
          { id: 'resultado', label: 'Resultado' },
          {
            id: 'relatorio',
            label: 'Relatório',
            badge: plano.pendencias.length,
            badgeTom: verificacoes > 0 ? 'alerta' : undefined,
            badgeTitulo: verificacoes > 0 ? `${plano.pendencias.length} item(ns), ${verificacoes} verificação(ões) em falta` : `${plano.pendencias.length} item(ns)`,
          },
        ] as TabsBarItem<Aba>[])
      : []),
    ...(furos ? ([{ id: 'furos', label: 'Furos', badge: furos.lista.length, badgeTitulo: 'furos previstos para o calculista' }] as TabsBarItem<Aba>[]) : []),
    ...(terra ? ([{ id: 'terraplenagem', label: 'Terraplenagem' }] as TabsBarItem<Aba>[]) : []),
  ];
  // A aba escolhida que deixou de existir (gerou de novo sem furos, desligou o platô) cai no resultado.
  const abaEfetiva: Aba = abas.some((a) => a.id === aba) ? aba : plano ? 'resultado' : 'programa';

  const avisoDeLancar = plano && plano.comandos.length > 0 ? (motivoDeLancar ?? motivoDeCriar) : undefined;

  return (
    <div className="space-y-6" data-testid="tela-casa">
      {/* ── Abas + as ações da tela: Gerar, Criar alternativa e Lançar à vista em qualquer aba (§19.1, §17) ── */}
      <div>
        <TabsBar tabs={abas} value={abaEfetiva} onChange={setAba}>
          {casa.rodando ? (
            <Button variant="secondary" onClick={casa.cancelar} data-testid="parar-casa" className="border-red-200 text-red-700 hover:bg-red-50">
              <Square className="h-4 w-4" /> Parar
            </Button>
          ) : (
            <Button variant={plano ? 'secondary' : 'primary'} onClick={props.onGerar} disabled={!!props.motivoParaNaoGerar} title={props.motivoParaNaoGerar ?? undefined} data-testid="gerar-casa">
              <Play className="h-4 w-4" /> {plano ? 'Gerar de novo' : 'Gerar prévia'}
            </Button>
          )}
          {plano && (
            <>
              <Button variant="secondary" onClick={() => agir('criar', props.onCriarAlternativa)} disabled={!!motivoDeCriar} title={motivoDeCriar} data-testid="criar-alternativa-casa">
                {ocupado === 'criar' ? 'Criando…' : 'Criar alternativa'}
              </Button>
              <Button onClick={() => agir('lancar', props.onLancar)} disabled={!!motivoDeLancar} title={motivoDeLancar} data-testid="lancar-casa">
                {ocupado === 'lancar' ? 'Lançando…' : plano.sobrado?.segundo ? 'Lançar os três pavimentos' : plano.sobrado ? 'Lançar os dois pavimentos' : 'Lançar no pavimento'}
              </Button>
            </>
          )}
        </TabsBar>

        {/* O estado das ações, logo abaixo delas — vale para todas as abas. */}
        {((props.motivoParaNaoGerar && !casa.rodando) || casa.rodando || erro || casa.erro || props.lancado || avisoDeLancar) && (
          <div className="mb-3 space-y-2">
            {props.motivoParaNaoGerar && !casa.rodando && (
              <p className="text-xs text-amber-700" data-testid="motivo-gerar-casa">
                {props.motivoParaNaoGerar}
              </p>
            )}
            {casa.rodando && (
              <p className="text-sm text-slate-600" data-testid="progresso-casa">
                {casa.progresso ? `Etapa ${casa.progresso.indice} de ${casa.progresso.total}: ${casa.progresso.rotulo}` : 'Gerando a casa…'}
              </p>
            )}
            {(erro || casa.erro) && (
              <p role="alert" className="text-sm text-red-700">
                {erro ?? casa.erro}
              </p>
            )}
            {props.lancado && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{props.lancado}</p>}
            {avisoDeLancar && <p className="text-xs text-amber-700">{avisoDeLancar}</p>}
          </div>
        )}
      </div>

      {/* ── Construir pelo Empreendimento (25/10/2026): o que já está feito, o que o botão faz e onde ele pergunta ── */}
      {props.peloEmpreendimento && (
        <section className={`space-y-4 ${cardCls}`} data-testid="casa-pelo-empreendimento">
          <SecaoTitulo
            icon={Building2}
            titulo={`Dados do Empreendimento "${props.peloEmpreendimento.nome}"`}
            resumo="lote, zona e programa saem da ficha, do Mapa Regulatório e de Torres & Unidades"
            acoes={
              <Button
                variant="secondary"
                onClick={() => {
                  const parada = props.peloEmpreendimento?.passos.parada;
                  if (parada === 'UNIDADE') setAba('programa');
                  props.peloEmpreendimento?.onConstruir();
                }}
                disabled={!!props.peloEmpreendimento.passos.motivoDoBotao || props.peloEmpreendimento.construindo || casa.rodando}
                title={props.peloEmpreendimento.passos.motivoDoBotao ?? (casa.rodando ? 'Aguarde: a casa está sendo gerada' : undefined)}
                data-testid="construir-pelo-empreendimento"
              >
                <Wand2 className="h-4 w-4" /> {props.peloEmpreendimento.construindo ? 'Construindo…' : 'Construir pelo Empreendimento'}
              </Button>
            }
          />
          <ul className="space-y-2">
            {props.peloEmpreendimento.passos.passos.map((x) => {
              const { rotulo, cor, Icone } = DO_ESTADO[x.estado];
              const onde = x.estado === 'PERGUNTAR' ? ONDE_RESPONDER[x.passo] : undefined;
              return (
                <li key={x.passo} className="flex items-start gap-2 text-sm text-gray-700" data-testid={`passo-${x.passo}`}>
                  <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} aria-hidden />
                  <span className="w-20 shrink-0 font-medium text-gray-900">{x.rotulo}</span>
                  <span className={`w-28 shrink-0 ${cor}`}>{rotulo}</span>
                  <span className="min-w-0 flex-1">
                    {x.texto}
                    {onde && (
                      <button
                        type="button"
                        className="ml-2 font-medium text-blue-600 hover:text-blue-800"
                        onClick={() => {
                          if (x.passo === 'UNIDADE') setAba('programa');
                          props.peloEmpreendimento?.onResolver(x.passo);
                        }}
                      >
                        {onde}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {props.peloEmpreendimento.mensagem && (
            <p
              role={props.peloEmpreendimento.mensagem.erro ? 'alert' : 'status'}
              className={props.peloEmpreendimento.mensagem.erro ? 'text-sm text-red-700' : 'text-sm text-gray-700'}
              data-testid="mensagem-do-construir"
            >
              {props.peloEmpreendimento.mensagem.texto}
            </p>
          )}
        </section>
      )}

      {/* ── Programa: o que a casa tem e o que ela leva (um formulário, um card, §30) ── */}
      {abaEfetiva === 'programa' && (
        <div role="tabpanel" aria-label="Programa" className={`space-y-8 ${cardCls}`} data-testid="programa-da-casa">
          <section className="space-y-4">
            <SecaoTitulo
              icon={Home}
              titulo="Programa da casa"
              resumo={props.persistenciaIndisponivel ? 'as premissas valem só nesta sessão (o estudo não as guarda)' : 'guardado no estudo'}
              acoes={
                <Button variant="secondary" onClick={() => onPremissas({ ...PREMISSAS_DA_CASA_PADRAO })}>
                  Voltar ao padrão
                </Button>
              }
            />
            {(props.unidades.length > 0 || p.unidadeId) && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
                <div className="col-span-2 space-y-1.5">
                  <Campo rotulo="Unidade do Empreendimento desta casa">
                    <select aria-label="Unidade do Empreendimento desta casa" data-testid="unidade-da-casa" className={campoCls} value={p.unidadeId ?? ''} onChange={(e) => props.onUnidade(e.target.value || null)}>
                      <option value="">Nenhuma — o sincronismo cria a torre "Casa"</option>
                      {p.unidadeId && !props.unidades.some((u) => u.id === p.unidadeId) && <option value={p.unidadeId}>Unidade não encontrada no Empreendimento</option>}
                      {props.unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <p className="text-xs text-slate-500">
                    Escolher preenche o programa pela unidade; ao sincronizar o Empreendimento com a Planta, a casa publicada atualiza essa unidade (área, dormitórios, suítes, banheiros, vagas e tipologia).
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Campo rotulo="Pavimentos">
                <select aria-label="Pavimentos" className={campoCls} value={p.pavimentos} onChange={(e) => onPremissas({ ...p, pavimentos: e.target.value === '3' ? 3 : e.target.value === '2' ? 2 : e.target.value === '1' ? 1 : 'AUTOMATICO' })} data-testid="pavimentos-da-casa">
                  <option value="AUTOMATICO">Automático (térrea; sobe um pavimento quando não couber)</option>
                  <option value={1}>Térrea</option>
                  <option value={2}>Sobrado (2 pavimentos)</option>
                  <option value={3}>3 pavimentos (o 2º recuado, com terraço)</option>
                </select>
              </Campo>
              <Campo rotulo="Padrão (CUB)">
                <select aria-label="Padrão (CUB)" className={campoCls} value={p.curto.padrao} onChange={(e) => set('curto', { padrao: e.target.value as PadraoDaCasa })}>
                  {PADROES_DA_CASA.map((x) => (
                    <option key={x} value={x}>
                      {ROTULO_DO_PADRAO_DA_CASA[x]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Numero rotulo="Dormitórios (com as suítes)" valor={p.curto.dormitorios} min={1} max={6} onValor={(v) => v != null && set('curto', { dormitorios: Math.round(v) })} />
              <Numero rotulo="Suítes" valor={p.curto.suites} min={0} max={6} onValor={(v) => v != null && set('curto', { suites: Math.round(v) })} />
              <Numero rotulo="Banheiros (com os das suítes)" valor={p.curto.banheiros} min={1} max={8} onValor={(v) => v != null && set('curto', { banheiros: Math.round(v) })} />
              <Numero rotulo="Vagas" valor={p.curto.vagas} min={0} max={4} onValor={(v) => v != null && set('curto', { vagas: Math.round(v) })} />
              <Numero rotulo="Área útil alvo (m²)" valor={p.curto.areaAlvoM2} min={30} max={600} passo={5} anulavel placeholder="a do padrão" onValor={(v) => set('curto', { areaAlvoM2: v })} />
              <label className={marcaCls}>
                <input type="checkbox" checked={p.curto.garagemCoberta} onChange={(e) => set('curto', { garagemCoberta: e.target.checked })} className={caixaCls} />
                Garagem coberta
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <SecaoTitulo icon={ListChecks} titulo="O que a casa leva" resumo="a arquitetura vai sempre; o resto, como marcado" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
              {DISCIPLINAS.map((d) => (
                <label key={d.chave} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={p.disciplinas[d.chave]} onChange={(e) => set('disciplinas', { [d.chave]: e.target.checked } as Partial<PremissasDaCasa['disciplinas']>)} className={caixaCls} aria-label={d.rotulo} />
                  {d.rotulo}
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Hipóteses: o mesmo formulário, separado por assunto (§30) — eram 12 a 35 campos numa grade só ── */}
      {abaEfetiva === 'hipoteses' && (
        <div role="tabpanel" aria-label="Hipóteses" className={`space-y-8 ${cardCls}`} data-testid="hipoteses-da-casa">
          <section className="space-y-4">
            <SecaoTitulo icon={Ruler} titulo="Implantação e telhado" resumo="o que não está aqui segue as premissas de cada disciplina" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Numero rotulo="Folga abaixo da TO (%)" valor={p.implantacao.folgaDaTOPct} min={0} max={50} onValor={(v) => v != null && set('implantacao', { folgaDaTOPct: v })} />
              <Campo rotulo="Encostar na divisa">
                <select aria-label="Encostar na divisa" className={campoCls} value={p.implantacao.encostarNaDivisa} onChange={(e) => set('implantacao', { encostarNaDivisa: e.target.value as PremissasDaCasa['implantacao']['encostarNaDivisa'] })}>
                  <option value="ESQUERDA">Esquerda</option>
                  <option value="DIREITA">Direita</option>
                  <option value="CENTRO">No centro</option>
                </select>
              </Campo>
              <Numero rotulo="Alternativas tentadas" valor={p.sementes} min={1} max={8} onValor={(v) => v != null && onPremissas({ ...p, sementes: Math.round(v) })} />
              <div className="hidden md:block" />
              <Campo rotulo="Telhado">
                <select aria-label="Tipo de telhado" className={campoCls} value={p.telhado.tipo} onChange={(e) => set('telhado', { tipo: e.target.value as PremissasDaCasa['telhado']['tipo'] })}>
                  <option value="DUAS_AGUAS">Duas águas</option>
                  <option value="UMA_AGUA">Uma água</option>
                </select>
              </Campo>
              <Numero rotulo="Inclinação do telhado (%)" valor={p.telhado.inclinacaoPct} min={5} max={100} onValor={(v) => v != null && set('telhado', { inclinacaoPct: v })} />
              <Numero rotulo="Beiral (m)" valor={p.telhado.beiralMm / 1000} min={0} max={1.5} passo={0.1} onValor={(v) => v != null && set('telhado', { beiralMm: Math.round(v * 1000) })} />
            </div>
          </section>

          <section className="space-y-4">
            <SecaoTitulo icon={Mountain} titulo="Terreno, muro e calçadas" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <label className={`${marcaCls} col-span-2 md:col-span-4`} title="Só com a topografia do estudo: a casa assenta num platô na cota que equilibra corte e aterro sob a projeção">
                <input type="checkbox" checked={p.terraplenagem.lancar} onChange={(e) => set('terraplenagem', { lancar: e.target.checked })} className={caixaCls} data-testid="terraplenagem-da-casa" />
                Platô no terreno inclinado
              </label>
              {p.terraplenagem.lancar && (
                <>
                  <Numero rotulo="Platô além da casa (m)" valor={p.terraplenagem.margemDoPlatoMm / 1000} min={0} max={5} passo={0.1} onValor={(v) => v != null && set('terraplenagem', { margemDoPlatoMm: Math.round(v * 1000) })} />
                  <Numero rotulo="Piso acima do platô (cm)" valor={p.terraplenagem.pisoAcimaDoPlatoMm / 10} min={0} max={100} passo={1} onValor={(v) => v != null && set('terraplenagem', { pisoAcimaDoPlatoMm: Math.round(v * 10) })} />
                  <Numero rotulo="Talude até (m de altura; acima, muro)" valor={p.terraplenagem.alturaMaximaDoTaludeM} min={0} max={10} passo={0.1} onValor={(v) => v != null && set('terraplenagem', { alturaMaximaDoTaludeM: Math.round(v * 100) / 100 })} />
                  <Numero rotulo="Rampa da garagem até (%)" valor={p.terraplenagem.rampaDeVeiculosMaxPct} min={5} max={30} passo={0.5} onValor={(v) => v != null && set('terraplenagem', { rampaDeVeiculosMaxPct: Math.round(v * 10) / 10 })} />
                </>
              )}
              <label className={`${marcaCls} col-span-2 md:col-span-4`} title="O muro na divisa do lote (kernel 0.104.0), com o portão de pedestre diante da porta e o de garagem diante da garagem">
                <input type="checkbox" checked={p.muro.lancar} onChange={(e) => set('muro', { lancar: e.target.checked })} className={caixaCls} data-testid="muro-da-casa" />
                Muro, portões e calçadas
              </label>
              {p.muro.lancar && (
                <>
                  <Campo rotulo="Muro da frente">
                    <select aria-label="Muro da frente" className={campoCls} value={p.muro.tipoDaFrente} onChange={(e) => set('muro', { tipoDaFrente: e.target.value as PremissasDaCasa['muro']['tipoDaFrente'] })} data-testid="muro-da-frente">
                      <option value="MURETA_COM_GRADE">Mureta com grade</option>
                      <option value="GRADE">Grade</option>
                      <option value="ALVENARIA">Alvenaria</option>
                    </select>
                  </Campo>
                  <Numero rotulo="Altura da frente (m)" valor={p.muro.alturaDaFrenteMm / 1000} min={0.5} max={4} passo={0.05} onValor={(v) => v != null && set('muro', { alturaDaFrenteMm: Math.round(v * 1000) })} />
                  <Numero rotulo="Altura das divisas (m)" valor={p.muro.alturaDasDivisasMm / 1000} min={0.5} max={4} passo={0.05} onValor={(v) => v != null && set('muro', { alturaDasDivisasMm: Math.round(v * 1000) })} />
                  <label className={marcaCls}>
                    <input type="checkbox" checked={p.muro.calcadas} onChange={(e) => set('muro', { calcadas: e.target.checked })} className={caixaCls} data-testid="calcadas-da-casa" />
                    Calçadas da entrada e da garagem
                  </label>
                </>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <SecaoTitulo icon={Droplets} titulo="Instalações" resumo="água, esgoto, chuva e elétrica" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Campo rotulo="Água quente">
                <select aria-label="Água quente" className={campoCls} value={p.ancoras.aguaQuente} onChange={(e) => set('ancoras', { aguaQuente: e.target.value as PremissasDaCasa['ancoras']['aguaQuente'] })}>
                  <option value="PELO_PADRAO">Pelo padrão (R1-B: chuveiro elétrico)</option>
                  <option value="AQUECEDOR_PASSAGEM">Aquecedor de passagem</option>
                  <option value="CHUVEIRO_ELETRICO">Chuveiro elétrico</option>
                  <option value="NENHUM">Sem água quente</option>
                </select>
              </Campo>
              <Numero rotulo="Chuveiro elétrico (W)" valor={p.eletrica.chuveiroEletricoVA} min={2000} max={9000} passo={100} onValor={(v) => v != null && set('eletrica', { chuveiroEletricoVA: Math.round(v) })} />
              <Numero rotulo="Elevar a caixa d'água até (m)" valor={p.pressao.caixaElevadaAteMm / 1000} min={0} max={15} passo={0.5} onValor={(v) => v != null && set('pressao', { caixaElevadaAteMm: Math.round(v * 1000) })} />
              <Numero rotulo="Pressurizador (W)" valor={p.pressao.potenciaDoPressurizadorW} min={100} max={3000} passo={10} onValor={(v) => v != null && set('pressao', { potenciaDoPressurizadorW: Math.round(v) })} />
              <label className={marcaCls}>
                <input type="checkbox" checked={p.ancoras.caixaDeGordura} onChange={(e) => set('ancoras', { caixaDeGordura: e.target.checked })} className={caixaCls} />
                Caixa de gordura
              </label>
              <label className={marcaCls}>
                <input type="checkbox" checked={p.eletrica.medidor} onChange={(e) => set('eletrica', { medidor: e.target.checked })} className={caixaCls} />
                Medidor na frente do lote
              </label>
              {p.disciplinas.hidraulica && props.chuva && props.onChuva && (
                <>
                  <div className="hidden md:col-span-2 md:block" />
                  <Campo rotulo="Chuva: cidade (NBR 10844)">
                    <select aria-label="Cidade da tabela de chuvas" className={campoCls} value={props.chuva.cidade ?? ''} onChange={(e) => props.onChuva!({ ...props.chuva!, cidade: e.target.value || null })} data-testid="chuva-cidade">
                      <option value="">— nenhuma —</option>
                      {Object.keys(INTENSIDADE_POR_CIDADE)
                        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                        .map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Chuva: período de retorno">
                    <select aria-label="Período de retorno da chuva" className={campoCls} value={props.chuva.periodoDeRetornoAnos} onChange={(e) => props.onChuva!({ ...props.chuva!, periodoDeRetornoAnos: Number(e.target.value) as PeriodoDeRetorno })} data-testid="chuva-periodo">
                      {PERIODOS_DE_RETORNO.map((t) => (
                        <option key={t} value={t}>
                          {PERIODO_DA_CHUVA[t]}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Numero rotulo="Chuva: intensidade (mm/h)" valor={props.chuva.intensidadeMmH} min={1} max={500} anulavel placeholder="da tabela" onValor={(v) => props.onChuva!({ ...props.chuva!, intensidadeMmH: v })} />
                  <p className={`col-span-2 self-end pb-2 text-xs md:col-span-1 ${chuvaDaCasa(props.chuva).falta ? 'text-amber-700' : 'text-slate-600'}`} data-testid="chuva-da-casa">
                    Chuva de projeto: {chuvaDaCasa(props.chuva).texto}.
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <SecaoTitulo icon={Layers} titulo="Estrutura, pavimentos e forro" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              {p.disciplinas.estrutura && (
                <Numero rotulo="Montante entre folhas de janela (cm)" valor={p.estrutura.montanteEntreJanelasMm / 10} min={20} max={100} passo={5} onValor={(v) => v != null && set('estrutura', { montanteEntreJanelasMm: Math.round(v * 10) })} />
              )}
              {p.pavimentos !== 1 && (
                <>
                  <Numero rotulo="Laje entre os pavimentos (cm)" valor={p.sobrado.lajeEntrePavimentosMm / 10} min={8} max={30} onValor={(v) => v != null && set('sobrado', { lajeEntrePavimentosMm: Math.round(v * 10) })} />
                  <Numero rotulo="Shaft das instalações (cm)" valor={p.sobrado.shaftMm / 10} min={20} max={80} passo={5} onValor={(v) => v != null && set('sobrado', { shaftMm: Math.round(v * 10) })} />
                  {p.disciplinas.estrutura && (
                    <Numero rotulo="Pilar de cima foge da abertura de baixo até (m)" valor={p.estrutura.deslizeSobreAberturaMm / 1000} min={0} max={3} passo={0.05} onValor={(v) => v != null && set('estrutura', { deslizeSobreAberturaMm: Math.round(v * 1000) })} />
                  )}
                </>
              )}
              <label className={`${marcaCls} col-span-2 md:col-span-4`}>
                <input type="checkbox" checked={p.forro.lancar} onChange={(e) => set('forro', { lancar: e.target.checked })} className={caixaCls} data-testid="forro-da-casa" />
                Forro com as redes no plenum
              </label>
              {p.forro.lancar && (
                <>
                  <Numero rotulo="Pé-direito livre: sala, dormitório, cozinha (m)" valor={p.forro.peDireitoLivrePermanenciaMm / 1000} min={2.2} max={3.5} passo={0.05} onValor={(v) => v != null && set('forro', { peDireitoLivrePermanenciaMm: Math.round(v * 1000) })} />
                  <Numero rotulo="Pé-direito livre: banheiro, serviço, circulação (m)" valor={p.forro.peDireitoLivreDemaisMm / 1000} min={2.1} max={3.5} passo={0.05} onValor={(v) => v != null && set('forro', { peDireitoLivreDemaisMm: Math.round(v * 1000) })} />
                  <Numero rotulo="Piso acabado (cm)" valor={p.forro.pisoAcabadoMm / 10} min={0} max={15} passo={0.5} onValor={(v) => v != null && set('forro', { pisoAcabadoMm: Math.round(v * 10) })} />
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ── Resultado: o resumo e as etapas ── */}
      {abaEfetiva === 'resultado' && plano && (
        <div role="tabpanel" aria-label="Resultado" className={`space-y-6 ${cardCls}`} data-testid="previa-da-casa">
          <SecaoTitulo icon={Wand2} titulo="Resultado" resumo={`${plano.comandos.length} comando(s) num lote só`} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4" data-testid="resumo-da-casa">
            <div className="space-y-1">
              <dt className={rotuloCls}>Área construída</dt>
              <dd className="text-lg font-semibold text-gray-900 tabular-nums">{area != null ? `${f2(area)} m²` : '—'}</dd>
            </div>
            <div className="space-y-1">
              <dt className={rotuloCls}>Ambientes do programa</dt>
              <dd className="text-lg font-semibold text-gray-900 tabular-nums">
                {plano.resumo.ambientesAtendidos} de {plano.resumo.ambientesPedidos}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className={rotuloCls}>Taxa de ocupação</dt>
              <dd className="text-lg font-semibold text-gray-900 tabular-nums">
                {med ? `${f1(med.toPct)} %` : '—'}
                {med?.toMaxPct != null && <span className="ml-1 text-xs font-normal text-slate-500">máx. {f1(med.toMaxPct)} %</span>}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className={rotuloCls}>Custo pelo CUB</dt>
              <dd className="text-lg font-semibold text-gray-900 tabular-nums" data-testid="custo-da-casa">
                {area != null && cub ? reais(area * cub.valorM2) : '—'}
              </dd>
              <dd className="text-xs text-slate-500">
                {cub ? `${reais(cub.valorM2)}/m² · ${p.curto.padrao}${cub.estimado ? ' · CUB estimado — confira' : cub.referencia ? ` · ${cub.referencia}` : ''}` : 'CUB indisponível'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className={rotuloCls}>Coeficiente de aproveitamento</dt>
              <dd className="text-sm text-gray-900 tabular-nums">
                {med ? f2(med.coeficiente) : '—'}
                {med?.coeficienteMax != null && <span className="ml-1 text-xs text-slate-500">máx. {f2(med.coeficienteMax)}</span>}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className={rotuloCls}>Permeabilidade</dt>
              <dd className="text-sm text-gray-900 tabular-nums">
                {med ? `${f1(med.permeabilidadePct)} %` : '—'}
                {med?.permeabilidadeMinPct != null && <span className="ml-1 text-xs text-slate-500">mín. {f1(med.permeabilidadeMinPct)} %</span>}
              </dd>
            </div>
            {plano.sobrado && (
              <div className="space-y-1" data-testid="sobrado-da-casa">
                <dt className={rotuloCls}>{plano.sobrado.segundo ? '3 pavimentos' : 'Sobrado'}</dt>
                <dd className="text-sm text-gray-900 tabular-nums">
                  {plano.sobrado.segundo ? 'duas escadas em U' : 'escada em U'}, {plano.sobrado.escada.degraus} degraus de {plano.sobrado.escada.espelhoMm} × {plano.sobrado.escada.pisoMm} mm
                </dd>
                <dd className="text-xs text-slate-500">
                  núcleo à {plano.sobrado.nucleo.lado === 'DIREITA' ? 'direita' : 'esquerda'}
                  {plano.sobrado.segundo ? ` · terraço de ${f1(plano.sobrado.segundo.terracoM2)} m² na laje do 1º` : ''}
                </dd>
              </div>
            )}
            <div className="space-y-1">
              <dt className={rotuloCls}>Elétrica</dt>
              <dd className="text-sm text-gray-900">
                {plano.resumo.eletrica.circuitos} circuito(s)
                {plano.resumo.eletrica.entrada ? ` · entrada ${plano.resumo.eletrica.entrada.categoria}` : ''}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className={rotuloCls}>Climatização</dt>
              <dd className="text-sm text-gray-900">{plano.resumo.climatizacao.equipamentos} split(s)</dd>
            </div>
          </dl>
          {plano.escolha && <p className="text-xs text-slate-500">{plano.escolha}</p>}

          {/* Quando o gerador PARA numa premissa, o porquê à vista (a lição do PPCI, 10/10/2026) — em uma linha: a lista
              mora no Relatório, no grupo "Premissa faltando", e o botão abre lá. */}
          {plano.etapas.some((e) => e.situacao === 'NAO_RODOU') && premissasFaltando > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="casa-parou">
              <span>
                Faltam {premissasFaltando} premissa(s): {plano.etapas.filter((e) => e.situacao === 'NAO_RODOU').length} etapa(s) não rodaram.
              </span>
              <button
                type="button"
                className="font-medium underline underline-offset-2 hover:text-amber-950"
                onClick={() => {
                  setAberto('PREMISSA');
                  setAba('relatorio');
                }}
                data-testid="ver-premissas-faltando"
              >
                Ver no relatório
              </button>
            </div>
          )}

          <section className="space-y-2">
            <h4 className={rotuloCls}>Etapas ({plano.etapas.length})</h4>
            <ul className="grid grid-cols-1 gap-x-8 lg:grid-cols-2" data-testid="etapas-da-casa">
              {plano.etapas.map((e) => (
                <li key={e.id} className="border-b border-gray-100 py-1.5 text-sm">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-gray-700">{e.rotulo}</span>
                    <span className={`shrink-0 text-xs ${COR_DA_SITUACAO[e.situacao]}`}>
                      {ROTULO_DA_SITUACAO[e.situacao]}
                      {e.comandos > 0 ? ` · ${e.comandos}` : ''}
                    </span>
                  </span>
                  {e.nota && <span className="block text-xs text-slate-500">{e.nota}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* ── Relatório: as pendências por grupo ── */}
      {abaEfetiva === 'relatorio' && plano && (
        <div role="tabpanel" aria-label="Relatório" className={`space-y-4 ${cardCls}`} data-testid="pendencias-da-casa">
          <SecaoTitulo icon={ClipboardList} titulo="Relatório" resumo={`${plano.pendencias.length} item(ns)`} />
          <div className="space-y-2">
            {ORDEM.map((grupo) => {
              const lista = plano.pendencias.filter((x) => x.grupo === grupo);
              if (!lista.length) return null;
              return (
                <div key={grupo}>
                  <button type="button" onClick={() => setAberto(aberto === grupo ? null : grupo)} className="w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900">
                    {aberto === grupo ? '▾' : '▸'} {ROTULO_DA_PENDENCIA[grupo]} ({lista.length})
                  </button>
                  {aberto === grupo && (
                    <ul className="mt-1 space-y-1 pl-4">
                      {lista.map((x, i) => (
                        <li key={i} className={`break-words text-sm ${grupo === 'VERIFICACAO' || grupo === 'SEM_SOLUCAO' || grupo === 'CONFLITO' ? 'text-red-700' : 'text-slate-600'}`}>
                          {x.texto}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {!plano.pendencias.some((x) => x.grupo === 'VERIFICACAO') && !plano.etapas.some((e) => e.situacao === 'NAO_RODOU') && (
            <p className="text-sm text-emerald-700">Nenhuma verificação em falta no resultado.</p>
          )}
        </div>
      )}

      {/* ── Furos previstos para o calculista (F14c) ── */}
      {abaEfetiva === 'furos' && plano && furos && (
        <div role="tabpanel" aria-label="Furos" className={`space-y-4 ${cardCls}`} data-testid="furos-da-casa">
          <SecaoTitulo icon={CircleDot} titulo="Furos previstos para o calculista" resumo={`${furos.lista.length} furo(s)`} />
          <p className="text-sm text-slate-600">
            {furos.emViga} em viga — {furos.dispensa} dispensam a verificação pelos critérios da NBR 6118 (13.2.5.1), tomados como hipóteses, e {furos.verificar} a verificar com o calculista; {furos.emBaldrame} em baldrame;{' '}
            {furos.emLaje} passagem(ns) em laje.
          </p>
          <TabelaFurosPrevistos furos={furos.lista} pavimentos={new Map(plano.resultado.levels.map((l) => [l.id, l.name]))} />
        </div>
      )}

      {/* ── Terraplenagem (F25): o platô único ── */}
      {abaEfetiva === 'terraplenagem' && terra && (
        <div role="tabpanel" aria-label="Terraplenagem" className={`space-y-4 ${cardCls}`} data-testid="terraplenagem-do-plano">
          <SecaoTitulo icon={Mountain} titulo="Terraplenagem" resumo="platô único" />
          <p className="text-sm text-gray-700">
            Platô a {terra.cotaDoPlatoM.toLocaleString('pt-BR')} m ({f1(terra.areaPlatoM2)} m²), térreo a {(terra.elevacaoDoTerreoMm / 1000).toLocaleString('pt-BR')} m da cota zero · corte {f1(terra.corteM3)} m³ · aterro{' '}
            {f1(terra.aterroM3)} m³
            {terra.botaForaM3 > 0 ? ` · bota-fora ${f1(terra.botaForaM3)} m³` : terra.emprestimoM3 > 0 ? ` · empréstimo ${f1(terra.emprestimoM3)} m³` : ''}
            {terra.murosComprimentoM > 0 ? ` · muros de arrimo ${f1(terra.murosComprimentoM)} m (${f1(terra.murosAreaDeFaceM2)} m² de face)` : ''}
            {terra.areaTaludeM2 > 0 ? ` · taludes ${f1(terra.areaTaludeM2)} m²` : ''}
          </p>
          {terra.entrada.tipo !== 'NENHUMA' && (
            <p className="text-sm text-gray-700">
              Entrada: {terra.entrada.desnivelMm > 0 ? 'sobe' : 'desce'} {(Math.abs(terra.entrada.desnivelMm) / 1000).toLocaleString('pt-BR')} m da calçada ao piso —{' '}
              {terra.entrada.tipo === 'RAMPA' ? `rampa de ${(terra.entrada.comprimentoMm / 1000).toLocaleString('pt-BR')} m` : `escada de ${terra.entrada.degraus} degrau(s) de ${terra.entrada.espelhoMm} mm`}
              {terra.entrada.cabe ? '' : ' (não cabe no recuo de frente)'}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
