import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, Check } from 'lucide-react';
import type { PontaEmRevisao } from '../../utils/blueprintRevisaoDePontas';

/**
 * REVISÃO GUIADA DAS PONTAS SOLTAS (24/09/2026, P2.52).
 *
 * ─── POR QUE UMA DE CADA VEZ ────────────────────────────────────────────────
 *
 * Depois dos passes automáticos sobraram **58 pontas soltas** na planta real.
 * Sobraram porque nenhuma regra pode decidi-las sem adivinhar: a ponta está a
 * 40 cm de outra — é vão de propósito ou parede faltando? A lista âmbar diz
 * QUANTAS são; não diz ONDE nem O QUE FAZER. E 58 bolinhas âmbar espalhadas em
 * 195 paredes não se percorrem no olho.
 *
 * Aqui é uma por vez: a vista vai até ela, o painel mostra só as saídas que
 * existem naquele ponto, e a decisão é de quem desenha. "Pular" e "não é
 * problema" também são respostas — a segunda tira a ponta da lista sem tocar no
 * desenho, porque varanda e limite externo DEVEM ficar abertos.
 *
 * ⚠️ As ignoradas vivem no NAVEGADOR (quem chama persiste), não no modelo.
 * Marcar "não é problema" é juízo de quem revisa, não geometria: gravá-lo no
 * payload mudaria o hash do desenho — duas pessoas revisando a mesma planta
 * produziriam versões diferentes sem uma linha ter mudado de lugar.
 */
interface Props {
  pontas: readonly PontaEmRevisao[];
  /** Quantas já foram marcadas como intencionais. */
  ignoradas: number;
  /** Leva a vista até a ponta em foco. */
  onFocar: (p: { x: number; y: number }) => void;
  /** Aplica a opção escolhida (um passo de desfazer). */
  onAplicar: (ponta: PontaEmRevisao, indiceDaOpcao: number) => void;
  /** Tira a ponta da revisão sem mexer no desenho. */
  onIgnorar: (ponta: PontaEmRevisao) => void;
  /** Devolve todas as ignoradas à lista. */
  onLimparIgnoradas: () => void;
}

export default function PainelRevisaoDePontas({
  pontas,
  ignoradas,
  onFocar,
  onAplicar,
  onIgnorar,
  onLimparIgnoradas,
}: Props) {
  const [i, setI] = useState(0);
  // A lista encolhe a cada conserto: o índice tem de continuar dentro dela, e
  // ficar onde estava é o que faz a revisão avançar sozinha para a próxima.
  const indice = pontas.length === 0 ? 0 : Math.min(i, pontas.length - 1);
  const atual = pontas[indice];

  useEffect(() => {
    if (atual) onFocar(atual.p);
    // Só quando a ponta em foco muda: focar a cada render brigaria com o zoom
    // de quem está olhando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.wallId, atual?.end]);

  if (pontas.length === 0) {
    return (
      <div className="mt-2 border-t border-amber-200 pt-2" data-testid="revisao-vazia">
        <p className="text-xs text-amber-800">
          {ignoradas > 0
            ? `Nenhuma ponta a revisar — ${ignoradas} marcada(s) como intencional(is).`
            : 'Nenhuma ponta solta neste pavimento.'}
        </p>
        {ignoradas > 0 && (
          <button
            type="button"
            onClick={onLimparIgnoradas}
            className="mt-1.5 text-[11px] text-amber-700 underline hover:text-amber-900"
            data-testid="limpar-ignoradas"
          >
            Rever as {ignoradas} marcada(s)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-amber-200 pt-2" data-testid="revisao-de-pontas">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-amber-900" data-testid="revisao-posicao">
          Revisando {indice + 1} de {pontas.length}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setI((n) => (n - 1 + pontas.length) % pontas.length)}
            aria-label="Ponta anterior"
            className="rounded-md border border-amber-300 bg-white p-1 text-amber-800 hover:bg-amber-100"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setI((n) => (n + 1) % pontas.length)}
            aria-label="Próxima ponta"
            className="rounded-md border border-amber-300 bg-white p-1 text-amber-800 hover:bg-amber-100"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <p className="mt-1 text-[11px] text-amber-800" data-testid="revisao-contexto">
        Ponta {atual.end === 'a' ? 'inicial' : 'final'} de uma parede de {atual.comprimentoMm} mm, em{' '}
        {Math.round(atual.p.x)}, {Math.round(atual.p.y)}.
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {atual.opcoes.map((o, k) => (
          <button
            key={o.tipo}
            type="button"
            onClick={() => onAplicar(atual, k)}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            data-testid={`revisao-opcao-${o.tipo}`}
          >
            <Check className="h-3.5 w-3.5" />
            {o.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onIgnorar(atual)}
          title="Varanda, terraço e limite externo DEVEM ficar abertos — some da lista sem mexer no desenho"
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100"
          data-testid="revisao-ignorar"
        >
          <EyeOff className="h-3.5 w-3.5" />
          Não é problema
        </button>
      </div>

      {atual.opcoes.length === 0 && (
        <p className="mt-1.5 text-[11px] text-amber-700" data-testid="revisao-sem-opcao">
          Nada perto para juntar e nada à frente para alcançar. Desenhe o trecho que falta, arraste a ponta até
          encostar — ou marque como intencional, se o contorno é aberto ali.
        </p>
      )}

      {ignoradas > 0 && (
        <button
          type="button"
          onClick={onLimparIgnoradas}
          className="mt-1.5 text-[11px] text-amber-700 underline hover:text-amber-900"
          data-testid="limpar-ignoradas"
        >
          Rever as {ignoradas} marcada(s) como intencional(is)
        </button>
      )}
    </div>
  );
}
