import React from 'react';
import { AlertTriangle, CheckCircle2, Share2, ShieldCheck, Undo2 } from 'lucide-react';
import { rotuloCurto, type BlueprintModel, type Conflito, type ConflitoArquitetonico } from '../../utils/blueprintKernel';
import { CATALOGO_DE_COMPONENTES, nomeDoTipoDeAbertura } from '../../utils/blueprintKernel';
import { ROTULO_DA_DISCIPLINA } from '../../utils/blueprintRede';
import { classificarArq, classificarMep, validarJustificativa, type AceiteDeConflito, type ConflitoComStatus } from '../../utils/blueprintConflitoStatus';

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
 *
 * STATUS (20/09/2026, backlog P2): o que existe é ACEITAR, com justificativa e
 * autor, por par de peças — a decisão de projeto, não a dispensa. O aceito sai
 * da contagem e fica numa seção própria, visível; se o encontro CRESCER além
 * do aceito, volta a contar (regra em `blueprintConflitoStatus.ts`); vai como
 * `Closed` no BCF. Ver `utils/blueprintConflitoStatus.ts`.
 */
export default function PainelConflitos({
  model,
  conflitos,
  arquitetonicos = [],
  aceites,
  podeDecidir = true,
  onAceitar,
  onReabrir,
  onSelecionar,
  onExportarBcf,
}: {
  model: BlueprintModel;
  conflitos: Conflito[];
  /** Clash arquitetônico (E0.4): vão × estrutura, escada × pilar, escada × altura livre. */
  arquitetonicos?: ConflitoArquitetonico[];
  /** Aceites gravados por chave (par de uids). Ausente = sem status. */
  aceites?: ReadonlyMap<string, AceiteDeConflito>;
  /** LEITOR do estudo não decide (E10.1). */
  podeDecidir?: boolean;
  onAceitar?: (e: { chave: string; classe: string; medidaMm: number; justificativa: string }) => Promise<void>;
  onReabrir?: (aceite: AceiteDeConflito) => Promise<void>;
  onSelecionar?: (id: string) => void;
  /** Leva as pendências para fora, em BCF. Ausente = o botão não aparece. */
  onExportarBcf?: () => Promise<void>;
}) {
  const [exportando, setExportando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  /** O par em edição de aceite e o texto da justificativa. */
  const [aceitando, setAceitando] = React.useState<string | null>(null);
  const [justificativa, setJustificativa] = React.useState('');
  const [erroDoAceite, setErroDoAceite] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const mapa = aceites ?? new Map<string, AceiteDeConflito>();
  const arqComStatus = React.useMemo(() => classificarArq(arquitetonicos, mapa), [arquitetonicos, mapa]);
  const mepComStatus = React.useMemo(() => classificarMep(conflitos, mapa), [conflitos, mapa]);
  const abertos = [...arqComStatus.filter((c) => c.status === 'ABERTO'), ...mepComStatus.filter((c) => c.status === 'ABERTO')];
  const aceitos = [...arqComStatus.filter((c) => c.status === 'ACEITO'), ...mepComStatus.filter((c) => c.status === 'ACEITO')];

  async function confirmarAceite(c: ConflitoComStatus<unknown>) {
    const invalida = validarJustificativa(justificativa);
    if (invalida) {
      setErroDoAceite(invalida);
      return;
    }
    setOcupado(true);
    setErroDoAceite(null);
    try {
      await onAceitar?.({ chave: c.chave, classe: c.classe, medidaMm: c.medidaMm, justificativa: justificativa.trim() });
      setAceitando(null);
      setJustificativa('');
    } catch (e) {
      setErroDoAceite(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  /** O rodapé de status de uma linha: aceitar (aberto) ou o aviso de que cresceu. */
  const rodapeDeStatus = (c: ConflitoComStatus<unknown>) => (
    <span className="mt-1 flex flex-wrap items-center gap-2" data-testid={`status-${c.chave}`}>
      {c.cresceu && c.aceite && (
        <span className="rounded bg-red-100 px-1 text-[10px] font-medium text-red-800" data-testid="cresceu-desde-o-aceite">
          cresceu desde o aceite ({c.aceite.medidaMm} → {c.medidaMm} mm) — volta a contar
        </span>
      )}
      {podeDecidir && onAceitar && aceitando !== c.chave && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setAceitando(c.chave); setJustificativa(''); setErroDoAceite(null); }} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50" data-testid="aceitar-conflito">
          <ShieldCheck className="h-3 w-3" /> Aceitar…
        </button>
      )}
    </span>
  );

  const formularioDeAceite = (c: ConflitoComStatus<unknown>) =>
    aceitando === c.chave ? (
      <div className="mt-1 rounded-md border border-slate-200 bg-white p-2" data-testid="form-aceite" onClick={(e) => e.stopPropagation()}>
        <label className="block text-[10px] font-medium text-slate-600">
          Por que este conflito é aceito?
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} aria-label="Justificativa do aceite" placeholder="Ex.: o pilar será removido na etapa 2; o shaft fica provisório" className="mt-1 w-full rounded-[6px] border border-slate-300 px-2 py-1 text-[11px] text-slate-800" />
        </label>
        {erroDoAceite && <p className="mt-1 text-[10px] text-red-700" data-testid="erro-do-aceite">{erroDoAceite}</p>}
        <div className="mt-1 flex gap-2">
          <button type="button" disabled={ocupado} onClick={() => void confirmarAceite(c)} className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="confirmar-aceite">Aceitar</button>
          <button type="button" onClick={() => setAceitando(null)} className="rounded px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100">Cancelar</button>
        </div>
      </div>
    ) : null;

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
      <p className="flex items-start gap-1.5 text-[11px] text-slate-500" data-testid="sem-conflitos">
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
    if (c.familia === 'nucleo') {
      const n = (model.nucleos ?? []).find((x) => x.id === c.pecaId);
      return n ? n.rotulo || `${n.tipo === 'ELEVADOR' ? 'Elevador' : 'Shaft'} ${rotuloCurto(n.uid, 'nucleo')}` : c.pecaId;
    }
    if (c.familia === 'componente') {
      const p = (model.componentes ?? []).find((x) => x.id === c.pecaId);
      return p ? p.rotulo || `${CATALOGO_DE_COMPONENTES[p.tipoId]?.rotulo ?? p.tipoId} ${rotuloCurto(p.uid, 'componente')}` : c.pecaId;
    }
    const e = (model.stairs ?? []).find((x) => x.id === c.pecaId);
    return e ? e.rotulo || `${e.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${rotuloCurto(e.uid, 'stair')}` : c.pecaId;
  };
  const nomeDaEstrutura = (id: string, familia?: 'structural' | 'wall' | 'componente') => {
    if (familia === 'wall') {
      const w = model.walls.find((x) => x.id === id);
      return w ? `Parede ${rotuloCurto(w.uid, 'wall')}` : id;
    }
    if (familia === 'componente') {
      const p = (model.componentes ?? []).find((x) => x.id === id);
      return p ? p.rotulo || `${CATALOGO_DE_COMPONENTES[p.tipoId]?.rotulo ?? p.tipoId} ${rotuloCurto(p.uid, 'componente')}` : id;
    }
    const s = model.structures.find((x) => x.id === id);
    return s ? s.rotulo || rotuloCurto(s.uid, 'structural') : id;
  };
  const comoArquitetonico = (c: ConflitoArquitetonico) =>
    c.classe === 'VAO_X_ESTRUTURA'
      ? `${c.medidaMm} mm do vão tomados pela estrutura — a esquadria não fecha`
      : c.classe === 'ESCADA_X_PILAR'
        ? `pilar dentro do percurso (≈ ${c.medidaMm} mm de lado em comum)`
        : c.classe === 'NUCLEO_X_ESTRUTURA'
          ? `estrutura dentro do núcleo vertical (≈ ${c.medidaMm} mm de lado em comum) — o vazio não passa`
          : c.classe === 'RESERVA_X_ESTRUTURA'
            ? `estrutura dentro da reserva do equipamento (≈ ${c.medidaMm} mm de lado em comum)`
            : c.classe === 'RESERVA_X_PAREDE'
              ? `parede atravessando a reserva do equipamento (≈ ${c.medidaMm} mm de lado em comum)`
              : c.classe === 'RESERVA_X_COMPONENTE'
                ? `peça dentro da folga de manutenção do equipamento (≈ ${c.medidaMm} mm de lado em comum)`
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

  const ehArq = (c: ConflitoComStatus<unknown>): c is ConflitoComStatus<ConflitoArquitetonico> => 'pecaId' in (c.conflito as object);
  const titulo = (c: ConflitoComStatus<unknown>) =>
    ehArq(c) ? (
      <>
        <strong>{nomeDaPeca(c.conflito)}</strong> encontra <strong>{nomeDaEstrutura(c.conflito.outroId, c.conflito.outroFamilia)}</strong>
      </>
    ) : (
      <>
        <strong>{nomeDoTrecho((c.conflito as Conflito).trechoId)}</strong> encontra <strong>{nomeDoOutro(c.conflito as Conflito)}</strong>
      </>
    );
  const detalhe = (c: ConflitoComStatus<unknown>) => {
    if (ehArq(c)) return comoArquitetonico(c.conflito);
    const m = c.conflito as Conflito;
    // O número que decide o que fazer: atravessar 200 mm de viga é um furo;
    // roçar de raspão pode ser só um ajuste de cota.
    return m.comprimentoDentroMm > 0 ? `${(m.comprimentoDentroMm / 1000).toFixed(3)} m por dentro` : `de raspão — ${Math.round(m.folgaEntreEixosMm)} mm entre os eixos`;
  };
  const alvo = (c: ConflitoComStatus<unknown>) => (ehArq(c) ? c.conflito.pecaId : (c.conflito as Conflito).trechoId);
  const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

  return (
    <div className="space-y-1.5">
      {abertos.length === 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500" data-testid="sem-abertos">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
          <span>Nenhum conflito aberto — {aceitos.length} aceito(s) com justificativa abaixo.</span>
        </p>
      )}
      {abertos.map((c) => (
        <div
          key={`aberto-${c.chave}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelecionar?.(alvo(c))}
          onKeyDown={(e) => e.key === 'Enter' && onSelecionar?.(alvo(c))}
          className="flex w-full items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-left hover:bg-amber-100"
          data-testid="conflito-aberto"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 text-[11px] text-slate-700">
            {titulo(c)}
            <span className="mt-0.5 block text-[10px] text-slate-500">{detalhe(c)}</span>
            {rodapeDeStatus(c)}
            {formularioDeAceite(c)}
          </span>
        </div>
      ))}
      {aceitos.length > 0 && (
        <details className="rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5" data-testid="conflitos-aceitos">
          <summary className="cursor-pointer text-[11px] font-medium text-emerald-900">
            <ShieldCheck className="mr-1 inline h-3 w-3" /> Aceitos ({aceitos.length}) — fora da contagem, com justificativa
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {aceitos.map((c) => (
              <div key={`aceito-${c.chave}`} className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-[11px] text-slate-700" data-testid="conflito-aceito">
                <button type="button" onClick={() => onSelecionar?.(alvo(c))} className="text-left hover:underline">{titulo(c)}</button>
                <span className="mt-0.5 block text-[10px] text-slate-500">{detalhe(c)}</span>
                {c.aceite && (
                  <span className="mt-0.5 block text-[10px] text-emerald-900">
                    <em>“{c.aceite.justificativa}”</em> — {c.aceite.acceptedEmail ?? 'alguém'}, {data(c.aceite.createdAt)}, com {c.aceite.medidaMm} mm
                  </span>
                )}
                {podeDecidir && onReabrir && c.aceite && (
                  <button type="button" onClick={() => void onReabrir(c.aceite!)} className="mt-1 inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50" data-testid="reabrir-conflito">
                    <Undo2 className="h-3 w-3" /> Reabrir
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {botao}
    </div>
  );
}
