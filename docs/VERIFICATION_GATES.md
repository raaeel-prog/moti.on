# Gates de Verificação dos Agentes

## Gate de interface

- [ ] Base `#1D1D1D` e tokens aprovados.
- [ ] Uma tarefa principal por tela.
- [ ] Sem dashboard com todos os módulos.
- [ ] 280, 360, 480 e 720 px testados.
- [ ] Focus-visible e navegação por teclado.
- [ ] Loading, empty, disabled, success e error.
- [ ] Sem overflow horizontal.
- [ ] Screenshot dentro do host, não apenas no navegador.

## Gate After Effects

- [ ] Comando allowlisted e schema validado.
- [ ] ExtendScript compatível com o engine suportado.
- [ ] `matchName` usado quando aplicável.
- [ ] Preflight antes da mutação.
- [ ] Undo group único e coerente.
- [ ] Seleção/tempo preservados conforme contrato.
- [ ] Apply repetido é idempotente.
- [ ] Fixture real `.aep` aprovada.
- [ ] Undo e reabertura do projeto testados.

## Gate Premiere

- [ ] API e assinatura verificadas na documentação oficial da versão alvo.
- [ ] Capability detection implementada.
- [ ] Nenhuma QE/API privada.
- [ ] Chamadas async aguardadas.
- [ ] Transação/locked access documentado e testado.
- [ ] Timebase e objetos stale tratados.
- [ ] Fixture real `.prproj` aprovada.
- [ ] Package/manifest validados quando alterados.

## Gate motion

- [ ] Metadata estável do rig.
- [ ] Apply/Adjust/Bake/Remove definidos.
- [ ] Keyframe data preservado.
- [ ] Parenting e coordinate space testados.
- [ ] Random possui seed.
- [ ] Bake mantém visual dentro da tolerância.
- [ ] Remove não apaga conteúdo do usuário.
- [ ] Golden estrutural ou visual atualizado.

## Gate assets/IA

- [ ] Secrets fora do cliente.
- [ ] Provider terms e atribuição preservados.
- [ ] Download validado por tamanho, MIME real e checksum.
- [ ] Offline, rate limit, cancel e disco cheio testados.
- [ ] Transcrição offline não faz chamadas de rede.
- [ ] Modelo/native verificado por hash e versão.
- [ ] Captions semânticas e visuais separadas.
- [ ] SFX possui licença/proveniência e preview.

## Gate release

- [ ] Build limpo e determinístico.
- [ ] Testes automáticos aprovados.
- [ ] Matriz real de hosts aprovada.
- [ ] Pacotes assinados/notarizados quando necessário.
- [ ] Instalação limpa, upgrade, downgrade e uninstall.
- [ ] SBOM, notices e checksums.
- [ ] Rollback ensaiado.
- [ ] Nenhuma claim excede a capacidade testada.
