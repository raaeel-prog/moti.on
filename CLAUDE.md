# Claude Code Entry Point

Read `docs/MASTER_BUILD_SPEC.md`, `docs/AGENT_SKILLS_GUIDE.md`, and the relevant project files before editing.

Project skills are mirrored under `.claude/skills/`. For non-trivial work, begin with `/orchestrating-crosshost-work`, then invoke only the specialist skills required by the routing matrix.

For every UI task, invoke `/designing-adobe-workstation-ui` and `/building-crosshost-panel-ui`. The panel base is `#1D1D1D`, one task dominates each view, ordinary controls use compact property rows, and the result must work as a dockable Adobe workstation panel at 280, 360, 480 and 720 px.

For any current or uncertain Adobe API, provider policy, manifest permission or release rule, invoke `/researching-adobe-capabilities` before implementation.

Do not claim an Adobe feature is complete without the evidence required by `/testing-adobe-hosts`. Mark real-host work that has not been executed as `IMPLEMENTED_NOT_HOST_VERIFIED`.
