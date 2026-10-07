# Paridade funcional de animação — plano e estado

Data de início: 25/09/2026. Atualização documental: 26/09/2026, America/Bahia. Status: **PARTIAL**. A primeira fatia foi validada e instalada; variações salvas e organização de marcadores continuam em implementação. A pedido do usuário, os próximos testes foram adiados para avançar nas funcionalidades; check final, Undo específico e nova instalação permanecem pendentes.

Baseline: `npm run check` PASS, 1.544 testes. A cópia local não tem `.git`; backups relativos em `artifacts/composer-parity-2026-09-25/source-before` preservam os arquivos anteriores. As alterações continuam na arquitetura existente, com UI, contratos e host separados.

## Escopo implementado

| Fatia | Resultado | Evidência atual |
|---|---|---|
| Auditoria | Animation Composer 4.2.6 confirmado por manifestos CEP e nativo; inventário de arquivos e pesquisa pública, sem incorporar presets/código/assets proprietários | [Auditoria](../../research/animation-composer-installed-2026-09-25.md); catálogo completo por interface ainda NOT RUN |
| Navegação e fase | Aplicação bem-sucedida abre Editar com inspeção nova; abas Navegar/Editar visíveis; Entrada/Saída/Ambos em controle primário com teclado; checkbox ambíguo removido | Testes UI e tipos PASS; inspeção visual do build final pendente |
| Interação numérica | Arraste horizontal, teclas de ajuste, Shift fino/Alt amplo, digitação e restauração individual; percentuais decimais | Implementado depois da pausa; NOT RUN |
| Edição conjunta | Até 50 camadas com mesma receita, mesmas opções e controles estáticos; identidade/fingerprint de cada alvo revalidado | Implementado depois da pausa; NOT RUN |
| Edição e cópia | Restaurar padrão no rascunho; copiar receita inspecionada para cache de sessão; colar na seleção com fase configurável via comando existente | UI PASS; confirmação visual no CEP pendente |
| Variações persistentes | Salvar receita aplicada com nome, listar, carregar, aplicar diretamente, renomear, duplicar, atualizar, excluir e desfazer; backup JSON aditivo; armazenamento local validado, até 100 itens e 80 caracteres por nome; nova inspeção antes de salvar | Snapshot inicial de 49 testes focados PASS; gerenciamento ampliado/backup/revelação posteriores à pausa ainda NOT RUN; validação entre reinícios do CEP pendente |
| Timing por arraste | Marcadores gerenciados para fim da entrada e início da saída, arraste, duração, detecção de conflitos, remoção/bake e rollback | 6 cenários no AE 26.5x89 PASS; Undo em um passo PASS |
| Organização de marcadores | Deslocar, alinhar ao cursor ou escalonar o fim da entrada ou o início da saída em até 50 camadas; intervalo em frames, ordem da timeline e aleatória com semente | Fixture anterior PASS — 4 cenários em timing-actions-results.json; ordem aleatória, Undo específico, novo check e instalação pendentes |
| Minha biblioteca | Referenciar .ffx, imagens, áudio, vídeo e .aep; tokens e arquivos revalidados; mensagens/ações conforme tipo | 6 cenários no AE 26.5x89 PASS com PNG/WAV/AEP, mais 2 regressões PNG-sequence/FFX PASS; formatos restantes dependem de validação individual |

## Invariantes e limites

- Preservar cues do usuário, seleção, tempo corrente e arquivos originais. Resolver conflitos antes de mutar e manter Undo coerente.
- Manter o catálogo de 165 receitas próprias; esta rodada melhora o fluxo de trabalho, sem multiplicar itens ou anunciar clone de catálogo comercial.
- A cópia contém ID da receita e opções validadas; não armazena referências de camada ou conteúdo executável. A cópia permanece somente durante a sessão; variações explicitamente salvas com nome persistem no armazenamento local do painel. Backup JSON manual exporta/importa apenas configurações conhecidas, de modo aditivo; não existe sincronização automática.
- `.aep` importa no projeto atual; não abre outro projeto nem navega suas composições internas. Mídia entra no tempo corrente. A seleção existente é restaurada.
- A organização de marcadores aceita apenas transições Moti.on com ownership íntegro e duração nativa estática no valor original dos marcadores. Recusa cues combinados, ausentes ou duplicados, camadas travadas, colisões e sobreposição entre entrada e saída. Não move limites da camada ou keyframes de animação.
- Empilhamento de receitas, entrada/saída com receitas diferentes, substituição geral, edição conjunta de receitas diferentes, MOGRT, processamento do áudio importado e packs comerciais não estão concluídos por esta fatia. Valores diferentes da mesma receita recebem edição parcial; prévia local fornece seek e velocidade/tom, sem transformar os arquivos.

## Validação adiada e fechamento pendente

Os itens abaixo permanecem planejados, mas sua execução está pausada por orientação do usuário. Isso não concede aprovação às mudanças posteriores.

1. Concluir a revisão das variações: seleção desatualizada durante o salvamento, desfazer exclusão depois de recriar a aba e recuperação de falhas temporárias de armazenamento.
2. Reexecutar `npm run check` após as correções. A primeira fatia passou com **1.586 testes** em `check-final.log`; esse log antecede variações e `ae.presets.timing` e não comprova o novo conjunto. A execução intermediária em `check-variants-timing.log` registrou falhas de integração e precisa ser substituída por evidência de nova execução.
3. A fixture `verify-timing-actions.jsx` já passou em quatro cenários no AE 26.5x89 (`timing-actions-results.json`). Falta provar Undo do novo comando em chamada separada. O Undo da aplicação inicial de preset já está PASS em `timing-undo-results.json`.
4. Instalar o novo build com backup, recarregar o painel e confirmar as ações novas. A instalação anterior está PASS, com 43 arquivos conferidos e backup `artifacts/install-backups/ae-20260926-104607/previous`; não cobre alterações posteriores.
5. Inspecionar Navegar/Editar nas larguras 280, 360, 480 e 720 px e dentro do CEP, incluindo teclado, seleção vazia, estados desabilitados, persistência de variações, exclusão/desfazer e mensagens de conflito.
6. Complementar [entrega e validação](entrega.md) com os resultados finais, sem substituir NOT RUN por inferência.

Rollback: restaurar apenas os arquivos alterados desta fatia a partir de `source-before`; reinstalar o pacote anterior usando o backup da instalação. Não restaurar o diretório inteiro nem sobrescrever trabalho paralelo. Os projetos usados para QA são fixtures; nenhum projeto pessoal deve ser usado como alvo de teste.

## Continuação materializada e ainda sem validação funcional

Implementados edição parcial com valores misturados, suavização de transição configurável, duração explícita de uma fase e prévias locais de imagem/áudio/vídeo por token. Build concluído em `build-library-preview-implementation.log`; instalação atualizada com backup em `install-library-preview-implementation.log`. Próxima etapa de validação deve incluir esses fluxos, a recuperação/cancelamento dos números misturados, preservação dos valores por camada, troca/reversão de suavização, todos os conflitos de fase e CSP/codecs/release de players. Suíte e host QA continuam adiados a pedido do usuário.
