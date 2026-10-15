# Acervo · Inventário patrimonial

Inventário operacional das Secretarias de Urbanismo e Interior de Francisco Beltrão. React, TypeScript e Vite, com experiência dinâmica de lista + ficha. Não substitui o sistema patrimonial/contábil oficial.

Dois modos: **local** (IndexedDB) e **nuvem** (Supabase Auth, PostgreSQL e Storage privado). O frontend está preparado para Vercel; não há publicação automática nesta entrega.

## Estado da integração

Projeto de destino: `sivtgmclfgebjippxgxp`, informado pelo responsável. A URL e a chave publicável responderam ao teste de conexão. **A migração ainda precisa ser instalada nesse projeto**: o teste remoto confirmou que `acervo_assets` está ausente. O plugin administrativo não respondeu após a troca de conta, e a CLI estava autenticada em outra conta sem acesso ao destino. Nenhum outro projeto foi alterado.

Os testes de PostgreSQL usam um banco PGlite isolado. Os testes cloud de navegador interceptam as APIs com respostas controladas; não equivalem à validação no Supabase hospedado. Consulte [VALIDACAO.md](VALIDACAO.md).

## Executar

Node.js 24 e npm. Versões fixadas no lockfile:

```powershell
npm ci
npm run dev
```

Abra **http://127.0.0.1:5173**. Sem configuração, o desenvolvimento continua usando a base local existente. Consulte [docs/LOCAL.md](docs/LOCAL.md) para instruções detalhadas desse modo.

Para usar Supabase no desenvolvimento, copie `.env.example` para `.env.local`, preencha a chave **Publishable** e reinicie:

```dotenv
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=https://sivtgmclfgebjippxgxp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
```

Nunca coloque `service_role`, `sb_secret_`, senha do banco ou access token administrativo em `VITE_*`. Essas variáveis integram o JavaScript entregue ao navegador. Os arquivos `.env*` reais são ignorados pelo Git; somente `.env.example` é versionado.

## Instalar o banco Supabase

Instale **somente no projeto de destino**, com uma conta administradora. Não execute a migração novamente se as tabelas `acervo_*` já existirem; confira o histórico antes.

Pela CLI incluída no projeto:

```powershell
npx supabase login --profile acervo
npx supabase link --project-ref sivtgmclfgebjippxgxp --profile acervo
npx supabase db push --linked --dry-run --profile acervo
npx supabase db push --linked --profile acervo
```

Se a CLI solicitar a senha do banco, digite no próprio prompt. Não grave a senha em comandos ou arquivos. O perfil `acervo` mantém separado o acesso usado por outros projetos.

Alternativa: abra o [SQL Editor do projeto](https://supabase.com/dashboard/project/sivtgmclfgebjippxgxp/sql/new), cole o conteúdo **completo** de [20261015150829_acervo_cloud.sql](supabase/migrations/20261015150829_acervo_cloud.sql) e execute uma vez. Se adotar a CLI depois, registre a versão como aplicada **somente após conferir que o arquivo inteiro foi executado**:

```powershell
npx supabase migration repair 20261015150829 --status applied --project-ref sivtgmclfgebjippxgxp --profile acervo
```

A migração cria tabelas `acervo_*`, índices e vínculos, regras RLS, RPCs transacionais, secretarias/categorias iniciais e o bucket privado `acervo-photos`. Não insere patrimônios demonstrativos, usuários ou acessos públicos. Execute os Security Advisors do projeto após a instalação.

## Autorizar a primeira conta

1. Em **Authentication → Users**, crie a conta com e-mail e senha. A senha é definida pelo responsável, fora do código.
2. No SQL Editor, substitua o e-mail abaixo pela conta criada e execute:

```sql
insert into public.acervo_members(user_id, role, active)
select id, 'admin', true
from auth.users
where lower(email) = lower('seu-email@exemplo.com')
on conflict (user_id) do update set role = excluded.role, active = true;
```

Confirme que uma conta foi encontrada. Para funcionários, use `editor` em vez de `admin`. Todos os membros ativos compartilham o inventário das duas secretarias; não há restrição por secretaria nesta versão. Apenas administradores podem restaurar/substituir a base compartilhada.

Não há cadastro público no aplicativo. Mesmo uma conta criada fora da interface não acessa o inventário sem inclusão nessa lista. Para revogar o acesso, defina `active = false`. As regras do banco/Storage consultam a lista em cada operação, sem depender de metadados editáveis do usuário. O histórico novo registra o UUID autenticado; o nome na verificação presencial continua sendo texto livre.

## Publicar no Vercel

Importe [RezidenteGamer/Acervo-Patrimonial](https://github.com/RezidenteGamer/Acervo-Patrimonial):

- Framework: **Vite**.
- Build: `npm run build`.
- Output: `dist`.
- Install: `npm ci`.
- Node.js: **24.x**.

Cadastre `VITE_DATA_BACKEND=supabase`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nos ambientes desejados do Vercel. Use a chave **Publishable** do próprio projeto. Gere novo deploy após alterar variáveis. `vercel.json` configura o fallback das rotas para abrir fichas e Configurações diretamente.

Em produção, sem configuração válida, o aplicativo mostra instruções de conexão e **não muda silenciosamente para uma base local**. A tela de login só libera o inventário depois da autenticação e autorização no banco.

```powershell
npm run build
npm run preview
```

O preview usa a porta 5173; interrompa o desenvolvimento antes de executá-lo. Para gerar um build local deliberadamente, defina `VITE_DATA_BACKEND=local` no ambiente do build.

## Migração local e backup

Os cadastros antigos permanecem em IndexedDB. Nenhum envio é automático.

- No mesmo endereço/perfil do navegador, entre como administrador com Supabase configurado e abra **Configurações → Migrar base local para nuvem vazia**. Revise e confirme. IDs, códigos, fotos, verificações e histórico são preservados; a cópia local permanece. O servidor recusa a operação se a nuvem já tiver patrimônios.
- Para mudar de origem (por exemplo, localhost para Vercel), exporte o ZIP no endereço original e restaure no novo ambiente. IndexedDB não é compartilhado entre origens/perfis.
- **Exportar backup completo** inclui ativos e arquivados com imagens. **Restaurar** substitui a base inteira; na nuvem afeta todos os funcionários e exige administrador. Não existe mesclagem automática.
- As fotos são enviadas para caminhos novos no bucket privado antes de confirmar os metadados. A substituição dos dados acontece em uma transação. Se a base mudar durante o envio, a restauração é recusada para evitar perda concorrente.
- Após sucesso, a limpeza remove arquivos antigos sem referência; RLS impede apagar imagens ainda vinculadas. Interrupções abruptas ou falhas de limpeza podem deixar arquivos órfãos, exigindo manutenção administrativa. Banco e Storage não participam de uma transação distribuída.

ZIP versão 1: validação de estrutura, referências, contadores e SHA-256 das imagens. Limites: 500 MB descompactados, 10.000 fotos por backup, 30 fotos por bem e 20 MB por imagem de entrada. O processamento utiliza memória. Guarde cópias externas regularmente; o backup não é criptografado.

## Estrutura e funcionamento

```text
src/domain/         entidades Zod e contratos
src/repositories/   local.ts (Dexie) e cloud.ts (Supabase)
src/services/       configuração, composição, backup, CSV e imagens
src/components/     autenticação, formulários, ficha, galeria e UI
src/pages/          inventário e configurações
supabase/migrations/ esquema e políticas versionados
tests/              integridade local, SQL, adaptador e navegador
```

A interface utiliza os mesmos contratos nos dois modos. Na nuvem, os comandos passam por RPCs: geração de códigos, contadores, histórico, transferências e vínculos de fotos acontecem no servidor. Clientes não recebem escrita direta nas tabelas. O comando privilegiado fica em schema privado, com `search_path` fixo e verificação explícita da conta e da ação. Leituras usam RLS e imagens usam download autenticado, sem URLs públicas.

A lista atualiza após as próprias operações, a cada 30 segundos enquanto visível e ao voltar à janela/conexão. Não existe fila offline nem atualização em tempo real. Edições desatualizadas são recusadas para evitar sobrescrever mudanças de outro dispositivo. O histórico guarda até 100 eventos relevantes recentes por bem. O catálogo carrega metadados; imagens são carregadas sob demanda.

## Testes

```powershell
npm test
npm run test:e2e
npm run test:e2e:cloud
npm run build
```

Os testes SQL usam PostgreSQL embarcado (PGlite) com schemas de Auth/Storage e papéis simulados. Os testes cloud de navegador usam o SDK real do Supabase com APIs interceptadas e credenciais fictícias, sem escrever no projeto real. No Windows, o Playwright utiliza Edge quando instalado; em outros ambientes instale Chromium com `npx playwright install chromium`.

GitHub Actions executa os testes de integridade e o build em Node 24. A câmera física, Safari/iOS, quota real do Storage e a integração ponta a ponta no Supabase hospedado dependem de validação no ambiente de destino.

Referências: [segurança do frontend Supabase](https://supabase.com/docs/guides/database/secure-data), [Storage privado](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Vite no Vercel](https://vercel.com/docs/frameworks/frontend/vite).
