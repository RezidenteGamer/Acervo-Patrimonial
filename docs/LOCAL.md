# Acervo · Inventário patrimonial local

Este documento descreve exclusivamente o modo local. Para Supabase e Vercel, consulte o [README principal](../README.md).

Aplicação para catalogação operacional dos equipamentos das Secretarias de Urbanismo e Interior de Francisco Beltrão. **Não substitui o sistema patrimonial/contábil oficial.** Não utiliza servidor de dados, autenticação ou serviços externos. A identidade visual é própria do aplicativo, sem reprodução de brasões ou logotipos oficiais.

## Executar

Pré-requisito: Node.js 22.12+ ou 24 LTS, com npm. As versões efetivamente instaladas estão fixadas em `package-lock.json`.

```powershell
npm ci
npm run dev
```

Abra **http://127.0.0.1:5173**. A primeira instalação requer internet para baixar dependências; o funcionamento da aplicação é local e não requer conexão externa. A fonte Inter também é servida localmente.

Para gerar e servir a versão de produção:

```powershell
npm run build
npm run preview
```

O resultado fica em `dist/`. **Mantenha o endereço http://127.0.0.1:5173**: IndexedDB é separado por protocolo, host, porta e perfil do navegador. Abrir em `localhost`, outra porta ou outro navegador cria outro espaço de armazenamento. Não abra `index.html` diretamente pelo sistema de arquivos. Os comandos de desenvolvimento e preview usam a mesma porta e não devem rodar simultaneamente.

O roteamento usa caminhos e parâmetros de URL. Os servidores locais do Vite oferecem o fallback de navegação necessário para abrir fichas e Configurações diretamente. Se futuramente usar outro servidor estático, configure o fallback das rotas para `index.html`.

## Usar o inventário

- Selecione Urbanismo, Interior ou todas as secretarias no cabeçalho.
- Em **Novo patrimônio**, digite apenas o nome e salve. No contexto conjunto, escolha também a secretaria. **Salvar e cadastrar outro** mantém o fluxo de entrada.
- O UUID e o código amigável são automáticos e imutáveis. O prefixo indica a secretaria de origem. Transferências não mudam o código.
- Clique em um equipamento para abrir a ficha: a lista fica lateral no desktop. Troque de registro sem refazer a pesquisa; feche a ficha para voltar à lista central. No celular, use a seta para voltar.
- Use a tecla `/` para focar a pesquisa. Pesquise nome, código, patrimônio, série, placa, frota, fabricante, modelo ou localização, sem distinção de caixa e acentos.
- Os indicadores ativam filtros. Combine filtros no botão **Filtros**. O CSV exporta somente os resultados atuais, com BOM UTF-8 e separador `;`, adequado ao Excel.
- Use **Editar ficha**, preencha os campos desejados e salve explicitamente. Cancelar, navegar ou fechar a aba com alterações não salvas gera aviso.
- Categorias ajustam os campos prioritários. Campos de veículo e medidores permanecem disponíveis na seção recolhível. Mudar a categoria não apaga os dados.
- Adicione fotografias por seleção múltipla, arrastar e soltar ou câmera, quando suportada. Abra uma imagem para descrever, selecionar como principal ou remover com confirmação.
- A verificação presencial é registrada separadamente das fotografias. Informe data e responsável; o nome é texto livre, sem autenticação ou comprovação de identidade.
- Arquive pela ficha. Em **Arquivados**, consulte e restaure preservando códigos, fotos e histórico.
- Em **Configurações**, crie, renomeie ou desative categorias. As categorias vinculadas nunca são excluídas.

## Backup e recuperação

**Os dados ficam somente neste navegador. Faça backups regulares, especialmente antes de limpar o navegador ou trocar de computador.** A solicitação de armazenamento persistente é opcional e depende do navegador; não substitui backup.

1. Em **Configurações → Exportar backup completo**, baixe o arquivo ZIP.
2. Guarde uma cópia em outro dispositivo ou local seguro. O backup contém dados e fotografias sem criptografia; controle o acesso ao arquivo.
3. Para recuperar, escolha **Selecionar backup ZIP**. O aplicativo valida versão, estrutura, IDs, referências, códigos, contadores, metadados das fotos e checksums SHA-256 dos arquivos.
4. Revise a contagem e confirme **Substituir dados e restaurar**. A substituição é integral em uma transação: falhas não deixam uma restauração parcial. O arquivo não é mesclado com a base existente.

Uma restauração repetida não duplica registros. Os contadores do dispositivo preservam o maior valor já utilizado, inclusive quando um backup mais antigo é restaurado. Um ZIP é uma cópia pontual, **não sincronização** entre dispositivos. Cópias independentes em computadores diferentes não coordenam a geração dos códigos sequenciais; não mescle essas bases manualmente.

Formato versão 1: `manifest.json` com entidades e contadores; `photos/<UUID>/image` e `photos/<UUID>/thumb`, com tipo MIME, tamanho e SHA-256 no manifesto. Os hashes detectam corrupção, mas não são uma assinatura de autoria. Limite de 500 MB descompactados, 10.000 imagens, 30 imagens por patrimônio, 100.000 patrimônios e 25 MB por entrada. A geração de ZIP trabalha em memória; bases próximas do limite exigem memória disponível.

## Estrutura

```text
src/
  components/       ficha, formulário, filtros, galeria e primitivas de UI
  pages/            inventário e configurações
  hooks/            estado de catálogo e carregamento sob demanda
  domain/           entidades, validação Zod e contratos de repositórios
  db/               esquema Dexie, versão inicial 1
  repositories/     implementação IndexedDB e transações
  services/         composição, pesquisa, CSV, imagens e backup ZIP
  lib/              formatação e utilidades
tests/              testes de integridade e testes de navegador
```

React, TypeScript estrito, Vite, Tailwind CSS, componentes de base shadcn/ui (Button/CVA e Dialog/Radix), Lucide, React Router, React Hook Form, Zod e Dexie. Componentes não acessam IndexedDB: usam contratos de repositórios e serviços. O catálogo mantém metadados de equipamentos, nunca todas as imagens originais. Fotos e miniaturas são carregadas sob demanda; URLs temporárias são liberadas.

O banco usa índices por secretaria, categoria, nome, atualização e arquivo, código interno com índice único, além dos vínculos das entidades auxiliares. Cadastro/código/contador/histórico, fotos e transferências são atômicos. O esquema começa em `version(1)`; mudanças futuras devem adicionar uma nova versão com migração, nunca reescrever silenciosamente uma versão publicada.

O histórico armazena mudanças relevantes resumidas (até 100 eventos recentes por bem); as verificações têm tabela própria e permanecem preservadas. A listagem é paginada em 60 itens para limitar renderização e carregamento de miniaturas. A pesquisa local normaliza os metadados e usa atualização adiada para manter a digitação responsiva.

## Fotografias

JPEG, PNG e WebP, até 20 MB por entrada e 100 megapixels. Processamento sequencial com redimensionamento para até 2560 px, JPEG em qualidade 92% e miniaturas até 256 px. A recodificação por canvas remove metadados EXIF, incluindo localização. Imagens transparentes recebem fundo branco. Os originais não são guardados: confira se os números de série continuam legíveis na foto processada. HEIC e outros formatos devem ser convertidos para JPEG/PNG/WebP. A câmera exige suporte do dispositivo e contexto seguro (loopback local ou HTTPS).

## Testes

```powershell
npm test
npm run test:e2e
npm run build
```

Vitest usa IndexedDB simulado (`fake-indexeddb`) para validar transações, concorrência, identificadores, pesquisa, filtros, fotos, verificações, CSV e restauração com imagens e corrupção de arquivos. Playwright executa fluxos reais em contextos isolados de navegador, nos tamanhos desktop e celular. No Windows utiliza o Microsoft Edge instalado; se não existir, instale o Chromium do Playwright com `npx playwright install chromium`.

Os testes não utilizam a base do seu perfil pessoal. Não crie dados oficiais no contexto de teste. As capturas de QA ficam em `.local/`, e relatórios de falha em `test-results/`.

## Demonstração opcional

Em desenvolvimento (`npm run dev`), **Configurações → Carregar exemplos em base vazia** insere exemplos fictícios identificados por DEMO, somente após ação e confirmação. A operação é bloqueada se houver qualquer patrimônio, incluindo arquivados. Nada é inserido automaticamente. O botão não é incluído no build de produção.

## Limites e próxima etapa

- Operação por navegador/dispositivo, sem autenticação ou isolamento entre funcionários do mesmo perfil. O backup é o mecanismo de transporte e recuperação, sem mesclagem automática.
- Sem PWA/service worker: mantenha o processo local de Vite/preview ativo para abrir ou recarregar o aplicativo. A operação não depende de serviços na internet.
- Não há verificação em aparelho físico da câmera, garantia contra limpeza manual do navegador nem contra perda do dispositivo.
- Combustíveis, situações e conservação estão centralizados em `src/domain/models.ts` para extensão. Os perfis de formulário das categorias podem ser alterados em Configurações.
- Para migração à nuvem: implementar os mesmos contratos sobre uma API, coordenar códigos no servidor, migrar Blobs para armazenamento de objetos, adicionar autenticação e autorização real por secretaria e auditoria ligada a identidades autenticadas. Planejar importação validada de cada base e conflitos entre códigos de origens diferentes. Esses recursos não fazem parte desta versão.

Referências técnicas: [Dexie — transações](<https://dexie.org/docs/Dexie/Dexie.transaction()>) e [Vite — execução local](https://vite.dev/guide/).
