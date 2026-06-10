import { supabase } from '../lib/supabase';
import { ReformaProjeto, ReformaDiario, ReformaCronograma } from '../types';

export const reformasService = {
  // ==========================================
  // PROJETOS DE REFORMA
  // ==========================================
  async listProjetos(userId: string): Promise<ReformaProjeto[]> {
    const { data, error } = await supabase
      .from('reformas_projetos')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[reformasService] Erro ao listar projetos:', error);
      throw new Error(`Erro ao buscar reformas: ${error.message}`);
    }
    return data || [];
  },

  async saveProjeto(proj: Omit<ReformaProjeto, 'id' | 'created_at'> & { id?: string }): Promise<ReformaProjeto> {
    const payload = {
      user_id: proj.user_id,
      nome_cliente: proj.nome_cliente,
      endereco: proj.endereco || null,
      data_inicio: proj.data_inicio,
      data_fim: proj.data_fim || null,
      status: proj.status,
      orcamento_total: Number(proj.orcamento_total || 0)
    };

    if (proj.id) {
      const { data, error } = await supabase
        .from('reformas_projetos')
        .update(payload)
        .eq('id', proj.id)
        .select()
        .single();

      if (error) {
        console.error('[reformasService] Erro ao atualizar projeto:', error);
        throw new Error(`Erro ao salvar reforma: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('reformas_projetos')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[reformasService] Erro ao criar projeto:', error);
        throw new Error(`Erro ao cadastrar reforma: ${error.message}`);
      }
      return data;
    }
  },

  async deleteProjeto(id: string): Promise<void> {
    const { error } = await supabase
      .from('reformas_projetos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[reformasService] Erro ao deletar projeto:', error);
      throw new Error(`Erro ao excluir reforma: ${error.message}`);
    }
  },

  // ==========================================
  // DIÁRIOS DE OBRA MULTIMODAL
  // ==========================================
  async listDiariosByReforma(reformaId: string): Promise<ReformaDiario[]> {
    const { data, error } = await supabase
      .from('reformas_diarios')
      .select('*')
      .eq('reforma_id', reformaId)
      .order('data_registro', { ascending: false });

    if (error) {
      console.error('[reformasService] Erro ao listar diários:', error);
      throw new Error(`Erro ao buscar diários: ${error.message}`);
    }
    return data || [];
  },

  async saveDiario(diary: Omit<ReformaDiario, 'id' | 'created_at'> & { id?: string }): Promise<ReformaDiario> {
    const payload = {
      user_id: diary.user_id,
      reforma_id: diary.reforma_id,
      data_registro: diary.data_registro,
      resumo_markdown: diary.resumo_markdown,
      fotos_urls: diary.fotos_urls || [],
      audio_transcrito: diary.audio_transcrito || null,
      clima: diary.clima,
      temperatura: diary.temperatura
    };

    if (diary.id) {
      const { data, error } = await supabase
        .from('reformas_diarios')
        .update(payload)
        .eq('id', diary.id)
        .select()
        .single();

      if (error) {
        console.error('[reformasService] Erro ao atualizar diário:', error);
        throw new Error(`Erro ao salvar diário: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('reformas_diarios')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[reformasService] Erro ao criar diário:', error);
        throw new Error(`Erro ao registrar diário: ${error.message}`);
      }
      return data;
    }
  },

  async deleteDiario(id: string): Promise<void> {
    const { error } = await supabase
      .from('reformas_diarios')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[reformasService] Erro ao deletar diário:', error);
      throw new Error(`Erro ao excluir diário: ${error.message}`);
    }
  },

  // ==========================================
  // CRONOGRAMA DE ATIVIDADES
  // ==========================================
  async listCronogramaByReforma(reformaId: string): Promise<ReformaCronograma[]> {
    const { data, error } = await supabase
      .from('reformas_cronograma')
      .select('*')
      .eq('reforma_id', reformaId)
      .order('data_limite', { ascending: true });

    if (error) {
      console.error('[reformasService] Erro ao listar cronograma:', error);
      throw new Error(`Erro ao buscar etapas: ${error.message}`);
    }
    return data || [];
  },

  async saveCronogramaItem(item: Omit<ReformaCronograma, 'id' | 'created_at'> & { id?: string }): Promise<ReformaCronograma> {
    const payload = {
      user_id: item.user_id,
      reforma_id: item.reforma_id,
      tarefa: item.tarefa,
      responsavel: item.responsavel || null,
      data_limite: item.data_limite || null,
      status: item.status
    };

    if (item.id) {
      const { data, error } = await supabase
        .from('reformas_cronograma')
        .update(payload)
        .eq('id', item.id)
        .select()
        .single();

      if (error) {
        console.error('[reformasService] Erro ao atualizar etapa:', error);
        throw new Error(`Erro ao salvar etapa: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('reformas_cronograma')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[reformasService] Erro ao criar etapa:', error);
        throw new Error(`Erro ao cadastrar etapa: ${error.message}`);
      }
      return data;
    }
  },

  async deleteCronogramaItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('reformas_cronograma')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[reformasService] Erro ao deletar etapa:', error);
      throw new Error(`Erro ao excluir etapa: ${error.message}`);
    }
  }
};
