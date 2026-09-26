/**
 * CAR (A5) — o relatório em gaveta: o quadro dos temas do SICAR desenhados
 * (área do imóvel, APP, Reserva Legal…), o apoio à Reserva Legal pelo bioma e
 * os arquivos por tema. Os temas se desenham com a ferramenta Área (grupo
 * Loteamento), escolhendo o tipo no grupo "Ambiental (CAR)".
 */
import React from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import {
  apoioAReservaLegal,
  BIOMAS_DA_RESERVA_LEGAL,
  quadroDoCar,
  type BiomaDaReservaLegal,
  type CarDoImovel,
} from '../../utils/blueprintCar';
import type { EstadoDaGravacao } from '../../hooks/useBlueprintRegularizacao';

export interface Props {
  car: CarDoImovel;
  bioma: BiomaDaReservaLegal;
  onBioma: (b: BiomaDaReservaLegal) => void;
  onExportar: (formato: 'shp' | 'kml' | 'csv') => void;
  /** A localização do imóvel fica gravada no estudo; isto diz se gravou. */
  estadoDaGravacao?: EstadoDaGravacao;
}

const ha = (v: number) => v.toFixed(4).replace('.', ',');

export default function PainelCar({ car, bioma, onBioma, onExportar, estadoDaGravacao = 'SALVO' }: Props) {
  const quadro = quadroDoCar(car);
  const rl = car.areaDoImovelM2 > 0 ? apoioAReservaLegal(car, bioma) : null;
  const temas = quadro.filter((l) => l.tema !== 'AREA_IMOVEL').length;
  const motivoSemArquivo = !car.georreferenciado ? 'Informe a georreferência do imóvel em "Onde fica": o SICAR recebe latitude/longitude em SIRGAS 2000' : car.areaDoImovelM2 === 0 ? 'Feche o contorno do imóvel com a ferramenta Terreno' : null;
  return (
    <div className="space-y-5 text-xs text-slate-700" data-testid="painel-car">
      <p className="rounded-md bg-slate-50 px-3 py-2 text-slate-600">
        Os temas se desenham com a ferramenta <strong>Área</strong> (grupo Loteamento), no tipo do grupo <strong>Ambiental (CAR)</strong>. Estes
        arquivos são para o responsável carregar no módulo de cadastro do SICAR — a inscrição e a análise são do órgão ambiental.
      </p>

      {car.avisos.length > 0 && (
        <ul className="space-y-1">
          {car.avisos.map((a, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      <section>
        <p className="font-medium text-slate-800">Quadro de áreas{car.georreferenciado ? ' (plano topográfico local)' : ' (medidas do desenho)'}</p>
        {quadro.length === 0 ? (
          <p className="mt-1 text-slate-500">Nada desenhado ainda.</p>
        ) : (
          <div className="mt-1 overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs" data-testid="car-quadro">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-2 py-1.5">Tema</th>
                  <th className="px-2 py-1.5 text-right">Polígonos</th>
                  <th className="px-2 py-1.5 text-right">Área (ha)</th>
                  <th className="px-2 py-1.5 text-right">% do imóvel</th>
                  <th className="px-2 py-1.5 text-right">Perímetro (m)</th>
                </tr>
              </thead>
              <tbody>
                {quadro.map((l) => (
                  <tr key={l.tema} className="border-t border-slate-100">
                    <td className="px-2 py-1">{l.rotulo}</td>
                    <td className="px-2 py-1 text-right">{l.quantidade}</td>
                    <td className="px-2 py-1 text-right">{ha(l.areaHa)}</td>
                    <td className="px-2 py-1 text-right">{l.percentual === null ? '—' : `${l.percentual.toFixed(2).replace('.', ',')} %`}</td>
                    <td className="px-2 py-1 text-right">{l.perimetroM.toFixed(2).replace('.', ',')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section data-testid="car-reserva-legal">
        <p className="font-medium text-slate-800">Reserva Legal — apoio ao cálculo</p>
        <label className="mt-1 block text-[11px] text-slate-500">
          <span className="block">Localização do imóvel (Código Florestal, art. 12)</span>
          <select value={bioma} aria-label="Localização do imóvel para a Reserva Legal" onChange={(e) => onBioma(e.target.value as BiomaDaReservaLegal)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-800">
            {(Object.keys(BIOMAS_DA_RESERVA_LEGAL) as BiomaDaReservaLegal[]).map((b) => (
              <option key={b} value={b}>
                {BIOMAS_DA_RESERVA_LEGAL[b].rotulo} — {BIOMAS_DA_RESERVA_LEGAL[b].pct} %
              </option>
            ))}
          </select>
        </label>
      <p className={`text-[11px] ${estadoDaGravacao === 'INDISPONIVEL' ? 'text-amber-700' : 'text-slate-500'}`} data-testid="car-gravacao">
        {estadoDaGravacao === 'CARREGANDO'
          ? 'Lendo os dados gravados do estudo…'
          : estadoDaGravacao === 'SALVANDO'
            ? 'Gravando no estudo…'
            : estadoDaGravacao === 'INDISPONIVEL'
              ? 'Não consegui gravar no estudo: o que mudar agora fica só nesta aba.'
              : 'A localização fica gravada no estudo, para todos da organização.'}
      </p>
        {rl && (
          <>
            <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
              <div>
                <dt className="text-slate-500">Exigida ({rl.exigidaPct} %)</dt>
                <dd className="font-medium text-slate-800">{ha(rl.exigidaHa)} ha</dd>
              </div>
              <div>
                <dt className="text-slate-500">Desenhada</dt>
                <dd className="font-medium text-slate-800">
                  {ha(rl.declaradaHa)} ha ({rl.declaradaPct.toFixed(2).replace('.', ',')} %)
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{rl.saldoHa >= 0 ? 'Sobra' : 'Falta'}</dt>
                <dd className={`font-medium ${rl.saldoHa >= -1e-4 ? 'text-emerald-700' : 'text-rose-700'}`}>{ha(Math.abs(rl.saldoHa))} ha</dd>
              </div>
            </dl>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
              {rl.notas.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <p className="font-medium text-slate-800">Arquivos para o SICAR</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {(
            [
              ['shp', `Shapefile por tema (${temas + (car.areaDoImovelM2 > 0 ? 1 : 0)})`, 'Um .shp por tema (AREA_IMOVEL, APP, RESERVA_LEGAL…) em SIRGAS 2000 geográfico, com TEMA, NOME, AREA_HA e PERIM_M — num .zip'],
              ['kml', 'KML', 'Uma pasta por tema, na cor do tema, para conferir no Google Earth'],
              ['csv', 'Coordenadas (CSV)', 'Vértice a vértice de cada polígono: longitude e latitude SIRGAS 2000'],
            ] as const
          ).map(([f, rotulo, dica]) => (
            <button
              key={f}
              type="button"
              disabled={!!motivoSemArquivo}
              title={motivoSemArquivo ?? dica}
              onClick={() => onExportar(f)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> {rotulo}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
