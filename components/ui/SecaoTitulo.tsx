// components/ui/SecaoTitulo.tsx
//
// Título de seção de formulário/bloco — o markup do §30 do
// `docs/ui_ux_guia_unificado.md` ("Malha do formulário"), com o slot de ações
// à direita que o guia mostra em `ContractModal.tsx`.
//
// ─── POR QUE VIROU COMPONENTE ───────────────────────────────────────────────
// Em 14/10/2026 o usuário mandou um print de Comercial › Empreendimentos ›
// Torres & Unidades: "confuso com campos sem uma ordem, sem separação clara".
// A causa não era falta de título — era cada bloco ter o SEU título, escrito à
// mão e derivado com o tempo: `h4 text-xs text-gray-500` no Terreno e nos
// Pavimentos, nenhum título nas Unidades, rótulo de 10px nos campos. Com um
// componente, o próximo bloco nasce no padrão em vez de copiar o vizinho.
//
// Regra do §17: no máximo UM botão azul sólido por linha de título — o resto
// das ações vai como `variant="secondary"`.

import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface SecaoTituloProps {
  icon: LucideIcon;
  titulo: string;
  /** Resumo curto ao lado do título: "17 andares · 60 unidades". */
  resumo?: React.ReactNode;
  /** Botões à direita (h-9, §17). Quebram linha em tela estreita. */
  acoes?: React.ReactNode;
  className?: string;
}

export const SecaoTitulo: React.FC<SecaoTituloProps> = ({ icon: Icon, titulo, resumo, acoes, className = '' }) => (
  <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-gray-100 pb-3 ${className}`}>
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-4 h-4 text-blue-600 shrink-0" />
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {resumo && <span className="text-xs text-gray-400 truncate">{resumo}</span>}
    </div>
    {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
  </div>
);

export default SecaoTitulo;
