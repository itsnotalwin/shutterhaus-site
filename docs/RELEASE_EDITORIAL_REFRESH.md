# Editorial refresh release

The owner approved the improved artwork and explicitly requested publication on 15 October 2026. This supersedes the earlier no-deploy hold.

The design branch was reconciled with production main `1cc9d14527ebfb86b369e186326dfcfb5f677340` before release. Latest admin transactional publishing, image uploads, auth, database configuration, no-JavaScript page generation, draft recovery, metadata, morning/weekend availability and native photo controls are preserved. Original gallery order correction on main is retained. The latest numeric pricing data and all benefits/terms remain authoritative, with the requested Social price set to R3,500.

The reviewed editorial layout and generated textured artwork remain. Latest mobile portfolio disclosure and package selection are retained; disclosure labels, focus trapping, skip links and invalid-field announcements are checked. The latest desktop portrait focal positions preserve the top of Essential/Social subjects.

Production uses the existing GitHub Pages workflow and existing public repository build variables. Local integration verification uses mock Supabase public connection values so the authenticated admin/public backend fixture can run without any production writes; these local values are not stored in code or shipped by the deployment workflow.

Rollback reference: production main before this release, `1cc9d14527ebfb86b369e186326dfcfb5f677340`. The existing deployment workflow checks release.json and all public routes/assets on the real domain after deployment.
