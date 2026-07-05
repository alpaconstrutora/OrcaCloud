import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://example.com';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('plant_studies')
    .select('id, name, created_at, plant_terrains(area), plant_urban_rulesets(floor_area_ratio_max)')
    .order('created_at', { ascending: false })
    .limit(5);
  console.dir(data, { depth: null });
  if (error) console.error(error);
}

test();
