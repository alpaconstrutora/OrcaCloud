import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve('.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('opura_documents')
    .select('*, active_version:opura_document_versions!fk_active_version(*)')
    .ilike('nome', '%032-ARQ-001%');
  console.log('DOC INFO:', JSON.stringify(data, null, 2));
}
run();
