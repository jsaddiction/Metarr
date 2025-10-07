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

async function startBackend() {
  const trackingFile = '.dev-shells.json';
  const tracking: ShellTracking = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));

  console.log('Starting backend server...');

  const proc = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    detached: false
  });

  // Wait a moment for nodemon to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get nodemon PID
  const nodemonPid = proc.pid;
  console.log(`Backend started with nodemon PID: ${nodemonPid}`);

  // Update tracking
  tracking.backend.nodemonPid = nodemonPid || null;
  tracking.backend.startedAt = new Date().toISOString();
  tracking.lastUpdated = new Date().toISOString();

  fs.writeFileSync(trackingFile, JSON.stringify(tracking, null, 2));
  console.log('Backend tracking updated');

  // Keep process alive
  proc.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
  });
}

startBackend().catch(console.error);
