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
  getTemplatesPadrao(profissao: string): { titulo: string; descricao: string; valor: number; unidade?: string; quantidade?: number }[] {
    switch (profissao) {
      case 'PINTOR':
        return [
          { titulo: 'Pintura de Parede Interna (m²)', descricao: 'Preparação da parede (lixamento simples, limpeza), aplicação de selador e duas demãos de tinta acrílica premium (tinta não inclusa).', valor: 25, unidade: 'm²', quantidade: 100 },
          { titulo: 'Aplicação de Massa Corrida (m²)', descricao: 'Lixamento e aplicação de duas demãos de massa corrida em paredes ou tetos, deixando a superfície lisa e selada para a pintura.', valor: 35, unidade: 'm²', quantidade: 100 },
          { titulo: 'Pintura de Portas de Madeira (un)', descricao: 'Lixamento da folha e aduela de porta, aplicação de fundo preparador e duas demãos de esmalte sintético premium ou verniz marinho.', valor: 180, unidade: 'porta', quantidade: 4 },
          { titulo: 'Pintura de Fachada Externa (m²)', descricao: 'Lavagem sob pressão para remoção de resíduos, aplicação de selador acrílico de alta ancoragem e duas demãos de tinta emborrachada contra fissuras.', valor: 50, unidade: 'm²', quantidade: 150 },
          { titulo: 'Aplicação de Textura Projetada (m²)', descricao: 'Aplicação de textura acrílica projetada com compressor profissional, incluindo selador de fundo e acabamento texturizado.', valor: 45, unidade: 'm²', quantidade: 80 }
        ];
      case 'AR_CONDICIONADO':
        return [
          { titulo: 'Higienização Completa de Split', descricao: 'Limpeza química profunda da evaporadora e condensadora, aplicação de bactericida e testes completos de pressão de gás e rendimento térmico.', valor: 180, unidade: 'aparelho', quantidade: 2 },
          { titulo: 'Instalação Padrão Split (Até 12k BTUs)', descricao: 'Instalação física completa, incluindo suporte de fixação externo, tubulação de cobre isolada até 3 metros, fiação elétrica PP e dreno.', valor: 450, unidade: 'instalação', quantidade: 1 },
          { titulo: 'Carga de Fluido Refrigerante R410a / R22', descricao: 'Teste simples de estanqueidade, eliminação de vazamento simples na flange, vácuo completo no sistema e carga de gás por peso (balança).', valor: 250, unidade: 'carga', quantidade: 1 },
          { titulo: 'Infraestrutura para Ar-Condicionado (Ponto)', descricao: 'Corte em alvenaria (não incluso reboco/acabamento), passagem de tubulação de cobre de alta qualidade isolada, cabo de sinal e dreno de PVC.', valor: 350, unidade: 'ponto', quantidade: 3 }
        ];
      case 'ELETRICISTA':
        return [
          { titulo: 'Instalação de Ponto de Tomada / Interruptor', descricao: 'Passagem de cabeamento flexível antichama por eletroduto existente, conexão do módulo de tomada 10A ou 20A e fixação do espelho.', valor: 80, unidade: 'ponto', quantidade: 6 },
          { titulo: 'Instalação de Luminárias / Spots de LED', descricao: 'Recorte no gesso ou fixação em laje, conexão elétrica com conectores Wago isolados e fixação de spots, painéis ou plafons de LED.', valor: 40, unidade: 'luminária', quantidade: 12 },
          { titulo: 'Montagem / Revisão de Quadro Elétrico (QDC)', descricao: 'Organização interna do quadro, distribuição balanceada de fases, instalação de disjuntores, barramento de terra/neutro, IDR e DPS.', valor: 450, unidade: 'quadro', quantidade: 1 },
          { titulo: 'Instalação de Chuveiro Elétrico', descricao: 'Retirada do chuveiro antigo, vedação de rosca, conexão do novo chuveiro com conector cerâmico/blindado de alta segurança e testes de vazão.', valor: 150, unidade: 'chuveiro', quantidade: 2 }
        ];
      case 'ENCANADOR':
        return [
          { titulo: 'Conserto de Vazamento de Descarga / Válvula', descricao: 'Substituição de obturador, boia de entrada, vedação de borracha ou mecanismo completo de caixas acopladas e válvulas tipo Hydra.', valor: 180, unidade: 'reparo', quantidade: 2 },
          { titulo: 'Instalação de Louças Sanitárias (Vaso + Pia)', descricao: 'Fixação física de bacia sanitária e lavatório, anel de vedação, ligação de rabicho flexível, válvula e sifão de saída de esgoto.', valor: 350, unidade: 'conjunto', quantidade: 1 },
          { titulo: 'Limpeza e Desinfecção de Caixa d\'Água (Até 1000L)', descricao: 'Esvaziamento do reservatório, lavagem e escovação manual das paredes internas, desinfecção com cloro e regulagem de registro de boia.', valor: 250, unidade: 'caixa', quantidade: 1 },
          { titulo: 'Instalação / Troca de Registro de Pressão ou Gaveta', descricao: 'Corte da tubulação hidráulica de PVC ou cobre, instalação de novas conexões, soldagem/cola do registro de controle e testes sob pressão.', valor: 220, unidade: 'registro', quantidade: 2 }
        ];
      default:
        return [
          { titulo: 'Serviço Geral de Manutenção', descricao: 'Prestação de serviço geral de manutenção e reparo sob demanda por hora de trabalho ou tarefa.', valor: 150, unidade: 'hora', quantidade: 4 }
        ];
    }
  }
};
