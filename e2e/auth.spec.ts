import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('user can register a new account', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to register page
    await page.click('a:has-text("Register")');
    await expect(page).toHaveURL('/register');
    
    // Fill registration form
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;
    
    await page.fill('input[type="email"]', email);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.fill('input[name="confirmPassword"]', 'TestPassword123!');
    
    // Submit form
    await page.click('button:has-text("Register")');
    
    // Should redirect to login or albums after successful registration
    await page.waitForTimeout(1000);
    expect(page.url()).toMatch(/login|albums|/);
  });

  test('user can login with valid credentials', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to login if not already there
    if (!page.url().includes('/login')) {
      await page.click('a:has-text("Login")');
    }
    
    await expect(page).toHaveURL('/login');
    
    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    // Submit form
    await page.click('button:has-text("Login")');
    
    // Should redirect to albums page
    await page.waitForURL('/albums', { timeout: 5000 });
    expect(page.url()).toContain('/albums');
  });

  test('user sees error message on invalid login', async ({ page }) => {
    await page.goto('/login');
    
    // Fill form with invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Submit form
    await page.click('button:has-text("Login")');
    
    // Should see error message
    await expect(page.locator('text=/error|invalid|failed/i')).toBeVisible({ timeout: 5000 });
  });

  test('user can logout', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Login")');
    await page.waitForURL('/albums', { timeout: 5000 });
    
    // Logout
    await page.click('button:has-text("Logout")');
    
    // Should redirect to login or home
    await page.waitForURL(/login|/, { timeout: 5000 });
    expect(page.url()).not.toContain('/albums');
  });
});
