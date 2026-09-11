import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Mountain, Plus, Sparkles } from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { Topografia } from '../../hooks/useBlueprintTopografia';
import type { CodigoDaFonte } from '../../utils/blueprintElevacaoProvedores';
import { ALGORITMO_TOPOGRAFIA, type QualidadeDaGrade } from '../../utils/blueprintTopografia';
import {
  FAIXAS_DE_DECLIVIDADE,
  type Declividade,
  type Terraplenagem as ResultadoDaTerraplenagem,
} from '../../utils/blueprintTopografiaAnalises';
import { avisoDaClasse } from '../../utils/blueprintTopografiaExport';

/** O que o painel precisa para a seção "Corte e aterro" (fase 2). */
export interface TerraplenagemNoPainel {
  base: 'ENVELOPE' | 'LOTE';
  onBase: (b: 'ENVELOPE' | 'LOTE') => void;
  /** Há envelope válido (recuos que cabem)? Sem ele, ENVELOPE cai no lote. */
  temEnvelope: boolean;
  /** `null` = usando a cota de equilíbrio. */
  cotaPlatoM: number | null;
  onCotaPlatoM: (v: number | null) => void;
  cotaDeEquilibrioM: number | null;
  resultado: ResultadoDaTerraplenagem | null;
  persistenciaIndisponivel: boolean;
}

/**
 * Seção "Curvas de nível" do painel do Terreno.
 *
 * Entra em `PainelTerreno` por slot (`topografiaSlot`), como a zona urbanística:
 * o editor monta o hook e este componente só apresenta. É a mesma caixa
 * `bg-slate-50` do terreno, então os controles seguem o vocabulário de lá
 * (`CampoNumero`, botões `rounded-md border-slate-300`, toggle de dois
 * botões do `PainelZonaUrbanistica`).
 *
 * ─── O QUE A TELA NÃO PODE ESCONDER ─────────────────────────────────────────
 *
 * RF-020 / CA-011: toda versão mostra a classe e o aviso — "preliminar, dado
 * remoto" ou "levantamento digitado, pendente de validação". E a proveniência
 * (fonte, dataset, resolução, referência vertical, algoritmo, hash) fica
 * visível, não atrás de um clique: é o que separa uma curva de nível de um
 * desenho bonito.
 */
export default function PainelTopografia({
  topografia,
  temLoteFechado,
  temGeorreferencia,
  cotaDeOrigemInformada = true,
  declividade = null,
  terraplenagem = null,
  curvaSelecionada = null,
  onLimparCurva,
}: {
  topografia: Topografia;
  temLoteFechado: boolean;
  temGeorreferencia: boolean;
  /** "Cota do terreno" de "Onde fica" preenchida — ancora o corte e o 3D. */
  cotaDeOrigemInformada?: boolean;
  /** Declividade da versão exibida (fase 2). */
  declividade?: Declividade | null;
  terraplenagem?: TerraplenagemNoPainel | null;
  /** A curva clicada na planta. */
  curvaSelecionada?: { cotaM: number; comprimentoM: number; mestra: boolean } | null;
  onLimparCurva?: () => void;
}) {
  const t = topografia;
  const confirmar = useConfirm();

  const apagar = async (id: string, versao: number) => {
    const ok = await confirmar({
      title: `Apagar a versão v${versao}?`,
      message: 'A versão não pode ser editada — apagar é a única forma de removê-la. As outras versões ficam.',
      variant: 'danger',
      confirmLabel: 'Apagar',
    });
    if (!ok) return;
    await t.apagarVersao(id);
  };

  return (
    <div className="mt-3 border-t border-slate-200 pt-3" data-testid="painel-topografia">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
          <Mountain className="h-3.5 w-3.5" />
          Curvas de nível
        </p>
        {t.versoes.length > 0 && (
          <span className="text-[11px] text-slate-400">
            {t.versoes.length} {t.versoes.length === 1 ? 'versão' : 'versões'}
          </span>
        )}
      </div>

      {t.persistenciaIndisponivel && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            As versões não estão sendo gravadas (tabela de topografia ainda não aplicada). O
            que você gerar aparece agora e some ao recarregar.
          </span>
        </p>
      )}

      {!temLoteFechado ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Feche o contorno do lote para gerar curvas de nível.
        </p>
      ) : (
        <>
          {/* Fonte — dois botões, como a origem da zona: são só duas e a diferença
              entre elas é o que decide se o resultado é levantamento ou DEM. */}
          <div className="mt-1.5 flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {t.fontes.map((f) => (
              <button
                key={f.codigo}
                type="button"
                aria-pressed={t.fonteCodigo === f.codigo}
                onClick={() => t.setFonteCodigo(f.codigo as CodigoDaFonte)}
                title={f.descricao}
                className={`flex-1 rounded-[4px] px-2 py-1 text-xs font-medium transition-all ${
                  t.fonteCodigo === f.codigo
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {f.tipo === 'LOCAL' ? 'Pontos cotados' : 'DEM público'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{t.fonte.descricao}</p>

          {t.fonte.tipo === 'LOCAL' ? (
            <PontosCotados topografia={t} />
          ) : (
            <div className="mt-1.5 space-y-1 text-xs text-slate-600">
              <p>
                {t.fonte.nome} · célula de {t.fonte.resolucaoNominalM} m · referência vertical:{' '}
                {t.fonte.referenciaVertical ?? 'não informada'}.
              </p>
              {!temGeorreferencia && (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Esta fonte precisa da latitude e longitude do lote — informe em{' '}
                    <strong className="font-semibold">Onde fica</strong>, acima.
                  </span>
                </p>
              )}
              <p className="text-slate-500">{t.fonte.licenca}</p>
            </div>
          )}

          <div className="mt-2 space-y-1">
            <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="shrink-0">Equidistância</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.25"
                  min="0.05"
                  value={t.equidistanciaM ?? ''}
                  placeholder={t.sugestaoEquidistanciaM !== null ? formatar(t.sugestaoEquidistanciaM) : 'auto'}
                  aria-label="Equidistância entre curvas (m)"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    t.setEquidistanciaM(v === '' ? null : Number(v));
                  }}
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800"
                />
                <span className="w-6 text-slate-400">m</span>
              </span>
            </label>
            {t.equidistanciaM === null && t.sugestaoEquidistanciaM !== null && (
              <p className="text-[11px] text-slate-500">
                Vazio usa a sugestão pela amplitude: {formatar(t.sugestaoEquidistanciaM)} m.
              </p>
            )}
            <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="shrink-0">Grade</span>
              <span className="flex items-center gap-1">
                <select
                  value={t.qualidade}
                  onChange={(e) => t.setQualidade(e.target.value as QualidadeDaGrade)}
                  aria-label="Densidade da grade de amostragem"
                  className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
                >
                  <option value="RAPIDA">Rápida</option>
                  <option value="EQUILIBRADA">Equilibrada</option>
                  <option value="DETALHADA">Detalhada</option>
                </select>
                <span className="w-6" />
              </span>
            </label>
          </div>

          <button
            type="button"
            disabled={t.gerando}
            onClick={() => void t.gerar()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t.gerando ? 'Gerando…' : t.versoes.length > 0 ? 'Gerar nova versão' : 'Gerar curvas'}
          </button>

          {t.erro && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t.erro}</span>
            </p>
          )}
        </>
      )}

      {t.selecionada && (
        <Resultado topografia={t} onApagar={apagar} cotaDeOrigemInformada={cotaDeOrigemInformada} />
      )}

      {t.selecionada && curvaSelecionada && (
        <div
          className="mt-2 flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-800"
          data-testid="topografia-curva-selecionada"
        >
          <span>
            Curva {curvaSelecionada.mestra ? 'mestra ' : ''}
            <strong className="font-semibold">{formatar(curvaSelecionada.cotaM)} m</strong> ·{' '}
            {formatar(curvaSelecionada.comprimentoM, 1)} m de comprimento
          </span>
          {onLimparCurva && (
            <button
              type="button"
              onClick={onLimparCurva}
              className="text-[11px] text-blue-700 transition-colors hover:text-blue-900"
            >
              Limpar
            </button>
          )}
        </div>
      )}

      {t.selecionada && declividade && <SecaoDeclividade declividade={declividade} />}

      {t.selecionada && terraplenagem && <SecaoTerraplenagem t={terraplenagem} />}
    </div>
  );
}

const formatar = (v: number, casas = 2) => v.toFixed(casas).replace('.', ',');

/** Os pontos do levantamento, um por linha: X, Y (m do desenho) e cota (m). */
function PontosCotados({ topografia: t }: { topografia: Topografia }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">
          Pontos cotados{t.pontosCotados.length > 0 ? ` (${t.pontosCotados.length})` : ''}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={t.usarVerticesDoLote}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 transition-colors hover:bg-slate-50"
          >
            Usar vértices do lote
          </button>
          <button
            type="button"
            onClick={t.adicionarPonto}
            aria-label="Adicionar ponto cotado"
            title="Adicionar ponto cotado"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white p-1 text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {t.pontosCotados.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-500">
          Nenhum ponto. Use os vértices do lote e digite a cota de cada um, ou adicione os pontos
          do levantamento.
        </p>
      ) : (
        <div className="mt-1.5 space-y-1">
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <span className="w-4" />
            <span className="w-16 text-right">X (m)</span>
            <span className="w-16 text-right">Y (m)</span>
            <span className="w-16 text-right">Cota (m)</span>
          </div>
          {t.pontosCotados.map((p, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-4 text-[11px] text-slate-400">{i + 1}</span>
              <CampoDoPonto
                rotulo={`X do ponto ${i + 1} (m)`}
                valor={p.x / 1000}
                onMudar={(v) => t.alterarPonto(i, { x: Math.round(v * 1000) })}
              />
              <CampoDoPonto
                rotulo={`Y do ponto ${i + 1} (m)`}
                valor={p.y / 1000}
                onMudar={(v) => t.alterarPonto(i, { y: Math.round(v * 1000) })}
              />
              <CampoDoPonto
                rotulo={`Cota do ponto ${i + 1} (m)`}
                valor={p.cotaM}
                onMudar={(v) => t.alterarPonto(i, { cotaM: v })}
              />
              <ActionIconButton
                kind="delete"
                size="sm"
                title="Remover ponto"
                aria-label={`Remover ponto ${i + 1}`}
                onClick={() => t.removerPonto(i)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampoDoPonto({
  rotulo,
  valor,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  onMudar: (v: number) => void;
}) {
  return (
    <input
      type="number"
      step="0.01"
      value={Number.isFinite(valor) ? valor : ''}
      aria-label={rotulo}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onMudar(v);
      }}
      // w-16: "100,60" com o spinner do number cabe em 64 px; em 56 px o
      // último dígito morria atrás do controle — visto no print do harness.
      className="w-16 min-w-0 rounded-md border border-slate-300 px-1.5 py-1 text-right text-xs text-slate-800"
    />
  );
}

/** A versão selecionada: estatísticas, proveniência, aviso e exportação. */
function Resultado({
  topografia: t,
  onApagar,
  cotaDeOrigemInformada,
}: {
  topografia: Topografia;
  onApagar: (id: string, versao: number) => void;
  cotaDeOrigemInformada: boolean;
}) {
  const v = t.selecionada!;
  const est = v.estatisticas;
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(timer);
  }, [copiado]);

  const copiarHash = async () => {
    try {
      await navigator.clipboard?.writeText(v.hash_resultado);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const data = new Date(v.created_at);
  const quando = Number.isNaN(data.getTime())
    ? v.created_at
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="mt-3 border-t border-slate-200 pt-3" data-testid="topografia-resultado">
      <div className="flex items-center gap-1.5">
        <select
          value={v.id}
          onChange={(e) => t.selecionar(e.target.value)}
          aria-label="Versão da topografia exibida"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
        >
          {t.versoes.map((x) => (
            <option key={x.id} value={x.id}>
              v{x.versao} · {x.fonte_codigo === 'PONTOS_COTADOS' ? 'pontos cotados' : 'DEM'} ·{' '}
              {new Date(x.created_at).toLocaleDateString('pt-BR')}
            </option>
          ))}
        </select>
        <ActionIconButton
          kind="delete"
          size="sm"
          title="Apagar esta versão"
          aria-label={`Apagar a versão v${v.versao}`}
          onClick={() => onApagar(v.id, v.versao)}
        />
      </div>

      {/* Rótulo em cima, valor embaixo: rótulo e valor na mesma linha, em duas
          colunas, quebram "Amplitude 12,50 m" no meio (achado do quadro de
          divisas, 21/08). */}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        <Medida rotulo="Cota mínima" valor={`${formatar(est.cotaMinM)} m`} />
        <Medida rotulo="Cota máxima" valor={`${formatar(est.cotaMaxM)} m`} />
        <Medida rotulo="Cota média" valor={`${formatar(est.cotaMediaM)} m`} />
        <Medida rotulo="Amplitude" valor={`${formatar(est.amplitudeM)} m`} />
        <Medida rotulo="Curvas" valor={`${est.curvas} a cada ${formatar(v.equidistancia_m)} m`} />
        <Medida rotulo="Grade" valor={`${formatar(est.espacamentoM)} m`} />
        <Medida
          rotulo="Amostras no lote"
          valor={`${est.amostrasValidas}${est.amostrasAusentes > 0 ? ` (+${est.amostrasAusentes} sem cota)` : ''}`}
        />
        <Medida rotulo="Área analisada" valor={`${formatar(est.areaM2)} m²`} />
      </dl>

      {!cotaDeOrigemInformada && (
        <p className="mt-2 text-[11px] text-slate-500">
          No corte e no 3D, o zero do desenho está na cota média ({formatar(est.cotaMediaM)} m).
          Para ancorar de verdade, informe a <strong className="font-semibold">Cota do terreno</strong>{' '}
          em "Onde fica".
        </p>
      )}

      {v.avisos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {v.avisos.map((a, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
        <p>
          <span className="font-semibold text-slate-600">Fonte</span> {v.fonte_nome}
          {v.dataset_versao ? ` · ${v.dataset_versao}` : ''}
        </p>
        <p>
          <span className="font-semibold text-slate-600">Resolução nominal</span>{' '}
          {v.resolucao_fonte_m ? `${v.resolucao_fonte_m} m` : 'a do levantamento'} ·{' '}
          <span className="font-semibold text-slate-600">Ref. vertical</span>{' '}
          {v.referencia_vertical ?? 'não informada'}
        </p>
        <p>
          <span className="font-semibold text-slate-600">Gerado</span> {quando} ·{' '}
          <span className="font-semibold text-slate-600">Algoritmo</span> {v.algoritmo_nome}@
          {v.algoritmo_versao || ALGORITMO_TOPOGRAFIA.versao}
        </p>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600">Hash</span>
          <span className="font-mono text-[10px] text-slate-400" title={v.hash_resultado}>
            {v.hash_resultado.slice(0, 12)}
          </span>
          <ActionIconButton
            kind="duplicate"
            size="sm"
            title={copiado ? 'Copiado' : 'Copiar hash completo'}
            aria-label="Copiar hash completo"
            icon={
              copiado ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )
            }
            onClick={copiarHash}
          />
        </div>
      </div>

      <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong className="font-semibold">
            {v.classe_qualidade === 'PRELIMINAR_REMOTO'
              ? 'Preliminar — dado público remoto.'
              : 'Levantamento digitado — pendente de validação.'}
          </strong>{' '}
          {avisoDaClasse(v.classe_qualidade)}
        </span>
      </p>

      {/* `flex-wrap`: quatro formatos não cabem em 307 px numa linha só, e sem
          a quebra o rótulo do meio dobrava em três linhas (visto no print). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => t.exportar('svg')}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          SVG
        </button>
        <button
          type="button"
          onClick={() => t.exportar('csv')}
          title="Grade de cotas, um nó por linha"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          type="button"
          onClick={() => t.exportar('dxf')}
          title="Curvas em mm do desenho, camadas TOPO-* — cai sobre o DXF da planta"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          DXF
        </button>
        <button
          type="button"
          disabled={!v.georreferencia}
          onClick={() => t.exportar('kml')}
          title={
            v.georreferencia
              ? 'Curvas em latitude/longitude, para Google Earth e GIS'
              : 'Sem georreferência não há onde pôr o lote no mundo — informe em "Onde fica" e gere de novo.'
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          KML
        </button>
      </div>
    </div>
  );
}

/** Legenda das faixas com a área de cada uma dentro do lote. */
function SecaoDeclividade({ declividade: d }: { declividade: Declividade }) {
  const total = d.areaAnalisadaM2 || 1;
  return (
    <div className="mt-3 border-t border-slate-200 pt-3" data-testid="topografia-declividade">
      <p className="text-xs font-medium text-slate-700">Declividade</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Média {formatar(d.mediaP, 1)} % · máxima {formatar(d.maximaP, 1)} %. Ligue em Exibir ›
        Declividade para ver as faixas na planta.
      </p>
      <ul className="mt-1.5 space-y-1">
        {FAIXAS_DE_DECLIVIDADE.map((f, i) => (
          <li key={f.rotulo} className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-[3px] border border-slate-300"
              style={{ backgroundColor: f.cor }}
              aria-hidden
            />
            <span className="w-14 shrink-0">{f.rotulo}</span>
            <span className="text-slate-800">{formatar(d.areaPorFaixaM2[i])} m²</span>
            <span className="text-slate-400">({formatar((d.areaPorFaixaM2[i] / total) * 100, 0)} %)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Platô: base, cota (com a sugestão de equilíbrio) e os volumes. */
function SecaoTerraplenagem({ t }: { t: TerraplenagemNoPainel }) {
  const r = t.resultado;
  const usandoEquilibrio = t.cotaPlatoM === null;
  return (
    <div className="mt-3 border-t border-slate-200 pt-3" data-testid="topografia-terraplenagem">
      <p className="text-xs font-medium text-slate-700">Corte e aterro (preliminar)</p>

      <div className="mt-1.5 flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
        {(
          [
            ['ENVELOPE', 'No envelope'],
            ['LOTE', 'No lote inteiro'],
          ] as ['ENVELOPE' | 'LOTE', string][]
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            aria-pressed={t.base === valor}
            onClick={() => t.onBase(valor)}
            className={`flex-1 rounded-[4px] px-2 py-1 text-xs font-medium transition-all ${
              t.base === valor ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {t.base === 'ENVELOPE' && !t.temEnvelope && (
        <p className="mt-1 text-[11px] text-amber-700">
          Sem envelope válido (recuos ausentes ou que não cabem): o platô usa o lote inteiro.
        </p>
      )}

      <label className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
        <span className="shrink-0">Cota do platô</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            step="0.05"
            // Ao centímetro: a cota vem digitada, mas pode voltar do banco
            // como numeric longo — e dez casas num campo de 112 px é ruído.
            value={t.cotaPlatoM === null ? '' : Math.round(t.cotaPlatoM * 100) / 100}
            placeholder={t.cotaDeEquilibrioM !== null ? formatar(t.cotaDeEquilibrioM) : '—'}
            aria-label="Cota do platô (m)"
            onChange={(e) => {
              const v = e.target.value.trim();
              t.onCotaPlatoM(v === '' ? null : Number(v));
            }}
            className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800"
          />
          <span className="w-6 text-slate-400">m</span>
        </span>
      </label>
      <p className="mt-1 text-[11px] text-slate-500">
        {usandoEquilibrio
          ? t.cotaDeEquilibrioM !== null
            ? `Vazio usa a cota de equilíbrio (${formatar(t.cotaDeEquilibrioM)} m): corte ≈ aterro.`
            : 'Sem cota conhecida no platô.'
          : t.cotaDeEquilibrioM !== null
            ? `Equilíbrio em ${formatar(t.cotaDeEquilibrioM)} m.`
            : ''}
        {!usandoEquilibrio && t.cotaDeEquilibrioM !== null && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => t.onCotaPlatoM(null)}
              className="text-blue-700 transition-colors hover:text-blue-900"
            >
              Usar o equilíbrio
            </button>
          </>
        )}
      </p>

      {r && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Medida rotulo="Corte" valor={`${formatar(r.corteM3, 1)} m³`} />
          <Medida rotulo="Aterro" valor={`${formatar(r.aterroM3, 1)} m³`} />
          <Medida
            rotulo="Saldo"
            valor={`${r.saldoM3 > 0 ? 'falta ' : r.saldoM3 < 0 ? 'sobra ' : ''}${formatar(Math.abs(r.saldoM3), 1)} m³`}
          />
          <Medida rotulo="Área do platô" valor={`${formatar(r.areaPlatoM2)} m²`} />
          <Medida rotulo="Corte máx." valor={`${formatar(r.alturaMaxCorteM)} m`} />
          <Medida rotulo="Aterro máx." valor={`${formatar(r.alturaMaxAterroM)} m`} />
        </dl>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        Volume geométrico por célula da grade, contra um platô plano: sem talude, empolamento
        nem compactação. Serve à viabilidade; o projeto de terraplenagem exige levantamento
        validado.
      </p>
      {t.persistenciaIndisponivel && (
        <p className="mt-1 text-[11px] text-amber-700">
          A cota do platô não está sendo gravada (tabela ainda não aplicada).
        </p>
      )}
    </div>
  );
}

function Medida({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{rotulo}</dt>
      <dd className="text-xs font-medium text-slate-800">{valor}</dd>
    </div>
  );
}
