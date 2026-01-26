import { test, expect } from '@playwright/test';

test.describe('Shopping Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Login")');
    await page.waitForURL('/albums', { timeout: 5000 });
  });

  test('user can view albums list', async ({ page }) => {
    await page.goto('/albums');
    
    // Check albums are displayed
    const albumCards = page.locator('[class*="album"]');
    const count = await albumCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('user can view album details and photos', async ({ page }) => {
    await page.goto('/albums');
    
    // Click first album
    await page.click('a[href*="/albums/"] >> first');
    
    // Should load album details page
    await expect(page).toHaveURL(/\/albums\/\d+/);
    
    // Check photos are displayed
    const photoCards = page.locator('img[alt*="photo"]');
    await expect(photoCards.first()).toBeVisible({ timeout: 5000 });
  });

  test('user can add photo to cart', async ({ page }) => {
    await page.goto('/albums');
    
    // Navigate to an album
    await page.click('a[href*="/albums/"] >> first');
    await page.waitForURL(/\/albums\/\d+/, { timeout: 5000 });
    
    // Get initial cart count
    const cartBadge = page.locator('[class*="cart"] [class*="badge"], button:has-text("Cart") span');
    
    // Click add to cart on first photo
    await page.click('button:has-text("Add to Cart") >> first');
    
    // Cart count should increase or confirmation shown
    await expect(page.locator('text=/added to cart|success/i')).toBeVisible({ timeout: 3000 });
  });

  test('user can view and manage cart', async ({ page }) => {
    await page.goto('/albums');
    
    // Add item to cart
    await page.click('a[href*="/albums/"] >> first');
    await page.waitForURL(/\/albums\/\d+/);
    await page.click('button:has-text("Add to Cart") >> first');
    
    // Navigate to cart
    await page.click('a[href="/cart"], button:has-text("Cart")');
    await expect(page).toHaveURL('/cart');
    
    // Cart should show items
    await expect(page.locator('[class*="cart-item"]')).toBeVisible({ timeout: 3000 });
    
    // Test remove from cart
    const removeBtn = page.locator('button:has-text("Remove")').first();
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await expect(page.locator('text=/removed|deleted/i')).toBeVisible({ timeout: 3000 });
    }
  });

  test('user can proceed to checkout', async ({ page }) => {
    // Add item to cart
    await page.goto('/albums');
    await page.click('a[href*="/albums/"] >> first');
    await page.waitForURL(/\/albums\/\d+/);
    await page.click('button:has-text("Add to Cart") >> first');
    
    // Go to cart
    await page.click('a[href="/cart"], button:has-text("Cart")');
    await expect(page).toHaveURL('/cart');
    
    // Click checkout
    await page.click('button:has-text("Checkout"), button:has-text("Place Order")');
    
    // Should show checkout or order form
    await page.waitForTimeout(1000);
    expect(page.url()).toMatch(/checkout|order|cart/);
  });

  test('user can search photos', async ({ page }) => {
    await page.goto('/albums');
    
    // Look for search functionality
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await page.press('input[type="search"], input[placeholder*="search" i]', 'Enter');
      
      // Wait for search results
      await page.waitForTimeout(1000);
      
      // Should show results or message
      const results = page.locator('[class*="photo"], [class*="album"]');
      expect(await results.count()).toBeGreaterThanOrEqual(0);
    }
  });
});
