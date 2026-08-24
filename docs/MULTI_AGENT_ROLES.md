# Papéis recomendados para multiagentes

A divisão deve seguir fronteiras de responsabilidade e contratos, não arquivos aleatórios.

| Papel | Skills principais | Entrega |
|---|---|---|
| Product Orchestrator | `orchestrating-crosshost-work` | plano, dependências, ownership, status e integração |
| Capability Researcher | `researching-adobe-capabilities` | evidence record, capability matrix e fallback |
| Product/UI Designer | `designing-adobe-workstation-ui` | hierarquia, tokens, estados, narrow/wide e score visual |
| Panel Engineer | `building-crosshost-panel-ui` | componentes, estado, bridge client e screenshots |
| AE Host Engineer | `developing-after-effects-cep` | dispatcher, `.jsx`, Undo, metadata e fixtures AE |
| Premiere Host Engineer | `developing-premiere-uxp` | adapter UXP, actions/transactions, permissions e fixtures Premiere |
| Motion Systems Engineer | `engineering-motion-rigs` | matemática, keyframes, rigs, bake/remove e golden tests |
| Assets/Backend Engineer | `integrating-asset-services` | providers, API, banco, cache, licença e import |
| Captions Engineer | `building-ai-captions-sfx` | modelo de captions, estilos, timing e regras SFX |
| Native Engineer | `engineering-native-media-core` | ABI, `.uxpaddon`, worker, inference, builds e crash isolation |
| Quality/Security Reviewer | testing + security + performance | testes, threat model, benchmarks e evidência independente |
| Release Engineer | `releasing-adobe-extensions` | package, signing, install/upgrade, SBOM e rollback |

## Regras de coordenação

- Um único agente é proprietário de cada schema/contrato compartilhado.
- Agentes de host não alteram contratos unilateralmente.
- UI e host integram cedo por mock tipado do command envelope.
- QA revisa a saída, não apenas o plano.
- Worktrees/branches isoladas são preferíveis para trabalho paralelo.
- O agente integrador executa `npm run check` depois de cada merge relevante.
- Uma tarefa só muda para Done quando o relatório de verificação está anexado.
