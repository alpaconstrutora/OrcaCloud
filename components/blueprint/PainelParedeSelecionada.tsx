import React, { useRef, useState } from 'react';
import { Scissors, Combine } from 'lucide-react';
import { mmToMeters, wallLength, type Opening, type Wall } from '../../utils/blueprintKernel';

/**
 * Caixa "Parede selecionada" / "Abertura selecionada" do painel de Ambientes.
 *
 * Extraído de `BlueprintEditor.tsx` por uma razão que não é estética: selecionar
 * parede exige clique no CANVAS, que é opaco em jsdom (ver o cabeçalho de
 * `__tests__/components/BlueprintEditor.test.tsx`). Com a caixa isolada, a
 * interação do campo de comprimento — o que este arquivo existe para trazer —
 * fica testável sem precisar simular um clique que jsdom não sabe dar.
 */

/** Lê "4,10" ou "4.10" como metros. `null` se não for um número positivo. */
function lerMetros(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

interface Props {
  parede: Wall | null;
  abertura: Opening | null;
  /**
   * Qual ponta anda ao esticar. `null` quando a informação ainda não se aplica
   * (sem parede selecionada) — a caixa não escreve uma dica errada nesse caso.
   */
  pontaQueAnda: 'a' | 'b' | null;
  /** A ponta que anda encontra outra parede? É o que decide o texto de ajuda. */
  arrastaCanto: boolean;
  onComprimento: (mm: number) => void;
  onEspessura: (mm: number) => void;
  podeUnir: boolean;
  onDividir: () => void;
  onUnir: () => void;
}

export default function PainelParedeSelecionada({
  parede,
  abertura,
  pontaQueAnda,
  arrastaCanto,
  onComprimento,
  onEspessura,
  podeUnir,
  onDividir,
  onUnir,
}: Props) {
  if (!parede && !abertura) return null;

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {parede ? 'Parede selecionada' : 'Abertura selecionada'}
      </h3>

      {parede && (
        <ComprimentoEEspessura
          parede={parede}
          pontaQueAnda={pontaQueAnda}
          arrastaCanto={arrastaCanto}
          onComprimento={onComprimento}
          onEspessura={onEspessura}
          podeUnir={podeUnir}
          onDividir={onDividir}
          onUnir={onUnir}
        />
      )}

      {abertura && (
        <p className="mt-2 text-xs text-slate-600">
          {abertura.kind === 'door' ? 'Porta' : 'Janela'} de{' '}
          <span className="font-medium text-slate-800">{abertura.widthMm} mm</span>, a{' '}
          {(abertura.offsetMm / 1000).toFixed(2)} m do início da parede.
        </p>
      )}
    </div>
  );
}

function ComprimentoEEspessura({
  parede,
  pontaQueAnda,
  arrastaCanto,
  onComprimento,
  onEspessura,
  podeUnir,
  onDividir,
  onUnir,
}: {
  parede: Wall;
  pontaQueAnda: 'a' | 'b' | null;
  arrastaCanto: boolean;
  onComprimento: (mm: number) => void;
  onEspessura: (mm: number) => void;
  podeUnir: boolean;
  onDividir: () => void;
  onUnir: () => void;
}) {
  const comprimentoMm = wallLength(parede);
  // Bruto, não sanitizado: guarda exatamente o que a pessoa digitou até o campo
  // perder o foco ou confirmar, para não "corrigir" o texto no meio da digitação.
  const [rascunho, setRascunho] = useState<string | null>(null);

  // REF, não estado: o Escape chama `.blur()` na hora, o que dispara `onBlur`
  // SINCRONAMENTE, dentro do mesmo handler de tecla — antes de o React aplicar
  // o `setRascunho(null)` que o Escape também pediu. Se `confirmar` lesse o
  // estado `rascunho`, ele ainda veria o texto digitado (não o `null` recém
  // pedido) e reaplicaria o valor abandonado. Ref é lida na hora, sem esperar
  // repintura — é o que faz o cancelamento realmente cancelar.
  const cancelando = useRef(false);

  function confirmar(texto: string) {
    if (cancelando.current) {
      cancelando.current = false;
      return;
    }
    const metros = lerMetros(texto);
    if (metros !== null) onComprimento(Math.round(metros * 1000));
    setRascunho(null);
  }

  const dica =
    pontaQueAnda === null
      ? ''
      : arrastaCanto
        ? `estica a ponta ${pontaQueAnda === 'a' ? 'inicial' : 'final'} — o canto vai junto`
        : `estica a ponta ${pontaQueAnda === 'a' ? 'inicial' : 'final'} (livre)`;

  return (
    <>
      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Comprimento
        <input
          type="text"
          inputMode="decimal"
          // A CHAVE, não um `value` controlado: assim que a seleção troca de
          // parede, ou o arraste da alça no canvas muda o comprimento por fora,
          // o campo precisa ressincronizar com o modelo. Um input controlado por
          // `comprimentoMm` bloquearia a própria digitação a cada re-render; o
          // `key` composto força o React a remontar o input, e um `defaultValue`
          // recomeça do valor atual sem se importar em que ponto do gesto o
          // usuário está.
          key={`${parede.id}:${comprimentoMm}`}
          defaultValue={mmToMeters(comprimentoMm).toFixed(2).replace('.', ',')}
          aria-label={`Comprimento da parede, em metros. ${dica}`}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              cancelando.current = true;
              // Restaura o TEXTO na tela diretamente no DOM — é uncontrolled de
              // propósito (ver o comentário do `key`), então mexer no `value` do
              // React não bastaria.
              (e.target as HTMLInputElement).value = mmToMeters(comprimentoMm)
                .toFixed(2)
                .replace('.', ',');
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={(e) => confirmar(rascunho ?? e.target.value)}
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        />
        m
      </label>
      {dica && <p className="mt-1 text-[11px] text-slate-400">{dica}</p>}

      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
        Espessura
        <select
          value={parede.thicknessMm}
          onChange={(e) => onEspessura(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-800"
        >
          {[100, 150, 200, 250].map((mm) => (
            <option key={mm} value={mm}>
              {mm} mm
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex gap-2">
        <BotaoTexto icone={Scissors} rotulo="Dividir" onClick={onDividir} />
        <BotaoTexto
          icone={Combine}
          rotulo="Unir"
          onClick={onUnir}
          disabled={!podeUnir}
          titulo={
            podeUnir
              ? 'Une com a parede colinear vizinha'
              : 'Só é possível unir com uma parede colinear, de mesma espessura, que compartilhe uma ponta'
          }
        />
      </div>
    </>
  );
}

function BotaoTexto({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
  titulo,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo ?? rotulo}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icone className="h-3.5 w-3.5" />
      {rotulo}
    </button>
  );
}
