/**
 * OS MEMORIAIS HIDROSSANITÁRIOS na gaveta (28/09/2026, E3.1/E3.2): o de
 * cálculo e o descritivo, derivados do desenho na hora, cada um em PDF ou
 * DOCX. A lista de seções é o sumário do que vai sair — o usuário vê antes de
 * baixar que o esgoto está lá e a água não, por exemplo.
 */
import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
import type { BlocoDoMemorial } from '../../utils/blueprintMemorialHidro';

export type QualMemorial = 'calculo' | 'descritivo';
export type FormatoDoMemorial = 'pdf' | 'docx';

interface Props {
  calculo: BlocoDoMemorial[];
  descritivo: BlocoDoMemorial[];
  onBaixar: (qual: QualMemorial, formato: FormatoDoMemorial) => Promise<void>;
}

const secoes = (b: BlocoDoMemorial[]) => b.filter((x) => x.tipo === 'secao').map((x) => (x as { texto: string }).texto);

function Cartao({
  titulo,
  descricao,
  blocos,
  gerando,
  ocupado,
  onBaixar,
}: {
  titulo: string;
  descricao: string;
  blocos: BlocoDoMemorial[];
  /** O formato que ESTE cartão está gerando. */
  gerando: FormatoDoMemorial | null;
  /** Algum arquivo (deste ou do outro cartão) está sendo gerado. */
  ocupado: boolean;
  onBaixar: (f: FormatoDoMemorial) => void;
}) {
  const lista = secoes(blocos);
  const vazio = lista.length === 0;
  const botao = 'inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white p-3" data-testid={`memorial-${titulo === 'Memorial de cálculo' ? 'calculo' : 'descritivo'}`}>
      <p className="text-sm font-semibold text-slate-800">{titulo}</p>
      <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>
      {vazio ? (
        <p className="mt-2 text-xs text-amber-700">O desenho não tem rede de água nem de esgoto — não há o que memorializar.</p>
      ) : (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
          {lista.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex gap-2">
        {(['pdf', 'docx'] as const).map((f) => (
          <button
            key={f}
            type="button"
            disabled={vazio || ocupado}
            title={vazio ? 'Sem rede hidrossanitária no desenho' : ocupado ? 'Aguarde: outro arquivo está sendo gerado' : undefined}
            onClick={() => onBaixar(f)}
            className={botao}
          >
            <FileDown className="h-3.5 w-3.5" />
            {gerando === f ? 'Gerando…' : f.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PainelMemoriaisHidro({ calculo, descritivo, onBaixar }: Props) {
  const [gerando, setGerando] = useState<{ qual: QualMemorial; formato: FormatoDoMemorial } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const baixar = async (qual: QualMemorial, formato: FormatoDoMemorial) => {
    setErro(null);
    setGerando({ qual, formato });
    try {
      await onBaixar(qual, formato);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setGerando(null);
    }
  };
  return (
    <div className="space-y-3" data-testid="memoriais-hidro">
      <Cartao
        titulo="Memorial de cálculo"
        descricao="Água trecho a trecho (ΣP, Q, DN, V, J, perdas, pressão) e ponto a ponto; esgoto por UHC, DN, declividade e cotas; caixas, colunas e reservatório."
        blocos={calculo}
        gerando={gerando?.qual === 'calculo' ? gerando.formato : null}
        ocupado={gerando !== null}
        onBaixar={(f) => void baixar('calculo', f)}
      />
      <Cartao
        titulo="Memorial descritivo"
        descricao="Objeto, normas, sistemas, materiais, peças, premissas e ensaios — montado dos mesmos dados."
        blocos={descritivo}
        gerando={gerando?.qual === 'descritivo' ? gerando.formato : null}
        ocupado={gerando !== null}
        onBaixar={(f) => void baixar('descritivo', f)}
      />
      {erro && <p className="text-xs text-red-700">{erro}</p>}
      <p className="text-xs text-slate-500">
        Os dois saem do desenho e das premissas atuais, com os mesmos números das marcas e da verificação. Mudou o desenho, gere de novo.
      </p>
    </div>
  );
}
