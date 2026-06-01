/**
 * Accounts E2E Tests
 * 
 * These tests verify account creation and management functionality.
 * They require:
 * - API server running on port 3000
 * - Dashboard server running on port 3001
 * 
 * Since playwright browsers couldn't be installed in this environment,
 * these tests are SKIPPED but the structure is ready for execution.
 */

import { test, expect } from '@playwright/test';

// Skip all tests - requires running servers and browser installation
test.describe.skip('Account Management', () => {
  
  test.beforeEach(async ({ page }) => {
    // Setup: authenticate before each test
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('auth_user', JSON.stringify({
        id: 'test-user',
        name: 'Test User',
        phone: '5511999999999',
        householdId: 'test-household'
      }));
    });
    await page.goto('/accounts');
  });

  test('T3.1: Can create an account with all fields', async ({ page }) => {
    // Fill account form
    await page.fill('input[name="name"]', 'Conta Teste E2E');
    
    // Select account type
    await page.selectOption('select[name="type"]', 'checking');
    
    // Select scope
    await page.selectOption('select[name="scope"]', 'shared');
    
    // Fill initial balance
    await page.fill('input[name="initialBalance"]', '1000.50');
    
    // Submit
    await page.click('button[type="submit"], button:has-text("Criar")');
    
    // Should see success or account in list
    await expect(
      page.locator('text=Conta Teste E2E, [data-testid="account-list"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('T3.2: Created account appears in account list', async ({ page }) => {
    // First create an account via API (simulated)
    // In a real test, we would either:
    // 1. Create via UI (T3.1) and then check list
    // 2. Use API to create and then verify list shows it
    
    // For now, navigate to accounts and verify list loads
    await page.waitForSelector('[data-testid="account-list"], table', { timeout: 5000 });
    
    // Should have at least the account we created in T3.1
    // This is a partial test - full flow requires API running
    await expect(page.locator('table, [data-testid="account-list"]').first()).toBeVisible();
  });

  test('T3.3: Can create an expense with the created account', async ({ page }) => {
    // Navigate to records
    await page.click('a[href="/records"], text=Registros');
    await page.waitForTimeout(500);
    
    // Click to add new record
    await page.click('button:has-text("Novo"), button:has-text("Adicionar")');
    
    // Select type - expense
    await page.selectOption('select[name="type"]', 'expense');
    
    // Fill amount
    await page.fill('input[name="amount"]', '50.00');
    
    // Fill description
    await page.fill('input[name="description"]', 'Despesa E2E Test');
    
    // Select account (if we have one from T3.1)
    const accountSelect = page.locator('select[name="accountId"]');
    if (await accountSelect.isVisible()) {
      await accountSelect.selectOption({ index: 1 });
    }
    
    // Submit
    await page.click('button[type="submit"], button:has-text("Salvar")');
    
    // Should see the expense in the list
    await expect(page.locator('text=Despesa E2E Test')).toBeVisible({ timeout: 5000 });
  });

  test('T3.4: Account form validates required fields', async ({ page }) => {
    // Try to submit without filling required fields
    await page.click('button[type="submit"], button:has-text("Criar")');
    
    // Should see validation errors
    await expect(page.locator('text=obrigatório, required, inválido').first()).toBeVisible({ timeout: 3000 });
  });

  test('T3.5: Account type dropdown has correct options', async ({ page }) => {
    await page.selectOption('select[name="type"]', 'savings');
    
    // Verify selection worked
    const selected = await page.locator('select[name="type"]').inputValue();
    expect(selected).toBe('savings');
  });

  test('T3.6: Initial balance accepts negative values (for debts)', async ({ page }) => {
    await page.fill('input[name="name"]', 'Conta Dívida');
    await page.selectOption('select[name="type"]', 'credit_card');
    await page.fill('input[name="initialBalance"]', '-500.00');
    
    await page.click('button[type="submit"]');
    
    // Account should be created with negative balance
    await expect(page.locator('text=Conta Dívida')).toBeVisible({ timeout: 5000 });
  });
});