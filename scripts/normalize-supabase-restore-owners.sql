-- pg_dump/pg_restore --no-owner recreates internal service tables as the restore role.
-- Auth and Storage must own their schema objects before their newer images can run migrations.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'auth'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO supabase_auth_admin', item.schemaname, item.tablename);
  END LOOP;

  FOR item IN
    SELECT sequence_schema, sequence_name FROM information_schema.sequences WHERE sequence_schema = 'auth'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO supabase_auth_admin', item.sequence_schema, item.sequence_name);
  END LOOP;

  FOR item IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', item.signature);
  END LOOP;

  FOR item IN
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'storage'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO supabase_storage_admin', item.schemaname, item.tablename);
  END LOOP;

  FOR item IN
    SELECT sequence_schema, sequence_name FROM information_schema.sequences WHERE sequence_schema = 'storage'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO supabase_storage_admin', item.sequence_schema, item.sequence_name);
  END LOOP;

  FOR item IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'storage'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_storage_admin', item.signature);
  END LOOP;
END
$$;
