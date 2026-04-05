# grouping.ts

Takes a flat list of `(fileId, fingerprint)` pairs from a strategy and clusters them into groups of duplicates.

## `groupExact`

Groups files with identical fingerprints. Uses a `Map<fingerprint, fileId[]>` — O(n) time and space. Only emits groups with 2+ members; singletons are not duplicates. Similarity score is always 100.

## `groupPerceptual`

Clusters files whose fingerprints are within a configurable Hamming distance threshold. Used for perceptual image, perceptual video, and audio fingerprint strategies.

### Algorithm

Greedy O(n²) pivot scan:

1. Iterate through entries in order. If an entry has already been assigned to a group, skip it.
2. Treat the current entry as a pivot. Scan all remaining unassigned entries and add any within `threshold` Hamming distance to the pivot's cluster.
3. If the cluster has 2+ members, emit it as a group and mark all members as assigned.
4. Move to the next unassigned entry and repeat.

This is not a global optimum (a file that is close to two pivots goes to the first pivot it encounters), but it is fast and produces useful results in practice for photo libraries where true near-duplicates cluster tightly.

### Hamming distance

Hamming distance between two hex-encoded fingerprints counts the number of differing bits. Implemented using BigInt XOR followed by a population count loop. Throws if fingerprint lengths differ — this indicates a strategy bug (mixed hash sizes from different algorithm versions).

### Similarity score

`hammingToSimilarity(distance, bits)` = `(bits - distance) / bits * 100`.

- Image fingerprints: 64 bits (16 hex chars), so a distance of 5 → 92.2% similar.
- Video fingerprints: 256 bits (64 hex chars = 4 frames × 16 chars), so the same distance of 5 → 98.1% similar.

The similarity score stored in `match_groups` is computed from the *minimum* Hamming distance among all members (i.e. the closest pair in the cluster), which gives the most conservative (lowest) similarity figure for the group.
