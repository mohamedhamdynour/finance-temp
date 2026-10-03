-- ══════════════════════════════════════════════════════════════
--  محفظة مالية — سكريبت إعادة بناء قاعدة البيانات بالكامل (A → Z)
--  Supabase / PostgreSQL
--
--  طريقة الاستخدام:
--  1) افتح مشروعك في supabase.com → SQL Editor → New query
--  2) الصق هذا الملف كاملاً وشغّله مرة واحدة (Run)
--  3) هذا السكريبت يحذف الجداول القديمة بنفس الاسم أولاً (DROP) قبل
--     إعادة إنشائها — استخدمه فقط إذا كنت تريد البدء من جديد تمامًا،
--     أو على مشروع Supabase فارغ. إن كانت عندك بيانات حالية تريد
--     الاحتفاظ بها، خذ نسخة احتياطية (Database → Backups) أولاً،
--     أو احذف أسطر الـ DROP TABLE واستخدم فقط أوامر
--     "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" الموجودة في نهاية
--     كل قسم لإضافة الأعمدة الناقصة فقط دون فقد بياناتك.
-- ══════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- 0) تنظيف كامل (احذر: يمسح كل البيانات الحالية بهذه الأسماء)
-- ────────────────────────────────────────────────────────────
drop table if exists debt_payments        cascade;
drop table if exists debts                cascade;
drop table if exists recurring_transactions cascade;
drop table if exists dividends            cascade;
drop table if exists certificates         cascade;
drop table if exists metal_prices         cascade;
drop table if exists metal_transactions   cascade;
drop table if exists stock_prices         cascade;
drop table if exists stock_transactions   cascade;
drop table if exists bank_transactions    cascade;
drop table if exists banks                cascade;
drop table if exists exchange_rates       cascade;
drop table if exists portfolio_snapshots  cascade;
drop table if exists financial_goals      cascade;
drop table if exists app_settings         cascade;

-- ────────────────────────────────────────────────────────────
-- 1) banks — الحسابات البنكية (وحسابات الكاش)
-- ────────────────────────────────────────────────────────────
create table banks (
  id           bigint generated always as identity primary key,
  name         text        not null,
  bank_code    text,                              -- كود/رقم البنك (اختياري)
  account_no   text,                              -- رقم الحساب (اختياري)
  type         text        not null default 'جاري', -- جاري | توفير | استثماري | بورصة | كاش
  currency     text        not null default 'EGP',  -- كود العملة كما في app_settings.currencies
  balance      numeric(18,4) not null default 0,     -- الرصيد الحالي (بعملة الحساب نفسها)
  min_balance  numeric(18,4) default 0,              -- الحد الأدنى للتنبيه
  color        text,                              -- لون مخصص Hex مثل #1a56db
  notes        text,
  is_active    boolean     not null default true,   -- false = مؤرشف
  created_at   timestamptz not null default now()
);
comment on table banks is 'الحسابات البنكية وحسابات الكاش/النقد';

-- ────────────────────────────────────────────────────────────
-- 2) bank_transactions — سجل حركات كل حساب (المصدر الوحيد للحقيقة المالية)
-- ────────────────────────────────────────────────────────────
create table bank_transactions (
  id                 bigint generated always as identity primary key,
  bank_id            bigint references banks(id) on delete cascade,
  type               text        not null,  -- إيداع | سحب | تحويل وارد | تحويل صادر | رصيد افتتاحي | عائد شهادة | أرباح
  amount             numeric(18,4) not null,
  balance_after      numeric(18,4),          -- الرصيد بعد هذه الحركة (يُعاد حسابه تلقائيًا عبر recomputeBankBalance)
  date               date        not null default current_date,
  notes              text,
  category           text,                  -- تصنيف حر: تحويل / أرباح أسهم / شراء معادن / سداد دين / زكاة ...
  linked_transfer_id bigint references bank_transactions(id) on delete set null, -- ربط طرفي التحويل ببعضهما
  created_at         timestamptz not null default now()
);
create index idx_banktxn_bank_date on bank_transactions(bank_id, date);
comment on table bank_transactions is 'دفتر الأستاذ البنكي — كل عملية مالية فعلية تمر من هنا';

-- ────────────────────────────────────────────────────────────
-- 3) stock_transactions — عمليات شراء/بيع الأسهم والصناديق
-- ────────────────────────────────────────────────────────────
create table stock_transactions (
  id                  bigint generated always as identity primary key,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  type                text        not null,           -- شراء | بيع
  symbol              text        not null,
  name                text,
  sec_type            text        default 'سهم',       -- سهم | صندوق أسهم | صندوق دخل ثابت | ...
  market              text        default 'EGX',       -- EGX | TADAWUL | ADX | NYSE | NASDAQ | CRYPTO
  price_currency      text        default 'EGP',       -- عملة سعر السهم (لازم تطابق عملة الحساب البنكي)
  quantity            numeric(18,4) not null,
  price               numeric(18,4) not null default 0,
  total               numeric(18,4) not null default 0,
  commission          numeric(18,4) default 0,
  commission_fixed    numeric(18,4) default 0,
  net                 numeric(18,4) not null default 0,
  profit              numeric(18,4),                   -- ربح/خسارة محقق (لعمليات البيع فقط)
  date                date        not null default current_date,
  notes               text,
  created_at          timestamptz not null default now()
);
create index idx_stocktxn_symbol on stock_transactions(symbol);
comment on table stock_transactions is 'عمليات شراء/بيع الأوراق المالية؛ الحيازات الحالية تُشتق من هذا الجدول وليست مخزَّنة';

-- ────────────────────────────────────────────────────────────
-- 4) stock_prices — آخر سعر معروف لكل ورقة مالية
-- ────────────────────────────────────────────────────────────
create table stock_prices (
  symbol         text primary key,
  name           text,
  sec_type       text,
  current_price  numeric(18,4) not null default 0,
  updated_at     timestamptz default now()
);
comment on table stock_prices is 'آخر سعر مُحدَّث يدويًا لكل رمز سهم؛ يُستخدم لتقييم الحيازات';

-- ────────────────────────────────────────────────────────────
-- 5) metal_transactions — عمليات شراء/بيع المعادن الثمينة
-- ────────────────────────────────────────────────────────────
create table metal_transactions (
  id                  bigint generated always as identity primary key,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  op                  text        not null,          -- شراء | بيع
  metal_type          text        not null,          -- ذهب 24 | ذهب 21 | ذهب 18 | جنيه ذهب | سبيكة ذهب | فضة ...
  currency            text        default 'EGP',     -- عملة الشراء (لازم تطابق عملة الحساب البنكي)
  weight              numeric(18,4) not null,          -- بالجرام
  price_per_gram      numeric(18,4) not null,
  total               numeric(18,4) not null default 0,
  manufacturing       numeric(18,4) default 0,        -- مصنعية (شراء فقط)
  commission_fixed    numeric(18,4) default 0,
  cashback            numeric(18,4) default 0,        -- كاش باك (بيع فقط)
  net                 numeric(18,4) not null default 0,
  date                date        not null default current_date,
  notes               text,                          -- يُستخدم كعنوان/تسمية القطعة (سبيكة 1 أونصة...)
  created_at          timestamptz not null default now()
);
create index idx_metaltxn_type on metal_transactions(metal_type);
comment on table metal_transactions is 'عمليات شراء/بيع الذهب والفضة؛ الحيازات تُشتق من هذا الجدول';

-- ────────────────────────────────────────────────────────────
-- 6) metal_prices — آخر سعر جرام معروف لكل نوع معدن
-- ────────────────────────────────────────────────────────────
create table metal_prices (
  metal_type     text primary key,
  price_per_gram numeric(18,4) not null default 0,
  updated_at     timestamptz default now()
);
comment on table metal_prices is 'آخر سعر جرام لكل نوع معدن (يدويًا أو تلقائيًا عبر GoldAPI.io)';

-- ────────────────────────────────────────────────────────────
-- 7) certificates — الشهادات الادخارية
-- ────────────────────────────────────────────────────────────
create table certificates (
  id                  bigint generated always as identity primary key,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  name                text        not null,
  bank_name           text,
  amount              numeric(18,4) not null,           -- أصل مبلغ الشهادة
  currency            text        default 'EGP',
  rate                numeric(9,4) not null,             -- الفائدة السنوية %
  duration            numeric(6,2) not null default 1,   -- المدة بالسنوات
  issued_date         date        not null,
  maturity_date       date        not null,
  payout_type         text        not null default 'سنوي', -- سنوي | شهري | أسبوعي | يومي
  total_interest      numeric(18,4) not null default 0,   -- إجمالي الفائدة المتوقعة طوال المدة
  interest_paid       numeric(18,4) not null default 0,   -- إجمالي ما صُرف فعليًا حتى الآن
  created_at          timestamptz not null default now()
);
comment on table certificates is 'الشهادات الادخارية البنكية وجدول صرف عوائدها';

-- ────────────────────────────────────────────────────────────
-- 8) dividends — توزيعات الأرباح النقدية المستلمة
--    (توزيعات الأسهم "العينية" تُسجَّل كصف شراء بسعر صفر في stock_transactions)
-- ────────────────────────────────────────────────────────────
create table dividends (
  id                  bigint generated always as identity primary key,
  symbol              text        not null,
  amount              numeric(18,4) not null,
  date                date        not null default current_date,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now()
);
comment on table dividends is 'توزيعات الأرباح النقدية المستلمة من الأسهم';

-- ────────────────────────────────────────────────────────────
-- 9) recurring_transactions — العمليات البنكية المتكررة (قوالب)
-- ────────────────────────────────────────────────────────────
create table recurring_transactions (
  id           bigint generated always as identity primary key,
  name         text        not null,
  type         text        not null,          -- إيداع | سحب
  freq         text        not null default 'monthly', -- weekly | monthly | yearly
  amount       numeric(18,4) not null,
  bank_id      bigint references banks(id) on delete set null,
  start_date   date        not null default current_date,
  last_applied date,                          -- آخر مرة طُبِّقت فيها فعليًا
  created_at   timestamptz not null default now()
);
comment on table recurring_transactions is 'قوالب العمليات المتكررة؛ كل تطبيق فعلي ينشئ صفًا مستقلًا في bank_transactions';

-- ────────────────────────────────────────────────────────────
-- 10) financial_goals — الأهداف المالية
-- ────────────────────────────────────────────────────────────
create table financial_goals (
  id         bigint generated always as identity primary key,
  name       text        not null,
  target     numeric(18,4) not null,
  category   text        not null default 'all', -- all | banks | stocks | metals | certs
  created_at timestamptz not null default now()
);
comment on table financial_goals is 'أهداف الادخار — التقدم يُحسب لحظيًا من إجمالي الفئة المختارة';

-- ────────────────────────────────────────────────────────────
-- 11) exchange_rates — أسعار الصرف (مرجعها الجنيه المصري دائمًا)
--     rate = كم جنيهًا مصريًا يساوي 1 وحدة من هذه العملة (ثابت داخليًا
--     بصرف النظر عن العملة الأساسية المختارة في الإعدادات؛ التطبيق
--     يحوّلها تلقائيًا عبر EGP كنقطة ارتكاز — راجع toEGP() في الكود)
-- ────────────────────────────────────────────────────────────
create table exchange_rates (
  currency   text primary key,      -- USD, SAR, AED, EUR ...
  rate       numeric(18,6) not null,  -- 1 currency = rate EGP
  updated_at timestamptz default now()
);
comment on table exchange_rates is 'أسعار الصرف مقابل الجنيه المصري كنقطة ارتكاز ثابتة داخليًا';

-- ────────────────────────────────────────────────────────────
-- 12) portfolio_snapshots — لقطات دورية لإجمالي المحفظة (للرسم البياني عبر الزمن)
-- ────────────────────────────────────────────────────────────
create table portfolio_snapshots (
  snapshot_date date primary key,
  total_banks   numeric(18,4) default 0,
  total_stocks  numeric(18,4) default 0,
  total_metals  numeric(18,4) default 0,
  total_certs   numeric(18,4) default 0,
  grand_total   numeric(18,4) default 0
);
comment on table portfolio_snapshots is 'لقطة يومية لإجمالي كل فئة، تُستخدم في الرسم البياني لأداء المحفظة عبر الزمن';

-- ────────────────────────────────────────────────────────────
-- 13) debts — الديون والالتزامات (عليك / لك)
-- ────────────────────────────────────────────────────────────
create table debts (
  id         bigint generated always as identity primary key,
  name       text        not null,
  party      text,                          -- الطرف الآخر (اسم شخص/جهة)
  type       text        not null,          -- دين علي | دين لي
  rate       numeric(9,4) default 0,          -- فائدة سنوية % (إن وجدت)
  amount     numeric(18,4) not null,          -- المبلغ الأصلي
  remaining  numeric(18,4) not null,          -- المتبقي حاليًا
  start_date date,
  due_date   date,
  bank_id    bigint references banks(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now()
);
comment on table debts is 'الديون والالتزامات، سواء عليك أو مستحقة لك';

-- ────────────────────────────────────────────────────────────
-- 14) debt_payments — سجل دفعات سداد/تحصيل كل دين
-- ────────────────────────────────────────────────────────────
create table debt_payments (
  id                  bigint generated always as identity primary key,
  debt_id             bigint references debts(id) on delete cascade,
  bank_id             bigint references banks(id) on delete set null,
  bank_transaction_id bigint references bank_transactions(id) on delete set null,
  amount              numeric(18,4) not null,
  date                date        not null default current_date,
  notes               text,
  created_at          timestamptz not null default now()
);
comment on table debt_payments is 'سجل دفعات كل دين — سداد (دين علي) أو تحصيل (دين لي)';

-- ────────────────────────────────────────────────────────────
-- 15) app_settings — إعدادات التطبيق العامة (صف واحد ثابت id=1)
--     value (jsonb) يحوي: exchange_name, base_currency, currencies
--     [{code,name}], goldapi_key, zakat {start_date, gold_price,
--     silver_price, basis, include{}, history[]}
-- ────────────────────────────────────────────────────────────
create table app_settings (
  id         int primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
comment on table app_settings is 'صف واحد فقط (id=1) يحمل كل إعدادات التطبيق كـ JSON';

-- ══════════════════════════════════════════════════════════════
-- تفعيل Row Level Security — الوصول يتطلب تسجيل دخول (Supabase Auth)
--
-- هذا المشروع مُعد ليكون "مشروعك الشخصي" — كل مستخدم يربط التطبيق
-- بمشروع Supabase خاص به (رابط + anon key يُدخلهما بنفسه عند أول
-- استخدام)، ثم يسجّل حسابه (Sign up) من داخل الصفحة نفسها. الـ anon
-- key قد يكون ظاهرًا لأي زائر يفتح هذا المشروع إن كان عامًا على
-- GitHub، لكن السياسة أدناه تمنع القراءة/الكتابة لأي حد مش مسجّل
-- دخول على حسابك — يعني مجرد معرفة الرابط والمفتاح العام مش كفاية
-- للوصول لبياناتك. فعّل "Confirm email" في Authentication → Providers
-- حسب رغبتك (تعطيله يسمح بالدخول فورًا بعد التسجيل بدون تأكيد بريد).
-- ══════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  for t in select unnest(array[
    'banks','bank_transactions','stock_transactions','stock_prices',
    'metal_transactions','metal_prices','certificates','dividends',
    'recurring_transactions','financial_goals','exchange_rates',
    'portfolio_snapshots','debts','debt_payments','app_settings'
  ])
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      t || '_require_auth', t
    );
  end loop;
end $$;

-- ملاحظة: السياسة أعلاه تسمح لأي حساب مسجَّل دخول على مشروعك برؤية
-- وتعديل كل الصفوف (لا يوجد فصل بيانات بين مستخدم وآخر لو سجّل أكثر
-- من شخص على نفس مشروع Supabase). هذا مناسب لمشروع شخصي واحد لكل
-- مشروع Supabase كما هو مُصمَّم. لو احتجت لاحقًا عزل بيانات كل مستخدم
-- حتى لو شاركوا نفس المشروع، أضف عمود user_id uuid على كل جدول بقيمة
-- افتراضية auth.uid()، وغيّر كل سياسة إلى:
--   using (auth.uid() = user_id) with check (auth.uid() = user_id)

-- ══════════════════════════════════════════════════════════════
-- بيانات ابتدائية اختيارية (يمكن حذف هذا القسم إن كنت ستُدخل بياناتك يدويًا)
-- ══════════════════════════════════════════════════════════════
insert into app_settings (id, value) values (
  1,
  jsonb_build_object(
    'exchange_name', '',
    'base_currency', 'EGP',
    'currencies', jsonb_build_array(
      jsonb_build_object('code','EGP','name','الجنيه المصري'),
      jsonb_build_object('code','USD','name','دولار أمريكي'),
      jsonb_build_object('code','SAR','name','ريال سعودي'),
      jsonb_build_object('code','AED','name','درهم إماراتي'),
      jsonb_build_object('code','EUR','name','يورو'),
      jsonb_build_object('code','GBP','name','جنيه إسترليني')
    ),
    'goldapi_key', '',
    'zakat', jsonb_build_object(
      'start_date', null, 'gold_price', null, 'silver_price', null,
      'basis', 'gold', 'include', jsonb_build_object(), 'history', jsonb_build_array()
    )
  )
) on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════
-- ✅ انتهى. بعد تشغيل هذا السكريبت:
--   1) ارجع لصفحة "الإعدادات" داخل التطبيق وأضف عملاتك/اسم محفظتك.
--   2) أضف حساباتك البنكية من صفحة "الحسابات البنكية".
--   3) سجّل عملياتك (شراء أسهم/معادن/شهادات، ديون، إلخ) بالترتيب
--      الزمني الصحيح من الأقدم للأحدث للحصول على أرصدة وسجلات دقيقة.
-- ══════════════════════════════════════════════════════════════
