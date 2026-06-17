BEGIN;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Skipping timescaledb extension: %', SQLERRM;
  END;

  CREATE EXTENSION IF NOT EXISTS pgcrypto;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'TRADER', 'ANALYST');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_channel') THEN
    CREATE TYPE alert_channel AS ENUM ('EMAIL', 'SMS', 'PUSH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type') THEN
    CREATE TYPE alert_type AS ENUM (
      'PRICE_BREAKOUT',
      'RSI_OVERSOLD',
      'RSI_OVERBOUGHT',
      'VOLUME_SPIKE',
      'AI_BUY_SIGNAL',
      'AI_SELL_SIGNAL'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation_action') THEN
    CREATE TYPE recommendation_action AS ENUM ('BUY', 'SELL', 'HOLD');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub text UNIQUE,
  email text UNIQUE,
  display_name text,
  password_hash text,
  preferred_language text,
  role user_role NOT NULL DEFAULT 'TRADER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language text;

CREATE TABLE IF NOT EXISTS stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  name text,
  isin text,
  sector_id integer,
  sector_name text,
  currency text NOT NULL DEFAULT 'LKR',
  is_active boolean NOT NULL DEFAULT true,
  last_price numeric(20,6),
  previous_close numeric(20,6),
  day_change numeric(20,6),
  change_percentage numeric(20,6),
  day_high numeric(20,6),
  day_low numeric(20,6),
  day_open numeric(20,6),
  share_volume bigint,
  trade_volume bigint,
  turnover numeric(20,6),
  market_cap numeric(20,6),
  last_traded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS sector_name text;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS last_price numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS previous_close numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS day_change numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS change_percentage numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS day_high numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS day_low numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS day_open numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS share_volume bigint;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS trade_volume bigint;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS turnover numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS market_cap numeric(20,6);
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS last_traded_at timestamptz;

CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'LKR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
  quantity numeric(20,6) NOT NULL DEFAULT 0,
  average_cost numeric(20,6) NOT NULL DEFAULT 0,
  buy_commission numeric(20,6) NOT NULL DEFAULT 0,
  sell_commission_rate numeric(10,6) NOT NULL DEFAULT 1.120000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, stock_id)
);

ALTER TABLE holdings ADD COLUMN IF NOT EXISTS buy_commission numeric(20,6) NOT NULL DEFAULT 0;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS sell_commission_rate numeric(10,6) NOT NULL DEFAULT 1.120000;
ALTER TABLE holdings ALTER COLUMN sell_commission_rate SET DEFAULT 1.120000;

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
  side recommendation_action NOT NULL,
  quantity numeric(20,6) NOT NULL,
  price numeric(20,6) NOT NULL,
  fees numeric(20,6) NOT NULL DEFAULT 0,
  executed_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, stock_id)
);

CREATE TABLE IF NOT EXISTS historical_prices (
  time timestamptz NOT NULL,
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  open numeric(20,6),
  high numeric(20,6),
  low numeric(20,6),
  close numeric(20,6),
  volume bigint,
  vwap numeric(20,6),
  source text NOT NULL DEFAULT 'CSE',
  PRIMARY KEY (stock_id, time)
);

DO $$
BEGIN
  BEGIN
    PERFORM create_hypertable('historical_prices', by_range('time'), if_not_exists => TRUE);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS indicators (
  time timestamptz NOT NULL,
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  timeframe text NOT NULL,
  rsi numeric(20,6),
  macd numeric(20,6),
  macd_signal numeric(20,6),
  macd_hist numeric(20,6),
  ema_12 numeric(20,6),
  ema_26 numeric(20,6),
  sma_20 numeric(20,6),
  bb_upper numeric(20,6),
  bb_middle numeric(20,6),
  bb_lower numeric(20,6),
  atr_14 numeric(20,6),
  vwap numeric(20,6),
  stoch_k numeric(20,6),
  stoch_d numeric(20,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stock_id, timeframe, time)
);

DO $$
BEGIN
  BEGIN
    PERFORM create_hypertable('indicators', by_range('time'), if_not_exists => TRUE);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  timeframe text NOT NULL,
  predicted_at timestamptz NOT NULL,
  predicted_price numeric(20,6),
  predicted_trend recommendation_action,
  confidence numeric(5,2) NOT NULL,
  model_name text NOT NULL,
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS predictions_stock_time_idx ON predictions (stock_id, predicted_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stock_id uuid REFERENCES stocks(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  channel alert_channel NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alerts_user_idx ON alerts (user_id);

CREATE TABLE IF NOT EXISTS backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  equity_curve jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  period_end_date date NOT NULL,
  statement_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'CSE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_id, period_end_date, statement_type)
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id uuid REFERENCES stocks(id) ON DELETE SET NULL,
  category text,
  title text NOT NULL,
  published_at timestamptz,
  content text,
  source_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_published_idx ON announcements (published_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
