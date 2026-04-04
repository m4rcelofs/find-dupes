import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

const execFileAsync = promisify(execFile);

type RunFpcalcFn = (path: string) => Promise<string>;

const defaultRunFpcalc: RunFpcalcFn = async (path) => {
  const { stdout } = await execFileAsync('fpcalc', ['-raw', path]);
  // fpcalc output: "FILE=...\nDURATION=...\nFINGERPRINT=<value>"
  const match = stdout.match(/^FINGERPRINT=(.+)$/m);
  if (!match) throw new Error(`fpcalc produced unexpected output for ${path}`);
  return match[1].trim();
};

export const createAudioFingerprintStrategy = (
  { runFpcalc = defaultRunFpcalc }: { runFpcalc?: RunFpcalcFn } = {},
): Strategy => ({
  name: 'audioFingerprint',
  supportedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/mpeg'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => ({
    fingerprint: await runFpcalc(file.path),
  }),
});
