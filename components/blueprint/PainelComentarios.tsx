import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, MessageSquare, Trash2, Undo2 } from 'lucide-react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import {
  resumo as resumirComentarios,
  situarComentarios,
  type ComentarioNaTela,
} from '../../utils/blueprintComentarios';
import {
  apagarComentario,
  criarComentario,
  listarComentarios,
  resolverComentario,
  type BlueprintComment,
} from '../../services/blueprintCommentService';

/**
 * Comentários ancorados em elemento (Etapa 5 do roadmap BIM, RF-143).
 *
 * ─── O QUE ESTA TELA PRECISA DIZER, E QUASE NENHUMA DIZ ─────────────────────
 *
 * Que o elemento comentado SUMIU. Um comentário sobre uma parede apagada não
 * pode simplesmente desaparecer da lista: quem o escreveu nunca saberia que o
 * assunto virou pó junto com a peça. Ele fica, marcado, e quem for resolver
 * decide o que fazer.
 *
 * ─── RESOLVER NÃO APAGA ─────────────────────────────────────────────────────
 *
 * A pendência e a decisão de fechá-la são as duas metades do registro. Apagar
 * leva a discussão junto — e é justamente a discussão que alguém vai procurar
 * daqui a seis meses, quando perguntarem por que a parede mudou.
 */
interface Props {
  model: BlueprintModel;
  studyId: string;
  organizationId: string;
  /** A revisão que está sendo olhada, quando há uma publicada. */
  snapshotId?: string | null;
  /** O `uid` do elemento selecionado no canvas. Sem ele o comentário é de LUGAR. */
  selecionadoUid?: string | null;
  /** Rótulo curto do selecionado, para a tela dizer sobre o que se comenta. */
  selecionadoRotulo?: string | null;
  /** Centro do desenho ou do selecionado, para ancorar o comentário de lugar. */
  pontoPadrao?: { x: number; y: number } | null;
}

const quando = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export default function PainelComentarios({
  model,
  studyId,
  organizationId,
  snapshotId,
  selecionadoUid,
  selecionadoRotulo,
  pontoPadrao,
}: Props) {
  const [comentarios, setComentarios] = useState<BlueprintComment[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [gravando, setGravando] = useState(false);
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setComentarios(await listarComentarios(studyId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [studyId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const situados = useMemo(
    () => situarComentarios(comentarios, model),
    [comentarios, model],
  );
  const contagem = useMemo(() => resumirComentarios(situados), [situados]);
  const visiveis = mostrarResolvidos
    ? situados
    : situados.filter((s) => !s.comentario.resolvido_em);

  async function comentar() {
    const limpo = texto.trim();
    if (!limpo) return;
    setGravando(true);
    setErro(null);
    try {
      await criarComentario({
        organizationId,
        studyId,
        snapshotId: snapshotId ?? null,
        elementUid: selecionadoUid ?? null,
        // O ponto vai JUNTO do elemento, e não só quando não há elemento: se a
        // peça for apagada depois, é ele que diz onde o assunto era.
        pontoXMm: pontoPadrao?.x ?? null,
        pontoYMm: pontoPadrao?.y ?? null,
        texto: limpo,
      });
      setTexto('');
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }

  async function alternarResolvido(c: BlueprintComment) {
    setErro(null);
    try {
      await resolverComentario(c.id, !c.resolvido_em);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function apagar(c: BlueprintComment) {
    setErro(null);
    try {
      await apagarComentario(c.id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="px-4 py-3">
      {/* ── Escrever ───────────────────────────────────────────────────── */}
      <p className="text-[11px] text-slate-500">
        {selecionadoUid
          ? `Sobre ${selecionadoRotulo || 'a peça selecionada'}. O comentário segue a peça quando ela se move.`
          : 'Nada selecionado: o comentário fica no lugar do desenho. Selecione uma peça para ancorar nela.'}
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="O que precisa ser resolvido aqui?"
        aria-label="Texto do comentário"
        className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800"
      />
      <button
        type="button"
        onClick={() => void comentar()}
        disabled={!texto.trim() || gravando}
        className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40"
      >
        {gravando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
        Comentar
      </button>

      {erro && <p className="mt-2 text-[11px] text-red-700">{erro}</p>}

      {/* ── Resumo ─────────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
        <p className="text-[11px] text-slate-600">
          {contagem.abertos} aberto{contagem.abertos === 1 ? '' : 's'}
          {contagem.resolvidos > 0 && ` · ${contagem.resolvidos} resolvido${contagem.resolvidos === 1 ? '' : 's'}`}
        </p>
        {contagem.resolvidos > 0 && (
          <button
            type="button"
            onClick={() => setMostrarResolvidos((v) => !v)}
            className="text-[11px] text-slate-500 transition-colors hover:text-slate-700"
          >
            {mostrarResolvidos ? 'Só abertos' : 'Ver resolvidos'}
          </button>
        )}
      </div>

      {contagem.orfaos > 0 && (
        <p className="mt-1 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {contagem.orfaos} comentário{contagem.orfaos === 1 ? '' : 's'} aponta
          {contagem.orfaos === 1 ? '' : 'm'} para peça que não existe mais nesta revisão. Continua
          {contagem.orfaos === 1 ? '' : 'm'} na lista de propósito — ninguém decidiu fechá-
          {contagem.orfaos === 1 ? 'lo' : 'los'}.
        </p>
      )}

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      {carregando ? (
        <p className="mt-2 text-[11px] text-slate-400">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-400">Nenhum comentário.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {visiveis.map((s) => (
            <Comentario
              key={s.comentario.id}
              situado={s}
              onAlternar={() => void alternarResolvido(s.comentario)}
              onApagar={() => void apagar(s.comentario)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Comentario({
  situado,
  onAlternar,
  onApagar,
}: {
  situado: ComentarioNaTela<BlueprintComment>;
  onAlternar: () => void;
  onApagar: () => void;
}) {
  const c = situado.comentario;
  const resolvido = Boolean(c.resolvido_em);
  return (
    <li
      className={`rounded-md border px-2 py-1.5 ${
        resolvido ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'
      }`}
    >
      <p className={`text-xs ${resolvido ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
        {c.texto}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-slate-400">
          {c.autor_email || 'sem autor'} · {quando(c.created_at)}
          {situado.situacao === 'ELEMENTO_SUMIU' && ' · peça removida'}
          {situado.situacao === 'LUGAR' && ' · no desenho'}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onAlternar}
            title={resolvido ? 'Reabrir' : 'Marcar como resolvido'}
            aria-label={resolvido ? 'Reabrir comentário' : 'Marcar comentário como resolvido'}
            className="rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
          >
            {resolvido ? <Undo2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={onApagar}
            title="Apagar"
            aria-label="Apagar comentário"
            className="rounded p-1 text-slate-400 transition-colors hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>
      </div>
    </li>
  );
}
