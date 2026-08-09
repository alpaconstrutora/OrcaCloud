import React, { useCallback, useEffect, useState } from 'react';
import { Boxes, Download, FileText, GitCompare, Image, Ruler, Shapes } from 'lucide-react';
import type { BlueprintStudy, BlueprintSnapshotSummary } from '../../types/blueprint';
import { getSnapshot, listSnapshots } from '../../services/blueprintService';
import {
  exportarDxf,
  exportarIfc,
  exportarManifesto,
  exportarPdf,
  exportarPng,
} from '../../services/blueprintExportService';
import {
  ESCALAS,
  PAPEIS,
  enquadrar,
  orientar,
  type OpcoesExportacao,
} from '../../utils/blueprintExport';
import { diffSnapshots, type DiffSnapshots } from '../../utils/blueprintDiff';
import {
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  type BlueprintModel,
} from '../../utils/blueprintKernel';

/**
 * Épico E4 — histórico de versões, comparação e exportação.
 *
 * A escala é ENTRADA, não resultado: quem exporta escolhe 1:50 ou 1:100, e a
 * tela diz de antemão se cabe no papel. Encolher para caber produziria uma folha
 * que diz 1:100 e mede outra coisa — e alguém vai medir com escalímetro.
 */
export default function PainelVersoes({ study }: { study: BlueprintStudy }) {
  const [snapshots, setSnapshots] = useState<BlueprintSnapshotSummary[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionada, setSelecionada] = useState<string>('');
  const [modelo, setModelo] = useState<BlueprintModel | null>(null);
  const [denominador, setDenominador] = useState(100);
  const [papelId, setPapelId] = useState('A4');
  const [paisagem, setPaisagem] = useState(false);
  const [cotas, setCotas] = useState(false);

  const [compararCom, setCompararCom] = useState<string>('');
  const [diff, setDiff] = useState<DiffSnapshots | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await listSnapshots(study.id);
      setSnapshots(lista);
      if (lista.length > 0) setSelecionada((atual) => atual || lista[0].id);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao carregar as versões');
    } finally {
      setCarregando(false);
    }
  }, [study.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O modelo da versão escolhida é reconstruído do payload canônico — o mesmo
  // caminho do quantitativo. Exportar do que está na tela produziria uma folha
  // que cita uma versão e desenha outra.
  useEffect(() => {
    if (!selecionada) return;
    setDiff(null);
    getSnapshot(selecionada)
      .then((s) =>
        setModelo(
          s ? modelFromCanonicalPayload(parseCanonicalPayload(JSON.stringify(s.payload))) : null,
        ),
      )
      .catch((e) => setErro(e instanceof Error ? e.message : 'falha ao abrir a versão'));
  }, [selecionada]);

  const papel = orientar(PAPEIS.find((p) => p.id === papelId) ?? PAPEIS[0], paisagem);
  const snapshot = snapshots.find((s) => s.id === selecionada) ?? null;
  // O enquadramento precisa saber das cotas: elas consomem uma faixa fixa de
  // papel, então ligar cota pode fazer uma escala que cabia deixar de caber.
  const enq = modelo ? enquadrar(modelo, denominador, papel, cotas) : null;

  function opcoes(): OpcoesExportacao {
    return {
      denominador,
      papel,
      titulo: study.name,
      revisao: snapshot?.revision ?? 0,
      hash: snapshot?.hash ?? '',
      cotas,
    };
  }

  function exportar(fn: (m: BlueprintModel, o: OpcoesExportacao) => void) {
    if (!modelo) return;
    setErro(null);
    try {
      fn(modelo, opcoes());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao exportar');
    }
  }

  async function comparar() {
    if (!compararCom || !modelo) return;
    setOcupado(true);
    setErro(null);
    try {
      const outro = await getSnapshot(compararCom);
      if (!outro) return;
      const antigo = modelFromCanonicalPayload(
        parseCanonicalPayload(JSON.stringify(outro.payload)),
      );
      // A ordem importa na leitura: a versão MAIS ANTIGA é o "antes".
      const revOutro = snapshots.find((s) => s.id === compararCom)?.revision ?? 0;
      const revAtual = snapshot?.revision ?? 0;
      setDiff(
        revOutro < revAtual ? diffSnapshots(antigo, modelo) : diffSnapshots(modelo, antigo),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao comparar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="overflow-y-auto">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Versões</h2>
        <p className="text-xs text-slate-500">
          Cada versão publicada é imutável. Exportar sempre parte dela, nunca do
          rascunho na tela.
        </p>
      </div>

      {carregando ? (
        <p className="px-4 py-3 text-xs text-slate-500">Carregando…</p>
      ) : snapshots.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-500">
          Nenhuma versão publicada ainda. Publique para poder exportar e comparar.
        </p>
      ) : (
        <>
          {/* ── Histórico ──────────────────────────────────────────────────── */}
          <ul className="divide-y divide-slate-100 border-b border-slate-200">
            {snapshots.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelecionada(s.id)}
                  aria-current={s.id === selecionada}
                  className={`w-full px-4 py-2 text-left text-xs hover:bg-slate-50 ${
                    s.id === selecionada ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="font-medium text-slate-700">Versão {s.revision}</span>
                  <span className="ml-2 text-slate-500">
                    {new Date(s.published_at).toLocaleString('pt-BR')}
                  </span>
                  <span className="block font-mono text-[10px] text-slate-400">
                    {s.hash.slice(0, 16)}
                  </span>
                  {s.notes && <span className="block text-slate-500">{s.notes}</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* ── Exportação ─────────────────────────────────────────────────── */}
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Exportar versão {snapshot?.revision}
            </h3>

            <div className="mt-2 flex gap-1.5">
              <label className="flex-1 text-[11px] text-slate-600">
                Escala
                <select
                  value={denominador}
                  onChange={(e) => setDenominador(Number(e.target.value))}
                  aria-label="Escala"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {ESCALAS.map((d) => (
                    <option key={d} value={d}>
                      1:{d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-[11px] text-slate-600">
                Papel
                <select
                  value={papelId}
                  onChange={(e) => setPapelId(e.target.value)}
                  aria-label="Papel"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  {PAPEIS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={paisagem}
                  onChange={(e) => setPaisagem(e.target.checked)}
                />
                Paisagem
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={cotas}
                  onChange={(e) => setCotas(e.target.checked)}
                />
                <Ruler className="h-3 w-3" /> Cotas
              </label>
            </div>
            {cotas && (
              <p className="mt-1 text-[11px] text-slate-500">
                Cotas medidas no EIXO das paredes — a medida de face é menor em meia
                espessura de cada lado. A folha declara isso.
              </p>
            )}

            {/* O aviso vem ANTES do botão: descobrir que não cabe depois de
                clicar em exportar é descobrir tarde. */}
            {enq && !enq.cabe && (
              <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                O desenho não cabe em 1:{denominador} neste papel — ele mede{' '}
                {enq.desenhoLarguraMm.toFixed(0)} × {enq.desenhoAlturaMm.toFixed(0)} mm, e a
                área útil é {enq.utilLarguraMm} × {enq.utilAlturaMm} mm.{' '}
                {enq.escalaSugerida
                  ? `A partir de 1:${enq.escalaSugerida} cabe.`
                  : 'Nenhuma escala da lista serve — use um papel maior.'}
              </p>
            )}

            <div className="mt-2 flex gap-1.5">
              <BotaoExportar
                icone={FileText}
                rotulo="PDF"
                onClick={() => exportar(exportarPdf)}
                disabled={!modelo || !enq?.cabe}
              />
              <BotaoExportar
                icone={Image}
                rotulo="PNG"
                onClick={() => exportar((m, o) => exportarPng(m, o))}
                disabled={!modelo || !enq?.cabe}
              />
              <BotaoExportar
                icone={Download}
                rotulo="Manifesto"
                onClick={() => exportar(exportarManifesto)}
                disabled={!modelo}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              O manifesto é o JSON que liga o arquivo à versão — não depende de alguém
              ter lido o carimbo.
            </p>

            {/* Troca de arquivo com CAD e BIM. Separado da folha de propósito: os
                dois saem em 1:1, em unidade real, e a escala do papel não se
                aplica a eles. */}
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Para outros programas
            </h3>
            <div className="mt-1.5 flex gap-1.5">
              <BotaoExportar
                icone={Shapes}
                rotulo="DXF"
                onClick={() => exportar(exportarDxf)}
                disabled={!modelo}
              />
              <BotaoExportar
                icone={Boxes}
                rotulo="IFC"
                onClick={() => exportar(exportarIfc)}
                disabled={!modelo}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              DXF e IFC saem em <strong>1:1, em milímetro real</strong> — a escala é da
              prancha, não do arquivo. Cada um vem com um <code>.txt</code> dizendo o que
              contém e o que não contém; o IFC <strong>não leva portas nem janelas</strong>.
            </p>
          </div>

          {/* ── Comparação ─────────────────────────────────────────────────── */}
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comparar
            </h3>

            {snapshots.length < 2 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Só há uma versão publicada — não há com o que comparar.
              </p>
            ) : (
              <div className="mt-2 flex gap-1.5">
                <select
                  value={compararCom}
                  onChange={(e) => setCompararCom(e.target.value)}
                  aria-label="Versão a comparar"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Selecione…</option>
                  {snapshots
                    .filter((s) => s.id !== selecionada)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Versão {s.revision}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => void comparar()}
                  disabled={ocupado || !compararCom}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <GitCompare className="h-3 w-3" /> Comparar
                </button>
              </div>
            )}

            {diff && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-600">
                  {diff.resumo.paredesAntes} → {diff.resumo.paredesDepois} paredes ·{' '}
                  {diff.resumo.ambientesAntes} → {diff.resumo.ambientesDepois} ambientes ·{' '}
                  {diff.resumo.deltaAreaM2 >= 0 ? '+' : ''}
                  {diff.resumo.deltaAreaM2.toFixed(2).replace('.', ',')} m²
                </p>

                {diff.identicos ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    As duas versões têm a mesma geometria.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {diff.alteracoes.map((a, i) => (
                      <li
                        key={`${a.tipo}-${i}`}
                        className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700"
                      >
                        {a.descricao}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {erro && <p className="px-4 pb-3 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function BotaoExportar({
  icone: Icone,
  rotulo,
  onClick,
  disabled,
}: {
  icone: React.ElementType;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
    >
      <Icone className="h-3 w-3" /> {rotulo}
    </button>
  );
}
