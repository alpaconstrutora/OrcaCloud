import { createClient } from '@supabase/supabase-js';


const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://example.com';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'key';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: imovib } = await supabase.from('imovib_studies').select('*').order('created_at', { ascending: false }).limit(1).single();
  console.log("Imovib:", imovib.id, imovib.name);
  
  // try inserting terrain
  const { error } = await supabase.from('plant_terrains').insert({
    study_id: 'f79a2547-8a53-4926-8067-6bcdfee8bb5a',
    terrain_type: 'Plano',
    area: imovib.terreno_area || 0,
    frontage: imovib.terreno_frente || imovib.land_frontage || 0,
    depth: imovib.terreno_fundos || 0,
    is_corner: false,
    slope_type: 'Plano'
  });
  console.log("Terrain Insert Error:", error);
  
  const { error: err2 } = await supabase.from('plant_urban_rulesets').insert({
    study_id: 'f79a2547-8a53-4926-8067-6bcdfee8bb5a',
    allowed_use: imovib.zoning_info || 'Residencial',
    zone_name: imovib.zoning,
    occupancy_rate: imovib.occupancy_rate_max || imovib.occupancy_rate || 0,
    floor_area_ratio_basic: imovib.ca_basic || 0,
    floor_area_ratio_max: imovib.ca_max || 0,
    permeability_rate: 0,
    max_height: 0,
    confidence_level: 'Baixo'
  });
  console.log("Ruleset Insert Error:", err2);
  
  const { error: err3 } = await supabase.from('plant_briefings').insert({
        study_id: 'f79a2547-8a53-4926-8067-6bcdfee8bb5a',
        development_type: imovib.segment || 'Residencial',
        product_standard: imovib.sub_classification || 'Médio',
        main_objective: 'Maximizar VGV',
        has_elevator: 'Sim',
        has_balcony: 'Sim',
        has_suite: 'Sim',
        notes: imovib.committee_notes || ''
  });
  console.log("Briefing Insert Error:", err3);
}

test();
