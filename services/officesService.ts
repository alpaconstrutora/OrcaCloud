import { supabase } from '../lib/supabase';
import { OfficesLead, OfficesEspecificacao, OfficesTimesheet } from '../types';

export const officesService = {
  // ==========================================
  // LEADS (CRM & BRIEFING)
  // ==========================================
  async listLeads(userId: string): Promise<OfficesLead[]> {
    const { data, error } = await supabase
      .from('offices_leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[officesService] Erro ao listar leads:', error);
      throw new Error(`Erro ao buscar leads: ${error.message}`);
    }
    return data || [];
  },

  async saveLead(lead: Omit<OfficesLead, 'id' | 'created_at'> & { id?: string }): Promise<OfficesLead> {
    const payload = {
      user_id: lead.user_id,
      nome_cliente: lead.nome_cliente,
      contato: lead.contato || null,
      briefing: lead.briefing || null,
      valor_estimado: Number(lead.valor_estimado || 0),
      status: lead.status
    };

    if (lead.id) {
      const { data, error } = await supabase
        .from('offices_leads')
        .update(payload)
        .eq('id', lead.id)
        .select()
        .single();

      if (error) {
        console.error('[officesService] Erro ao atualizar lead:', error);
        throw new Error(`Erro ao salvar lead: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('offices_leads')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[officesService] Erro ao criar lead:', error);
        throw new Error(`Erro ao criar lead: ${error.message}`);
      }
      return data;
    }
  },

  async deleteLead(id: string): Promise<void> {
    const { error } = await supabase
      .from('offices_leads')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[officesService] Erro ao deletar lead:', error);
      throw new Error(`Erro ao excluir lead: ${error.message}`);
    }
  },

  // ==========================================
  // ESPECIFICAÇÕES
  // ==========================================
  async listEspecificacoesByProjeto(projetoId: string): Promise<OfficesEspecificacao[]> {
    const { data, error } = await supabase
      .from('offices_especificacoes')
      .select('*')
      .eq('projeto_id', projetoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[officesService] Erro ao listar especificações:', error);
      throw new Error(`Erro ao buscar especificações: ${error.message}`);
    }
    return data || [];
  },

  async saveEspecificacao(spec: Omit<OfficesEspecificacao, 'id' | 'created_at'> & { id?: string }): Promise<OfficesEspecificacao> {
    const payload = {
      user_id: spec.user_id,
      projeto_id: spec.projeto_id,
      ambiente: spec.ambiente,
      item_nome: spec.item_nome,
      fabricante_fornecedor: spec.fabricante_fornecedor || null,
      quantidade: Number(spec.quantidade || 1),
      preco_unitario: Number(spec.preco_unitario || 0),
      foto_url: spec.foto_url || null,
      status_aprovacao: spec.status_aprovacao,
      comentario_cliente: spec.comentario_cliente || null
    };

    if (spec.id) {
      const { data, error } = await supabase
        .from('offices_especificacoes')
        .update(payload)
        .eq('id', spec.id)
        .select()
        .single();

      if (error) {
        console.error('[officesService] Erro ao atualizar especificação:', error);
        throw new Error(`Erro ao salvar especificação: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('offices_especificacoes')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[officesService] Erro ao criar especificação:', error);
        throw new Error(`Erro ao cadastrar especificação: ${error.message}`);
      }
      return data;
    }
  },

  async deleteEspecificacao(id: string): Promise<void> {
    const { error } = await supabase
      .from('offices_especificacoes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[officesService] Erro ao deletar especificação:', error);
      throw new Error(`Erro ao excluir especificação: ${error.message}`);
    }
  },

  // ==========================================
  // TIMESHEET (LANÇAMENTO DE HORAS)
  // ==========================================
  async listTimesheetByProjeto(projetoId: string): Promise<OfficesTimesheet[]> {
    const { data, error } = await supabase
      .from('offices_timesheet')
      .select('*')
      .eq('projeto_id', projetoId)
      .order('data_lancamento', { ascending: false });

    if (error) {
      console.error('[officesService] Erro ao listar timesheet:', error);
      throw new Error(`Erro ao buscar lançamentos de horas: ${error.message}`);
    }
    return data || [];
  },

  async listTimesheetByUser(userId: string): Promise<(OfficesTimesheet & { projects: { name: string } })[]> {
    const { data, error } = await supabase
      .from('offices_timesheet')
      .select('*, projects!inner(name)')
      .eq('user_id', userId)
      .order('data_lancamento', { ascending: false });

    if (error) {
      console.error('[officesService] Erro ao listar timesheet do usuário:', error);
      throw new Error(`Erro ao buscar horas lançadas: ${error.message}`);
    }
    return (data as any) || [];
  },

  async saveTimesheetEntry(entry: Omit<OfficesTimesheet, 'id' | 'created_at'> & { id?: string }): Promise<OfficesTimesheet> {
    const payload = {
      user_id: entry.user_id,
      projeto_id: entry.projeto_id,
      horas: Number(entry.horas || 0),
      descricao_atividade: entry.descricao_atividade || null,
      data_lancamento: entry.data_lancamento
    };

    if (entry.id) {
      const { data, error } = await supabase
        .from('offices_timesheet')
        .update(payload)
        .eq('id', entry.id)
        .select()
        .single();

      if (error) {
        console.error('[officesService] Erro ao atualizar horas:', error);
        throw new Error(`Erro ao atualizar horas: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('offices_timesheet')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[officesService] Erro ao lançar horas:', error);
        throw new Error(`Erro ao registrar horas: ${error.message}`);
      }
      return data;
    }
  },

  async deleteTimesheetEntry(id: string): Promise<void> {
    const { error } = await supabase
      .from('offices_timesheet')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[officesService] Erro ao excluir horas:', error);
      throw new Error(`Erro ao excluir registro de horas: ${error.message}`);
    }
  },

  async listEspecificacoesPublicas(projetoId: string): Promise<{ items: OfficesEspecificacao[]; projectName: string }> {
    const { data: specData, error: specError } = await supabase
      .from('offices_especificacoes')
      .select('*')
      .eq('projeto_id', projetoId)
      .order('created_at', { ascending: false });

    if (specError) {
      console.error('[officesService] Erro ao listar especificações públicas:', specError);
      throw new Error(`Erro ao buscar especificações: ${specError.message}`);
    }

    const { data: projData, error: projError } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projetoId)
      .maybeSingle();

    if (projError) {
      console.warn('[officesService] Erro ao buscar nome do projeto para visualização pública:', projError);
    }

    return {
      items: specData || [],
      projectName: projData?.name || 'Projeto de Arquitetura'
    };
  },

  async updateStatusAprovacaoPublica(itemId: string, status: 'APROVADO' | 'RECUSADO', comentario?: string): Promise<OfficesEspecificacao> {
    const payload = {
      status_aprovacao: status,
      comentario_cliente: comentario || null
    };

    const { data, error } = await supabase
      .from('offices_especificacoes')
      .update(payload)
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      console.error('[officesService] Erro ao atualizar aprovação pública do item:', error);
      throw new Error(`Erro ao registrar resposta: ${error.message}`);
    }

    return data;
  }
};
