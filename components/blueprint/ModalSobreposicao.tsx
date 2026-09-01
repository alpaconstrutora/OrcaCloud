import React from 'react';
import { Layers } from 'lucide-react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../ui/modal';

/**
 * "Duas peças ocupam o mesmo espaço" — a decisão de quem cede o volume.
 *
 * ─── O PEDIDO ───────────────────────────────────────────────────────────────
 *
 * Usuário, 01/09/2026, com print do 3D: *"ao criar um pilar onde ja existe
 * parede criada os dois componentes ficam se sobrepondo. Ao criar um componente
 * que sobrepoe um outro, emitir um aviso ao usuário se ele quer desfazer ou se
 * ele quer subtrair o volume de um componente ou do outro componente"*.
 *
 * ─── POR QUE MODAL, E POR QUE NÃO `useConfirm` ──────────────────────────────
 *
 * Modal central pelo `UI_PATTERNS.md` §2: decisão pontual, e o usuário NÃO
 * precisa da tela de trás para decidir — o número que importa está aqui dentro.
 * `useConfirm` seria o caminho (§14), mas ele é booleano, e aqui são quatro
 * saídas: desfazer, alvenaria cede, concreto cede, e manter os dois. Espremer
 * isso em sim/não obrigaria a encadear dois modais para uma pergunta só. O que
 * o §14 proíbe é remontar o modal À MÃO; a primitiva `Modal` é a do app.
 *
 * ─── E POR QUE O NÚMERO APARECE ─────────────────────────────────────────────
 *
 * `UI_PATTERNS.md` §6.2: decisão que mexe em valor mostra o que a sustenta. Sem
 * o volume disputado na tela, "descontar de qual?" é uma pergunta sem dado — e
 * a resposta muda o que se compra de concreto e de bloco.
 */

export type EscolhaSobreposicao = 'DESFAZER' | 'CORTAR_PAREDE' | 'PECA_CEDE' | 'MANTER';

interface Props {
  aberto: boolean;
  /** Como chamar o que acabou de nascer: "Pilar", "Viga"… */
  nomeDaPeca: string;
  /** Quantos componentes ela atravessa. */
  quantos: number;
  /** O volume disputado somado, em m³. */
  volumeM3: number;
  /** Há PAREDE entre os atravessados? Sem parede, a opção dela não faz sentido. */
  temParede: boolean;
  onEscolher: (e: EscolhaSobreposicao) => void;
}

function m3(v: number): string {
  return `${v.toFixed(3).replace('.', ',')} m³`;
}

export default function ModalSobreposicao({
  aberto,
  nomeDaPeca,
  quantos,
  volumeM3,
  temParede,
  onEscolher,
}: Props) {
  return (
    <Modal
      open={aberto}
      // Fechar por Esc/backdrop equivaleria a "manter os dois" sem dizer isso —
      // e manter é justamente a saída que deixa o volume contado em dobro. A
      // decisão é obrigatória, e o botão "Manter os dois" é a saída explícita.
      dismissable={false}
      onClose={() => onEscolher('MANTER')}
      // `2xl` porque são QUATRO ações e elas não podem quebrar linha nem sair
      // pela borda. Medido no harness: em `lg` cada rótulo virava duas linhas;
      // em `xl` (576 px) o "Desfazer" saía 71 px para fora do painel — e a
      // primeira medição APROVOU esse estado, porque mediu contra o invólucro
      // `inset-0` em vez do painel. Quem corrigiu foi o print.
      size="2xl"
    >
      <ModalHeader
        icon={<Layers className="h-5 w-5" />}
        title="Duas peças ocupam o mesmo espaço"
        description={`${nomeDaPeca} atravessa ${quantos} ${quantos === 1 ? 'componente' : 'componentes'} já desenhado${quantos === 1 ? '' : 's'}.`}
      />

      <ModalBody>
        {/* O BLOCO DE CONTEXTO do §6.2. O que está em jogo não é a imagem no
            3D — pilar embutido é normal na obra —, é o volume entrar duas vezes
            no orçamento. */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            Volume disputado: <strong className="tabular-nums">{m3(volumeM3)}</strong>
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Sem decidir, esse volume é contado <strong>duas vezes</strong> no
            quantitativo — uma como concreto e outra como alvenaria.
          </p>
        </div>

        <dl className="mt-4 space-y-2 text-xs text-slate-600">
          {temParede && (
            <div>
              <dt className="font-semibold text-slate-700">Cortar a parede</dt>
              <dd>
                A parede é <strong>partida de verdade</strong> e passa a terminar na face
                do pilar — no desenho e no modelo. O ambiente continua fechado: o concreto
                assume o lugar do pedaço removido. A alvenaria descontada sai por
                construção, porque a parede ficou mais curta.
              </dd>
            </div>
          )}
          <div>
            <dt className="font-semibold text-slate-700">Descontar do concreto</dt>
            <dd>
              A peça perde o pedaço; a alvenaria fica cheia. Serve a quem executa a
              alvenaria inteira e concreta depois. A <strong>fôrma não muda</strong> —
              a face embutida continua sendo cofrada.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">Manter os dois</dt>
            <dd>
              Nada muda no cálculo. A disputa continua listada em Quantitativos, para
              não sumir de vista.
            </dd>
          </div>
        </dl>
      </ModalBody>

      <ModalFooter>
        {/* Verbo + objeto (§6.1). "Desfazer" à esquerda como saída secundária; o
            desconto da alvenaria é o primário por ser a convenção do orçamento. */}
        <button
          type="button"
          onClick={() => onEscolher('DESFAZER')}
          className="mr-auto whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Desfazer {nomeDaPeca.toLowerCase()}
        </button>
        <button
          type="button"
          onClick={() => onEscolher('MANTER')}
          className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Manter os dois
        </button>
        <button
          type="button"
          onClick={() => onEscolher('PECA_CEDE')}
          className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Descontar do concreto
        </button>
        {temParede && (
          <button
            type="button"
            onClick={() => onEscolher('CORTAR_PAREDE')}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Cortar a parede
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}
