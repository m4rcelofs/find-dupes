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

/**
 * Audio fingerprint strategy using Chromaprint (`fpcalc`).
 *
 * Chromaprint decodes the audio stream to PCM, computes a spectrogram over short
 * overlapping frames, then applies image-filter-like operations to produce a compact
 * array of 32-bit integers — the raw fingerprint. Stored as a comma-separated string.
 *
 * Finds videos that share the same audio track regardless of visual re-encoding,
 * resolution changes, or container format. Complements `perceptualVideo` for cases
 * where sampled keyframes don't overlap between two cuts of the same video.
 *
 * Requires `fpcalc` on $PATH (part of Chromaprint — see README for install instructions).
 * If unavailable, the strategy throws and the scanner silently skips it for that file.
 *
 * `runFpcalc` is injectable for testing — pass a mock to avoid requiring fpcalc in CI.
 */
export const createAudioFingerprintStrategy = (
  { runFpcalc = defaultRunFpcalc }: { runFpcalc?: RunFpcalcFn } = {},
): Strategy => ({
  name: 'audioFingerprint',
  supportedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/mpeg', 'video/x-realmedia', 'video/x-realmedia-vbr'],

  analyze: async (file: Pick<FileInfo, 'path' | 'mimeType'>): Promise<StrategyResult> => ({
    fingerprint: await runFpcalc(file.path),
  }),
});
