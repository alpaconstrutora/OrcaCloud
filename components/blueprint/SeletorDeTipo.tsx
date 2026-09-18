/**
 * SELETOR DE TIPO — "aplicar tipo…" e "salvar tipo" para estrutura, ponto de
 * instalação, escada e telhado (18/09/2026, E1.1).
 *
 * É o bloco de tipos de `PainelCamadasParede`, generalizado: um `<select>` que
 * APLICA (copia as propriedades do tipo para a peça, num comando só) e um botão
 * que SALVA a peça atual como tipo, com o nome digitado inline — nunca
 * `window.prompt` (§14 do guia). O catálogo é da organização
 * (`blueprintElementTypeService`); a peça continua carregando os valores
 * copiados, e "N peças com esta assinatura" é o vínculo que existe.
 *
 * Falhar em carregar o catálogo não derruba o painel: os tipos são
 * conveniência, e a peça se edita à mão sem eles.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { forEachTargetOrg, useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import { listElementTypes, saveElementType, type TipoDeElemento } from '../../services/blueprintElementTypeService';
import {
  ROTULO_DA_FAMILIA_DE_TIPO,
  assinaturaDoTipo,
  nomeSugeridoDoTipo,
  resumoDoTipo,
  type FamiliaDeTipo,
  type PropriedadesDoTipo,
} from '../../utils/blueprintTipos';

interface Props {
  familia: FamiliaDeTipo;
  /** As propriedades da peça selecionada — o que "Salvar tipo" grava. */
  atual: PropriedadesDoTipo;
  /** Copia as propriedades do tipo escolhido para a peça (um comando, um Ctrl+Z). */
  onAplicar: (propriedades: PropriedadesDoTipo) => void;
  /** Quantas peças do desenho têm exatamente esta assinatura (a própria inclusive). */
  comAMesmaAssinatura?: number;
}

export default function SeletorDeTipo({ familia, atual, onAplicar, comAMesmaAssinatura }: Props) {
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const [tipos, setTipos] = useState<TipoDeElemento[]>([]);
  const [nomeDoTipo, setNomeDoTipo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const carregar = useCallback(() => {
    listElementTypes(orgId, familia)
      .then((lista) => {
        if (vivo.current) setTipos(lista);
      })
      .catch(() => {
        if (vivo.current) setTipos([]);
      });
  }, [orgId, familia]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const assinaturaAtual = assinaturaDoTipo(atual);
  // O tipo que a peça JÁ é, se houver — o select mostra em vez de "Aplicar tipo…".
  const tipoAtual = tipos.find((t) => assinaturaDoTipo(t.propriedades) === assinaturaAtual) ?? null;

  async function salvar(nome: string) {
    if (!nome.trim()) return;
    setNomeDoTipo(null);
    const target = await resolveWriteOrg('all-allowed');
    if (!target) return;
    const { ok, failed } = await forEachTargetOrg(target, (org) => saveElementType(org, nome.trim(), atual));
    setAviso(
      failed.length === 0 ? (ok > 1 ? `Tipo salvo em ${ok} organizações.` : 'Tipo salvo.') : `Salvo em ${ok}; ${failed.length} falharam.`,
    );
    carregar();
  }

  const rotuloFamilia = ROTULO_DA_FAMILIA_DE_TIPO[familia];
  return (
    <div className="mt-2 rounded-[10px] border border-slate-200 bg-white p-2.5" data-testid={`seletor-de-tipo-${familia.toLowerCase()}`}>
      <div className="flex items-center gap-1.5">
        <select
          value={tipoAtual?.id ?? ''}
          onChange={(e) => {
            const t = tipos.find((x) => x.id === e.target.value);
            // Cópia, e não o objeto do catálogo: editar a peça depois não pode
            // reescrever o tipo por referência compartilhada.
            if (t) onAplicar({ ...t.propriedades });
          }}
          disabled={tipos.length === 0}
          aria-label={`Aplicar um tipo de ${rotuloFamilia} salvo`}
          title={tipos.length === 0 ? 'Nenhum tipo salvo ainda nesta organização' : 'Copia as propriedades do tipo para esta peça'}
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">{tipos.length === 0 ? 'Nenhum tipo salvo' : tipoAtual ? 'Trocar de tipo…' : 'Aplicar tipo…'}</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} — {resumoDoTipo(t.propriedades)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNomeDoTipo(nomeSugeridoDoTipo(atual))}
          title={`Guarda estas propriedades como tipo de ${rotuloFamilia}, para reaplicar em outras peças`}
          className="flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-95"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Salvar tipo
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        {tipoAtual ? (
          <>
            Tipo <strong>{tipoAtual.nome}</strong>
          </>
        ) : (
          'Sem tipo salvo com estas propriedades'
        )}
        {comAMesmaAssinatura != null && comAMesmaAssinatura > 0 && (
          <>
            {' · '}
            {comAMesmaAssinatura === 1 ? 'só esta peça' : `${comAMesmaAssinatura} peças iguais no desenho`}
          </>
        )}
      </p>
      {nomeDoTipo !== null && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            autoFocus
            value={nomeDoTipo}
            onChange={(e) => setNomeDoTipo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void salvar(nomeDoTipo);
              if (e.key === 'Escape') setNomeDoTipo(null);
            }}
            aria-label={`Nome do tipo de ${rotuloFamilia}`}
            className="h-8 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="button"
            onClick={() => void salvar(nomeDoTipo)}
            disabled={!nomeDoTipo.trim()}
            className="h-8 shrink-0 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setNomeDoTipo(null)}
            className="h-8 shrink-0 px-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            Cancelar
          </button>
        </div>
      )}
      {aviso && <p className="mt-1.5 text-[11px] text-emerald-700">{aviso}</p>}
      {orgTargetModal}
    </div>
  );
}
