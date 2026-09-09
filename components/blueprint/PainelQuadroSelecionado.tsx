import React from 'react';
import { CampoMedida } from './PainelParedeSelecionada';
import CamposDeDimensao from './CamposDeDimensao';
import {
  MEDIDAS_PADRAO_QUADRO,
  giroDaPeca,
  medidasDaPeca,
} from '../../utils/blueprintRede';
import type { Quadro } from '../../utils/blueprintKernel';

/**
 * O QUADRO de distribuição selecionado — nome, cota, medidas e giro.
 *
 * ─── ⚠️ POR QUE ISTO NASCEU, E O QUE ESTAVA ERRADO ANTES ───────────────────
 *
 * O quadro era a única peça do desenho SEM painel de peça selecionada. Clicar
 * nele no desenho não mostrava nada, e as medidas dele só existiam dentro do
 * painel de cargas — porque era o único lugar em que ele aparecia listado.
 *
 * Usuário, 09/09/2026: *"o QDC está dentro de um accordion chamado Elétrica,
 * porém o ponto elétrico está em outro chamado Componentes. Deveria tudo ligado
 * à elétrica ficar dentro de um mesmo grupo."*
 *
 * A confusão era real e a raiz era o contrário do que parecia: não é o ponto que
 * está no lugar errado, é o quadro que faltava aqui.
 *
 * ─── A REGRA QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * **Peça → Componentes. Somatório e relação → a seção da disciplina.**
 *
 * A propriedade de uma peça selecionada tem UM lugar só, para todas as
 * disciplinas. Dividir por disciplina obrigaria quem desenha a saber a
 * disciplina da peça ANTES de saber onde olhar — e a fronteira teria de ser
 * redecidida a cada família nova (cano de água, viga, esquadria, telhado).
 *
 * O painel de cargas ficou com o que é dele: circuitos, disjuntor, seção,
 * potências e pendências. Ele lê e confere; aqui se edita.
 */
export default function PainelQuadroSelecionado({
  quadro,
  onQuadro,
}: {
  quadro: Quadro | null;
  onQuadro: (campos: {
    nome?: string;
    cotaMm?: number;
    larguraMm?: number | null;
    alturaMm?: number | null;
    profundidadeMm?: number | null;
    rotacaoGraus?: number | null;
  }) => void;
}) {
  if (!quadro) return null;

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Quadro selecionado
      </h3>
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600">Nome</span>
          <input
            type="text"
            value={quadro.nome}
            onChange={(e) => onQuadro({ nome: e.target.value })}
            aria-label="Nome do quadro"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
        <CampoMedida
          rotulo="Cota"
          valor={quadro.cotaMm}
          casas={0}
          sufixo="mm"
          chave={`cota-quadro-${quadro.id}`}
          aoAplicar={(v) => onQuadro({ cotaMm: v })}
          ariaLabel="Cota do quadro, em milímetros do piso"
        />
        {/* ⚠️ A cota é o CENTRO da caixa, não a base — é a convenção que o IFC
            já usava quando as medidas nasceram, e trocá-la moveria meia altura
            toda peça de todo desenho publicado. */}
        <p className="text-[10px] text-slate-500">
          A cota é a altura do <strong>centro</strong> da caixa, medida do piso.
        </p>
        <CamposDeDimensao
          id={quadro.id}
          medidas={medidasDaPeca(quadro, MEDIDAS_PADRAO_QUADRO)}
          declarado={
            quadro.larguraMm != null ||
            quadro.alturaMm != null ||
            quadro.profundidadeMm != null
          }
          rotacaoGraus={giroDaPeca(quadro)}
          onMedidas={onQuadro}
        />
      </div>
    </div>
  );
}
