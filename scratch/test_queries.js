import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('--- Testando Query de Invoices (Financeiro) ---');
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id,
        file_name,
        file_path,
        amount,
        status,
        created_at,
        purchase_orders!inner (
          project_id,
          organization_id
        )
      `)
      .limit(1);
    if (error) {
      console.error('Erro na query de invoices:', error);
    } else {
      console.log('Sucesso na query de invoices. Qtd:', data.length, data);
    }
  } catch (err) {
    console.error('Falha crítica na query de invoices:', err);
  }

  console.log('--- Testando Query de Compliance Evidences ---');
  try {
    const { data, error } = await supabase
      .from('compliance_evidences')
      .select(`
        id,
        evidence_url,
        created_at,
        document_ref,
        operator_email,
        sst_checklists_obra!inner (
          project_id,
          org_id
        )
      `)
      .limit(1);
    if (error) {
      console.error('Erro na query de compliance_evidences:', error);
    } else {
      console.log('Sucesso na query de compliance_evidences. Qtd:', data.length, data);
    }
  } catch (err) {
    console.error('Falha crítica na query de compliance_evidences:', err);
  }

  console.log('--- Testando Query de Services Proposals ---');
  try {
    const { data, error } = await supabase
      .from('services_proposals')
      .select(`
        id,
        proposal_number,
        total_value,
        pdf_storage_path,
        created_at,
        services_opportunities!inner (
          organization_id,
          converted_project_id,
          engineering_project_id
        )
      `)
      .limit(1);
    if (error) {
      console.error('Erro na query de services_proposals:', error);
    } else {
      console.log('Sucesso na query de services_proposals. Qtd:', data.length, data);
    }
  } catch (err) {
    console.error('Falha crítica na query de services_proposals:', err);
  }

  console.log('--- Testando Query de Opportunity Documents ---');
  try {
    const { data, error } = await supabase
      .from('opportunity_documents')
      .select(`
        id,
        name,
        description,
        file_path,
        mime_type,
        created_at,
        uploaded_by,
        services_opportunities!inner (
          organization_id,
          converted_project_id,
          engineering_project_id
        )
      `)
      .limit(1);
    if (error) {
      console.error('Erro na query de opportunity_documents:', error);
    } else {
      console.log('Sucesso na query de opportunity_documents. Qtd:', data.length, data);
    }
  } catch (err) {
    console.error('Falha crítica na query de opportunity_documents:', err);
  }
}

test();
