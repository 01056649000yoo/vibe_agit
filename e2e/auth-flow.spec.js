import { test, expect } from '@playwright/test';

test.describe('Student Authentication Flow', () => {
  test('should handle invalid student code gracefully', async ({ page }) => {
    // 1. 랜딩 페이지로 이동
    await page.goto('/');
    
    // 2. 제목 확인 (정상 로드 확인)
    await expect(page).toHaveTitle(/아지트/);
    
    // 3. 학생 로그인 모드로 진입
    await page.click('text=🎒 학생 로그인 (코드 입력)');
    
    // 4. 잘못된 학생 코드 입력 (8자리 필수)
    const inputLocator = page.locator('input[placeholder="ABC123XY"]');
    await expect(inputLocator).toBeVisible();
    await inputLocator.fill('INVALID1');
    
    // 5. 로그인 시도
    await page.click('text=아지트로 들어가기 🎉');
    
    // 6. 에러 메시지 확인 (서버 응답 대기 시간 포함)
    // 에러를 표시하는 p 태그 색상이나 일반적인 에러 텍스트 키워드 확인
    const errorMessage = page.locator('p').filter({ hasText: /코드|찾을 수|오류/ });
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
    
    // 7. 뒤로 가기 눌러 랜딩 페이지로 복귀
    await page.click('text=뒤로 가기');
    
    // 8. 선생님 로그인 버튼이 보이는지 확인 (복귀 성공)
    await expect(page.locator('text=선생님 구글 로그인')).toBeVisible();
  });
});
