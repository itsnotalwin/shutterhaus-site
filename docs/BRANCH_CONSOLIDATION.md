# One active branch: main

The repository was consolidated on 16 October 2026 at the owner's request.
`main` is the single active branch and contains the approved website, all latest
production crop/navigation corrections, release reports and browser audit tools.

The application source is unchanged from verified live release
`50ebcb41ecb3578993e3ee721fd62326d8322e84`. This consolidation adds documentation,
historical review evidence and maintenance tools; it does not restore earlier
design experiments. Mornings/weekends availability, Social at R3,500, portfolio,
booking and admin functionality remain in the current source.

## Historical work

Eight retired GitHub branch tips are recorded in [branch-archive.json](branch-archive.json).
Each is retained as a lightweight tag under `archive/2026-10-16/`; tags are
historical recovery points, not active development branches. The consolidation
commit also includes the unique remote histories as merge parents.

- `design/editorial-brand-refresh`, `editorial-redesign`, `favourites-gallery`
  and `master`: already incorporated into main's history.
- `qa/production-visual-pass`: its final report, screenshot audit, evidence
  preparation script and workflow are now maintained on main. The audit workflow
  runs manually on main and checks that release's live version.
- `deploy/mornings-weekends`: its factual availability update is present in main.
- `design/approved-visual-refresh`: an earlier visual direction; main retains
  the later approved design and the existing live-release verification.
- `redesign-spec`: earlier specification/style iterations; main retains the
  approved editorial implementation, self-hosted type and final textured artwork.
  The old review pull request is superseded by this consolidated release.

Local-only release reports and review screenshots are also included. Local
backup branch histories were saved in a Git bundle before local branch cleanup.

## Verification and retirement

The consolidation passes the normal verification and production deployment
before branch retirement. Every planned branch tip and archive tag is verified.
The eight branch names are then deleted atomically with explicit expected-tip
leases; any changed branch tip prevents the deletion. No permanent cleanup
workflow or extra maintenance branch is needed.

Use main for ongoing work. No permanent development, QA or backup branch is
required. Production checks remain in the existing deployment workflow; visual
audits are available from Actions without creating another branch.
