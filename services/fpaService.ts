import { supabase } from '@/lib/supabase';

export interface FPABudget {
  id: string;
  empresa_id: string | null;
  project_id: string | null;
  cost_center_id: string | null;
  name: string;
  type: string;
  year: number;
  status: string;
  version: number;
  parent_budget_id?: string | null;
  scenario_type?: string | null;
}

export interface FPABudgetVsActualRow {
  budget_id: string;
  empresa_id: string | null;
  project_id: string | null;
  cost_center_id: string | null;
  budget_name: string;
  year: number;
  month: number;
  category_name: string;
  dre_group: string;
  planned_amount: number;
  actual_amount: number;
  variance_amount: number;
  variance_percent: number;
}

export const fpaService = {
  /**
   * Fetches the budget vs actual aggregated view
   */
  async getBudgetVsActual(year: number, empresaId?: string, projectId?: string): Promise<FPABudgetVsActualRow[]> {
    let query = supabase
      .from('vw_fpa_budget_vs_actual')
      .select('*')
      .eq('year', year);

    if (empresaId) {
      query = query.eq('empresa_id', empresaId);
    }
    
    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching budget vs actual:', error);
      throw error;
    }

    return data as FPABudgetVsActualRow[];
  },

  /**
   * Fetches all budgets
   */
  async getBudgets(year?: number): Promise<FPABudget[]> {
    let query = supabase
      .from('fpa_budgets')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (year) {
       query = query.eq('year', year);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching budgets:', error);
      throw error;
    }

    return data as FPABudget[];
  },

  /**
   * Creates a new budget header
   */
  async createBudget(budget: Omit<FPABudget, 'id' | 'version' | 'status'>): Promise<FPABudget> {
    const { data, error } = await supabase
      .from('fpa_budgets')
      .insert([budget])
      .select()
      .single();

    if (error) {
      console.error('Error creating budget:', error);
      throw error;
    }

    return data as FPABudget;
  },

  /**
   * Fetches the cashflow projection from the database view
   */
  async getCashflowProjection(organizationId?: string): Promise<any[]> {
    let query = supabase
      .from('vw_fpa_cashflow_projection')
      .select('*')
      .order('event_date', { ascending: true });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching cashflow projection:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Duplicates an existing budget applying a scenario adjustment factor
   */
  async duplicateBudget(
    budgetId: string,
    newName: string,
    scenarioType: 'OPTIMISTIC' | 'PESSIMISTIC' | 'CUSTOM',
    adjustmentPercent: number
  ): Promise<string> {
    const { data, error } = await supabase.rpc('fpa_duplicate_budget_with_adjustment', {
      p_budget_id: budgetId,
      p_new_name: newName,
      p_scenario_type: scenarioType,
      p_adjustment_percent: adjustmentPercent
    });

    if (error) {
      console.error('Error duplicating budget:', error);
      throw error;
    }

    return data;
  }
};


