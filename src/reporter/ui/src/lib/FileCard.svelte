<script lang="ts">
  import { mediaUrl } from './api.js';
  import type { MemberWithFile } from '../../../../types.js';

  type Props = {
    member: MemberWithFile;
    decision: 'keep' | 'delete' | 'none';
    onKeep: () => void;
    onDelete: () => void;
    isBest: boolean;
    showBadge: boolean;
  };

  const { member, decision, onKeep, onDelete, isBest, showBadge }: Props = $props();

  const formatSize = (bytes: number) =>
    bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${(bytes / 1000).toFixed(0)} KB`;

  const formatDuration = (secs?: number) => {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isVideo = $derived(member.file.mimeType.startsWith('video/'));
  const src = $derived(mediaUrl(member.file.path));
  const badge = $derived(isBest ? 'Best' : member.metadata?.width ? 'Lower res' : 'Smaller');
  const pathParts = $derived(member.file.path.split('/').filter(Boolean));
  const shortPath = $derived(pathParts.slice(-3).join('/'));

  const truncate = (s: string, n = 64) => s.length > n ? s.slice(0, n) + '…' : s;
  const displayFingerprint = $derived(member.fingerprint ? truncate(member.fingerprint) : null);
  const displayPerceptual = $derived(member.perceptualFingerprint ?? null);

  let infoOpen = $state(false);
  let infoWrapEl = $state<HTMLElement | null>(null);

  const toggleInfo = (e: MouseEvent) => { e.stopPropagation(); infoOpen = !infoOpen; };

  $effect(() => {
    if (!infoOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (infoWrapEl && !infoWrapEl.contains(e.target as Node)) infoOpen = false;
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') infoOpen = false; };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onEsc); };
  });
</script>

<div class="card" class:keep={decision === 'keep'} class:delete={decision === 'delete'}>
  <div class="preview">
    {#if isVideo}
      <video {src} muted playsinline controls preload="metadata">
        <img {src} alt="thumbnail fallback" />
      </video>
    {:else}
      <img {src} alt={member.file.path} loading="lazy" />
    {/if}
    {#if member.metadata?.width && member.metadata?.height}
      <span class="res-tag">{member.metadata.width}×{member.metadata.height}</span>
    {/if}
  </div>

  <div class="details">
    <div class="details-header">
      {#if showBadge}<span class="badge" class:best={isBest}>{badge}</span>{/if}
      <span class="info-wrap" bind:this={infoWrapEl}>
        <button class="info-icon" onclick={toggleInfo} aria-label="File info" aria-expanded={infoOpen}>ℹ</button>
        <div class="info-popup" class:open={infoOpen}>
          <div class="info-row"><span>Path</span><span>{member.file.path}</span></div>
          <div class="info-row"><span>Type</span><span>{member.file.mimeType}</span></div>
          {#if member.metadata?.width && member.metadata?.height}
            <div class="info-row"><span>Dimensions</span><span>{member.metadata.width}×{member.metadata.height}</span></div>
          {/if}
          <div class="info-row"><span>Size</span><span>{formatSize(member.file.size)}</span></div>
          <div class="info-row"><span>Quality score</span><span>{member.qualityScore.toFixed(0)}</span></div>
          {#if displayFingerprint && member.fingerprint !== member.perceptualFingerprint}
            <div class="info-row"><span>Hash</span><span class="mono" title={member.fingerprint}>{displayFingerprint}</span></div>
          {/if}
          {#if displayPerceptual}
            <div class="info-row"><span>dHash</span><span class="mono">{displayPerceptual}</span></div>
          {/if}
        </div>
      </span>
    </div>
    <a href={src} target="_blank" title={member.file.path} class="path">{shortPath}</a>
    <ul>
      <li>{formatSize(member.file.size)}</li>
      {#if member.metadata?.bitrate}
        <li>{Math.round(member.metadata.bitrate / 1000)} kbps</li>
      {/if}
      {#if member.metadata?.duration}
        <li>{formatDuration(member.metadata.duration)}</li>
      {/if}
    </ul>
  </div>

  <div class="actions">
    <button class="keep-btn" class:active={decision === 'keep'} onclick={onKeep}>Keep</button>
    <button class="del-btn" class:active={decision === 'delete'} onclick={onDelete}>Delete</button>
  </div>
</div>

<style>
  .card { border: 2px solid #333; border-radius: 8px; transition: border-color 0.15s; }
  .card.keep { border-color: #2a2; }
  .card.delete { border-color: #e53; opacity: 0.6; }
  .preview { background: #111; aspect-ratio: 4/3; overflow: hidden; border-radius: 6px 6px 0 0; display: flex; align-items: center; justify-content: center; position: relative; }
  .preview img, .preview video { max-width: 100%; max-height: 100%; object-fit: contain; }
  .res-tag { position: absolute; bottom: 0.35rem; left: 0.35rem; background: rgba(0,0,0,0.6); color: #ddd; font-size: 0.65rem; padding: 2px 5px; border-radius: 3px; pointer-events: none; }
  .details { padding: 0.75rem; font-size: 0.8rem; }
  .details-header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem; }
  .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: #333; }
  .badge.best { background: #2a6; }
  .info-wrap { position: relative; margin-left: auto; }
  .info-icon { font-size: 0.7rem; color: #666; cursor: pointer; user-select: none; background: none; border: none; padding: 0; line-height: 1; }
  .info-popup {
    display: none;
    position: absolute;
    right: 0;
    top: 1.4rem;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    min-width: 260px;
    max-width: 360px;
    z-index: 10;
    font-size: 0.72rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  .info-popup.open { display: block; }
  .info-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.2rem 0; border-bottom: 1px solid #2a2a2a; }
  .info-row:last-child { border-bottom: none; }
  .info-row span:first-child { color: #888; white-space: nowrap; }
  .info-row span:last-child { text-align: right; word-break: break-all; }
  .mono { font-family: monospace; }
  .path { display: block; margin: 0.4rem 0; color: #88aaff; text-decoration: none; word-break: break-all; }
  ul { list-style: none; display: flex; flex-wrap: wrap; gap: 0.4rem; opacity: 0.7; }
  .actions { display: flex; gap: 0.5rem; padding: 0.5rem 0.75rem; border-top: 1px solid #222; }
  .keep-btn, .del-btn { flex: 1; padding: 0.4rem; border: 1px solid #444; background: transparent; color: #ccc; border-radius: 4px; cursor: pointer; }
  .keep-btn.active { background: #2a6; border-color: #2a6; color: white; }
  .del-btn.active { background: #e53; border-color: #e53; color: white; }
</style>
