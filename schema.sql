-- ============================================================================
--  Personal Finance Database Schema
-- ============================================================================
--  الوصف:
--    مخطط قاعدة بيانات لتطبيق إدارة مالية شخصية يشمل:
--    البنوك، المعاملات البنكية، الأسهم، المعادن، الشهادات، الديون،
--    الأهداف المالية، أسعار الصرف، ولقطات المحفظة.
--
--  البيئة:
--    PostgreSQL 14+ / Supabase
--
--  طريقة الاستخدام:
--    1) افتح Supabase Dashboard → SQL Editor
--    2) الصق محتوى الملف كاملًا
--    3) اضغط Run
--
--  ملاحظات:
--    - الملف آمن لإعادة التشغيل (idempotent): لن يحذف بيانات موجودة.
--    - الجداول مرتّبة حسب الاعتماديات (الأب قبل الابن).
--    - جميع المفاتيح الأساسية من نوع bigserial لتوليد id تلقائيًا.
--    - سياسات RLS تسمح لدور authenticated بالوصول الكامل.
--      لتطبيق متعدد المستخدمين: أضف عمود user_id وعدّل السياسات.
--
--  المحتويات:
--    PART 1  - الجداول (Tables)
--    PART 2  - الفهارس (Indexes)
--    PART 3  - الصلاحيات (Grants)
--    PART 4  - تفعيل Row Level Security
--    PART 5  - سياسات RLS (Policies)
--    PART 6  - إعادة تحميل مخطط PostgREST
-- ============================================================================


-- ============================================================================
-- PART 1: TABLES
-- ============================================================================
--  ملاحظة عامة:
--    نستخدم IF NOT EXISTS لتفادي أخطاء إعادة التشغيل.
--    الترتيب مهم: الجداول الأب (banks) تُنشأ قبل الجداول الابن
--    التي تشير إليها بمفاتيح أجنبية (Foreign Keys).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) banks — البنوك والحسابات
-- ----------------------------------------------------------------------------
--  يمثل كل صف حسابًا بنكيًا أو محفظة كاش.
--  الأعمدة المهمة:
--    - type: نوع الحساب (جاري/توفير/استثماري/بورصة/كاش)
--    - balance: الرصيد الحالي
--    - min_balance: الحد الأدنى للرصيد
--    - is_active: هل الحساب نشط أم مؤرشف
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.banks (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL,
  bank_code    text,
  type         text DEFAULT 'جاري'
    CHECK (type = ANY (ARRAY['جاري','توفير','استثماري','بورصة','كاش'])),
  currency     text DEFAULT 'EGP',
  account_no   text,
  balance      numeric DEFAULT 0,
  min_balance  numeric DEFAULT 0,
  notes        text,
  created_at   timestamptz DEFAULT now(),
  color        text DEFAULT '#3b82f6',
  is_active    boolean DEFAULT true
);


-- ----------------------------------------------------------------------------
-- 2) bank_transactions — معاملات الحسابات البنكية
-- ----------------------------------------------------------------------------
--  كل إيداع أو سحب أو تحويل يُسجَّل هنا.
--  الأعمدة المهمة:
--    - type: نوع العملية (إيداع/سحب/تحويل...)
--    - balance_after: الرصيد بعد تنفيذ العملية (للتتبع التاريخي)
--    - linked_transfer_id: يربط التحويلات الثنائية (من/إلى)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                  bigserial PRIMARY KEY,
  bank_id             bigint,
  type                text NOT NULL,
  amount              numeric NOT NULL,
  balance_after       numeric,
  date                date DEFAULT CURRENT_DATE,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  category            text,
  linked_transfer_id  bigint,
  CONSTRAINT bank_transactions_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id)
);


-- ----------------------------------------------------------------------------
-- 3) stock_transactions — معاملات الأسهم
-- ----------------------------------------------------------------------------
--  شراء/بيع الأسهم في الأسواق المختلفة (EGX, NYSE, ... إلخ).
--  الأعمدة المهمة:
--    - bank_transaction_id: يربط المعاملة بعملية بنكية (خصم/إيداع تلقائي)
--    - profit: الربح المحقق (لعمليات البيع)
--    - commission / commission_fixed: عمولة نسبية وثابتة
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id                   bigserial PRIMARY KEY,
  bank_id              bigint,
  type                 text NOT NULL
    CHECK (type = ANY (ARRAY['شراء','بيع'])),
  symbol               text NOT NULL,
  name                 text NOT NULL,
  sec_type             text DEFAULT 'سهم',
  quantity             numeric NOT NULL,
  price                numeric NOT NULL,
  total                numeric NOT NULL,
  commission           numeric DEFAULT 0,
  net                  numeric NOT NULL,
  date                 date DEFAULT CURRENT_DATE,
  commission_fixed     numeric DEFAULT 0,
  profit               numeric,
  bank_transaction_id  bigint,
  created_at           timestamptz DEFAULT now(),
  market               text DEFAULT 'EGX'
    CHECK (market = ANY (ARRAY['EGX','TADAWUL','ADX','NYSE','NASDAQ','CRYPTO'])),
  price_currency       text DEFAULT 'EGP',
  notes                text,
  CONSTRAINT stock_transactions_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id),
  CONSTRAINT stock_transactions_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id)
);


-- ----------------------------------------------------------------------------
-- 4) stock_prices — أسعار الأسهم الحالية
-- ----------------------------------------------------------------------------
--  جدول مرجعي يُحدَّث دوريًا بأسعار الأسهم.
--  المفتاح الأساسي هو رمز السهم (symbol).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_prices (
  symbol         text PRIMARY KEY,
  name           text,
  sec_type       text DEFAULT 'سهم',
  current_price  numeric NOT NULL,
  updated_at     timestamptz DEFAULT now(),
  market         text DEFAULT 'EGX'
);


-- ----------------------------------------------------------------------------
-- 5) metal_transactions — معاملات المعادن (ذهب/فضة)
-- ----------------------------------------------------------------------------
--  شراء/بيع المعادن مع احتساب:
--    - manufacturing: مصنعية
--    - cashback: استرداد نقدي
--    - net: الصافي بعد كل الرسوم
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metal_transactions (
  id                   bigserial PRIMARY KEY,
  bank_id              bigint,
  op                   text NOT NULL
    CHECK (op = ANY (ARRAY['شراء','بيع'])),
  metal_type           text NOT NULL,
  weight               numeric NOT NULL,
  price_per_gram       numeric NOT NULL,
  total                numeric NOT NULL,
  manufacturing        numeric DEFAULT 0,
  cashback             numeric DEFAULT 0,
  net                  numeric NOT NULL,
  date                 date DEFAULT CURRENT_DATE,
  commission_fixed     numeric DEFAULT 0,
  notes                text,
  bank_transaction_id  bigint,
  created_at           timestamptz DEFAULT now(),
  currency             text DEFAULT 'EGP',
  CONSTRAINT metal_transactions_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id),
  CONSTRAINT metal_transactions_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id)
);


-- ----------------------------------------------------------------------------
-- 6) metal_prices — أسعار المعادن الحالية
-- ----------------------------------------------------------------------------
--  جدول مرجعي لسعر الجرام لكل معدن.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metal_prices (
  metal_type      text PRIMARY KEY,
  price_per_gram  numeric NOT NULL,
  updated_at      timestamptz DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 7) certificates — الشهادات البنكية
-- ----------------------------------------------------------------------------
--  شهادات الاستثمار مع تفاصيل:
--    - rate: سعر الفائدة
--    - duration: المدة
--    - payout_type: دورية صرف الفائدة
--    - maturity_date: تاريخ الاستحقاق
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificates (
  id                   bigserial PRIMARY KEY,
  bank_id              bigint,
  name                 text NOT NULL,
  bank_name            text,
  amount               numeric NOT NULL,
  rate                 numeric NOT NULL,
  duration             numeric NOT NULL,
  issued_date          date DEFAULT CURRENT_DATE,
  maturity_date        date,
  total_interest       numeric,
  break_fee            numeric DEFAULT 0,
  bank_transaction_id  bigint,
  created_at           timestamptz DEFAULT now(),
  payout_type          text DEFAULT 'سنوي'
    CHECK (payout_type = ANY (ARRAY['سنوي','شهري','أسبوعي','يومي'])),
  interest_paid        numeric DEFAULT 0,
  currency             text DEFAULT 'EGP',
  CONSTRAINT certificates_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id),
  CONSTRAINT certificates_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id)
);


-- ----------------------------------------------------------------------------
-- 8) dividends — أرباح الأسهم (التوزيعات النقدية)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dividends (
  id                   bigserial PRIMARY KEY,
  symbol               text NOT NULL,
  amount               numeric NOT NULL,
  date                 date DEFAULT CURRENT_DATE,
  bank_id              bigint,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  bank_transaction_id  bigint,
  CONSTRAINT dividends_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id),
  CONSTRAINT dividends_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id)
);


-- ----------------------------------------------------------------------------
-- 9) recurring_transactions — المعاملات الدورية
-- ----------------------------------------------------------------------------
--  معاملات متكررة (شهريًا/أسبوعيًا/سنويًا) تُطبَّق تلقائيًا.
--  الأعمدة المهمة:
--    - freq: التكرار
--    - last_applied: آخر تاريخ تم فيه التطبيق (لمنع التكرار)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  type          text NOT NULL
    CHECK (type = ANY (ARRAY['إيداع','سحب'])),
  freq          text NOT NULL
    CHECK (freq = ANY (ARRAY['monthly','weekly','yearly'])),
  amount        numeric NOT NULL,
  bank_id       bigint,
  start_date    date DEFAULT CURRENT_DATE,
  created_at    timestamptz DEFAULT now(),
  last_applied  date,
  CONSTRAINT recurring_transactions_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id)
);


-- ----------------------------------------------------------------------------
-- 10) financial_goals — الأهداف المالية
-- ----------------------------------------------------------------------------
--  أهداف المستخدم (مثل: شراء سيارة، رحلة، ...).
--  category: تصنيف الهدف (all / stocks / banks / ...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_goals (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  target      numeric NOT NULL,
  category    text DEFAULT 'all',
  created_at  timestamptz DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 11) exchange_rates — أسعار صرف العملات
-- ----------------------------------------------------------------------------
--  جدول مرجعي لسعر صرف كل عملة مقابل العملة الأساسية.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  currency    text PRIMARY KEY,
  rate        numeric NOT NULL,
  updated_at  timestamptz DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 12) debts — الديون (لنا / علينا)
-- ----------------------------------------------------------------------------
--  يجب أن يُنشأ قبل debt_payments لأنه الأب في العلاقة.
--  الأعمدة المهمة:
--    - party: الطرف الآخر (شخص/جهة)
--    - remaining: المتبقي من الدين
--    - rate: نسبة الفائدة (إن وُجدت)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debts (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  party       text,
  type        text NOT NULL,
  rate        numeric DEFAULT 0,
  amount      numeric NOT NULL,
  remaining   numeric NOT NULL,
  start_date  date,
  due_date    date,
  bank_id     bigint,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT debts_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id)
);


-- ----------------------------------------------------------------------------
-- 13) debt_payments — دفعات سداد الديون
-- ----------------------------------------------------------------------------
--  كل دفعة مرتبطة بدين معين و(اختياريًا) بعملية بنكية.
--  ON DELETE للـ FK debt_id: لا نحذف تلقائيًا، الحفاظ على السجل التاريخي.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id                   bigserial PRIMARY KEY,
  debt_id              bigint NOT NULL,
  bank_id              bigint,
  amount               numeric NOT NULL,
  date                 date DEFAULT CURRENT_DATE,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  bank_transaction_id  bigint,
  CONSTRAINT debt_payments_debt_id_fkey
    FOREIGN KEY (debt_id) REFERENCES public.debts(id),
  CONSTRAINT debt_payments_bank_id_fkey
    FOREIGN KEY (bank_id) REFERENCES public.banks(id),
  CONSTRAINT debt_payments_bank_transaction_id_fkey
    FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions(id)
);


-- ----------------------------------------------------------------------------
-- 14) portfolio_snapshots — لقطات المحفظة اليومية
-- ----------------------------------------------------------------------------
--  تُخزِّن إجمالي قيمة كل فئة في تاريخ معيّن.
--  snapshot_date UNIQUE لضمان لقطة واحدة يوميًا.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id             bigserial PRIMARY KEY,
  snapshot_date  date NOT NULL UNIQUE,
  total_banks    numeric DEFAULT 0,
  total_stocks   numeric DEFAULT 0,
  total_metals   numeric DEFAULT 0,
  total_certs    numeric DEFAULT 0,
  grand_total    numeric DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 15) app_settings — إعدادات التطبيق
-- ----------------------------------------------------------------------------
--  جدول key-value لتخزين إعدادات مرنة بصيغة JSONB.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id     integer PRIMARY KEY,
  value  jsonb
);


-- ============================================================================
-- PART 2: INDEXES
-- ============================================================================
--  الفهارس تُسرِّع:
--    - عمليات الربط (JOIN) عبر أعمدة Foreign Key
--    - الفلترة والترتيب على الأعمدة الشائعة (date, symbol, ...)
-- ============================================================================

-- فهارس المعاملات البنكية
CREATE INDEX IF NOT EXISTS idx_bank_transactions_bank_id
  ON public.bank_transactions(bank_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date
  ON public.bank_transactions(date);

-- فهارس معاملات الأسهم
CREATE INDEX IF NOT EXISTS idx_stock_transactions_bank_id
  ON public.stock_transactions(bank_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_symbol
  ON public.stock_transactions(symbol);

-- فهارس معاملات المعادن
CREATE INDEX IF NOT EXISTS idx_metal_transactions_bank_id
  ON public.metal_transactions(bank_id);

-- فهارس الشهادات
CREATE INDEX IF NOT EXISTS idx_certificates_bank_id
  ON public.certificates(bank_id);

-- فهارس التوزيعات
CREATE INDEX IF NOT EXISTS idx_dividends_bank_id
  ON public.dividends(bank_id);

-- فهارس المعاملات الدورية
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_bank
  ON public.recurring_transactions(bank_id);

-- فهارس الديون والدفعات
CREATE INDEX IF NOT EXISTS idx_debts_bank_id
  ON public.debts(bank_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id
  ON public.debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_bank_id
  ON public.debt_payments(bank_id);


-- ============================================================================
-- PART 3: GRANTS
-- ============================================================================
--  منح الصلاحيات للأدوار القياسية في Supabase:
--    - anon:          زوّار غير مسجّلين
--    - authenticated: مستخدمون مسجّلون
--    - service_role:  الخادم (يتجاوز RLS)
--
--  ALTER DEFAULT PRIVILEGES يضمن أن أي جدول/sequence جديد
--  سيرث نفس الصلاحيات تلقائيًا.
-- ============================================================================

-- صلاحية استخدام المخطط
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- صلاحيات الجداول الحالية
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

-- صلاحيات الـ sequences (لازمة لعمل INSERT مع bigserial)
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- صلاحيات الدوال (لو استُخدمت RPC لاحقًا)
GRANT EXECUTE
  ON ALL FUNCTIONS IN SCHEMA public
  TO anon, authenticated, service_role;

-- الصلاحيات الافتراضية للجداول/الـ sequences/الدوال المستقبلية
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS
  TO anon, authenticated, service_role;


-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (ENABLE)
-- ============================================================================
--  تفعيل RLS يجعل الوصول الافتراضي ممنوعًا حتى تُضاف سياسة.
--  هذا خط الدفاع الأول: بدون سياسة = لا وصول.
-- ============================================================================

ALTER TABLE public.banks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividends               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_goals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings            ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PART 5: POLICIES
-- ============================================================================
--  سياسات RLS تسمح لدور authenticated بالوصول الكامل لكل الجداول.
--  ⚠️ للإعداد السريع فقط. لتطبيق متعدد المستخدمين:
--      1) أضف عمود user_id uuid DEFAULT auth.uid() لكل جدول
--      2) استبدل USING (true) بـ USING (auth.uid() = user_id)
--
--  نستخدم DROP POLICY IF EXISTS قبل CREATE لضمان
--  أن إعادة تشغيل الملف لا ترمي خطأ "policy already exists".
-- ============================================================================

-- إسقاط السياسات القديمة (إن وُجدت)
DROP POLICY IF EXISTS "banks_all"                   ON public.banks;
DROP POLICY IF EXISTS "bank_transactions_all"       ON public.bank_transactions;
DROP POLICY IF EXISTS "stock_transactions_all"      ON public.stock_transactions;
DROP POLICY IF EXISTS "stock_prices_all"            ON public.stock_prices;
DROP POLICY IF EXISTS "metal_transactions_all"      ON public.metal_transactions;
DROP POLICY IF EXISTS "metal_prices_all"            ON public.metal_prices;
DROP POLICY IF EXISTS "certificates_all"            ON public.certificates;
DROP POLICY IF EXISTS "dividends_all"               ON public.dividends;
DROP POLICY IF EXISTS "recurring_transactions_all"  ON public.recurring_transactions;
DROP POLICY IF EXISTS "financial_goals_all"         ON public.financial_goals;
DROP POLICY IF EXISTS "exchange_rates_all"          ON public.exchange_rates;
DROP POLICY IF EXISTS "debts_all"                   ON public.debts;
DROP POLICY IF EXISTS "debt_payments_all"           ON public.debt_payments;
DROP POLICY IF EXISTS "portfolio_snapshots_all"     ON public.portfolio_snapshots;
DROP POLICY IF EXISTS "app_settings_all"            ON public.app_settings;

-- إنشاء السياسات
CREATE POLICY "banks_all" ON public.banks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "bank_transactions_all" ON public.bank_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "stock_transactions_all" ON public.stock_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "stock_prices_all" ON public.stock_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "metal_transactions_all" ON public.metal_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "metal_prices_all" ON public.metal_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "certificates_all" ON public.certificates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "dividends_all" ON public.dividends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "recurring_transactions_all" ON public.recurring_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "financial_goals_all" ON public.financial_goals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "exchange_rates_all" ON public.exchange_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "debts_all" ON public.debts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "debt_payments_all" ON public.debt_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "portfolio_snapshots_all" ON public.portfolio_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "app_settings_all" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- PART 6: RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
--  PostgREST يحتفظ بنسخة مخزّنة من مخطط قاعدة البيانات.
--  هذا الأمر يجبره على إعادة القراءة فورًا بدل انتظار التحديث الدوري.
-- ============================================================================

NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- END OF FILE
-- ============================================================================
