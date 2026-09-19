/**
 * TELA de Unidades (18/09/2026, E2.2): a unidade autônoma como objeto.
 *
 * Duas tabelas em fluxo (molde `TelaQuantitativos`): **Unidades** — número,
 * tipologia e PCD editáveis na linha, ambientes que a compõem, área privativa
 * NBR 12721, fração ideal e com quem divide parede — e **Por pavimento** —
 * construída, privativa e comum. A COMPOSIÇÃO (que ambiente é de qual
 * unidade) se faz no cartão do ambiente, no Navegador: é lá que o ambiente
 * está; a tela só diz o que falta compor.
 *
 * A ponte com o Planta AI é um botão: lê as `plant_units` dos cenários do
 * empreendimento do estudo e cria as unidades que faltam (por número), sem
 * ambientes — o gerador de massa não desenha cômodos. Quando a leitura
 * existe, a coluna "Planta AI (m²)" mostra a privativa prevista lá ao lado da
 * medida aqui.
 */
import React, { useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import type { BlueprintModel, Command } from '../../utils/blueprintKernel';
import {
  comandosDeImportacaoDoPlantaAi,
  formatarFracao,
  mm2ParaM2,
  type MedidaDaUnidade,
  type QuadroDeUnidades,
  type UnidadeExterna,
} from '../../utils/blueprintUnidades';
import ActionIconButton from '../ui/ActionIconButton';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';

interface Props {
  model: BlueprintModel;
  quadro: QuadroDeUnidades;
  onRun: (c: Command) => void;
  onRunBatch: (cs: Command[]) => void;
  /** A última recusa do kernel (`editor.lastError`) — a faixa do editor fica escondida enquanto a tela está aberta. */
  erro: string | null;
  /** `null` = o estudo não está ligado a um empreendimento — o botão explica. */
  carregarDoPlantaAi: (() => Promise<{ unidades: UnidadeExterna[]; cenarios: number }>) | null;
}

type Linha = QuadroDeUnidades['unidades'][number];

const COLUNAS: StandardTableColumn[] = [
  { key: 'numero', label: 'Unidade', width: 110 },
  { key: 'tipologia', label: 'Tipologia', width: 150 },
  { key: 'pcd', label: 'PCD', width: 70, align: 'center' },
  { key: 'pavimentos', label: 'Pavimento', width: 130 },
  { key: 'ambientes', label: 'Ambientes', width: 300, sortable: false },
  { key: 'areaPrivativaM2', label: 'Privativa (m²)', width: 130, align: 'right' },
  { key: 'fracaoIdeal', label: 'Fração ideal', width: 150, align: 'right' },
  { key: 'plantaAi', label: 'Planta AI (m²)', width: 130, align: 'right' },
  { key: 'geminadaCom', label: 'Geminada com', width: 150, sortable: false },
];

const COLUNAS_PAVIMENTO: StandardTableColumn[] = [
  { key: 'nome', label: 'Pavimento', width: 160 },
  { key: 'unidades', label: 'Unidades', width: 100, align: 'right' },
  { key: 'areaConstruidaM2', label: 'Construída (m²)', width: 140, align: 'right' },
  { key: 'areaPrivativaM2', label: 'Privativa (m²)', width: 140, align: 'right' },
  { key: 'areaComumM2', label: 'Comum (m²)', width: 130, align: 'right' },
];

const fmt = (m2: number) => m2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TelaUnidades({ model, quadro, onRun, onRunBatch, carregarDoPlantaAi, erro }: Props) {
  const [novoNumero, setNovoNumero] = useState('');
  const [externas, setExternas] = useState<UnidadeExterna[] | null>(null);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const nomeDoNivel = (id: string) => model.levels.find((l) => l.id === id)?.name ?? '?';
  const numeroDe = (id: string) => quadro.unidades.find((u) => u.id === id)?.numero ?? '?';
  const externaPorNumero = useMemo(() => new Map((externas ?? []).map((e) => [e.codigo.trim(), e])), [externas]);
  const semAmbiente = quadro.unidades.filter((u) => u.ambientes.length === 0).length;
  const semUnidade = model.spaces.filter((s) => !s.labelUid || !quadro.unidades.some((u) => u.ambientes.some((a) => a.id === s.id))).length;

  const tentar = (c: Command) => onRun(c);

  const criar = () => {
    const numero = novoNumero.trim();
    if (!numero) return;
    tentar({ type: 'AddUnidade', numero });
    setNovoNumero('');
  };

  const importar = async () => {
    if (!carregarDoPlantaAi) return;
    setImportando(true);
    setAviso(null);
    try {
      const { unidades, cenarios } = await carregarDoPlantaAi();
      setExternas(unidades);
      if (cenarios === 0) {
        setAviso('O empreendimento deste estudo não tem torre ligada a um cenário do Planta AI.');
        return;
      }
      const { comandos, jaExistiam } = comandosDeImportacaoDoPlantaAi(model, unidades);
      if (comandos.length > 0) onRunBatch(comandos);
      setAviso(
        `${cenarios} cenário(s), ${unidades.length} unidade(s) lida(s): ${comandos.length} criada(s)` +
          (jaExistiam.length ? `, ${jaExistiam.length} já existia(m)` : '') +
          '. As criadas nascem sem ambientes — componha no cartão do ambiente. A coluna "Planta AI (m²)" mostra a privativa prevista lá.',
      );
    } catch (e) {
      setAviso(`Não foi possível ler o Planta AI: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImportando(false);
    }
  };

  const celula = (key: string, u: Linha): React.ReactNode => {
    switch (key) {
      case 'numero':
        return (
          <input
            defaultValue={u.numero}
            key={`${u.id}-${u.numero}`}
            aria-label={`Número da unidade ${u.numero}`}
            onBlur={(e) => e.target.value.trim() !== u.numero && tentar({ type: 'SetUnidadeProps', unidadeId: u.id, numero: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-gray-900 hover:border-slate-200 focus:border-blue-400 focus:bg-white"
          />
        );
      case 'tipologia':
        return (
          <input
            defaultValue={u.tipologia ?? ''}
            key={`${u.id}-${u.tipologia ?? ''}`}
            placeholder="ex.: 2 dorm."
            aria-label={`Tipologia da unidade ${u.numero}`}
            onBlur={(e) => (e.target.value.trim() || null) !== (u.tipologia ?? null) && tentar({ type: 'SetUnidadeProps', unidadeId: u.id, tipologia: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-gray-700 hover:border-slate-200 focus:border-blue-400 focus:bg-white"
          />
        );
      case 'pcd':
        return (
          <input
            type="checkbox"
            checked={u.pcd}
            aria-label={`Unidade ${u.numero} adaptada (PCD)`}
            onChange={(e) => tentar({ type: 'SetUnidadeProps', unidadeId: u.id, pcd: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
        );
      case 'pavimentos':
        return <span className="text-sm text-gray-600">{u.levelIds.length ? u.levelIds.map(nomeDoNivel).join(' + ') : '—'}</span>;
      case 'ambientes':
        return u.ambientes.length ? (
          <span className="text-sm text-gray-700">{u.ambientes.map((s) => s.name ?? 'Ambiente').join(', ')}</span>
        ) : (
          <span className="text-xs text-amber-700">sem ambientes — escolha esta unidade no cartão do ambiente (Navegador › Ambientes)</span>
        );
      case 'areaPrivativaM2':
        return (
          <span className="block text-right text-sm font-semibold tabular-nums text-gray-900" title={`eixo ${fmt(mm2ParaM2(u.areaDeEixoMm2))} + externas ${fmt(mm2ParaM2(u.areaDasParedesExternasMm2))}`}>
            {u.ambientes.length ? fmt(mm2ParaM2(u.areaPrivativaMm2)) : '—'}
          </span>
        );
      case 'fracaoIdeal': {
        const f = formatarFracao(u.fracaoIdeal);
        return (
          <span className="block text-right text-sm tabular-nums text-gray-700" title={f.decimal}>
            {u.ambientes.length ? f.milesimos : '—'}
          </span>
        );
      }
      case 'plantaAi': {
        const e = externaPorNumero.get(u.numero);
        return <span className="block text-right text-sm tabular-nums text-gray-500">{e?.areaPrivativaM2 != null ? fmt(e.areaPrivativaM2) : '—'}</span>;
      }
      case 'geminadaCom':
        return <span className="text-sm text-gray-600">{u.geminadaCom.length ? u.geminadaCom.map(numeroDe).join(', ') : '—'}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" data-testid="tela-unidades">
      {/* Resumo: o que existe e o que falta compor. */}
      <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700">
        <strong className="text-gray-900">{quadro.unidades.length}</strong> unidade(s) ·{' '}
        <strong className="text-gray-900">{fmt(mm2ParaM2(quadro.totalPrivativaMm2))} m²</strong> privativos
        {semAmbiente > 0 && <span className="text-amber-700"> · {semAmbiente} sem ambientes</span>}
        {semUnidade > 0 && <span className="text-slate-500"> · {semUnidade} ambiente(s) fora de unidade (áreas comuns ou por compor)</span>}
        <p className="mt-1 text-xs text-slate-500">
          Área privativa pelo critério da NBR 12721: ambientes medidos pelo eixo das paredes (a geminada e a divisa com área comum entram pela metade) mais a metade
          externa das paredes externas. Área comum do pavimento = construída − privativas. Fração ideal = privativa ÷ Σ privativas do estudo.
        </p>
      </div>

      <StandardTable<Linha>
        columns={COLUNAS}
        storageKey="blueprint:unidades"
        rows={quadro.unidades}
        rowKey={(u) => u.id}
        renderCell={celula}
        sortValue={(key, u) => {
          if (key === 'areaPrivativaM2') return u.areaPrivativaMm2;
          if (key === 'fracaoIdeal') return u.fracaoIdeal;
          if (key === 'pavimentos') return u.levelIds.map(nomeDoNivel).join(' + ');
          if (key === 'plantaAi') return externaPorNumero.get(u.numero)?.areaPrivativaM2 ?? -1;
          return (u as unknown as Record<string, string | number | boolean | null>)[key];
        }}
        searchText={(u) => `${u.numero} ${u.tipologia ?? ''} ${u.ambientes.map((s) => s.name ?? '').join(' ')}`}
        searchPlaceholder="Buscar unidade ou ambiente…"
        actions={{
          render: (u) => <ActionIconButton kind="delete" title={`Excluir a unidade ${u.numero} (os ambientes ficam)`} onClick={() => tentar({ type: 'DeleteUnidade', unidadeId: u.id })} />,
        }}
        toolbarRight={
          <div className="flex items-center gap-2">
            <input
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criar()}
              placeholder="Número (ex.: 101)"
              aria-label="Número da nova unidade"
              className="h-9 w-40 rounded-[6px] border border-slate-300 px-2 text-sm"
            />
            <button type="button" onClick={criar} disabled={!novoNumero.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white disabled:bg-slate-300">
              <Plus className="h-4 w-4" /> Nova unidade
            </button>
            <button
              type="button"
              onClick={() => void importar()}
              disabled={importando || !carregarDoPlantaAi}
              title={carregarDoPlantaAi ? 'Cria as unidades que faltam a partir das plant_units do Planta AI do empreendimento' : 'Ligue o estudo a um empreendimento (Terreno › Zona urbanística) para importar do Planta AI'}
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {importando ? 'Lendo…' : 'Importar do Planta AI'}
            </button>
          </div>
        }
        empty={{ title: 'Nenhuma unidade ainda', subtitle: 'Crie pelo número ou importe do Planta AI; depois escolha a unidade no cartão de cada ambiente.' }}
        footer={
          erro || aviso ? (
            <div className="px-5 py-2 text-xs">
              {erro && <p className="text-red-700" role="alert">{erro}</p>}
              {aviso && <p className="text-slate-600" role="status">{aviso}</p>}
            </div>
          ) : undefined
        }
      />

      <StandardTable<QuadroDeUnidades['pavimentos'][number]>
        columns={COLUNAS_PAVIMENTO}
        storageKey="blueprint:unidadesPavimentos"
        rows={quadro.pavimentos}
        rowKey={(p) => p.levelId}
        renderCell={(key, p) => {
          switch (key) {
            case 'nome':
              return <span className="text-sm font-medium text-gray-800">{p.nome}</span>;
            case 'unidades':
              return <span className="block text-right text-sm tabular-nums text-gray-700">{p.unidades}</span>;
            case 'areaConstruidaM2':
              return <span className="block text-right text-sm tabular-nums text-gray-700">{fmt(mm2ParaM2(p.areaConstruidaMm2))}</span>;
            case 'areaPrivativaM2':
              return <span className="block text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(mm2ParaM2(p.areaPrivativaMm2))}</span>;
            case 'areaComumM2':
              return <span className="block text-right text-sm tabular-nums text-gray-700">{fmt(mm2ParaM2(p.areaComumMm2))}</span>;
            default:
              return null;
          }
        }}
        sortValue={(key, p) => (key === 'nome' ? p.nome : (p as unknown as Record<string, number>)[key.replace('M2', 'Mm2')] ?? p.unidades)}
        searchText={(p) => p.nome}
        searchPlaceholder="Buscar pavimento…"
        empty={{ title: 'Sem pavimentos' }}
      />
    </div>
  );
}

export type { MedidaDaUnidade };
