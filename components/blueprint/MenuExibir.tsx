import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye } from 'lucide-react';

/**
 * Um item do menu. `disabled` vem com `motivo` obrigatório na prática — item
 * apagado sem explicação faz o usuário clicar de novo achando que falhou.
 */
export interface ItemDeExibicao {
  chave: string;
  rotulo: string;
  /** Vai para o `title`. É onde mora a diferença entre Medidas × Cotas × Interna. */
  ajuda: string;
  ligado: boolean;
  alternar: () => void;
  icone: React.ComponentType<{ className?: string }>;
  /** Verdadeiro quando o item não tem efeito no estado atual. */
  desabilitado?: boolean;
}

interface Props {
  /** Grupos separados por divisória — a ordem é a da leitura, não a do código. */
  grupos: ItemDeExibicao[][];
}

/**
 * O que aparece no desenho, num menu só.
 *
 * Era tudo botão na barra. Com Medidas, Cotas, Interna e Nomes já lá, somar
 * Grade, Preenchimento, Cores e Alto contraste levaria a barra a três linhas —
 * e uma barra que quebra três vezes deixa de ser barra: o olho não acha mais o
 * controle, e os botões de Desfazer/Refazer, que são os mais usados, descem
 * para o fim da terceira linha.
 *
 * Custa um clique a mais nos quatro toggles que já existiam. É o preço aceito
 * (decisão do usuário, 28/08/2026) por manter Orto, Junções, Grade, Precisão e
 * Desfazer/Refazer todos visíveis de uma vez.
 *
 * Popover, não modal: `UI_PATTERNS.md` — a escolha é reversível e o desenho
 * atrás precisa continuar visível enquanto se liga e desliga.
 */
export default function MenuExibir({ grupos }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Fechar em clique fora e em Esc. `mousedown`, não `click`: com `click` o
  // toggle do próprio botão dispara depois do fechamento e o menu reabre.
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

  const ligados = grupos.flat().filter((i) => i.ligado).length;

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title="Escolher o que aparece no desenho"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          aberto
            ? 'border-blue-600 bg-blue-50 text-blue-700'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        <Eye className="h-3.5 w-3.5" />
        Exibir
        {/* A contagem existe para o menu fechado não esconder o estado: sem ela,
            "por que a cota sumiu?" vira uma caçada dentro de um menu fechado. */}
        {ligados > 0 ? (
          <span className="rounded bg-blue-600 px-1 text-[10px] font-semibold text-white">
            {ligados}
          </span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div
          role="menu"
          aria-label="Exibir no desenho"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-[10px] border border-slate-200 bg-white p-1 shadow-lg"
        >
          {grupos.map((grupo, i) => (
            <div key={grupo[0]?.chave ?? i}>
              {i > 0 ? <div className="my-1 h-px bg-slate-100" /> : null}
              {grupo.map((item) => {
                const Icone = item.icone;
                return (
                  <button
                    key={item.chave}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={item.ligado}
                    disabled={item.desabilitado}
                    onClick={item.alternar}
                    title={item.ajuda}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      item.desabilitado
                        ? 'cursor-not-allowed text-slate-300'
                        : item.ligado
                          ? 'font-medium text-blue-700 hover:bg-blue-50'
                          : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {/* Largura reservada para o check: sem ela a lista dança de
                        um lado para o outro a cada clique. */}
                    <span className="w-3.5 shrink-0">
                      {item.ligado ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <Icone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.rotulo}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
