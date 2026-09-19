/**
 * PISO, FORRO E RODAPÉ por ambiente (19/09/2026, roadmap E7.2) — a gaveta.
 *
 * Lista os ambientes do pavimento com o que cada um declarou, um editor por
 * ambiente (camadas do piso de baixo para cima, forro com rebaixo, rodapé pela
 * política / declarado / sem), presets com espessuras reais, tipos da
 * organização (famílias PISO e FORRO do catálogo de tipos, E1.1) e "aplicar a
 * todos do mesmo tipo de ambiente". Cada mudança é UM comando no kernel — um
 * Ctrl+Z por gesto, como o resto do editor.
 *
 * O material é código opaco de catálogo (`DatabasePickerModal`, o mesmo das
 * camadas de parede); a medida (m², m³, m) é do quantitativo e aparece aqui só
 * para conferir — a conta mora em `quantities.ts`.
 */
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, Trash2, Wand2 } from 'lucide-react';
import type { AcabamentosDoAmbiente, CamadaParede, FuncaoCamada, ObjectId, TipoDeAmbiente } from '../../utils/blueprintKernel';
import { FUNCOES_DE_CAMADA, MAX_ALTURA_DE_RODAPE_MM, MAX_REBAIXO_DE_FORRO_MM } from '../../utils/blueprintKernel';
import type { QuantidadePorAcabamento } from '../../utils/blueprintKernel/quantities';
import { PRESETS_DE_ACABAMENTO, aplicarPreset, peDireitoUtilMm, presetDeAcabamento, presetsSugeridos, resumirAcabamentos, resumirAcabamentosDoNivel, semMaterial } from '../../utils/blueprintAcabamentos';
import { aplicarTipoDeForro, aplicarTipoDePiso, propriedadesDoForro, propriedadesDoPiso, type PropriedadesDeForro, type PropriedadesDePiso } from '../../utils/blueprintTipos';
import DatabasePickerModal from '../DatabasePickerModal';
import SeletorDeTipo from './SeletorDeTipo';

export interface AmbienteComAcabamento {
  spaceId: ObjectId;
  rotulo: string;
  tipoDeAmbiente: TipoDeAmbiente | null;
  areaPisoM2: number;
  comprimentoRodapeM: number;
  peDireitoMm: number;
  acabamentos?: AcabamentosDoAmbiente;
}

interface Props {
  ambientes: AmbienteComAcabamento[];
  nomeDoPavimento: string;
  alturaRodapePoliticaMm: number;
  porAcabamento: QuantidadePorAcabamento[];
  /** Ambiente que abre já expandido (vindo do cartão do navegador). */
  foco?: ObjectId | null;
  /** `null` limpa os acabamentos do ambiente. */
  onAplicar: (spaceId: ObjectId, acabamentos: AcabamentosDoAmbiente | null) => void;
  onAplicarEmVarios: (spaceIds: ObjectId[], acabamentos: AcabamentosDoAmbiente) => void;
  onSelecionar?: (spaceId: ObjectId) => void;
}

const ROTULO_FUNCAO: Record<FuncaoCamada, string> = { ESTRUTURAL: 'Estrutural', VEDACAO: 'Vedação', REVESTIMENTO: 'Revestimento', ISOLAMENTO: 'Isolamento', ACABAMENTO: 'Acabamento', CAMARA_AR: 'Câmara de ar' };
const ROTULO_TIPO: Record<TipoDeAmbiente, string> = { BANHEIRO: 'banheiro', COZINHA_SERVICO: 'cozinha / serviço', VARANDA: 'varanda', SALA_DORMITORIO: 'sala / dormitório', OUTRO: 'outro' };
const fmt = (n: number) => n.toFixed(2).replace('.', ',');
const cm = (mm: number) => (mm / 10).toFixed(mm % 10 === 0 ? 0 : 1).replace('.', ',');
const campo = 'h-7 rounded-[6px] border border-slate-300 bg-white px-1.5 text-xs text-slate-800';

type AlvoDoMaterial = { spaceId: ObjectId; escopo: 'PISO' | 'FORRO' | 'RODAPE'; indice: number };

export default function PainelAcabamentos({ ambientes, nomeDoPavimento, alturaRodapePoliticaMm, porAcabamento, foco = null, onAplicar, onAplicarEmVarios, onSelecionar }: Props) {
  const [aberto, setAberto] = useState<ObjectId | null>(foco);
  const [alvo, setAlvo] = useState<AlvoDoMaterial | null>(null);
  const resumo = resumirAcabamentosDoNivel(ambientes);
  const semDeclaracao = ambientes.filter((a) => !a.acabamentos);

  const sugerirParaTodos = () => {
    for (const a of semDeclaracao) {
      const s = presetsSugeridos(a.tipoDeAmbiente);
      onAplicar(a.spaceId, aplicarPreset(aplicarPreset(undefined, s.piso), s.forro));
    }
  };

  const mudar = (a: AmbienteComAcabamento, f: (atual: AcabamentosDoAmbiente) => AcabamentosDoAmbiente) => {
    const atual: AcabamentosDoAmbiente = a.acabamentos
      ? {
          ...(a.acabamentos.piso ? { piso: a.acabamentos.piso.map((x) => ({ ...x })) } : {}),
          ...(a.acabamentos.forro ? { forro: { camadas: a.acabamentos.forro.camadas.map((x) => ({ ...x })), rebaixoMm: a.acabamentos.forro.rebaixoMm } } : {}),
          ...(a.acabamentos.rodape !== undefined ? { rodape: a.acabamentos.rodape ? { ...a.acabamentos.rodape } : null } : {}),
        }
      : {};
    const novo = f(atual);
    onAplicar(a.spaceId, novo.piso || novo.forro || novo.rodape !== undefined ? novo : null);
  };

  const escolherMaterial = (item: { code: string; description: string }) => {
    if (!alvo) return;
    const a = ambientes.find((x) => x.spaceId === alvo.spaceId);
    if (a) {
      mudar(a, (atual) => {
        if (alvo.escopo === 'PISO' && atual.piso?.[alvo.indice]) atual.piso[alvo.indice] = { ...atual.piso[alvo.indice], itemCode: item.code, descricao: item.description };
        if (alvo.escopo === 'FORRO' && atual.forro?.camadas[alvo.indice]) atual.forro.camadas[alvo.indice] = { ...atual.forro.camadas[alvo.indice], itemCode: item.code, descricao: item.description };
        if (alvo.escopo === 'RODAPE' && atual.rodape) atual.rodape = { ...atual.rodape, itemCode: item.code, descricao: item.description };
        return atual;
      });
    }
    setAlvo(null);
  };

  return (
    <div className="space-y-4" data-testid="tarefa-acabamentos">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5 text-slate-500" /> Piso, forro e rodapé em <strong>{nomeDoPavimento}</strong>
        </span>
        <button type="button" disabled={semDeclaracao.length === 0} onClick={sugerirParaTodos} data-testid="sugerir-acabamentos" className="ml-auto inline-flex h-7 items-center gap-1 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" title="Preenche os ambientes sem declaração com o preset do tipo de ambiente (banheiro azulejado sem rodapé, cozinha cerâmica + PVC, sala porcelanato + gesso). Material fica por escolher.">
          <Wand2 className="h-3.5 w-3.5" /> Sugerir pelo tipo ({semDeclaracao.length})
        </button>
      </div>

      <div className="text-xs text-slate-700" data-testid="resumo-dos-acabamentos">
        <strong>{resumo.declarados} de {resumo.ambientes} ambiente(s)</strong> com acabamentos declarados · {resumo.semPiso} sem piso · {resumo.semForro} sem forro
        {resumo.semMaterial > 0 && <span className="text-amber-800"> · {resumo.semMaterial} camada(s)/rodapé(s) sem material de catálogo</span>}
        <p className="mt-1 text-[11px] text-slate-500">
          A área do piso e do forro é a área de piso líquida do ambiente (recuada, sem pilares); o comprimento do rodapé é o perímetro menos os vãos que chegam ao piso. Rodapé sem declaração vale a altura da política ({cm(alturaRodapePoliticaMm)} cm) e entra pelo de-para; o declarado sai por material. Camadas do piso de baixo para cima; do forro, de cima para baixo.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="tabela-de-acabamentos">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Ambiente</th>
              <th className="py-1 pr-2 font-medium">Piso</th>
              <th className="py-1 pr-2 font-medium">Forro</th>
              <th className="py-1 pr-2 font-medium">Rodapé</th>
              <th className="py-1 pr-2 text-right font-medium">Piso (m²)</th>
              <th className="py-1 pr-2 text-right font-medium">Rodapé (m)</th>
              <th className="py-1 pr-2 text-right font-medium">Pé-direito útil</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {ambientes.map((a) => {
              const ac = a.acabamentos;
              const topo = ac?.piso?.[ac.piso.length - 1];
              const face = ac?.forro?.camadas[0];
              const faltam = semMaterial(ac);
              return (
                <React.Fragment key={a.spaceId}>
                  <tr className={`border-t border-slate-100 ${aberto === a.spaceId ? 'bg-blue-50/40' : ''}`} aria-label={`Ambiente ${a.rotulo}`}>
                    <td className="py-1.5 pr-2">
                      <button type="button" onClick={() => onSelecionar?.(a.spaceId)} className="font-medium text-slate-800 hover:underline">{a.rotulo}</button>
                      {a.tipoDeAmbiente && <span className="ml-1 text-[10px] text-slate-400">{ROTULO_TIPO[a.tipoDeAmbiente]}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-700">{topo ? `${topo.descricao || topo.funcao.toLowerCase()} · ${ac!.piso!.reduce((s, x) => s + x.espessuraMm, 0)} mm` : <span className="text-slate-400">—</span>}</td>
                    <td className="py-1.5 pr-2 text-slate-700">{face ? `${face.descricao || face.funcao.toLowerCase()}${ac!.forro!.rebaixoMm ? ` · rebaixo ${cm(ac!.forro!.rebaixoMm)} cm` : ' · colado'}` : <span className="text-slate-400">—</span>}</td>
                    <td className="py-1.5 pr-2 text-slate-700">{ac?.rodape === null ? 'sem' : ac?.rodape ? `${ac.rodape.descricao || 'declarado'} ${cm(ac.rodape.alturaMm)} cm` : <span className="text-slate-400">política {cm(alturaRodapePoliticaMm)} cm</span>}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(a.areaPisoM2)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{ac?.rodape === null ? '0,00' : fmt(a.comprimentoRodapeM)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{fmt(peDireitoUtilMm(a.peDireitoMm, ac) / 1000)} m</td>
                    <td className="py-1.5 text-right">
                      {faltam > 0 && <span className="mr-2 text-[10px] text-amber-800" title="Camadas ou rodapé sem material de catálogo">{faltam} sem material</span>}
                      <button type="button" onClick={() => setAberto(aberto === a.spaceId ? null : a.spaceId)} aria-label={`Editar acabamentos de ${a.rotulo}`} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">
                        {aberto === a.spaceId ? 'Fechar' : 'Editar'}
                      </button>
                    </td>
                  </tr>
                  {aberto === a.spaceId && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={8} className="px-2 py-3">
                        <EditorDoAmbiente
                          ambiente={a}
                          alturaRodapePoliticaMm={alturaRodapePoliticaMm}
                          iguais={ambientes.filter((x) => x.spaceId !== a.spaceId && x.tipoDeAmbiente != null && x.tipoDeAmbiente === a.tipoDeAmbiente).map((x) => x.spaceId)}
                          onMudar={(f) => mudar(a, f)}
                          onLimpar={() => onAplicar(a.spaceId, null)}
                          onAplicarEmVarios={(ids) => a.acabamentos && onAplicarEmVarios(ids, a.acabamentos)}
                          onEscolherMaterial={(escopo, indice) => setAlvo({ spaceId: a.spaceId, escopo, indice })}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {ambientes.length === 0 && <p className="py-2 text-xs text-slate-500">Nenhum ambiente fechado neste pavimento.</p>}
      </div>

      {porAcabamento.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-700">Materiais de acabamento (desenho inteiro)</h4>
          <table className="w-full text-xs" data-testid="materiais-de-acabamento">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">Escopo</th>
                <th className="py-1 pr-2 font-medium">Material</th>
                <th className="py-1 pr-2 font-medium">Função</th>
                <th className="py-1 pr-2 text-right font-medium">m²</th>
                <th className="py-1 pr-2 text-right font-medium">m³</th>
                <th className="py-1 pr-2 text-right font-medium">m</th>
                <th className="py-1 text-right font-medium">Ambientes</th>
              </tr>
            </thead>
            <tbody>
              {porAcabamento.map((m) => (
                <tr key={`${m.escopo}:${m.itemCode}:${m.funcao ?? ''}`} className="border-t border-slate-100">
                  <td className="py-1 pr-2">{m.escopo === 'PISO' ? 'Piso' : m.escopo === 'FORRO' ? 'Forro' : 'Rodapé'}</td>
                  <td className="py-1 pr-2">{m.descricao || <span className="text-slate-400">sem descrição</span>}{m.itemCode ? <span className="ml-1 text-[10px] text-slate-400">{m.itemCode}</span> : <span className="ml-1 text-[10px] text-amber-800">sem código</span>}</td>
                  <td className="py-1 pr-2 text-slate-600">{m.funcao ? ROTULO_FUNCAO[m.funcao] : '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmt(m.areaM2)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m.escopo === 'RODAPE' ? '—' : fmt(m.volumeM3)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m.escopo === 'RODAPE' ? fmt(m.comprimentoM) : '—'}</td>
                  <td className="py-1 text-right tabular-nums">{m.ambientes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DatabasePickerModal
        isOpen={alvo !== null}
        onClose={() => setAlvo(null)}
        title={alvo?.escopo === 'RODAPE' ? 'Material do rodapé' : alvo?.escopo === 'FORRO' ? 'Material da camada do forro' : 'Material da camada do piso'}
        subtitle={alvo?.escopo === 'RODAPE' ? 'SINAPI ou base própria. Item em m leva o comprimento; em m² leva comprimento × altura.' : 'SINAPI ou base própria. Item em m³ leva o volume (área × espessura); em m² leva a área de piso.'}
        onSelect={(item) => escolherMaterial({ code: item.code, description: item.description })}
      />
    </div>
  );
}

function EditorDoAmbiente({ ambiente: a, alturaRodapePoliticaMm, iguais, onMudar, onLimpar, onAplicarEmVarios, onEscolherMaterial }: {
  ambiente: AmbienteComAcabamento;
  alturaRodapePoliticaMm: number;
  iguais: ObjectId[];
  onMudar: (f: (atual: AcabamentosDoAmbiente) => AcabamentosDoAmbiente) => void;
  onLimpar: () => void;
  onAplicarEmVarios: (ids: ObjectId[]) => void;
  onEscolherMaterial: (escopo: 'PISO' | 'FORRO' | 'RODAPE', indice: number) => void;
}) {
  const ac = a.acabamentos;
  const chave = `${a.spaceId}:${JSON.stringify(ac ?? null)}`;
  const modoRodape: 'POLITICA' | 'DECLARADO' | 'SEM' = ac?.rodape === null ? 'SEM' : ac?.rodape ? 'DECLARADO' : 'POLITICA';
  return (
    <div className="space-y-3 text-xs" data-testid="editor-de-acabamentos">
      <p className="text-slate-600">
        <strong>{a.rotulo}</strong> · {resumirAcabamentos(ac, alturaRodapePoliticaMm)}
      </p>

      {/* ── PISO ─────────────────────────────────────────────────────────── */}
      <section className="rounded-[6px] border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="font-semibold text-slate-700">Piso</h5>
          <select defaultValue="" key={`${chave}-pp`} onChange={(e) => { const p = presetDeAcabamento(e.target.value); if (p) onMudar((atual) => aplicarPreset(atual, p)); }} aria-label={`Preset de piso para ${a.rotulo}`} className={campo}>
            <option value="">Preset…</option>
            {PRESETS_DE_ACABAMENTO.filter((p) => p.escopo === 'PISO').map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
          <button type="button" onClick={() => onMudar((atual) => ({ ...atual, piso: [...(atual.piso ?? []), { espessuraMm: 10, itemCode: '', descricao: '', funcao: 'ACABAMENTO' }] }))} className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50" aria-label={`Adicionar camada de piso em ${a.rotulo}`}>
            <Plus className="h-3 w-3" /> camada
          </button>
          {ac?.piso && (
            <button type="button" onClick={() => onMudar((atual) => { const { piso: _p, ...resto } = atual; return resto; })} className="text-[11px] text-slate-500 underline-offset-2 hover:underline">
              remover piso
            </button>
          )}
        </div>
        <EditorDeCamadas chave={`${chave}-piso`} camadas={ac?.piso ?? []} rotuloDaOrdem="de baixo para cima" onMudar={(camadas) => onMudar((atual) => (camadas.length ? { ...atual, piso: camadas } : (({ piso: _p, ...resto }) => resto)(atual)))} onEscolherMaterial={(i) => onEscolherMaterial('PISO', i)} />
        <div className="mt-2">
          <SeletorDeTipo
            familia="PISO"
            atual={propriedadesDoPiso(ac)}
            onAplicar={(p) => onMudar((atual) => aplicarTipoDePiso(atual, p as PropriedadesDePiso))}
          />
        </div>
      </section>

      {/* ── FORRO ────────────────────────────────────────────────────────── */}
      <section className="rounded-[6px] border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="font-semibold text-slate-700">Forro</h5>
          <select defaultValue="" key={`${chave}-pf`} onChange={(e) => { const p = presetDeAcabamento(e.target.value); if (p) onMudar((atual) => aplicarPreset(atual, p)); }} aria-label={`Preset de forro para ${a.rotulo}`} className={campo}>
            <option value="">Preset…</option>
            {PRESETS_DE_ACABAMENTO.filter((p) => p.escopo === 'FORRO').map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
          <label className="inline-flex items-center gap-1 text-slate-600">
            Rebaixo (cm)
            <input type="number" key={`${chave}-rb`} min={0} max={MAX_REBAIXO_DE_FORRO_MM / 10} step={1} defaultValue={ac?.forro ? ac.forro.rebaixoMm / 10 : 0} disabled={!ac?.forro} aria-label={`Rebaixo do forro de ${a.rotulo} (cm)`} onBlur={(e) => { const mm = Math.round(Number(e.target.value) * 10); if (Number.isFinite(mm) && mm >= 0 && mm <= MAX_REBAIXO_DE_FORRO_MM) onMudar((atual) => (atual.forro ? { ...atual, forro: { ...atual.forro, rebaixoMm: mm } } : atual)); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-16 text-right`} />
          </label>
          <button type="button" onClick={() => onMudar((atual) => ({ ...atual, forro: { camadas: [...(atual.forro?.camadas ?? []), { espessuraMm: 13, itemCode: '', descricao: '', funcao: 'ACABAMENTO' }], rebaixoMm: atual.forro?.rebaixoMm ?? 0 } }))} className="inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50" aria-label={`Adicionar camada de forro em ${a.rotulo}`}>
            <Plus className="h-3 w-3" /> camada
          </button>
          {ac?.forro && (
            <button type="button" onClick={() => onMudar((atual) => { const { forro: _f, ...resto } = atual; return resto; })} className="text-[11px] text-slate-500 underline-offset-2 hover:underline">
              remover forro
            </button>
          )}
        </div>
        <EditorDeCamadas chave={`${chave}-forro`} camadas={ac?.forro?.camadas ?? []} rotuloDaOrdem="de cima para baixo" onMudar={(camadas) => onMudar((atual) => (camadas.length ? { ...atual, forro: { camadas, rebaixoMm: atual.forro?.rebaixoMm ?? 0 } } : (({ forro: _f, ...resto }) => resto)(atual)))} onEscolherMaterial={(i) => onEscolherMaterial('FORRO', i)} />
        <div className="mt-2">
          <SeletorDeTipo
            familia="FORRO"
            atual={propriedadesDoForro(ac)}
            onAplicar={(p) => onMudar((atual) => aplicarTipoDeForro(atual, p as PropriedadesDeForro))}
          />
        </div>
      </section>

      {/* ── RODAPÉ ───────────────────────────────────────────────────────── */}
      <section className="rounded-[6px] border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="font-semibold text-slate-700">Rodapé</h5>
          <select value={modoRodape} onChange={(e) => { const v = e.target.value as typeof modoRodape; onMudar((atual) => { if (v === 'POLITICA') { const { rodape: _r, ...resto } = atual; return resto; } if (v === 'SEM') return { ...atual, rodape: null }; return { ...atual, rodape: atual.rodape ?? { alturaMm: alturaRodapePoliticaMm, itemCode: '', descricao: '' } }; }); }} aria-label={`Rodapé de ${a.rotulo}`} className={campo}>
            <option value="POLITICA">Pela política ({cm(alturaRodapePoliticaMm)} cm, entra pelo de-para)</option>
            <option value="DECLARADO">Declarado (altura + material)</option>
            <option value="SEM">Sem rodapé</option>
          </select>
          {ac?.rodape && (
            <>
              <label className="inline-flex items-center gap-1 text-slate-600">
                Altura (cm)
                <input type="number" key={`${chave}-ra`} min={1} max={MAX_ALTURA_DE_RODAPE_MM / 10} step={0.5} defaultValue={ac.rodape.alturaMm / 10} aria-label={`Altura do rodapé de ${a.rotulo} (cm)`} onBlur={(e) => { const mm = Math.round(Number(e.target.value) * 10); if (mm > 0 && mm <= MAX_ALTURA_DE_RODAPE_MM) onMudar((atual) => (atual.rodape ? { ...atual, rodape: { ...atual.rodape, alturaMm: mm } } : atual)); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-16 text-right`} />
              </label>
              <input type="text" key={`${chave}-rd`} defaultValue={ac.rodape.descricao} placeholder="Descrição" aria-label={`Descrição do rodapé de ${a.rotulo}`} onBlur={(e) => onMudar((atual) => (atual.rodape ? { ...atual, rodape: { ...atual.rodape, descricao: e.target.value } } : atual))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-40`} />
              <button type="button" onClick={() => onEscolherMaterial('RODAPE', 0)} className={`rounded border px-1.5 py-0.5 text-[11px] ${ac.rodape.itemCode ? 'border-slate-300 text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'}`} aria-label={`Material do rodapé de ${a.rotulo}`}>
                {ac.rodape.itemCode ? `Item ${ac.rodape.itemCode}` : 'Escolher material'}
              </button>
              <span className="text-slate-500">{fmt(a.comprimentoRodapeM)} m · {fmt((a.comprimentoRodapeM * ac.rodape.alturaMm) / 1000)} m²</span>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!ac || iguais.length === 0} onClick={() => onAplicarEmVarios(iguais)} data-testid="aplicar-aos-iguais" className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-blue-300 bg-blue-50 px-2 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50" title="Copia piso, forro e rodapé deste ambiente para os outros do mesmo tipo de ambiente (NBR 5410) neste pavimento">
          Aplicar aos {iguais.length} do mesmo tipo{a.tipoDeAmbiente ? ` (${ROTULO_TIPO[a.tipoDeAmbiente]})` : ''}
        </button>
        <button type="button" disabled={!ac} onClick={onLimpar} className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-300 px-2 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" aria-label={`Limpar acabamentos de ${a.rotulo}`}>
          <Trash2 className="h-3 w-3" /> Limpar
        </button>
      </div>
    </div>
  );
}

function EditorDeCamadas({ chave, camadas, rotuloDaOrdem, onMudar, onEscolherMaterial }: {
  chave: string;
  camadas: CamadaParede[];
  rotuloDaOrdem: string;
  onMudar: (camadas: CamadaParede[]) => void;
  onEscolherMaterial: (indice: number) => void;
}) {
  if (camadas.length === 0) return <p className="mt-1 text-[11px] text-slate-400">Sem camadas — escolha um preset, um tipo salvo ou adicione uma camada.</p>;
  const trocar = (i: number, parte: Partial<CamadaParede>) => onMudar(camadas.map((c, k) => (k === i ? { ...c, ...parte } : c)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= camadas.length) return;
    const novo = [...camadas];
    [novo[i], novo[j]] = [novo[j], novo[i]];
    onMudar(novo);
  };
  const total = camadas.reduce((s, c) => s + c.espessuraMm, 0);
  return (
    <div className="mt-1">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Camadas ({rotuloDaOrdem}) · {total} mm</p>
      <ul className="space-y-1">
        {camadas.map((c, i) => (
          <li key={`${chave}-${i}`} className="flex flex-wrap items-center gap-1.5">
            <span className="w-4 text-right text-[10px] text-slate-400">{i + 1}</span>
            <input type="number" min={1} step={1} defaultValue={c.espessuraMm} aria-label={`Espessura da camada ${i + 1} (mm)`} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v > 0 && v !== c.espessuraMm) trocar(i, { espessuraMm: v }); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-14 text-right`} />
            <span className="text-[10px] text-slate-400">mm</span>
            <select value={c.funcao} onChange={(e) => trocar(i, { funcao: e.target.value as FuncaoCamada })} aria-label={`Função da camada ${i + 1}`} className={campo}>
              {FUNCOES_DE_CAMADA.map((f) => <option key={f} value={f}>{ROTULO_FUNCAO[f]}</option>)}
            </select>
            <input type="text" defaultValue={c.descricao} placeholder="Descrição" aria-label={`Descrição da camada ${i + 1}`} onBlur={(e) => e.target.value !== c.descricao && trocar(i, { descricao: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${campo} w-40`} />
            <button type="button" onClick={() => onEscolherMaterial(i)} className={`rounded border px-1.5 py-0.5 text-[11px] ${c.itemCode ? 'border-slate-300 text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-900'}`} aria-label={`Material da camada ${i + 1}`} title={c.itemCode ? 'Trocar o item de catálogo' : 'Sem item de catálogo — não entra no orçamento'}>
              {c.itemCode ? `Item ${c.itemCode}` : 'Escolher material'}
            </button>
            {c.itemCode && (
              <button type="button" onClick={() => trocar(i, { itemCode: '' })} className="text-[10px] text-slate-400 hover:text-slate-600" aria-label={`Limpar material da camada ${i + 1}`}>limpar</button>
            )}
            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={`Subir camada ${i + 1}`}><ArrowUp className="h-3 w-3" /></button>
            <button type="button" onClick={() => mover(i, 1)} disabled={i === camadas.length - 1} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={`Descer camada ${i + 1}`}><ArrowDown className="h-3 w-3" /></button>
            <button type="button" onClick={() => onMudar(camadas.filter((_x, k) => k !== i))} className="rounded p-0.5 text-slate-400 hover:text-red-700" aria-label={`Excluir camada ${i + 1}`}><Trash2 className="h-3 w-3" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
