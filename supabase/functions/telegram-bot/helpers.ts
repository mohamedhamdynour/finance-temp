// ═══════════════════════════════════════════════════
//  helpers.ts — الأدوات المشتركة
// ═══════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

// ─── المتغيرات البيئية ───────────────────────────────
export const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';

if(!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set');
if(!SUPABASE_URL) throw new Error('SUPABASE_URL not set');
if(!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

// ─── Supabase client (server-side) ───────────────────
export const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ═══════════════════════════════════════════════════
//  Telegram API
// ═══════════════════════════════════════════════════
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function tgSend(chatId: number, text: string, options: any = {}): Promise<void> {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  };
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const err = await res.text();
    console.error('[tgSend] failed:', err);
  }
}

export async function tgEdit(chatId: number, messageId: number, text: string, options: any = {}): Promise<void> {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  };
  const res = await fetch(`${TG_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if(!res.ok){
    const err = await res.text();
    console.error('[tgEdit] failed:', err);
  }
}

export async function tgAnswerCallback(callbackId: string, text?: string): Promise<void> {
  await fetch(`${TG_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text: text || '' })
  });
}

// ═══════════════════════════════════════════════════
//  أدوات مساعدة عامة
// ═══════════════════════════════════════════════════
export const escapeHtml = (s: any): string =>
  String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]!));

export const n2 = (v: any): number => isNaN(+v) ? 0 : +v;

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

export function formatMoney(v: number | string, currency = 'ج.م'): string {
  const n = n2(v);
  const formatted = new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
  return `${formatted} ${currency}`;
}

export function formatMoneyShort(v: number | string, currency = 'ج.م'): string {
  const n = n2(v);
  const abs = Math.abs(n);
  if(abs >= 1e6) return `${(n / 1e6).toFixed(2)}M ${currency}`;
  if(abs >= 1e3) return `${(n / 1e3).toFixed(1)}K ${currency}`;
  return formatMoney(n, currency);
}

// ═══════════════════════════════════════════════════
//  معالجة الأرقام (دعم الأرقام العربية والإنجليزية)
// ═══════════════════════════════════════════════════
const ARABIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

export function normalizeDigits(text: string): string {
  let result = text;
  ARABIC_DIGITS.forEach((d, i) => {
    result = result.replace(new RegExp(d, 'g'), String(i));
  });
  return result;
}

// ═══════════════════════════════════════════════════
//  تحليل الأوامر (Parser)
// ═══════════════════════════════════════════════════

/** يستخرج أول رقم من النص (يدعم 5000، 5,000، 5.5، 5000.50) */
export function extractAmount(text: string): number | null {
  const normalized = normalizeDigits(text).replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

/** يستخرج أول رمز بنك (يبدأ بحرف كبير أو موجود في قائمة) */
export function extractBankCode(text: string, banks: any[]): { bank: any | null, remainingText: string } {
  if(!banks || !banks.length) return { bank: null, remainingText: text };

  // ابحث أولاً عن كود مطابق تمامًا (كلمة بحرف كبير)
  for(const bank of banks){
    if(!bank.bank_code) continue;
    const pattern = new RegExp(`\\b${bank.bank_code}\\b`, 'i');
    if(pattern.test(text)){
      return { bank, remainingText: text.replace(pattern, '').trim() };
    }
  }
  // ثم ابحث بكلمة من اسم البنك
  for(const bank of banks){
    const words = (bank.name || '').split(/\s+/).filter((w: string) => w.length >= 3);
    for(const w of words){
      const pattern = new RegExp(`\\b${w}\\b`, 'i');
      if(pattern.test(text)){
        return { bank, remainingText: text.replace(pattern, '').trim() };
      }
    }
  }
  return { bank: null, remainingText: text };
}

/** يستخرج رمز سهم (2-10 أحرف إنجليزية كبيرة) */
export function extractSymbol(text: string): string | null {
  const match = text.toUpperCase().match(/\b([A-Z]{2,10})\b/);
  return match ? match[1] : null;
}

/** يزيل كلمات مفتاحية معروفة من النص لاستخراج الملاحظات */
export function cleanNotes(text: string, keywords: string[]): string {
  let result = text;
  keywords.forEach(k => {
    result = result.replace(new RegExp(k, 'gi'), '');
  });
  return result.replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════
//  Session state (لتخزين حالة كل مستخدم)
//  نخزنها في telegram_links.settings
// ═══════════════════════════════════════════════════
export async function getSession(chatId: number): Promise<any> {
  const { data } = await db
    .from('telegram_links')
    .select('settings, user_id')
    .eq('chat_id', chatId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.settings || {};
}

export async function setSession(chatId: number, settings: any): Promise<void> {
  await db.from('telegram_links')
    .update({ settings })
    .eq('chat_id', chatId)
    .eq('is_active', true);
}

// ═══════════════════════════════════════════════════
//  التحقق من الربط
// ═══════════════════════════════════════════════════
export async function getLinkedUser(chatId: number): Promise<string | null> {
  const { data } = await db
    .from('telegram_links')
    .select('user_id')
    .eq('chat_id', chatId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.user_id || null;
}

// ═══════════════════════════════════════════════════
//  جلب البيانات مع user_id (RLS بتتخطاه لأننا نستخدم service_role)
// ═══════════════════════════════════════════════════
export async function fetchBanks(userId: string): Promise<any[]> {
  const { data } = await db.from('banks')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  return data || [];
}

export async function fetchUserSettings(userId: string): Promise<any> {
  const { data } = await db.from('app_settings')
    .select('value')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.value || { base_currency: 'EGP' };
}

export function getBaseCurrency(settings: any): string {
  return settings?.base_currency || 'EGP';
}
