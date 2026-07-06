import { supabase } from '../lib/supabase';
import {
  ConstructionSocialSecurityRecord,
  ConstructionSocialSecurityDocument,
  ConstructionSocialSecurityCredit,
  ConstructionSocialSecuritySimulation,
  ConstructionSocialSecurityDCTFWeb
} from '../types';

export const socialSecurityService = {
  async getRecordByObraId(obraId: string): Promise<ConstructionSocialSecurityRecord | null> {
    const { data, error } = await supabase
      .from('construction_social_security_records')
      .select('*')
      .eq('obra_id', obraId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching social security record:', error);
      throw error;
    }
    return data;
  },

  async upsertRecord(record: Partial<ConstructionSocialSecurityRecord>): Promise<ConstructionSocialSecurityRecord> {
    const { data, error } = await supabase
      .from('construction_social_security_records')
      .upsert(record)
      .select()
      .single();

    if (error) {
      console.error('Error upserting social security record:', error);
      throw error;
    }
    return data;
  },

  async getDocuments(recordId: string): Promise<ConstructionSocialSecurityDocument[]> {
    const { data, error } = await supabase
      .from('construction_social_security_documents')
      .select('*')
      .eq('record_id', recordId);

    if (error) {
      console.error('Error fetching social security documents:', error);
      throw error;
    }
    return data || [];
  },

  async updateDocument(id: string, updates: Partial<ConstructionSocialSecurityDocument>): Promise<ConstructionSocialSecurityDocument> {
    const { data, error } = await supabase
      .from('construction_social_security_documents')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating social security document:', error);
      throw error;
    }
    return data;
  },

  async insertDocument(document: Partial<ConstructionSocialSecurityDocument>): Promise<ConstructionSocialSecurityDocument> {
    const { data, error } = await supabase
      .from('construction_social_security_documents')
      .insert(document)
      .select()
      .single();

    if (error) {
      console.error('Error inserting social security document:', error);
      throw error;
    }
    return data;
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase.from('construction_social_security_documents').delete().eq('id', id);
    if (error) { console.error('Error deleting document:', error); throw error; }
  },

  async saveSimulation(simulation: Partial<ConstructionSocialSecuritySimulation>): Promise<ConstructionSocialSecuritySimulation> {
    const { data, error } = await supabase
      .from('construction_social_security_simulations')
      .insert(simulation)
      .select()
      .single();

    if (error) {
      console.error('Error saving simulation:', error);
      throw error;
    }
    return data;
  },

  async getSimulations(recordId: string): Promise<ConstructionSocialSecuritySimulation[]> {
    const { data, error } = await supabase
      .from('construction_social_security_simulations')
      .select('*')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching simulations:', error);
      throw error;
    }
    return data || [];
  },

  async getCredits(recordId: string): Promise<ConstructionSocialSecurityCredit[]> {
    const { data, error } = await supabase
      .from('construction_social_security_credits')
      .select('*')
      .eq('record_id', recordId);

    if (error) {
      console.error('Error fetching social security credits:', error);
      throw error;
    }
    return data || [];
  },

  async addCredit(credit: Partial<ConstructionSocialSecurityCredit>): Promise<ConstructionSocialSecurityCredit> {
    const { data, error } = await supabase
      .from('construction_social_security_credits')
      .insert(credit)
      .select()
      .single();

    if (error) {
      console.error('Error adding social security credit:', error);
      throw error;
    }
    return data;
  },

  async getDCTFWebs(recordId: string): Promise<ConstructionSocialSecurityDCTFWeb[]> {
    const { data, error } = await supabase
      .from('construction_social_security_dctfweb')
      .select('*')
      .eq('record_id', recordId);

    if (error) {
      console.error('Error fetching DCTFWebs:', error);
      throw error;
    }
    return data || [];
  }
};
