/**
 * ROTEIRO PERIMÉTRICO (A1) — o relatório em gaveta.
 *
 * Três partes, na ordem em que se usa: a tabela vértice a vértice (o que a
 * matrícula e o SIGEF pedem), o memorial convencional pronto para copiar, e a
 * restituição — colar um memorial e lançar as divisas dele.
 *
 * Nada aqui grava: a tabela é derivada; o memorial é texto; a restituição
 * emite comandos pelo pai, num lote só que o Ctrl+Z desfaz.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCopy, Hash, MapPin } from 'lucide-react';
import type { RoteiroPerimetrico } from '../../utils/blueprintRoteiroPerimetrico';
import { restituirMemorial } from '../../utils/blueprintRoteiroPerimetrico';
import { numeroBr } from '../../utils/blueprintMemorialLote';

interface Props {
  roteiro: RoteiroPerimetrico;
  memorial: string;
  onNomear: () => void;
  /** Lança as divisas de um anel restituído (mm locais). */
  onRestituir: (anel: { x: number; y: number }[]) => void;
  /** Já existe lote desenhado: restituir por cima seria destruição. */
  temLote: boolean;
}

export default function PainelRoteiroPerimetrico({ roteiro, memorial, onNomear, onRestituir, temLote }: Props) {
  const [textoColado, setTextoColado] = useState('');
  const [copiado, setCopiado] = useState(false);
  const restituicao = useMemo(() => (textoColado.trim() ? restituirMemorial(textoColado) : null), [textoColado]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(memorial);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-5 text-xs text-slate-700" data-testid="painel-roteiro">
      {roteiro.avisos.length > 0 && (
        <ul className="space-y-1">
          {roteiro.avisos.map((a, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      {roteiro.lados.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-slate-800">
              {roteiro.vertices.length} vértices · área {numeroBr(roteiro.areaMm2 / 1e6)} m² · perímetro {numeroBr(roteiro.perimetroMm / 1000)} m
              {roteiro.georreferenciado && roteiro.crs && <> · {roteiro.crs}</>}
            </p>
            {roteiro.vertices.some((v) => v.provisorio) && (
              <button
                type="button"
                onClick={onNomear}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="P1, P2… no sentido horário, num comando só (Ctrl+Z desfaz)"
              >
                <Hash className="h-3.5 w-3.5" /> Nomear P1…Pn
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5">Vértice</th>
                  {roteiro.georreferenciado && (
                    <>
                      <th className="px-2 py-1.5 text-right">E (m)</th>
                      <th className="px-2 py-1.5 text-right">N (m)</th>
                      <th className="px-2 py-1.5">Latitude</th>
                      <th className="px-2 py-1.5">Longitude</th>
                    </>
                  )}
                  <th className="px-2 py-1.5">Para</th>
                  <th className="px-2 py-1.5 text-right" title={roteiro.georreferenciado ? 'Verdadeiro, corrigido da convergência meridiana' : 'De DESENHO: contra o eixo Y do modelo'}>
                    Azimute{roteiro.georreferenciado ? '' : ' (des.)'}
                  </th>
                  <th className="px-2 py-1.5">Rumo</th>
                  <th className="px-2 py-1.5 text-right">Dist. (m)</th>
                  <th className="px-2 py-1.5">Confrontante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roteiro.lados.map((l, i) => {
                  const v = roteiro.vertices[i];
                  return (
                    <tr key={l.divisaId}>
                      <td className={`px-2 py-1.5 ${v.provisorio ? 'text-slate-400' : 'text-slate-800'}`}>{v.nome}</td>
                      {roteiro.georreferenciado && (
                        <>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.este != null ? numeroBr(v.este, 3) : '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.norte != null ? numeroBr(v.norte, 3) : '—'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{v.latitudeTexto ?? '—'}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{v.longitudeTexto ?? '—'}</td>
                        </>
                      )}
                      <td className="px-2 py-1.5">{l.para}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{l.azimuteTexto}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{l.rumoTexto}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{numeroBr((l.distanciaNoTerrenoMm ?? l.distanciaMm) / 1000)}</td>
                      <td className="px-2 py-1.5">{l.confrontante ?? <span className="text-slate-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-slate-500">
            Fechamento angular: {numeroBr(roteiro.fechaEmGraus, 4)}°
            {roteiro.georreferenciado && roteiro.convergenciaGraus != null && (
              <> · convergência meridiana {numeroBr(roteiro.convergenciaGraus, 4)}°</>
            )}
          </p>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium text-slate-800">Memorial convencional</p>
              <button
                type="button"
                onClick={() => void copiar()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ClipboardCopy className="h-3.5 w-3.5" /> {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <textarea
              readOnly
              value={memorial}
              rows={6}
              aria-label="Memorial descritivo convencional"
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-slate-700"
            />
          </div>
        </>
      )}

      <div>
        <p className="mb-1 flex items-center gap-1.5 font-medium text-slate-800">
          <MapPin className="h-3.5 w-3.5" /> Restituir por memorial
        </p>
        <p className="mb-1.5 text-slate-500">
          Cole o memorial da escritura ("segue com azimute 45°30' e distância de 32,50 m até…"). Os trechos lidos viram o contorno
          do lote; o que não der para ler fica listado aqui, não some.
        </p>
        <textarea
          value={textoColado}
          onChange={(e) => setTextoColado(e.target.value)}
          rows={4}
          placeholder="Inicia-se no vértice P1; daí segue com azimute 90°00'00&quot; e distância de 12,00 m até o vértice P2; …"
          aria-label="Texto do memorial a restituir"
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
        />
        {restituicao && (
          <div className="mt-2 space-y-1.5" data-testid="restituicao">
            <p className="text-slate-700">
              {restituicao.trechos.length} trecho(s) lido(s) · erro de fechamento {numeroBr(restituicao.erroDeFechamentoMm / 1000, 3)} m
            </p>
            {restituicao.naoLidos.length > 0 && (
              <ul className="space-y-1">
                {restituicao.naoLidos.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Não li: “{t.slice(0, 90)}{t.length > 90 ? '…' : ''}”</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => onRestituir(restituicao.anel)}
              disabled={temLote || restituicao.anel.length < 3}
              title={
                temLote
                  ? 'Já há lote desenhado: apague as divisas antes — restituir por cima seria destruição'
                  : restituicao.anel.length < 3
                    ? 'Precisa de pelo menos 3 trechos lidos'
                    : 'Lança as divisas num lote só de comandos — Ctrl+Z desfaz'
              }
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Lançar {restituicao.anel.length} divisas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
