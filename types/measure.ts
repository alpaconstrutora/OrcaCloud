export interface MeasureProject {
  id: string;
  user_id: string;
  orcamento_id: string | null;
  nome: string;
  status: 'RASCUNHO' | 'CONCLUIDO' | 'ARQUIVADO';
  created_at: string;
  updated_at: string;
}

export type MeasureProjectInsert = Omit<MeasureProject, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type MeasureProjectUpdate = Partial<Omit<MeasureProject, 'id' | 'user_id'>>;

export interface MeasureFile {
  id: string;
  project_id: string;
  nome: string;
  storage_path: string;
  pages_count: number;
  current_page: number;
  scale: number | null; // pixels por metro
  width: number | null;
  height: number | null;
  metadata: Record<string, any>;
  created_at: string;
}

export type MeasureFileInsert = Omit<MeasureFile, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type MeasureFileUpdate = Partial<Omit<MeasureFile, 'id' | 'project_id'>>;

export interface MeasureLayer {
  id: string;
  project_id: string;
  nome: string;
  cor_hex: string;
  is_visible: boolean;
  is_locked: boolean;
  created_at: string;
}

export type MeasureLayerInsert = Omit<MeasureLayer, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type MeasureLayerUpdate = Partial<Omit<MeasureLayer, 'id' | 'project_id'>>;



export interface MeasureLibraryItem {
  id: string;
  project_id: string;
  nome: string;
  categoria: string | null;
  unidade: 'M2' | 'M' | 'UN';
  valor_unitario: number;
  item_referencia_id?: string | null;
  created_at: string;
}

export type MeasureLibraryItemInsert = Omit<MeasureLibraryItem, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type MeasureLibraryItemUpdate = Partial<Omit<MeasureLibraryItem, 'id' | 'project_id'>>;

export interface Point2D {
  x: number;
  y: number;
}

export interface MeasureShape {
  id: string;
  file_id: string;
  layer_id: string;
  item_id: string | null;
  page_number: number;
  nome_ambiente: string | null;
  tipo: 'POLYGON' | 'LINE' | 'POINT';
  pontos: Point2D[];
  valor_calculado: number;
  created_at: string;
}

export type MeasureShapeInsert = Omit<MeasureShape, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type MeasureShapeUpdate = Partial<Omit<MeasureShape, 'id' | 'file_id'>>;
