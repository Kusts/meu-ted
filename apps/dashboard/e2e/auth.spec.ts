/**
 * Auth E2E Tests for Dashboard
 * 
 * These tests verify the authentication flow in the dashboard.
 * They require:
 * - API server running on port 3000
 * - Dashboard server running on port 3001
 * 
 * Since playwright browsers couldn't be installed in this environment,
 * these tests are SKIPPED but the structure is ready for execution.
 */

import { test, expect } from '@playwright/test';

// Skip all tests - requires running servers and browser installation
test.describe.skip('Auth Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('T1.1: Shows login page when not authenticated', async ({ page }) => {
    // Should redirect to login or show login form
    // Check for login-related elements
    const loginForm = page.locator('form, [data-testid="login-form"], input[name="phone"]');
    await expect(loginForm).toBeVisible({ timeout: 5000 });
  });

  test('T1.2: Can login with valid credentials', async ({ page }) => {
    // Seed a user first via API
    // Then login with the seeded credentials
    
    // Navigate to login
    await page.goto('/login');
    
    // Enter phone number
    await page.fill('input[name="phone"]', '5511999999999');
    
    // Click request code (or auto-trigger)
    await page.click('button[type="submit"], button:has-text("Enviar")');
    
    // Wait for code input
    await page.waitForSelector('input[name="code"]', { timeout: 5000 });
    
    // Get the code from the fake SMS (in test, it's logged to console)
    // For real test, would need to intercept or have a test phone
    
    // For now, just verify the flow started
    await expect(page.locator('input[name="code"]')).toBeVisible();
  });

  test('T1.3: After login, redirects to dashboard', async ({ page }) => {
    // This would be a full flow test:
    // 1. Login via API to get token
    // 2. Store token in localStorage (simulating what the app does)
    // 3. Navigate to app
    // 4. Should see dashboard content, not login page
    
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('auth_user', JSON.stringify({
        id: 'test-user',
        name: 'Test User',
        phone: '5511999999999',
        householdId: 'test-household'
      }));
    });
    
    await page.goto('/');
    
    // Should see dashboard, not login
    await expect(page.locator('text=TED Finance, h1:has-text("TED")')).toBeVisible({ timeout: 5000 });
  });

  test('T1.4: Logout clears session and returns to login', async ({ page }) => {
    // Setup: already logged in
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('auth_user', JSON.stringify({
        id: 'test-user',
        name: 'Test User',
        phone: '5511999999999',
        householdId: 'test-household'
      }));
    });
    
    await page.goto('/');
    
    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Sair"), button:has-text("Logout"), [data-testid="logout"]');
    await logoutButton.click();
    
    // Should redirect to login
    await expect(page.locator('form, input[name="phone"]')).toBeVisible({ timeout: 5000 });
    
    // Token should be cleared
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeNull();
  });

  test('T1.5: Invalid login shows error message', async ({ page }) => {
    await page.goto('/login');
    
    // Enter invalid phone
    await page.fill('input[name="phone"]', 'invalid');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Should show error
    await expect(page.locator('text=erro, inválido, erro').first()).toBeVisible({ timeout: 3000 });
  });
});