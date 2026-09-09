import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, MessageSquare, Save } from 'lucide-react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import { casarComModelo, type PendenciaImportada } from '../../utils/blueprintBcfLeitura';
import { lerBcfZip } from '../../services/blueprintExportService';
import { guardarTopicosDoBcf } from '../../services/blueprintCommentService';

/**
 * Importar BCF — o que o projetista devolveu.
 *
 * ─── ⚠️ O QUE ESTA TELA MOSTRA DE PROPÓSITO: O QUE NÃO CASOU ────────────────
 *
 * Um BCF de coordenação fala do modelo de quem o escreveu, que tem peças que
 * não são nossas — e pode falar de peças que ALGUÉM APAGOU daqui. Esconder os
 * tópicos que não casam deixaria a lista bonita e mentirosa: o caso mais
 * importante de todos é justamente a pendência sobre a parede que sumiu.
 *
 * Por isso os dois grupos aparecem, e o que não casou vem com o motivo à vista.
 *
 * ─── ⚠️ GUARDAR É IDEMPOTENTE, E ERA A CONDIÇÃO DE EXISTIR ──────────────────
 *
 * Reimportar é o NORMAL: a rodada 2 de uma coordenação traz os tópicos da
 * rodada 1 dentro, agora respondidos. Sem identidade, cada rodada duplicaria a
 * discussão inteira — e em três rodadas ninguém mais acharia nada.
 *
 * `blueprint_comments.bcf_topic_guid` é essa identidade, e o `upsert` por
 * `(study_id, guid)` faz o segundo envio ATUALIZAR. Foi por isso que esta tela
 * passou uma fatia inteira sem gravar: fazê-lo antes da coluna seria mais
 * rápido naquele dia e caro na segunda importação.
 */
export default function PainelImportarBcf({
  model,
  organizationId,
  studyId,
  onSelecionar,
  onGuardado,
}: {
  model: BlueprintModel;
  organizationId: string;
  studyId: string;
  onSelecionar?: (uid: string) => void;
  /** Avisa quem mostra os comentários que a lista mudou. */
  onGuardado?: () => void;
}) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [pendencias, setPendencias] = useState<PendenciaImportada[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardados, setGuardados] = useState<number | null>(null);

  /**
   * Guarda tudo o que veio — inclusive o que NÃO casou.
   *
   * ⚠️ Guardar só o que casou perderia justamente a pendência sobre a peça que
   * alguém apagou, que é a que mais precisa de alguém olhando. O que não casa
   * entra ancorado no PONTO em vez do elemento.
   */
  async function guardar() {
    if (!pendencias?.length) return;
    setGuardando(true);
    setErro(null);
    try {
      const n = await guardarTopicosDoBcf(
        organizationId,
        studyId,
        pendencias.map((p) => ({
          bcfTopicGuid: p.guid,
          // Título e descrição num texto só: o comentário do estudo tem um
          // campo de texto, e separar em dois perderia a descrição inteira.
          texto: p.descricao ? `${p.titulo}\n\n${p.descricao}` : p.titulo,
          autorEmail: p.autor || null,
          elementUid: p.uidsCasados[0] ?? null,
          pontoXMm: 0,
          pontoYMm: 0,
          resolvido: p.status === 'Closed',
        })),
      );
      setGuardados(n);
      onGuardado?.();
    } catch (e) {
      // O erro aparece AQUI, ao lado do botão.
      setErro(e instanceof Error ? e.message : 'falha ao guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function ler(arquivo: File) {
    setLendo(true);
    setErro(null);
    try {
      const lidas = await lerBcfZip(arquivo);
      setPendencias(casarComModelo(lidas, model));
      setNome(arquivo.name);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não consegui ler o arquivo');
      setPendencias(null);
    } finally {
      setLendo(false);
    }
  }

  const casadas = pendencias?.filter((p) => p.uidsCasados.length > 0) ?? [];
  const soltas = pendencias?.filter((p) => p.uidsCasados.length === 0) ?? [];

  return (
    <div>
      <p className="text-[11px] text-slate-500">
        Abra o <code>.bcfzip</code> que voltou do Revit, do Navisworks ou do Solibri. As
        pendências são casadas com o desenho pelo identificador de cada elemento.
      </p>

      <label
        htmlFor="importar-bcf-arquivo"
        className="mt-2 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-slate-300 px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800"
      >
        {lendo ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileUp className="h-3.5 w-3.5" />
        )}
        {lendo ? 'Lendo…' : 'Escolher arquivo BCF'}
      </label>
      <input
        id="importar-bcf-arquivo"
        type="file"
        accept=".bcfzip,.bcf,.zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ler(f);
          e.target.value = '';
        }}
      />

      {erro && <p className="mt-2 text-[11px] text-red-700">{erro}</p>}

      {pendencias && (
        <div className="mt-3 space-y-2">
          <p className="truncate text-xs font-semibold text-slate-700" title={nome ?? ''}>
            {nome} · {pendencias.length}{' '}
            {pendencias.length === 1 ? 'pendência' : 'pendências'}
          </p>

          {pendencias.length === 0 && (
            <p className="text-[11px] text-slate-500">
              O arquivo abriu e não tem tópico nenhum dentro.
            </p>
          )}

          {casadas.map((p) => (
            <div key={p.guid} className="rounded-md border border-slate-200 px-2 py-1.5">
              <div className="flex items-start gap-1.5">
                {p.status === 'Closed' ? (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                ) : (
                  <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                )}
                <div className="min-w-0 text-[11px] text-slate-700">
                  <strong>{p.titulo}</strong>
                  {p.status === 'Closed' && (
                    <span className="ml-1 text-[10px] text-emerald-700">resolvido</span>
                  )}
                  {p.descricao && (
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      {p.descricao}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {p.autor || 'sem autor'}
                    {p.criadoEm ? ` · ${p.criadoEm.slice(0, 10)}` : ''}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {p.uidsCasados.map((uid) => (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => onSelecionar?.(uid)}
                    className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    achar no desenho
                  </button>
                ))}
              </div>
            </div>
          ))}

          {soltas.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
              <p className="flex items-start gap-1.5 text-[11px] text-slate-700">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                <span>
                  <strong>{soltas.length}</strong>{' '}
                  {soltas.length === 1 ? 'pendência não casou' : 'pendências não casaram'} com
                  este desenho.
                  {/* ⚠️ Estas são as que mais importam: podem ser peças de outro
                      modelo, ou peças que alguém APAGOU daqui — e a segunda é
                      uma pendência sobre algo que deixou de existir. */}
                  <span className="mt-0.5 block text-[10px] text-slate-600">
                    Ou falam de peças de outro modelo, ou de peças que já não existem neste
                    desenho.
                  </span>
                </span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {soltas.map((p) => (
                  <li key={p.guid} className="text-[10px] text-slate-600">
                    · {p.titulo || '(sem título)'}
                    {p.ifcDeclarado?.nome ? ` — de ${p.ifcDeclarado.nome}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendencias.length > 0 && (
            <div>
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardar()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Save className="h-3 w-3" />
                {guardando ? 'Guardando…' : 'Guardar como comentários'}
              </button>
              {guardados !== null && (
                <p className="mt-1 text-[11px] text-emerald-700">
                  {guardados} {guardados === 1 ? 'pendência guardada' : 'pendências guardadas'} —
                  veja em <strong>Comentários</strong>.
                </p>
              )}
              {/* ⚠️ A frase existe porque reimportar é o NORMAL: a rodada 2 traz
                  os tópicos da rodada 1 dentro, respondidos. Quem não souber
                  disso evita reimportar com medo de duplicar. */}
              <p className="mt-1 text-[10px] text-slate-500">
                Importar o mesmo arquivo de novo <strong>atualiza</strong> as pendências em
                vez de duplicá-las — cada tópico é reconhecido pelo identificador dele.
                Fechado do outro lado entra como <strong>resolvido</strong> aqui.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
