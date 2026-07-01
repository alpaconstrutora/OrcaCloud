import fs from 'fs';
import readline from 'readline';

async function run() {
    const fileStream = fs.createReadStream('C:/Users/altai/.gemini/antigravity-ide/brain/fef25c39-d2ae-4a76-b541-527074237ddb/.system_generated/logs/transcript.jsonl');
    
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    for await (const line of rl) {
        const step = JSON.parse(line);
        if (step.content && step.content.includes('PRD — Prospecto Inteligente')) {
            console.log('ENCONTRADO!');
            fs.writeFileSync('scratch/prd_completo.txt', step.content);
            console.log('Gravado em scratch/prd_completo.txt com sucesso!');
            break;
        }
    }
}

run();
