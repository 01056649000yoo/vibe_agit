-- 전시 주소를 샘링크가 스스로 쓰는 방식 그대로 발급하고, 그 내역을 샘링크 프로그램에 주인까지 남긴다.
-- 샘링크 원본은 ~/URL/lib/slug.ts 의 ALPHABET(32자)·DEFAULT_SLUG_LENGTH(4)·충돌 시 6자다.
-- 주소를 아는 사람은 전시를 읽을 수 있다. 샘링크의 다른 주소와 같은 수준(4자)으로 맞춘 것은 사용자 결정이다.
BEGIN;
DROP FUNCTION IF EXISTS public.class_agit_samlink_slug_v1();
CREATE OR REPLACE FUNCTION public.class_agit_samlink_slug_v1(p_length INTEGER DEFAULT 4)
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path=public AS $$
 SELECT string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789',1+(get_byte(g.b,i)%32),1),'' ORDER BY i)
 FROM (SELECT extensions.gen_random_bytes(GREATEST(1,LEAST(30,p_length))) AS b) g,
      generate_series(0,GREATEST(1,LEAST(30,p_length))-1) AS i;
$$;
REVOKE ALL ON FUNCTION public.class_agit_samlink_slug_v1(INTEGER) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.class_agit_create_samlink_v1(p_class_id UUID,p_exhibition_id UUID,p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.class_agit_external_shares%ROWTYPE; slug TEXT; attempt INTEGER;
 -- 샘링크 앱 라우트와 겹치면 주소가 만들어져도 열리지 않는다(~/URL/lib/slug.ts RESERVED_SLUGS).
 reserved TEXT[]:=ARRAY['admin','api','b','present','expired','_next','assets','public','robots.txt','sitemap.xml','favicon.ico'];
BEGIN
 SELECT * INTO s FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR p_token !~ '^[a-f0-9]{64}$'
    OR s.token_hash IS DISTINCT FROM encode(extensions.digest(p_token,'sha256'),'hex') THEN RAISE EXCEPTION '공개 주소를 확인할 수 없습니다.' USING ERRCODE='22023'; END IF;
 FOR attempt IN 1..6 LOOP
  -- 샘링크와 같이 4자로 시작하고 거듭 부딪히면 6자로 늘린다.
  slug:=public.class_agit_samlink_slug_v1(CASE WHEN attempt<3 THEN 4 ELSE 6 END);
  CONTINUE WHEN slug=ANY(reserved);
  BEGIN
   -- created_by 는 샘링크의 서명된 기기 쿠키(device_<uuid>) 형식과 절대 겹치지 않는 표시자다.
   -- 어떤 브라우저도 이 주인으로 위장할 수 없고, 샘링크 관리 화면에서는 한 묶음으로 보인다.
   INSERT INTO samlink.short_links(slug,destination,expires_at,created_by,display_label)
   VALUES(slug,'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||p_token,s.expires_at,'agit-exhibition','아지트 글 전시관');
   UPDATE public.class_agit_external_shares SET samlink_slug=slug,shortened_at=clock_timestamp() WHERE class_id=p_class_id AND id=s.id;
   RETURN;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END LOOP;
 RAISE EXCEPTION '샘링크 주소를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' USING ERRCODE='PT503';
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_create_samlink_v1(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;

-- 이미 만든 주소도 샘링크에서 같은 주인으로 보이게 맞춘다. 주소 자체는 바꾸지 않는다.
UPDATE samlink.short_links SET created_by='agit-exhibition'
 WHERE display_label='아지트 글 전시관' AND created_by IS NULL;
INSERT INTO samlink.short_link_device_access(link_id,device_id)
 SELECT id,'agit-exhibition' FROM samlink.short_links WHERE created_by='agit-exhibition'
 ON CONFLICT DO NOTHING;
NOTIFY pgrst,'reload schema';
COMMIT;
