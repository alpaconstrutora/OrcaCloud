const dotenv = require('dotenv');
dotenv.config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: versions } = await supabase.from('opura_electrical_versions').select('id, organization_id').limit(1);
  if (!versions || versions.length === 0) {
      console.log('No versions');
      return;
  }
  const versionId = versions[0].id;
  const orgId = versions[0].organization_id;

  console.log('Testing insert with org:', orgId, 'version:', versionId);

  const { data, error } = await supabase.from('opura_electrical_plans').insert({
    organization_id: orgId,
    version_id: versionId,
    file_url: null,
    floor_name: 'test',
    scale_factor: 100
  });

  if (error) {
    console.error('ERROR from Supabase:', JSON.stringify(error, null, 2));
  } else {
    console.log('SUCCESS:', data);
  }
}

run();
