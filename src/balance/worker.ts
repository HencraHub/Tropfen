import { parentPort, workerData } from 'node:worker_threads';
import { runGame, strategyById, makeCoordinatedPair, makeUncoordinatedPair, type RunResult } from '../bots/index';

export interface Job { id: number; landscape: string; rock: string; seed: string; bot: string }
export interface JobResult { id: number; result: RunResult }

function runJob(job: Job): RunResult {
  const cfg = { seed: job.seed, landscape: job.landscape, rock: job.rock };
  if (job.bot === 'coop_abgestimmt') return runGame({ ...cfg, mode: 'coop' }, makeCoordinatedPair());
  if (job.bot === 'coop_nebeneinander') return runGame({ ...cfg, mode: 'coop' }, makeUncoordinatedPair());
  const s = strategyById(job.bot);
  if (!s) throw new Error('unknown bot ' + job.bot);
  return runGame(cfg, [{ pid: 'p1', strategy: s, mem: {} }]);
}

const jobs = workerData.jobs as Job[];
const out: JobResult[] = [];
for (const j of jobs) {
  const r = runJob(j);
  out.push({ id: j.id, result: { ...r, stats: { ...r.stats, timeline: [] } } });
  parentPort?.postMessage({ progress: 1 });
}
parentPort?.postMessage({ done: out });
