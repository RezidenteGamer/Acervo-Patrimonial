# Validação da entrega

Executada em 15/10/2026, no Windows, Node.js 24.18.0 e Microsoft Edge com contextos de navegador isolados.

| Comando / verificação                         | Resultado                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm test`                                    | 53 testes aprovados, 4 arquivos de testes                                                           |
| `npm run test:e2e`                            | 10 testes aprovados, desktop 1440 × 1000 e celular emulado Pixel 7                                  |
| `npm run build`                               | TypeScript estrito e Vite aprovados, sem aviso de tamanho de bundle                                 |
| HTTP do servidor local                        | Resposta 200                                                                                        |
| Testes SQL em PostgreSQL isolado              | 13 testes aprovados: RPCs, integridade, permissões, restauração e concorrência                      |
| Adaptador Supabase                            | 4 testes aprovados: idempotência, validação, falha de upload e revisão na restauração               |
| Configuração de backend                       | 2 testes aprovados: modo seguro em produção e chaves permitidas                                     |
| `npm run test:e2e:cloud`                      | 4 testes aprovados, desktop e celular: login, cadastro via SDK, sessão, saída e conta sem aprovação |
| Smoke test do build de produção em modo nuvem | Login obrigatório, rota direta e larguras de 320 a 1440 px aprovados, sem erros JavaScript          |

## Comportamentos exercitados

- Cadastro com apenas nome, recusa de nome vazio e valores opcionais ausentes.
- UUID e código interno únicos, geração concorrente e não reutilização após arquivamento.
- Transferência com identificadores preservados e histórico de origem/destino.
- Alternância de secretarias, contexto conjunto e escolha obrigatória de destino.
- Pesquisa por nome, código, patrimônio, série, placa, frota, fabricante, modelo e localização, ignorando caixa e acentos.
- Filtros combinados, visualização de arquivo e contexto de secretaria.
- Lista lateral no desktop, troca de ficha, fechamento preservando pesquisa/filtros e preservação da posição de rolagem.
- Ficha em tela única no celular, sem duas colunas estreitas.
- Edição, cancelamento, bloqueio de navegação com alterações e salvamento explícito.
- Cadastro em sequência com foco no nome e categoria alterada sem perder placa preenchida.
- Fotografias: processamento real de uma imagem válida no navegador, inclusão, ampliação, remoção e persistência após restauração; troca de principal, descrições e integridade de contagem no repositório.
- Verificação presencial independente de fotos, responsável, data, recusa de data futura e data inexistente.
- Arquivamento e restauração de bem com dados e fotografia preservados.
- Persistência após fechar/reabrir o banco e após recarregar a página real.
- Backup ZIP com fotografias, miniaturas, verificações, histórico e contadores.
- Restauração repetida sem duplicação; contadores preservados ao restaurar backup mais antigo.
- Recusa de arquivos inválidos, versões incompatíveis, IDs duplicados, referências órfãs, contadores inconsistentes e fotografia corrompida.
- Rollback integral da substituição quando ocorre falha de integridade no IndexedDB.
- CSV com BOM UTF-8, aspas, quebras de linha, acentos e neutralização de fórmulas.
- Categorias persistidas, renomeadas e desativadas sem perder vínculos.
- Demonstração por ação explícita em desenvolvimento e ausência do botão no build de produção.
- No build de produção: cadastro, recarregamento, módulos divididos, exportação/restauração e ausência de overflow horizontal em 320, 390, 768, 1024 e 1440 px.

## Limites da verificação

Na integração Supabase, os testes de navegador utilizam o SDK real com APIs interceptadas e credenciais fictícias. Os testes SQL utilizam PostgreSQL embarcado (PGlite) com schemas Auth/Storage simulados. Não foram criadas contas ou gravados dados no projeto hospedado.

O teste remoto da URL/chave publicável informadas retornou HTTP 200 em `/auth/v1/settings`. A consulta sem registros à tabela `acervo_assets` retornou HTTP 404, código `PGRST205`, confirmando que a instalação do esquema ainda está pendente no projeto de destino. Acesso administrativo, aplicação da migração, criação/autorização da primeira conta e verificação dos Advisors no Supabase real permanecem pendentes por falta de conexão administrativa funcional.

Não foram executados testes em câmera física de celular, Safari/iOS, Firefox, leitores de tela, esgotamento real da quota de armazenamento ou backups próximos de 500 MB. Os layouts móveis foram emulados no Edge/Chromium. O tratamento de quota e validação de tamanho estão implementados, mas não equivalem a esses testes físicos/de carga.

Os dados de teste foram criados em contextos isolados e não foram inseridos na base pessoal do navegador. A operação local continua dependendo do armazenamento do navegador e de backups externos regulares.
