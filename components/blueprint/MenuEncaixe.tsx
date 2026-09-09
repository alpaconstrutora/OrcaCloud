import React from 'react';
import {
  CircleDot,
  CornerUpLeft,
  Magnet,
  MoveHorizontal,
  Spline,
  Square,
  Triangle,
  X,
} from 'lucide-react';
import MenuExibir, { type ItemDeExibicao } from './MenuExibir';
import { ROTULO_DO_ENCAIXE, TIPOS_DE_ENCAIXE } from '../../utils/blueprintEncaixe';

/**
 * A barra de ENCAIXE — quais pontos notáveis o cursor procura.
 *
 * ─── ⚠️ POR QUE ISTO É UM CONTROLE, E NÃO UMA CONSTANTE ────────────────────
 *
 * Usuário, 09/09/2026: *"sinto falta de um componente snap"*. Ele existia,
 * sempre ligado, sem nada na tela dizendo o que estava fazendo. Um ímã que não
 * se pode desligar é um estorvo exatamente quando atrapalha — e ele atrapalha:
 * desenhar um ponto 30 mm ao lado de uma parede é impossível enquanto tudo
 * gruda nela.
 *
 * ─── ⚠️ O QUE ESTE MENU NÃO CONTROLA ───────────────────────────────────────
 *
 * A GRADE. Desligar todos os encaixes daqui não solta o ponto no contínuo: ele
 * continua caindo no passo da grade, que tem controle próprio (Precisão). São
 * dois conceitos separados no CAD — osnap e grid snap — e juntá-los num botão
 * só faria "desligar o ímã" mudar também a precisão do desenho.
 */
export default function MenuEncaixe({
  ativos,
  onAlternar,
}: {
  ativos: ReadonlySet<string>;
  onAlternar: (chave: string) => void;
}) {
  const ICONE: Record<string, React.ComponentType<{ className?: string }>> = {
    EXTREMIDADE: Square,
    CANTO: CornerUpLeft,
    INTERSECAO: X,
    CENTRO: CircleDot,
    MEIO: Triangle,
    PERPENDICULAR: Spline,
    EXTENSAO: MoveHorizontal,
    SOBRE: Magnet,
  };

  const AJUDA: Record<string, string> = {
    EXTREMIDADE: 'A ponta do eixo de uma parede ou de uma peça estrutural.',
    CANTO: 'O canto do CORPO da peça — o vértice que se vê na tela, e não o eixo.',
    INTERSECAO:
      'Onde duas peças se cruzam de verdade. Cruzamento no ar, entre duas que só se cruzariam se fossem prolongadas, NÃO conta: não há nada construído ali.',
    CENTRO: 'O centro de uma peça circular. Pega pelo miolo ou pela borda.',
    MEIO: 'O meio do eixo de uma parede ou de um trecho de instalação.',
    PERPENDICULAR:
      'O pé da perpendicular baixada do ponto de onde o traço está saindo. Só existe com um traço em curso — perpendicular a quê, senão?',
    EXTENSAO: 'O prolongamento da reta ALÉM da ponta da peça.',
    SOBRE:
      'Qualquer ponto ao longo do eixo ou da FACE da peça. É o que permite pôr uma tomada no meio de uma parede — sem ele, o ponto cai na grade, perto da parede e fora dela.',
  };

  const itens: ItemDeExibicao[] = TIPOS_DE_ENCAIXE.map((t) => ({
    chave: t,
    rotulo: ROTULO_DO_ENCAIXE[t],
    icone: ICONE[t] ?? Magnet,
    ligado: ativos.has(t),
    alternar: () => onAlternar(t),
    ajuda: AJUDA[t] ?? '',
  }));

  return (
    <MenuExibir
      rotulo="Encaixe"
      icone={Magnet}
      ajuda="Em que pontos notáveis o cursor prende"
      // Dois grupos: os que existem em qualquer peça e os que dependem do
      // contexto do traço. A divisória é informação — ela agrupa o que se
      // costuma ligar e desligar junto.
      grupos={[itens.slice(0, 5), itens.slice(5)]}
    />
  );
}
