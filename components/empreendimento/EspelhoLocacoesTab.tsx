// components/empreendimento/EspelhoLocacoesTab.tsx
// Ponte Empreendimento → Locações — espelho do EspelhoVendasTab, num eixo próprio.
// Publica unidades no módulo de Locações (commercial_properties purpose='RENTAL'),
// vinculadas por `rental_property_id`. Diferença de fundo em relação a Vendas: o
// Empreendimento não guarda ocupação de aluguel (Locado), então NÃO há "Sync do
// Comercial" (pull de status de volta) — a ocupação é gerida no módulo de Locações
// e aqui é só leitura. O aluguel mensal também é definido lá (publica com R$ 0).
import React from 'react';
import {
  Loader2, Unlink, RefreshCw, Upload, KeyRound,
  AlertCircle, Building2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService, buildCommercialAddressFields } from '../../services/empreendimentoService';
import { commercialService } from '../../services/commercialService';
import { Empreendimento, EmpreendimentoUnit } from '../../types';
import { useConfirm } from '../ui/confirm';
import {
  COMM_STATUS_LABEL, COMM_STATUS_STYLE, mapEmprToRentalStatus,
  mapPositionToCommercial, mapViewToCommercial, mapSunToCommercial,
} from '../../utils/empreendimentoComercial';

interface Props {
  empreendimento: Empreendimento;
}

type UnitWithTower = EmpreendimentoUnit & { _tower_name: string; _tower_project_id?: string | null };

interface CommercialSnap {
  id: string;
  status: string;
  price: number;
  name: string;
  specs?: Record<string, unknown>;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const EspelhoLocacoesTab: React.FC<Props> = ({ empreendimento: e }) => {
  // Sempre o org do próprio empreendimento — nunca o seletor global (que pode estar
  // em "Todas as Organizações" = string vazia, causando erro de uuid).
  const organizationId = e.organization_id;
  const confirm = useConfirm();
  const [units, setUnits] = React.useState<UnitWithTower[]>([]);
  const [commSnaps, setCommSnaps] = React.useState<Record<string, CommercialSnap>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [syncingAddress, setSyncingAddress] = React.useState(false);
  const [publishingAll, setPublishingAll] = React.useState(false);
  const [regrouping, setRegrouping] = React.useState(false);
  const [orphanIds, setOrphanIds] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const all = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
      setUnits(all);

      const ids = all.map(u => u.rental_property_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data } = await supabase
          .from('commercial_properties')
          .select('id, name, status, price, specs')
          .eq('organization_id', organizationId)
          .in('id', ids);
        const map: Record<string, CommercialSnap> = {};
        (data || []).forEach(p => { map[p.id] = p; });
        setCommSnaps(map);
        // Vínculo aponta para property inexistente ou de outra org → órfão
        setOrphanIds(new Set(ids.filter(id => !map[id])));
      } else {
        setCommSnaps({});
        setOrphanIds(new Set());
      }
    } catch (err) {
      console.error('[EspelhoLocacoes] erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [e.id, organizationId]);

  React.useEffect(() => { load(); }, [load]);

  const handlePublish = async (unit: UnitWithTower) => {
    setBusyId(unit.id);
    try {
      // Revalida no banco antes de criar — o estado local pode estar obsoleto
      // (outra aba/usuário já publicou), o que criaria uma property duplicada.
      const { data: fresh, error: freshErr } = await supabase
        .from('empreendimento_units')
        .select('rental_property_id')
        .eq('id', unit.id)
        .single();
      if (freshErr) throw freshErr;
      if (fresh?.rental_property_id) {
        await load();
        alert(`"${unit.name}" já está publicada em Locações — a lista foi atualizada.`);
        return;
      }

      const buildingId = await empreendimentoService.ensureCommercialRentalBuilding(e, organizationId);
      const prop = await commercialService.saveProperty({
        organization_id: organizationId,
        name: unit.name,
        type: 'APARTMENT',
        purpose: 'RENTAL',
        parent_id: buildingId,
        ...buildCommercialAddressFields(e),
        price: 0, // aluguel mensal é definido no módulo de Locações
        private_area: unit.private_area,
        common_area: unit.common_area,
        total_area: unit.total_area,
        status: mapEmprToRentalStatus(unit.status),
        floor: unit.floor,
        typology: unit.typology || undefined,
        block: unit._tower_name,
        project_id: unit._tower_project_id || undefined,
        position_type: mapPositionToCommercial(unit.position_type),
        view_type: mapViewToCommercial(unit.view_type),
        sun_orientation: mapSunToCommercial(unit.sun_orientation),
        specs: {
          parkingSpaces: unit.parking_spaces,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          ...(unit.floor_tipo ? { floorTipo: unit.floor_tipo } : {}),
        },
      } as any);
      await empreendimentoService.updateUnit(unit.id, { rental_property_id: prop.id });
      await load();
      alert(`✓ "${unit.name}" publicada em Locações com sucesso.`);
    } catch (err: any) {
      alert(`Erro ao publicar unidade: ${err.message}`);
    } finally { setBusyId(null); }
  };

  const handleRegroup = async () => {
    if (!await confirm({
      title: 'Agrupar unidades em Locações?',
      message: 'Todas as unidades publicadas serão reagrupadas sob o edifício de locação do empreendimento.',
      confirmLabel: 'Agrupar',
    })) return;
    setRegrouping(true);
    try {
      const buildingId = await empreendimentoService.ensureCommercialRentalBuilding(e, organizationId);
      const n = await empreendimentoService.regroupRentalUnits(e.id, organizationId, buildingId);
      await load();
      alert(n > 0 ? `✓ ${n} unidade(s) reagrupada(s) sob o edifício.` : 'Todas as unidades já estavam agrupadas.');
    } catch (err: any) {
      alert(`Erro ao reagrupar: ${err.message}`);
    } finally { setRegrouping(false); }
  };

  const handleUnlink = async (unit: UnitWithTower) => {
    if (!await confirm({
      title: `Desvincular "${unit.name}"?`,
      message: 'O vínculo com Locações será removido. O imóvel no módulo de Locações NÃO será excluído.',
      confirmLabel: 'Desvincular',
      variant: 'warning',
    })) return;
    setBusyId(unit.id);
    try {
      await empreendimentoService.updateUnit(unit.id, { rental_property_id: null });
      await load();
    } catch (err: any) {
      alert(`Erro ao desvincular: ${err.message}`);
    } finally { setBusyId(null); }
  };

  const handleClearOrphans = async () => {
    const orphanUnits = units.filter(u => u.rental_property_id && orphanIds.has(u.rental_property_id));
    if (!orphanUnits.length) return;
    if (!await confirm({
      title: 'Limpar vínculos órfãos?',
      message: `${orphanUnits.length} unidade(s) apontam para imóveis que não existem mais em Locações. O vínculo será removido.`,
      confirmLabel: 'Desvincular',
      variant: 'warning',
    })) return;
    setBusyId('__orphans__');
    try {
      await Promise.all(orphanUnits.map(u => empreendimentoService.updateUnit(u.id, { rental_property_id: null })));
      await load();
    } catch (err: any) {
      alert(`Erro ao limpar vínculos órfãos: ${err.message}`);
    } finally { setBusyId(null); }
  };

  const handleSyncAddress = async () => {
    const linked = units.filter(u => u.rental_property_id && commSnaps[u.rental_property_id!]);
    const addressFields = buildCommercialAddressFields(e);
    if (!linked.length && !e.commercial_rental_building_id) { alert('Nenhuma unidade publicada em Locações.'); return; }
    if (!await confirm({
      title: 'Atualizar endereço em Locações?',
      message: `${linked.length} imóvel(eis) + o edifício-pai passarão a usar:\n"${addressFields.address}"`,
      confirmLabel: 'Atualizar',
      variant: 'warning',
    })) return;
    setSyncingAddress(true);
    try {
      const ids = [
        ...(e.commercial_rental_building_id ? [e.commercial_rental_building_id] : []),
        ...linked.map(u => u.rental_property_id!),
      ];
      await supabase.from('commercial_properties').update(addressFields).in('id', ids);
      alert(`✓ Endereço atualizado em ${ids.length} imóvel(eis).`);
    } catch (err: any) {
      alert(`Erro ao atualizar endereço: ${err.message}`);
    } finally { setSyncingAddress(false); }
  };

  const handlePublishAll = async () => {
    const localUnpublished = units.filter(u => !u.rental_property_id);
    if (!localUnpublished.length) { alert('Todas as unidades já estão publicadas em Locações.'); return; }
    if (!await confirm({
      title: 'Publicar em Locações?',
      message: `${localUnpublished.length} unidade(s) serão criadas em Locações, agrupadas sob o edifício do empreendimento. O aluguel mensal é definido depois, no módulo de Locações.`,
      confirmLabel: 'Publicar',
      variant: 'warning',
    })) return;
    setPublishingAll(true);
    try {
      const r = await empreendimentoService.publishAllToRental(e.id, organizationId);
      await load();
      if (!r.published) {
        alert('Todas as unidades já estão publicadas em Locações — a lista foi atualizada.');
        return;
      }
      alert(`✓ ${r.published} unidade${r.published > 1 ? 's' : ''} publicada${r.published > 1 ? 's' : ''} em Locações com sucesso.`);
    } catch (err: any) {
      alert(`Erro ao publicar: ${err.message}`);
    } finally { setPublishingAll(false); }
  };

  // ── Roll-up ───────────────────────────────────────────────────────────────
  const totalUnits = units.length;
  const linkedUnits = units.filter(u => u.rental_property_id && commSnaps[u.rental_property_id!]);
  const linkedCount = linkedUnits.length;
  // Receita mensal potencial: soma dos aluguéis das unidades publicadas (definidos
  // no módulo de Locações; começam em 0 até serem preenchidos lá).
  const monthlyRevenue = linkedUnits.reduce((s, u) => s + (commSnaps[u.rental_property_id!]?.price ?? 0), 0);
  const rentedCount = linkedUnits.filter(u => commSnaps[u.rental_property_id!]?.status === 'RENTED').length;
  const occupancy = linkedCount > 0 ? Math.round((rentedCount / linkedCount) * 100) : 0;

  if (loading) return (
    <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  );

  return (
    <div className="space-y-6">
      {/* Alerta de vínculos órfãos */}
      {orphanIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">
              {orphanIds.size} unidade{orphanIds.size > 1 ? 's' : ''} vinculada{orphanIds.size > 1 ? 's' : ''} a imóve{orphanIds.size > 1 ? 'is' : 'l'} que não existe{orphanIds.size > 1 ? 'm' : ''} mais em Locações.
            </span>
          </div>
          <button
            onClick={handleClearOrphans}
            disabled={busyId === '__orphans__'}
            className="shrink-0 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 flex items-center gap-1.5"
          >
            {busyId === '__orphans__' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
            Limpar vínculos
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Unidades" value={String(totalUnits)} sub={`${linkedCount} em Locações`} />
        <KpiCard label="Publicadas" value={String(linkedCount)} color="text-teal-600" />
        <KpiCard label="Receita Mensal Potencial" value={monthlyRevenue > 0 ? fmt(monthlyRevenue) : '—'} color="text-emerald-600" />
        <KpiCard label="Ocupação" value={`${occupancy}%`} color={occupancy >= 80 ? 'text-emerald-600' : occupancy >= 50 ? 'text-amber-600' : 'text-gray-600'} />
      </div>

      {/* Ações */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider">Inventário de Locação</h3>
            <p className="text-xs text-gray-400 font-medium mt-1">
              O aluguel mensal e a ocupação (Locado) são geridos no módulo de Locações — aqui só publica e acompanha.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleSyncAddress}
              disabled={syncingAddress || linkedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 border border-gray-200"
              title="Propaga o endereço atual do empreendimento para todos os imóveis publicados em Locações"
            >
              {syncingAddress ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync Endereço
            </button>
            <button
              onClick={handleRegroup}
              disabled={regrouping || linkedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 border border-gray-200"
              title="Agrupa as unidades publicadas sob o edifício de locação do empreendimento"
            >
              {regrouping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Building2 className="w-3 h-3" />}
              Reagrupar
            </button>
            <button
              onClick={handlePublishAll}
              disabled={publishingAll || units.filter(u => !u.rental_property_id).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-40"
            >
              {publishingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Publicar Todas
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de unidades */}
      {units.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider bg-gray-50/50">
                <th className="py-3 px-4">Unidade</th>
                <th className="py-3 px-4">Torre</th>
                <th className="py-3 px-4">Pav.</th>
                <th className="py-3 px-4">Área Priv.</th>
                <th className="py-3 px-4">Dormitórios</th>
                <th className="py-3 px-4">Vagas</th>
                <th className="py-3 px-4">Aluguel Mensal</th>
                <th className="py-3 px-4">Status (Locação)</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                const snap = u.rental_property_id ? commSnaps[u.rental_property_id] : null;
                const busy = busyId === u.id;
                const isOrphan = !!u.rental_property_id && !!orphanIds.has(u.rental_property_id);
                return (
                  <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/30 ${isOrphan ? 'bg-rose-50/40' : ''}`}>
                    <td className="py-3 px-4 font-bold text-gray-800">{u.name}</td>
                    <td className="py-3 px-4 text-gray-500">{u._tower_name}</td>
                    <td className="py-3 px-4 text-gray-500">{u.floor ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.bedrooms ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.parking_spaces ?? '—'}</td>
                    <td className="py-3 px-4">
                      <span className="text-gray-700 font-semibold">
                        {snap ? (snap.price > 0 ? fmt(snap.price) : 'A definir') : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {snap ? (
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${COMM_STATUS_STYLE[snap.status] || 'bg-gray-100 text-gray-600'}`}>
                          {COMM_STATUS_LABEL[snap.status] || snap.status}
                        </span>
                      ) : isOrphan ? (
                        <span className="flex items-center gap-1.5 text-rose-600 text-xs font-bold">
                          <AlertCircle className="w-3.5 h-3.5" /> Vínculo quebrado
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">Não publicado</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                        ) : isOrphan ? (
                          <button
                            onClick={() => handleUnlink(u)}
                            className="p-1.5 hover:bg-rose-100 text-rose-500 rounded-lg"
                            title="Remover vínculo quebrado"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        ) : snap ? (
                          <button
                            onClick={() => handleUnlink(u)}
                            className="p-1.5 hover:bg-rose-50 text-rose-400 rounded-lg"
                            title="Desvincular de Locações"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePublish(u)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-lg text-xs font-black uppercase tracking-wider"
                            title="Publicar em Locações"
                          >
                            <Upload className="w-3 h-3" /> Publicar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {units.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <KeyRound className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-xs font-semibold">Nenhuma unidade cadastrada. Adicione torres e unidades primeiro.</p>
        </div>
      )}
    </div>
  );
};

// ── Helpers visuais ──────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color = 'text-gray-800' }) => (
  <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block mb-1">{label}</span>
    <span className={`text-lg font-bold block ${color}`}>{value}</span>
    {sub && <span className="text-xs text-gray-400 font-medium">{sub}</span>}
  </div>
);

export default EspelhoLocacoesTab;
