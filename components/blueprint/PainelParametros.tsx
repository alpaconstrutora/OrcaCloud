/**
 * PARÂMETROS PERSONALIZADOS da peça selecionada (18/09/2026, E1.2).
 *
 * Um campo por DEFINIÇÃO da organização que se aplica à família (ou a todas);
 * o valor gravado vai para `parametros` da peça pelo comando `SetParametros`
 * (um Ctrl+Z por campo). Valor cuja definição sumiu aparece como "sem
 * definição", legível e apagável — o desenho publicado é o que vale, não o
 * catálogo. "Nova definição" cria a definição inline (nome → chave de
 * programa derivada, tipo, unidade, opções), sem sair do painel.
 *
 * Falhar em carregar as definições não derruba o painel: mostra só o que a
 * peça já carrega.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListPlus, X } from 'lucide-react';
import { forEachTargetOrg, useOrgContext, useOrgWriteTarget } from '../../hooks/useOrgContext';
import {
  chaveDeParametroDoNome,
  listParameterDefinitions,
  saveParameterDefinition,
  type DefinicaoDeParametro,
  type TipoDeParametro,
} from '../../services/blueprintParameterDefinitionService';
import type { FamiliaComParametros, Parametros, ValorDeParametro } from '../../utils/blueprintKernel';
import { VARIAVEIS_DO_PAVIMENTO, VARIAVEIS_NATIVAS, avaliarDefinicoes, erroDeSintaxe, formatarValor, type Variaveis } from '../../utils/blueprintFormulas';

export const ROTULO_DA_FAMILIA_COM_PARAMETROS: Record<FamiliaComParametros, string> = {
  wall: 'parede',
  opening: 'esquadria',
  structural: 'estrutura',
  roof: 'telhado',
  stair: 'escada',
  trecho: 'trecho',
  terminal: 'ponto',
  quadro: 'quadro',
};

const ROTULO_DO_TIPO: Record<TipoDeParametro, string> = {
  NUMERO: 'Número',
  TEXTO: 'Texto',
  BOOLEANO: 'Sim/não',
  LISTA: 'Lista de opções',
};

interface Props {
  familia: FamiliaComParametros;
  /** Muda a cada peça — reinicia os rascunhos dos campos. */
  pecaId: string;
  parametros: Parametros | undefined;
  /** Grava (valor) ou apaga (`null`) chaves — um comando. */
  onSet: (valores: Record<string, ValorDeParametro | null>) => void;
  /** As variáveis da peça para as FÓRMULAS (E1.3) — `variaveisDaPeca(model, alvo)`. */
  variaveis?: Variaveis;
  /** As definições já carregadas pelo editor (E1.5) — evita uma ida ao banco por painel. */
  definicoes?: DefinicaoDeParametro[];
  /** Avisa o editor que uma definição nova foi salva, para ele recarregar. */
  onDefinicoesMudaram?: () => void;
}

export default function PainelParametros({ familia, pecaId, parametros, onSet, variaveis, definicoes: definicoesDeFora, onDefinicoesMudaram }: Props) {
  const { orgId } = useOrgContext();
  const { resolveWriteOrg, orgTargetModal } = useOrgWriteTarget();
  const [definicoesLocais, setDefinicoesLocais] = useState<DefinicaoDeParametro[]>([]);
  const definicoes = definicoesDeFora ?? definicoesLocais;
  const setDefinicoes = setDefinicoesLocais;
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  const carregar = useCallback(() => {
    if (definicoesDeFora) {
      onDefinicoesMudaram?.();
      return;
    }
    listParameterDefinitions(orgId)
      .then((lista) => {
        if (vivo.current) setDefinicoes(lista);
      })
      .catch(() => {
        if (vivo.current) setDefinicoes([]);
      });
  }, [orgId, definicoesDeFora, onDefinicoesMudaram]);
  useEffect(() => {
    if (!definicoesDeFora) carregar();
  }, [carregar, definicoesDeFora]);

  const daFamilia = useMemo(() => definicoes.filter((d) => d.familia === null || d.familia === familia), [definicoes, familia]);
  const chavesDefinidas = new Set(daFamilia.map((d) => d.chave));
  // FÓRMULAS (E1.3): calculadas a cada render, nunca gravadas — mudar a
  // geometria muda o valor na hora. Uma cita a outra pela chave.
  const calculados = useMemo(() => {
    const r = avaliarDefinicoes(daFamilia.map((d) => ({ chave: d.chave, formula: d.formula })), variaveis ?? {});
    return new Map(r.map((x) => [x.chave, x]));
  }, [daFamilia, variaveis]);
  const semDefinicao = Object.entries(parametros ?? {}).filter(([k]) => !chavesDefinidas.has(k));

  // ── Nova definição (inline) ────────────────────────────────────────────────
  const [nova, setNova] = useState<{ nome: string; tipo: TipoDeParametro; unidade: string; opcoes: string; todas: boolean; formula: string } | null>(null);
  const [mostrarVariaveis, setMostrarVariaveis] = useState(false);
  const erroDaFormula = nova?.formula.trim() ? erroDeSintaxe(nova.formula) : null;
  const [aviso, setAviso] = useState<string | null>(null);
  async function salvarDefinicao() {
    if (!nova || !nova.nome.trim() || erroDaFormula) return;
    const chave = chaveDeParametroDoNome(nova.nome);
    const target = await resolveWriteOrg('all-allowed');
    if (!target) return;
    const { ok, failed } = await forEachTargetOrg(target, (org) =>
      saveParameterDefinition(org, {
        chave,
        nome: nova.nome,
        familia: nova.todas ? null : familia,
        tipo: nova.tipo,
        unidade: nova.unidade,
        opcoes: nova.opcoes.split(/[;\n]/).map((o) => o.trim()).filter(Boolean),
        compartilhado: true,
        formula: nova.formula,
      }),
    );
    setAviso(failed.length === 0 ? `Definição "${nova.nome.trim()}" salva (chave ${chave}).` : `Salva em ${ok}; ${failed.length} falharam.`);
    setNova(null);
    carregar();
  }

  return (
    <div className="mt-3 rounded-[10px] border border-slate-200 bg-white p-3" data-testid="painel-parametros">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">Parâmetros personalizados</p>
        <button
          type="button"
          onClick={() => setNova({ nome: '', tipo: 'TEXTO', unidade: '', opcoes: '', todas: false, formula: '' })}
          title="Cria uma definição de parâmetro da organização — o campo passa a existir em toda peça desta família"
          className="flex h-7 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600"
        >
          <ListPlus className="h-3.5 w-3.5" />
          Nova definição
        </button>
      </div>

      {daFamilia.length === 0 && semDefinicao.length === 0 && !nova && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          Nenhuma definição para {ROTULO_DA_FAMILIA_COM_PARAMETROS[familia]} nesta organização. Crie uma (fabricante, código, fck…) e ela aparece em toda peça da família.
        </p>
      )}

      {daFamilia.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {daFamilia.map((d) =>
            d.formula.trim() ? (
              <ValorCalculado key={`${pecaId}-${d.id}`} definicao={d} resultado={calculados.get(d.chave)} />
            ) : (
              <CampoDeParametro key={`${pecaId}-${d.id}`} definicao={d} valor={parametros?.[d.chave]} onSet={(v) => onSet({ [d.chave]: v })} />
            ),
          )}
        </div>
      )}

      {semDefinicao.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-slate-400">Sem definição nesta organização (o valor continua na peça):</p>
          {semDefinicao.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="min-w-0 flex-1 truncate">
                <code className="text-[11px]">{k}</code> = {String(v)}
              </span>
              <button type="button" onClick={() => onSet({ [k]: null })} aria-label={`Apagar parâmetro ${k}`} title="Apaga este valor da peça" className="text-slate-400 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {nova && (
        <div className="mt-2 space-y-1.5 rounded-[8px] border border-blue-200 bg-blue-50/40 p-2">
          <input
            autoFocus
            value={nova.nome}
            onChange={(e) => setNova({ ...nova, nome: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void salvarDefinicao();
              if (e.key === 'Escape') setNova(null);
            }}
            aria-label="Nome da nova definição de parâmetro"
            placeholder="Nome (ex.: Fabricante)"
            className="h-8 w-full rounded-[6px] border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-500"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <select value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoDeParametro })} aria-label="Tipo da nova definição" className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-xs">
              {(Object.keys(ROTULO_DO_TIPO) as TipoDeParametro[]).map((t) => (
                <option key={t} value={t}>{ROTULO_DO_TIPO[t]}</option>
              ))}
            </select>
            <input value={nova.unidade} onChange={(e) => setNova({ ...nova, unidade: e.target.value })} aria-label="Unidade da nova definição" placeholder="Unidade (MPa, m², …)" className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-xs" />
          </div>
          {nova.tipo === 'LISTA' && (
            <input value={nova.opcoes} onChange={(e) => setNova({ ...nova, opcoes: e.target.value })} aria-label="Opções da lista, separadas por ponto e vírgula" placeholder="Opções separadas por ; (ex.: madeira; alumínio; PVC)" className="h-8 w-full rounded-[6px] border border-slate-200 bg-white px-2 text-xs" />
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input type="checkbox" checked={nova.todas} onChange={(e) => setNova({ ...nova, todas: e.target.checked })} />
            Vale para todas as famílias (não só {ROTULO_DA_FAMILIA_COM_PARAMETROS[familia]})
          </label>
          {/* FÓRMULA (E1.3): opcional; com ela o campo vira calculado. Sintaxe
              conferida enquanto digita; a lista de variáveis é da família. */}
          {nova.tipo !== 'LISTA' && (
            <div>
              <input
                value={nova.formula}
                onChange={(e) => setNova({ ...nova, formula: e.target.value })}
                aria-label="Fórmula da nova definição (opcional)"
                placeholder="Fórmula (opcional) — ex.: area * custo_m2"
                className={`h-8 w-full rounded-[6px] border bg-white px-2 font-mono text-xs ${erroDaFormula ? 'border-amber-400' : 'border-slate-200'}`}
              />
              {erroDaFormula && <p className="mt-0.5 text-[10px] text-amber-700">{erroDaFormula}</p>}
              <button type="button" onClick={() => setMostrarVariaveis((v) => !v)} className="mt-0.5 text-[10px] text-blue-700 underline">
                {mostrarVariaveis ? 'ocultar variáveis' : 'variáveis disponíveis'}
              </button>
              {mostrarVariaveis && (
                <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                  {[...VARIAVEIS_NATIVAS[familia], ...VARIAVEIS_DO_PAVIMENTO].map((v) => `${v.nome} (${v.unidade})`).join(' · ')}
                  {daFamilia.length > 0 ? ` · parâmetros: ${daFamilia.map((d) => d.chave).join(', ')}` : ''}
                  {' · '}medidas em metro também existem em mm: largura_mm, altura_mm… · funções: se, min, max, arred, piso, teto, raiz, pot, abs, texto, numero, vazio.
                </p>
              )}
            </div>
          )}
          <p className="text-[10px] text-slate-400">Chave de programa: <code>{nova.nome.trim() ? chaveDeParametroDoNome(nova.nome) : '…'}</code></p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void salvarDefinicao()} disabled={!nova.nome.trim() || !!erroDaFormula} className="h-8 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white disabled:opacity-40">
              Salvar definição
            </button>
            <button type="button" onClick={() => setNova(null)} className="h-8 px-1.5 text-[13px] font-medium text-slate-500">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {aviso && <p className="mt-1.5 text-[11px] text-emerald-700">{aviso}</p>}
      {orgTargetModal}
    </div>
  );
}

/** O valor CALCULADO de uma definição com fórmula — só leitura; o erro aparece no lugar do número. */
function ValorCalculado({ definicao: d, resultado }: { definicao: DefinicaoDeParametro; resultado: { valor: ValorDeParametro | null; erro: string | null } | undefined }) {
  const rotulo = d.unidade ? `${d.nome} (${d.unidade})` : d.nome;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-slate-700" title={`= ${d.formula}`} data-testid={`parametro-calculado-${d.chave}`}>
      <span className="shrink-0">
        {rotulo} <span className="text-[10px] text-slate-400">ƒ</span>
      </span>
      {resultado?.erro ? (
        <span className="min-w-0 truncate text-right text-[11px] text-amber-700" title={resultado.erro}>{resultado.erro}</span>
      ) : (
        <span className="tabular-nums font-medium text-slate-800">{resultado && resultado.valor !== null ? formatarValor(resultado.valor) : '—'}</span>
      )}
    </div>
  );
}

/** Um campo, pelo tipo da definição. Número e texto gravam ao sair do campo (ou Enter); lista e sim/não, na hora. */
function CampoDeParametro({ definicao: d, valor, onSet }: { definicao: DefinicaoDeParametro; valor: ValorDeParametro | undefined; onSet: (v: ValorDeParametro | null) => void }) {
  const rotulo = d.unidade ? `${d.nome} (${d.unidade})` : d.nome;
  const [rascunho, setRascunho] = useState<string>(valor === undefined ? '' : String(valor));
  useEffect(() => {
    setRascunho(valor === undefined ? '' : String(valor));
  }, [valor]);
  const gravar = () => {
    const t = rascunho.trim();
    if (t === '') {
      if (valor !== undefined) onSet(null);
      return;
    }
    if (d.tipo === 'NUMERO') {
      const n = Number(t.replace(',', '.'));
      if (!Number.isFinite(n)) return;
      if (n !== valor) onSet(n);
      return;
    }
    if (t !== valor) onSet(t);
  };
  if (d.tipo === 'BOOLEANO') {
    return (
      <label className="flex items-center justify-between gap-2 text-xs text-slate-700">
        <span>{rotulo}</span>
        <input type="checkbox" checked={valor === true} onChange={(e) => onSet(e.target.checked ? true : null)} aria-label={rotulo} />
      </label>
    );
  }
  if (d.tipo === 'LISTA') {
    return (
      <label className="flex items-center justify-between gap-2 text-xs text-slate-700">
        <span className="shrink-0">{rotulo}</span>
        <select value={valor === undefined ? '' : String(valor)} onChange={(e) => onSet(e.target.value === '' ? null : e.target.value)} aria-label={rotulo} className="h-7 min-w-0 flex-1 rounded-[6px] border border-slate-200 bg-white px-1.5 text-xs">
          <option value="">—</option>
          {d.opcoes.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-700">
      <span className="shrink-0">{rotulo}</span>
      <input
        type={d.tipo === 'NUMERO' ? 'text' : 'text'}
        inputMode={d.tipo === 'NUMERO' ? 'decimal' : undefined}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={rotulo}
        className="h-7 w-36 rounded-[6px] border border-slate-200 bg-white px-1.5 text-right text-xs"
      />
    </label>
  );
}
