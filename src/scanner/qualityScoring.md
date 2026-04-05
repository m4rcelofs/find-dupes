# qualityScoring.ts

Assigns a quality score to each file within a duplicate group. Higher score = better copy to keep.

## Scoring rules

| File type | Has dimensions + bitrate | Has dimensions only | Otherwise |
|---|---|---|---|
| Video | `width × height × bitrate` | `fileSize` | `fileSize` |
| Image | `width × height` | `width × height` | `fileSize` |

### Why these metrics

For **images**, pixel count (width × height) is the most reliable proxy for quality among duplicates. A 4000×3000 JPEG and a 640×480 JPEG of the same photo are clearly different quality. File size is the fallback when dimensions aren't available (e.g. unsupported format).

For **videos**, resolution alone is insufficient — a low-bitrate 1080p can look worse than a high-bitrate 720p. Multiplying resolution by bitrate gives a composite score that rewards both. File size is the fallback when either value is missing.

Scores are not normalised — they are only meaningful for comparison within a group. The `getGroupsWithMembers` query returns members ordered by quality score descending, so the best copy is always first in the list.
