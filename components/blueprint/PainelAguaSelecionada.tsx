import React from 'react';
import { medirAgua, type Agua } from '../../utils/blueprintKernel';
import { CampoMedida } from './PainelParedeSelecionada';
import IdentificadorDoElemento from './IdentificadorDoElemento';

/**
 * Caixa "Água selecionada" do painel lateral.
 *
 * Irmã de `PainelEstruturaSelecionada`, extraída pela mesma razão: pegar uma
 * peça exige clique no CANVAS, que é opaco em jsdom. Com a caixa isolada, os
 * campos ficam testáveis sem simular um clique que jsdom não sabe dar.
 *
 * ─── AS DUAS ÁREAS, LADO A LADO ─────────────────────────────────────────────
 *
 * A linha de medida mostra a área REAL (a que se compra) e a PROJETADA (a que se
 * confere no desenho), nesta ordem e sempre as duas. É a razão de o telhado
 * existir como módulo — ver `telhado.ts` — e o painel é onde o usuário vê pela
 * primeira vez que 24 m² de planta são 25,06 m² de telha.
 *
 * ─── O BEIRAL É UM LADO, ESCOLHIDO NUMA LISTA ───────────────────────────────
 *
 * Cada opção do select é um lado do polígono com o comprimento dele ("Lado 1 ·
 * 6,00 m"). Não é um campo de ângulo nem de vetor: o usuário sabe qual lado dá
 * para a rua, e o comprimento é o que o deixa reconhecer o lado na lista sem
 * contar vértices no desenho. A seta de caimento no canvas confirma a escolha.
 */
interface Props {
  agua: Agua | null;
  /** Campo omitido fica como está — o painel edita uma medida por vez. */
  onProps: (campos: {
    inclinacaoPct?: number;
    beiralIndex?: number;
    baseMm?: number;
    espessuraMm?: number;
  }) => void;
  onExcluir: () => void;
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');

export default function PainelAguaSelecionada({ agua, onProps, onExcluir }: Props) {
  if (!agua) return null;

  const med = medirAgua(agua);
  const n = agua.pontos.length;
  const lados = agua.pontos.map((a, i) => {
    const b = agua.pontos[(i + 1) % n];
    return { indice: i, comprimentoM: Math.hypot(b.x - a.x, b.y - a.y) / 1000 };
  });

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-700">Água de telhado</h3>
          {/* A medida vem da MESMA função do quantitativo (`medirAgua`), não de
              uma conta local: o número que o painel mostra tem de ser o que vai
              para o orçamento. */}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {m2(med.areaRealM2)} m² de telha · {m2(med.areaProjetadaM2)} m² em planta ·{' '}
            {med.inclinacaoGraus.toFixed(1).replace('.', ',')}°
          </p>
          <IdentificadorDoElemento uid={agua.uid} familia="roof" />
        </div>
        <button
          type="button"
          onClick={onExcluir}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
        >
          Excluir
        </button>
      </div>

      {/* Inclinação em POR CENTO, como a obra fala. Graus é derivado e aparece
          na linha de medida, nunca como campo — dois campos para a mesma
          grandeza divergem no primeiro arredondamento. */}
      <CampoMedida
        rotulo="Inclinação"
        valor={agua.inclinacaoPct}
        casas={0}
        sufixo="%"
        chave={`${agua.id}-incl-${agua.inclinacaoPct}`}
        aoAplicar={(pct) => onProps({ inclinacaoPct: pct })}
        ariaLabel={`Inclinação da água, em por cento. Agora: ${agua.inclinacaoPct}`}
      />

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Beiral
        <select
          value={agua.beiralIndex}
          onChange={(e) => onProps({ beiralIndex: Number(e.target.value) })}
          aria-label="Qual lado do polígono é o beiral — o lado baixo, por onde a água escorre"
          title="O lado BAIXO da água. A seta no desenho aponta o caimento a partir dele."
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        >
          {lados.map((l) => (
            <option key={l.indice} value={l.indice}>
              Lado {l.indice + 1} · {l.comprimentoM.toFixed(2).replace('.', ',')} m
            </option>
          ))}
        </select>
      </label>

      {/* A COTA em metro, como a estrutura: é posição na edificação. O padrão
          ao criar é o pé-direito do pavimento — a água nasce apoiada no topo da
          parede. */}
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Cota do beiral
        <input
          type="number"
          step={0.05}
          value={agua.baseMm / 1000}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onProps({ baseMm: Math.round(v * 1000) });
          }}
          aria-label="Cota da linha do beiral, em metros a partir do piso do pavimento"
          title="Cota da LINHA DO BEIRAL, medida do piso do pavimento. A água sobe a partir dela."
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
        m
      </label>

      <CampoMedida
        rotulo="Espessura"
        valor={agua.espessuraMm / 10}
        casas={0}
        sufixo="cm"
        chave={`${agua.id}-esp-${agua.espessuraMm}`}
        aoAplicar={(cm) => onProps({ espessuraMm: Math.round(cm * 10) })}
        ariaLabel={`Espessura do pacote de cobertura, em centímetros. Agora: ${Math.round(agua.espessuraMm / 10)}`}
      />

      <p className="mt-2 text-[11px] text-slate-500">
        Ponto mais alto a {(med.alturaMaximaMm / 1000).toFixed(2).replace('.', ',')} m do piso ·
        beiral de {med.comprimentoBeiralM.toFixed(2).replace('.', ',')} m.
      </p>
    </div>
  );
}
