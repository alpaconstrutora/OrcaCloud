// services/assetService.ts

import { supabase } from '../lib/supabase';
import {
  OpuraAsset,
  OpuraAssetInsert,
  OpuraAssetUpdate,
  OpuraAssetMovement,
  OpuraAssetMovementInsert,
  OpuraAssetReservation,
  OpuraAssetReservationInsert,
  OpuraAssetReservationUpdate,
  OpuraAssetMaintenance,
  OpuraAssetMaintenanceInsert,
  OpuraAssetMaintenanceUpdate,
  OpuraAssetDocument,
  OpuraAssetDocumentInsert,
  OpuraAssetDocumentUpdate,
  OpuraAssetDepreciationRateio,
  OpuraAssetBrand
} from '../types';

export const assetService = {
  // ATIVOS
  async list(organizationId?: string): Promise<OpuraAsset[]> {
    let query = supabase.from('opura_assets').select('*').order('created_at', { ascending: false });

    // Regra 1: Se organizationId for undefined, não bloqueamos o retorno de dados
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[AssetService] Error listing assets:', error);
      throw new Error(`Falha ao carregar ativos: ${error.message}`);
    }
    return data || [];
  },

  async getById(id: string): Promise<OpuraAsset | null> {
    const { data, error } = await supabase
      .from('opura_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[AssetService] Error fetching asset by id ${id}:`, error);
      throw new Error(`Falha ao obter ativo: ${error.message}`);
    }
    return data;
  },

  async create(asset: OpuraAssetInsert): Promise<OpuraAsset> {
    const { data, error } = await supabase
      .from('opura_assets')
      .insert(asset)
      .select()
      .single();

    if (error) {
      console.error('[AssetService] Error creating asset:', error);
      throw new Error(`Falha ao cadastrar ativo: ${error.message}`);
    }
    return data;
  },

  async createMany(assets: OpuraAssetInsert[]): Promise<OpuraAsset[]> {
    const { data, error } = await supabase
      .from('opura_assets')
      .insert(assets)
      .select();

    if (error) {
      console.error('[AssetService] Error creating multiple assets:', error);
      throw new Error(`Falha ao cadastrar ativos em lote: ${error.message}`);
    }
    return data || [];
  },

  async update(id: string, updates: OpuraAssetUpdate): Promise<OpuraAsset> {
    const { data, error } = await supabase
      .from('opura_assets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[AssetService] Error updating asset ${id}:`, error);
      throw new Error(`Falha ao atualizar ativo: ${error.message}`);
    }
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_assets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[AssetService] Error deleting asset ${id}:`, error);
      throw new Error(`Falha ao excluir ativo: ${error.message}`);
    }
  },

  // MOVIMENTAÇÕES
  async listMovements(assetId: string): Promise<OpuraAssetMovement[]> {
    const { data, error } = await supabase
      .from('opura_asset_movements')
      .select('*')
      .eq('asset_id', assetId)
      .order('movement_date', { ascending: false });

    if (error) {
      console.error(`[AssetService] Error listing movements for asset ${assetId}:`, error);
      throw new Error(`Falha ao carregar histórico de movimentação: ${error.message}`);
    }
    return data || [];
  },

  async createMovement(movement: OpuraAssetMovementInsert): Promise<OpuraAssetMovement> {
    const { data, error } = await supabase
      .from('opura_asset_movements')
      .insert(movement)
      .select()
      .single();

    if (error) {
      console.error('[AssetService] Error creating asset movement:', error);
      throw new Error(`Falha ao registrar movimentação de ativo: ${error.message}`);
    }

    // Atualiza automaticamente o projeto e status do ativo principal
    try {
      await supabase
        .from('opura_assets')
        .update({
          current_project_id: movement.destination_project_id || null,
          status: movement.destination_project_id ? 'em_uso' : 'disponivel'
        })
        .eq('id', movement.asset_id);
    } catch (updateErr) {
      console.error('[AssetService] Failed to update asset location status:', updateErr);
    }

    return data;
  },

  // RESERVAS
  async listReservations(organizationId?: string): Promise<OpuraAssetReservation[]> {
    let query = supabase.from('opura_asset_reservations').select('*').order('start_date', { ascending: true });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[AssetService] Error listing reservations:', error);
      throw new Error(`Falha ao listar reservas: ${error.message}`);
    }
    return data || [];
  },

  async createReservation(reservation: OpuraAssetReservationInsert): Promise<OpuraAssetReservation> {
    // Validação contra dupla utilização/reserva conflitante no mesmo período
    const { data: conflicts, error: confError } = await supabase
      .from('opura_asset_reservations')
      .select('id')
      .eq('asset_id', reservation.asset_id)
      .eq('status', 'aprovada')
      .or(`start_date.range.[${reservation.start_date},${reservation.end_date}],end_date.range.[${reservation.start_date},${reservation.end_date}]`);

    if (confError) {
      console.error('[AssetService] Error checking reservation conflicts:', confError);
    }

    if (conflicts && conflicts.length > 0) {
      throw new Error('Este ativo já está reservado ou em uso no período selecionado.');
    }

    const { data, error } = await supabase
      .from('opura_asset_reservations')
      .insert(reservation)
      .select()
      .single();

    if (error) {
      console.error('[AssetService] Error creating reservation:', error);
      throw new Error(`Falha ao criar reserva: ${error.message}`);
    }
    return data;
  },

  async updateReservation(id: string, updates: OpuraAssetReservationUpdate): Promise<OpuraAssetReservation> {
    const { data, error } = await supabase
      .from('opura_asset_reservations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[AssetService] Error updating reservation ${id}:`, error);
      throw new Error(`Falha ao atualizar reserva: ${error.message}`);
    }
    return data;
  },

  async startReservation(reservation: OpuraAssetReservation, email: string): Promise<void> {
    // 1. Atualiza a reserva para ativa e define quem aprovou
    const { error: resError } = await supabase
      .from('opura_asset_reservations')
      .update({
        status: 'ativa',
        approved_by_email: email,
        updated_at: new Date().toISOString()
      })
      .eq('id', reservation.id);

    if (resError) {
      console.error(`[AssetService] Error starting reservation ${reservation.id}:`, resError);
      throw new Error(`Falha ao iniciar reserva: ${resError.message}`);
    }

    // 2. Atualiza o status do ativo para em_uso e define a obra atual
    const { error: assetError } = await supabase
      .from('opura_assets')
      .update({
        status: 'em_uso',
        current_project_id: reservation.project_id
      })
      .eq('id', reservation.asset_id);

    if (assetError) {
      console.error(`[AssetService] Error updating asset ${reservation.asset_id} for started reservation:`, assetError);
      // Rollback manual do status da reserva (ou tentar reverter)
      await supabase.from('opura_asset_reservations').update({ status: 'aprovada' }).eq('id', reservation.id);
      throw new Error(`Falha ao atualizar status do ativo: ${assetError.message}`);
    }

    // 3. Cria log histórico de movimentação
    const { error: moveError } = await supabase
      .from('opura_asset_movements')
      .insert({
        organization_id: reservation.organization_id,
        asset_id: reservation.asset_id,
        origin_project_id: null, // Sede
        destination_project_id: reservation.project_id,
        movement_date: new Date().toISOString(),
        notes: `Início de locação interna via reserva #${reservation.id.slice(0, 8)}`
      });

    if (moveError) {
      console.error(`[AssetService] Error creating movement log for started reservation:`, moveError);
      // Apenas avisa, não bloqueia o fluxo principal já que a reserva e o ativo foram ativados
    }
  },

  async finalizeReservation(reservation: OpuraAssetReservation): Promise<void> {
    // 1. Atualiza a reserva para finalizada
    const { error: resError } = await supabase
      .from('opura_asset_reservations')
      .update({
        status: 'finalizada',
        updated_at: new Date().toISOString()
      })
      .eq('id', reservation.id);

    if (resError) {
      console.error(`[AssetService] Error finalizing reservation ${reservation.id}:`, resError);
      throw new Error(`Falha ao finalizar reserva: ${resError.message}`);
    }

    // 2. Atualiza o status do ativo para disponivel na sede
    const { error: assetError } = await supabase
      .from('opura_assets')
      .update({
        status: 'disponivel',
        current_project_id: null
      })
      .eq('id', reservation.asset_id);

    if (assetError) {
      console.error(`[AssetService] Error returning asset ${reservation.asset_id} to headquarters:`, assetError);
      throw new Error(`Falha ao retornar ativo para a sede: ${assetError.message}`);
    }

    // 3. Cria log histórico de movimentação
    const { error: moveError } = await supabase
      .from('opura_asset_movements')
      .insert({
        organization_id: reservation.organization_id,
        asset_id: reservation.asset_id,
        origin_project_id: reservation.project_id,
        destination_project_id: null, // Sede
        movement_date: new Date().toISOString(),
        notes: `Devolução/Término de locação interna via reserva #${reservation.id.slice(0, 8)}`
      });

    if (moveError) {
      console.error(`[AssetService] Error creating return movement log:`, moveError);
    }
  },

  async cancelReservation(reservationId: string): Promise<void> {
    const { error } = await supabase
      .from('opura_asset_reservations')
      .update({
        status: 'cancelada',
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId);

    if (error) {
      console.error(`[AssetService] Error canceling reservation ${reservationId}:`, error);
      throw new Error(`Falha ao cancelar reserva: ${error.message}`);
    }
  },

  // MANUTENÇÕES
  async listMaintenances(organizationId?: string): Promise<OpuraAssetMaintenance[]> {
    let query = supabase.from('opura_asset_maintenances').select('*').order('scheduled_date', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[AssetService] Error listing maintenances:', error);
      throw new Error(`Falha ao listar manutenções: ${error.message}`);
    }
    return data || [];
  },

  async createMaintenance(maintenance: OpuraAssetMaintenanceInsert): Promise<OpuraAssetMaintenance> {
    const { data, error } = await supabase
      .from('opura_asset_maintenances')
      .insert(maintenance)
      .select()
      .single();

    if (error) {
      console.error('[AssetService] Error creating maintenance:', error);
      throw new Error(`Falha ao cadastrar manutenção: ${error.message}`);
    }

    // Se a manutenção entrar direto "em_execucao", altera o status do ativo para "manutencao"
    if (maintenance.status === 'em_execucao') {
      try {
        await supabase
          .from('opura_assets')
          .update({ status: 'manutencao' })
          .eq('id', maintenance.asset_id);
      } catch (err) {
        console.error('[AssetService] Error updating asset status on maintenance create:', err);
      }
    }

    return data;
  },

  async updateMaintenance(id: string, updates: OpuraAssetMaintenanceUpdate): Promise<OpuraAssetMaintenance> {
    const { data, error } = await supabase
      .from('opura_asset_maintenances')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[AssetService] Error updating maintenance ${id}:`, error);
      throw new Error(`Falha ao atualizar manutenção: ${error.message}`);
    }

    // Se mudou para em_execucao, coloca o ativo em manutencao
    if (updates.status === 'em_execucao') {
      try {
        await supabase
          .from('opura_assets')
          .update({ status: 'manutencao' })
          .eq('id', data.asset_id);
      } catch (err) {
        console.error('[AssetService] Error updating asset status to maintenance:', err);
      }
    } 
    // Se foi concluída ou cancelada, e o ativo está no status de manutencao, libera ele
    else if (updates.status === 'concluida' || updates.status === 'cancelada') {
      try {
        const { data: asset } = await supabase
          .from('opura_assets')
          .select('status')
          .eq('id', data.asset_id)
          .single();
        if (asset && asset.status === 'manutencao') {
          await supabase
            .from('opura_assets')
            .update({ status: 'disponivel' })
            .eq('id', data.asset_id);
        }
      } catch (err) {
        console.error('[AssetService] Error releasing asset status after maintenance:', err);
      }
    }

    return data;
  },

  async deleteMaintenance(id: string): Promise<void> {
    const { data: maint } = await supabase
      .from('opura_asset_maintenances')
      .select('asset_id, status')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('opura_asset_maintenances')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[AssetService] Error deleting maintenance ${id}:`, error);
      throw new Error(`Falha ao excluir manutenção: ${error.message}`);
    }

    if (maint && maint.status === 'em_execucao') {
      try {
        const { data: asset } = await supabase
          .from('opura_assets')
          .select('status')
          .eq('id', maint.asset_id)
          .single();
        if (asset && asset.status === 'manutencao') {
          await supabase
            .from('opura_assets')
            .update({ status: 'disponivel' })
            .eq('id', maint.asset_id);
        }
      } catch (err) {
        console.error('[AssetService] Error releasing asset status after deleting maintenance:', err);
      }
    }
  },

  // GESTÃO DOCUMENTAL (SEGUROS / LICENÇAS)
  async listDocuments(assetId: string): Promise<OpuraAssetDocument[]> {
    const { data, error } = await supabase
      .from('opura_asset_documents')
      .select('*')
      .eq('asset_id', assetId)
      .order('expiration_date', { ascending: true, nullsFirst: false });

    if (error) {
      console.error(`[AssetService] Error listing documents for asset ${assetId}:`, error);
      throw new Error(`Falha ao listar documentos: ${error.message}`);
    }
    return data || [];
  },

  async createDocument(doc: OpuraAssetDocumentInsert): Promise<OpuraAssetDocument> {
    const { data, error } = await supabase
      .from('opura_asset_documents')
      .insert(doc)
      .select()
      .single();

    if (error) {
      console.error('[AssetService] Error creating document:', error);
      throw new Error(`Falha ao cadastrar documento: ${error.message}`);
    }
    return data;
  },

  async updateDocument(id: string, updates: OpuraAssetDocumentUpdate): Promise<OpuraAssetDocument> {
    const { data, error } = await supabase
      .from('opura_asset_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[AssetService] Error updating document ${id}:`, error);
      throw new Error(`Falha ao atualizar documento: ${error.message}`);
    }
    return data;
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_asset_documents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[AssetService] Error deleting document ${id}:`, error);
      throw new Error(`Falha ao excluir documento: ${error.message}`);
    }
  },

  // CÁLCULO E RATEIO DE DEPRECIAÇÃO CONTÁBIL POR OBRA
  async calculateDepreciationRateio(
    organizationId: string,
    startDate?: string,
    endDate?: string
  ): Promise<OpuraAssetDepreciationRateio[]> {
    // 1. Carregar ativos
    const { data: assets, error: errAssets } = await supabase
      .from('opura_assets')
      .select('*')
      .eq('organization_id', organizationId);

    if (errAssets) throw new Error(`Falha ao carregar ativos para rateio: ${errAssets.message}`);

    // 2. Carregar projetos
    const { data: projects, error: errProjects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('organization_id', organizationId);

    if (errProjects) throw new Error(`Falha ao carregar projetos para rateio: ${errProjects.message}`);

    // 3. Carregar reservas da organização
    const { data: reservations, error: errRes } = await supabase
      .from('opura_asset_reservations')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['ativa', 'finalizada', 'aprovada']);

    if (errRes) throw new Error(`Falha ao carregar reservas para rateio: ${errRes.message}`);

    // Definir janelas de filtro de data
    const filterStart = startDate ? new Date(startDate) : new Date('2020-01-01');
    const filterEnd = endDate ? new Date(endDate) : new Date();

    // Map para acumular por project_id
    const rateioMap: Record<string, { days: number; cost: number; assetsSet: Set<string> }> = {};

    // Inicializar mapa de projetos
    projects?.forEach(p => {
      rateioMap[p.id] = { days: 0, cost: 0, assetsSet: new Set<string>() };
    });

    reservations?.forEach(res => {
      const asset = assets?.find(a => a.id === res.asset_id);
      if (!asset) return;

      // Calcular depreciação diária do ativo
      const usefulLife = asset.useful_life_months || 60;
      const depreciableValue = asset.purchase_value - (asset.residual_value || 0);
      const monthlyDepr = depreciableValue / usefulLife;
      const dailyDepr = monthlyDepr / 30;

      // Determinar datas reais da reserva
      const resStart = new Date(res.start_date);
      // Se a reserva ainda está ativa, usamos a data atual se for anterior ao encerramento planejado
      let resEnd = new Date(res.end_date);
      if (res.status === 'ativa' && resEnd > new Date()) {
        resEnd = new Date();
      }

      // Interseção entre a reserva e o filtro de datas
      const startLimit = resStart > filterStart ? resStart : filterStart;
      const endLimit = resEnd < filterEnd ? resEnd : filterEnd;

      if (startLimit <= endLimit) {
        const diffTime = Math.abs(endLimit.getTime() - startLimit.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 dia inclusive

        if (diffDays > 0) {
          const allocCost = dailyDepr * diffDays;
          if (rateioMap[res.project_id]) {
            rateioMap[res.project_id].days += diffDays;
            rateioMap[res.project_id].cost += allocCost;
            rateioMap[res.project_id].assetsSet.add(res.asset_id);
          }
        }
      }
    });

    // Converter para array final
    const totalAllocatedCost = Object.values(rateioMap).reduce((acc, curr) => acc + curr.cost, 0);

    const result: OpuraAssetDepreciationRateio[] = projects?.map(p => {
      const stats = rateioMap[p.id];
      const allocated = stats ? stats.cost : 0;
      const pct = totalAllocatedCost > 0 ? (allocated / totalAllocatedCost) * 100 : 0;

      return {
        project_id: p.id,
        project_name: p.name,
        assets_count: stats ? stats.assetsSet.size : 0,
        total_days: stats ? stats.days : 0,
        allocated_cost: Number(allocated.toFixed(2)),
        percentage: Number(pct.toFixed(2))
      };
    }) || [];

    // Ordenar decrescente pelo custo alocado
    return result.sort((a, b) => b.allocated_cost - a.allocated_cost);
  },

  // GESTÃO DE MARCAS (Fase 7)
  async listBrands(orgId: string): Promise<OpuraAssetBrand[]> {
    const { data, error } = await supabase
      .from('opura_asset_brands')
      .select('*')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[AssetService] Error listing brands:', error);
      throw new Error(`Falha ao listar marcas: ${error.message}`);
    }
    return data || [];
  },

  async createBrand(orgId: string, name: string): Promise<OpuraAssetBrand> {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('O nome da marca é obrigatório.');

    const { data: existing, error: errExist } = await supabase
      .from('opura_asset_brands')
      .select('*')
      .eq('organization_id', orgId)
      .ilike('name', cleanName);

    if (errExist) {
      console.error('[AssetService] Error checking existing brand:', errExist);
    }

    if (existing && existing.length > 0) {
      return existing[0];
    }

    const { data, error } = await supabase
      .from('opura_asset_brands')
      .insert({ organization_id: orgId, name: cleanName })
      .select()
      .single();

    if (error) {
      console.error('[AssetService] Error creating brand:', error);
      throw new Error(`Falha ao cadastrar marca: ${error.message}`);
    }
    return data;
  },

  async updateBrand(id: string, name: string): Promise<OpuraAssetBrand> {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('O nome da marca é obrigatório.');

    const { data, error } = await supabase
      .from('opura_asset_brands')
      .update({ name: cleanName, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`[AssetService] Error updating brand ${id}:`, error);
      throw new Error(`Falha ao atualizar marca: ${error.message}`);
    }
    return data;
  },

  async deleteBrand(id: string): Promise<void> {
    const { error } = await supabase
      .from('opura_asset_brands')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[AssetService] Error deleting brand ${id}:`, error);
      throw new Error(`Falha ao excluir marca: ${error.message}`);
    }
  }
};
