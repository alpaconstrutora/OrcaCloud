import React, { useState } from 'react';
import { AlertTriangle, LandPlot, Save, Table2 } from 'lucide-react';
import type { Boundary, BoundaryPapel } from '../../utils/blueprintKernel';
import {
  areaEmM2,
  PAPEIS_DE_DIVISA,
  ROTULO_DO_PAPEL,
  type Aproveitamento,
  type Envelope,
  type Recuos,
  type Terreno,
} from '../../utils/blueprintTerreno';
import { CampoEmMetros } from './CamposQueAplicam';

/**
 * Caixa "Terreno" do painel de Ambientes.
 *
 * Duas coisas moram aqui, e elas são de naturezas diferentes:
 *
 *   • O LOTE — área, perímetro e erro de fechamento. Derivado das divisas.
 *   • A DIVISA selecionada — comprimento editável e papel (frente/fundos/
 *     laterais), que é o que alimenta os recuos.
 *
 * Extraído de `BlueprintEditor.tsx` pela mesma razão de
 * `PainelParedeSelecionada`: selecionar divisa exige clique no canvas, opaco em
 * jsdom. Com a caixa isolada, o campo de comprimento fica testável sem simular
 * um clique que jsdom não sabe dar.
 */

const PAPEIS: { valor: BoundaryPapel | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Sem papel' },
  ...PAPEIS_DE_DIVISA.map((p) => ({ valor: p, rotulo: ROTULO_DO_PAPEL[p] })),
];

/** Lê "3,5" ou vazio como número não negativo. `null` se não for número. */
function lerNaoNegativo(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return 0;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

/** Fração para porcentagem com uma casa: 0,4567 → "45,7%". */
function pct(fracao: number): string {
  return `${(fracao * 100).toFixed(1).replace('.', ',')}%`;
}

/**
 * Um indicador com o limite da zona ao lado, DIGITADO.
 *
 * O limite não vem da base regulatória de propósito: o produto tem duas, com
 * tipos incompatíveis (`plant_urban_rulesets` em NUMERIC, `regulatory_map_zones`
 * em TEXT livre, que aceita "N.A."), e uma delas tem a DDL em
 * `migrations_pending_review/`. Digitar destrava a conferência hoje; a ligação
 * entra quando essa bagunça for resolvida.
 *
 * Sem limite informado não se pinta nada de vermelho — afirmar que estourou um
 * limite que ninguém informou é pior do que não afirmar nada.
 */
function Indicador({
  rotulo,
  valor,
  limite,
  atual,
  sufixo,
  aoMudarLimite,
  ariaLabel,
}: {
  rotulo: string;
  valor: string;
  limite: number | null;
  atual: number;
  sufixo: string;
  aoMudarLimite: (v: number | null) => void;
  ariaLabel: string;
}) {
  const estourou = limite !== null && atual > limite;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-600">{rotulo}</span>
      <span className="flex items-center gap-1.5">
        <strong className={estourou ? 'text-red-700' : 'text-slate-800'}>{valor}</strong>
        <span className="text-slate-400">/</span>
        <input
          type="text"
          inputMode="decimal"
          defaultValue={limite === null ? '' : String(limite).replace('.', ',')}
          placeholder="limite"
          aria-label={ariaLabel}
          onBlur={(e) => {
            const t = e.target.value.trim().replace(',', '.');
            const n = Number(t);
            aoMudarLimite(t === '' || !Number.isFinite(n) ? null : n);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
        />
        {sufixo && <span className="text-slate-500">{sufixo}</span>}
      </span>
    </div>
  );
}

interface Props {
  /** O lote medido. `null` quando não há divisa de terreno desenhada. */
  terreno: Terreno | null;
  /** A divisa sozinha na seleção, ou `null`. */
  divisaSelecionada: Boundary | null;
  onComprimento: (mm: number) => void;
  onPapel: (papel: BoundaryPapel | null) => void;
  /** Recuos em MILÍMETRO, por papel. */
  recuos: Recuos;
  onRecuo: (papel: BoundaryPapel, mm: number) => void;
  envelope: Envelope | null;
  aproveitamento: Aproveitamento | null;
  /** Limites da zona, digitados. `null` = não informado, e aí não se compara. */
  taxaOcupacaoMax: number | null;
  coeficienteMax: number | null;
  onTaxaOcupacaoMax: (v: number | null) => void;
  onCoeficienteMax: (v: number | null) => void;
  /**
   * Empreendimentos onde a área pode ser gravada.
   *
   * ⚠️ Lista, e não um id inferido. `blueprint_studies` não tem FK para
   * empreendimento — o caminho existe (`study.project_id` ↔
   * `empreendimentos.project_id`), mas é indireto e pode apontar para vários.
   * Gravar área de terreno no empreendimento errado é o tipo de erro que ninguém
   * descobre até a hora do memorial de incorporação.
   */
  empreendimentos: { id: string; nome: string; areaAtualM2: number | null }[];
  /** Id sugerido pela obra do estudo. Vem PRÉ-SELECIONADO, nunca gravado sozinho. */
  empreendimentoSugerido: string | null;
  onGravarArea: (empreendimentoId: string) => void;
  gravando?: boolean;
  /** Falha da última gravação. Aparece onde a ação foi pedida, não no topo. */
  erro?: string | null;
  /** Abre o quadro de divisas — papéis, medidas da escritura e confrontantes. */
  onAbrirQuadro: () => void;
  /** Quantos lados do lote ainda não têm papel. */
  ladosSemPapel: number;
  /** Quantos lados divergem da medida da escritura além da tolerância. */
  ladosDivergentes: number;
}

export default function PainelTerreno({
  terreno,
  divisaSelecionada,
  onComprimento,
  onPapel,
  recuos,
  onRecuo,
  envelope,
  aproveitamento,
  taxaOcupacaoMax,
  coeficienteMax,
  onTaxaOcupacaoMax,
  onCoeficienteMax,
  empreendimentos,
  empreendimentoSugerido,
  onGravarArea,
  gravando = false,
  erro = null,
  onAbrirQuadro,
  ladosSemPapel,
  ladosDivergentes,
}: Props) {
  const [alvo, setAlvo] = useState<string>('');
  const escolhido = alvo || empreendimentoSugerido || '';
  const empSelecionado = empreendimentos.find((e) => e.id === escolhido) ?? null;
  if (!terreno && !divisaSelecionada) return null;

  const comprimentoMm = divisaSelecionada
    ? Math.round(
        Math.hypot(
          divisaSelecionada.b.x - divisaSelecionada.a.x,
          divisaSelecionada.b.y - divisaSelecionada.a.y,
        ),
      )
    : 0;

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <LandPlot className="h-3.5 w-3.5" />
        Terreno
      </h3>

      {terreno ? (
        <>
          <p className="mt-1 text-xs text-slate-600">
            {/* A área do LOTE, não a do ambiente derivado: ambiente desconta o
                que foi construído dentro e daria a área do quintal. */}
            <strong className="text-slate-800">
              {areaEmM2(terreno).toFixed(2).replace('.', ',')} m²
            </strong>{' '}
            · perímetro {(terreno.perimetroMm / 1000).toFixed(2).replace('.', ',')} m ·{' '}
            {terreno.anel.length} lado{terreno.anel.length === 1 ? '' : 's'}
          </p>

          {!terreno.fechado && (
            // Erro de fechamento é informação de levantamento, não erro de
            // software: os lados medidos em campo nunca voltam exatamente ao
            // ponto de partida. Esconder é esconder erro de medida — a área
            // sairia de um polígono que o sistema fechou sozinho.
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Contorno aberto</strong> — erro de fechamento de{' '}
                {terreno.erroFechamentoMm} mm. A área acima veio de fechar o contorno em
                linha reta; enquanto ele não fechar, ela é uma estimativa.
              </span>
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Nenhuma divisa de terreno desenhada. Use a ferramenta <strong>Terreno</strong> na
          barra.
        </p>
      )}

      {terreno && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          {/* O quadro é onde os papéis são definidos de uma vez, a partir da
              frente. O select de papel lá embaixo continua existindo para o
              ajuste de um lado só, com a divisa já selecionada no desenho. */}
          {/* Uma linha só: a coluna do painel tem 320px, e o texto de apoio ao
              lado do rótulo quebrava o botão em duas linhas. O que ele abre já
              está dito no subtítulo do próprio quadro. */}
          <button
            type="button"
            onClick={onAbrirQuadro}
            className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Table2 className="h-3.5 w-3.5 shrink-0" />
            Quadro de divisas
          </button>

          {ladosSemPapel > 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              {ladosSemPapel} lado{ladosSemPapel === 1 ? '' : 's'} sem papel — recuo não se aplica a{' '}
              {ladosSemPapel === 1 ? 'ele' : 'eles'}.
            </p>
          )}
          {ladosDivergentes > 0 && (
            <p className="mt-1.5 text-xs text-amber-700">
              {ladosDivergentes} lado{ladosDivergentes === 1 ? '' : 's'} diverge
              {ladosDivergentes === 1 ? '' : 'm'} da escritura.
            </p>
          )}
        </div>
      )}

      {terreno && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">Recuos</p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {PAPEIS_DE_DIVISA.map((papel) => (
              <label
                key={papel}
                className="flex items-center justify-between gap-1.5 text-xs text-slate-600"
              >
                {ROTULO_DO_PAPEL[papel]}
                <span className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={(recuos[papel] / 1000).toFixed(2).replace('.', ',')}
                    aria-label={`Recuo de ${ROTULO_DO_PAPEL[papel].toLowerCase()} em metros`}
                    onBlur={(e) => {
                      const m = lerNaoNegativo(e.target.value);
                      if (m !== null) onRecuo(papel, Math.round(m * 1000));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="w-14 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800"
                  />
                  m
                </span>
              </label>
            ))}
          </div>

          {/* Divisa sem papel não recua — recuo inventado é pior que recuo
              faltando, porque parece conferido. */}
          <p className="mt-1.5 text-xs text-slate-500">
            Só recua a divisa que tem papel. Selecione um lado e escolha o dele abaixo.
          </p>

          {envelope &&
            (envelope.valido ? (
              envelope.areaMm2 < terreno.areaMm2 && (
                <p className="mt-2 text-xs text-slate-600">
                  Área construtível{' '}
                  <strong className="text-slate-800">
                    {(envelope.areaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m²
                  </strong>{' '}
                  depois dos recuos.
                </p>
              )
            ) : (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Os recuos não cabem neste lote</strong> — os lados se cruzam e não
                  sobra área construtível.
                </span>
              </p>
            ))}
        </div>
      )}

      {terreno && terreno.fechado && empreendimentos.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">Gravar no empreendimento</p>

          {/* Só com o contorno FECHADO. Área de contorno aberto veio de fechar em
              reta, é estimativa — e estimativa não pode virar o número oficial
              do terreno na ficha do empreendimento. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select
              value={escolhido}
              onChange={(e) => setAlvo(e.target.value)}
              aria-label="Empreendimento onde gravar a área do terreno"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
            >
              <option value="">Escolha o empreendimento…</option>
              {empreendimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                  {e.id === empreendimentoSugerido ? ' (obra deste estudo)' : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!escolhido || gravando}
              onClick={() => escolhido && onGravarArea(escolhido)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {gravando ? 'Gravando…' : 'Gravar área'}
            </button>
          </div>

          {erro && (
            <p className="mt-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              Não deu para gravar: {erro}
            </p>
          )}

          {empSelecionado && (
            <p className="mt-1.5 text-xs text-slate-500">
              {empSelecionado.areaAtualM2 === null || empSelecionado.areaAtualM2 === undefined
                ? 'Sem área de terreno registrada hoje.'
                : `Hoje: ${empSelecionado.areaAtualM2.toFixed(2).replace('.', ',')} m² — será substituída.`}
            </p>
          )}
        </div>
      )}

      {aproveitamento && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">Aproveitamento</p>

          <div className="mt-1.5 space-y-1.5">
            <Indicador
              rotulo="Taxa de ocupação"
              valor={pct(aproveitamento.taxaOcupacao)}
              limite={taxaOcupacaoMax}
              atual={aproveitamento.taxaOcupacao * 100}
              sufixo="%"
              aoMudarLimite={onTaxaOcupacaoMax}
              ariaLabel="Taxa de ocupação máxima da zona, em porcentagem"
            />
            <Indicador
              rotulo="Coeficiente"
              valor={aproveitamento.coeficienteAproveitamento.toFixed(2).replace('.', ',')}
              limite={coeficienteMax}
              atual={aproveitamento.coeficienteAproveitamento}
              sufixo=""
              aoMudarLimite={onCoeficienteMax}
              ariaLabel="Coeficiente de aproveitamento máximo da zona"
            />
          </div>

          {/* Enquanto o editor trabalha UM nível, projeção e área total são o
              mesmo número. Dizer isso é melhor que deixar parecer que o
              coeficiente já soma pavimentos. */}
          <p className="mt-1.5 text-xs text-slate-500">
            Um nível desenhado: o coeficiente ainda não soma pavimentos.
          </p>
        </div>
      )}

      {divisaSelecionada && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">
            {divisaSelecionada.kind === 'TERRENO' ? 'Divisa do lote' : 'Limite solto'}{' '}
            selecionado
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Comprimento
              <CampoEmMetros
                valorMm={comprimentoMm}
                // Remonta o input quando o valor muda POR FORA (trocou a seleção,
                // ou o arraste no canvas mudou a medida). Sem isso, o campo não
                // controlado ficaria exibindo o número velho.
                chave={`${divisaSelecionada.id}-${comprimentoMm}`}
                ariaLabel="Comprimento da divisa em metros"
                aoAplicar={(mm) => mm !== null && onComprimento(mm)}
              />
              m
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Papel
              <select
                value={divisaSelecionada.papel ?? ''}
                onChange={(e) => onPapel((e.target.value || null) as BoundaryPapel | null)}
                aria-label="Papel da divisa no lote"
                title="Qual recuo se aplica a esta divisa. Frente, fundos e laterais são medidas diferentes, e qual é qual não dá para inferir do desenho — a frente é a que dá para a rua."
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
              >
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Mudar o comprimento arrasta junto a divisa vizinha que compartilha o vértice —
            senão o canto abre e o lote deixa de fechar.
          </p>
        </div>
      )}
    </div>
  );
}
