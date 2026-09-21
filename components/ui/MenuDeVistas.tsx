/**
 * Seletor de vista GENÉRICO para o ribbon (§19.5 do `docs/ui_ux_guia_unificado.md`)
 * — o botão à esquerda das abas que diz "estou olhando o Gantt" e troca de
 * vista num clique.
 *
 * Nasceu em 21/09/2026 para o Planejamento, copiando a mecânica do
 * `blueprint/SeletorDeVista.tsx` (que continua acoplado a `VistaBlueprint`
 * e por isso não foi reaproveitado): o botão fechado mostra ícone + nome da
 * vista atual, então o estado nunca some; o popover é `role="menu"` com
 * `menuitemradio`, fecha no mousedown fora e no Esc; e a largura do check é
 * reservada para a lista não dançar a cada troca.
 *
 * A diferença é `grupos`: doze vistas numa lista corrida não se leem — um
 * cabeçalho em caixa alta entre "Cronograma", "Análise" e "Execução" é o que
 * deixa o olho pular direto para a metade certa.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ItemDeVista<Id extends string = string> {
  id: Id;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
}

export interface GrupoDeVistas<Id extends string = string> {
  rotulo: string;
  itens: readonly ItemDeVista<Id>[];
}

export default function MenuDeVistas<Id extends string>({
  vista,
  onEscolher,
  grupos,
  ariaLabel,
  ajuda = 'Trocar de vista',
}: {
  vista: Id;
  onEscolher: (id: Id) => void;
  grupos: readonly GrupoDeVistas<Id>[];
  /** Nome do menu para leitores de tela e para os testes (`getByRole('menu', { name })`). */
  ariaLabel: string;
  ajuda?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const todos = grupos.flatMap((g) => g.itens);
  const atual = todos.find((i) => i.id === vista) ?? todos[0];
  const IconeAtual = atual.icone;

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title={ajuda}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          aberto
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <IconeAtual className="h-3.5 w-3.5" />
        {atual.rotulo}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-30 mt-1 w-52 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {grupos.map((grupo, indice) => (
            <div key={grupo.rotulo} className={indice > 0 ? 'mt-1 border-t border-slate-100 pt-1' : undefined}>
              <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-slate-400">{grupo.rotulo}</div>
              {grupo.itens.map(({ id, rotulo, icone: Icone }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={vista === id}
                  onClick={() => {
                    setAberto(false);
                    onEscolher(id);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    vista === id
                      ? 'font-medium text-blue-700 hover:bg-blue-50'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {/* Largura reservada para o check: sem ela a lista dança a cada troca. */}
                  <span className="w-3.5 shrink-0">
                    {vista === id ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <Icone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{rotulo}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
