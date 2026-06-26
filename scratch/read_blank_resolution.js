import fs from 'fs';
import readline from 'readline';

const logPath = 'C:\\Users\\altai\\.gemini\\antigravity-ide\\brain\\8ec24b3d-ffd4-447f-914d-6cfbfe8f498f\\.system_generated\\logs\\transcript.jsonl';

async function readBlankResolution() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('--- Analisando resolução da tela em branco (Step 386 em diante) ---');
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.step_index >= 386) {
        // Se o MODEL fez alteração em algum arquivo ou explicou a correção
        if (obj.type === 'REPLACE_FILE_CONTENT' || obj.type === 'WRITE_TO_FILE' || (obj.source === 'MODEL' && obj.type === 'PLANNER_RESPONSE' && (obj.content.includes('branco') || obj.content.includes('blank') || obj.content.includes('offices') || obj.content.includes('router') || obj.content.includes('route')))) {
          console.log(`Step: ${obj.step_index} | Source: ${obj.source} | Type: ${obj.type}`);
          console.log(`Content snippet: ${obj.content ? obj.content.substring(0, 500) : ''}...`);
          if (obj.tool_calls) {
            console.log(`Tool Calls: ${JSON.stringify(obj.tool_calls)}`);
          }
          console.log('-----------------------------------------');
        }
      }
    } catch (e) {}
  }
}

readBlankResolution();
