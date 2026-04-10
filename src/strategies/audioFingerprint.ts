import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Strategy, StrategyResult, FileInfo } from '../types.js';

const execFileAsync = promisify(execFile);

type RunFpcalcFn = (path: string) => Promise<string>;

/**
 * Number of Chromaprint integers to retain. Each integer covers ~0.13 seconds of audio
 * (~7.8 integers/second at Chromaprint's 11025 Hz / 2048-sample step rate), so 240
 * integers covers ~30 seconds — enough to identify a track without comparing entire files.
 * Fingerprints shorter than this (clips < 30s) are zero-padded to maintain fixed length.
 */
const MAX_INTEGERS = 240;

/**
 * Convert fpcalc's comma-separated raw integer output to a fixed-length hex string
 * suitable for Hamming distance comparison.
 *
 * Each Chromaprint integer is a signed 32-bit value — `>>> 0` reinterprets it as
 * unsigned so the hex representation is stable. Truncates to MAX_INTEGERS and zero-pads
 * short clips to ensure all fingerprints have the same length (MAX_INTEGERS * 8 hex chars).
 */
const toFixedHex = (raw: string): string => {
  const integers = raw.split(',').map((s) => parseInt(s, 10));
  const truncated = integers.slice(0, MAX_INTEGERS);
  while (truncated.length < MAX_INTEGERS) truncated.push(0);
  return truncated.map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
};

const defaultRunFpcalc: RunFpcalcFn = async (path) => {
  const { stdout } = await execFileAsync('fpcalc', ['-raw', path]);
  // fpcalc output: "FILE=...\nDURATION=...\nFINGERPRINT=<comma-separated integers>"
  const match = stdout.match(/^FINGERPRINT=(.+)$/m);
  if (!match) throw new Error(`fpcalc produced unexpected output for ${path}`);
  return toFixedHex(match[1].trim());
};

/**
 * Audio fingerprint strategy using Chromaprint (`fpcalc`).
 *
 * Chromaprint decodes the audio stream to PCM, computes a spectrogram over short
 * overlapping frames, then applies image-filter-like operations to produce a compact
 * array of 32-bit integers — the raw fingerprint. The first MAX_INTEGERS integers
 * are converted to a fixed-length hex string for Hamming distance comparison.
 *
 * Fingerprint: MAX_INTEGERS * 8 hex chars = MAX_INTEGERS * 32 bits.
 * `hammingToSimilarity` in grouping derives bits from the fingerprint length automatically.
 *
 * Note: the default --threshold of 10 bits is very strict for a ~7680-bit fingerprint
 * (~99.9% similarity). For audio deduplication, a higher threshold (e.g. 500–1000) is
 * more practical. Pass --threshold explicitly when using the audio strategy alone.
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
