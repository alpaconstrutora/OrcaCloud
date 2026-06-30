// components/empreendimento/EspelhoVendasTab.tsx
// F3: Espelho de Vendas — ponte entre empreendimento_units e commercial_properties.
// Permite publicar unidades no módulo Comercial, desvincular, e sincronizar status
// em ambas as direções. Roll-up de VGV e status por empreendimento.
import React from 'react';
import {
  Loader2, ExternalLink, Unlink, RefreshCw, Upload, TrendingUp,
  CheckCircle2, AlertCircle, Clock, ArrowRightLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService } from '../../services/empreendimentoService';
import { commercialService } from '../../services/commercialService';
import { Empreendimento, EmpreendimentoUnit, UnitStatus } from '../../types';

interface Props {
  empreendimento: Empreendimento;
  organizationId: string;
}

type UnitWithTower = EmpreendimentoUnit & { _tower_name: string; _tower_project_id?: string | null };

interface CommercialSnap {
  id: string;
  status: string;
  price: number;
  name: string;
}

// ── Status mapping ────────────────────────────────────────────────────────────
const mapCommercialToEmpr = (s: string): UnitStatus => {
  switch (s) {
    case 'AVAILABLE':    return 'DISPONIVEL';
    case 'RESERVED':     return 'RESERVADO';
    case 'SOLD':         return 'VENDIDO';
    case 'EXCHANGED':    return 'PERMUTADO';
    default:             return 'DISPONIVEL';
  }
};

const mapEmprToCommercial = (s: UnitStatus): string => {
  switch (s) {
    case 'DISPONIVEL': return 'AVAILABLE';
    case 'RESERVADO':  return 'RESERVED';
    case 'VENDIDO':    return 'SOLD';
    case 'PERMUTADO':  return 'EXCHANGED';
  }
};

const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  DISPONIVEL: 'Disponível', RESERVADO: 'Reservado', VENDIDO: 'Vendido', PERMUTADO: 'Permutado',
};
const UNIT_STATUS_STYLE: Record<UnitStatus, string> = {
  DISPONIVEL: 'bg-emerald-500/10 text-emerald-600',
  RESERVADO:  'bg-amber-500/10 text-amber-600',
  VENDIDO:    'bg-blue-500/10 text-blue-600',
  PERMUTADO:  'bg-violet-500/10 text-violet-600',
};

const COMM_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível', RESERVED: 'Reservado', SOLD: 'Vendido',
  RENTED: 'Locado', EXCHANGED: 'Permutado', MAINTENANCE: 'Manutenção',
};
const COMM_STATUS_STYLE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/10 text-emerald-600',
  RESERVED:  'bg-amber-500/10 text-amber-600',
  SOLD:      'bg-blue-500/10 text-blue-600',
  EXCHANGED: 'bg-violet-500/10 text-violet-600',
  RENTED:    'bg-teal-500/10 text-teal-600',
  MAINTENANCE: 'bg-gray-500/10 text-gray-600',
};

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const EspelhoVendasTab: React.FC<Props> = ({ empreendimento: e, organizationId }) => {
  const [units, setUnits] = React.useState<UnitWithTower[]>([]);
  const [commSnaps, setCommSnaps] = React.useState<Record<string, CommercialSnap>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [syncingAll, setSyncingAll] = React.useState(false);
  const [publishingAll, setPublishingAll] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const all = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
      setUnits(all);

      const ids = all.map(u => u.commercial_property_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data } = await supabase
          .from('commercial_properties')
          .select('id, name, status, price')
          .in('id', ids);
        const map: Record<string, CommercialSnap> = {};
        (data || []).forEach(p => { map[p.id] = p; });
        setCommSnaps(map);
      } else {
        setCommSnaps({});
      }
    } catch (err) {
      console.error('[EspelhoVendas] erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [e.id]);

  React.useEffect(() => { load(); }, [load]);

  // Endereço do empreendimento para preencher a property
  const buildAddress = () => {
    const parts = [e.endereco_street, e.endereco_number, e.endereco_neighborhood, e.endereco_city, e.endereco_state]
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
    return [e.terreno_street, e.terreno_number, e.terreno_city, e.terreno_state].filter(Boolean).join(', ') || e.name;
  };

  const handlePublish = async (unit: UnitWithTower) => {
    setBusyId(unit.id);
    try {
      const prop = await commercialService.saveProperty({
        organization_id: organizationId,
        name: unit.name,
        type: 'APARTMENT',
        purpose: 'SALE',
        address: buildAddress(),
        price: unit.price ?? 0,
        private_area: unit.private_area,
        common_area: unit.common_area,
        total_area: unit.total_area,
        status: mapEmprToCommercial(unit.status),
        floor: unit.floor,
        typology: unit.typology || undefined,
        bedrooms: unit.bedrooms,
        block: unit._tower_name,
        project_id: unit._tower_project_id || undefined,
        specs: { parkingSpaces: unit.parking_spaces },
      } as any);
      await empreendimentoService.updateUnit(unit.id, { commercial_property_id: prop.id });
      await load();
    } catch (err: any) {
      alert(`Erro ao publicar unidade: ${err.message}`);
    } finally { setBusyId(null); }
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

  // Sincroniza status: Comercial → Empreendimento para todas as unidades vinculadas
  const handleSyncFromCommercial = async () => {
    const linked = units.filter(u => u.commercial_property_id && commSnaps[u.commercial_property_id!]);
    if (!linked.length) { alert('Nenhuma unidade vinculada ao Comercial.'); return; }
    if (!window.confirm(`Sincronizar status de ${linked.length} unidades a partir do Comercial?`)) return;
    setSyncingAll(true);
    try {
      await Promise.all(linked.map(u => {
        const snap = commSnaps[u.commercial_property_id!];
        const newStatus = mapCommercialToEmpr(snap.status);
        return newStatus !== u.status
          ? empreendimentoService.updateUnit(u.id, { status: newStatus })
          : Promise.resolve();
      }));
      await load();
    } catch (err: any) {
      alert(`Erro ao sincronizar: ${err.message}`);
    } finally { setSyncingAll(false); }
  };

  // Publica todas as unidades ainda não vinculadas
  const handlePublishAll = async () => {
    const unpublished = units.filter(u => !u.commercial_property_id);
    if (!unpublished.length) { alert('Todas as unidades já estão publicadas no Comercial.'); return; }
    if (!window.confirm(`Publicar ${unpublished.length} unidades no Comercial?`)) return;
    setPublishingAll(true);
    try {
      for (const unit of unpublished) {
        const prop = await commercialService.saveProperty({
          organization_id: organizationId,
          name: unit.name,
          type: 'APARTMENT',
          purpose: 'SALE',
          address: buildAddress(),
          price: unit.price ?? 0,
          private_area: unit.private_area,
          common_area: unit.common_area,
          total_area: unit.total_area,
          status: mapEmprToCommercial(unit.status),
          floor: unit.floor,
          typology: unit.typology || undefined,
          block: unit._tower_name,
          project_id: unit._tower_project_id || undefined,
          specs: { parkingSpaces: unit.parking_spaces },
        } as any);
        await empreendimentoService.updateUnit(unit.id, { commercial_property_id: prop.id });
      }
      await load();
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
          <div className="flex items-center gap-2">
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
                const statusDiverge = snap && mapCommercialToEmpr(snap.status) !== u.status;
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                    <td className="py-3 px-4 font-bold text-gray-800">{u.name}</td>
                    <td className="py-3 px-4 text-gray-500">{u._tower_name}</td>
                    <td className="py-3 px-4 text-gray-500">{u.floor ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-500">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>
                    <td className="py-3 px-4 text-gray-700 font-semibold">
                      {u.price != null ? fmt(u.price) : '—'}
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
                          {statusDiverge && (
                            <span title="Status diverge do Empreendimento"><AlertCircle className="w-3.5 h-3.5 text-amber-500" /></span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">Não publicado</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
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
