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
  console.log('--- Testando Query de Opportunity Documents com investor_opportunities ---');
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
        investor_opportunities!inner (
          organization_id,
          project_id
        )
      `)
      .eq('investor_opportunities.organization_id', '926cf626-ba49-4ee4-9f35-472822fb90e6')
      .limit(5);

    if (error) {
      console.error('Erro na query corrigida de opportunity_documents:', error);
    } else {
      console.log('Sucesso na query de opportunity_documents. Qtd:', data.length, data);
    }
  } catch (err) {
    console.error('Falha crítica na query de opportunity_documents:', err);
  }

  console.log('--- Testando Query de Risk Assessments (SST) ---');
  try {
    const { data, error } = await supabase
      .from('risk_assessments')
      .select(`
        id,
        titulo,
        tipo,
        status,
        data_avaliacao,
        documento_url,
        created_at,
        org_id,
        project_id
      `)
      .eq('org_id', '926cf626-ba49-4ee4-9f35-472822fb90e6')
      .limit(5);

    if (error) {
      console.error('Erro na query de risk_assessments:', error);
    } else {
      console.log('Sucesso na query de risk_assessments. Qtd:', data.length, data);
    }
  } catch (err) {
    console.error('Falha crítica na query de risk_assessments:', err);
  }
}

test();
