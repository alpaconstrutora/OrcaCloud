/**
 * O aviso âmbar "a rede foi lançada com outras escolhas" + o botão de relançar (F1 do plano
 * `docs/planos/2026-10-24-relancar-quando-escolha-muda.md`, 24/10/2026 — a REGRA B: dizer QUANDO e POR QUE relançar).
 *
 * Pedido: *"quando o usuário faz uma allteracao em preferencias, porem exemplo alterar o tipo de lançamento de
 * eletroduto para Sem caixas de passagem, o motor de lançar Eletrodutos por circuito deve ficar disponivel para
 * relançar e incluir essa nova preferencia. Isto deve valer para qualquer alteracao de preferencia"*.
 *
 * Comum a todos os motores (eletrodutos, água, esgoto, pluvial, circuitos automáticos): o painel do motor compara o
 * registro do lançamento com as escolhas atuais (`diferencasDasEscolhas`) e entrega aqui as diferenças. Sem diferença
 * (ou sem registro — rede antiga) não renderiza nada.
 *
 * Visual: o mesmo aviso âmbar dos planos dos motores (`rounded-md border-amber-200 bg-amber-50 text-xs text-amber-800`,
 * ex.: avisos do esgoto no `BlueprintEditor`), com o botão âmbar sólido do aviso de colaboração. Botão desligado
 * SEMPRE diz o motivo — numa linha menor do próprio aviso (leitor de tela, toque) e no `title` do botão e do
 * invólucro (nem todo navegador mostra dica em botão desabilitado).
 */
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { textoDasDiferencas, type DiferencaDeEscolha } from '../../utils/blueprintRegistroDeLancamento';

export interface AvisoDeEscolhasMudaramProps {
  /** O que mudou desde o lançamento. Vazio = nada a avisar (o componente não aparece). */
  diferencas: DiferencaDeEscolha[];
  /** O texto do botão. Padrão: "Relançar com as escolhas atuais". */
  rotuloDoBotao?: string;
  onRelancar: () => void;
  /** O MOTIVO de o botão estar desligado (`null`/ausente = ligado). */
  desabilitado?: string | null;
}

export default function AvisoDeEscolhasMudaram({
  diferencas,
  rotuloDoBotao = 'Relançar com as escolhas atuais',
  onRelancar,
  desabilitado = null,
}: AvisoDeEscolhasMudaramProps) {
  if (diferencas.length === 0) return null;
  const motivo = desabilitado || undefined;
  return (
    <div
      role="status"
      data-testid="aviso-escolhas-mudaram"
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {textoDasDiferencas(diferencas)}
        {/* O motivo também no TEXTO: leitor de tela e toque não mostram `title`. */}
        {motivo && (
          <span className="mt-0.5 block text-[11px] text-amber-700" data-testid="aviso-escolhas-mudaram-motivo">
            {motivo}
          </span>
        )}
      </span>
      <span className="inline-flex shrink-0" title={motivo}>
        <button
          type="button"
          onClick={onRelancar}
          disabled={!!motivo}
          title={motivo}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {rotuloDoBotao}
        </button>
      </span>
    </div>
  );
}
