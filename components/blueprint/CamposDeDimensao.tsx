import React from 'react';
import { CampoMedida } from './PainelParedeSelecionada';
import type { MedidasDaPeca } from '../../utils/blueprintRede';

/**
 * As três medidas de uma peça de instalação — quadro ou ponto.
 *
 * ─── ⚠️ POR QUE O CAMPO MOSTRA O PADRÃO EM VEZ DE FICAR VAZIO ───────────────
 *
 * Porque a peça É desenhada com aquele tamanho. Um campo em branco ao lado de
 * uma caixa que tem 400 mm na tela diria que ninguém escolheu 400 — e a
 * primeira coisa que se faz com um campo vazio é preenchê-lo com o número que
 * já está valendo, o que não muda nada e cria a impressão de que mudou.
 *
 * A diferença entre "declarado" e "padrão" fica na frase abaixo dos campos, que
 * é onde ela importa: ela diz se este desenho afirma a medida ou se apenas não
 * discorda dela.
 *
 * ⚠️ ALTURA não aparece em planta baixa — planta é corte horizontal, e a altura
 * de um quadro só se vê no 3D, no corte e na elevação. O rótulo diz isso para
 * ninguém procurar na tela errada o efeito de um número que mudou.
 */
export default function CamposDeDimensao({
  id,
  medidas,
  declarado,
  onMedidas,
}: {
  /** Identifica os campos entre peças — o `CampoMedida` guarda rascunho por chave. */
  id: string;
  /** O que vale AGORA: o declarado, com o padrão preenchendo o resto. */
  medidas: MedidasDaPeca;
  /** Alguma das três foi declarada nesta peça? */
  declarado: boolean;
  onMedidas: (campos: {
    larguraMm?: number | null;
    alturaMm?: number | null;
    profundidadeMm?: number | null;
  }) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        <CampoMedida
          rotulo="Largura"
          valor={medidas.larguraMm}
          casas={0}
          sufixo="mm"
          chave={`larg-${id}`}
          aoAplicar={(v) => onMedidas({ larguraMm: v })}
          ariaLabel="Largura da peça, em milímetros"
        />
        <CampoMedida
          rotulo="Prof."
          valor={medidas.profundidadeMm}
          casas={0}
          sufixo="mm"
          chave={`prof-${id}`}
          aoAplicar={(v) => onMedidas({ profundidadeMm: v })}
          ariaLabel="Profundidade da peça, em milímetros"
        />
        <CampoMedida
          rotulo="Altura"
          valor={medidas.alturaMm}
          casas={0}
          sufixo="mm"
          chave={`alt-${id}`}
          aoAplicar={(v) => onMedidas({ alturaMm: v })}
          ariaLabel="Altura da peça, em milímetros"
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        {declarado ? (
          <>
            Medidas <strong>declaradas</strong> neste desenho. Largura e profundidade são a
            pegada em planta; a altura aparece no 3D e no corte.
          </>
        ) : (
          <>
            Medidas <strong>padrão</strong> — ninguém informou as desta peça. Digitar um valor
            passa a declará-lo, e o desenho e o IFC seguem o que for declarado.
          </>
        )}
      </p>
      {declarado && (
        <button
          type="button"
          onClick={() =>
            onMedidas({ larguraMm: null, alturaMm: null, profundidadeMm: null })
          }
          className="mt-1 text-[10px] text-blue-700 hover:underline"
        >
          Voltar ao padrão
        </button>
      )}
    </div>
  );
}
