// ═══════════════════════════════════════════════════
//  index.ts — نقطة الدخول (webhook handler)
// ═══════════════════════════════════════════════════
import { WEBHOOK_SECRET, tgSend } from './helpers.ts';
import { routeMessage, routeCallback } from './handlers.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token'
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if(req.method === 'OPTIONS'){
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Health check
  if(req.method === 'GET'){
    return new Response(JSON.stringify({
      ok: true,
      service: 'telegram-bot',
      time: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if(req.method !== 'POST'){
    return new Response('Method not allowed', { status: 405 });
  }

  // ✅ التحقق من secret token (أمان)
  const secretToken = req.headers.get('x-telegram-bot-api-secret-token');
  if(WEBHOOK_SECRET && secretToken !== WEBHOOK_SECRET){
    console.warn('[webhook] Invalid secret token');
    return new Response('Unauthorized', { status: 401 });
  }

  try{
    const update = await req.json();
    console.log('[webhook] update:', JSON.stringify(update).slice(0, 300));

    // معالجة الرسائل النصية
    if(update.message?.text){
      // ننفذ بدون await عشان نرد على Telegram بسرعة
      routeMessage(update.message).catch(err => {
        console.error('[routeMessage] async error:', err);
        tgSend(update.message.chat.id, '❌ حدث خطأ غير متوقع. حاول تاني.')
          .catch(() => {});
      });
    }

    // معالجة زر الـ inline keyboard
    if(update.callback_query){
      routeCallback(update.callback_query).catch(err => {
        console.error('[routeCallback] error:', err);
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }catch(e: any){
    console.error('[webhook] parse error:', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
});
