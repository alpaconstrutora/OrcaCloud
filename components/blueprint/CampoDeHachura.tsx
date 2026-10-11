import React from 'react';
import {
  ESCALA_MAX_DA_HACHURA_PCT,
  ESCALA_MIN_DA_HACHURA_PCT,
  PADROES_DE_MATERIAL,
  ROTULO_DO_PADRAO_DE_MATERIAL,
  type CamadaParede,
  type HachuraDaCamada,
  type PadraoDeMaterial,
} from '../../utils/blueprintKernel';

/**
 * HACHURA DE MATERIAL de uma camada (F6 do plano `2026-10-11-planta-recursos-video-synaps.md`,
 * kernel 0.96.0) — o MESMO campo nas camadas da parede e nas do piso/forro.
 *
 * Padrão, escala (% do módulo natural) e giro. A escala e o giro só aparecem com
 * padrão escolhido. Os números entram já dentro da faixa que o kernel aceita
 * (10–1000 %, 0–359°), inteiros: um valor fora dela nunca chega a ser recusado
 * lá — e a camada não some da tela por causa de um 2000 digitado.
 */
const campo = 'h-7 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800';

/**
 * A camada com a hachura trocada. Tirar a hachura REMOVE a chave — deixar
 * `hachura: undefined` faria a camada diferir da que nunca teve uma.
 */
export function camadaComHachura(c: CamadaParede, h: HachuraDaCamada | undefined): CamadaParede {
  if (h) return { ...c, hachura: h };
  const { hachura: _sai, ...resto } = c;
  return resto;
}

export default function CampoDeHachura({
  hachura,
  onMudar,
  rotulo,
}: {
  hachura: HachuraDaCamada | undefined;
  /** `undefined` = sem hachura. */
  onMudar: (h: HachuraDaCamada | undefined) => void;
  /** Para o leitor de tela: "da camada 2", "do piso". */
  rotulo: string;
}) {
  const inteiroNaFaixa = (texto: string, min: number, max: number): number | null => {
    const v = Math.round(Number(texto.replace(',', '.')));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select
        value={hachura?.padrao ?? ''}
        onChange={(e) => {
          const padrao = e.target.value as PadraoDeMaterial | '';
          onMudar(padrao ? { padrao, escalaPct: hachura?.escalaPct ?? 100, rotacaoGraus: hachura?.rotacaoGraus ?? 0 } : undefined);
        }}
        aria-label={`Hachura ${rotulo}`}
        title="Padrão de desenho do material — sai na planta e no PDF; não muda o quantitativo"
        className={campo}
      >
        <option value="">Sem hachura</option>
        {PADROES_DE_MATERIAL.map((p) => (
          <option key={p} value={p}>
            {ROTULO_DO_PADRAO_DE_MATERIAL[p]}
          </option>
        ))}
      </select>
      {hachura && (
        <>
          <input
            key={`e-${hachura.escalaPct}`}
            type="number"
            min={ESCALA_MIN_DA_HACHURA_PCT}
            max={ESCALA_MAX_DA_HACHURA_PCT}
            step={10}
            defaultValue={hachura.escalaPct}
            aria-label={`Escala da hachura ${rotulo}, em %`}
            title={`Escala do módulo: 100 % é o tamanho natural do padrão (${ESCALA_MIN_DA_HACHURA_PCT}–${ESCALA_MAX_DA_HACHURA_PCT} %)`}
            onBlur={(e) => {
              const v = inteiroNaFaixa(e.target.value, ESCALA_MIN_DA_HACHURA_PCT, ESCALA_MAX_DA_HACHURA_PCT);
              if (v != null && v !== hachura.escalaPct) onMudar({ ...hachura, escalaPct: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`${campo} w-16`}
          />
          <span className="text-[10px] text-slate-400">%</span>
          <input
            key={`r-${hachura.rotacaoGraus}`}
            type="number"
            min={0}
            max={359}
            step={15}
            defaultValue={hachura.rotacaoGraus}
            aria-label={`Giro da hachura ${rotulo}, em graus`}
            title="Giro do padrão (0–359°). Na parede ele já acompanha a direção dela."
            onBlur={(e) => {
              const v = inteiroNaFaixa(e.target.value, 0, 359);
              if (v != null && v !== hachura.rotacaoGraus) onMudar({ ...hachura, rotacaoGraus: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`${campo} w-14`}
          />
          <span className="text-[10px] text-slate-400">°</span>
        </>
      )}
    </span>
  );
}
