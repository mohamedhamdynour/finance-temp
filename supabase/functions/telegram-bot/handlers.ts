// ═══════════════════════════════════════════════════
//  handlers.ts — معالجات الأوامر
// ═══════════════════════════════════════════════════
import {
  db, tgSend, escapeHtml, n2, todayStr,
  formatMoney, formatMoneyShort,
  extractAmount, extractBankCode, extractSymbol, cleanNotes,
  getLinkedUser, getSession, setSession,
  fetchBanks, fetchUserSettings, getBaseCurrency
} from './helpers.ts';

// ═══════════════════════════════════════════════════
//  Router — يوجّه الأمر للمعالج المناسب
// ═══════════════════════════════════════════════════
export async function routeMessage(msg: any): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const from = msg.from || {};

  // استخراج الأمر
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, '');

  // التحقق من الربط (ما عدا أوامر معينة)
  const bypass = ['/start', '/help', '/link'];
  const userId = await getLinkedUser(chatId);

  if(!userId && !bypass.includes(cmd)){
    await tgSend(chatId,
      `⚠️ <b>حسابك غير مربوط بعد</b>\n\n` +
      `لربط حسابك:\n` +
      `1. افتح الموقع → الإعدادات → "ربط Telegram"\n` +
      `2. اضغط "توليد كود"\n` +
      `3. أرسل: <code>/link XXXXXX</code>\n\n` +
      `أو أرسل /help للمساعدة.`
    );
    return;
  }

  // التوجيه
  try {
    switch(cmd){
      case '/start':     return await handleStart(chatId, from);
      case '/help':      return await handleHelp(chatId);
      case '/link':      return await handleLink(chatId, args[0], from);
      case '/balance':   return await handleBalance(chatId, userId!, args);
      case '/portfolio': return await handlePortfolio(chatId, userId!);
      case '/in':        return await handleDeposit(chatId, userId!, args.join(' '));
      case '/out':       return await handleWithdraw(chatId, userId!, args.join(' '));
      case '/buy':       return await handleBuy(chatId, userId!, args.join(' '));
      case '/sell':      return await handleSell(chatId, userId!, args.join(' '));
      case '/metals':    return await handleMetals(chatId, userId!);
      case '/zakat':     return await handleZakat(chatId, userId!);
      case '/report':    return await handleReport(chatId, userId!, args[0]);
      case '/banks':     return await handleBanksList(chatId, userId!);
      case '/cancel':    return await tgSend(chatId, '✅ تم الإلغاء.');
      default:
        // رسالة عادية → جرّب نفهمها كأمر طبيعي
        return await handleNaturalLanguage(chatId, userId!, text);
    }
  }catch(e: any){
    console.error('[routeMessage] error:', e);
    await tgSend(chatId, `❌ حدث خطأ: <code>${escapeHtml(e.message || 'غير معروف')}</code>`);
  }
}

// ═══════════════════════════════════════════════════
//  /start و /help
// ═══════════════════════════════════════════════════
async function handleStart(chatId: number, from: any): Promise<void> {
  const name = from.first_name || 'صديقي';
  const userId = await getLinkedUser(chatId);

  let text = `👋 أهلاً <b>${escapeHtml(name)}</b>!\n\n`;
  text += `أنا بوت <b>محفظتي المالية</b> 🏦\n`;
  text += `أساعدك تسجّل أي عملية في ثانية من جوالك.\n\n`;

  if(userId){
    text += `✅ حسابك مربوط بالفعل!\n\n`;
    text += `<b>أوامر سريعة:</b>\n`;
    text += `• /balance — عرض الأرصدة\n`;
    text += `• /portfolio — ملخص المحفظة\n`;
    text += `• /in 5000 CIB — إيداع\n`;
    text += `• /out 200 فاتورة — سحب\n`;
    text += `• /buy 10 ETEL 25.5 — شراء سهم\n`;
    text += `• /zakat — حساب الزكاة\n`;
    text += `• /help — قائمة كاملة\n`;
  }else{
    text += `📱 <b>لربط حسابك:</b>\n`;
    text += `1. افتح الموقع → الإعدادات\n`;
    text += `2. اضغط "ربط Telegram"\n`;
    text += `3. انسخ الكود المُولَّد\n`;
    text += `4. أرسل: <code>/link ABC123</code>\n\n`;
    text += `أو استخدم /help لمعرفة كل الأوامر.`;
  }

  await tgSend(chatId, text);
}

async function handleHelp(chatId: number): Promise<void> {
  const text = `📚 <b>قائمة الأوامر</b>\n\n` +
    `<b>🔗 الربط</b>\n` +
    `/link CODE — ربط حسابك\n` +
    `/start — الترحيب\n\n` +

    `<b>💰 الأرصدة والتقارير</b>\n` +
    `/balance — كل الحسابات\n` +
    `/balance CIB — حساب محدد\n` +
    `/portfolio — ملخص المحفظة الكامل\n` +
    `/banks — قائمة الحسابات\n` +
    `/zakat — حساب الزكاة\n` +
    `/report week — تقرير آخر أسبوع\n` +
    `/report month — تقرير آخر شهر\n` +
    `/report year — تقرير آخر سنة\n\n` +

    `<b>💵 العمليات البنكية</b>\n` +
    `/in 5000 CIB — إيداع 5000 في CIB\n` +
    `/out 200 CIB — سحب 200 من CIB\n` +
    `/in 1000 — إيداع 1000 (سيُسألك عن الحساب)\n\n` +

    `<b>📈 الأسهم</b>\n` +
    `/buy 10 ETEL 25.5 — شراء 10 أسهم بسعر 25.5\n` +
    `/sell 5 ETEL 30 — بيع 5 أسهم بسعر 30\n\n` +

    `<b>💎 المعادن</b>\n` +
    `/metals — عرض الحيازات\n\n` +

    `<b>💬 لغة طبيعية</b>\n` +
    `تقدر تكتب بالعربي عادي:\n` +
    `• "ايداع 5000 في CIB"\n` +
    `• "سحب 200 فاتورة"\n` +
    `• "شريت 10 اسهم ETEL بـ 25.5"\n` +
    `• "رصيدي كام؟"\n` +
    `• "الزكاة"\n\n` +

    `للإلغاء: /cancel`;

  await tgSend(chatId, text);
}

// ═══════════════════════════════════════════════════
//  /link — ربط الحساب
// ═══════════════════════════════════════════════════
async function handleLink(chatId: number, code: string | undefined, from: any): Promise<void> {
  if(!code){
    await tgSend(chatId, `❌ <b>استخدم:</b> <code>/link ABC123</code>\n\nالكود من الموقع → الإعدادات → "ربط Telegram".`);
    return;
  }

  const cleanCode = code.trim().toUpperCase();

  // نادِ RPC الدالة
  const { data, error } = await db.rpc('telegram_link_consume', {
    p_code: cleanCode,
    p_chat_id: chatId,
    p_username: from.username || null
  });

  if(error){
    console.error('[handleLink] RPC error:', error);
    await tgSend(chatId, `❌ خطأ في الربط: <code>${escapeHtml(error.message)}</code>`);
    return;
  }

  if(!data?.ok){
    await tgSend(chatId,
      `❌ <b>الكود غير صحيح أو منتهي</b>\n\n` +
      `• الكود صالح 5 دقائق فقط\n` +
      `• تأكد من نسخه بالضبط\n\n` +
      `ولّد كود جديد من الموقع ثم أرسله.`
    );
    return;
  }

  await tgSend(chatId,
    `✅ <b>تم الربط بنجاح!</b>\n\n` +
    `حسابك مربوط الآن. جرّب:\n` +
    `• /balance\n` +
    `• /portfolio\n` +
    `• /help`
  );
}

// ═══════════════════════════════════════════════════
//  /balance — عرض الأرصدة
// ═══════════════════════════════════════════════════
async function handleBalance(chatId: number, userId: string, args: string[]): Promise<void> {
  const banks = await fetchBanks(userId);
  const settings = await fetchUserSettings(userId);
  const baseCur = getBaseCurrency(settings);

  if(!banks.length){
    await tgSend(chatId, `📭 لا توجد حسابات بنكية.\nأضف حسابًا من الموقع أولاً.`);
    return;
  }

  // حساب محدد؟
  if(args.length){
    const search = args.join(' ').toLowerCase();
    const bank = banks.find(b =>
      (b.bank_code || '').toLowerCase() === search ||
      (b.name || '').toLowerCase().includes(search)
    );
    if(!bank){
      await tgSend(chatId, `❌ لم أجد حسابًا باسم "<b>${escapeHtml(search)}</b>".\n\nجرّب /banks لعرض القائمة.`);
      return;
    }
    await showBankDetails(chatId, userId, bank);
    return;
  }

  // كل الحسابات
  let total = 0;
  const lines: string[] = [];
  lines.push(`🏦 <b>الأرصدة الحالية</b>\n`);

  const byCurrency: Record<string, number> = {};
  for(const b of banks){
    const cur = b.currency || 'EGP';
    const bal = n2(b.balance);
    byCurrency[cur] = (byCurrency[cur] || 0) + bal;
    const icon = cur === 'EGP' ? '💵' : '💱';
    const code = b.bank_code ? ` (${escapeHtml(b.bank_code)})` : '';
    const lowBal = n2(b.min_balance) > 0 && bal < n2(b.min_balance);
    const warn = lowBal ? ' ⚠️' : '';
    lines.push(`${icon} <b>${escapeHtml(b.name)}</b>${code}${warn}`);
    lines.push(`   <code>${formatMoney(bal, cur)}</code>`);
  }

  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━`);
  for(const [cur, sum] of Object.entries(byCurrency)){
    lines.push(`💰 الإجمالي (${cur}): <b>${formatMoney(sum, cur)}</b>`);
  }

  await tgSend(chatId, lines.join('\n'));
}

async function showBankDetails(chatId: number, userId: string, bank: any): Promise<void> {
  const cur = bank.currency || 'EGP';
  const bal = n2(bank.balance);

  // آخر 5 عمليات
  const { data: txns } = await db.from('bank_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('bank_id', bank.id)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .limit(5);

  let text = `🏦 <b>${escapeHtml(bank.name)}</b>\n`;
  if(bank.bank_code) text += `🔖 كود: <code>${escapeHtml(bank.bank_code)}</code>\n`;
  text += `💼 النوع: ${escapeHtml(bank.type || '—')}\n`;
  text += `💰 الرصيد: <b>${formatMoney(bal, cur)}</b>\n`;

  if(n2(bank.min_balance) > 0){
    const low = bal < n2(bank.min_balance);
    text += `📉 الحد الأدنى: ${formatMoney(bank.min_balance, cur)} ${low ? '⚠️' : '✅'}\n`;
  }

  if(txns && txns.length){
    text += `\n<b>آخر 5 عمليات:</b>\n`;
    const CREDIT = ['إيداع', 'تحويل وارد', 'رصيد افتتاحي', 'عائد شهادة', 'أرباح'];
    for(const t of txns){
      const isIn = CREDIT.includes(t.type);
      const sign = isIn ? '+' : '−';
      const emoji = isIn ? '🟢' : '🔴';
      text += `${emoji} ${t.date} | ${escapeHtml(t.type)} | <code>${sign}${formatMoney(t.amount, cur)}</code>\n`;
    }
  }

  await tgSend(chatId, text);
}

// ═══════════════════════════════════════════════════
//  /banks — قائمة الحسابات فقط
// ═══════════════════════════════════════════════════
async function handleBanksList(chatId: number, userId: string): Promise<void> {
  const banks = await fetchBanks(userId);
  if(!banks.length){
    await tgSend(chatId, `📭 لا توجد حسابات.`);
    return;
  }
  let text = `🏦 <b>حساباتك (${banks.length}):</b>\n\n`;
  for(const b of banks){
    const cur = b.currency || 'EGP';
    text += `• <b>${escapeHtml(b.name)}</b>`;
    if(b.bank_code) text += ` [<code>${escapeHtml(b.bank_code)}</code>]`;
    text += ` — ${formatMoney(b.balance, cur)}\n`;
  }
  text += `\nللتفاصيل: <code>/balance CODE</code>`;
  await tgSend(chatId, text);
}

// ═══════════════════════════════════════════════════
//  /in — إيداع
// ═══════════════════════════════════════════════════
async function handleDeposit(chatId: number, userId: string, argsText: string): Promise<void> {
  const banks = await fetchBanks(userId);
  if(!banks.length){
    await tgSend(chatId, `📭 لا توجد حسابات بنكية. أضف حسابًا من الموقع أولاً.`);
    return;
  }

  const amount = extractAmount(argsText);
  if(!amount || amount <= 0){
    await tgSend(chatId, `❌ <b>الصيغة:</b> <code>/in 5000 CIB</code>\nمثال: <code>/in 5000 CIB</code>`);
    return;
  }

  const { bank, remainingText } = extractBankCode(argsText, banks);
  if(!bank){
    // ابحث عن الحساب الافتراضي (أول حساب نشط)
    if(banks.length === 1){
      // حساب واحد فقط → استخدمه
      await executeDeposit(chatId, userId, banks[0], amount, remainingText);
      return;
    }
    // اسأل المستخدم يختار
    const keyboard = banks.slice(0, 8).map(b => ([{
      text: `${b.name}${b.bank_code ? ' (' + b.bank_code + ')' : ''}`,
      callback_data: `dep:${b.id}:${amount}`
    }]));
    await tgSend(chatId, `💰 اختر الحساب لإيداع <b>${formatMoney(amount)}</b>:`, {
      reply_markup: { inline_keyboard: keyboard }
    });
    return;
  }

  await executeDeposit(chatId, userId, bank, amount, remainingText);
}

async function executeDeposit(chatId: number, userId: string, bank: any, amount: number, notes: string): Promise<void> {
  const cur = bank.currency || 'EGP';
  const newBal = +(n2(bank.balance) + amount).toFixed(4);

  const { error } = await db.from('bank_transactions').insert({
    user_id: userId,
    bank_id: bank.id,
    type: 'إيداع',
    amount,
    balance_after: newBal,
    date: todayStr(),
    notes: notes || null,
    category: null
  });

  if(error){
    await tgSend(chatId, `❌ فشل الحفظ: <code>${escapeHtml(error.message)}</code>`);
    return;
  }

  await tgSend(chatId,
    `✅ <b>تم الإيداع بنجاح</b>\n\n` +
    `🏦 الحساب: <b>${escapeHtml(bank.name)}</b>\n` +
    `💵 المبلغ: <b>+${formatMoney(amount, cur)}</b>\n` +
    `💰 الرصيد الجديد: <b>${formatMoney(newBal, cur)}</b>` +
    (notes ? `\n📝 ملاحظات: ${escapeHtml(notes)}` : '')
  );
}

// ═══════════════════════════════════════════════════
//  /out — سحب
// ═══════════════════════════════════════════════════
async function handleWithdraw(chatId: number, userId: string, argsText: string): Promise<void> {
  const banks = await fetchBanks(userId);
  if(!banks.length){
    await tgSend(chatId, `📭 لا توجد حسابات بنكية.`);
    return;
  }

  const amount = extractAmount(argsText);
  if(!amount || amount <= 0){
    await tgSend(chatId, `❌ <b>الصيغة:</b> <code>/out 200 CIB فاتورة</code>`);
    return;
  }

  const { bank, remainingText } = extractBankCode(argsText, banks);
  if(!bank){
    if(banks.length === 1){
      await executeWithdraw(chatId, userId, banks[0], amount, remainingText);
      return;
    }
    const keyboard = banks.slice(0, 8).map(b => ([{
      text: `${b.name}${b.bank_code ? ' (' + b.bank_code + ')' : ''} | ${formatMoneyShort(b.balance, b.currency)}`,
      callback_data: `wit:${b.id}:${amount}`
    }]));
    await tgSend(chatId, `💸 اختر الحساب لسحب <b>${formatMoney(amount)}</b>:`, {
      reply_markup: { inline_keyboard: keyboard }
    });
    return;
  }

  await executeWithdraw(chatId, userId, bank, amount, remainingText);
}

async function executeWithdraw(chatId: number, userId: string, bank: any, amount: number, notes: string): Promise<void> {
  const cur = bank.currency || 'EGP';

  if(n2(bank.balance) < amount){
    await tgSend(chatId, `❌ <b>الرصيد غير كافٍ</b>\n💰 المتاح: ${formatMoney(bank.balance, cur)}`);
    return;
  }

  const newBal = +(n2(bank.balance) - amount).toFixed(4);
  const { error } = await db.from('bank_transactions').insert({
    user_id: userId,
    bank_id: bank.id,
    type: 'سحب',
    amount,
    balance_after: newBal,
    date: todayStr(),
    notes: notes || null,
    category: null
  });

  if(error){
    await tgSend(chatId, `❌ فشل الحفظ: <code>${escapeHtml(error.message)}</code>`);
    return;
  }

  await tgSend(chatId,
    `✅ <b>تم السحب بنجاح</b>\n\n` +
    `🏦 الحساب: <b>${escapeHtml(bank.name)}</b>\n` +
    `💸 المبلغ: <b>−${formatMoney(amount, cur)}</b>\n` +
    `💰 الرصيد الجديد: <b>${formatMoney(newBal, cur)}</b>` +
    (notes ? `\n📝 ملاحظات: ${escapeHtml(notes)}` : '')
  );
}

// ═══════════════════════════════════════════════════
//  معالجات callback buttons
// ═══════════════════════════════════════════════════
export async function routeCallback(cb: any): Promise<void> {
  const chatId = cb.message.chat.id;
  const data = cb.data || '';
  const [action, bankIdStr, amountStr] = data.split(':');
  const userId = await getLinkedUser(chatId);
  if(!userId) return;

  const banks = await fetchBanks(userId);
  const bank = banks.find(b => b.id === +bankIdStr);
  if(!bank) return;

  if(action === 'dep'){
    await executeDeposit(chatId, userId, bank, +amountStr, '');
  }else if(action === 'wit'){
    await executeWithdraw(chatId, userId, bank, +amountStr, '');
  }
}

// ═══════════════════════════════════════════════════
//  معالجة اللغة الطبيعية (سيُفعَّل أكثر في الجزء 2)
// ═══════════════════════════════════════════════════
async function handleNaturalLanguage(chatId: number, userId: string, text: string): Promise<void> {
  const lower = text.toLowerCase();

  // كلمات مفتاحية للربط بمختلف الأوامر
  if(/^(رصيد|أرصدة|فلوس|balance)/i.test(lower)){
    return await handleBalance(chatId, userId, []);
  }
  if(/^(محفظة|المحفظة|portfolio)/i.test(lower)){
    return await handlePortfolio(chatId, userId);
  }
  if(/(زكاة|زكاه|zakat)/i.test(lower)){
    return await handleZakat(chatId, userId);
  }
  if(/ايداع|إيداع|حطيت|دخل|in\s/i.test(text)){
    return await handleDeposit(chatId, userId, text.replace(/^(ايداع|إيداع|حطيت|دخل)/i, ''));
  }
  if(/سحب|صرفت|خرج|out\s/i.test(text)){
    return await handleWithdraw(chatId, userId, text.replace(/^(سحب|صرفت|خرج)/i, ''));
  }
  if(/شريت|اشتريت|شراء|buy/i.test(text)){
    return await handleBuy(chatId, userId, text.replace(/^(شريت|اشتريت|شراء)/i, ''));
  }
  if(/بعت|بيع|sell/i.test(text)){
    return await handleSell(chatId, userId, text.replace(/^(بعت|بيع)/i, ''));
  }
  if(/معادن|ذهب|فضة|metals/i.test(text)){
    return await handleMetals(chatId, userId);
  }

  // غير مفهوم
  await tgSend(chatId,
    `🤔 مش فاهم طلبك.\n\n` +
    `جرّب:\n` +
    `• "رصيدي كام؟"\n` +
    `• "ايداع 5000 في CIB"\n` +
    `• "سحب 200 فاتورة"\n` +
    `• "الزكاة"\n\n` +
    `أو أرسل /help للقائمة الكاملة.`
  );
}

// ═══════════════════════════════════════════════════
//  placeholder — سيتم تنفيذها في الجزء 2
// ═══════════════════════════════════════════════════
export async function handlePortfolio(chatId: number, userId: string): Promise<void> {
  await tgSend(chatId, '⏳ قيد التنفيذ — سيتم تفعيله في الجزء 2');
}

export async function handleBuy(chatId: number, userId: string, text: string): Promise<void> {
  await tgSend(chatId, '⏳ قيد التنفيذ — سيتم تفعيله في الجزء 2');
}

export async function handleSell(chatId: number, userId: string, text: string): Promise<void> {
  await tgSend(chatId, '⏳ قيد التنفيذ — سيتم تفعيله في الجزء 2');
}

export async function handleMetals(chatId: number, userId: string): Promise<void> {
  await tgSend(chatId, '⏳ قيد التنفيذ — سيتم تفعيله في الجزء 2');
}

export async function handleZakat(chatId: number, userId: string): Promise<void> {
  await tgSend(chatId, '⏳ قيد التنفيذ — سيتم تفعيله في الجزء 2');
}

export async function handleReport(chatId: number, userId: string, period: string | undefined): Promise<void> {
  await tgSend(chatId, '⏳ قيد التنفيذ — سيتم تفعيله في الجزء 2');
}
