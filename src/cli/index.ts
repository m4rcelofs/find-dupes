#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { resolve } from 'node:path';
import { createCacheStore } from '../cache/cacheStore.js';
import { createExactHashStrategy } from '../strategies/exactHash.js';
import { createMetadataStrategy } from '../strategies/metadata.js';
import { createPerceptualImageStrategy } from '../strategies/perceptualImage.js';
import { createPerceptualVideoStrategy } from '../strategies/perceptualVideo.js';
import { createAudioFingerprintStrategy } from '../strategies/audioFingerprint.js';
import { runScan } from '../scanner/scanner.js';
import { walkDirectory } from '../scanner/fileWalker.js';
import { createReportServer } from '../reporter/reportServer.js';
import type { Strategy, ScanProgressEvent } from '../types.js';

const program = new Command();

program.name('find-dupes').version('0.1.0');

const ALL_STRATEGIES = ['exact', 'perceptual', 'metadata', 'audio'] as const;

const buildStrategies = (selection: string, program: Command): Strategy[] => {
  const selected = selection === 'all' ? [...ALL_STRATEGIES] : (selection.split(',') as string[]);
  const unknown = selected.filter((s) => !(ALL_STRATEGIES as readonly string[]).includes(s));
  if (unknown.length > 0) {
    program.error(`Unknown strategy: ${unknown.join(', ')}. Valid: ${ALL_STRATEGIES.join(', ')}`);
  }
  const strategies: Strategy[] = [];
  if (selected.includes('exact')) strategies.push(createExactHashStrategy());
  if (selected.includes('metadata')) strategies.push(createMetadataStrategy());
  if (selected.includes('perceptual')) {
    strategies.push(createPerceptualImageStrategy());
    strategies.push(createPerceptualVideoStrategy());
  }
  if (selected.includes('audio')) strategies.push(createAudioFingerprintStrategy());
  return strategies;
};

program
  .command('scan <root-dir>')
  .description('Fingerprint files and group duplicates')
  .option('--strategies <list>', 'Comma-separated: exact,perceptual,metadata,audio or "all"', 'all')
  .option('--image-threshold <n>', 'Hamming distance threshold for perceptual images (0-64)', (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0 || n > 64) throw new InvalidArgumentError('Must be an integer between 0 and 64.');
    return n;
  }, 10)
  .option('--video-threshold <n>', 'Hamming distance threshold for perceptual video (0-256)', (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0 || n > 256) throw new InvalidArgumentError('Must be an integer between 0 and 256.');
    return n;
  }, 10)
  .option('--audio-threshold <n>', 'Hamming distance threshold for audio fingerprint (0-7680)', (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0 || n > 7680) throw new InvalidArgumentError('Must be an integer between 0 and 7680.');
    return n;
  }, 500)
  .option('--db <path>', 'SQLite database path (default: <root-dir>/.find-dupes.db)')
  .option('--force', 'Ignore cached fingerprints and re-run all strategies on every file', false)
  .action(async (rootDir: string, opts: { strategies: string; imageThreshold: number; videoThreshold: number; audioThreshold: number; db?: string; force: boolean }) => {
    const absRoot = resolve(rootDir);
    const dbPath = opts.db ?? `${absRoot}/.find-dupes.db`;

    const store = createCacheStore(dbPath);
    const strategies = buildStrategies(opts.strategies, program);

    const thresholds: Record<string, number> = {
      perceptualImage: opts.imageThreshold,
      perceptualVideo: opts.videoThreshold,
      audioFingerprint: opts.audioThreshold,
    };

    const isTTY = process.stdout.isTTY ?? false;
    let lastRender = 0;

    const writeLine = (line: string) => {
      if (isTTY) {
        process.stdout.cursorTo(0);
        process.stdout.clearLine(1);
        process.stdout.write(line);
      } else {
        process.stdout.write(line + '\n');
      }
    };

    const onProgress = (event: ScanProgressEvent) => {
      if (event.type === 'file') {
        const now = Date.now();
        if (now - lastRender < 100 && event.current !== event.total) return;
        lastRender = now;
        writeLine(`[${event.current}/${event.total}] ${event.path}`);
      } else {
        writeLine(`[${event.totalFiles}/${event.totalFiles}] Grouping…`);
        if (isTTY) process.stdout.write('\n');
        const dupeWord = event.fileCount === 1 ? 'file' : 'files';
        console.log(`\nScanned ${event.totalFiles} file(s). Found ${event.count} duplicate group(s) containing ${event.fileCount} ${dupeWord}.`);
        const reportCmd = opts.db
          ? `find-dupes report --db ${dbPath}`
          : `find-dupes report ${absRoot}`;
        console.log(`\nTo review: ${reportCmd}`);
      }
    };

    try {
      await runScan({ rootDir: absRoot, store, strategies, thresholds, force: opts.force, onProgress });
    } finally {
      store.close();
    }
  });

program
  .command('unsupported <root-dir>')
  .description('List files that will be skipped by scan (unsupported format), grouped by extension')
  .action(async (rootDir: string) => {
    const absRoot = resolve(rootDir);
    const counts = new Map<string, { mime: string | false; count: number }>();

    await walkDirectory(absRoot, () => {}, ({ path, mimeType }) => {
      const ext = path.includes('.') ? `.${path.split('.').pop()!.toLowerCase()}` : '(no extension)';
      const existing = counts.get(ext);
      if (existing) {
        existing.count++;
      } else {
        counts.set(ext, { mime: mimeType, count: 1 });
      }
    });

    if (counts.size === 0) {
      console.log('No unsupported files found.');
      return;
    }

    const total = [...counts.values()].reduce((s, e) => s + e.count, 0);
    console.log(`Unsupported files: ${total} across ${counts.size} extension(s)\n`);

    const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [ext, { mime, count }] of sorted) {
      const mimeLabel = mime ? mime : 'unknown type';
      console.log(`  ${ext.padEnd(12)} ${String(count).padStart(6)}  (${mimeLabel})`);
    }
  });

program
  .command('report [root-dir]')
  .description('Launch web UI to review and delete duplicates')
  .option('--port <n>', 'Port to listen on', (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1 || n > 65535) throw new InvalidArgumentError('Must be an integer between 1 and 65535.');
    return n;
  }, 3000)
  .option('--db <path>', 'SQLite database path (default: <root-dir>/.find-dupes.db)')
  .option('--dry-run', 'Log files that would be trashed without moving them', false)
  .option('--force', 'Clear all saved review decisions and start over', false)
  .action(async (rootDir: string | undefined, opts: { port: number; db?: string; dryRun: boolean; force: boolean }) => {
    const absRoot = rootDir ? resolve(rootDir) : process.cwd();
    const dbPath = opts.db ?? `${absRoot}/.find-dupes.db`;
    const store = createCacheStore(resolve(dbPath));
    if (opts.force) store.clearReportActions();
    const server = createReportServer({ store, dryRun: opts.dryRun });
    server.listen(opts.port, () => {
      console.log(`Report server running at http://localhost:${opts.port}`);
      console.log('Open your browser to review duplicates.');
    });
  });

program.parse();
