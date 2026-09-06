import React from 'react';

/**
 * Quanto a peça selecionada custa, segundo a prévia do orçamento.
 *
 * ─── POR QUE ISTO NÃO É SÓ UM NÚMERO ────────────────────────────────────────
 *
 * O custo sai do QUANTITATIVO DA VERSÃO PUBLICADA, não do desenho que está na
 * tela — é o que torna a linha conferível contra a revisão que ela cita. Só que
 * quem olha o painel está vendo o desenho ATUAL. Se houver rascunho não
 * publicado, os dois podem discordar, e um custo plausível e desatualizado é
 * pior que custo nenhum: ninguém confere um número que parece certo.
 *
 * Por isso `desatualizado` não é opcional na prática — quem monta este
 * componente tem o `dirtySincePublish` à mão, e esconder isso seria escolher a
 * tela mais limpa em vez da verdadeira.
 *
 * ─── QUANDO NÃO APARECE ─────────────────────────────────────────────────────
 *
 * Sem prévia calculada, nada. Pedir a prévia custa uma ida ao banco e ao
 * catálogo, e fazê-la sozinha ao selecionar uma parede seria cobrar isso de
 * quem só queria mover a peça. Ausência aqui significa "ninguém perguntou
 * ainda", e não "custa zero" — por isso o componente some em vez de mostrar
 * R$ 0,00.
 */
export default function CustoDoElemento({
  custo,
  desatualizado,
}: {
  custo: { totalBRL: number; linhas: number } | undefined;
  desatualizado: boolean;
}) {
  if (!custo) return null;

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <span className="text-xs font-semibold text-slate-500">Custo no orçamento</span>
      <p className="text-sm font-medium text-slate-800">
        {custo.totalBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        <span className="ml-1.5 text-[11px] font-normal text-slate-400">
          {custo.linhas} linha{custo.linhas > 1 ? 's' : ''}
        </span>
      </p>
      {desatualizado && (
        <p className="mt-0.5 text-[10px] text-amber-700">
          Da última versão publicada — o desenho tem alterações não publicadas.
        </p>
      )}
    </div>
  );
}
