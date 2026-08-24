# Arquitetura

## Objetivo

Manter um único produto, embora os hosts usem runtimes diferentes:

- **Premiere Pro:** UXP, JavaScript moderno, chamadas assíncronas e DOM próprio do Premiere.
- **After Effects:** CEP para a interface e ExtendScript para o DOM do aplicativo.
- **Compartilhado:** contrato de mensagens, formatação, regras de negócio puras, textos, temas e, futuramente, cliente de API/licenciamento.

## Fluxo

```text
UI do painel
   │
   ├── Premiere UXP ──> adapter UXP ──> premierepro API
   │
   └── After Effects CEP ──> CSInterface.evalScript ──> adapter ExtendScript ──> app.project

Ambos retornam:
{ ok, data, error }
```

## Separação recomendada quando o produto crescer

```text
packages/
  core/                 regras puras, modelos e validações
  ui/                   componentes e design tokens
  api-client/           autenticação, licença, telemetria opcional
  contracts/            DTOs e envelopes de resposta
apps/
  premiere-uxp/         shell UXP + adapter do Premiere
  after-effects-cep/    shell CEP + adapter ExtendScript
native/
  shared-cpp/           algoritmos nativos compartilhados
  premiere-uxpaddon/    wrapper híbrido, quando necessário
  ae-effect/            wrapper do SDK nativo do After Effects
```

## Quando adicionar C++

Use C++ somente quando houver processamento de frames, áudio, visão computacional, codecs, integração com hardware ou outro trabalho que não deva ficar em JavaScript. Um painel de automação comum não precisa começar nativo.

Se o produto for um **efeito visual**, a arquitetura muda: o núcleo deve nascer em C++ pelo SDK de plug-ins do After Effects, com compatibilidade planejada para Premiere Pro. A interface de painel pode continuar separada.

## Requisitos de produção ainda não implementados neste starter

- autenticação e licença;
- atualização automática ou canal de distribuição;
- assinatura de ZXP/CCX e notarização de binários nativos;
- telemetria com consentimento;
- crash/error reporting;
- localização;
- testes dentro de versões reais dos hosts em Windows e macOS;
- política de migração de dados e configurações;
- documentação de suporte e privacidade.
