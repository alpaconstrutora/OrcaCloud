import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://example.com';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function unlink() {
  const { data, error } = await supabase
    .from('imovib_studies')
    .update({ planta_ai_study_id: null })
    .eq('planta_ai_study_id', 'f79a2547-8a53-4926-8067-6bcdfee8bb5a');
  
  console.log("Unlink:", data, error);
}

unlink();
