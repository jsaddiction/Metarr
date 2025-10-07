import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

async function stopServers(target?: 'backend' | 'frontend') {
  const trackingFile = '.dev-shells.json';
  const tracking: ShellTracking = JSON.parse(fs.readFileSync(trackingFile, 'utf-8'));

  if (!target || target === 'backend') {
    if (tracking.backend.nodemonPid) {
      console.log(`Killing backend (nodemon PID: ${tracking.backend.nodemonPid})...`);
      try {
        await execAsync(`taskkill /F /PID ${tracking.backend.nodemonPid} /T`);
        console.log('Backend stopped');
      } catch (error) {
        console.log('Backend already stopped or error:', error);
      }
      tracking.backend.nodemonPid = null;
      tracking.backend.tsNodePid = null;
      tracking.backend.startedAt = null;
    }
  }

  if (!target || target === 'frontend') {
    if (tracking.frontend.vitePid) {
      console.log(`Killing frontend (Vite PID: ${tracking.frontend.vitePid})...`);
      try {
        await execAsync(`taskkill /F /PID ${tracking.frontend.vitePid} /T`);
        console.log('Frontend stopped');
      } catch (error) {
        console.log('Frontend already stopped or error:', error);
      }
      tracking.frontend.vitePid = null;
      tracking.frontend.startedAt = null;
    }
  }

  tracking.lastUpdated = new Date().toISOString();
  fs.writeFileSync(trackingFile, JSON.stringify(tracking, null, 2));
  console.log('Tracking updated');
}

const target = process.argv[2] as 'backend' | 'frontend' | undefined;
stopServers(target).catch(console.error);
