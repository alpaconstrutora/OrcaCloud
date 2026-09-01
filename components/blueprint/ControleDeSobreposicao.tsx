import React from 'react';
import { Layers } from 'lucide-react';

/**
 * "Esta peça cede o volume disputado?" — a mesma decisão do aviso de criação,
 * agora reversível.
 *
 * ─── POR QUE ELE PRECISA EXISTIR ────────────────────────────────────────────
 *
 * O aviso que aparece ao criar (`ModalSobreposicao`) pergunta uma vez. Sem este
 * controle, quem escolheu "Manter os dois" — ou errou o botão — não teria como
 * voltar atrás, e a aba Quantitativos ficaria mandando "escolha quem cede" sem
 * lugar nenhum onde escolher. Um aviso que aponta para uma ação inexistente é
 * pior do que aviso nenhum.
 *
 * ─── POR QUE SÓ APARECE QUANDO HÁ DISPUTA ───────────────────────────────────
 *
 * Um interruptor em toda parede e em toda peça seria ruído em 99% delas — e
 * ruído que não faz nada, porque sem sobreposição não há volume a ceder. Quem
 * chama passa `visivel` só quando a peça de fato atravessa outra.
 */
export default function ControleDeSobreposicao({
  visivel,
  cede,
  volumeM3,
  onCede,
}: {
  visivel: boolean;
  cede: boolean;
  /** O volume em disputa, em m³ — o que está em jogo na decisão. */
  volumeM3: number;
  onCede: (cede: boolean) => void;
}) {
  if (!visivel) return null;

  return (
    <div
      className={`mt-2 rounded-md border p-2 ${
        cede ? 'border-slate-200 bg-slate-50' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <label className="flex items-start gap-2 text-[11px] text-slate-700">
        <input
          type="checkbox"
          checked={cede}
          onChange={(e) => onCede(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1 font-medium">
            <Layers className="h-3 w-3 shrink-0" />
            Cede o volume sobreposto
          </span>
          <span className="mt-0.5 block text-slate-500">
            {cede ? (
              <>
                <span className="tabular-nums">
                  {volumeM3.toFixed(3).replace('.', ',')} m³
                </span>{' '}
                saem daqui e ficam só na outra peça.
              </>
            ) : (
              <>
                <span className="tabular-nums">
                  {volumeM3.toFixed(3).replace('.', ',')} m³
                </span>{' '}
                estão contados <strong>duas vezes</strong> — aqui e na outra peça.
              </>
            )}
          </span>
        </span>
      </label>
    </div>
  );
}
