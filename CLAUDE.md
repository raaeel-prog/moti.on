# Claude Code Entry Point

Read `docs/MASTER_BUILD_SPEC.md`, `docs/AGENT_SKILLS_GUIDE.md`, and the relevant project files before editing.

Project skills are mirrored under `.claude/skills/`. For non-trivial work, begin with `/orchestrating-crosshost-work`, then invoke only the specialist skills required by the routing matrix.

For every UI task, invoke `/designing-adobe-workstation-ui` and `/building-crosshost-panel-ui`. The After Effects panel follows the host theme (`apps/after-effects-cep/client/src/host-theme.ts`, fallback `#323232` in `packages/ui-tokens/src/after-effects.css`; Onyx `#121212` in `packages/ui-tokens/src/tokens.css` is only for the shared kit and Premiere), text is never below 11 px, nothing hides behind horizontal scrolling, disabled controls never use the action color, one task dominates each view, ordinary controls use compact property rows, and the result must work as a dockable Adobe workstation panel at 280, 360, 480 and 720 px.

For any current or uncertain Adobe API, provider policy, manifest permission or release rule, invoke `/researching-adobe-capabilities` before implementation.

Do not claim an Adobe feature is complete without the evidence required by `/testing-adobe-hosts`. Mark real-host work that has not been executed as `IMPLEMENTED_NOT_HOST_VERIFIED`.

No Windows (ou ao continuar o trabalho de outro computador), leia antes `docs/WINDOWS.md`: setup, instalação com `Atualizar Moti.on.cmd`, diferenças por sistema, próxima fase (GPU DirectX 12) e o contexto que estava só na memória do Claude no Mac. O plugin deve continuar funcionando no macOS e no Windows.
