import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.FORMWORKS_PYTHON || join(root,'model-service/.venv/Scripts/python.exe');
const result = { imageGeneration: false, audioTranscription: false, checkedAt: new Date().toISOString(), details: {} };
for (const [capability, script] of [['imageGeneration','generate.py'],['audioTranscription','transcribe.py']]) {
  try {
    if (!existsSync(python)) throw new Error('Project Python environment has not been installed.');
    const output = execFileSync(python, [join(root,'model-service',script),'--check'], { cwd: join(root,'model-service'), encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 1024 * 1024, env: { ...process.env, TEMP: join(root,'model-service/.tmp'), TMP: join(root,'model-service/.tmp') } });
    result.details[capability] = JSON.parse(output.trim());
    result[capability] = result.details[capability].ready === true;
  } catch (error) { result.details[capability] = { ready: false, reasons: [error.message.slice(0,1000)] }; }
}
writeFileSync(join(root,'model-service/ready.json'), JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
