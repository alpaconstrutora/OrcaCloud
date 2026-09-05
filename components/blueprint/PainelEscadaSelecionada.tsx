import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  medirEscada,
  type BlueprintModel,
  type Escada,
  type TipoCirculacao,
} from '../../utils/blueprintKernel';
import { CampoMedida } from './PainelParedeSelecionada';
import IdentificadorDoElemento from './IdentificadorDoElemento';

/**
 * Caixa "Escada selecionada" do painel lateral.
 *
 * Irmã de `PainelAguaSelecionada`, extraída pela mesma razão: pegar uma peça
 * exige clique no CANVAS, que é opaco em jsdom.
 *
 * ─── O RESULTADO EM PALAVRAS, ANTES DOS CAMPOS ──────────────────────────────
 *
 * "17 degraus de 172 mm, vencendo 2,92 m até o Pavimento 1." Essa frase é o
 * painel inteiro; os campos abaixo só a mudam. O número de degraus NÃO é campo
 * — ele é derivado do desnível (ver `escada.ts`), e a única forma de mudá-lo é
 * mudar o alvo de espelho ou a cota do pavimento. Um campo editável de degraus
 * aqui seria a porta exata que a família fechou: a escada que não chega ao piso.
 *
 * ─── OS AVISOS FICAM VISÍVEIS, E NÃO BLOQUEIAM ──────────────────────────────
 *
 * Blondel e a faixa da NBR 9050 aparecem como aviso âmbar, com o número. Quem
 * está estudando pode desenhar uma escada ruim de propósito — para ver que não
 * cabe — e a tela tem de deixar, dizendo o que está errado.
 */
interface Props {
  model: BlueprintModel;
  escada: Escada | null;
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  onProps: (campos: {
    tipo?: TipoCirculacao;
    larguraMm?: number;
    alvoEspelhoMm?: number;
    rotulo?: string | null;
  }) => void;
  onExcluir: () => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelEscadaSelecionada({ model, escada, onProps, onExcluir }: Props) {
  if (!escada) return null;

  const med = medirEscada(model, escada);
  const ehRampa = escada.tipo === 'RAMPA';
  const chegada = med.nivelDeChegada
    ? `até ${med.nivelDeChegada.name}`
    : 'até o pé-direito (não há pavimento acima)';

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">
            {ehRampa ? 'Rampa' : 'Escada'}
            {escada.rotulo ? ` ${escada.rotulo}` : ''}
          </h3>
          {/* A medida vem da MESMA função do quantitativo e do desenho
              (`medirEscada`): o número que o painel mostra é o que a planta
              desenha e o que o orçamento conta. */}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {ehRampa
              ? `${med.inclinacaoPct.toFixed(1).replace('.', ',')}% de inclinação`
              : `${med.degraus} degraus de ${Math.round(med.espelhoMm)} mm · piso de ${Math.round(med.pisoMm)} mm`}
            , vencendo {m(med.desnivelMm)} m {chegada}.
          </p>
          <IdentificadorDoElemento uid={escada.uid} familia="stair" />
        </div>
        <button
          type="button"
          onClick={onExcluir}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          Excluir
        </button>
      </div>

      {med.avisos.map((aviso) => (
        <p
          key={aviso}
          role="status"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{aviso}</span>
        </p>
      ))}

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Tipo
        <select
          value={escada.tipo}
          onChange={(e) => onProps({ tipo: e.target.value as TipoCirculacao })}
          aria-label="Escada ou rampa. Trocar não apaga a largura nem o alvo de espelho."
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        >
          <option value="ESCADA">Escada</option>
          <option value="RAMPA">Rampa</option>
        </select>
      </label>

      <CampoMedida
        rotulo="Largura"
        valor={escada.larguraMm / 1000}
        casas={2}
        sufixo="m"
        chave={`${escada.id}-larg-${escada.larguraMm}`}
        aoAplicar={(mts) => onProps({ larguraMm: Math.round(mts * 1000) })}
        ariaLabel={`Largura da ${ehRampa ? 'rampa' : 'escada'}, em metros. Agora: ${m(escada.larguraMm)}`}
      />

      {/* O ALVO de espelho, e não o espelho: o real sai do desnível e está na
          frase de cima. Some na rampa — rampa não tem degrau —, mas o valor
          fica guardado para quando o tipo voltar. */}
      {!ehRampa && (
        <CampoMedida
          rotulo="Espelho (alvo)"
          valor={escada.alvoEspelhoMm}
          casas={0}
          sufixo="mm"
          chave={`${escada.id}-esp-${escada.alvoEspelhoMm}`}
          aoAplicar={(mm) => onProps({ alvoEspelhoMm: Math.round(mm) })}
          ariaLabel={`Espelho que se quer, em milímetros; o número de degraus sai dele. Agora: ${escada.alvoEspelhoMm}`}
        />
      )}

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Rótulo
        <input
          type="text"
          key={`${escada.id}-rotulo`}
          defaultValue={escada.rotulo ?? ''}
          maxLength={24}
          placeholder={ehRampa ? 'Rampa de acesso' : 'E1'}
          aria-label="Como o projeto chama a peça"
          onBlur={(e) => onProps({ rotulo: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
      </label>

      <p className="mt-2 text-[11px] text-slate-500">
        {m(med.comprimentoMm)} m em planta · {m(med.comprimentoInclinadoMm)} m na inclinada ·{' '}
        {(med.areaPlantaMm2 / 1_000_000).toFixed(2).replace('.', ',')} m² de pegada.
      </p>
    </div>
  );
}
