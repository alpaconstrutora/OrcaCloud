require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkField() {
  const { data, error } = await supabase
    .from('opura_documents')
    .select('autor')
    .limit(1);

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Field autor exists!');
  }
}
checkField();
