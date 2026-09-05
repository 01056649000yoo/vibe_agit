-- 전시 단축주소를 실제로 짧게 만든다. 26자(144비트)는 샘링크의 보통 주소(4자)에 견줘 너무 길었다.
-- 주소를 아는 사람은 전시를 읽을 수 있으므로 사람이 고르는 낱말은 쓰지 않고 50비트 난수를 유지한다.
-- 헷갈리는 글자(i·l·o·u)를 뺀 32자만 써서 아이·학부모가 받아 적기 쉽게 한다.
BEGIN;
CREATE OR REPLACE FUNCTION public.class_agit_samlink_slug_v1()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path=public AS $$
 SELECT string_agg(substr('0123456789abcdefghjkmnpqrstvwxyz',1+(get_byte(g.b,i)%32),1),'' ORDER BY i)
 FROM (SELECT extensions.gen_random_bytes(10) AS b) g, generate_series(0,9) AS i;
$$;
REVOKE ALL ON FUNCTION public.class_agit_samlink_slug_v1() FROM PUBLIC,anon,authenticated,service_role;

-- 발행 경로와 가드는 61248 그대로다. slug 생성만 바꾼다.
CREATE OR REPLACE FUNCTION public.class_agit_create_samlink_v1(p_class_id UUID,p_exhibition_id UUID,p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.class_agit_external_shares%ROWTYPE; slug TEXT; attempt INTEGER;
BEGIN
 SELECT * INTO s FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR p_token !~ '^[a-f0-9]{64}$'
    OR s.token_hash IS DISTINCT FROM encode(extensions.digest(p_token,'sha256'),'hex') THEN RAISE EXCEPTION '공개 주소를 확인할 수 없습니다.' USING ERRCODE='22023'; END IF;
 FOR attempt IN 1..5 LOOP
  slug:=public.class_agit_samlink_slug_v1();
  BEGIN
   INSERT INTO samlink.short_links(slug,destination,expires_at,created_by,display_label)
   VALUES(slug,'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||p_token,s.expires_at,NULL,'아지트 글 전시관');
   UPDATE public.class_agit_external_shares SET samlink_slug=slug,shortened_at=clock_timestamp() WHERE class_id=p_class_id AND id=s.id;
   RETURN;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END LOOP;
 RAISE EXCEPTION '샘링크 주소를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' USING ERRCODE='PT503';
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_create_samlink_v1(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
