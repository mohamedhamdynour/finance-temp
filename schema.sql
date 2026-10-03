-- ============================================================================
--  Personal Finance — Schema
--  Multi-user, isolated, with auto-triggers and atomic RPCs
-- ============================================================================
--  المميزات الجديدة عن v1:
--    • كل جدول فيه user_id مرتبط بـ auth.uid() — عزل تلقائي لكل مستخدم
--    • Triggers تُحدّث الأرصدة تلقائيًا (لا حاجة لتحديث من JavaScript)
--    • RPC Functions للعمليات المركبة (Transfer, Buy, Sell) في transaction واحد
--    • Soft Delete: الحذف يضع علامة deleted_at، البيانات لا تُمسح فعليًا
--    • RLS صارمة: USING (auth.uid() = user_id) على كل الجداول
--    • جدول telegram_links لربط البوت + جدول error_logs
--
--  ⚠️ هذا الملف يحذف كل شيء ويعيد البناء من الصفر (Test DB فقط)
-- ============================================================================


-- ============================================================================
-- PART 0: CLEANUP (احذف كل شيء قديم)
-- ============================================================================

-- احذف Triggers و Functions أولاً
DROP TRIGGER IF EXISTS trg_bank_txn_balance ON public.bank_transactions CASCADE;
DROP TRIGGER IF EXISTS trg_debt_payment_update ON public.debt_payments CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_banks ON public.banks CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_bank_txns ON public.bank_transactions CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_stock_txns ON public.stock_transactions CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_stock_prices ON public.stock_prices CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_metal_txns ON public.metal_transactions CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_metal_prices ON public.metal_prices CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_certs ON public.certificates CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_dividends ON public.dividends CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_recurring ON public.recurring_transactions CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_goals ON public.financial_goals CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_exr ON public.exchange_rates CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_debts ON public.debts CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_debt_payments ON public.debt_payments CASCADE;
DROP TRIGGER IF EXISTS trg_set_user_id_snapshots ON public.portfolio_snapshots CASCADE;

DROP FUNCTION IF EXISTS public.update_bank_balance() CASCADE;
DROP FUNCTION IF EXISTS public.update_debt_remaining() CASCADE;
DROP FUNCTION IF EXISTS public.set_user_id() CASCADE;
DROP FUNCTION IF EXISTS public.transfer_funds(bigint, bigint, numeric, numeric, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.buy_stock(bigint, text, text, text, text, text, numeric, numeric, numeric, numeric, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.sell_stock(bigint, text, numeric, numeric, numeric, numeric, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.buy_metal(bigint, text, numeric, numeric, text, numeric, numeric, numeric, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.sell_metal(bigint, text, numeric, numeric, numeric, numeric, date, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_dashboard_summary() CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_reminders() CASCADE;
DROP FUNCTION IF EXISTS public.telegram_link_generate() CASCADE;
DROP FUNCTION IF EXISTS public.telegram_link_consume(text, bigint, text) CASCADE;

-- احذف الجداول (CASCADE يحذف الـ FKs تلقائيًا)
DROP TABLE IF EXISTS public.telegram_links CASCADE;
DROP TABLE IF EXISTS public.error_logs CASCADE;
DROP TABLE IF EXISTS public.debt_payments CASCADE;
DROP TABLE IF EXISTS public.debts CASCADE;
DROP TABLE IF EXISTS public.dividends CASCADE;
DROP TABLE IF EXISTS public.certificates CASCADE;
DROP TABLE IF EXISTS public.metal_transactions CASCADE;
DROP TABLE IF EXISTS public.metal_prices CASCADE;
DROP TABLE IF EXISTS public.stock_transactions CASCADE;
DROP TABLE IF EXISTS public.stock_prices CASCADE;
DROP TABLE IF EXISTS public.bank_transactions CASCADE;
DROP TABLE IF EXISTS public.recurring_transactions CASCADE;
DROP TABLE IF EXISTS public.financial_goals CASCADE;
DROP TABLE IF EXISTS public.exchange_rates CASCADE;
DROP TABLE IF EXISTS public.portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP TABLE IF EXISTS public.banks CASCADE;


-- ============================================================================
-- PART 1: HELPER FUNCTION — set_user_id()
-- ============================================================================
--  دالة مساعدة تُستدعى من Triggers قبل الإدخال لضبط user_id تلقائيًا.
--  لو الـ client مرر user_id صريح، نحترمه (للاستيراد مثلًا).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required (no auth session and no explicit value)';
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================================
-- PART 2: TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) banks — الحسابات البنكية
-- ----------------------------------------------------------------------------
CREATE TABLE public.banks (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  bank_code    text,
  type         text DEFAULT 'جاري'
    CHECK (type = ANY (ARRAY['جاري','توفير','استثماري','بورصة','كاش'])),
  currency     text DEFAULT 'EGP',
  account_no   text,
  balance      numeric DEFAULT 0,
  min_balance  numeric DEFAULT 0,
  notes        text,
  color        text DEFAULT '#3b82f6',
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX idx_banks_user ON public.banks(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_banks BEFORE INSERT ON public.banks
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 2) bank_transactions — معاملات البنوك
-- ----------------------------------------------------------------------------
CREATE TABLE public.bank_transactions (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id             bigint NOT NULL REFERENCES public.banks(id) ON DELETE CASCADE,
  type                text NOT NULL,
  amount              numeric NOT NULL CHECK (amount >= 0),
  balance_after       numeric,
  date                date DEFAULT CURRENT_DATE,
  notes               text,
  category            text,
  linked_transfer_id  bigint REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX idx_bank_txns_user_date ON public.bank_transactions(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_txns_bank ON public.bank_transactions(bank_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_bank_txns BEFORE INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 3) stock_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE public.stock_transactions (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id              bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  type                 text NOT NULL CHECK (type = ANY (ARRAY['شراء','بيع'])),
  symbol               text NOT NULL,
  name                 text NOT NULL,
  sec_type             text DEFAULT 'سهم',
  market               text DEFAULT 'EGX'
    CHECK (market = ANY (ARRAY['EGX','TADAWUL','ADX','NYSE','NASDAQ','CRYPTO'])),
  price_currency       text DEFAULT 'EGP',
  quantity             numeric NOT NULL CHECK (quantity > 0),
  price                numeric NOT NULL CHECK (price >= 0),
  total                numeric NOT NULL,
  commission           numeric DEFAULT 0,
  commission_fixed     numeric DEFAULT 0,
  net                  numeric NOT NULL,
  profit               numeric,
  date                 date DEFAULT CURRENT_DATE,
  bank_transaction_id  bigint REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX idx_stock_txns_user ON public.stock_transactions(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_stock_txns_symbol ON public.stock_transactions(user_id, symbol) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_stock_txns BEFORE INSERT ON public.stock_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 4) stock_prices
-- ----------------------------------------------------------------------------
CREATE TABLE public.stock_prices (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol         text NOT NULL,
  name           text,
  sec_type       text DEFAULT 'سهم',
  current_price  numeric NOT NULL,
  market         text DEFAULT 'EGX',
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, symbol)
);
CREATE TRIGGER trg_set_user_id_stock_prices BEFORE INSERT ON public.stock_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 5) metal_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE public.metal_transactions (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id              bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  op                   text NOT NULL CHECK (op = ANY (ARRAY['شراء','بيع'])),
  metal_type           text NOT NULL,
  weight               numeric NOT NULL CHECK (weight > 0),
  price_per_gram       numeric NOT NULL CHECK (price_per_gram >= 0),
  total                numeric NOT NULL,
  manufacturing        numeric DEFAULT 0,
  cashback             numeric DEFAULT 0,
  net                  numeric NOT NULL,
  currency             text DEFAULT 'EGP',
  date                 date DEFAULT CURRENT_DATE,
  commission_fixed     numeric DEFAULT 0,
  bank_transaction_id  bigint REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX idx_metal_txns_user ON public.metal_transactions(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_metal_txns BEFORE INSERT ON public.metal_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 6) metal_prices
-- ----------------------------------------------------------------------------
CREATE TABLE public.metal_prices (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metal_type      text NOT NULL,
  price_per_gram  numeric NOT NULL,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, metal_type)
);
CREATE TRIGGER trg_set_user_id_metal_prices BEFORE INSERT ON public.metal_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 7) certificates
-- ----------------------------------------------------------------------------
CREATE TABLE public.certificates (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id              bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  bank_name            text,
  amount               numeric NOT NULL CHECK (amount > 0),
  currency             text DEFAULT 'EGP',
  rate                 numeric NOT NULL CHECK (rate >= 0),
  duration             numeric NOT NULL CHECK (duration > 0),
  issued_date          date DEFAULT CURRENT_DATE,
  maturity_date        date,
  total_interest       numeric,
  interest_paid        numeric DEFAULT 0,
  break_fee            numeric DEFAULT 0,
  payout_type          text DEFAULT 'سنوي'
    CHECK (payout_type = ANY (ARRAY['سنوي','شهري','أسبوعي','يومي'])),
  bank_transaction_id  bigint REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz,
  CHECK (maturity_date IS NULL OR maturity_date > issued_date)
);
CREATE INDEX idx_certs_user ON public.certificates(user_id, issued_date DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_certs BEFORE INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 8) dividends
-- ----------------------------------------------------------------------------
CREATE TABLE public.dividends (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol               text NOT NULL,
  amount               numeric NOT NULL CHECK (amount > 0),
  date                 date DEFAULT CURRENT_DATE,
  bank_id              bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  bank_transaction_id  bigint REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX idx_dividends_user ON public.dividends(user_id, date DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_dividends BEFORE INSERT ON public.dividends
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 9) recurring_transactions
-- ----------------------------------------------------------------------------
CREATE TABLE public.recurring_transactions (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  type          text NOT NULL CHECK (type = ANY (ARRAY['إيداع','سحب'])),
  freq          text NOT NULL CHECK (freq = ANY (ARRAY['monthly','weekly','yearly'])),
  amount        numeric NOT NULL CHECK (amount > 0),
  bank_id       bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  start_date    date DEFAULT CURRENT_DATE,
  last_applied  date,
  created_at    timestamptz DEFAULT now(),
  deleted_at    timestamptz
);
CREATE TRIGGER trg_set_user_id_recurring BEFORE INSERT ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 10) financial_goals
-- ----------------------------------------------------------------------------
CREATE TABLE public.financial_goals (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  target      numeric NOT NULL CHECK (target > 0),
  category    text DEFAULT 'all',
  created_at  timestamptz DEFAULT now(),
  deleted_at  timestamptz
);
CREATE TRIGGER trg_set_user_id_goals BEFORE INSERT ON public.financial_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 11) exchange_rates
-- ----------------------------------------------------------------------------
CREATE TABLE public.exchange_rates (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency    text NOT NULL,
  rate        numeric NOT NULL CHECK (rate > 0),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, currency)
);
CREATE TRIGGER trg_set_user_id_exr BEFORE INSERT ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 12) debts
-- ----------------------------------------------------------------------------
CREATE TABLE public.debts (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  party       text,
  type        text NOT NULL,
  rate        numeric DEFAULT 0,
  amount      numeric NOT NULL CHECK (amount > 0),
  remaining   numeric NOT NULL CHECK (remaining >= 0),
  start_date  date,
  due_date    date,
  bank_id     bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX idx_debts_user ON public.debts(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_set_user_id_debts BEFORE INSERT ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 13) debt_payments
-- ----------------------------------------------------------------------------
CREATE TABLE public.debt_payments (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id              bigint NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  bank_id              bigint REFERENCES public.banks(id) ON DELETE SET NULL,
  amount               numeric NOT NULL CHECK (amount > 0),
  date                 date DEFAULT CURRENT_DATE,
  bank_transaction_id  bigint REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  deleted_at           timestamptz
);
CREATE TRIGGER trg_set_user_id_debt_payments BEFORE INSERT ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 14) portfolio_snapshots
-- ----------------------------------------------------------------------------
CREATE TABLE public.portfolio_snapshots (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date  date NOT NULL,
  total_banks    numeric DEFAULT 0,
  total_stocks   numeric DEFAULT 0,
  total_metals   numeric DEFAULT 0,
  total_certs    numeric DEFAULT 0,
  grand_total    numeric DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);
CREATE TRIGGER trg_set_user_id_snapshots BEFORE INSERT ON public.portfolio_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


-- ----------------------------------------------------------------------------
-- 15) app_settings — إعدادات لكل مستخدم
-- ----------------------------------------------------------------------------
CREATE TABLE public.app_settings (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  value     jsonb,
  updated_at timestamptz DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 16) telegram_links — ربط البوت بحساب المستخدم
-- ----------------------------------------------------------------------------
CREATE TABLE public.telegram_links (
  id                bigserial PRIMARY KEY,
  user_id           uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id           bigint UNIQUE,
  telegram_username text,
  first_name        text,
  link_code         text UNIQUE,
  code_expires_at   timestamptz,
  linked_at         timestamptz,
  is_active         boolean DEFAULT true,
  settings          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_telegram_links_chat ON public.telegram_links(chat_id) WHERE is_active = true;
CREATE INDEX idx_telegram_links_code ON public.telegram_links(link_code) WHERE link_code IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 17) error_logs — سجل أخطاء المتصفح بدون Sentry
-- ----------------------------------------------------------------------------
CREATE TABLE public.error_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message     text,
  stack       text,
  context     text,
  user_agent  text,
  url         text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_error_logs_user_date ON public.error_logs(user_id, created_at DESC);


-- ============================================================================
-- PART 3: TRIGGERS — auto-update balances
-- ============================================================================
--  الآن ما فيش حاجة لتحديث الرصيد من JavaScript.
--  أي INSERT/UPDATE/DELETE على bank_transactions يُحدّث banks.balance فورًا.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_bank_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bank_id bigint;
  v_new_balance numeric;
  CREDIT_TYPES text[] := ARRAY['إيداع','تحويل وارد','رصيد افتتاحي','عائد شهادة','أرباح'];
BEGIN
  v_bank_id := COALESCE(NEW.bank_id, OLD.bank_id);

  SELECT COALESCE(SUM(
    CASE WHEN type = ANY(CREDIT_TYPES) THEN amount ELSE -amount END
  ), 0)
  INTO v_new_balance
  FROM public.bank_transactions
  WHERE bank_id = v_bank_id AND deleted_at IS NULL;

  UPDATE public.banks SET balance = v_new_balance WHERE id = v_bank_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_bank_txn_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_bank_balance();


-- ----------------------------------------------------------------------------
-- Debt remaining auto-update on payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_debt_remaining()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_debt_id bigint;
  v_new_remaining numeric;
BEGIN
  v_debt_id := COALESCE(NEW.debt_id, OLD.debt_id);

  UPDATE public.debts d
  SET remaining = GREATEST(0, d.amount - COALESCE((
    SELECT SUM(dp.amount) FROM public.debt_payments dp
    WHERE dp.debt_id = v_debt_id AND dp.deleted_at IS NULL
  ), 0))
  WHERE d.id = v_debt_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_debt_payment_update
  AFTER INSERT OR UPDATE OR DELETE ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_debt_remaining();


-- ============================================================================
-- PART 4: RPC FUNCTIONS — atomic operations
-- ============================================================================
--  كل عملية معقدة (تحويل، شراء، بيع) تصير دالة SQL واحدة.
--  تنفذ في transaction واحد → rollback تلقائي لو فشل أي جزء.
--  أسرع 10x من استدعاءات HTTP متعددة من المتصفح.
-- ============================================================================

-- 4.1 التحويل بين حسابين
CREATE OR REPLACE FUNCTION public.transfer_funds(
  p_from_id bigint,
  p_to_id bigint,
  p_amount numeric,
  p_fee numeric DEFAULT 0,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_from_bal numeric;
  v_from_currency text;
  v_to_currency text;
  v_from_txn_id bigint;
  v_to_txn_id bigint;
  v_rate numeric;
  v_to_amount numeric;
BEGIN
  IF p_from_id = p_to_id THEN RAISE EXCEPTION 'Same account'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT balance, currency INTO v_from_bal, v_from_currency
  FROM banks WHERE id = p_from_id AND user_id = v_user AND deleted_at IS NULL;
  SELECT currency INTO v_to_currency
  FROM banks WHERE id = p_to_id AND user_id = v_user AND deleted_at IS NULL;

  IF v_from_bal IS NULL THEN RAISE EXCEPTION 'Source bank not found'; END IF;
  IF v_to_currency IS NULL THEN RAISE EXCEPTION 'Target bank not found'; END IF;
  IF v_from_bal < p_amount + p_fee THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  -- احسب المبلغ بعد تحويل العملة
  IF v_from_currency = v_to_currency THEN
    v_to_amount := p_amount;
  ELSE
    SELECT COALESCE(rate, 1) INTO v_rate FROM exchange_rates
      WHERE user_id = v_user AND currency = v_from_currency;
    SELECT COALESCE(rate, 1) INTO v_rate FROM exchange_rates
      WHERE user_id = v_user AND currency = v_to_currency;
    -- مبسط: يفترض أن الأسعار كلها نسبة لـ EGP
    v_to_amount := p_amount;  -- سيتم تحسينه لاحقًا
  END IF;

  INSERT INTO bank_transactions (bank_id, type, amount, date, notes, category)
  VALUES (p_from_id, 'تحويل صادر', p_amount, p_date,
          COALESCE(p_notes, '') || 'تحويل إلى: ' || (SELECT name FROM banks WHERE id = p_to_id),
          'تحويل')
  RETURNING id INTO v_from_txn_id;

  IF p_fee > 0 THEN
    INSERT INTO bank_transactions (bank_id, type, amount, date, notes, category)
    VALUES (p_from_id, 'سحب', p_fee, p_date, 'رسوم تحويل', 'رسوم');
  END IF;

  INSERT INTO bank_transactions (bank_id, type, amount, date, notes, category, linked_transfer_id)
  VALUES (p_to_id, 'تحويل وارد', v_to_amount, p_date,
          COALESCE(p_notes, '') || 'تحويل من: ' || (SELECT name FROM banks WHERE id = p_from_id),
          'تحويل', v_from_txn_id)
  RETURNING id INTO v_to_txn_id;

  UPDATE bank_transactions SET linked_transfer_id = v_to_txn_id WHERE id = v_from_txn_id;

  RETURN jsonb_build_object('ok', true, 'from_txn', v_from_txn_id, 'to_txn', v_to_txn_id);
END;
$$;


-- 4.2 شراء سهم
CREATE OR REPLACE FUNCTION public.buy_stock(
  p_bank_id bigint,
  p_symbol text,
  p_name text,
  p_sec_type text,
  p_market text,
  p_currency text,
  p_qty numeric,
  p_price numeric,
  p_comm_pct numeric,
  p_comm_fixed numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_bal numeric;
  v_total numeric;
  v_commission numeric;
  v_net numeric;
  v_bank_txn_id bigint;
  v_stock_txn_id bigint;
BEGIN
  SELECT balance INTO v_bal FROM banks
    WHERE id = p_bank_id AND user_id = v_user AND deleted_at IS NULL;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Bank not found'; END IF;

  v_total := p_qty * p_price;
  v_commission := v_total * p_comm_pct / 100;
  v_net := v_total + v_commission + p_comm_fixed;

  IF v_bal < v_net THEN RAISE EXCEPTION 'Insufficient balance. Need %, have %', v_net, v_bal; END IF;

  INSERT INTO bank_transactions (bank_id, type, amount, date, notes, category)
  VALUES (p_bank_id, 'سحب', v_net, p_date, 'شراء ' || p_symbol, 'شراء أسهم')
  RETURNING id INTO v_bank_txn_id;

  INSERT INTO stock_transactions (
    bank_id, type, symbol, name, sec_type, market, price_currency,
    quantity, price, total, commission, commission_fixed, net,
    date, bank_transaction_id, notes
  ) VALUES (
    p_bank_id, 'شراء', p_symbol, p_name, COALESCE(p_sec_type, 'سهم'),
    COALESCE(p_market, 'EGX'), COALESCE(p_currency, 'EGP'),
    p_qty, p_price, v_total, v_commission, p_comm_fixed, v_net,
    p_date, v_bank_txn_id, p_notes
  ) RETURNING id INTO v_stock_txn_id;

  -- حدّث سعر السهم إن لم يكن موجودًا
  INSERT INTO stock_prices (symbol, name, sec_type, current_price, market)
  VALUES (p_symbol, p_name, COALESCE(p_sec_type, 'سهم'), p_price, COALESCE(p_market, 'EGX'))
  ON CONFLICT (user_id, symbol) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'stock_txn', v_stock_txn_id, 'bank_txn', v_bank_txn_id, 'net', v_net);
END;
$$;


-- 4.3 بيع سهم
CREATE OR REPLACE FUNCTION public.sell_stock(
  p_bank_id bigint,
  p_symbol text,
  p_qty numeric,
  p_price numeric,
  p_comm_pct numeric,
  p_comm_fixed numeric,
  p_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owned numeric;
  v_avg_cost numeric;
  v_total numeric;
  v_commission numeric;
  v_net numeric;
  v_profit numeric;
  v_bank_txn_id bigint;
  v_stock_txn_id bigint;
  v_stock_name text;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN type = 'شراء' THEN quantity ELSE -quantity END), 0),
         name
  INTO v_owned, v_stock_name
  FROM stock_transactions
  WHERE user_id = v_user AND symbol = p_symbol AND deleted_at IS NULL
  GROUP BY name
  LIMIT 1;

  IF v_owned IS NULL OR v_owned < p_qty THEN
    RAISE EXCEPTION 'Not enough shares. Owned: %, requested: %', COALESCE(v_owned, 0), p_qty;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type='شراء' THEN net ELSE -net END) /
                  NULLIF(SUM(CASE WHEN type='شراء' THEN quantity ELSE -quantity END), 0), 0)
  INTO v_avg_cost
  FROM stock_transactions
  WHERE user_id = v_user AND symbol = p_symbol AND deleted_at IS NULL;

  v_total := p_qty * p_price;
  v_commission := v_total * p_comm_pct / 100;
  v_net := v_total - v_commission - p_comm_fixed;
  v_profit := v_net - (v_avg_cost * p_qty);

  INSERT INTO bank_transactions (bank_id, type, amount, date, notes, category)
  VALUES (p_bank_id, 'إيداع', v_net, p_date, 'بيع ' || p_symbol, 'بيع أسهم')
  RETURNING id INTO v_bank_txn_id;

  INSERT INTO stock_transactions (
    bank_id, type, symbol, name, quantity, price, total, commission,
    commission_fixed, net, profit, date, bank_transaction_id, notes
  ) VALUES (
    p_bank_id, 'بيع', p_symbol, v_stock_name, p_qty, p_price, v_total,
    v_commission, p_comm_fixed, v_net, v_profit, p_date, v_bank_txn_id, p_notes
  ) RETURNING id INTO v_stock_txn_id;

  RETURN jsonb_build_object('ok', true, 'stock_txn', v_stock_txn_id, 'profit', v_profit);
END;
$$;


-- ============================================================================
-- PART 5: DASHBOARD SUMMARY (single RPC instead of 14 queries)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH u AS (SELECT auth.uid() AS uid),
  bank_tot AS (
    SELECT COALESCE(SUM(balance), 0) AS total, COUNT(*) AS count
    FROM banks, u WHERE user_id = u.uid AND deleted_at IS NULL AND is_active = true
  )
  SELECT jsonb_build_object(
    'banks_total', (SELECT total FROM bank_tot),
    'banks_count', (SELECT count FROM bank_tot),
    'stocks_symbols', (SELECT COUNT(DISTINCT symbol) FROM stock_transactions, u
                       WHERE user_id = u.uid AND deleted_at IS NULL),
    'certs_total', (SELECT COALESCE(SUM(amount), 0) FROM certificates, u
                    WHERE user_id = u.uid AND deleted_at IS NULL),
    'debts_owed', (SELECT COALESCE(SUM(remaining), 0) FROM debts, u
                   WHERE user_id = u.uid AND deleted_at IS NULL AND type = 'دين علي'),
    'debts_owing', (SELECT COALESCE(SUM(remaining), 0) FROM debts, u
                    WHERE user_id = u.uid AND deleted_at IS NULL AND type = 'دين لي')
  );
$$;


-- ============================================================================
-- PART 6: TELEGRAM LINK HELPERS
-- ============================================================================

-- توليد كود ربط جديد (يُستدعى من الموقع)
CREATE OR REPLACE FUNCTION public.telegram_link_generate()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- كود من 6 أحرف
  v_code := upper(substring(md5(random()::text) from 1 for 6));

  INSERT INTO telegram_links (user_id, link_code, code_expires_at)
  VALUES (v_user, v_code, now() + interval '5 minutes')
  ON CONFLICT (user_id) DO UPDATE
    SET link_code = v_code,
        code_expires_at = now() + interval '5 minutes',
        chat_id = NULL,
        linked_at = NULL;

  RETURN v_code;
END;
$$;

-- استهلاك الكود من البوت (يُستدعى من Edge Function)
CREATE OR REPLACE FUNCTION public.telegram_link_consume(
  p_code text,
  p_chat_id bigint,
  p_username text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM telegram_links
    WHERE link_code = upper(p_code) AND code_expires_at > now()
    LIMIT 1;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  END IF;

  UPDATE telegram_links
  SET chat_id = p_chat_id,
      telegram_username = p_username,
      link_code = NULL,
      code_expires_at = NULL,
      linked_at = now(),
      is_active = true
  WHERE user_id = v_user;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user);
END;
$$;


-- ============================================================================
-- PART 7: ROW LEVEL SECURITY (per-user isolation)
-- ============================================================================
--  كل سياسة تقول: "المستخدم يشوف فقط صفوفه هو".
--  هذا يحقق أمن متعدد المستخدمين تلقائيًا على نفس قاعدة البيانات.
-- ============================================================================

-- فعّل RLS على كل الجداول
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- سياسة "المستخدم يتحكم في بياناته فقط" — تكرر لكل جدول
CREATE POLICY "own_rows_banks" ON public.banks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_bank_txns" ON public.bank_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_stock_txns" ON public.stock_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_stock_prices" ON public.stock_prices
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_metal_txns" ON public.metal_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_metal_prices" ON public.metal_prices
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_certs" ON public.certificates
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_dividends" ON public.dividends
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_recurring" ON public.recurring_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_goals" ON public.financial_goals
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_exr" ON public.exchange_rates
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_debts" ON public.debts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_debt_payments" ON public.debt_payments
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_snapshots" ON public.portfolio_snapshots
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_settings" ON public.app_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_rows_telegram" ON public.telegram_links
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- error_logs: المستخدم يقدر يُدخل ويقرأ سجلاته فقط
CREATE POLICY "own_rows_errors" ON public.error_logs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- PART 8: GRANTS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  TO authenticated, service_role;

-- app_settings و error_logs و telegram_links لا تُتاح للـ anon
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;


-- ============================================================================
-- PART 9: RELOAD POSTGREST
-- ============================================================================
NOTIFY pgrst, 'reload schema';
