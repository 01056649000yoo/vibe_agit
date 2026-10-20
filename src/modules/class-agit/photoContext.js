import { createContext } from 'react';

/**
 * 보고서 사진을 찾는 방법을 읽는 화면에 **주입**한다(2026-10-20).
 * 값은 `(사진ID 목록) => Promise<Map(사진ID → { url, width, height })>`. 로그인된 화면(교사·학생 입구)만 `api/photoApi.js` 의
 * `resolvePhotoUrls` 를 넣어 준다. 값이 없으면(외부 공개 화면 포함) 사진 자리를 비우고 글만 보인다.
 * 읽는 화면(`WorkBlocks`)이 DB 클라이언트를 직접 가져오면 로그인 없는 공개 진입점의 import 경로에 섞이므로 이렇게 나눈다.
 */
export const PhotoResolverContext = createContext(null);
