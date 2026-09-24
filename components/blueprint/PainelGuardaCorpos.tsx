/**
 * GUARDA-CORPOS E CORRIMÃOS do pavimento (19/09/2026, E7.3) — a gaveta:
 * resumo (metros, sugeridos, sem material, avisos NBR 14718/9050), a
 * SUGESTÃO automática (borda livre de laje em pavimento elevado; corrimão dos
 * dois lados da escada) com prévia por linha e "Lançar", a lista das peças
 * existentes com aceitar/selecionar. Puro em `blueprintGuardaCorpo.ts`.
 */
import React from 'react';
import { AlertTriangle, Fence } from 'lucide-react';
import { ROTULO_DO_MATERIAL_DE_GUARDA_CORPO, ROTULO_DO_TIPO_DE_GUARDA_CORPO, comprimentoDoGuardaCorpo, type GuardaCorpo, type ObjectId } from '../../utils/blueprintKernel';
import { conferirGuardaCorpo, type AvisoDeGuardaCorpo, type HipotesesDeGuardaCorpo, type ResultadoDaSugestao, type ResumoDosGuardaCorpos, type SugestaoDeGuardaCorpo } from '../../utils/blueprintGuardaCorpo';
import { casasEmCm, cmParaMm, mmParaCm, textoEmCm } from '../../utils/blueprintMedidaCm';

interface Props {
  nomeDoPavimento: string;
  pecas: GuardaCorpo[];
  resumo: ResumoDosGuardaCorpos;
  sugestao: ResultadoDaSugestao;
  hipoteses: HipotesesDeGuardaCorpo;
  onHipoteses: (h: HipotesesDeGuardaCorpo) => void;
  /** Lança as sugestões dadas (todas quando vazio) num lote. */
  onLancar: (quais: SugestaoDeGuardaCorpo[]) => void;
  onAceitarTodos: () => void;
  onSelecionar: (id: ObjectId) => void;
}

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');
const fmt = (n: number) => n.toFixed(2).replace('.', ',');

export default function PainelGuardaCorpos({ nomeDoPavimento, pecas, resumo, sugestao, hipoteses, onHipoteses, onLancar, onAceitarTodos, onSelecionar }: Props) {
  const avisosPorPeca = new Map<ObjectId, AvisoDeGuardaCorpo[]>(pecas.map((g) => [g.id, conferirGuardaCorpo(g)]));
  return (
    <div className="space-y-4" data-testid="tarefa-guarda-corpos">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <span className="inline-flex items-center gap-1">
          <Fence className="h-3.5 w-3.5 text-slate-500" /> Guarda-corpos e corrimãos em <strong>{nomeDoPavimento}</strong>
        </span>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={hipoteses.corrimaoNosDoisLados} onChange={(e) => onHipoteses({ ...hipoteses, corrimaoNosDoisLados: e.target.checked })} aria-label="Corrimão dos dois lados da escada" className="h-3.5 w-3.5 rounded border-slate-300" />
          Corrimão dos dois lados (NBR 9050)
        </label>
        <label className="inline-flex items-center gap-1">
          Guarda-corpo (m)
          <input type="number" min={90} max={200} step={5} value={mmParaCm(hipoteses.alturaGuardaCorpoMm)} onChange={(e) => Number(e.target.value) > 0 && onHipoteses({ ...hipoteses, alturaGuardaCorpoMm: cmParaMm(Number(e.target.value)) })} aria-label="Altura sugerida do guarda-corpo (cm)" className="h-7 w-16 rounded-[6px] border border-slate-300 bg-white px-1.5 text-right text-xs" />
        </label>
        <label className="inline-flex items-center gap-1">
          Corrimão (m)
          <input type="number" min={70} max={120} step={1} value={mmParaCm(hipoteses.alturaCorrimaoMm)} onChange={(e) => Number(e.target.value) > 0 && onHipoteses({ ...hipoteses, alturaCorrimaoMm: cmParaMm(Number(e.target.value)) })} aria-label="Altura sugerida do corrimão (cm)" className="h-7 w-16 rounded-[6px] border border-slate-300 bg-white px-1.5 text-right text-xs" />
        </label>
        <button type="button" disabled={sugestao.sugestoes.length === 0} onClick={() => onLancar(sugestao.sugestoes)} data-testid="lancar-guarda-corpos" className="ml-auto inline-flex h-7 items-center gap-1 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" title="Grava as sugestões como peças sugeridas (tracejadas) — mover ou Aceitar confirma">
          Lançar {sugestao.sugestoes.length} sugestão(ões)
        </button>
      </div>

      <div className="text-xs text-slate-700" data-testid="resumo-dos-guarda-corpos">
        <strong>{resumo.pecas} peça(s)</strong> · guarda-corpo <strong>{fmt(resumo.guardaCorpoM)} m</strong> · corrimão <strong>{fmt(resumo.corrimaoM)} m</strong>
        {resumo.sugeridos > 0 && <> · {resumo.sugeridos} sugerida(s)</>}
        {resumo.semMaterial > 0 && <span className="text-amber-800"> · {resumo.semMaterial} sem item de catálogo</span>}
        {resumo.erros > 0 && <span className="text-red-700"> · {resumo.erros} abaixo de 1,10 m (NBR 14718)</span>}
        {resumo.avisos > 0 && <span className="text-amber-800"> · {resumo.avisos} aviso(s)</span>}
        <p className="mt-1 text-[11px] text-slate-500">
          Sugestão: borda de laje SEM parede em cima, em pavimento elevado (varanda, mezanino, laje acessível), a {textoEmCm(hipoteses.alturaGuardaCorpoMm)} cm; corrimão a meia largura da escada/rampa, a {textoEmCm(hipoteses.alturaCorrimaoMm)} cm. O que já existe no mesmo trecho não se repete. Altura mínima 110 cm (NBR 14718); corrimão 80–92 cm (NBR 9050 6.9.4).
        </p>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-700">Sugestões ({sugestao.sugestoes.length}{sugestao.jaExistentes ? ` · ${sugestao.jaExistentes} já cobertas` : ''})</h4>
        {sugestao.sugestoes.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="motivos-da-sugestao">{sugestao.motivos.length ? sugestao.motivos.join(' · ') : 'Nada a sugerir.'}</p>
        ) : (
          <table className="w-full text-xs" data-testid="tabela-de-sugestoes">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">Onde</th>
                <th className="py-1 pr-2 font-medium">Tipo</th>
                <th className="py-1 pr-2 text-right font-medium">m</th>
                <th className="py-1 pr-2 text-right font-medium">h (cm)</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sugestao.sugestoes.map((s, i) => (
                <tr key={i} className="border-t border-slate-100" aria-label={`Sugestão ${s.rotulo}`}>
                  <td className="py-1 pr-2">{s.rotulo}</td>
                  <td className="py-1 pr-2 text-slate-600">{ROTULO_DO_TIPO_DE_GUARDA_CORPO[s.comando.tipo]}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m(s.comprimentoMm)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{textoEmCm(s.comando.alturaMm ?? 0)}</td>
                  <td className="py-1 text-right">
                    <button type="button" onClick={() => onLancar([s])} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50" aria-label={`Lançar ${s.rotulo}`}>Lançar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sugestao.sugestoes.length > 0 && sugestao.motivos.length > 0 && <p className="mt-1 text-[11px] text-slate-400">{sugestao.motivos.join(' · ')}</p>}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <h4 className="text-xs font-semibold text-slate-700">Peças do pavimento ({pecas.length})</h4>
          {resumo.sugeridos > 0 && (
            <button type="button" onClick={onAceitarTodos} data-testid="aceitar-guarda-corpos" className="ml-auto rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100">
              Aceitar {resumo.sugeridos} sugerida(s)
            </button>
          )}
        </div>
        {pecas.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma. Desenhe pelo menu Componentes › Circulação (Guarda-corpo / Corrimão) ou lance as sugestões.</p>
        ) : (
          <table className="w-full text-xs" data-testid="tabela-de-guarda-corpos">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">Peça</th>
                <th className="py-1 pr-2 font-medium">Material</th>
                <th className="py-1 pr-2 text-right font-medium">m</th>
                <th className="py-1 pr-2 text-right font-medium">h (cm)</th>
                <th className="py-1 pr-2 font-medium">Item</th>
                <th className="py-1 font-medium">Conferência</th>
              </tr>
            </thead>
            <tbody>
              {pecas.map((g) => {
                const avisos = avisosPorPeca.get(g.id) ?? [];
                return (
                  <tr key={g.id} className="border-t border-slate-100" aria-label={`Peça ${g.rotulo || ROTULO_DO_TIPO_DE_GUARDA_CORPO[g.tipo]}`}>
                    <td className="py-1 pr-2">
                      <button type="button" onClick={() => onSelecionar(g.id)} className="font-medium text-slate-800 hover:underline">{g.rotulo || ROTULO_DO_TIPO_DE_GUARDA_CORPO[g.tipo]}</button>
                      {g.sugerido && <span className="ml-1 text-[10px] text-slate-400">sugerido</span>}
                    </td>
                    <td className="py-1 pr-2 text-slate-600">{ROTULO_DO_MATERIAL_DE_GUARDA_CORPO[g.material]}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{m(comprimentoDoGuardaCorpo(g))}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{textoEmCm(g.alturaMm)}</td>
                    <td className="py-1 pr-2">{g.itemCode ? <span className="text-slate-700">{g.itemCode}</span> : <span className="text-amber-800">sem item</span>}</td>
                    <td className="py-1">
                      {avisos.length === 0 ? <span className="text-emerald-700">ok</span> : avisos.map((a, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 ${a.gravidade === 'ERRO' ? 'text-red-700' : 'text-amber-800'}`}><AlertTriangle className="h-3 w-3" /> {a.norma}: {a.texto}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
