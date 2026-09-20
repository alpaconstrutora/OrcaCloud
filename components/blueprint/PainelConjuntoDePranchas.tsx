/**
 * CONJUNTO DE PRANCHAS (20/09/2026, roadmap E8.3) — dentro de Versões ›
 * Exportar: escolhe o template de prancha (de fábrica ou da organização),
 * mostra o PLANO (índice do que vai sair, numerado, com escala), edita o
 * carimbo/formato/escalas/inclusões da organização, salva como template e
 * gera o PDF do conjunto. O plano é derivado do modelo: pavimento a mais,
 * folha a mais.
 */
import React, { useMemo, useState } from 'react';
import { BookOpenCheck, FileStack, Save, Trash2 } from 'lucide-react';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import { ESCALAS } from '../../utils/blueprintExport';
import { planejarConjunto, rotuloDaEscala, validarNomeDoTemplateDePrancha, type InclusaoNoConjunto, type PapelId, type TemplateDePrancha, type TemplateDePranchaSalvo } from '../../utils/blueprintPranchas';

interface Props {
  modelo: BlueprintModel | null;
  templates: readonly TemplateDePranchaSalvo[];
  indisponivel?: string | null;
  /** O template em edição (vem do escolhido; muda localmente até salvar). */
  template: TemplateDePrancha;
  onTemplate: (t: TemplateDePrancha) => void;
  templateEscolhidoId: string;
  onEscolher: (id: string) => void;
  onGerar: () => void;
  gerando?: boolean;
  desabilitado?: boolean;
  onSalvar: (nome: string, t: TemplateDePrancha) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}

const ROTULO_INCLUIR: Record<keyof InclusaoNoConjunto, string> = { indice: 'Índice', plantas: 'Plantas por pavimento', humanizada: 'Plantas humanizadas (venda)', eletrica: 'Elétrica (+ quadro de cargas e unifilar)', cortes: 'Cortes', elevacoes: 'Fachadas', ampliacoes: 'Ampliações (banheiros e cozinhas)', tabelas: 'Quadro de áreas e esquadrias' };
const ROTULO_TIPO = { INDICE: 'Índice', PLANTA: 'Planta', HUMANIZADA: 'Humanizada', ELETRICA: 'Elétrica', QUADRO_DE_CARGAS: 'Quadro', UNIFILAR: 'Unifilar', CORTE: 'Corte', ELEVACAO: 'Fachada', AMPLIACAO: 'Ampliação', TABELAS: 'Tabelas' } as const;

export default function PainelConjuntoDePranchas({ modelo, templates, indisponivel = null, template, onTemplate, templateEscolhidoId, onEscolher, onGerar, gerando = false, desabilitado = false, onSalvar, onRemover }: Props) {
  const [editando, setEditando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const plano = useMemo(() => (modelo ? planejarConjunto(modelo, template) : []), [modelo, template]);
  const campo = 'h-7 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800';
  const escolhido = templates.find((t) => t.id === templateEscolhidoId);

  async function salvar() {
    if (nomeNovo === null) return;
    const erros = validarNomeDoTemplateDePrancha(nomeNovo, templates);
    if (erros.length) {
      setErro(erros[0]);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      await onSalvar(nomeNovo.trim(), template);
      setNomeNovo(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }
  const c = template.carimbo;
  const setCarimbo = (parte: Partial<TemplateDePrancha['carimbo']>) => onTemplate({ ...template, carimbo: { ...c, ...parte } });

  return (
    <div className="mt-4 rounded-[10px] border border-slate-200 bg-white p-3" data-testid="conjunto-de-pranchas">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <FileStack className="h-3.5 w-3.5" /> Conjunto de pranchas
      </h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Um PDF com todas as folhas: índice, planta por pavimento, cortes, fachadas, ampliações dos ambientes molhados e as tabelas — cada uma numerada e com o carimbo da organização. A escala pedida desce para a que couber, e o carimbo diz qual.
      </p>
      {indisponivel && <p className="mt-1 text-[11px] text-amber-800">Templates da organização sem persistência: {indisponivel}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-slate-600">
          Template
          <select value={templateEscolhidoId} onChange={(e) => onEscolher(e.target.value)} aria-label="Template de prancha" className={campo}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}{t.deFabrica ? ' (fábrica)' : ''}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setEditando((v) => !v)} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50" data-testid="editar-template-de-prancha">
          {editando ? 'Fechar edição' : 'Editar formato e carimbo'}
        </button>
        {escolhido && !escolhido.deFabrica && (
          <button type="button" onClick={() => void onRemover(escolhido.id)} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-700" aria-label={`Remover template ${escolhido.nome}`}>
            <Trash2 className="h-3 w-3" /> remover
          </button>
        )}
      </div>

      {editando && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-[6px] border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 md:grid-cols-3" data-testid="edicao-do-template-de-prancha">
          <label className="flex flex-col gap-0.5">
            Papel
            <select value={template.papel} onChange={(e) => onTemplate({ ...template, papel: e.target.value as PapelId })} aria-label="Papel do template de prancha" className={campo}>
              {(['A4', 'A3', 'A2', 'A1', 'A0'] as PapelId[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 self-end">
            <input type="checkbox" checked={template.paisagem} onChange={(e) => onTemplate({ ...template, paisagem: e.target.checked })} aria-label="Paisagem" className="h-3.5 w-3.5 rounded border-slate-300" /> Paisagem
          </label>
          <label className="flex items-center gap-1 self-end">
            <input type="checkbox" checked={template.cotas} onChange={(e) => onTemplate({ ...template, cotas: e.target.checked })} aria-label="Cotas nas plantas" className="h-3.5 w-3.5 rounded border-slate-300" /> Cotas
          </label>
          {(['denominadorPlanta', 'denominadorCortes', 'denominadorAmpliacao'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-0.5">
              {k === 'denominadorPlanta' ? 'Escala das plantas' : k === 'denominadorCortes' ? 'Escala de cortes/fachadas' : 'Escala das ampliações'}
              <select value={template[k]} onChange={(e) => onTemplate({ ...template, [k]: Number(e.target.value) })} aria-label={k === 'denominadorPlanta' ? 'Escala das plantas' : k === 'denominadorCortes' ? 'Escala de cortes e fachadas' : 'Escala das ampliações'} className={campo}>
                {ESCALAS.map((d) => <option key={d} value={d}>1:{d}</option>)}
              </select>
            </label>
          ))}
          <label className="col-span-2 flex flex-col gap-0.5 md:col-span-3">
            Empresa
            <input value={c.empresa} onChange={(e) => setCarimbo({ empresa: e.target.value })} aria-label="Empresa no carimbo" className={campo} />
          </label>
          <label className="flex flex-col gap-0.5">
            Responsável técnico
            <input value={c.responsavel} onChange={(e) => setCarimbo({ responsavel: e.target.value })} aria-label="Responsável técnico no carimbo" className={campo} />
          </label>
          <label className="flex flex-col gap-0.5">
            Registro (CAU/CREA)
            <input value={c.registro} onChange={(e) => setCarimbo({ registro: e.target.value })} aria-label="Registro profissional no carimbo" className={campo} />
          </label>
          <label className="flex flex-col gap-0.5">
            Prefixo da numeração
            <input value={c.prefixo} maxLength={4} onChange={(e) => setCarimbo({ prefixo: e.target.value })} aria-label="Prefixo da numeração das pranchas" className={campo} />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5 md:col-span-3">
            Cliente
            <input value={c.cliente} onChange={(e) => setCarimbo({ cliente: e.target.value })} aria-label="Cliente no carimbo" className={campo} />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5 md:col-span-3">
            Endereço da obra
            <input value={c.endereco} onChange={(e) => setCarimbo({ endereco: e.target.value })} aria-label="Endereço no carimbo" className={campo} />
          </label>
          <div className="col-span-2 md:col-span-3">
            <p className="mb-1 font-medium">Entram no conjunto</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(ROTULO_INCLUIR) as (keyof InclusaoNoConjunto)[]).map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <input type="checkbox" checked={template.incluir[k]} onChange={(e) => onTemplate({ ...template, incluir: { ...template.incluir, [k]: e.target.checked } })} aria-label={ROTULO_INCLUIR[k]} className="h-3.5 w-3.5 rounded border-slate-300" /> {ROTULO_INCLUIR[k]}
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-3">
            {nomeNovo === null ? (
              <button type="button" onClick={() => { setNomeNovo(''); setErro(null); }} className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50" data-testid="salvar-template-de-prancha">
                <Save className="h-3.5 w-3.5" /> Salvar como template da organização…
              </button>
            ) : (
              <>
                <input autoFocus value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); if (e.key === 'Escape') setNomeNovo(null); }} placeholder="Nome do template" aria-label="Nome do template de prancha" className={`${campo} w-56`} />
                <button type="button" disabled={ocupado} onClick={() => void salvar()} className="h-7 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="confirmar-template-de-prancha">Salvar</button>
              </>
            )}
            {erro && <span className="text-red-700" data-testid="erro-do-template-de-prancha">{erro}</span>}
          </div>
        </div>
      )}

      <div className="mt-2">
        <p className="text-[11px] font-medium text-slate-600">Plano do conjunto · {plano.length} prancha(s)</p>
        {plano.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nada a gerar — o desenho publicado não tem paredes ou tudo está desmarcado.</p>
        ) : (
          <ol className="mt-1 max-h-40 space-y-0.5 overflow-auto text-[11px] text-slate-700" data-testid="plano-do-conjunto">
            {plano.map((p) => (
              <li key={p.numero} className="flex items-center gap-2" aria-label={`Prancha ${p.numero}`}>
                <span className="w-10 font-mono text-slate-500">{p.numero}</span>
                <span className="w-16 text-slate-400">{ROTULO_TIPO[p.tipo]}</span>
                <span className="flex-1 truncate">{p.titulo}</span>
                <span className="text-slate-400">{rotuloDaEscala(p.denominador)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <button type="button" onClick={onGerar} disabled={desabilitado || gerando || plano.length === 0} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300" data-testid="gerar-conjunto">
        <BookOpenCheck className="h-3.5 w-3.5" /> {gerando ? 'Gerando…' : `Gerar conjunto (PDF, ${plano.length} folha(s))`}
      </button>
    </div>
  );
}
