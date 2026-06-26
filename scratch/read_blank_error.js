import fs from 'fs';
import readline from 'readline';

const logPath = 'C:\\Users\\altai\\.gemini\\antigravity-ide\\brain\\8ec24b3d-ffd4-447f-914d-6cfbfe8f498f\\.system_generated\\logs\\transcript.jsonl';

async function readBlankScreenError() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('--- Analisando o problema de tela em branco (Step 350-385) ---');
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.step_index >= 345 && obj.step_index <= 385) {
        console.log(`Step: ${obj.step_index} | Source: ${obj.source} | Type: ${obj.type}`);
        if (obj.content) {
          console.log(`Content:\n${obj.content.substring(0, 1000)}`);
        }
        if (obj.tool_calls) {
          console.log(`Tool Calls: ${JSON.stringify(obj.tool_calls)}`);
        }
        console.log('===================================================');
      }
    } catch (e) {}
  }
}

readBlankScreenError();
