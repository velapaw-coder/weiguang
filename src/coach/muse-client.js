import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pythonPaths = [`${root}/third_party/nanomuse`, `${root}/third_party`, '/tmp/wg-py'].filter((path) => existsSync(path));

/** Spawn the vendored NanoMuse coach. Used by node tests, not by the browser bundle. */
export function runMuseProcess(request, { timeoutMs = 25000 } = {}) {
  const python = process.env.WEIGUANG_PYTHON || 'python3';
  const child = spawn(python, ['-m', 'weiguang_muse'], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: [...pythonPaths, process.env.PYTHONPATH || ''].filter(Boolean).join(':'),
      PYTHONNOUSERSITE: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('muse_timeout'));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`muse_exit_${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('muse_output'));
      }
    });
  });
  child.stdin.end(JSON.stringify(request));
  return done.finally(() => {
    stderr = '';
  });
}
