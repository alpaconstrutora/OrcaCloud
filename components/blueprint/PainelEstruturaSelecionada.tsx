import React from 'react';
import {
  FORMA_ESTRUTURAL,
  medirEstrutura,
  nomeDoTipoEstrutural,
  prefixoDeRotulo,
  type Structural,
  type StructuralKind,
} from '../../utils/blueprintKernel';
import { CampoMedida } from './PainelParedeSelecionada';
import ControleDeSobreposicao from './ControleDeSobreposicao';
import IdentificadorDoElemento from './IdentificadorDoElemento';

/**
 * Caixa "Estrutura selecionada" do painel lateral.
 *
 * Irmã de `PainelParedeSelecionada`, e extraída pela mesma razão que ela: pegar
 * uma peça exige clique no CANVAS, que é opaco em jsdom. Com a caixa isolada, os
 * campos ficam testáveis sem simular um clique que jsdom não sabe dar.
 *
 * ─── TROCAR DE TIPO SÓ DENTRO DA MESMA FORMA ────────────────────────────────
 *
 * O seletor oferece apenas os tipos que compartilham a `FORMA_ESTRUTURAL` da
 * peça — pilar ↔ estaca ↔ bloco, viga ↔ viga de fundação. Não é limitação de
 * tela: `SetStructuralKind` RECUSA a conversão que mude a forma, porque os
 * `pontos` não sobrevivem (um centro não é um eixo). Oferecer o destino
 * impossível e deixar o kernel recusar seria ensinar o usuário a clicar em algo
 * que nunca funciona.
 */

/**
 * Os tipos que aceitam troca a partir deste. Derivado de `FORMA_ESTRUTURAL`, e
 * não uma lista à mão: um sétimo tipo entra sozinho no grupo certo.
 */
function tiposCompativeis(kind: StructuralKind): StructuralKind[] {
  const forma = FORMA_ESTRUTURAL[kind];
  return (Object.keys(FORMA_ESTRUTURAL) as StructuralKind[]).filter(
    (k) => FORMA_ESTRUTURAL[k] === forma,
  );
}

interface Props {
  estrutura: Structural | null;
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  onMedidas: (campos: {
    larguraMm?: number;
    profundidadeMm?: number;
    alturaMm?: number;
    baseMm?: number;
    circular?: boolean;
    rotulo?: string | null;
  }) => void;
  onTipo: (kind: StructuralKind) => void;
  onExcluir: () => void;
  /** Volume que esta peça divide com outro componente, em m³. `0` = nenhum. */
  sobreposicaoM3?: number;
  onCedeSobreposicao?: (cede: boolean) => void;
  /**
   * Quantas PAREDES esta peça atravessa e que podem ser cortadas. `0` = nenhuma.
   *
   * Existe porque o corte só era oferecido no aviso da CRIAÇÃO — e a planta do
   * usuário já estava desenhada. Peça antiga não tinha caminho nenhum para o
   * corte, e clicar em qualquer lugar da tela não fazia nada (relatado três
   * vezes em 01/09/2026, com print).
   */
  paredesParaCortar?: number;
  onCortarParedes?: () => void;
  /**
   * Quantas paredes esta peça JÁ interrompe. Aparece como estado, não como
   * botão: oferecer "cortar" o que já está cortado é o botão morto que o
   * usuário encontrou em 01/09/2026.
   */
  paredesJaInterrompidas?: number;
  /**
   * Pontas de parede que pararam ANTES da peça — a marca do corte destrutivo
   * que existiu por algumas horas em 01/09/2026. `0` = desenho são.
   */
  pontasCurtas?: number;
  onEmendarPontas?: () => void;
}

export default function PainelEstruturaSelecionada({
  estrutura,
  onMedidas,
  onTipo,
  onExcluir,
  sobreposicaoM3 = 0,
  onCedeSobreposicao,
  paredesParaCortar = 0,
  onCortarParedes,
  paredesJaInterrompidas = 0,
  pontasCurtas = 0,
  onEmendarPontas,
}: Props) {
  if (!estrutura) return null;

  const forma = FORMA_ESTRUTURAL[estrutura.kind];
  const compativeis = tiposCompativeis(estrutura.kind);
  const m = medirEstrutura(estrutura);
  const cm = (mm: number) => (mm / 10).toFixed(0);

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            {estrutura.rotulo
              ? `${estrutura.rotulo} · ${nomeDoTipoEstrutural(estrutura.kind)}`
              : nomeDoTipoEstrutural(estrutura.kind)}
          </h3>
          {/* O volume e a fôrma vêm da MESMA função do quantitativo
              (`medirEstrutura`), não de uma conta local: o número que o painel
              mostra tem de ser o número que vai para o orçamento, senão a
              conferência aqui não prova nada sobre o que foi orçado. */}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {m.volumeMm3 / 1_000_000_000 < 0.01
              ? '< 0,01'
              : (m.volumeMm3 / 1_000_000_000).toFixed(3).replace('.', ',')}{' '}
            m³ de concreto · {(m.areaFormaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m² de fôrma
          </p>
          <IdentificadorDoElemento uid={estrutura.uid} familia="structural" />
        </div>
        <button
          type="button"
          onClick={onExcluir}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          Excluir
        </button>
      </div>

      {compativeis.length > 1 ? (
        <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
          Tipo
          <select
            value={estrutura.kind}
            onChange={(e) => onTipo(e.target.value as StructuralKind)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
            title="Só os tipos com a mesma forma geométrica: converter um pilar em viga inventaria um eixo que ninguém desenhou."
          >
            {compativeis.map((k) => (
              <option key={k} value={k}>
                {nomeDoTipoEstrutural(k)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {forma === 'PONTO' ? (
        <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
          Seção
          <select
            value={estrutura.circular ? 'redonda' : 'retangular'}
            onChange={(e) => onMedidas({ circular: e.target.value === 'redonda' })}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
          >
            <option value="retangular">Retangular</option>
            <option value="redonda">Redonda</option>
          </select>
        </label>
      ) : null}

      {/* As medidas em CENTÍMETRO, não em metro como a parede: seção de concreto
          se lê e se fala em cm ("um vinte por quarenta"), e um campo em metro
          faria digitar 0,20 para dizer 20. O kernel continua em mm inteiro — a
          conversão é só de exibição, e ×10 de cm para mm é exato. */}
      {forma !== 'AREA' ? (
        <CampoMedida
          rotulo={estrutura.circular && forma === 'PONTO' ? 'Diâmetro' : 'Largura'}
          valor={estrutura.larguraMm / 10}
          casas={0}
          sufixo="cm"
          chave={`${estrutura.id}-largura-${estrutura.larguraMm}`}
          aoAplicar={(cmValor) => onMedidas({ larguraMm: Math.round(cmValor * 10) })}
          ariaLabel={`Largura da seção, em centímetros. Agora: ${cm(estrutura.larguraMm)}`}
        />
      ) : null}

      {forma === 'PONTO' && !estrutura.circular ? (
        <CampoMedida
          rotulo="Profundidade"
          valor={estrutura.profundidadeMm / 10}
          casas={0}
          sufixo="cm"
          chave={`${estrutura.id}-prof-${estrutura.profundidadeMm}`}
          aoAplicar={(cmValor) => onMedidas({ profundidadeMm: Math.round(cmValor * 10) })}
          ariaLabel={`Profundidade da seção, em centímetros. Agora: ${cm(estrutura.profundidadeMm)}`}
        />
      ) : null}

      <CampoMedida
        rotulo={forma === 'AREA' ? 'Espessura' : 'Altura'}
        valor={estrutura.alturaMm / 10}
        casas={0}
        sufixo="cm"
        chave={`${estrutura.id}-altura-${estrutura.alturaMm}`}
        aoAplicar={(cmValor) => onMedidas({ alturaMm: Math.round(cmValor * 10) })}
        ariaLabel={`${forma === 'AREA' ? 'Espessura' : 'Altura'}, em centímetros. Agora: ${cm(estrutura.alturaMm)}`}
      />

      {/* A COTA em metro, e não em centímetro como a seção: ela é posição na
          edificação (−1,10 m), e a unidade de posição nesta tela é o metro —
          é a mesma em que o pavimento declara a elevação dele. */}
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Cota
        <input
          type="number"
          step={0.05}
          value={estrutura.baseMm / 1000}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onMedidas({ baseMm: Math.round(n * 1000) });
          }}
          aria-label="Cota da face inferior, em metros a partir do piso do pavimento"
          title="Cota da face INFERIOR, medida do piso do pavimento. Negativa em fundação."
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
        m
      </label>

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Rótulo
        <input
          type="text"
          key={`${estrutura.id}-rotulo`}
          defaultValue={estrutura.rotulo ?? ''}
          placeholder={`${prefixoDeRotulo(estrutura.kind)}1`}
          aria-label="Rótulo da peça, como na prancha do calculista"
          onBlur={(e) => onMedidas({ rotulo: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
      </label>

      {paredesParaCortar > 0 && onCortarParedes ? (
        <button
          type="button"
          onClick={onCortarParedes}
          className="mt-2 w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          Cortar {paredesParaCortar === 1 ? 'a parede' : `as ${paredesParaCortar} paredes`}
        </button>
      ) : null}

      {/* O ESTADO, quando não há mais o que cortar. Sem esta linha, a peça já
          resolvida ficava sem dizer nada — e a ausência do botão parecia falta
          de recurso, não tarefa concluída. */}
      {paredesParaCortar === 0 && paredesJaInterrompidas > 0 ? (
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
          Esta peça já interrompe{' '}
          {paredesJaInterrompidas === 1
            ? 'a parede que atravessa'
            : `as ${paredesJaInterrompidas} paredes que atravessa`}
          . A alvenaria para na face dela, e o vão acompanha se você mover a peça.
        </p>
      ) : null}

      {pontasCurtas > 0 && onEmendarPontas ? (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2">
          <p className="text-[11px] text-amber-900">
            {pontasCurtas === 1 ? 'Uma parede parou' : `${pontasCurtas} paredes pararam`} antes
            desta peça — sobrou vão sem nada. É marca de um corte antigo.
          </p>
          <button
            type="button"
            onClick={onEmendarPontas}
            className="mt-1.5 w-full rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Emendar até a peça
          </button>
        </div>
      ) : null}

      <ControleDeSobreposicao
        visivel={sobreposicaoM3 > 0 && !!onCedeSobreposicao}
        cede={estrutura.cedeSobreposicao === true}
        volumeM3={sobreposicaoM3}
        outroJaCede={paredesJaInterrompidas > 0}
        onCede={(v) => onCedeSobreposicao?.(v)}
      />
    </div>
  );
}
