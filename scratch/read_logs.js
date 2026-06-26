import fs from 'fs';
import path from 'path';
import readline from 'readline';

const logPath = 'C:\\Users\\altai\\.gemini\\antigravity-ide\\brain\\8ec24b3d-ffd4-447f-914d-6cfbfe8f498f\\.system_generated\\logs\\transcript.jsonl';

async function readLogs() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
        console.log(`Step: ${obj.step_index} | Date: ${obj.created_at} | Msg: ${obj.content}`);
      }
    } catch (e) {
      // Ignora linhas malformadas
    }
  }
}

readLogs();
