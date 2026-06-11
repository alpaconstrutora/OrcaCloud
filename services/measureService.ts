import { supabase } from '../lib/supabase';
import {
  MeasureProject,
  MeasureProjectInsert,
  MeasureProjectUpdate,
  MeasureFile,
  MeasureFileInsert,
  MeasureFileUpdate,
  MeasureLayer,
  MeasureLayerInsert,
  MeasureLayerUpdate,
  MeasureLibraryItem,
  MeasureLibraryItemInsert,
  MeasureLibraryItemUpdate,
  MeasureShape,
  MeasureShapeInsert,
  MeasureShapeUpdate
} from '../types';

export const measureService = {
  // ==========================================
  // PROJETOS DE MEDIÇÃO
  // ==========================================
  async listProjects(userId: string): Promise<MeasureProject[]> {
    const { data, error } = await supabase
      .from('measure_projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[MeasureService] Erro ao listar projetos:', error);
      throw error;
    }
    return data || [];
  },

  async getProjectById(id: string): Promise<MeasureProject | null> {
    const { data, error } = await supabase
      .from('measure_projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[MeasureService] Erro ao obter projeto por ID:', error);
      throw error;
    }
    return data;
  },

  async createProject(project: MeasureProjectInsert): Promise<MeasureProject> {
    const { data, error } = await supabase
      .from('measure_projects')
      .insert(project)
      .select()
      .single();

    if (error) {
      console.error('[MeasureService] Erro ao criar projeto:', error);
      throw error;
    }

    // Ao criar um projeto de medição, criamos as camadas padrão
    try {
      await this.createDefaultLayers(data.id);
    } catch (layerErr) {
      console.error('[MeasureService] Erro ao criar camadas padrão:', layerErr);
    }

    return data;
  },

  async updateProject(id: string, updates: MeasureProjectUpdate): Promise<MeasureProject> {
    const { data, error } = await supabase
      .from('measure_projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MeasureService] Erro ao atualizar projeto:', error);
      throw error;
    }
    return data;
  },

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabase
      .from('measure_projects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MeasureService] Erro ao deletar projeto:', error);
      throw error;
    }
  },

  // ==========================================
  // ARQUIVOS (PLANTAS)
  // ==========================================
  async listFiles(projectId: string): Promise<MeasureFile[]> {
    const { data, error } = await supabase
      .from('measure_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[MeasureService] Erro ao listar arquivos:', error);
      throw error;
    }
    return data || [];
  },

  async getFileById(id: string): Promise<MeasureFile | null> {
    const { data, error } = await supabase
      .from('measure_files')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[MeasureService] Erro ao obter arquivo por ID:', error);
      throw error;
    }
    return data;
  },

  async addFile(file: MeasureFileInsert): Promise<MeasureFile> {
    const { data, error } = await supabase
      .from('measure_files')
      .insert(file)
      .select()
      .single();

    if (error) {
      console.error('[MeasureService] Erro ao adicionar arquivo:', error);
      throw error;
    }
    return data;
  },

  async updateFile(id: string, updates: MeasureFileUpdate): Promise<MeasureFile> {
    const { data, error } = await supabase
      .from('measure_files')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MeasureService] Erro ao atualizar arquivo:', error);
      throw error;
    }
    return data;
  },

  async deleteFile(id: string): Promise<void> {
    // 1. Obter os dados do arquivo para saber o path de storage
    const file = await this.getFileById(id);
    
    // 2. Deletar registro do banco
    const { error: dbError } = await supabase
      .from('measure_files')
      .delete()
      .eq('id', id);

    if (dbError) {
      console.error('[MeasureService] Erro ao deletar arquivo do banco:', dbError);
      throw dbError;
    }

    // 3. Deletar do storage se existir path
    if (file && file.storage_path) {
      const { error: storageError } = await supabase.storage
        .from('measure-plants')
        .remove([file.storage_path]);
      
      if (storageError) {
        console.warn('[MeasureService] Falha ao deletar arquivo físico do storage:', storageError);
      }
    }
  },

  // ==========================================
  // CAMADAS (LAYERS)
  // ==========================================
  async listLayers(projectId: string): Promise<MeasureLayer[]> {
    const { data, error } = await supabase
      .from('measure_layers')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[MeasureService] Erro ao listar camadas:', error);
      throw error;
    }
    return data || [];
  },

  async createLayer(layer: MeasureLayerInsert): Promise<MeasureLayer> {
    const { data, error } = await supabase
      .from('measure_layers')
      .insert(layer)
      .select()
      .single();

    if (error) {
      console.error('[MeasureService] Erro ao criar camada:', error);
      throw error;
    }
    return data;
  },

  async updateLayer(id: string, updates: MeasureLayerUpdate): Promise<MeasureLayer> {
    const { data, error } = await supabase
      .from('measure_layers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MeasureService] Erro ao atualizar camada:', error);
      throw error;
    }
    return data;
  },

  async deleteLayer(id: string): Promise<void> {
    const { error } = await supabase
      .from('measure_layers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MeasureService] Erro ao deletar camada:', error);
      throw error;
    }
  },

  async createDefaultLayers(projectId: string): Promise<MeasureLayer[]> {
    const defaults = [
      { project_id: projectId, nome: 'Arquitetura', cor_hex: '#3B82F6', is_visible: true, is_locked: false },
      { project_id: projectId, nome: 'Estrutura', cor_hex: '#EF4444', is_visible: true, is_locked: false },
      { project_id: projectId, nome: 'Elétrica', cor_hex: '#F59E0B', is_visible: true, is_locked: false },
      { project_id: projectId, nome: 'Hidráulica', cor_hex: '#10B981', is_visible: true, is_locked: false },
      { project_id: projectId, nome: 'Pintura', cor_hex: '#8B5CF6', is_visible: true, is_locked: false }
    ];

    const { data, error } = await supabase
      .from('measure_layers')
      .insert(defaults)
      .select();

    if (error) {
      console.error('[MeasureService] Erro ao criar camadas padrão:', error);
      throw error;
    }
    return data || [];
  },

  // ==========================================
  // BIBLIOTECA DE ITENS
  // ==========================================
  async listLibraryItems(projectId: string): Promise<MeasureLibraryItem[]> {
    const { data, error } = await supabase
      .from('measure_library_items')
      .select('*')
      .eq('project_id', projectId)
      .order('nome', { ascending: true });

    if (error) {
      console.error('[MeasureService] Erro ao listar itens da biblioteca:', error);
      throw error;
    }
    return data || [];
  },

  async saveLibraryItem(item: MeasureLibraryItemInsert & { id?: string }): Promise<MeasureLibraryItem> {
    if (item.id) {
      const { data, error } = await supabase
        .from('measure_library_items')
        .update({
          nome: item.nome,
          categoria: item.categoria,
          unidade: item.unidade,
          valor_unitario: item.valor_unitario,
          item_referencia_id: item.item_referencia_id
        })
        .eq('id', item.id)
        .select()
        .single();

      if (error) {
        console.error('[MeasureService] Erro ao atualizar item da biblioteca:', error);
        throw error;
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('measure_library_items')
        .insert(item)
        .select()
        .single();

      if (error) {
        console.error('[MeasureService] Erro ao criar item na biblioteca:', error);
        throw error;
      }
      return data;
    }
  },

  async deleteLibraryItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('measure_library_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MeasureService] Erro ao deletar item da biblioteca:', error);
      throw error;
    }
  },

  // ==========================================
  // DESENHOS / FORMAS (SHAPES)
  // ==========================================
  async listShapesByFile(fileId: string): Promise<MeasureShape[]> {
    const { data, error } = await supabase
      .from('measure_shapes')
      .select('*')
      .eq('file_id', fileId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[MeasureService] Erro ao listar formas:', error);
      throw error;
    }
    return data || [];
  },

  async saveShape(shape: MeasureShapeInsert & { id?: string }): Promise<MeasureShape> {
    if (shape.id) {
      const { data, error } = await supabase
        .from('measure_shapes')
        .update({
          layer_id: shape.layer_id,
          item_id: shape.item_id,
          page_number: shape.page_number,
          nome_ambiente: shape.nome_ambiente,
          tipo: shape.tipo,
          pontos: shape.pontos,
          valor_calculado: shape.valor_calculado
        })
        .eq('id', shape.id)
        .select()
        .single();

      if (error) {
        console.error('[MeasureService] Erro ao atualizar forma:', error);
        throw error;
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('measure_shapes')
        .insert(shape)
        .select()
        .single();

      if (error) {
        console.error('[MeasureService] Erro ao criar forma:', error);
        throw error;
      }
      return data;
    }
  },

  async deleteShape(id: string): Promise<void> {
    const { error } = await supabase
      .from('measure_shapes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MeasureService] Erro ao deletar forma:', error);
      throw error;
    }
  },

  // ==========================================
  // UPLOAD DE PLANTA PARA O STORAGE
  // ==========================================
  async uploadPlantFile(file: File, path: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from('measure-plants')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('[MeasureService] Erro ao realizar upload do arquivo de planta:', error);
      throw error;
    }
    return data.path;
  },

  getPlantPublicUrl(path: string): string {
    const { data } = supabase.storage
      .from('measure-plants')
      .getPublicUrl(path);
    return data.publicUrl;
  }
};
