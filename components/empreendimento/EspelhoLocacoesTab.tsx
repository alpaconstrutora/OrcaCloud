// components/empreendimento/EspelhoLocacoesTab.tsx
// Ponte Empreendimento → Locações — espelho do EspelhoVendasTab, num eixo próprio.
// Publica unidades no módulo de Locações (commercial_properties purpose='RENTAL'),
// vinculadas por `rental_property_id`. O eixo de locação tem colunas PRÓPRIAS na
// unidade — `rental_status` (ocupação) e `rental_price` (aluguel-alvo) — separadas
// de `status`/`price`, que são o eixo de venda. Por isso o pull de Vendas e o de
// Locações nunca se sobrescrevem. Ver migration 20270815000003.
import React from 'react';
import {
  Loader2, Unlink, RefreshCw, Upload, KeyRound,
  AlertCircle, Building2, ArrowRightLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { empreendimentoService, buildCommercialAddressFields } from '../../services/empreendimentoService';
import { commercialService } from '../../services/commercialService';
import { Empreendimento, EmpreendimentoUnit } from '../../types';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import {
  COMM_STATUS_LABEL, COMM_STATUS_STYLE, mapEmprToRentalStatus,
  mapRentalToEmpr, UNMAPPABLE_RENTAL_STATUSES,
  RENTAL_STATUS_LABEL, RENTAL_STATUS_STYLE,
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
  const [syncingAll, setSyncingAll] = React.useState(false);
  const [orphanIds, setOrphanIds] = React.useState<Set<string>>(new Set());
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
        notify(`"${unit.name}" já está publicada em Locações — a lista foi atualizada.`);
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
        price: unit.rental_price ?? 0, // aluguel-alvo (NUNCA `price`, que é o VGV de venda)
        private_area: unit.private_area,
        common_area: unit.common_area,
        total_area: unit.total_area,
        status: mapEmprToRentalStatus(unit.rental_status ?? 'DISPONIVEL'),
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
      notify(`"${unit.name}" publicada em Locações com sucesso.`);
    } catch (err: any) {
      notify(`Erro ao publicar unidade: ${err.message}`, 'error');
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
      notify(n > 0 ? `${n} unidade(s) reagrupada(s) sob o edifício.` : 'Todas as unidades já estavam agrupadas.');
    } catch (err: any) {
      notify(`Erro ao reagrupar: ${err.message}`, 'error');
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
      notify(`Erro ao desvincular: ${err.message}`, 'error');
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
      notify(`Erro ao limpar vínculos órfãos: ${err.message}`, 'error');
    } finally { setBusyId(null); }
  };

  // Locações → Empreendimento: traz a ocupação de volta. A operação vive no service
  // (empreendimentoService.pullStatusFromRental) porque o Centro de Sincronização
  // também a dispara; aqui fica só a confirmação e o aviso.
  const handleSyncFromRental = async () => {
    const linked = units.filter(u => u.rental_property_id && commSnaps[u.rental_property_id!]);
    if (!linked.length) { notify('Nenhuma unidade vinculada a Locações.', 'error'); return; }
    const skipped = linked.filter(u => UNMAPPABLE_RENTAL_STATUSES.has(commSnaps[u.rental_property_id!].status));
    const syncable = linked.length - skipped.length;
    if (!await confirm({
      title: 'Trazer status de Locações?',
      message: `A ocupação de ${syncable} unidade(s) será atualizada a partir do módulo de Locações.`
        + (skipped.length ? `\n\n⚠ ${skipped.length} unidade(s) com status Vendido/Permutado não serão alteradas (sem equivalente no eixo de locação).` : ''),
      confirmLabel: 'Trazer',
      variant: 'warning',
    })) return;
    setSyncingAll(true);
    try {
      const r = await empreendimentoService.pullStatusFromRental(e.id, organizationId);
      await load();
      if (r.skippedUnmappable) {
        notify(`${r.statusUpdated} unidade(s) sincronizadas. ${r.skippedUnmappable} pulada(s): status Vendido ou Permutado não existe no eixo de locação — ajuste manualmente.`);
      }
    } catch (err: any) {
      notify(`Erro ao sincronizar: ${err.message}`, 'error');
    } finally { setSyncingAll(false); }
  };

  const handleSyncAddress = async () => {
    const linked = units.filter(u => u.rental_property_id && commSnaps[u.rental_property_id!]);
    const addressFields = buildCommercialAddressFields(e);
    if (!linked.length && !e.commercial_rental_building_id) { notify('Nenhuma unidade publicada em Locações.', 'error'); return; }
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
      notify(`Endereço atualizado em ${ids.length} imóvel(eis).`);
    } catch (err: any) {
      notify(`Erro ao atualizar endereço: ${err.message}`, 'error');
    } finally { setSyncingAddress(false); }
  };

  const handlePublishAll = async () => {
    const localUnpublished = units.filter(u => !u.rental_property_id);
    if (!localUnpublished.length) { notify('Todas as unidades já estão publicadas em Locações.'); return; }
    if (!await confirm({
      title: 'Publicar em Locações?',
      message: `${localUnpublished.length} unidade(s) serão criadas em Locações, agrupadas sob o edifício do empreendimento, herdando o aluguel-alvo definido aqui (unidades sem aluguel-alvo vão com R$ 0).`,
      confirmLabel: 'Publicar',
      variant: 'warning',
    })) return;
    setPublishingAll(true);
    try {
      const r = await empreendimentoService.publishAllToRental(e.id, organizationId);
      await load();
      if (!r.published) {
        notify('Todas as unidades já estão publicadas em Locações — a lista foi atualizada.');
        return;
      }
      notify(`${r.published} unidade${r.published > 1 ? 's' : ''} publicada${r.published > 1 ? 's' : ''} em Locações com sucesso.`);
    } catch (err: any) {
      notify(`Erro ao publicar: ${err.message}`, 'error');
    } finally { setPublishingAll(false); }
  };

  // ── Roll-up ───────────────────────────────────────────────────────────────
  const totalUnits = units.length;
  const linkedUnits = units.filter(u => u.rental_property_id && commSnaps[u.rental_property_id!]);
  const linkedCount = linkedUnits.length;
  // Receita mensal potencial: soma dos aluguéis das unidades publicadas.
  const monthlyRevenue = linkedUnits.reduce((s, u) => s + (commSnaps[u.rental_property_id!]?.price ?? 0), 0);

  // Distribuição pelo eixo de LOCAÇÃO da unidade (rental_status), não pelo de venda.
  const rs = (u: EmpreendimentoUnit) => u.rental_status ?? 'DISPONIVEL';
  const byRentalStatus = {
    DISPONIVEL: units.filter(u => rs(u) === 'DISPONIVEL').length,
    RESERVADO:  units.filter(u => rs(u) === 'RESERVADO').length,
    LOCADO:     units.filter(u => rs(u) === 'LOCADO').length,
    MANUTENCAO: units.filter(u => rs(u) === 'MANUTENCAO').length,
  };
  // Receita contratada = aluguéis das unidades efetivamente locadas; vaga = o resto.
  const rentContracted = linkedUnits
    .filter(u => rs(u) === 'LOCADO')
    .reduce((s, u) => s + (commSnaps[u.rental_property_id!]?.price ?? 0), 0);
  const rentVacant = monthlyRevenue - rentContracted;

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
              {orphanIds.size} unidade{orphanIds.size > 1 ? 's' : ''} vinculada{orphanIds.size > 1 ? 's' : ''} a imóve{orphanIds.size > 1 ? 'is' : 'l'} que não existe{orphanIds.size > 1 ? 'm' : ''} mais em Locações.
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

      {/* Ações */}
      <div className="bg-white p-5 rounded-[10px] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-gray-800 text-sm">Inventário de locação</h3>
            <p className="text-xs text-gray-400 font-medium mt-1">
              O aluguel-alvo sai daqui ao publicar; a ocupação real volta de Locações pelo botão "Sync de Locações".
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleSyncAddress}
              disabled={syncingAddress || linkedCount === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
              title="Propaga o endereço atual do empreendimento para todos os imóveis publicados em Locações"
            >
              {syncingAddress ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <RefreshCw className="w-[15px] h-[15px]" />}
              Sync endereço
            </button>
            <button
              onClick={handleRegroup}
              disabled={regrouping || linkedCount === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
              title="Agrupa as unidades publicadas sob o edifício de locação do empreendimento"
            >
              {regrouping ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Building2 className="w-[15px] h-[15px]" />}
              Reagrupar
            </button>
            <button
              onClick={handleSyncFromRental}
              disabled={syncingAll || linkedCount === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
              title="Traz a ocupação (Locado/Disponível/Manutenção) do módulo de Locações para o Empreendimento"
            >
              {syncingAll ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <ArrowRightLeft className="w-[15px] h-[15px]" />}
              Sync de Locações
            </button>
            <button
              onClick={handlePublishAll}
              disabled={publishingAll || units.filter(u => !u.rental_property_id).length === 0}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] bg-blue-600 hover:bg-blue-700 text-white font-medium text-[13px] transition-all active:scale-95 disabled:opacity-40"
            >
              {publishingAll ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Upload className="w-[15px] h-[15px]" />}
              Publicar todas
            </button>
          </div>
        </div>

        {/* Distribuição de ocupação (eixo de locação) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <StatusPill label="Disponíveis" count={byRentalStatus.DISPONIVEL} total={totalUnits} color="bg-emerald-500" />
          <StatusPill label="Reservadas"  count={byRentalStatus.RESERVADO}  total={totalUnits} color="bg-amber-400" />
          <StatusPill label="Locadas"     count={byRentalStatus.LOCADO}     total={totalUnits} color="bg-teal-500" />
          <StatusPill label="Manutenção"  count={byRentalStatus.MANUTENCAO} total={totalUnits} color="bg-gray-400" />
        </div>
        {totalUnits > 0 && (
          <div className="mt-4 flex h-3 rounded-full overflow-hidden gap-0.5">
            {byRentalStatus.DISPONIVEL > 0 && <div style={{ width: `${(byRentalStatus.DISPONIVEL / totalUnits) * 100}%` }} className="bg-emerald-400" />}
            {byRentalStatus.RESERVADO > 0  && <div style={{ width: `${(byRentalStatus.RESERVADO  / totalUnits) * 100}%` }} className="bg-amber-400" />}
            {byRentalStatus.LOCADO > 0     && <div style={{ width: `${(byRentalStatus.LOCADO     / totalUnits) * 100}%` }} className="bg-teal-500" />}
            {byRentalStatus.MANUTENCAO > 0 && <div style={{ width: `${(byRentalStatus.MANUTENCAO / totalUnits) * 100}%` }} className="bg-gray-400" />}
          </div>
        )}
        <div className="mt-2 flex justify-between text-xs text-gray-400 font-semibold">
          <span>Receita contratada: {rentContracted > 0 ? fmt(rentContracted) : '—'}</span>
          <span>Potencial vago: {rentVacant > 0 ? fmt(rentVacant) : '—'}</span>
        </div>
      </div>

      {/* Tabela de unidades */}
      {units.length > 0 && (
        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-semibold text-xs bg-gray-50">
                <th className="py-2 px-4">Unidade</th>
                <th className="py-2 px-4">Torre</th>
                <th className="py-2 px-4">Pav.</th>
                <th className="py-2 px-4">Área priv.</th>
                <th className="py-2 px-4">Dormitórios</th>
                <th className="py-2 px-4">Vagas</th>
                <th className="py-2 px-4">Banheiros</th>
                <th className="py-2 px-4">Status (Empr.)</th>
                <th className="py-2 px-4">Status (Locação)</th>
                <th className="py-2 px-4 text-right text-table-header font-semibold text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                const snap = u.rental_property_id ? commSnaps[u.rental_property_id] : null;
                const busy = busyId === u.id;
                const isOrphan = !!u.rental_property_id && !!orphanIds.has(u.rental_property_id);
                const emprRentalStatus = u.rental_status ?? 'DISPONIVEL';
                const mappedStatus = snap ? mapRentalToEmpr(snap.status) : null;
                const isUnmappable = snap ? UNMAPPABLE_RENTAL_STATUSES.has(snap.status) : false;
                const statusDiverge = snap && !isUnmappable && mappedStatus !== emprRentalStatus;
                return (
                  <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/30 ${isOrphan ? 'bg-rose-50/40' : ''}`}>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-700">{u.name}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u._tower_name}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.floor ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.bedrooms ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.parking_spaces ?? '—'}</td>
                    <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.bathrooms ?? '—'}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-sm font-normal ${textColor(RENTAL_STATUS_STYLE[emprRentalStatus])}`}>
                        {RENTAL_STATUS_LABEL[emprRentalStatus]}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {snap ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-normal ${textColor(COMM_STATUS_STYLE[snap.status])}`}>
                            {COMM_STATUS_LABEL[snap.status] || snap.status}
                          </span>
                          {isUnmappable && (
                            <span title={`"${COMM_STATUS_LABEL[snap.status] || snap.status}" não tem equivalente no eixo de locação — ajuste manualmente`}>
                              <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                            </span>
                          )}
                          {statusDiverge && (
                            <span title="Ocupação diverge do Empreendimento — use 'Sync de Locações' para atualizar">
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
                            title={isOrphan ? 'Remover vínculo quebrado' : 'Desvincular de Locações'}
                            onClick={() => handleUnlink(u)}
                          />
                        ) : (
                          /* §9: ação dominante da linha = botão de texto, não ícone */
                          <button
                            onClick={() => handlePublish(u)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium p-1.5 hover:bg-blue-50 rounded-lg transition-all"
                            title="Publicar em Locações"
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
          <KeyRound className="w-12 h-12 text-gray-300 mx-auto mb-4" />
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

export default EspelhoLocacoesTab;
