// Development runner: starts the API server and the Vite dev client together.
import { spawn } from 'node:child_process';

const children = [];
function start(name, command, args, env = {}) {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[dev] ${name} exited with ${code}`);
  });
  children.push(child);
  return child;
}

start('api', process.execPath, ['server/index.js'], { PORT: process.env.PORT || '3000', NODE_ENV: 'development' });
start('client', process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1', '--port', '5173']);

const shutdown = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
