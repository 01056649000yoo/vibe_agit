-- 전시 주소만 8자로 올린다. 선생님이 평소 쓰는 샘링크 주소(4자)는 그대로 둔다.
-- 이유: 전체 교사 공개로 살아 있는 전시 주소가 한 개에서 수십 개로 늘면 4자(32^4=약 105만)는
-- 아무 주소나 찍어 닿을 확률이 2만 번에 한 번까지 올라간다. 샘링크 방문 경로에는 속도 제한이 없다.
-- 8자(32^8=약 1조 1천억)면 같은 조건에서 230억 번에 한 번이 된다. 주소는 복사·QR로 전하므로 길이 부담이 없다.
-- 알파벳은 샘링크 원본(~/URL/lib/slug.ts)과 계속 같이 쓴다. 이미 발급한 4자·10자·26자 주소도 그대로 열린다.
BEGIN;
CREATE OR REPLACE FUNCTION public.class_agit_create_samlink_v1(p_class_id UUID,p_exhibition_id UUID,p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.class_agit_external_shares%ROWTYPE; slug TEXT; attempt INTEGER;
 reserved TEXT[]:=ARRAY['admin','api','b','present','expired','_next','assets','public','robots.txt','sitemap.xml','favicon.ico'];
BEGIN
 SELECT * INTO s FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR p_token !~ '^[a-f0-9]{64}$'
    OR s.token_hash IS DISTINCT FROM encode(extensions.digest(p_token,'sha256'),'hex') THEN RAISE EXCEPTION '공개 주소를 확인할 수 없습니다.' USING ERRCODE='22023'; END IF;
 FOR attempt IN 1..6 LOOP
  slug:=public.class_agit_samlink_slug_v1(CASE WHEN attempt<3 THEN 8 ELSE 10 END);
  CONTINUE WHEN slug=ANY(reserved);
  BEGIN
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
NOTIFY pgrst,'reload schema';
COMMIT;
