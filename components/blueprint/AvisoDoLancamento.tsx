/**
 * O que o último "Lançar tudo" de uma gaveta da hidráulica PRESUMIU (a caixa, a
 * ligação, o hidrômetro, a saída — postos pelo automático) e o que ficou de fora
 * por falta de informação do mundo (13/10/2026, docs/planos/2026-10-13-hidro-ancoras-automaticas.md).
 * Fica no topo da gaveta até ela fechar. Aviso dentro da gaveta, não toast (§13):
 * é o resultado de uma ação que o usuário acabou de ver acontecer ali.
 */
import React from 'react';

interface Props {
  presumido: string[];
  pendencias: string[];
  testId: string;
}

export default function AvisoDoLancamento({ presumido, pendencias, testId }: Props) {
  if (presumido.length === 0 && pendencias.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid={testId}>
      <p className="font-semibold">{presumido.length > 0 ? 'O lançamento presumiu' : 'Ficou de fora do lançamento'}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {[...presumido, ...pendencias].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
