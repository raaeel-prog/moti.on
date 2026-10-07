# Glitch nativo — 20/09/2026

Fatia inicial: carregar e executar um Glitch real no After Effects 26.5/macOS,
mantendo o painel e os projetos editáveis. O MD recebido é contexto histórico;
as causas serão confirmadas no SDK local e no host.

- Build: CMake, Rez em Contents/Resources, identidade estável, assinatura ad-hoc de desenvolvimento e verificação do bundle. Remover ResMerger e injeção Mach-O.
- Core: deslocamento de faixas, separação RGB, intensidade, frequência e semente determinística em 8/16 bpc; flags iguais em C++ e PiPL. Sem anunciar SmartFX, MFR, GPU ou float32.
- Integração: preflight do plugin e parâmetros, adjustment solid de tamanho da composição, ajuste sem recriar efeitos, metadata, preservação de seleção/tempo e rollback. Frame hold temporal não implementado deve ser recusado.
- Verificação: baseline e full check, testes C++ com sanitizers, contrato JSX, descoberta real do plugin, renders, atualização e Undo.
- Migração: IDs 1/2 e matchName CHMS Motion Core permanecem; IDs 3–5 adicionados. Null de protótipo não será convertido apagando dados do usuário.
- Rollback: cópias dos fontes alterados e da instalação anterior; nenhum cache global ou projeto pessoal será apagado. Pasta recebida não contém Git, portanto sem branch/commit fictícios.

Baseline: `npm run check` falhou com 111 erros de lint, principalmente na documentação JavaScript do CMake vendorizado, mais código do bridge Glitch. Log em artifacts/native-glitch/baseline-check.log.
