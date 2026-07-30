// components/empreendimento/EspelhoVendasTab.tsx
// F3: Espelho de Vendas — ponte entre empreendimento_units e commercial_properties.
// Permite publicar unidades no módulo Comercial, desvincular, e sincronizar status
// em ambas as direções. Roll-up de VGV e status por empreendimento.
import React from 'react';
import {
  Loader2, Unlink, RefreshCw, Upload, TrendingUp,
  AlertCircle, ArrowRightLeft, Building2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService, buildCommercialAddressFields } from '../../services/empreendimentoService';
import { commercialService } from '../../services/commercialService';
import { Empreendimento, EmpreendimentoUnit, UnitStatus } from '../../types';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
  UNMAPPABLE_COMMERCIAL_STATUSES, mapCommercialToEmpr, mapEmprToCommercial,
  UNIT_STATUS_LABEL, UNIT_STATUS_STYLE, COMM_STATUS_LABEL, COMM_STATUS_STYLE,
  mapPositionToCommercial, mapViewToCommercial, mapSunToCommercial,
} from '../../utils/empreendimentoComercial';

// §8: as paletas de status são pares `bg-* text-*`; aqui só o token de cor de
// texto interessa — badge é texto colorido simples, sem pílula nem fundo.
const textColor = (style?: string) => style?.split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600';

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
  const confirm = useConfirm();
  const [units, setUnits] = React.useState<UnitWithTower[]>([]);
  const [commSnaps, setCommSnaps] = React.useState<Record<string, CommercialSnap>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [syncingAll, setSyncingAll] = React.useState(false);
  const [syncingAddress, setSyncingAddress] = React.useState(false);
  const [publishingAll, setPublishingAll] = React.useState(false);
  const [regrouping, setRegrouping] = React.useState(false);
  const [orphanIds, setOrphanIds] = React.useState<Set<string>>(new Set());
  // Coluna "Publicar": switch por linha marca a unidade para o lote de publicação.
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  // §13: toast no lugar de alert() nativo
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const all = await empreendimentoService.listAllUnitsForEmpreendimento(e.id);
      setUnits(all);
      // Só faz sentido manter marcada uma unidade que continua existindo e não publicada.
      setSelectedIds(prev => new Set(
        [...prev].filter(id => all.some(u => u.id === id && !u.commercial_property_id)),
      ));

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
        notify(`"${unit.name}" já está publicada no Comercial — a lista foi atualizada.`);
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
      notify(`"${unit.name}" publicada no Comercial com sucesso.`);
    } catch (err: any) {
      notify(`Erro ao publicar unidade: ${err.message}`, 'error');
    } finally { setBusyId(null); }
  };

  // Reagrupa unidades já publicadas que estão soltas (sem parent_id) sob o edifício-pai.
  const handleRegroup = async () => {
    if (!await confirm({
      title: 'Agrupar unidades no Comercial?',
      message: 'Todas as unidades publicadas serão reagrupadas sob o edifício do empreendimento no Comercial.',
      confirmLabel: 'Agrupar',
    })) return;
    setRegrouping(true);
    try {
      const buildingId = await empreendimentoService.ensureCommercialBuilding(e, organizationId);
      const n = await empreendimentoService.regroupCommercialUnits(e.id, organizationId, buildingId);
      await load();
      notify(n > 0 ? `${n} unidade(s) reagrupada(s) sob o edifício.` : 'Todas as unidades já estavam agrupadas no edifício.');
    } catch (err: any) {
      notify(`Erro ao reagrupar: ${err.message}`, 'error');
    } finally { setRegrouping(false); }
  };

  const handleUnlink = async (unit: UnitWithTower) => {
    if (!await confirm({
      title: `Desvincular "${unit.name}"?`,
      message: 'O vínculo com o Comercial será removido. O imóvel no Comercial NÃO será excluído.',
      confirmLabel: 'Desvincular',
      variant: 'warning',
    })) return;
    setBusyId(unit.id);
    try {
      await empreendimentoService.updateUnit(unit.id, { commercial_property_id: null });
      await load();
    } catch (err: any) {
      notify(`Erro ao desvincular: ${err.message}`, 'error');
    } finally { setBusyId(null); }
  };

  // Limpa vínculos órfãos: commercial_property_id aponta para property inexistente
  // (excluída no Comercial) ou de outra organização.
  const handleClearOrphans = async () => {
    const orphanUnits = units.filter(u => u.commercial_property_id && orphanIds.has(u.commercial_property_id));
    if (!orphanUnits.length) return;
    if (!await confirm({
      title: 'Limpar vínculos órfãos?',
      message: `${orphanUnits.length} unidade(s) apontam para imóveis que não existem mais no Comercial. O vínculo será removido.`,
      confirmLabel: 'Desvincular',
      variant: 'warning',
    })) return;
    setBusyId('__orphans__');
    try {
      await Promise.all(orphanUnits.map(u => empreendimentoService.updateUnit(u.id, { commercial_property_id: null })));
      await load();
    } catch (err: any) {
      notify(`Erro ao limpar vínculos órfãos: ${err.message}`, 'error');
    } finally { setBusyId(null); }
  };

  // Sincroniza status: Comercial → Empreendimento. A operação vive no service
  // (empreendimentoService.pullStatusFromCommercial) porque o Centro de Sincronização
  // também a dispara; aqui fica só a confirmação e o aviso.
  const handleSyncFromCommercial = async () => {
    const linked = units.filter(u => u.commercial_property_id && commSnaps[u.commercial_property_id!]);
    if (!linked.length) { notify('Nenhuma unidade vinculada ao Comercial.', 'error'); return; }
    const skipped = linked.filter(u => UNMAPPABLE_COMMERCIAL_STATUSES.has(commSnaps[u.commercial_property_id!].status));
    const syncable = linked.length - skipped.length;
    if (!await confirm({
      title: 'Trazer status do Comercial?',
      message: `O status de venda de ${syncable} unidade(s) será atualizado a partir do Comercial.`
        + (skipped.length ? `\n\n⚠ ${skipped.length} unidade(s) com status Locado/Manutenção não serão alteradas (sem equivalente no Empreendimento).` : ''),
      confirmLabel: 'Trazer',
      variant: 'warning',
    })) return;
    setSyncingAll(true);
    try {
      const r = await empreendimentoService.pullStatusFromCommercial(e.id, organizationId);
      await load();
      if (r.skippedUnmappable) {
        notify(`${r.statusUpdated} unidade(s) sincronizadas. ${r.skippedUnmappable} pulada(s): status Locado ou Manutenção não existe no Empreendimento — ajuste manualmente.`);
      }
    } catch (err: any) {
      notify(`Erro ao sincronizar: ${err.message}`, 'error');
    } finally { setSyncingAll(false); }
  };

  // Propaga endereço atual do empreendimento (campos estruturados, não só a string
  // concatenada) para o edifício-pai + todas as properties vinculadas. Útil quando o
  // endereço do empreendimento muda depois da publicação inicial (normalmente isso já
  // acontece automático via empreendimentoService.update — este botão é o fallback manual).
  const handleSyncAddress = async () => {
    const linked = units.filter(u => u.commercial_property_id && commSnaps[u.commercial_property_id!]);
    const addressFields = buildCommercialAddressFields(e);
    if (!linked.length && !e.commercial_building_id) { notify('Nenhuma unidade publicada no Comercial.', 'error'); return; }
    if (!await confirm({
      title: 'Atualizar endereço no Comercial?',
      message: `${linked.length} imóvel(eis) + o edifício-pai passarão a usar:\n"${addressFields.address}"`,
      confirmLabel: 'Atualizar',
      variant: 'warning',
    })) return;
    setSyncingAddress(true);
    try {
      const ids = [
        ...(e.commercial_building_id ? [e.commercial_building_id] : []),
        ...linked.map(u => u.commercial_property_id!),
      ];
      await supabase.from('commercial_properties').update(addressFields).in('id', ids);
      notify(`Endereço atualizado em ${ids.length} imóvel(eis).`);
    } catch (err: any) {
      notify(`Erro ao atualizar endereço: ${err.message}`, 'error');
    } finally { setSyncingAddress(false); }
  };

  // Publica o lote: se houver unidades marcadas na coluna "Publicar", publica SÓ essas;
  // sem nenhuma marcada, o botão vale para todas as não vinculadas.
  const handlePublishAll = async () => {
    const localUnpublished = units.filter(u => !u.commercial_property_id);
    const scoped = selectedIds.size > 0
      ? localUnpublished.filter(u => selectedIds.has(u.id))
      : localUnpublished;
    if (!scoped.length) { notify('Todas as unidades já estão publicadas no Comercial.'); return; }
    if (!await confirm({
      title: selectedIds.size > 0 ? 'Publicar as unidades marcadas?' : 'Publicar no Comercial?',
      message: `${scoped.length} unidade(s) serão criadas no Comercial (Venda de Ativos), agrupadas sob o edifício do empreendimento.`,
      confirmLabel: 'Publicar',
      variant: 'warning',
    })) return;
    setPublishingAll(true);
    try {
      // A publicação em lote vive no service (revalida no banco antes de criar, para não
      // duplicar properties de unidades já publicadas) — o Centro de Sincronização usa a mesma.
      const r = await empreendimentoService.publishAllToCommercial(
        e.id, organizationId,
        selectedIds.size > 0 ? scoped.map(u => u.id) : undefined,
      );
      await load();
      if (!r.published) {
        notify('Todas as unidades já estão publicadas no Comercial — a lista foi atualizada.');
        return;
      }
      notify(`${r.published} unidade${r.published > 1 ? 's' : ''} publicada${r.published > 1 ? 's' : ''} no Comercial com sucesso.`);
    } catch (err: any) {
      notify(`Erro ao publicar: ${err.message}`, 'error');
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

  // ── Seleção para publicar ─────────────────────────────────────────────────
  // Só unidades ainda não vinculadas podem ser marcadas (as demais já estão no Comercial).
  const publishableIds = units.filter(u => !u.commercial_property_id).map(u => u.id);
  const selectedCount = publishableIds.filter(id => selectedIds.has(id)).length;
  const allPublishableSelected = publishableIds.length > 0 && selectedCount === publishableIds.length;
  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAllPublishable = () => setSelectedIds(allPublishableSelected ? new Set() : new Set(publishableIds));

  if (loading) return (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-2 text-gray-500">Carregando...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Alerta de vínculos órfãos */}
      {orphanIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-[10px] px-4 py-3">
          <div className="flex items-center gap-2 text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">
              {orphanIds.size} unidade{orphanIds.size > 1 ? 's' : ''} vinculada{orphanIds.size > 1 ? 's' : ''} a imóve{orphanIds.size > 1 ? 'is' : 'l'} que não existe{orphanIds.size > 1 ? 'm' : ''} mais no Comercial.
            </span>
          </div>
          <button
            onClick={handleClearOrphans}
            disabled={busyId === '__orphans__'}
            className="shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-rose-600 hover:bg-rose-700 text-white font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
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
      <div className="bg-white p-5 rounded-[10px] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-black text-gray-800 text-sm">Status das unidades</h3>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleSyncAddress}
              disabled={syncingAddress || linkedCount === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
              title="Propaga o endereço atual do empreendimento para todos os imóveis publicados no Comercial"
            >
              {syncingAddress ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
              Sync endereço
            </button>
            <button
              onClick={handleRegroup}
              disabled={regrouping || linkedCount === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
              title="Agrupa as unidades publicadas sob o edifício do empreendimento no Comercial"
            >
              {regrouping ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Building2 className="w-[15px] h-[15px]" />}
              Reagrupar
            </button>
            <button
              onClick={handleSyncFromCommercial}
              disabled={syncingAll || linkedCount === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
            >
              {syncingAll ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ArrowRightLeft className="w-[15px] h-[15px]" />}
              Sync do Comercial
            </button>
            <button
              onClick={handlePublishAll}
              disabled={publishingAll || publishableIds.length === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-blue-600 hover:bg-blue-700 text-white font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
              title={selectedCount > 0
                ? 'Publica apenas as unidades marcadas na coluna "Publicar"'
                : 'Publica todas as unidades ainda não vinculadas ao Comercial'}
            >
              {publishingAll ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Upload className="w-[15px] h-[15px]" />}
              {selectedCount > 0 ? `Publicar marcadas (${selectedCount})` : 'Publicar todas'}
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
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-semibold text-xs bg-gray-50">
                {/* Marca as unidades do lote de publicação — o botão "Publicar marcadas" usa esta seleção */}
                <th className="py-2 px-4 w-28">
                  <label className="flex items-center gap-2 cursor-pointer" title={allPublishableSelected ? 'Desmarcar todas' : 'Marcar todas as não publicadas'}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                      checked={allPublishableSelected}
                      disabled={publishableIds.length === 0}
                      onChange={toggleAllPublishable}
                    />
                    Publicar
                  </label>
                </th>
                <th className="py-2 px-4">Unidade</th>
                <th className="py-2 px-4">Torre</th>
                <th className="py-2 px-4">Pav.</th>
                <th className="py-2 px-4">Área priv.</th>
                <th className="py-2 px-4">Dormitórios</th>
                <th className="py-2 px-4">Vagas</th>
                <th className="py-2 px-4">Banheiros</th>
                <th className="py-2 px-4">Status (Empr.)</th>
                <th className="py-2 px-4">Status (Comercial)</th>
                <th className="py-2 px-4 text-right text-table-header font-semibold text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                const snap = u.commercial_property_id ? commSnaps[u.commercial_property_id] : null;
                const busy = busyId === u.id;
                const isOrphan = !!u.commercial_property_id && !!orphanIds.has(u.commercial_property_id);
                const published = !!snap || isOrphan;
                const mappedStatus = snap ? mapCommercialToEmpr(snap.status) : null;
                const isUnmappable = snap ? UNMAPPABLE_COMMERCIAL_STATUSES.has(snap.status) : false;
                const statusDiverge = snap && !isUnmappable && mappedStatus !== u.status;
                return (
                  <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/30 ${isOrphan ? 'bg-rose-50/40' : ''}`}>
                    <td className="py-2.5 px-4">
                      {/* Switch sempre visível para a coluna não "sumir" quando tudo já está
                          publicado; desabilitado quando não há o que publicar naquela linha. */}
                      <label
                        className={`relative inline-flex items-center ${published ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                        title={published
                          ? (isOrphan ? 'Vínculo quebrado — limpe o vínculo antes de republicar' : `"${u.name}" já está publicada no Comercial`)
                          : `Marcar "${u.name}" para publicar`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={!published && selectedIds.has(u.id)}
                          disabled={published}
                          onChange={() => toggleSelected(u.id)}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-700">{u.name}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u._tower_name}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.floor ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.bedrooms ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.parking_spaces ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.bathrooms ?? '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-sm font-normal ${textColor(UNIT_STATUS_STYLE[u.status])}`}>
                        {UNIT_STATUS_LABEL[u.status]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {snap ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-normal ${textColor(COMM_STATUS_STYLE[snap.status])}`}>
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
                        <span className="flex items-center gap-1.5 text-sm font-normal text-rose-600">
                          <AlertCircle className="w-3.5 h-3.5" /> Vínculo quebrado
                        </span>
                      ) : (
                        <span className="text-sm font-normal text-gray-400">Não publicado</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        ) : snap || isOrphan ? (
                          <ActionIconButton
                            kind="delete"
                            icon={<Unlink className="w-4 h-4" />}
                            title={isOrphan ? 'Remover vínculo quebrado' : 'Desvincular do Comercial'}
                            onClick={() => handleUnlink(u)}
                          />
                        ) : (
                          /* §9: ação dominante da linha = botão de texto, não ícone */
                          <button
                            onClick={() => handlePublish(u)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                            title="Publicar no Comercial"
                          >
                            Publicar
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
        <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
          <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma unidade cadastrada</h3>
          <p className="text-sm text-gray-500">Adicione torres e unidades primeiro.</p>
        </div>
      )}

      {/* §13 Toast */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

// ── Helpers visuais ──────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color = 'text-gray-800' }) => (
  <div className="bg-white p-5 rounded-[10px] border border-gray-100 shadow-sm">
    <span className="text-xs font-semibold text-gray-500 block mb-1">{label}</span>
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
