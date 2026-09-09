import { expect, test } from '@playwright/test'

test('opens the workbench and switches to the visual chain composer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '一眼看清，稳稳运行。' })).toBeVisible()
  await page.getByRole('button', { name: '转发链', exact: true }).click()
  await expect(page.getByRole('heading', { name: '转发链' })).toBeVisible()
  await expect(page.getByText('拖入路径')).toBeVisible()
  await expect(page.getByText('拖动节点卡片改变顺序')).toBeVisible()
})

test('adds a node from the component palette without a drag gesture', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '转发链', exact: true }).click()
  await page.getByRole('button', { name: /HTTP over TLS/ }).click()
  await expect(page.getByText('http-tls-2')).toBeVisible()
  await expect(page.getByText('2 个节点')).toBeVisible()
})


test('accepts a dragged component on the path canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '转发链', exact: true }).click()
  await page.getByRole('button', { name: /HTTP over TLS/ }).dragTo(page.locator('.flow-editor .react-flow__pane'), { targetPosition: { x: 380, y: 210 } })
  await expect(page.getByText('http-tls-2')).toBeVisible()
})
