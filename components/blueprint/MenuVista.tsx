/**
 * MENU "VISTA" (19/09/2026, roadmap E8.2) — ao lado de Exibir: COLORIR POR
 * (paleta dos ambientes), ESTILO DO 3D (sombreado / linha oculta /
 * transparente) e TEMPLATES DE VISTA (de fábrica + da organização): aplicar
 * de uma vez, salvar a vista atual com nome, remover. Popover no molde de
 * `MenuExibir`: fecha em clique fora e em Esc.
 *
 * Nada aqui toca no desenho — é o que a tela mostra. É por isso que o
 * template é da ORGANIZAÇÃO e não do estudo.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Palette, Save, Trash2 } from 'lucide-react';
import { MODOS_DE_COR, ROTULO_DO_MODO_DE_COR, type ItemDaLegenda, type ModoDeCor } from '../../utils/blueprintPaletas';
import { FILTROS_DE_FASE, ROTULO_DO_FILTRO_DE_FASE, type FiltroDeFase } from '../../utils/blueprintFases';
import { diferencas, ESTILOS_3D, ESTILOS_DA_PLANTA, mesmaConfiguracao, ROTULO_DO_ESTILO_3D, ROTULO_DO_ESTILO_DA_PLANTA, validarTemplate, type ConfiguracaoDeVista, type Estilo3d, type EstiloDaPlanta, type TemplateDeVista } from '../../utils/blueprintTemplatesDeVista';

interface Props {
  em3d: boolean;
  configuracaoAtual: ConfiguracaoDeVista;
  templates: readonly TemplateDeVista[];
  carregando?: boolean;
  indisponivel?: string | null;
  legenda: ItemDaLegenda[];
  onModoDeCor: (m: ModoDeCor) => void;
  onEstilo3d: (e: Estilo3d) => void;
  /** E8.4: técnica / humanizada. */
  onEstiloPlanta: (e: EstiloDaPlanta) => void;
  /** E10.2: filtro de fase da reforma. */
  onFase: (f: FiltroDeFase) => void;
  /** Resumo dos pisos da planta humanizada (padrão → quantos ambientes, quantos declarados). */
  resumoDosPisos?: readonly { rotulo: string; quantidade: number; declarados: number }[];
  onAplicar: (config: ConfiguracaoDeVista) => void;
  onSalvar: (nome: string) => Promise<void>;
  onRemover: (id: string) => Promise<void>;
}

export default function MenuVista({ em3d, configuracaoAtual, templates, carregando = false, indisponivel = null, legenda, onModoDeCor, onEstilo3d, onEstiloPlanta, onFase, resumoDosPisos = [], onAplicar, onSalvar, onRemover }: Props) {
  const [aberto, setAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  // Enquanto uma gravação está em curso (o modal de organização da REGRA #5
  // abre FORA desta caixa), o clique fora não fecha o popover — senão o erro
  // ou o "salvo" chegariam a um menu já fechado.
  const ocupadoRef = useRef(false);
  ocupadoRef.current = ocupado;

  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (ocupadoRef.current) return;
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !ocupadoRef.current) setAberto(false);
    }
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const ativo = templates.find((t) => mesmaConfiguracao(t.config, configuracaoAtual));
  const campo = 'h-7 w-full rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800';

  async function salvar() {
    if (nomeNovo === null) return;
    const erros = validarTemplate(nomeNovo, templates);
    if (erros.length) {
      setErro(erros[0]);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      await onSalvar(nomeNovo.trim());
      setNomeNovo(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Colorir por, estilo do 3D e templates de vista da organização"
        data-testid="menu-vista"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${aberto ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
      >
        <Palette className="h-3.5 w-3.5" />
        {ativo ? ativo.nome : configuracaoAtual.fase !== 'TUDO' ? (configuracaoAtual.fase === 'ANTES' ? 'Antes' : configuracaoAtual.fase === 'DEPOIS' ? 'Depois' : 'Demolição') : configuracaoAtual.estiloPlanta === 'HUMANIZADA' ? 'Humanizada' : configuracaoAtual.modoDeCor !== 'NENHUM' ? ROTULO_DO_MODO_DE_COR[configuracaoAtual.modoDeCor] : 'Vista'}
        <ChevronDown className="h-3 w-3" />
      </button>

      {aberto ? (
        <div role="dialog" aria-label="Vista: cores, estilo do 3D e templates" className="absolute left-0 top-full z-30 mt-1 w-80 rounded-[10px] border border-slate-200 bg-white p-3 shadow-lg" data-testid="painel-da-vista">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">
            Estilo da planta
            <select value={configuracaoAtual.estiloPlanta} onChange={(e) => onEstiloPlanta(e.target.value as EstiloDaPlanta)} aria-label="Estilo da planta" className={campo}>
              {ESTILOS_DA_PLANTA.map((e) => (
                <option key={e} value={e}>{ROTULO_DO_ESTILO_DA_PLANTA[e]}</option>
              ))}
            </select>
          </label>
          {configuracaoAtual.estiloPlanta === 'HUMANIZADA' && (
            <p className="mt-1 text-[11px] text-slate-500" data-testid="resumo-dos-pisos">
              Piso pelo material declarado (E7.2), senão pelo tipo ou pelo nome do ambiente
              {resumoDosPisos.length > 0 ? `: ${resumoDosPisos.map((r) => `${r.rotulo} ${r.quantidade}${r.declarados < r.quantidade ? ` (${r.quantidade - r.declarados} suposto${r.quantidade - r.declarados > 1 ? 's' : ''})` : ''}`).join(' · ')}` : ''}. Mobiliário e vegetação são ilustrativos.
            </p>
          )}
          <label className="mt-2 flex flex-col gap-1 text-[11px] font-medium text-slate-500">
            Fase da reforma
            <select value={configuracaoAtual.fase} onChange={(e) => onFase(e.target.value as FiltroDeFase)} aria-label="Fase da reforma" className={campo}>
              {FILTROS_DE_FASE.map((f) => (
                <option key={f} value={f}>{ROTULO_DO_FILTRO_DE_FASE[f]}</option>
              ))}
            </select>
          </label>
          <label className="mt-2 flex flex-col gap-1 text-[11px] font-medium text-slate-500">
            Colorir ambientes por
            <select value={configuracaoAtual.modoDeCor} onChange={(e) => onModoDeCor(e.target.value as ModoDeCor)} aria-label="Colorir ambientes por" className={campo}>
              {MODOS_DE_COR.map((m) => (
                <option key={m} value={m}>{ROTULO_DO_MODO_DE_COR[m]}</option>
              ))}
            </select>
          </label>
          {legenda.length > 0 && (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-[11px] text-slate-600" data-testid="legenda-de-cores">
              {legenda.map((l) => (
                <li key={l.rotulo} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ backgroundColor: l.cor }} />
                  <span className="truncate">{l.rotulo}</span>
                  <span className="ml-auto text-slate-400">{l.quantidade}</span>
                </li>
              ))}
            </ul>
          )}
          <label className="mt-2 flex flex-col gap-1 text-[11px] font-medium text-slate-500">
            Estilo do 3D{em3d ? '' : ' (vale ao entrar no 3D)'}
            <select value={configuracaoAtual.estilo3d} onChange={(e) => onEstilo3d(e.target.value as Estilo3d)} aria-label="Estilo do 3D" className={campo}>
              {ESTILOS_3D.map((e) => (
                <option key={e} value={e}>{ROTULO_DO_ESTILO_3D[e]}</option>
              ))}
            </select>
          </label>

          <div className="my-2 h-px bg-slate-100" />
          <p className="mb-1 text-[11px] font-medium text-slate-500">Templates de vista</p>
          {indisponivel && <p className="mb-1 text-[11px] text-amber-800">Templates da organização sem persistência: {indisponivel}</p>}
          <ul className="max-h-44 space-y-0.5 overflow-auto" data-testid="templates-de-vista">
            {templates.map((t) => {
              const ehAtivo = ativo?.id === t.id;
              const mudancas = diferencas(configuracaoAtual, t.config);
              return (
                <li key={t.id} className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-xs ${ehAtivo ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <button type="button" onClick={() => onAplicar(t.config)} className="flex-1 truncate text-left" title={mudancas.length ? `Aplicar: ${mudancas.join(' · ')}` : 'É a vista atual'} aria-label={`Aplicar template ${t.nome}`}>
                    {t.nome}
                    {t.deFabrica && <span className="ml-1 text-[10px] text-slate-400">fábrica</span>}
                    {ehAtivo && <span className="ml-1 text-[10px]">· atual</span>}
                  </button>
                  {!ehAtivo && mudancas.length > 0 && <span className="text-[10px] text-slate-400">{mudancas.length} mudança(s)</span>}
                  {!t.deFabrica && (
                    <button type="button" onClick={() => void onRemover(t.id)} className="rounded p-0.5 text-slate-400 hover:text-red-700" aria-label={`Remover template ${t.nome}`} title="Remover da organização">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
            {carregando && <li className="px-1.5 py-1 text-[11px] text-slate-400">carregando…</li>}
          </ul>
          {nomeNovo === null ? (
            <button type="button" onClick={() => { setNomeNovo(''); setErro(null); }} className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50" data-testid="salvar-vista-como">
              <Save className="h-3.5 w-3.5" /> Salvar vista atual como template…
            </button>
          ) : (
            <div className="mt-2 flex items-center gap-1">
              <input autoFocus value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); if (e.key === 'Escape') setNomeNovo(null); }} placeholder="Nome do template" aria-label="Nome do template de vista" className={campo} />
              <button type="button" disabled={ocupado} onClick={() => void salvar()} className="h-7 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="confirmar-template">
                Salvar
              </button>
            </div>
          )}
          {erro && <p className="mt-1 text-[11px] text-red-700" data-testid="erro-do-template">{erro}</p>}
        </div>
      ) : null}
    </div>
  );
}
