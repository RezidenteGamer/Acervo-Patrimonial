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

## Correção do deploy Vercel — 15/10/2026

Projeto verificado: `infraestrutura-fb/acervo-patrimonial`. As três variáveis públicas `VITE_*` foram substituídas pelos valores fornecidos e cadastradas como Config em Production e Preview. O deploy da correção `dpl_B4z7tKJZCADiQAUHuXfnvroouvwc`, do código `d939d07`, foi concluído com estado READY e publicado em `acervo-patrimonial.vercel.app`. Novos pushes no repositório geram publicações posteriores pela integração Git.

Verificação inicial no endereço publicado: `/` e `/configuracoes` responderam HTTP 200 e exibiram o login, sem a mensagem de conexão não configurada. Campos de e-mail/senha e botão Entrar disponíveis, inventário inacessível anonimamente, sem erros JavaScript e sem overflow nas larguras de 390 e 1440 px. Consulta dos logs de runtime desse deploy, filtrada por erros nos 10 minutos anteriores à verificação, retornou zero registros.

## Instalação e validação no Supabase hospedado — 15/10/2026

- Autenticação administrativa concluída pela CLI oficial no navegador padrão. Projeto de destino confirmado antes de qualquer escrita.
- Migração `20261015150829_acervo_cloud.sql` aplicada pela CLI e registrada no histórico remoto.
- Nove tabelas `acervo_*`, todas com RLS habilitado; duas secretarias e nove categorias iniciais.
- Bucket `acervo-photos` privado, imagens JPEG/PNG/WebP e limite de 20 MB. API anônima recusada com HTTP 401; funções públicas sem privilégio de execução para `anon`, e escrita direta em patrimônios revogada para `authenticated`.
- Conta existente corrigida pela API oficial do Supabase Auth conforme escolha do responsável, mantendo a senha, e autorizada como administradora.
- Cadastro, código gerado no servidor, edição, transferência com código preservado, leitura da ficha e ator no histórico aprovados no PostgreSQL hospedado, usando o papel `authenticated`. Teste executado em transação revertida: zero patrimônios e zero contadores ao final.
- Sessão real temporária de Auth gerada administrativamente, sem envio de e-mail ou mudança de senha. SDK público confirmou papel de administrador e catálogo real pela Data API.
- Upload, download com comparação SHA-256, bloqueio de URL pública e exclusão de imagem temporária aprovados no Storage real.
- Navegador isolado no domínio publicado abriu inventário e configurações de administrador, preservou a sessão após recarregamento e exibiu layout móvel de 390 px sem overflow ou erros JavaScript.
- Sessão temporária encerrada e arquivo temporário removido. Consulta final confirmou um administrador ativo, zero patrimônios, zero contadores e zero imagens armazenadas.

Advisors executados: nenhum erro de segurança ou desempenho no esquema. Um aviso de proteção contra senhas vazadas desabilitada no Auth ([orientação e disponibilidade em Pro+](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)) e sete avisos informativos de índices ainda não utilizados, esperados em uma base recém-instalada. Os índices foram preservados.

## Limites da verificação Supabase

As suítes versionadas de navegador em nuvem utilizam o SDK real com APIs interceptadas e credenciais fictícias. Os testes SQL versionados utilizam PostgreSQL embarcado (PGlite) com schemas Auth/Storage simulados. A verificação hospedada descrita acima foi adicional, com sessão real e arquivo temporário.

O login por senha deve ser realizado pelo responsável com sua senha existente; a validação automatizada utilizou uma sessão temporária de Auth, sem conhecer ou alterar a senha. Os testes de escrita no banco real foram executados por RPC dentro de uma transação revertida, e não por um cadastro persistente na interface. Restauração completa e migração de dados pessoais continuam exigindo uma ação explícita do administrador.

Não foram executados testes em câmera física de celular, Safari/iOS, Firefox, leitores de tela, esgotamento real da quota de armazenamento ou backups próximos de 500 MB. Os layouts móveis foram emulados no Edge/Chromium. O tratamento de quota e validação de tamanho estão implementados, mas não equivalem a esses testes físicos/de carga.

Os dados de teste foram criados em contextos isolados e não foram inseridos na base pessoal do navegador. A operação local continua dependendo do armazenamento do navegador e de backups externos regulares.
