# Validação nativa das partículas em pré-comp — 2026-10-31

**Resultado: PASS. After Effects 26.5x89, Windows.**

A versão instalada produziu 16 frames TIFF com alfa por `aerender`, com 12 verificações aprovadas. Nenhum mouse, teclado, ativação de janela ou ferramenta de Computer Use foi utilizado nesta retomada.

## Comportamentos observados

- Uma camada de pré-comp na composição principal, quatro emissores e controlador interno.
- Direções 0° (cima), 90° (direita), 180° (baixo), 270° (esquerda) e diagonal de 45° medidas entre frames de 1 s e 1,2 s, após encerrar a emissão em 0,1 s.
- Dois frames da pré-comp são pixel a pixel idênticos aos do rig equivalente sem pré-comp.
- Velocidade zero mantém o centro das partículas imóvel dentro de 0,75 px, tolerando as mudanças de tamanho/opacidade com a idade.
- Presets padrão renderizam partículas com alfa nos quatro quadrantes, em 640×360 e 360×640.
- Ajuste de direção pela operação do plugin reconhecendo a camada externa, sem recriar o rig.
- Nove composições foram salvas e reabertas: identidade, direção e estrutura preservadas.
- A fixture exigiu projeto vazio e não salvo antes de mutar; terminou restaurando um projeto vazio.

## Correção do processo de validação

A captura anterior via `saveFrameToPng` não gerava arquivo para a pré-comp. O primeiro teste da fila também encontrou ausência de template PNG. O caminho reproduzível agora prepara uma fixture própria, seleciona o template TIFF com alfa realmente instalado e usa um processo `aerender` separado. A conclusão exige arquivos decodificáveis, alfa, conteúdo visível e medições; código de saída zero isoladamente não aprova o teste.

Não foi necessária alteração adicional no motor de partículas nesta retomada. Os dois scripts de validação foram corrigidos/adicionados; as provas correspondem ao host instalado identificado por SHA-256.

## Reprodução

Em um projeto vazio e não salvo, executar pela raiz do checkout:

```powershell
node scripts/verify-particles-render.mjs
```

O script recusa projetos salvos ou com itens, usa apenas scripts/CLI locais e cria uma pasta de evidências exclusiva por execução. Ele não modifica preferências, credenciais ou templates globais.

## Evidências

- Pasta: `C:\dev\Moti.on\implementation\artifacts\particles-rising-20261031\render-2026-10-31T15-44-44-324Z`
- Fixture: `C:\dev\Moti.on\implementation\artifacts\particles-rising-20261031\render-2026-10-31T15-44-44-324Z\particles.aep`
- Host instalado SHA-256: `b626748246f20572f4753d737d642beaf1c69366c2fab53fedba776281450f80`
- `preparation.json`: comportamento nativo e preservação após reabrir.
- `source.json`: identidade do host e da fixture.
- `aerender.log`: render nativo dos 16 jobs.
- `result.json`: hashes, pixels visíveis, centroides e 12 resultados.
- `landscape.png` / `portrait.png`: conversões dos TIFFs nativos para inspeção, sem edição do conteúdo.

## Limites

Undo/Redo por interface e interação de mouse/teclado no painel permanecem NOT RUN nesta retomada, conforme a restrição do usuário. A causa interna do não retorno de PNG pelo helper anterior não foi atribuída ao motor: o render nativo separado e a comparação de pixels passaram. A suíte geral anterior tinha 14 falhas fora de partículas; esta prova não altera esse resultado.
