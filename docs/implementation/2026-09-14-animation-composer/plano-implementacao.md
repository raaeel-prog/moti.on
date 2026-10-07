# Implementação da biblioteca de presets

## Escopo

56 definições próprias a partir dos comportamentos identificados no vídeo, preservando as seis curvas e os onze movimentos de câmera atuais. Biblioteca organizada por motion 2D/3D, efeitos, texto por caracteres/palavras/linhas e efeitos de texto. A prévia da curva acompanha o gráfico.

## Arquivos e contrato

- Catálogo e opções versionados em `packages/contracts/src/motion-library.ts`; um único responsável pelo contrato.
- Motor no host After Effects com comandos de aplicar/ajustar, converter animação em keyframes e remover; catálogo gerado a partir da mesma fonte da interface.
- Galeria e prévias no cliente CEP; integração pelo dispatcher existente.
- Sem novo runtime no Premiere; recurso específico do After Effects.

## Regras

- Transições acompanham início e fim da camada; duração em frames, comprimida quando a camada é curta. Stagger do texto faz parte desse intervalo.
- Preservar valores e keyframes existentes; recusar expressão conflitante, camada bloqueada ou capacidade ausente antes de mutar.
- Um preset da biblioteca por camada; reaplicar o mesmo ajusta os controles. Trocar de preset exige remover o anterior na própria galeria.
- Metadados identificam apenas os controles, animadores e expressões gerenciados pela biblioteca. Remoção preserva conteúdo do usuário.
- Mudanças agrupadas em um Undo; falhas de criação restauram o estado anterior.
- As prévias são demonstrações próprias. Não há importação de arquivos ou código do Animation Composer.

## Verificação e reversão

Baseline: `npm run check` falhou em quatro erros de lint preexistentes (dois globais ausentes, uma declaração de tipo genérica e um erro relançado sem causa). Corrigir para liberar a verificação completa.

Rodar validação do catálogo/contrato, testes do motor e prévias, verificação completa do repositório e fixtures no After Effects 26.5x89/macOS. Exercitar todos os presets, reaplicação, remoção, seleção inválida, diferentes durações/fps e Undo. Verificar a interface em larguras de 280, 360, 480 e 720 px. Manter explícito o que não for executado.

Esta cópia de trabalho não contém `.git`; os arquivos anteriores estão em `artifacts/presets/source-before`. A instalação de desenvolvimento guarda backup próprio para reversão.
