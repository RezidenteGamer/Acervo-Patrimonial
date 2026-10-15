-- Acervo: one shared municipal inventory, restricted to explicitly approved accounts.
-- JSON keeps the domain contract stable; generated indexed columns enforce relational integrity.
create schema acervo_private;
revoke all on schema acervo_private from public, anon;
grant usage on schema acervo_private to authenticated;
grant usage on schema public to authenticated;

create table public.acervo_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor')),
  active boolean not null default true
);
alter table public.acervo_members enable row level security;
revoke all on public.acervo_members from public, anon, authenticated;
grant select on public.acervo_members to authenticated;
create policy acervo_member_self on public.acervo_members for select to authenticated
  using (user_id = (select auth.uid()));

create table public.acervo_departments (
  id text primary key,
  data jsonb not null,
  prefix text generated always as (data->>'prefixo') stored unique not null,
  check (coalesce(data->>'id' = id and prefix ~ '^[A-Z]{2,8}$',false)),
  check (coalesce(length(data->>'nome') between 1 and 500 and jsonb_typeof(data->'ativa') = 'boolean',false))
);
create table public.acervo_categories (
  id text primary key,
  data jsonb not null,
  check (coalesce(data->>'id' = id and length(btrim(data->>'nome')) between 1 and 500,false)),
  check (coalesce(data->>'perfil' in ('geral','veiculo','maquina','portatil') and jsonb_typeof(data->'ativa') = 'boolean',false))
);
create table public.acervo_assets (
  id uuid primary key,
  data jsonb not null,
  code text generated always as (data->>'codigoInterno') stored unique not null,
  department_id text generated always as (data->>'secretariaId') stored not null references public.acervo_departments(id),
  category_id text generated always as (nullif(data->>'categoriaId','')) stored references public.acervo_categories(id),
  updated_at text generated always as (data->>'atualizadoEm') stored not null,
  check (coalesce(data->>'id' = id::text and length(btrim(data->>'nome')) between 1 and 180,false)),
  check (length(code) <= 30 and code ~ '^[A-Z]{2,8}-[0-9]{6,}$'),
  check (coalesce((data->>'fotoCount')::int between 0 and 30,false)),
  check (coalesce(isfinite((data->>'criadoEm')::timestamptz) and isfinite(updated_at::timestamptz),false))
);
create index acervo_assets_department_idx on public.acervo_assets(department_id);
create index acervo_assets_category_idx on public.acervo_assets(category_id);
create index acervo_assets_updated_idx on public.acervo_assets(updated_at);
create table public.acervo_photos (
  id uuid primary key,
  asset_id uuid not null references public.acervo_assets(id),
  data jsonb not null,
  file_path text unique not null,
  thumb_path text unique not null,
  check (coalesce(data->>'id' = id::text and data->>'patrimonioId' = asset_id::text,false)),
  check (coalesce(length(data->>'descricao') <= 500 and jsonb_typeof(data->'principal') = 'boolean',false)),
  check (coalesce(isfinite((data->>'criadaEm')::timestamptz),false))
);
create index acervo_photos_asset_idx on public.acervo_photos(asset_id);
create table public.acervo_verifications (
  id uuid primary key,
  asset_id uuid not null references public.acervo_assets(id),
  data jsonb not null,
  check (coalesce(data->>'id' = id::text and data->>'patrimonioId' = asset_id::text,false)),
  check (coalesce(length(btrim(data->>'responsavel')) between 1 and 500 and length(data->>'observacao') <= 3000,false)),
  check (coalesce(to_char((data->>'data')::date,'YYYY-MM-DD') = data->>'data',false))
);
create index acervo_verifications_asset_idx on public.acervo_verifications(asset_id);
create table public.acervo_history (
  id uuid primary key,
  asset_id uuid not null references public.acervo_assets(id),
  actor_id uuid references auth.users(id) on delete set null,
  data jsonb not null,
  check (coalesce(data->>'id' = id::text and data->>'patrimonioId' = asset_id::text,false)),
  check (coalesce(data->>'tipoEvento' in ('criação','alteração','transferência','arquivamento','restauração','verificação','fotografia'),false)),
  check (coalesce(length(data->>'resumo') <= 5000 and isfinite((data->>'data')::timestamptz),false))
);
create index acervo_history_asset_idx on public.acervo_history(asset_id);
create index acervo_history_actor_idx on public.acervo_history(actor_id);
create table public.acervo_counters (prefixo text primary key, valor bigint not null check (valor between 0 and 9007199254740991));
create table public.acervo_state (id int primary key check (id = 1), revision bigint not null default 0);
insert into public.acervo_state(id) values(1);

do $$
declare t text;
begin
  foreach t in array array['acervo_departments','acervo_categories','acervo_assets','acervo_photos','acervo_verifications','acervo_history','acervo_counters','acervo_state'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy acervo_approved_read on public.%I for select to authenticated using (exists (select 1 from public.acervo_members m where m.user_id = (select auth.uid()) and m.active))',t);
  end loop;
end $$;

create function acervo_private.timestamp_text() returns text
language sql volatile set search_path = '' as $$
  select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;
create function acervo_private.draft(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb := '{}'::jsonb; k text; v text; n numeric;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Cadastro inválido.'; end if;
  foreach k in array array['nome','secretariaId','numeroPatrimonial','numeroSerie','categoriaId','fabricante','modelo','combustivel','placa','numeroFrota','chassi','conservacao','situacao','localizacao','responsavel','observacoes'] loop
    if p ? k and jsonb_typeof(p->k) not in ('string','null') then raise exception 'Campo de texto inválido: %',k; end if;
    v := coalesce(p->>k,'');
    if k = 'nome' then v := btrim(v); end if;
    if length(v) > (case when k = 'observacoes' then 10000 when k = 'nome' then 180 else 500 end) then raise exception 'Campo muito longo: %',k; end if;
    result := result || jsonb_build_object(k,v);
  end loop;
  if result->>'nome' = '' or result->>'secretariaId' = '' then raise exception 'Informe o nome e a secretaria.'; end if;
  foreach k in array array['anoFabricacao','quilometragem','horimetro'] loop
    if p ? k and p->k <> 'null'::jsonb then
      if jsonb_typeof(p->k) <> 'number' then raise exception 'Número inválido: %',k; end if;
      n := (p->>k)::numeric;
      if n < 0 or n > 9007199254740991 or (k = 'anoFabricacao' and (n < 1800 or n > 2200 or mod(n,1) <> 0)) then raise exception 'Número fora dos limites: %',k; end if;
      result := result || jsonb_build_object(k,n);
    end if;
  end loop;
  return result;
end $$;
create function acervo_private.event(p_id uuid,p_kind text,p_summary text) returns void
language plpgsql set search_path = '' as $$
declare event_id uuid := gen_random_uuid();
begin
  insert into public.acervo_history(id,asset_id,actor_id,data) values(event_id,p_id,auth.uid(),jsonb_build_object('id',event_id,'patrimonioId',p_id,'tipoEvento',p_kind,'resumo',left(p_summary,5000),'data',acervo_private.timestamp_text(),'actorId',auth.uid()));
  delete from public.acervo_history where id in (select id from public.acervo_history where asset_id=p_id order by data->>'data' desc,id desc offset 100);
end $$;
create function acervo_private.refresh_photos(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare total int; main_id uuid;
begin
  select count(*) into total from public.acervo_photos where asset_id=p_id;
  if total > 30 then raise exception 'Limite de 30 fotografias por patrimônio.'; end if;
  select id into main_id from public.acervo_photos where asset_id=p_id order by (data->>'principal')::boolean desc,data->>'criadaEm',id limit 1;
  update public.acervo_photos set data=jsonb_set(data,'{principal}',to_jsonb(id=main_id)) where asset_id=p_id;
  update public.acervo_assets set data=(data-'fotoPrincipalId') || jsonb_build_object('fotoCount',total,'atualizadoEm',acervo_private.timestamp_text()) || case when main_id is null then '{}'::jsonb else jsonb_build_object('fotoPrincipalId',main_id) end where id=p_id;
end $$;

-- Deliberately privileged command boundary: direct table writes are revoked.
-- Every action checks the authenticated account against the server-managed allowlist.
create function acervo_private.command(action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); member_role text; id_value uuid; previous jsonb; result jsonb := '{}'::jsonb;
  item jsonb; draft_value jsonb; timestamp_value text := acervo_private.timestamp_text(); prefix_value text; next_value bigint;
  photo_row public.acervo_photos%rowtype; row_value jsonb; expected_count int; main_id text; revision_value bigint;
begin
  if uid is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select role into member_role from public.acervo_members where user_id=uid and active;
  if member_role is null then raise exception 'Conta sem acesso autorizado ao Acervo.' using errcode='42501'; end if;
  select revision into revision_value from public.acervo_state where id=1 for update;
  if action in ('create','update','archive','verify','photo_add') then id_value := (payload->>'id')::uuid; end if;
  if action in ('update','archive','verify','photo_add') then
    select data into previous from public.acervo_assets where id=id_value for update;
    if previous is null then raise exception 'Patrimônio não encontrado.'; end if;
  end if;

  if action in ('create','update') then
    draft_value := acervo_private.draft(payload->'draft');
    if not exists(select 1 from public.acervo_departments where id=draft_value->>'secretariaId' and (data->>'ativa')::boolean) then raise exception 'Selecione uma secretaria ativa.'; end if;
    if action='create' then
      select data into result from public.acervo_assets where id=id_value;
      if result is not null then return result; end if;
      select prefix into prefix_value from public.acervo_departments where id=draft_value->>'secretariaId';
      insert into public.acervo_counters(prefixo,valor) values(prefix_value,1) on conflict(prefixo) do update set valor=public.acervo_counters.valor+1 returning valor into next_value;
      result := draft_value || jsonb_build_object('id',id_value,'codigoInterno',prefix_value||'-'||lpad(next_value::text,greatest(6,length(next_value::text)),'0'),'criadoEm',timestamp_value,'atualizadoEm',timestamp_value,'fotoCount',0);
      insert into public.acervo_assets(id,data) values(id_value,result);
      perform acervo_private.event(id_value,'criação','Patrimônio cadastrado.');
    else
      if payload->>'expectedUpdatedAt' is not null and payload->>'expectedUpdatedAt' <> previous->>'atualizadoEm' then raise exception 'Este patrimônio foi alterado em outro dispositivo. Reabra a ficha antes de salvar.'; end if;
      result := previous - array['anoFabricacao','quilometragem','horimetro'];
      result := result || draft_value || jsonb_build_object('atualizadoEm',timestamp_value);
      update public.acervo_assets set data=result where id=id_value;
      if previous->>'secretariaId' <> result->>'secretariaId' then
        perform acervo_private.event(id_value,'transferência',(select data->>'nome' from public.acervo_departments where id=previous->>'secretariaId')||' → '||(select data->>'nome' from public.acervo_departments where id=result->>'secretariaId')||'. Código interno preservado.');
      end if;
      perform acervo_private.event(id_value,'alteração','Campos alterados: '||(select coalesce(string_agg(key,', '),'nenhum') from jsonb_each(draft_value) where value is distinct from previous->key));
    end if;
  elsif action='archive' then
    if jsonb_typeof(payload->'archived') is distinct from 'boolean' then raise exception 'Situação de arquivamento inválida.'; end if;
    result := (previous-'arquivadoEm') || jsonb_build_object('atualizadoEm',timestamp_value);
    if (payload->>'archived')::boolean then result := result || jsonb_build_object('arquivadoEm',timestamp_value); end if;
    update public.acervo_assets set data=result where id=id_value;
    perform acervo_private.event(id_value,case when (payload->>'archived')::boolean then 'arquivamento' else 'restauração' end,'Situação de arquivamento atualizada.');
  elsif action='category' then
    item := payload->'category';
    if jsonb_typeof(item) is distinct from 'object' or nullif(item->>'id','') is null or nullif(btrim(item->>'nome'),'') is null or length(item->>'nome') > 500 or item->>'perfil' is null or item->>'perfil' not in ('geral','veiculo','maquina','portatil') or jsonb_typeof(item->'ativa') is distinct from 'boolean' then raise exception 'Categoria inválida.'; end if;
    insert into public.acervo_categories(id,data) values(item->>'id',item) on conflict(id) do update set data=excluded.data;
  elsif action='verify' then
    item := payload->'verification';
    if jsonb_typeof(item->'data') is distinct from 'string' or jsonb_typeof(item->'responsavel') is distinct from 'string' then raise exception 'Informe a data e o responsável.'; end if;
    if (item->>'data')::date > (clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'A verificação não pode estar no futuro.'; end if;
    item := jsonb_build_object('id',gen_random_uuid(),'patrimonioId',id_value,'data',item->>'data','responsavel',btrim(item->>'responsavel'),'observacao',coalesce(item->>'observacao',''));
    insert into public.acervo_verifications(id,asset_id,data) values((item->>'id')::uuid,id_value,item);
    update public.acervo_assets set data=data || jsonb_build_object('verificadoEm',greatest(coalesce(data->>'verificadoEm',''),item->>'data'),'atualizadoEm',timestamp_value) where id=id_value;
    perform acervo_private.event(id_value,'verificação','Existência física verificada em '||(item->>'data')||' por '||(item->>'responsavel')||'.');
  elsif action='photo_add' then
    if jsonb_typeof(payload->'photos') is distinct from 'array' or jsonb_array_length(payload->'photos') not between 1 and 30 then raise exception 'Lote de fotografias inválido.'; end if;
    for item in select value from jsonb_array_elements(payload->'photos') loop
      if split_part(item->>'filePath','/',1) <> uid::text or split_part(item->>'thumbPath','/',1) <> uid::text then raise exception 'Caminho de fotografia inválido.'; end if;
      if not exists(select 1 from storage.objects where bucket_id='acervo-photos' and name=item->>'filePath') or not exists(select 1 from storage.objects where bucket_id='acervo-photos' and name=item->>'thumbPath') then raise exception 'Upload de fotografia incompleto.'; end if;
      row_value := jsonb_build_object('id',item->>'id','patrimonioId',id_value,'descricao',coalesce(item->>'descricao',''),'principal',false,'criadaEm',timestamp_value);
      insert into public.acervo_photos(id,asset_id,data,file_path,thumb_path) values((item->>'id')::uuid,id_value,row_value,item->>'filePath',item->>'thumbPath');
    end loop;
    perform acervo_private.refresh_photos(id_value);
    perform acervo_private.event(id_value,'fotografia','Fotografias adicionadas.');
  elsif action in ('photo_remove','photo_primary','photo_describe') then
    select * into photo_row from public.acervo_photos where id=(payload->>'id')::uuid;
    if photo_row.id is null then raise exception 'Fotografia não encontrada.'; end if;
    id_value := photo_row.asset_id;
    if action='photo_remove' then delete from public.acervo_photos where id=photo_row.id;
    elsif action='photo_primary' then update public.acervo_photos set data=jsonb_set(data,'{principal}',to_jsonb(id=photo_row.id)) where asset_id=id_value;
    else
      if length(payload->>'description') > 500 or payload->>'description' is null then raise exception 'Descrição inválida.'; end if;
      update public.acervo_photos set data=jsonb_set(data,'{descricao}',to_jsonb(payload->>'description')) where id=photo_row.id;
    end if;
    perform acervo_private.refresh_photos(id_value);
    perform acervo_private.event(id_value,'fotografia',case action when 'photo_remove' then 'Fotografia removida.' when 'photo_primary' then 'Fotografia principal alterada.' else 'Descrição de fotografia alterada.' end);
  elsif action='restore' then
    if member_role <> 'admin' then raise exception 'Somente administradores podem restaurar a base compartilhada.' using errcode='42501'; end if;
    if coalesce((payload->>'requireEmpty')::boolean,false) and exists(select 1 from public.acervo_assets) then raise exception 'A migração local exige uma base em nuvem vazia. Exporte um backup e revise os conflitos.'; end if;
    if (payload->>'expectedRevision')::bigint is distinct from revision_value then raise exception 'A base mudou durante a preparação. Atualize e confirme novamente a restauração.'; end if;
    if (select count(*) from jsonb_object_keys(payload->'snapshot')) <> 7 then raise exception 'Estrutura de backup inválida.'; end if;
    foreach prefix_value in array array['assets','departments','categories','photos','verifications','history','counters'] loop
      if jsonb_typeof(payload->'snapshot'->prefix_value) is distinct from 'array' then raise exception 'Seção de backup ausente: %',prefix_value; end if;
    end loop;
    if jsonb_array_length(payload->'snapshot'->'assets') > 100000 or jsonb_array_length(payload->'snapshot'->'photos') > 10000 then raise exception 'Backup excede os limites.'; end if;
    if jsonb_array_length(payload->'snapshot'->'departments')=0 or jsonb_array_length(payload->'snapshot'->'categories')=0 then raise exception 'Backup sem secretarias ou categorias.'; end if;
    delete from public.acervo_photos; delete from public.acervo_verifications; delete from public.acervo_history; delete from public.acervo_assets; delete from public.acervo_categories; delete from public.acervo_departments;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'departments') loop insert into public.acervo_departments(id,data) values(item->>'id',item); end loop;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'categories') loop insert into public.acervo_categories(id,data) values(item->>'id',item); end loop;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'assets') loop
      row_value := acervo_private.draft(item) || (item - array['nome','secretariaId','numeroPatrimonial','numeroSerie','categoriaId','fabricante','modelo','combustivel','placa','numeroFrota','chassi','conservacao','situacao','localizacao','responsavel','observacoes','anoFabricacao','quilometragem','horimetro']);
      insert into public.acervo_assets(id,data) values((item->>'id')::uuid,row_value);
    end loop;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'photos') loop
      if split_part(item->>'filePath','/',1) <> uid::text or split_part(item->>'thumbPath','/',1) <> uid::text then raise exception 'Caminho de fotografia inválido.'; end if;
      if not exists(select 1 from storage.objects where bucket_id='acervo-photos' and name=item->>'filePath') or not exists(select 1 from storage.objects where bucket_id='acervo-photos' and name=item->>'thumbPath') then raise exception 'Imagem ausente no Storage.'; end if;
      insert into public.acervo_photos(id,asset_id,data,file_path,thumb_path) values((item->>'id')::uuid,(item->>'patrimonioId')::uuid,item-array['filePath','thumbPath'],item->>'filePath',item->>'thumbPath');
    end loop;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'verifications') loop insert into public.acervo_verifications(id,asset_id,data) values((item->>'id')::uuid,(item->>'patrimonioId')::uuid,item); end loop;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'history') loop insert into public.acervo_history(id,asset_id,data) values((item->>'id')::uuid,(item->>'patrimonioId')::uuid,item); end loop;
    for item in select value from jsonb_array_elements(payload->'snapshot'->'counters') loop
      insert into public.acervo_counters(prefixo,valor) values(item->>'prefixo',(item->>'valor')::bigint) on conflict(prefixo) do update set valor=greatest(public.acervo_counters.valor,excluded.valor);
    end loop;
    for id_value,row_value in select id,data from public.acervo_assets loop
      select count(*),max(data->>'id') filter(where (data->>'principal')::boolean) into expected_count,main_id from public.acervo_photos where asset_id=id_value;
      if expected_count <> (row_value->>'fotoCount')::int or (select count(*) from public.acervo_photos where asset_id=id_value and (data->>'principal')::boolean) <> (case when expected_count > 0 then 1 else 0 end) or main_id is distinct from row_value->>'fotoPrincipalId' then raise exception 'Vínculos de fotografias inconsistentes.'; end if;
      if row_value->>'verificadoEm' is distinct from (select max(data->>'data') from public.acervo_verifications where asset_id=id_value) then raise exception 'Verificação inconsistente.'; end if;
      prefix_value := split_part(row_value->>'codigoInterno','-',1); next_value := split_part(row_value->>'codigoInterno','-',2)::bigint;
      if not exists(select 1 from public.acervo_counters where prefixo=prefix_value and valor>=next_value) then raise exception 'Contadores inconsistentes.'; end if;
      perform acervo_private.event(id_value,'restauração','Base compartilhada restaurada de backup por administrador.');
    end loop;
  else raise exception 'Operação desconhecida.';
  end if;
  update public.acervo_state set revision=revision+1 where id=1;
  return coalesce(result,'{}'::jsonb);
end $$;

create function public.acervo_command(action text,payload jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select acervo_private.command(action,payload); $$;
create function public.acervo_access() returns text
language sql stable security invoker set search_path = '' as $$ select role from public.acervo_members where user_id=(select auth.uid()) and active; $$;
create function public.acervo_read(scope text,asset_id uuid default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.acervo_members where user_id=(select auth.uid()) and active) then raise exception 'Conta sem acesso autorizado ao Acervo.' using errcode='42501'; end if;
  if scope='catalog' then
    select jsonb_build_object('assets',coalesce((select jsonb_agg(data order by id) from public.acervo_assets),'[]'::jsonb),'departments',coalesce((select jsonb_agg(data order by id) from public.acervo_departments),'[]'::jsonb),'categories',coalesce((select jsonb_agg(data order by id) from public.acervo_categories),'[]'::jsonb),'revision',(select revision from public.acervo_state where id=1)) into result;
  elsif scope='detail' then
    select jsonb_build_object('asset',data,'photos',coalesce((select jsonb_agg(p.data order by p.data->>'criadaEm',p.id) from public.acervo_photos p where p.asset_id=a.id),'[]'::jsonb),'verifications',coalesce((select jsonb_agg(v.data order by v.data->>'data' desc,v.id) from public.acervo_verifications v where v.asset_id=a.id),'[]'::jsonb),'history',coalesce((select jsonb_agg(h.data order by h.data->>'data' desc,h.id desc) from public.acervo_history h where h.asset_id=a.id),'[]'::jsonb)) into result from public.acervo_assets a where a.id=acervo_read.asset_id;
  elsif scope='snapshot' then
    select jsonb_build_object('assets',coalesce((select jsonb_agg(data) from public.acervo_assets),'[]'::jsonb),'departments',coalesce((select jsonb_agg(data) from public.acervo_departments),'[]'::jsonb),'categories',coalesce((select jsonb_agg(data) from public.acervo_categories),'[]'::jsonb),'photos',coalesce((select jsonb_agg(data || jsonb_build_object('filePath',file_path,'thumbPath',thumb_path)) from public.acervo_photos),'[]'::jsonb),'verifications',coalesce((select jsonb_agg(data) from public.acervo_verifications),'[]'::jsonb),'history',coalesce((select jsonb_agg(data) from public.acervo_history),'[]'::jsonb),'counters',coalesce((select jsonb_agg(jsonb_build_object('prefixo',prefixo,'valor',valor)) from public.acervo_counters),'[]'::jsonb),'revision',(select revision from public.acervo_state where id=1)) into result;
  else raise exception 'Consulta desconhecida.'; end if;
  return result;
end $$;
revoke all on all functions in schema acervo_private from public, anon, authenticated;
grant execute on function acervo_private.command(text,jsonb) to authenticated;
revoke all on function public.acervo_command(text,jsonb),public.acervo_access(),public.acervo_read(text,uuid) from public,anon;
grant execute on function public.acervo_command(text,jsonb),public.acervo_access(),public.acervo_read(text,uuid) to authenticated;

insert into public.acervo_departments(id,data) values
('urbanismo','{"id":"urbanismo","nome":"Urbanismo","prefixo":"URB","ativa":true}'),
('interior','{"id":"interior","nome":"Interior","prefixo":"INT","ativa":true}');
insert into public.acervo_categories(id,data)
select item->>'id',item from jsonb_array_elements('[
{"id":"veiculos","nome":"Veículos leves e utilitários","ativa":true,"perfil":"veiculo"},
{"id":"caminhoes","nome":"Caminhões","ativa":true,"perfil":"veiculo"},
{"id":"maquinas","nome":"Máquinas pesadas","ativa":true,"perfil":"maquina"},
{"id":"rocadeiras","nome":"Roçadeiras e sopradores","ativa":true,"perfil":"portatil"},
{"id":"ferramentas","nome":"Ferramentas","ativa":true,"perfil":"geral"},
{"id":"eletricos","nome":"Equipamentos elétricos","ativa":true,"perfil":"geral"},
{"id":"informatica","nome":"Informática e eletrônicos","ativa":true,"perfil":"geral"},
{"id":"mobiliario","nome":"Mobiliário","ativa":true,"perfil":"geral"},
{"id":"outros","nome":"Outros","ativa":true,"perfil":"geral"}]'::jsonb) item;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('acervo-photos','acervo-photos',false,20971520,array['image/jpeg','image/png','image/webp']);
create policy acervo_photo_read on storage.objects for select to authenticated using (
  bucket_id='acervo-photos' and exists(select 1 from public.acervo_members where user_id=(select auth.uid()) and active)
);
create policy acervo_photo_insert on storage.objects for insert to authenticated with check (
  bucket_id='acervo-photos' and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.acervo_members where user_id=(select auth.uid()) and active)
);
-- Referenced files cannot be deleted directly, even by a member. Remove metadata through RPC first.
create policy acervo_photo_delete_orphan on storage.objects for delete to authenticated using (
  bucket_id='acervo-photos'
  and exists(select 1 from public.acervo_members where user_id=(select auth.uid()) and active)
  and not exists(select 1 from public.acervo_photos where file_path=name or thumb_path=name)
);
