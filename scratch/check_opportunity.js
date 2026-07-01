import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Carregar variáveis do .env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseAnonKey = envConfig.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log('Buscando oportunidades de investor_opportunities no Supabase remoto...');
    const { data, error } = await supabase
        .from('investor_opportunities')
        .select('*');
        
    if (error) {
        console.error('Erro na consulta:', error);
        return;
    }
    
    console.log(`Sucesso! Encontradas ${data.length} oportunidades.`);
    data.forEach(opp => {
        console.log('----------------------------------------------------');
        console.log(`ID: ${opp.id}`);
        console.log(`Título: ${opp.title}`);
        console.log(`Meta Captação: ${opp.target_funding_value}`);
        console.log(`Já Captado: ${opp.current_funding_value}`);
        console.log(`Estudo IMOVIB ID: ${opp.imovib_study_id}`);
        console.log(`gallery_urls:`, opp.gallery_urls);
        console.log(`distances_json:`, opp.distances_json);
        console.log(`risks_json:`, opp.risks_json);
        console.log(`team_json:`, opp.team_json);
    });
}

run();
