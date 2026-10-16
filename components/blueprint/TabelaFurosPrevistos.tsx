/**
 * TABELA DOS FUROS PREVISTOS (F14c da casa automática, 16/10/2026) — a lista que vai ao calculista: cada passagem de
 * rede por viga, baldrame ou laje, com o diâmetro do furo, a cota, a posição ao longo da viga, a distância à face do
 * apoio e a situação pelos critérios da NBR 6118 (13.2.5.1) tomados como hipóteses — "dispensa a verificação" ou
 * "verificar com o calculista", com o motivo. Ver `utils/blueprintFurosPrevistos.ts`.
 */
import React from 'react';

import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { ROTULO_DA_DISCIPLINA } from '../../utils/blueprintRede';
import type { FuroPrevisto } from '../../utils/blueprintFurosPrevistos';

const COLUNAS: StandardTableColumn[] = [
  { key: 'peca', label: 'Peça', width: 120 },
  { key: 'pavimento', label: 'Pavimento', width: 120 },
  { key: 'rede', label: 'Rede', width: 130 },
  { key: 'direcao', label: 'Furo', width: 100 },
  { key: 'diametro', label: 'Ø (cm)', width: 80, align: 'right' },
  { key: 'cota', label: 'Cota (m)', width: 90, align: 'right' },
  { key: 'aoLongo', label: 'Ao longo (m)', width: 110, align: 'right' },
  { key: 'apoio', label: 'Do apoio (cm)', width: 120, align: 'right' },
  { key: 'situacao', label: 'Situação', width: 320, sortable: false },
];

const TIPO_DA_PECA: Record<FuroPrevisto['tipoDaPeca'], string> = { VIGA: 'viga', VIGA_FUNDACAO: 'baldrame', LAJE: 'laje' };

const f1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const situacao = (f: FuroPrevisto) => (f.dispensa === null ? 'passagem na laje' : f.dispensa ? 'dispensa a verificação' : 'verificar com o calculista');

interface Props {
  furos: readonly FuroPrevisto[];
  /** Os nomes dos pavimentos, por id. */
  pavimentos: ReadonlyMap<string, string>;
}

export function TabelaFurosPrevistos({ furos, pavimentos }: Props) {
  // Uma chave por linha: o mesmo trecho pode furar duas peças, e a mesma peça receber vários trechos.
  const linhas = React.useMemo(() => furos.map((f, i) => ({ ...f, chave: `${f.pecaId}|${f.trechoId}|${i}` })), [furos]);
  return (
    <StandardTable<FuroPrevisto & { chave: string }>
      columns={COLUNAS}
      storageKey="blueprint:casaFurosPrevistos"
      rows={linhas}
      rowKey={(f) => f.chave}
      dense
      maxHeight="24rem"
      searchText={(f) => `${f.peca} ${TIPO_DA_PECA[f.tipoDaPeca]} ${pavimentos.get(f.levelId) ?? ''} ${ROTULO_DA_DISCIPLINA[f.disciplina]} ${situacao(f)} ${f.motivos.join(' ')}`}
      searchPlaceholder="Buscar peça, rede ou situação"
      sortValue={(key, f) => {
        switch (key) {
          case 'peca':
            return f.peca;
          case 'pavimento':
            return pavimentos.get(f.levelId) ?? '';
          case 'rede':
            return ROTULO_DA_DISCIPLINA[f.disciplina];
          case 'direcao':
            return f.direcao;
          case 'diametro':
            return f.diametroMm;
          case 'cota':
            return f.cotaMm;
          case 'aoLongo':
            return f.aoLongoMm ?? -1;
          case 'apoio':
            return f.distanciaAoApoioMm ?? -1;
          default:
            return null;
        }
      }}
      renderCell={(key, f) => {
        switch (key) {
          case 'peca':
            return (
              <span className="text-sm text-gray-800">
                <span className="font-medium">{f.peca}</span> <span className="text-xs text-slate-500">{TIPO_DA_PECA[f.tipoDaPeca]}</span>
              </span>
            );
          case 'pavimento':
            return <span className="text-sm text-gray-700">{pavimentos.get(f.levelId) ?? '—'}</span>;
          case 'rede':
            return <span className="text-sm text-gray-700">{ROTULO_DA_DISCIPLINA[f.disciplina]}</span>;
          case 'direcao':
            return <span className="text-sm text-gray-700">{f.direcao === 'VERTICAL' ? 'desce' : 'atravessa'}</span>;
          case 'diametro':
            return <span className="block text-right text-sm tabular-nums text-gray-700">{f1(f.diametroMm / 10)}</span>;
          case 'cota':
            return <span className="block text-right text-sm tabular-nums text-gray-700">{f2(f.cotaMm / 1000)}</span>;
          case 'aoLongo':
            return <span className="block text-right text-sm tabular-nums text-gray-700">{f.aoLongoMm != null ? f2(f.aoLongoMm / 1000) : '—'}</span>;
          case 'apoio':
            return <span className="block text-right text-sm tabular-nums text-gray-700">{f.distanciaAoApoioMm != null ? f1(f.distanciaAoApoioMm / 10) : '—'}</span>;
          case 'situacao':
            return (
              <span className="block text-sm">
                <span className={f.dispensa === null ? 'text-slate-600' : f.dispensa ? 'text-emerald-700' : 'text-amber-700'}>{situacao(f)}</span>
                {f.motivos.length > 0 && <span className="block break-words text-xs text-slate-500">{f.motivos.join('; ')}</span>}
              </span>
            );
          default:
            return null;
        }
      }}
      empty={{ title: 'Nenhum furo previsto', subtitle: 'Nenhuma rede atravessa viga, baldrame ou laje.' }}
    />
  );
}
