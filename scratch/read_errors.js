import fs from 'fs';
import readline from 'readline';

const logPath = 'C:\\Users\\altai\\.gemini\\antigravity-ide\\brain\\8ec24b3d-ffd4-447f-914d-6cfbfe8f498f\\.system_generated\\logs\\transcript.jsonl';

async function readErrors() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('--- Buscando trecho do transcript próximo ao erro de tela em branco ---');
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      // Focar nos steps entre 300 e 500
      if (obj.step_index >= 300 && obj.step_index <= 500) {
        // Se houver algum erro ou menção a console/erro no browser ou se o MODEL analisou algum log de erro
        if (JSON.stringify(obj).includes('error') || JSON.stringify(obj).includes('exception') || JSON.stringify(obj).includes('blank') || obj.step_index === 379 || obj.step_index === 380) {
          console.log(`Step: ${obj.step_index} | Source: ${obj.source} | Type: ${obj.type}`);
          console.log(`Content snippet: ${obj.content ? obj.content.substring(0, 300) : ''}...`);
          if (obj.tool_calls) {
            console.log(`Tool Calls: ${JSON.stringify(obj.tool_calls)}`);
          }
          console.log('-----------------------------------------');
        }
      }
    } catch (e) {}
  }
}

readErrors();
