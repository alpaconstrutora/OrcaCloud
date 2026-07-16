// components/empreendimento/EspelhoVendasTab.tsx
// F3: Espelho de Vendas — ponte entre empreendimento_units e commercial_properties.
// Permite publicar unidades no módulo Comercial, desvincular, e sincronizar status
// em ambas as direções. Roll-up de VGV e status por empreendimento.
import React from 'react';
import {
  Loader2, ExternalLink, Unlink, RefreshCw, Upload, TrendingUp,
  CheckCircle2, AlertCircle, Clock, ArrowRightLeft, Building2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService, buildCommercialAddressFields } from '../../services/empreendimentoService';
import { commercialService } from '../../services/commercialService';
import { Empreendimento, EmpreendimentoUnit, UnitStatus } from '../../types';
import Button from '../ui/Button';
import {
  UNMAPPABLE_COMMERCIAL_STATUSES, mapCommercialToEmpr, mapEmprToCommercial,
  UNIT_STATUS_LABEL, UNIT_STATUS_STYLE, COMM_STATUS_LABEL, COMM_STATUS_STYLE,
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

// Mapeamentos de status e rótulos vivem em utils/empreendimentoComercial.ts (fonte única).

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const EspelhoVendasTab: React.FC<Props> = ({ empreendimento: e }) => {
  // Sempre o org do próprio empreendimento — nunca o seletor global (que pode estar
  // em "Todas as Organizações" = string vazia, causando "invalid input syntax for type uuid").
  const organizationId = e.organization_id;
  const [units, setUnits] = React.useState<UnitWithTower[]>([]);
  const [commSnaps, setCommSnaps] = React.useState<Record<string, CommercialSnap>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [syncingAll, setSyncingAll] = React.useState(false);
  const [syncingAddress, setSyncingAddress] = React.useState(false);
  const [publishingAll, setPublishingAll] = React.useState(false);
  const [regrouping, setRegrouping] = React.useState(false);
  const [orphanIds, setOrphanIds] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const all = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
      setUnits(all);

      const ids = all.map(u => u.commercial_property_id).filter(Boolean) as string[];
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
      console.error('[EspelhoVendas] erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [e.id, organizationId]);

  React.useEffect(() => { load(); }, [load]);

  const handlePublish = async (unit: UnitWithTower) => {
    setBusyId(unit.id);
    try {
      // Revalida no banco antes de criar — o estado local (units) pode estar obsoleto
      // (ex.: outra aba/usuário já publicou), o que criaria uma property duplicada.
      const { data: fresh, error: freshErr } = await supabase
        .from('empreendimento_units')
        .select('commercial_property_id')
        .eq('id', unit.id)
        .single();
      if (freshErr) throw freshErr;
      if (fresh?.commercial_property_id) {
        await load();
        alert(`"${unit.name}" já está publicada no Comercial — a lista foi atualizada.`);
        return;
      }

      const buildingId = await empreendimentoService.ensureCommercialBuilding(e, organizationId);
      const prop = await commercialService.saveProperty({
        organization_id: organizationId,
        name: unit.name,
        type: 'APARTMENT',
        purpose: 'SALE',
        parent_id: buildingId,
        ...buildCommercialAddressFields(e),
        price: unit.price ?? 0,
        private_area: unit.private_area,
        common_area: unit.common_area,
        total_area: unit.total_area,
        status: mapEmprToCommercial(unit.status),
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
      await empreendimentoService.updateUnit(unit.id, { commercial_property_id: prop.id });
      await load();
      alert(`✓ "${unit.name}" publicada no Comercial com sucesso.`);
    } catch (err: any) {
      alert(`Erro ao publicar unidade: ${err.message}`);
    } finally { setBusyId(null); }
  };

  // Reagrupa unidades já publicadas que estão soltas (sem parent_id) sob o edifício-pai.
  const handleRegroup = async () => {
    if (!window.confirm('Agrupar todas as unidades publicadas sob o edifício do empreendimento no Comercial?')) return;
    setRegrouping(true);
    try {
      const buildingId = await empreendimentoService.ensureCommercialBuilding(e, organizationId);
      const n = await empreendimentoService.regroupCommercialUnits(e.id, organizationId, buildingId);
      await load();
      alert(n > 0 ? `✓ ${n} unidade(s) reagrupada(s) sob o edifício.` : 'Todas as unidades já estavam agrupadas no edifício.');
    } catch (err: any) {
      alert(`Erro ao reagrupar: ${err.message}`);
    } finally { setRegrouping(false); }
  };

  const handleUnlink = async (unit: UnitWithTower) => {
    if (!window.confirm(`Desvincular "${unit.name}" do Comercial? O imóvel no Comercial não será excluído.`)) return;
    setBusyId(unit.id);
    try {
      await empreendimentoService.updateUnit(unit.id, { commercial_property_id: null });
      await load();
    } catch (err: any) {
      alert(`Erro ao desvincular: ${err.message}`);
    } finally { setBusyId(null); }
  };

  // Limpa vínculos órfãos: commercial_property_id aponta para property inexistente
  // (excluída no Comercial) ou de outra organização.
  const handleClearOrphans = async () => {
    const orphanUnits = units.filter(u => u.commercial_property_id && orphanIds.has(u.commercial_property_id));
    if (!orphanUnits.length) return;
    if (!window.confirm(`${orphanUnits.length} unidade(s) apontam para imóveis que não existem mais no Comercial. Desvincular?`)) return;
    setBusyId('__orphans__');
    try {
      await Promise.all(orphanUnits.map(u => empreendimentoService.updateUnit(u.id, { commercial_property_id: null })));
      await load();
    } catch (err: any) {
      alert(`Erro ao limpar vínculos órfãos: ${err.message}`);
    } finally { setBusyId(null); }
  };

  // Sincroniza status: Comercial → Empreendimento para todas as unidades vinculadas.
  // Pula RENTED/MAINTENANCE: não têm equivalente em UnitStatus — avisa ao final.
  const handleSyncFromCommercial = async () => {
    const linked = units.filter(u => u.commercial_property_id && commSnaps[u.commercial_property_id!]);
    if (!linked.length) { alert('Nenhuma unidade vinculada ao Comercial.'); return; }
    const skipped = linked.filter(u => UNMAPPABLE_COMMERCIAL_STATUSES.has(commSnaps[u.commercial_property_id!].status));
    const syncable = linked.filter(u => !UNMAPPABLE_COMMERCIAL_STATUSES.has(commSnaps[u.commercial_property_id!].status));
    let msg = `Sincronizar status de ${syncable.length} unidade(s) a partir do Comercial?`;
    if (skipped.length) msg += `\n\n⚠ ${skipped.length} unidade(s) com status Locado/Manutenção não serão alteradas (sem equivalente no Empreendimento).`;
    if (!window.confirm(msg)) return;
    setSyncingAll(true);
    try {
      await Promise.all(syncable.map(u => {
        const snap = commSnaps[u.commercial_property_id!];
        const newStatus = mapCommercialToEmpr(snap.status);
        return newStatus && newStatus !== u.status
          ? empreendimentoService.updateUnit(u.id, { status: newStatus })
          : Promise.resolve();
      }));
      await load();
      if (skipped.length) {
        alert(`✓ ${syncable.length} unidade(s) sincronizadas.\n⚠ ${skipped.length} pulada(s): status Locado ou Manutenção não existe no Empreendimento — ajuste manualmente.`);
      }
    } catch (err: any) {
      alert(`Erro ao sincronizar: ${err.message}`);
    } finally { setSyncingAll(false); }
  };

  // Propaga endereço atual do empreendimento (campos estruturados, não só a string
  // concatenada) para o edifício-pai + todas as properties vinculadas. Útil quando o
  // endereço do empreendimento muda depois da publicação inicial (normalmente isso já
  // acontece automático via empreendimentoService.update — este botão é o fallback manual).
  const handleSyncAddress = async () => {
    const linked = units.filter(u => u.commercial_property_id && commSnaps[u.commercial_property_id!]);
    const addressFields = buildCommercialAddressFields(e);
    if (!linked.length && !e.commercial_building_id) { alert('Nenhuma unidade publicada no Comercial.'); return; }
    if (!window.confirm(`Atualizar endereço de ${linked.length} imóvel(eis) + edifício-pai no Comercial para:\n"${addressFields.address}"`)) return;
    setSyncingAddress(true);
    try {
      const ids = [
        ...(e.commercial_building_id ? [e.commercial_building_id] : []),
        ...linked.map(u => u.commercial_property_id!),
      ];
      await supabase.from('commercial_properties').update(addressFields).in('id', ids);
      alert(`✓ Endereço atualizado em ${ids.length} imóvel(eis).`);
    } catch (err: any) {
      alert(`Erro ao atualizar endereço: ${err.message}`);
    } finally { setSyncingAddress(false); }
  };

  // Publica todas as unidades ainda não vinculadas
  const handlePublishAll = async () => {
    const localUnpublished = units.filter(u => !u.commercial_property_id);
    if (!localUnpublished.length) { alert('Todas as unidades já estão publicadas no Comercial.'); return; }
    if (!window.confirm(`Publicar ${localUnpublished.length} unidades no Comercial?`)) return;
    setPublishingAll(true);
    try {
      // Revalida no banco antes de criar — o estado local (units) pode estar obsoleto,
      // o que criaria properties duplicadas para unidades já publicadas.
      const freshUnits = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
      const unpublished = freshUnits.filter(u => !u.commercial_property_id);
      if (!unpublished.length) {
        await load();
        alert('Todas as unidades já estão publicadas no Comercial — a lista foi atualizada.');
        return;
      }

      const buildingId = await empreendimentoService.ensureCommercialBuilding(e, organizationId);
      const addressFields = buildCommercialAddressFields(e);
      for (const unit of unpublished) {
        const prop = await commercialService.saveProperty({
          organization_id: organizationId,
          name: unit.name,
          type: 'APARTMENT',
          purpose: 'SALE',
          parent_id: buildingId,
          ...addressFields,
          price: unit.price ?? 0,
          private_area: unit.private_area,
          common_area: unit.common_area,
          total_area: unit.total_area,
          status: mapEmprToCommercial(unit.status),
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
        await empreendimentoService.updateUnit(unit.id, { commercial_property_id: prop.id });
      }
      await load();
      alert(`✓ ${unpublished.length} unidade${unpublished.length > 1 ? 's' : ''} publicada${unpublished.length > 1 ? 's' : ''} no Comercial com sucesso.`);
    } catch (err: any) {
      alert(`Erro ao publicar: ${err.message}`);
    } finally { setPublishingAll(false); }
  };

  // ── Roll-up ───────────────────────────────────────────────────────────────
  const totalUnits = units.length;
  const byStatus = {
    DISPONIVEL: units.filter(u => u.status === 'DISPONIVEL').length,
    RESERVADO:  units.filter(u => u.status === 'RESERVADO').length,
    VENDIDO:    units.filter(u => u.status === 'VENDIDO').length,
    PERMUTADO:  units.filter(u => u.status === 'PERMUTADO').length,
  };
  const vgvTotal = units.reduce((s, u) => s + (u.price ?? 0), 0);
  const vgvVendido = units.filter(u => u.status === 'VENDIDO' || u.status === 'PERMUTADO')
    .reduce((s, u) => s + (u.price ?? 0), 0);
  const vgvDisponivel = units.filter(u => u.status === 'DISPONIVEL')
    .reduce((s, u) => s + (u.price ?? 0), 0);
  const pctComercializado = totalUnits > 0
    ? Math.round(((byStatus.VENDIDO + byStatus.PERMUTADO + byStatus.RESERVADO) / totalUnits) * 100)
    : 0;
  const linkedCount = units.filter(u => !!u.commercial_property_id).length;

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
              {orphanIds.size} unidade{orphanIds.size > 1 ? 's' : ''} vinculada{orphanIds.size > 1 ? 's' : ''} a imóve{orphanIds.size > 1 ? 'is' : 'l'} que não existe{orphanIds.size > 1 ? 'm' : ''} mais no Comercial.
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
        <KpiCard label="Total Unidades" value={String(totalUnits)} sub={`${linkedCount} no Comercial`} />
        <KpiCard label="VGV Total" value={vgvTotal > 0 ? fmt(vgvTotal) : '—'} color="text-gray-800" />
        <KpiCard label="VGV Comercializado" value={vgvVendido > 0 ? fmt(vgvVendido) : '—'} color="text-blue-600" />
        <KpiCard label="% Comercializado" value={`${pctComercializado}%`} color={pctComercializado >= 80 ? 'text-emerald-600' : pctComercializado >= 50 ? 'text-amber-600' : 'text-gray-600'} />
      </div>

      {/* Barras de status */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider">Status das Unidades</h3>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleSyncAddress}
              disabled={syncingAddress || linkedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 border border-gray-200"
              title="Propaga o endereço atual do empreendimento para todos os imóveis publicados no Comercial"
            >
              {syncingAddress ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync Endereço
            </button>
            <button
              onClick={handleRegroup}
              disabled={regrouping || linkedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 disabled:opacity-40 border border-gray-200"
              title="Agrupa as unidades publicadas sob o edifício do empreendimento no Comercial"
            >
              {regrouping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Building2 className="w-3 h-3" />}
              Reagrupar
            </button>
            <button
              onClick={handleSyncFromCommercial}
              disabled={syncingAll || linkedCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 disabled:opacity-40"
            >
              {syncingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightLeft className="w-3 h-3" />}
              Sync do Comercial
            </button>
            <button
              onClick={handlePublishAll}
              disabled={publishingAll || units.filter(u => !u.commercial_property_id).length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
            >
              {publishingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Publicar Todas
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusPill label="Disponíveis" count={byStatus.DISPONIVEL} total={totalUnits} color="bg-emerald-500" />
          <StatusPill label="Reservadas"  count={byStatus.RESERVADO}  total={totalUnits} color="bg-amber-400" />
          <StatusPill label="Vendidas"    count={byStatus.VENDIDO}    total={totalUnits} color="bg-blue-500" />
          <StatusPill label="Permutadas"  count={byStatus.PERMUTADO}  total={totalUnits} color="bg-violet-500" />
        </div>
        {totalUnits > 0 && (
          <div className="mt-4 flex h-3 rounded-full overflow-hidden gap-0.5">
            {byStatus.DISPONIVEL > 0 && <div style={{ width: `${(byStatus.DISPONIVEL / totalUnits) * 100}%` }} className="bg-emerald-400" />}
            {byStatus.RESERVADO > 0  && <div style={{ width: `${(byStatus.RESERVADO  / totalUnits) * 100}%` }} className="bg-amber-400" />}
            {byStatus.VENDIDO > 0    && <div style={{ width: `${(byStatus.VENDIDO    / totalUnits) * 100}%` }} className="bg-blue-500" />}
            {byStatus.PERMUTADO > 0  && <div style={{ width: `${(byStatus.PERMUTADO  / totalUnits) * 100}%` }} className="bg-violet-500" />}
          </div>
        )}
        <div className="mt-2 flex justify-between text-xs text-gray-400 font-semibold">
          <span>VGV Disponível: {vgvDisponivel > 0 ? fmt(vgvDisponivel) : '—'}</span>
          <span>VGV Vendido+Permutado: {vgvVendido > 0 ? fmt(vgvVendido) : '—'}</span>
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
                <th className="py-3 px-4">Banheiros</th>
                <th className="py-3 px-4">Preço</th>
                <th className="py-3 px-4">Status (Empr.)</th>
                <th className="py-3 px-4">Status (Comercial)</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                const snap = u.commercial_property_id ? commSnaps[u.commercial_property_id] : null;
                const busy = busyId === u.id;
                const isOrphan = !!u.commercial_property_id && !!orphanIds.has(u.commercial_property_id);
                const mappedStatus = snap ? mapCommercialToEmpr(snap.status) : null;
                const isUnmappable = snap ? UNMAPPABLE_COMMERCIAL_STATUSES.has(snap.status) : false;
                const statusDiverge = snap && !isUnmappable && mappedStatus !== u.status;
                const priceDiverge = snap && u.price != null && Math.abs(snap.price - u.price) > 0.01;
                return (
                  <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/30 ${isOrphan ? 'bg-rose-50/40' : ''}`}>
                    <td className="py-3 px-4 font-bold text-gray-800">{u.name}</td>
                    <td className="py-3 px-4 text-gray-500">{u._tower_name}</td>
                    <td className="py-3 px-4 text-gray-500">{u.floor ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.bedrooms ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.parking_spaces ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.bathrooms ?? '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-700 font-semibold">{u.price != null ? fmt(u.price) : '—'}</span>
                        {priceDiverge && (
                          <span title={`Comercial: ${fmt(snap!.price)}`}>
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${UNIT_STATUS_STYLE[u.status]}`}>
                        {UNIT_STATUS_LABEL[u.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {snap ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${COMM_STATUS_STYLE[snap.status] || 'bg-gray-100 text-gray-600'}`}>
                            {COMM_STATUS_LABEL[snap.status] || snap.status}
                          </span>
                          {isUnmappable && (
                            <span title={`"${COMM_STATUS_LABEL[snap.status] || snap.status}" não tem equivalente em Empreendimento — ajuste manualmente`}>
                              <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                            </span>
                          )}
                          {statusDiverge && (
                            <span title="Status diverge do Empreendimento — use 'Sync do Comercial' para atualizar">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          )}
                        </div>
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
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
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
                            title="Desvincular do Comercial"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePublish(u)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-black uppercase tracking-wider"
                            title="Publicar no Comercial"
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
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-gray-200" />
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

const StatusPill: React.FC<{ label: string; count: number; total: number; color: string }> = ({ label, count, total, color }) => (
  <div className="flex items-center gap-2">
    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
    <div>
      <span className="font-bold text-gray-700 text-sm">{count}</span>
      <span className="text-xs text-gray-400 font-semibold ml-1">{label}</span>
      {total > 0 && <span className="text-[9px] text-gray-300 ml-1">({Math.round((count / total) * 100)}%)</span>}
    </div>
  </div>
);

export default EspelhoVendasTab;
