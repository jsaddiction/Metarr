import fs from 'fs';
import { spawn } from 'child_process';

interface ShellTracking {
  backend: {
    shellId: string | null;
    nodemonPid: number | null;
    tsNodePid: number | null;
    port: number;
    startedAt: string | null;
  };
  frontend: {
    shellId: string | null;
    vitePid: number | null;
    port: number;
    startedAt: string | null;
  };
  lastUpdated: string | null;
}

async function startFrontend() {
  const trackingFile = '.dev-shells.json';
  const tracking: ShellTracking = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));

  console.log('Starting frontend server...');

  const proc = spawn('npm', ['run', 'dev:frontend'], {
    stdio: 'inherit',
    shell: true,
    detached: false
  });

  // Wait a moment for vite to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  const vitePid = proc.pid;
  console.log(`Frontend started with Vite PID: ${vitePid}`);

  // Update tracking
  tracking.frontend.vitePid = vitePid || null;
  tracking.frontend.startedAt = new Date().toISOString();
  tracking.lastUpdated = new Date().toISOString();

  fs.writeFileSync(trackingFile, JSON.stringify(tracking, null, 2));
  console.log('Frontend tracking updated');

  // Keep process alive
  proc.on('exit', (code) => {
    console.log(`Frontend exited with code ${code}`);
  });
}

startFrontend().catch(console.error);
