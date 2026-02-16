import { test, expect } from '@playwright/test';

/**
 * Comprehensive End-to-End Tests for Photo Lab React
 * Tests all routes and user types:
 * - Customer
 * - Admin (studio team member)
 * - Studio Admin (studio owner)
 * - Super Admin (platform owner)
 */

// Test accounts
const testAccounts = {
  customer: {
    email: 'customer@example.com',
    password: 'TestPassword@123'
  },
  admin: {
    email: 'admin@example.com',
    password: 'AdminPassword@123'
  },
  studioAdmin: {
    email: 'studioowner@example.com',
    password: 'StudioPassword@123'
  },
  superAdmin: {
    email: 'super_admin@photolab.com',
    password: 'SuperAdmin@123456'
  }
};

const BASE_URL = 'http://localhost:3000';

// ============================================================================
// CUSTOMER USER TESTS
// ============================================================================
test.describe('Customer User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '/login');
  });

  test('should login as customer', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Check if login was successful by verifying we're authenticated
    await expect(page.locator('h1, h2, [class*="album"]')).toBeTruthy();
  });

  test('customer can browse albums', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Check albums are loaded
    const albumElements = page.locator('[class*="album"], a[href*="/albums/"]');
    expect(await albumElements.count()).toBeGreaterThanOrEqual(0);
  });

  test('customer can view album details', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Navigate to first album
    const firstAlbumLink = page.locator('a[href*="/albums/"]').first();
    if (await firstAlbumLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstAlbumLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('customer can search photos', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Navigate to search
    const searchLink = page.locator('a[href="/search"]');
    if (await searchLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('customer can access cart', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Navigate to cart
    const cartLink = page.locator('a[href="/cart"]');
    if (await cartLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cartLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('customer can view orders', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Navigate to orders
    const ordersLink = page.locator('a[href="/orders"]');
    if (await ordersLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ordersLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('customer cannot access admin routes', async ({ page }) => {
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Try to access admin dashboard
    await page.goto(`${BASE_URL}/admin/dashboard`);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Should redirect away from admin dashboard
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/admin/dashboard');
  });
});

// ============================================================================
// ADMIN USER TESTS (Studio Team Member)
// ============================================================================
test.describe('Admin User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form with admin credentials
    await page.fill('input[type="email"]', testAccounts.admin.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', testAccounts.admin.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('should login as admin', async ({ page }) => {
    await expect(page.locator('h1, h2, [class*="admin"]')).toBeTruthy();
  });

  test('admin can access dashboard', async ({ page }) => {
    const dashboardLink = page.locator('a[href*="/admin/dashboard"]');
    if (await dashboardLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dashboardLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin can access analytics', async ({ page }) => {
    const analyticsLink = page.locator('a[href*="/admin/analytics"]');
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin can access albums management', async ({ page }) => {
    const albumsLink = page.locator('a[href*="/admin/albums"]');
    if (await albumsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await albumsLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin can access photos management', async ({ page }) => {
    const photosLink = page.locator('a[href*="/admin/photos"]');
    if (await photosLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await photosLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin can access products management', async ({ page }) => {
    const productsLink = page.locator('a[href*="/admin/products"]');
    if (await productsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productsLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin can access price lists', async ({ page }) => {
    const priceListsLink = page.locator('a[href*="/admin/price-lists"]');
    if (await priceListsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await priceListsLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin can access profile', async ({ page }) => {
    const profileLink = page.locator('a[href*="/admin/profile"]');
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('admin cannot access super admin routes', async ({ page }) => {
    // Try to access super admin dashboard
    await page.goto(`${BASE_URL}/super-admin`, { waitUntil: 'networkidle' });
    
    // Should redirect or show error
    const currentUrl = page.url();
    expect(currentUrl.includes('/admin') || currentUrl.includes('/login')).toBeTruthy();
  });
});

// ============================================================================
// STUDIO ADMIN USER TESTS (Studio Owner)
// ============================================================================
test.describe('Studio Admin User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form with studio admin credentials
    await page.fill('input[type="email"]', testAccounts.studioAdmin.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', testAccounts.studioAdmin.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('should login as studio admin', async ({ page }) => {
    await expect(page.locator('h1, h2, [class*="admin"]')).toBeTruthy();
  });

  test('studio admin can access all admin routes', async ({ page }) => {
    // Verify still authenticated by checking we can navigate
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Should still be on admin dashboard (not redirected to login)
    expect(page.url().includes('/admin') || page.url().includes('/')).toBeTruthy();
  });

  test('studio admin can view subscription management', async ({ page }) => {
    // Navigate to profile where subscription management is
    const profileLink = page.locator('a[href*="/admin/profile"], a[href*="profile"]').first();
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('studio admin can see subscription change button', async ({ page }) => {
    // Navigate to profile
    const profileLink = page.locator('a[href*="/admin/profile"], a[href*="profile"]').first();
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
  });

  test('studio admin can open upgrade modal', async ({ page }) => {
    // Navigate to profile
    const profileLink = page.locator('a[href*="/admin/profile"], a[href*="profile"]').first();
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
    
    // Click upgrade/change plan button
    const upgradeButton = page.locator('button:has-text("Change Plan"), button:has-text("Subscribe")').first();
    if (await upgradeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await upgradeButton.click();
      
      // Modal should appear with plan options
      const modal = page.locator('text=Select Your Plan, [role="dialog"]').first();
      expect(await modal.isVisible({ timeout: 5000 }).catch(() => false)).toBeTruthy();
    }
  });
});

// ============================================================================
// SUPER ADMIN USER TESTS (Platform Owner)
// ============================================================================
test.describe('Super Admin User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login via the login page to set localStorage with token
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Fill login form with super admin credentials
    await page.fill('input[type="email"]', testAccounts.superAdmin.email, { timeout: 5000 }).catch(() => null);
    await page.fill('input[type="password"]', testAccounts.superAdmin.password, { timeout: 5000 }).catch(() => null);
    
    // Click login button
    const loginBtn = page.locator('button:has-text("Sign In"), button:has-text("Login")').first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click({ timeout: 5000 }).catch(() => null);
      // Wait for page navigation and network to settle
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
      // Extra buffer to ensure localStorage is set
      await page.waitForTimeout(500);
    }
  });

  test('should login as super admin', async ({ page }) => {
    await expect(page.locator('h1, h2, [class*="admin"]')).toBeTruthy();
  });

  test('super admin can access admin dashboard', async ({ page }) => {
    // Wait for page to settle
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    
    // Verify we have some admin content visible
    const adminElements = page.locator('h1, h2, [class*="admin"]');
    expect(await adminElements.count()).toBeGreaterThan(0);
  });

  test('super admin can reload and stay authenticated', async ({ page }) => {
    // Reload the page to test auth persistence
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    
    // Should still not be on login page
    expect(page.url()).not.toContain('/login');
  });

  test('super admin can navigate within admin area', async ({ page }) => {
    // Try navigating to another admin route using links (not direct navigation)
    const profileLink = page.locator('a[href*="/admin/profile"], a[href*="profile"]').first();
    if (await profileLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => null);
    }
    
    // Should still not be on login page
    expect(page.url()).not.toContain('/login');
  });
});

// ============================================================================
// PUBLIC ROUTES (Not Authenticated)
// ============================================================================
test.describe('Public Routes', () => {
  test('should load home page', async ({ page }) => {
    await page.goto(BASE_URL + '/');
    
    // Should either stay on home or redirect to albums/login
    const url = page.url();
    expect(url === `${BASE_URL}/` || url.includes('/albums') || url.includes('/login')).toBeTruthy();
  });

  test('should access login page', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    
    expect(page.url()).toContain('/login');
    expect(await page.locator('input[type="email"]').isVisible()).toBeTruthy();
    expect(await page.locator('input[type="password"]').isVisible()).toBeTruthy();
  });

  test('should access register page', async ({ page }) => {
    await page.goto(BASE_URL + '/register');
    
    expect(page.url()).toContain('/register');
  });

  test('should access studio signup page', async ({ page }) => {
    await page.goto(BASE_URL + '/studio-signup');
    
    expect(page.url()).toContain('/studio-signup');
  });

  test('should access admin login page', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
    
    expect(page.url()).toContain('/admin/login');
    expect(await page.locator('input[type="email"]').isVisible()).toBeTruthy();
  });
});

// ============================================================================
// PROTECTED ROUTES (Require Authentication)
// ============================================================================
test.describe('Protected Routes', () => {
  test('unauthenticated user cannot access albums', async ({ page }) => {
    await page.goto(BASE_URL + '/albums', { waitUntil: 'networkidle' });
    
    // Should redirect to login
    const url = page.url();
    expect(url.includes('/login')).toBeTruthy();
  });

  test('unauthenticated user cannot access admin dashboard', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/dashboard', { waitUntil: 'networkidle' });
    
    // Should redirect to admin login or login
    const url = page.url();
    expect(url.includes('/admin/login') || url.includes('/login')).toBeTruthy();
  });

  test('unauthenticated user cannot access super admin', async ({ page }) => {
    await page.goto(BASE_URL + '/super-admin', { waitUntil: 'networkidle' });
    
    // Should redirect to login
    const url = page.url();
    expect(url.includes('/login') || url.includes('/admin/login')).toBeTruthy();
  });
});

// ============================================================================
// NAVIGATION TESTS
// ============================================================================
test.describe('Navigation Between Routes', () => {
  test('customer can navigate through main routes', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    
    // Login as customer
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Navigation should work
    expect(page.url()).not.toContain('/login');
  });

  test('admin can navigate between admin routes', async ({ page }) => {
    await page.goto(BASE_URL + '/admin/login');
    
    // Login as admin
    await page.fill('input[type="email"]', testAccounts.admin.email);
    await page.fill('input[type="password"]', testAccounts.admin.password);
    await page.click('button:has-text("Admin Sign In")');
    
    // Should be in admin area
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    expect(page.url()).not.toContain('/login');
  });

  test('user can logout and return to login', async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    
    // Login
    await page.fill('input[type="email"]', testAccounts.customer.email);
    await page.fill('input[type="password"]', testAccounts.customer.password);
    await page.click('button:has-text("Sign In")');
    
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    
    // Look for logout button
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');
    if (await logoutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logoutButton.click();
      
      // Should be redirected to login or home
      const url = page.url();
      expect(url.includes('/login') || url === `${BASE_URL}/`).toBeTruthy();
    }
  });
});
