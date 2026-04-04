#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'node:path';
import { createCacheStore } from '../cache/cacheStore.js';
import { createExactHashStrategy } from '../strategies/exactHash.js';
import { createMetadataStrategy } from '../strategies/metadata.js';
import { createPerceptualImageStrategy } from '../strategies/perceptualImage.js';
import { createPerceptualVideoStrategy } from '../strategies/perceptualVideo.js';
import { createAudioFingerprintStrategy } from '../strategies/audioFingerprint.js';
import { runScan } from '../scanner/scanner.js';
import { createReportServer } from '../reporter/reportServer.js';
import type { Strategy, ScanProgressEvent } from '../types.js';

const program = new Command();

program.name('find-dupes').version('0.1.0');

const ALL_STRATEGIES = ['exact', 'perceptual', 'metadata', 'audio'] as const;

const buildStrategies = (selection: string): Strategy[] => {
  const selected = selection === 'all' ? [...ALL_STRATEGIES] : selection.split(',');
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
  .option('--threshold <n>', 'Perceptual hamming distance threshold (0-64)', '10')
  .option('--db <path>', 'SQLite database path (default: <root-dir>/.find-dupes.db)')
  .action(async (rootDir: string, opts: { strategies: string; threshold: string; db?: string }) => {
    const absRoot = resolve(rootDir);
    const dbPath = opts.db ?? `${absRoot}/.find-dupes.db`;
    const threshold = parseInt(opts.threshold, 10);

    const store = createCacheStore(dbPath);
    const strategies = buildStrategies(opts.strategies);

    let lastLine = '';
    const onProgress = (event: ScanProgressEvent) => {
      if (event.type === 'file') {
        const line = `[${event.current}/${event.total}] ${event.path}`;
        process.stdout.write('\r' + line.padEnd(lastLine.length));
        lastLine = line;
      } else {
        process.stdout.write('\n');
        console.log(`\nDone. Found ${event.count} duplicate group(s).`);
      }
    };

    try {
      await runScan({ rootDir: absRoot, store, strategies, threshold, onProgress });
    } finally {
      store.close();
    }
  });

program
  .command('report')
  .description('Launch web UI to review and delete duplicates')
  .option('--port <n>', 'Port to listen on', '3000')
  .option('--db <path>', 'SQLite database path', '.find-dupes.db')
  .option('--dry-run', 'Log deletes without executing them', false)
  .action(async (opts: { port: string; db: string; dryRun: boolean }) => {
    const store = createCacheStore(resolve(opts.db));
    const server = createReportServer({ store, dryRun: opts.dryRun });
    const port = parseInt(opts.port, 10);
    server.listen(port, () => {
      console.log(`Report server running at http://localhost:${port}`);
      console.log('Open your browser to review duplicates.');
    });
  });

program.parse();
