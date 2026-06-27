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
  OpuraAssetReservationUpdate
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
  }
};
