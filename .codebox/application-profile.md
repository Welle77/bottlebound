# Application profile

This optional repository-wide profile gives reviewers operating context that
cannot be discovered from source code. It does not replace baseline review,
security controls, repository standards, or explicit feature requirements.

| Dimension | Value | Assurance | Evidence or notes (optional) |
| --- | --- | --- | --- |
| Audience | Small private groups of players and one referee | verified | `README.md` and the rules document describe a 12-player, two-team game with one referee. |
| Network exposure | Offline document; repository hosting is its only network exposure | asserted | |
| Data sensitivity | Public, non-sensitive game rules; no personal or confidential data intended | asserted | |
| Authentication boundary | No application authentication boundary; repository access controls govern editing | asserted | |
| Operational criticality | Low; errors may disrupt a recreational match but do not affect essential services | asserted | |

## Assurance

- `asserted`: a maintainer-provided claim.
- `verified`: a claim with current supporting evidence.
- `enforced`: a named control actively maintains the condition.
