# Pulso vertical V2 — deformação e luz nativa

Consulta e execução: 28/09/2026, After Effects 2026 26.5x89 / macOS 27.2.0.

O MP4 local fornecido mostra expansão vertical de aproximadamente 3,6×, largura estável, núcleo branco legível, uma faixa amarela externa e vermelho mais estreito durante as transições. O halo permanece suave no ápice; a luz cresce durante a subida e a volta. A fonte da referência é mais condensada que o texto comum. A ferramenta preserva a fonte do usuário.

A [documentação Adobe de distorção](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/distort-effects.html) descreve modos de Turbulent Displace que afetam apenas uma direção. Amount define a força e Size a escala espacial. A [documentação Adobe de Glow](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/stylize-effects.html) distingue alcance do brilho (radius) e intensidade. O [guia de nomes de efeito](https://ae-scripting.docsforadobe.dev/matchnames/effects/firstparty/) registra `ADBE Turbulent Displace` e `ADBE Glo2`.

Os índices internos dos parâmetros não são deduzidos dessas páginas. A inspeção do efeito nativo nesta instalação confirmou:

| Parâmetro | matchName observado | Valor padrão observado |
|---|---|---|
| Raio do brilho | `ADBE Glo2-0003` | 10 |
| Intensidade do brilho | `ADBE Glo2-0004` | 1 |
| Cores do brilho | `ADBE Glo2-0007` | 1 |

A produção verifica a disponibilidade do efeito e dos parâmetros antes de escrever, usando matchName em vez de rótulos traduzidos. A presença observada em uma instalação não confirma outras versões do host. [Inspeção nativa](../../artifacts/reference-effect/v2/native-parameter-probe.json).

Renders dos modos de deslocamento foram comparados para preservar as hastes verticais e concentrar rasgos no topo/base. O valor nativo 9 apresentou o resultado mais próximo nessa inspeção; a escolha deve ser confirmada nos renders finais da produção. O nome textual do item de menu não foi usado como contrato.

A migração reconhece as expressões V1 completas e atualiza os mesmos três ecos. Acrescentar um efeito em grupo indexado invalida referências de propriedades no AE; por isso rollback deve resolver os caminhos novamente após retirar o efeito acrescentado. Expressões editadas/desativadas e parâmetros animados exigem recuperação explícita antes de uma atualização, preservando as alterações do usuário.
