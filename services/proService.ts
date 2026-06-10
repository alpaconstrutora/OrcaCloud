import { supabase } from '../lib/supabase';
import { ProCliente, ProOrcamento, ProServico, ProConfig } from '../types';

export const proService = {
  // ==========================================
  // CLIENTES
  // ==========================================
  async listClientes(userId: string): Promise<ProCliente[]> {
    const { data, error } = await supabase
      .from('pro_clientes')
      .select('*')
      .eq('user_id', userId)
      .order('nome', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getClienteById(id: string): Promise<ProCliente | null> {
    const { data, error } = await supabase
      .from('pro_clientes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async saveCliente(cliente: Omit<ProCliente, 'id' | 'created_at'> & { id?: string }): Promise<ProCliente> {
    if (cliente.id) {
      const { data, error } = await supabase
        .from('pro_clientes')
        .update({
          nome: cliente.nome,
          telefone: cliente.telefone,
          endereco: cliente.endereco,
          observacoes: cliente.observacoes
        })
        .eq('id', cliente.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('pro_clientes')
        .insert({
          user_id: cliente.user_id,
          nome: cliente.nome,
          telefone: cliente.telefone,
          endereco: cliente.endereco,
          observacoes: cliente.observacoes
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  async deleteCliente(id: string): Promise<void> {
    const { error } = await supabase
      .from('pro_clientes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // ==========================================
  // ORÇAMENTOS
  // ==========================================
  async listOrcamentos(userId: string): Promise<(ProOrcamento & { pro_clientes?: { nome: string; telefone: string } })[]> {
    const { data, error } = await supabase
      .from('pro_orcamentos')
      .select('*, pro_clientes(nome, telefone)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getOrcamentoById(id: string): Promise<ProOrcamento | null> {
    const { data, error } = await supabase
      .from('pro_orcamentos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async saveOrcamento(orcamento: Omit<ProOrcamento, 'id' | 'created_at'> & { id?: string }): Promise<ProOrcamento> {
    if (orcamento.id) {
      const { data, error } = await supabase
        .from('pro_orcamentos')
        .update({
          cliente_id: orcamento.cliente_id,
          descricao: orcamento.descricao,
          valor: orcamento.valor,
          fotos: orcamento.fotos,
          observacoes: orcamento.observacoes,
          validade_dias: orcamento.validade_dias,
          garantia_dias: orcamento.garantia_dias,
          status: orcamento.status
        })
        .eq('id', orcamento.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('pro_orcamentos')
        .insert({
          user_id: orcamento.user_id,
          cliente_id: orcamento.cliente_id,
          descricao: orcamento.descricao,
          valor: orcamento.valor,
          fotos: orcamento.fotos,
          observacoes: orcamento.observacoes,
          validade_dias: orcamento.validade_dias,
          garantia_dias: orcamento.garantia_dias,
          status: orcamento.status
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  async deleteOrcamento(id: string): Promise<void> {
    const { error } = await supabase
      .from('pro_orcamentos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // ==========================================
  // SERVIÇOS (ORDEM DE SERVIÇO)
  // ==========================================
  async listServicos(userId: string): Promise<(ProServico & { pro_orcamentos: ProOrcamento & { pro_clientes?: { nome: string; telefone: string; endereco?: string } } })[]> {
    const { data, error } = await supabase
      .from('pro_servicos')
      .select('*, pro_orcamentos!inner(*, pro_clientes(nome, telefone, endereco))')
      .eq('pro_orcamentos.user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as any) || [];
  },

  async getServicoByOrcamentoId(orcamentoId: string): Promise<ProServico | null> {
    const { data, error } = await supabase
      .from('pro_servicos')
      .select('*')
      .eq('orcamento_id', orcamentoId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async saveServico(servico: Omit<ProServico, 'id' | 'created_at'> & { id?: string }): Promise<ProServico> {
    let proximoAgendamento = servico.proximo_agendamento;
    if (servico.status === 'CONCLUIDO' && servico.recorrencia_meses && !proximoAgendamento) {
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + servico.recorrencia_meses);
      proximoAgendamento = nextDate.toISOString();
    }

    if (servico.id) {
      const { data, error } = await supabase
        .from('pro_servicos')
        .update({
          checklist: servico.checklist,
          fotos_antes: servico.fotos_antes,
          fotos_depois: servico.fotos_depois,
          assinatura_nome: servico.assinatura_nome,
          assinatura_data: servico.assinatura_data,
          assinatura_imagem: servico.assinatura_imagem,
          status: servico.status,
          recorrencia_meses: servico.recorrencia_meses || null,
          proximo_agendamento: proximoAgendamento || null
        })
        .eq('id', servico.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('pro_servicos')
        .insert({
          orcamento_id: servico.orcamento_id,
          checklist: servico.checklist,
          fotos_antes: servico.fotos_antes,
          fotos_depois: servico.fotos_depois,
          assinatura_nome: servico.assinatura_nome,
          assinatura_data: servico.assinatura_data,
          assinatura_imagem: servico.assinatura_imagem,
          status: servico.status,
          recorrencia_meses: servico.recorrencia_meses || null,
          proximo_agendamento: proximoAgendamento || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // ==========================================
  // CONFIGURAÇÃO
  // ==========================================
  async getConfig(userId: string): Promise<ProConfig | null> {
    const { data, error } = await supabase
      .from('pro_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async saveConfig(config: ProConfig): Promise<ProConfig> {
    const { data: existing } = await supabase
      .from('pro_config')
      .select('user_id')
      .eq('user_id', config.user_id)
      .maybeSingle();

    const payload = {
      pix_key: config.pix_key,
      pix_key_type: config.pix_key_type,
      template_header: config.template_header,
      template_footer: config.template_footer,
      profissao: config.profissao,
      templates_custom: config.templates_custom || []
    };

    if (existing) {
      const { data, error } = await supabase
        .from('pro_config')
        .update(payload)
        .eq('user_id', config.user_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('pro_config')
        .insert({ user_id: config.user_id, ...payload })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Helper para obter templates padrão por profissão
  getTemplatesPadrao(profissao: string): { titulo: string; descricao: string; valor: number }[] {
    switch (profissao) {
      case 'AR_CONDICIONADO':
        return [
          { titulo: 'Higienização Completa', descricao: 'Limpeza química da evaporadora e condensadora, aplicação de bactericida e testes de pressão e rendimento.', valor: 180 },
          { titulo: 'Instalação Padrão Split (Até 12k BTUs)', descricao: 'Instalação de ar-condicionado Split até 12000 BTUs, inclui suporte de fixação, tubulação de cobre isolada até 3 metros, cabo PP e acabamento com espuma expansiva.', valor: 450 },
          { titulo: 'Carga de Gás R410a / R22', descricao: 'Identificação de vazamento simples, solda (se aplicável), vácuo no sistema e recarga completa de fluido refrigerante.', valor: 250 }
        ];
      case 'ELETRICISTA':
        return [
          { titulo: 'Instalação de Chuveiro Elétrico', descricao: 'Remoção do chuveiro antigo, instalação do novo chuveiro, vedação com fita veda rosca, testes de vazamento e conexões elétricas com conectores apropriados.', valor: 150 },
          { titulo: 'Revisão de Quadro de Distribuição (QDC)', descricao: 'Reaperto de conexões, testes de DR/disjuntores, identificação e identificação de circuitos e balanceamento de fases.', valor: 350 },
          { titulo: 'Instalação de Ponto de Tomada (Novo)', descricao: 'Passagem de cabeamento por eletroduto existente, fixação e conexão de nova tomada 10A ou 20A padrão brasileiro.', valor: 120 }
        ];
      case 'ENCANADOR':
        return [
          { titulo: 'Conserto de Vazamento Simples', descricao: 'Localização e reparo de vazamento em tubulação exposta ou sob pia/lavatório, inclui troca de sifão/vedantes.', valor: 160 },
          { titulo: 'Limpeza de Caixa d\'Água (Até 1000L)', descricao: 'Esvaziamento, escovação das paredes internas, desinfecção com cloro ativo e testes da boia/registro.', valor: 250 },
          { titulo: 'Instalação de Vaso Sanitário com Caixa Acoplada', descricao: 'Instalação de bacia sanitária, fixação no piso, anel de vedação, ligação flexível de água e regulagem da descarga.', valor: 300 }
        ];
      case 'PINTOR':
        return [
          { titulo: 'Pintura de Parede (m²)', descricao: 'Preparação da parede (lixamento simples, limpeza), aplicação de fundo selador e duas demãos de tinta acrílica premium (tinta não inclusa).', valor: 25 },
          { titulo: 'Aplicação de Massa Corrida (m²)', descricao: 'Aplicação de duas demãos de massa corrida, lixamento completo e aplicação de selador para receber pintura.', valor: 35 }
        ];
      default:
        return [
          { titulo: 'Serviço Geral de Manutenção', descricao: 'Prestação de serviço geral de manutenção e reparo sob demanda por hora de trabalho ou tarefa.', valor: 150 }
        ];
    }
  }
};
