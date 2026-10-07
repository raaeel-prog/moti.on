# Correções dos vídeos de 17/09

1. Menu ≡ abre abaixo do nome da miniatura, dentro do item, com direções em lista e parâmetros adicionais recolhidos. A prévia permanece visível. Escape fecha e devolve foco; clique externo fecha.
2. Miniaturas sem moldura cinza: prévia, nome e ícones discretos na mesma linha. Favorito continua acessível e reconhecível.
3. Câmera ganha transições de imagem (preto, claro, blur, giro, distorção/shake e zoom), mantendo movimentos de câmera existentes em subpasta. Receitas originais utilizam o motor gerenciado, controles nativos, Apply/Adjust/Remove/Bake, preflight e Undo existentes.

Arquivos: galeria, tema, prévia, catálogo compartilhado, efeitos do motor de presets; testes de comportamento e documentação. Dono dos contratos: camera_recipes_0917, limitado ao catálogo e tipos de efeito. Nenhuma alteração de envelope de comando.

Verificar: check antes/depois; menu sem obstrução nas quatro larguras; direção enviada ao host; transições amostradas no AE real; ajuste sem duplicação e remoção; compatibilidade AE25+ e efeitos detectados por matchName. Câmera visual atua nas camadas selecionadas, inclusive precomposições; não altera câmera 3D existente.

Rollback: fonte em artifacts/video-fixes-0917/source-before.tgz; instalador salva versão anterior antes de atualizar. Testes em composição temporária separada, preservando a seleção e o tempo do projeto do usuário.
