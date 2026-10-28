import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Runs only in the disposable native PostgreSQL CI job, never with real provider credentials.
test('database-backed operator journey and customer-session isolation', async ({ page, context }) => {
  test.setTimeout(120000);
  await page.goto('/login');
  await page.getByLabel('One-time setup token').fill(readFileSync('.runtime/bootstrap.token','utf8').trim());
  await page.getByLabel('Create an administrator password').fill('Database-browser-test-only-2026');
  await page.getByRole('button',{name:'Create workspace'}).click();
  await expect(page.getByRole('heading',{name:'Overview.',exact:true})).toBeVisible();
  await expect(page.getByText('Customer conversations',{exact:true})).toBeVisible();
  await expect(page.locator('.notice-error')).toHaveCount(0);

  // Create a real row through the operator form, then verify the authenticated API observes it.
  await page.getByRole('link',{name:'Relationships',exact:true}).click();
  await page.getByRole('button',{name:'Add relationship'}).click();
  const name='Browser CI Customer';
  await page.getByLabel('Customer name',{exact:true}).fill(name);
  await page.getByLabel('Email',{exact:true}).fill('browser-ci@example.test');
  await page.getByLabel('Company',{exact:true}).fill('Fictional CI Company');
  await page.getByLabel('Business need',{exact:true}).fill('Automate repetitive enquiries for this test.');
  await page.getByRole('button',{name:'Create relationship'}).click();
  await expect(page.locator('table').getByText(name,{exact:true})).toBeVisible();
  const lead=(await (await page.request.get('/api/leads')).json()).items.find((l:any)=>l.name===name);
  expect(lead).toBeTruthy(); expect(lead.consent).toBe(false);
  await page.screenshot({path:'test-results/relationships-populated.png',fullPage:true,animations:'disabled'});

  // Choose an actually available slot from the real backend, not a mocked calendar response.
  let day='', chosen:any, timezone='Asia/Aden';
  for(let offset=1;offset<8;offset++) {
    const candidate=new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
    const response=await page.request.get('/api/availability?date='+candidate);
    expect(response.ok()).toBe(true);
    const data=await response.json();
    if(data.slots.length) { day=candidate; chosen=data.slots[0]; timezone=data.timezone; break; }
  }
  expect(chosen).toBeTruthy();
  await page.getByRole('link',{name:'Appointments',exact:true}).click();
  await page.getByLabel('Preferred date',{exact:true}).fill(day);
  await page.getByRole('button',{name:'Check availability'}).click();
  const time=new Date(chosen.start).toLocaleTimeString('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit'});
  await page.getByRole('button',{name:time,exact:true}).click();
  await page.getByLabel('Customer',{exact:true}).selectOption(lead.id);
  await page.getByLabel('The customer confirmed this appointment time').check();
  await page.getByRole('button',{name:'Confirm booking',exact:true}).click();
  await expect(page.locator('table').getByText(name,{exact:true})).toBeVisible();
  const appointments=(await (await page.request.get('/api/appointments')).json()).items;
  expect(appointments.some((a:any)=>a.lead_id===lead.id && a.status==='confirmed')).toBe(true);
  await page.screenshot({path:'test-results/appointments-populated.png',fullPage:true,animations:'disabled'});

  // Open customer chat. Persist the incoming message without pretending an unconfigured AI replied.
  const customer=await context.newPage();
  await customer.goto('/chat');
  await customer.getByRole('button',{name:'Start a conversation'}).click();
  await expect(customer.getByText('Your conversation',{exact:true})).toBeVisible();
  const message='Browser CI website enquiry: please connect me with your team.';
  await customer.getByRole('textbox',{name:'Message',exact:true}).fill(message);
  await customer.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(customer.locator('.bubble').getByText(message,{exact:true})).toBeVisible();
  const own=await (await customer.request.get('/api/chat/messages')).json();
  expect(own.messages.filter((m:any)=>m.direction==='in')).toHaveLength(1);
  expect(own.messages.filter((m:any)=>m.author==='agent')).toHaveLength(0);

  await page.getByRole('link',{name:'Unified inbox',exact:true}).click();
  await page.locator('.conversation-item').filter({hasText:message}).click();
  await expect(page.locator('.bubble').getByText(message,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Take over',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume AI',exact:true})).toBeVisible();
  await page.getByPlaceholder('Write a reply…',{exact:true}).fill('Operator CI reply: saved to the real outbound queue.');
  await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await expect(page.locator('.bubble').getByText('Operator CI reply: saved to the real outbound queue.',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/inbox-populated.png',fullPage:true,animations:'disabled'});
  const after=await (await customer.request.get('/api/chat/messages')).json();
  expect(after.conversation.mode).toBe('human');
  // The worker is deliberately not started: queued operator text must not appear as delivered.
  expect(after.messages.some((m:any)=>m.author==='operator')).toBe(false);

  await page.getByRole('link',{name:'Overview',exact:true}).click();
  await expect(page.getByText('Customer conversations',{exact:true})).toBeVisible();
  await expect(page.locator('.notice-error')).toHaveCount(0);
  await page.screenshot({path:'test-results/overview-populated.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/overview-populated-mobile.png',fullPage:true,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
