/**
 * A VERIFICAÇÃO DA REDE na gaveta de água e na de esgoto (28/09/2026, Etapa
 * 0.1 do roadmap hidrossanitário): pontas abertas e DN fora do necessário, com
 * o atalho para selecionar o trecho. O desenho mostra as mesmas marcas
 * (`marcasDeVerificacao`); aqui é a lista que se confere e se percorre.
 */
import React from 'react';
import type { DisciplinaDeRede } from '../../utils/blueprintKernel';
import { resumoDaVerificacao, type MarcaDeVerificacao } from '../../utils/blueprintVerificacaoRede';

interface Props {
  marcas: readonly MarcaDeVerificacao[];
  disciplinas: readonly DisciplinaDeRede[];
  onSelecionar: (ids: string[]) => void;
}

export default function PainelVerificacaoDaRede({ marcas, disciplinas, onSelecionar }: Props) {
  const { pontasAbertas, dnFora } = resumoDaVerificacao(marcas, disciplinas);
  const idsDasPontas = [...new Set(marcas.filter((m) => m.tipo === 'PONTA_ABERTA' && m.disciplina && disciplinas.includes(m.disciplina)).map((m) => m.alvoId))];
  if (pontasAbertas === 0 && dnFora.length === 0) {
    return (
      <p className="text-xs text-slate-500" data-testid="verificacao-rede-ok">
        Verificação: nenhuma ponta aberta{disciplinas.includes('ESGOTO') ? ' e todos os DN conferem com as UHC' : ''}.
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="verificacao-rede">
      <p className="text-xs font-semibold text-slate-700">Verificação da rede</p>
      {pontasAbertas > 0 && (
        <p className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800">
          <span>
            {pontasAbertas} ponta(s) aberta(s) — tubo que termina sem ligar em nada (anel vermelho no desenho).
          </span>
          <button type="button" className="shrink-0 font-medium text-blue-700 hover:underline" onClick={() => onSelecionar(idsDasPontas)}>
            Selecionar
          </button>
        </p>
      )}
      {dnFora.map((m) => (
        <p
          key={m.chave}
          className={`flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs ${m.severidade === 'ERRO' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
        >
          <span>
            {m.tipo === 'DN_MENOR' ? 'DN abaixo do necessário' : 'DN acima do necessário'}: {m.texto}
          </span>
          <button type="button" className="shrink-0 font-medium text-blue-700 hover:underline" onClick={() => onSelecionar([m.alvoId])}>
            Selecionar
          </button>
        </p>
      ))}
    </div>
  );
}
