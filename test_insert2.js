import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://example.com';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'key';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // we will just insert a terrain into an existing study
  const study_id = '74ea0ae0-374f-4712-9f72-5bf9f14095be';
  const { error } = await supabase.from('plant_terrains').insert({
    study_id: study_id,
    terrain_type: 'Plano',
    area: 1000,
    frontage: 10,
    depth: 100,
    is_corner: false,
    slope_type: 'Plano'
  });
  console.log("Terrain Insert Error:", error);
  
  const { error: e2 } = await supabase.from('plant_urban_rulesets').insert({
    study_id: study_id,
    allowed_use: 'Residencial',
    zone_name: 'ZDD',
    occupancy_rate: 0,
    floor_area_ratio_basic: 0,
    floor_area_ratio_max: 0,
    permeability_rate: 0,
    max_height: 0,
    confidence_level: 'Baixo'
  });
  console.log("Ruleset Insert Error:", e2);

  const { error: e3 } = await supabase.from('plant_briefings').insert({
    study_id: study_id,
    development_type: 'Residencial',
    product_standard: 'Médio',
    main_objective: 'Maximizar VGV',
    has_elevator: 'Sim',
    has_balcony: 'Sim',
    has_suite: 'Sim',
    notes: ''
  });
  console.log("Briefing Insert Error:", e3);
}

test();
