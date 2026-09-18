import React from 'react';
import { AlertTriangle, CheckCircle2, Share2 } from 'lucide-react';
import { rotuloCurto, type BlueprintModel, type Conflito, type ConflitoArquitetonico } from '../../utils/blueprintKernel';
import { nomeDoTipoDeAbertura } from '../../utils/blueprintKernel';
import { ROTULO_DA_DISCIPLINA } from '../../utils/blueprintRede';

/**
 * A lista de CONFLITOS de instalação.
 *
 * ⚠️ Ela não oferece "resolver". Um conflito não se resolve numa lista: resolve-se
 * mudando o desenho — desviando o cano, mudando a cota, mexendo na viga. Um
 * botão de dispensar aqui criaria um estado "conhecido e ignorado" que
 * sobreviveria à mudança que o eliminou, e a lista passaria a mentir nos dois
 * sentidos: escondendo o que voltou e mostrando o que já foi.
 *
 * A lista é DERIVADA, recalculada a cada mudança. Some sozinha quando o desenho
 * deixa de ter o problema, e é assim que ela continua verdadeira.
 */
export default function PainelConflitos({
  model,
  conflitos,
  arquitetonicos = [],
  onSelecionar,
  onExportarBcf,
}: {
  model: BlueprintModel;
  conflitos: Conflito[];
  /** Clash arquitetônico (E0.4): vão × estrutura, escada × pilar, escada × altura livre. */
  arquitetonicos?: ConflitoArquitetonico[];
  onSelecionar?: (id: string) => void;
  /** Leva as pendências para fora, em BCF. Ausente = o botão não aparece. */
  onExportarBcf?: () => Promise<void>;
}) {
  const [exportando, setExportando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  /**
   * O botão de exportar.
   *
   * ⚠️ Ele aparece MESMO SEM CONFLITO, e é de propósito: o BCF leva também os
   * COMENTÁRIOS ancorados, e um desenho pode ter zero conflitos e dez
   * comentários para o projetista. Esconder o botão quando a lista de conflitos
   * está vazia trancaria a outra metade da coordenação atrás de um conflito.
   */
  const botao = onExportarBcf ? (
    <div className="mt-2">
      <button
        type="button"
        disabled={exportando}
        onClick={async () => {
          setExportando(true);
          setErro(null);
          try {
            await onExportarBcf();
          } catch (e) {
            // O erro aparece AQUI, ao lado do botão — ver `PainelVersoes`.
            setErro(e instanceof Error ? e.message : 'falha ao exportar o BCF');
          } finally {
            setExportando(false);
          }
        }}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        <Share2 className="h-3 w-3" /> {exportando ? 'Gerando…' : 'Exportar BCF'}
      </button>
      {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
      <p className="mt-1 text-[11px] text-slate-500">
        Conflitos <strong>e comentários</strong> num arquivo que Revit, Navisworks e
        Solibri abrem.{' '}
        <strong>Mande o IFC junto</strong>: o BCF aponta os elementos por identificador e
        não os descreve — sozinho, ele abre sem nada para selecionar.
      </p>
    </div>
  ) : null;
  if (conflitos.length === 0 && arquitetonicos.length === 0) {
    return (
      <>
      <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
        <span>
          Nenhum conflito: instalação × estrutura, entre disciplinas, pilar × vão, escada × estrutura.
          <span className="mt-0.5 block text-[10px]">
            Cano dentro de parede e pilar dentro de parede <strong>não</strong> contam — é onde eles moram.
          </span>
        </span>
      </p>
      {botao}
      </>
    );
  }

  /** O nome da peça arquitetônica atingida, como o navegador a chama. */
  const nomeDaPeca = (c: ConflitoArquitetonico) => {
    if (c.familia === 'opening') {
      const o = model.openings.find((x) => x.id === c.pecaId);
      return o ? `${nomeDoTipoDeAbertura(o.kind)} ${rotuloCurto(o.uid, 'opening')}` : c.pecaId;
    }
    const e = (model.stairs ?? []).find((x) => x.id === c.pecaId);
    return e ? e.rotulo || `${e.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${rotuloCurto(e.uid, 'stair')}` : c.pecaId;
  };
  const nomeDaEstrutura = (id: string) => {
    const s = model.structures.find((x) => x.id === id);
    return s ? s.rotulo || rotuloCurto(s.uid, 'structural') : id;
  };
  const comoArquitetonico = (c: ConflitoArquitetonico) =>
    c.classe === 'VAO_X_ESTRUTURA'
      ? `${c.medidaMm} mm do vão tomados pela estrutura — a esquadria não fecha`
      : c.classe === 'ESCADA_X_PILAR'
        ? `pilar dentro do percurso (≈ ${c.medidaMm} mm de lado em comum)`
        : `faltam ${c.medidaMm} mm para os 2,10 m livres sobre o degrau (NBR 9077)`;

  const nomeDoTrecho = (id: string) => {
    const t = (model.trechos ?? []).find((x) => x.id === id);
    if (!t) return id;
    return `${ROTULO_DA_DISCIPLINA[t.disciplina]} ${t.rotulo || rotuloCurto(t.uid, 'trecho')}`;
  };

  const nomeDoOutro = (c: Conflito) => {
    if (c.classe === 'REDE') return nomeDoTrecho(c.outroId);
    const s = model.structures.find((x) => x.id === c.outroId);
    return s ? s.rotulo || rotuloCurto(s.uid, 'structural') : c.outroId;
  };

  return (
    <div className="space-y-1.5">
      {arquitetonicos.map((c) => (
        <button
          key={`arq-${c.pecaId}-${c.outroId}`}
          type="button"
          onClick={() => onSelecionar?.(c.pecaId)}
          className="flex w-full items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-left hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span className="min-w-0 text-[11px] text-slate-700">
            <strong>{nomeDaPeca(c)}</strong> encontra <strong>{nomeDaEstrutura(c.outroId)}</strong>
            <span className="mt-0.5 block text-[10px] text-slate-500">{comoArquitetonico(c)}</span>
          </span>
        </button>
      ))}
      {conflitos.map((c) => (
        <button
          key={`${c.trechoId}-${c.outroId}`}
          type="button"
          onClick={() => onSelecionar?.(c.trechoId)}
          className="flex w-full items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-left hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span className="min-w-0 text-[11px] text-slate-700">
            <strong>{nomeDoTrecho(c.trechoId)}</strong> encontra{' '}
            <strong>{nomeDoOutro(c)}</strong>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              {/* O número que decide o que fazer: atravessar 200 mm de viga é
                  um furo; roçar de raspão pode ser só um ajuste de cota. */}
              {c.comprimentoDentroMm > 0
                ? `${(c.comprimentoDentroMm / 1000).toFixed(3)} m por dentro`
                : `de raspão — ${Math.round(c.folgaEntreEixosMm)} mm entre os eixos`}
            </span>
          </span>
        </button>
      ))}
      {botao}
    </div>
  );
}
