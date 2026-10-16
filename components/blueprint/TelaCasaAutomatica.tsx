/**
 * TELA "Casa automática" (F10 da casa automática, 15/10/2026): o programa curto e as hipóteses do estudo, o botão
 * que gera a PRÉVIA da casa inteira num Web Worker (a etapa em curso aparece), o resumo (área, índices da lei,
 * custo pelo CUB), as etapas com a situação de cada uma, o relatório de pendências por grupo e as duas saídas:
 * "Lançar no pavimento" (um lote, um Ctrl+Z — com a trava `conferirPlanoDaCasa` antes) e "Criar alternativa" (um
 * ramo novo com a casa, o desenho atual intacto). Molde: `TelaGerador` (tela in-flow do editor) e
 * `PainelGeradorPpci` (etapas e relatório).
 */
import React, { useEffect, useState } from 'react';
import { Home, ListChecks, Play, SlidersHorizontal, Square, Wand2 } from 'lucide-react';

import Button from '../ui/Button';
import { SecaoTitulo } from '../ui/SecaoTitulo';
import { ROTULO_DA_PENDENCIA, type GrupoDaPendencia, type SituacaoDaEtapa } from '../../utils/blueprintGeradorPpci';
import { PADROES_DA_CASA, ROTULO_DO_PADRAO_DA_CASA, type PadraoDaCasa } from '../../utils/blueprintPrograma';
import { PREMISSAS_DA_CASA_PADRAO, type PremissasDaCasa } from '../../utils/blueprintPremissasDaCasa';
import type { EstadoDaCasaAutomatica } from '../../hooks/useCasaAutomatica';

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
  onPreencherPelaUnidade: (id: string) => void;
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

export default function TelaCasaAutomatica(props: Props) {
  const { casa, premissas: p, onPremissas, prova, cub } = props;
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<GrupoDaPendencia | null>('VERIFICACAO');
  const plano = casa.plano;
  const set = <K extends keyof PremissasDaCasa>(k: K, v: Partial<PremissasDaCasa[K]>) =>
    onPremissas({ ...p, [k]: typeof v === 'object' && v !== null ? { ...(p[k] as object), ...(v as object) } : v } as PremissasDaCasa);

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

  return (
    <div className="space-y-6" data-testid="tela-casa">
      {/* ── Premissas: um formulário, um card, seções com título (§30) ── */}
      <div className="space-y-8 rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm" data-testid="premissas-da-casa">
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
          {props.unidades.length > 0 && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Campo rotulo="Preencher pela unidade do Empreendimento">
                <select aria-label="Preencher pela unidade do Empreendimento" className={campoCls} value="" onChange={(e) => e.target.value && props.onPreencherPelaUnidade(e.target.value)}>
                  <option value="">Escolha a unidade…</option>
                  {props.unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo rotulo="Pavimentos">
              <select aria-label="Pavimentos" className={campoCls} value={p.pavimentos} onChange={(e) => onPremissas({ ...p, pavimentos: e.target.value === '2' ? 2 : 1 })} data-testid="pavimentos-da-casa">
                <option value={1}>Térrea</option>
                <option value={2}>Sobrado (2 pavimentos)</option>
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
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={p.curto.garagemCoberta} onChange={(e) => set('curto', { garagemCoberta: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              Garagem coberta
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <SecaoTitulo icon={ListChecks} titulo="O que a casa leva" resumo="a arquitetura vai sempre; o resto, como marcado" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {DISCIPLINAS.map((d) => (
              <label key={d.chave} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={p.disciplinas[d.chave]} onChange={(e) => set('disciplinas', { [d.chave]: e.target.checked } as Partial<PremissasDaCasa['disciplinas']>)} className="h-4 w-4 rounded border-gray-300" aria-label={d.rotulo} />
                {d.rotulo}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <SecaoTitulo icon={SlidersHorizontal} titulo="Hipóteses" resumo="telhado, implantação e instalações — o resto segue as premissas de cada disciplina" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Campo rotulo="Telhado">
              <select aria-label="Tipo de telhado" className={campoCls} value={p.telhado.tipo} onChange={(e) => set('telhado', { tipo: e.target.value as PremissasDaCasa['telhado']['tipo'] })}>
                <option value="DUAS_AGUAS">Duas águas</option>
                <option value="UMA_AGUA">Uma água</option>
              </select>
            </Campo>
            <Numero rotulo="Inclinação do telhado (%)" valor={p.telhado.inclinacaoPct} min={5} max={100} onValor={(v) => v != null && set('telhado', { inclinacaoPct: v })} />
            <Numero rotulo="Beiral (m)" valor={p.telhado.beiralMm / 1000} min={0} max={1.5} passo={0.1} onValor={(v) => v != null && set('telhado', { beiralMm: Math.round(v * 1000) })} />
            <Numero rotulo="Folga abaixo da TO (%)" valor={p.implantacao.folgaDaTOPct} min={0} max={50} onValor={(v) => v != null && set('implantacao', { folgaDaTOPct: v })} />
            <Campo rotulo="Encostar na divisa">
              <select aria-label="Encostar na divisa" className={campoCls} value={p.implantacao.encostarNaDivisa} onChange={(e) => set('implantacao', { encostarNaDivisa: e.target.value as PremissasDaCasa['implantacao']['encostarNaDivisa'] })}>
                <option value="ESQUERDA">Esquerda</option>
                <option value="DIREITA">Direita</option>
                <option value="CENTRO">No centro</option>
              </select>
            </Campo>
            <Campo rotulo="Água quente">
              <select aria-label="Água quente" className={campoCls} value={p.ancoras.aguaQuente} onChange={(e) => set('ancoras', { aguaQuente: e.target.value as PremissasDaCasa['ancoras']['aguaQuente'] })}>
                <option value="PELO_PADRAO">Pelo padrão (R1-B: chuveiro elétrico)</option>
                <option value="AQUECEDOR_PASSAGEM">Aquecedor de passagem</option>
                <option value="CHUVEIRO_ELETRICO">Chuveiro elétrico</option>
                <option value="NENHUM">Sem água quente</option>
              </select>
            </Campo>
            <Numero rotulo="Chuveiro elétrico (W)" valor={p.eletrica.chuveiroEletricoVA} min={2000} max={9000} passo={100} onValor={(v) => v != null && set('eletrica', { chuveiroEletricoVA: Math.round(v) })} />
            <Numero rotulo="Alternativas tentadas" valor={p.sementes} min={1} max={8} onValor={(v) => v != null && onPremissas({ ...p, sementes: Math.round(v) })} />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={p.ancoras.caixaDeGordura} onChange={(e) => set('ancoras', { caixaDeGordura: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              Caixa de gordura
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={p.eletrica.medidor} onChange={(e) => set('eletrica', { medidor: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              Medidor na frente do lote
            </label>
            <Numero rotulo="Elevar a caixa d'água até (m)" valor={p.pressao.caixaElevadaAteMm / 1000} min={0} max={15} passo={0.5} onValor={(v) => v != null && set('pressao', { caixaElevadaAteMm: Math.round(v * 1000) })} />
            <Numero rotulo="Pressurizador (W)" valor={p.pressao.potenciaDoPressurizadorW} min={100} max={3000} passo={10} onValor={(v) => v != null && set('pressao', { potenciaDoPressurizadorW: Math.round(v) })} />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={p.forro.lancar} onChange={(e) => set('forro', { lancar: e.target.checked })} className="h-4 w-4 rounded border-gray-300" data-testid="forro-da-casa" />
              Forro com as redes no plenum
            </label>
            {p.forro.lancar && (
              <>
                <Numero rotulo="Pé-direito livre: sala, dormitório, cozinha (m)" valor={p.forro.peDireitoLivrePermanenciaMm / 1000} min={2.2} max={3.5} passo={0.05} onValor={(v) => v != null && set('forro', { peDireitoLivrePermanenciaMm: Math.round(v * 1000) })} />
                <Numero rotulo="Pé-direito livre: banheiro, serviço, circulação (m)" valor={p.forro.peDireitoLivreDemaisMm / 1000} min={2.1} max={3.5} passo={0.05} onValor={(v) => v != null && set('forro', { peDireitoLivreDemaisMm: Math.round(v * 1000) })} />
                <Numero rotulo="Piso acabado (cm)" valor={p.forro.pisoAcabadoMm / 10} min={0} max={15} passo={0.5} onValor={(v) => v != null && set('forro', { pisoAcabadoMm: Math.round(v * 10) })} />
              </>
            )}
            {p.pavimentos === 2 && (
              <>
                <Numero rotulo="Laje entre os pavimentos (cm)" valor={p.sobrado.lajeEntrePavimentosMm / 10} min={8} max={30} onValor={(v) => v != null && set('sobrado', { lajeEntrePavimentosMm: Math.round(v * 10) })} />
                <Numero rotulo="Shaft das instalações (cm)" valor={p.sobrado.shaftMm / 10} min={20} max={80} passo={5} onValor={(v) => v != null && set('sobrado', { shaftMm: Math.round(v * 10) })} />
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── A prévia: o estado e as ações dela (card próprio, §30) ── */}
      <div className="space-y-6 rounded-[10px] border border-gray-100 bg-white p-6 shadow-sm" data-testid="previa-da-casa">
        <SecaoTitulo
          icon={Wand2}
          titulo="Prévia"
          resumo={plano ? `${plano.comandos.length} comando(s) num lote só` : 'nada gerado ainda'}
          acoes={
            casa.rodando ? (
              <Button variant="secondary" onClick={casa.cancelar} data-testid="parar-casa" className="border-red-200 text-red-700 hover:bg-red-50">
                <Square className="h-4 w-4" /> Parar
              </Button>
            ) : (
              <Button onClick={props.onGerar} disabled={!!props.motivoParaNaoGerar} title={props.motivoParaNaoGerar ?? undefined} data-testid="gerar-casa">
                <Play className="h-4 w-4" /> {plano ? 'Gerar a prévia de novo' : 'Gerar prévia'}
              </Button>
            )
          }
        />
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

        {plano && (
          <>
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
                  <dt className={rotuloCls}>Sobrado</dt>
                  <dd className="text-sm text-gray-900 tabular-nums">
                    escada em U, {plano.sobrado.escada.degraus} degraus de {plano.sobrado.escada.espelhoMm} × {plano.sobrado.escada.pisoMm} mm
                  </dd>
                  <dd className="text-xs text-slate-500">núcleo à {plano.sobrado.nucleo.lado === 'DIREITA' ? 'direita' : 'esquerda'}</dd>
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

            {/* Quando o gerador PARA numa premissa, o porquê em destaque (a lição do PPCI, 10/10/2026). */}
            {plano.etapas.some((e) => e.situacao === 'NAO_RODOU') && plano.pendencias.some((x) => x.grupo === 'PREMISSA') && (
              <div className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="casa-parou">
                <p className="font-medium">Faltam premissas para algumas etapas:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {plano.pendencias
                    .filter((x) => x.grupo === 'PREMISSA')
                    .map((x, i) => (
                      <li key={i} className="break-words">
                        {x.texto}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="space-y-2">
                <h4 className={rotuloCls}>Etapas</h4>
                <ul className="divide-y divide-gray-100" data-testid="etapas-da-casa">
                  {plano.etapas.map((e) => (
                    <li key={e.id} className="py-1.5 text-sm">
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
              <section className="space-y-2" data-testid="pendencias-da-casa">
                <h4 className={rotuloCls}>Relatório ({plano.pendencias.length})</h4>
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
                            <li key={i} className={`break-words text-xs ${grupo === 'VERIFICACAO' || grupo === 'SEM_SOLUCAO' || grupo === 'CONFLITO' ? 'text-red-700' : 'text-slate-600'}`}>
                              {x.texto}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {!plano.pendencias.some((x) => x.grupo === 'VERIFICACAO') && !plano.etapas.some((e) => e.situacao === 'NAO_RODOU') && (
                  <p className="text-xs text-emerald-700">Nenhuma verificação em falta no resultado.</p>
                )}
              </section>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              {(motivoDeLancar || motivoDeCriar) && plano.comandos.length > 0 && <p className="mr-auto text-xs text-amber-700">{motivoDeLancar ?? motivoDeCriar}</p>}
              <Button variant="secondary" onClick={() => agir('criar', props.onCriarAlternativa)} disabled={!!motivoDeCriar} title={motivoDeCriar} data-testid="criar-alternativa-casa">
                {ocupado === 'criar' ? 'Criando…' : 'Criar alternativa com a casa'}
              </Button>
              <Button onClick={() => agir('lancar', props.onLancar)} disabled={!!motivoDeLancar} title={motivoDeLancar} data-testid="lancar-casa">
                {ocupado === 'lancar' ? 'Lançando…' : plano.sobrado ? 'Lançar os dois pavimentos' : 'Lançar no pavimento'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
