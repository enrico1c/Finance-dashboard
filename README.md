# FINTERM — Finance Dashboard

A self-hosted, multi-panel financial intelligence dashboard built as a static GitHub Pages site. All API keys are managed server-side through a Vercel proxy so they never appear in browser requests.

**Live demo:** https://enrico1c.github.io/Finance-dashboard/

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [API Keys & Configuration](#api-keys--configuration)
4. [Panels & Widgets](#panels--widgets)
   - [Price Chart](#1-price-chart)
   - [Fundamentals](#2-fundamentals)
   - [News Hub](#3-news-hub)
   - [Analysts & Evaluation](#4-analysts--evaluation)
   - [Ownership](#5-ownership)
   - [Geo-Risk — Wars & Supply Chains](#6-geo-risk--wars--supply-chains)
   - [Supply Chain](#7-supply-chain)
   - [Alert Feed](#8-alert-feed)
   - [Macro-Intel](#9-macro-intel)
   - [Sector Watchlist](#10-sector-watchlist)
   - [Portfolio](#11-portfolio)
   - [Screener](#12-screener)
   - [Webhooks](#13-webhooks)
   - [Notes](#14-notes)
5. [Data Sources Reference](#data-sources-reference)
6. [Fallback Chain](#fallback-chain)
7. [Rate Limits & Caching](#rate-limits--caching)

---

## Quick Start

1. Open the dashboard at https://enrico1c.github.io/Finance-dashboard/
2. Click **⚙ API** in the top bar to open the key configuration modal
3. Add at least one key — **Finnhub** (free, 60 req/min) gives the most coverage with zero configuration
4. Type a ticker in the search box (e.g. `AAPL`, `TSLA`, `MIL:ENI`) and press Enter
5. Each panel loads its data independently and falls back gracefully when a source is unavailable

All keys are stored in `localStorage` and proxied through the Vercel backend — they are never sent directly from your browser to third-party APIs.

---

## Architecture

```
Browser (GitHub Pages — static HTML/JS/CSS)
  │
  ├─ finnhub.js      →  Finnhub REST + WebSocket  (profile, quote, earnings, news, insiders)
  ├─ api.js          →  Alpha Vantage via Vercel proxy  (financials, earnings history, overview)
  ├─ fmp.js          →  Financial Modeling Prep via Vercel proxy  (ratios, statements, calendar)
  ├─ fred.js         →  FRED (St. Louis Fed)  — open, no key  (yield curve, macro series)
  ├─ technical.js    →  Price history waterfall  (Finnhub → AV → Stooq fallback)
  ├─ lwchart.js      →  Lightweight Charts rendering engine  (replaces TradingView widget)
  ├─ worldmonitor.js →  WorldMonitor.app  (conflicts, supply chain, signals)
  ├─ congress.js     →  STOCK Act disclosure data  (congressional trades JSON)
  ├─ massive.js      →  Massive.io alternative data  (macro, flow, sentiment)
  └─ ...20+ more modules
  
  ↕ All keyed API calls
  
Vercel Backend (finterm-backend.vercel.app)
  └─ /api/proxy  →  appends stored API keys, forwards to provider, returns response
```

**Session caching:** Every API response is cached in `sessionStorage` for 15–30 minutes per symbol/endpoint, so switching tickers and back does not re-consume quota.

**WebSocket:** A single Finnhub WebSocket connection is kept open and shared across the portfolio, watchlist, and quote panels using a subscription registry.

---

## API Keys & Configuration

Click **⚙ API** in the top bar to open the key management modal. Each provider has its own field.

| Key | Provider | Free Tier | What it unlocks |
|-----|----------|-----------|-----------------|
| `finnhub` | [finnhub.io](https://finnhub.io) | 60 req/min | Quote, profile, earnings, recommendations, insiders, news, WebSocket |
| `fmp` | [financialmodelingprep.com](https://financialmodelingprep.com) | 250 req/day | Ratios, income/balance/CF statements, IPO calendar, transcripts |
| `av` | [alphavantage.co](https://alphavantage.co) | 25 req/day | Earnings history, financial statements, technical indicators, news sentiment |
| `twelvedata` | [twelvedata.com](https://twelvedata.com) | 800 req/day | Dividends, splits, price history fallback |
| `eia` | [eia.gov/opendata](https://www.eia.gov/opendata/) | Unlimited | US energy storage, WTI, Henry Hub, coal stocks |
| `companieshouse` | [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk) | 600 req/5min | UK corporate registry, PSC beneficial ownership, directors |
| `massive` | [massive.io](https://massive.io) | Varies | Alternative macro data, institutional flow, sentiment |
| `yahoo` | RapidAPI Yahoo Finance | 500 req/month | Trending tickers, options chain |

Providers with fully open data (no key required): **FRED**, **FINRA**, **SEC EDGAR**, **NOAA**, **USGS**, **NASA EONET**, **GIE AGSI**, **UN Comtrade**, **Frankfurter ECB rates**, **WorldMonitor**.

---

## Panels & Widgets

### 1. Price Chart

**Panel ID:** `panel-chart`

Displays an interactive OHLCV candlestick chart for the selected ticker using the open-source [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) library.

**Tabs / controls:**
| Control | Description |
|---------|-------------|
| Resolution buttons `[1m][5m][15m][1h][4h][1D][1W]` | Switch timeframe; intraday bars use Alpaca/Twelve Data, daily uses Finnhub/AV/Stooq |
| Indicator buttons `[E20][E50][BB][VWAP][PSAR][VMA][Inh][Pvt]` | Toggle overlays; computed client-side from OHLCV data |
| `[Analyse]` | Opens a technical analysis summary (RSI, MACD, BB, ATR signals) |
| `[2nd]` | Splits the panel into a second simultaneous chart (different ticker or timeframe) |

**Data sources:**
- **Finnhub** `/stock/candle` — daily and weekly bars (primary)
- **Alpha Vantage** `TIME_SERIES_DAILY` — fallback when Finnhub quota is exhausted
- **Stooq** `stooq.com/q/d/l/` — tertiary fallback, no key, long history
- **Alpaca Markets** — intraday bars (1m–4h) via direct browser fetch with CORS

**Key required:** None for daily charts (Stooq fallback is always free). Finnhub key improves freshness.

---

### 2. Fundamentals

**Panel ID:** `panel-fundamentals`

Five-tab deep-dive on the selected company. Data loads in parallel when the panel is first opened and is cached for 30 minutes.

#### OVERVIEW tab
Displays a company header (name, exchange, sector, employees, website) and a 12-cell metrics grid:

| Metric | Source |
|--------|--------|
| Market Cap | FMP `/profile` → Finnhub profile |
| P/E TTM | FMP `/stable/ratios-ttm` → Finnhub `/stock/metric` |
| EV/EBITDA | FMP → Finnhub metrics |
| P/S, P/B | FMP → Finnhub metrics |
| Beta | FMP → Finnhub profile → Finnhub metrics |
| ROE, ROA | FMP → Finnhub metrics |
| Net Margin, Gross Margin | FMP → Finnhub metrics |
| D/E Ratio | FMP ratios |
| Dividend Yield | FMP → Finnhub metrics |

Below the grid: Revenue TTM and Net Income TTM (from Alpha Vantage income statement), then a company description (from FMP profile).

The Finnhub `/stock/metric?metric=all` endpoint is always fetched once per ticker to supplement any fields FMP returns as null (common on free-tier plans).

#### FINANCIALS tab
Three-year income statement, balance sheet, and cash flow statement in scrollable tables. Toggle between **Statements** and **Dividends** with the sub-tab bar.

**Data waterfall:**
1. **Alpha Vantage** `INCOME_STATEMENT`, `BALANCE_SHEET`, `CASH_FLOW` — 5 years annual
2. **FMP** `/stable/income-statement`, `/balance-sheet-statement`, `/cash-flow-statement` — if AV is empty
3. **SEC EDGAR XBRL** `data.sec.gov/api/xbrl/companyfacts/` — free fallback, no key, US companies only
4. **Finnhub** `/stock/metric?metric=all` — key financial ratios grid if all statement sources fail

**Dividends:** FMP `/stable/dividends` → FMP `/v3/historical-price-full/stock_dividend` → Twelve Data → Finnhub metrics (yield/DPS only as last resort)

#### EARNINGS tab
Two sections: historical EPS beats/misses and forward analyst consensus.

**Historical EPS:**
1. **Finnhub** `/stock/earnings` — quarterly EPS actual vs estimate, surprise % (primary, fast)
2. **Alpha Vantage** `EARNINGS` — if Finnhub unavailable
3. **FMP** `/api/v3/earnings-surprises` — additional fallback

**Forward Estimates:**
1. **FMP** `/api/v3/analyst-estimates` — quarterly/annual EPS mean/low/high + revenue estimates
2. **Finnhub** `recs.history` — analyst recommendation counts (Strong Buy / Buy / Hold / Sell) when FMP is unavailable

#### VALUATION tab
Three sections loaded lazily when the tab is opened:

**WACC Calculator** — computes Weighted Average Cost of Capital in real time:
- **Beta:** FMP ratios → Finnhub profile → AV overview → fallback 1.0
- **Risk-Free Rate (Rf):** FRED `DGS10` (US 10Y Treasury, live) → `window._treasuryYields` cache → hardcoded 4.5%
- **Equity Risk Premium:** Damodaran implied ERP (hardcoded 4.60% as of Jan 2026, updated annually)
- **Cost of Debt (Kd):** FMP income statement (`interestExpense / totalDebt`) → fallback 5.5%
- **Tax Rate:** FMP income statement (`incomeTaxExpense / incomeBeforeTax`) → fallback 21%
- **D/E Ratio:** FMP ratios → fallback 0.30
- Terminal growth rate is user-adjustable; updates the implied EV/EBITDA exit multiple live

**Revenue Segments:** FMP `/revenue-product-segmentation` and `/revenue-geographic-segmentation` — shows how revenue splits across product lines and geographies.

**Short Interest:** FINRA official short interest (twice-monthly, no key required) via `finra.js`.

#### FILINGS tab
Three sub-sections (SEC Filings / Insider Trades / Transcripts):

**SEC Filings:** SEC EDGAR search `efts.sec.gov` — lists 10-K, 10-Q, 8-K, DEF 14A filings with direct links to EDGAR. No API key required.

**Insider Trades (Form 4):** Finnhub `/stock/insider-transactions` → SEC EDGAR full-text Form 4 search. Shows name, role, transaction type, shares, price, date.

**Transcripts:** FMP `/v3/earning_call_transcript` → SEC EDGAR 8-K exhibit search. No setup banner — falls through to EDGAR automatically when FMP is unavailable.

---

### 3. News Hub

**Panel ID:** `panel-news`

**NEWS tab:** Ticker-specific news feed combining multiple sources. Each article shows headline, source, sentiment badge (Bullish/Bearish/Neutral), and a toggle to expand the summary.

**Data sources:**
- **Alpha Vantage** `NEWS_SENTIMENT` — sentiment-scored articles with tickers mentioned
- **Finnhub** `/company-news` — latest company news, 14-day lookback
- **APITube** — alternative financial news with NLP filtering

**INTEL tab:** Macro and policy intelligence feed from `intel.js` and WorldMonitor signals, showing geopolitical developments linked to affected tickers and sectors.

---

### 4. Analysts & Evaluation

**Panel ID:** `panel-analysts`

Powered by the UARS (Universal Analyst Rating System) engine (`uars-widget.js`). Shows a composite analyst score (0–100) with rating distribution and supporting detail.

**Tabs:**
- **OVERVIEW:** Composite score gauge, buy/hold/sell consensus bar, confidence band
- **MODEL 1 / 2 / 3:** Breakdown by scoring model (fundamental, technical, macro)

**Data sources:**
- **Finnhub** `/stock/recommendation` — monthly recommendation counts
- **Finnhub** `/stock/price-target` — mean/high/low analyst price target
- **Finnhub** `/stock/upgrade-downgrade` — recent rating changes with analyst firm names
- **FMP** analyst ratings — supplementary consensus data

---

### 5. Ownership

**Panel ID:** `panel-ownership`

**HDS tab (Insiders & Holders):**
- Recent insider transactions (purchase, sale, grant) — **Finnhub** `/stock/insider-transactions`
- Top institutional holders — **Finnhub** `/institutional/ownership`

**MGMT tab (Management):**
- Company logo, full name, exchange, sector, IPO date, shares outstanding — **Finnhub** `/stock/profile2`
- Key executives (CEO, CFO, COO) with titles — **FMP** `/api/v3/key-executives`

**PSC / BO tab (Beneficial Ownership):**
- UK Companies House registry: company number, registered office, SIC codes, incorporation date
- Persons with Significant Control (PSC) — beneficial owners with >25% interest
- Active directors list
- **Source:** Companies House Public Data API — free key from developer.company-information.service.gov.uk
- Only runs for UK/LSE-listed tickers, or for any ticker when a CH key is configured

---

### 6. Geo-Risk — Wars & Supply Chains

**Panel ID:** `panel-geopolitical`

Real-time geopolitical intelligence with 12 tabs. Each tab lazy-loads when first viewed.

| Tab | What it shows | Data source |
|-----|--------------|-------------|
| **WARS** | Active conflict zones with intensity level, displacement figures, resource impact tags | WorldMonitor.app |
| **RESOURCES** | Critical resources at risk (oil, wheat, lithium, rare earths) with affected tickers | WorldMonitor |
| **ROUTES** | Key shipping chokepoints (Suez, Panama, Strait of Malacca, Red Sea) + vessel traffic impact | WorldMonitor |
| **INTEL** | Theater posture and country risk scores by region | WorldMonitor |
| **SIGNALS** | Intelligence signals linked to sectors and tickers | WorldMonitor |
| **QUAKES** | Global earthquakes M4.5+ in the past 7 days, live | USGS Earthquake Hazards API (open) |
| **GPS JAM** | Active GPS jamming zones worldwide | WorldMonitor |
| **MIL·OPS** | Military operations tracker | WorldMonitor |
| **FEMA** | US major disaster declarations + GDACS international alerts | FEMA OpenFEMA + GDACS RSS (open) |
| **TERROR** | Recent terrorism incidents | WorldMonitor |
| **CYBER** | Cyber incident tracker | WorldMonitor |
| **TRAVEL** | Travel advisories + border status | WorldMonitor |
| **AIR** | Real-time air quality (PM2.5, NO2, O3, CO) by city | OpenAQ API (open, generous limits) |

**Key required:** None. WorldMonitor and all government APIs used here are publicly accessible.

---

### 7. Supply Chain

**Panel ID:** `panel-supply`

Tracks global supply chain metrics across 7 tabs.

| Tab | What it shows | Data source |
|-----|--------------|-------------|
| **CHOKE** | Shipping chokepoint status + regional disruption alerts | WorldMonitor |
| **SHIPPING** | Container freight rates (Shanghai Index), port congestion levels | WorldMonitor |
| **MINERALS** | Critical mineral prices and supply risk (lithium, cobalt, nickel, rare earths) | WorldMonitor + UN Comtrade |
| **FLIGHTS** | Commercial aviation disruption alerts | WorldMonitor |
| **ENERGY** | EU natural gas storage by country (% capacity), US EIA petroleum/coal stocks | GIE AGSI (open) + EIA (free key) |
| **WEATHER** | Weather alerts affecting agricultural belts and shipping routes | WorldMonitor + OpenAQ |
| **COT** | CFTC Commitments of Traders — speculative net positioning | CFTC (open) via `finterm-modules.js` |

---

### 8. Alert Feed

**Panel ID:** `panel-alert`

Aggregated real-time alert stream with three tabs.

**CONGRESS tab:** US congressional stock trading disclosures under the STOCK Act.
- Shows recent trades by members of Congress: ticker, trade type (buy/sell), amount range, disclosure date, disclosure delay
- Flags trades where the member sits on a committee overseeing the company's sector (conflict of interest)
- **Source:** Static JSON dataset (`data/congress/`) built from STOCK Act public disclosures — no key required

**NOAA tab:** Severe weather alerts for the continental US.
- Tornado warnings, flash flood watches, winter storms, heat advisories
- **Source:** NOAA Weather API `api.weather.gov` — fully open, no key

**EONET tab:** NASA Earth Observatory Natural Event Tracker.
- Wildfires, volcanic eruptions, floods, severe storms with geographic coordinates
- **Source:** NASA EONET API `eonet.gsfc.nasa.gov` — open, no key

---

### 9. Macro-Intel

**Panel ID:** `panel-macro`

The broadest panel — macroeconomic signals, calendar, and cross-asset data across 15+ tabs.

| Tab | What it shows | Data source |
|-----|--------------|-------------|
| **SIGNALS** | WorldMonitor macro intelligence signals linked to tickers | WorldMonitor |
| **COMMODITIES** | IMF commodity prices (oil, metals, agriculture) | WorldMonitor / IMF |
| **RISK** | Country risk scores, CDS-equivalent spreads | WorldMonitor |
| **PREDICTIONS** | IMF/consensus macro forecasts (GDP, inflation, rates) | WorldMonitor |
| **YIELD** | US Treasury yield curve (2Y/5Y/10Y/30Y), HY OAS, IG OAS credit spreads | **FRED** series (open) |
| **ECON CAL** | Upcoming economic releases (CPI, NFP, GDP, FOMC) with consensus/prior | **Finnhub** `/calendar/economic` |
| **CRYPTO** | Bitcoin dominance, total market cap, ETH/BTC ratio | WorldMonitor / public aggregators |
| **FLOWS** | ETF sector inflows/outflows | WorldMonitor |
| **SECTORS** | Sector performance heatmap (1D, 1W, 1M) | WorldMonitor |
| **IPO** | Upcoming IPO calendar with expected price range and exchange | **FMP** `/api/v3/ipo-calendar` |
| **TRENDING** | Currently trending tickers with momentum score | Yahoo Finance via RapidAPI |
| **BONDS** | TLT vs TBT, HY/IG spread, duration risk | FRED + WorldMonitor |
| **GLOBAL** | GDP and inflation by country | WorldMonitor / IMF |
| **PMI** | Manufacturing and services PMI flash readings | WorldMonitor |
| **BANKS** | Central bank policy rates (Fed, ECB, BOE, BOJ, SNB) + forward guidance | WorldMonitor + FRED |

---

### 10. Sector Watchlist

**Panel ID:** `panel-watchlist`

A dynamic table of tickers related to the current search topic or sector. Populated when the user enters a topic (e.g. "AI", "defence", "semiconductors") in the topic search box.

**Columns:** Name, Price, Day Change %, Market Cap, P/E, Star Score (UARS composite)

**How it populates:**
1. Finnhub `/stock/peers` returns sector peers for the current ticker
2. Each peer's profile and quote are fetched in parallel via Finnhub
3. FMP ratios are fetched per peer for the P/E column
4. UARS scoring runs on the combined data to produce the Star Score

Rows update in real-time via the shared Finnhub WebSocket connection.

---

### 11. Portfolio

**Panel ID:** `panel-portfolio`

**POSITIONS tab:** A personal holdings tracker. Enter your positions (ticker, shares, average cost) and the panel shows live P&L.

| Column | Source |
|--------|--------|
| Current Price | Finnhub WebSocket (real-time tick) |
| Day Change | Finnhub WebSocket |
| Unrealized P&L | Computed: (current − cost) × shares |
| Total Value | Computed: current price × shares |

Prices refresh on every WebSocket tick (~1–3 seconds during market hours). Positions are stored in `localStorage`.

**Key required:** Finnhub (WebSocket requires a valid token).

---

### 12. Screener

**Panel ID:** `panel-screener`

Filter stocks by fundamental and technical criteria.

**FILTERS tab:** Rule builder — add conditions such as `P/E < 20`, `Market Cap > 10B`, `Dividend Yield > 2%`, `RSI < 40`.

**RESULTS tab:** Matching stocks rendered as a sortable table. Each result links to the main dashboard ticker.

**Data sources:**
- **Alpha Vantage** overview data for fundamental metrics
- **FMP** ratios for P/E, P/B, EV/EBITDA
- **Twelve Data** for dividend yield and split-adjusted prices

---

### 13. Webhooks

**Panel ID:** `panel-webhooks`

Build automated alert rules that fire HTTP webhooks to any destination (Slack, Discord, custom endpoint).

**ALERTS tab:** List of configured rules (e.g. "AAPL price crosses $200 → POST to Slack").

**BUILDER tab:** UI to create rules — choose ticker, condition (price, RSI, volume, news sentiment), threshold, and destination URL.

**LOG tab:** Execution history with timestamps, HTTP status codes, and response previews.

**Storage:** Rules stored in `localStorage`. Optional Supabase backend for persistence across devices.

---

### 14. Notes

**Panel ID:** `panel-notes`

A free-text scratchpad for trading ideas, target prices, and research notes. Content is stored in `localStorage` and never sent to any server.

---

## Data Sources Reference

| Provider | Base URL | Auth | Rate Limit | Cost |
|----------|----------|------|------------|------|
| Finnhub | `finnhub.io/api/v1` | `?token=KEY` | 60 req/min | Free tier available |
| Alpha Vantage | `alphavantage.co/query` | `&apikey=KEY` | 25 req/day | Free tier available |
| FMP | `financialmodelingprep.com/api` | `?apikey=KEY` | 250 req/day | Free tier available |
| Twelve Data | `api.twelvedata.com` | `&apikey=KEY` | 800 req/day | Free tier available |
| FRED | `api.stlouisfed.org/fred` | `&api_key=KEY` | Unlimited | Free |
| FINRA | `api.finra.org` | None | Generous | Free |
| SEC EDGAR | `data.sec.gov`, `efts.sec.gov` | None | Reasonable | Free |
| NOAA Weather | `api.weather.gov` | None | Unlimited | Free |
| USGS Earthquakes | `earthquake.usgs.gov` | None | Unlimited | Free |
| NASA EONET | `eonet.gsfc.nasa.gov` | None | Unlimited | Free |
| OpenAQ | `api.openaq.org` | None | Generous | Free |
| GIE AGSI | `agsi.gie.eu/api` | None | Unlimited | Free |
| Companies House UK | `api.company-information.service.gov.uk` | `Authorization: Basic` | 600/5min | Free key |
| EIA | `api.eia.gov` | `&api_key=KEY` | Unlimited | Free key |
| WorldMonitor | `worldmonitor.app` | None | Generous | Free |
| Stooq | `stooq.com/q/d/l` | None | Soft limit | Free |
| Frankfurter ECB | `api.frankfurter.app` | None | Unlimited | Free |

---

## Fallback Chain

Every data point follows a defined cascade. If a source fails or lacks a key, the next source is tried automatically — the panel never stays blank if a free alternative exists.

```
Company Profile:    FMP /profile  →  Finnhub /profile2  →  AV OVERVIEW
Ratios (P/E, etc):  FMP /ratios-ttm  →  Finnhub /stock/metric  →  AV OVERVIEW
Financial Stmts:    AV (income/bal/CF)  →  FMP /stable  →  SEC EDGAR XBRL  →  Finnhub metrics
Earnings history:   Finnhub /stock/earnings  →  AV EARNINGS  →  FMP /earnings-surprises
Forward estimates:  FMP /analyst-estimates  →  Finnhub recs history  →  "unavailable" + retry
Dividends:          FMP /stable/dividends  →  FMP v3  →  Twelve Data  →  Finnhub metrics (yield only)
Price (chart):      Finnhub /candle  →  AV TIME_SERIES_DAILY  →  Stooq (free, no key)
Intraday candles:   Alpaca  →  Twelve Data  →  Finnhub (rate-limited, last resort)
Risk-Free Rate:     FRED DGS10  →  window._treasuryYields cache  →  hardcoded 4.5%
Short interest:     FINRA (open)  →  Finnhub  →  "no data"
SEC filings:        SEC EDGAR search (always available, no key)
Insider trades:     Finnhub /insider-transactions  →  SEC EDGAR Form 4 search
Transcripts:        FMP /earning_call_transcript  →  SEC EDGAR 8-K exhibits
```

---

## Rate Limits & Caching

All API responses are cached in `sessionStorage` with a 15-minute TTL (30 minutes for Fundamentals). The cache key includes both the endpoint and the ticker symbol.

**What this means in practice:**
- Switching between tickers and back does **not** re-consume API quota
- Refreshing the page clears the session cache (new quota is used)
- The call counter in the top-right corner shows how many FMP calls have been made this session

**Finnhub WebSocket** is the exception — it maintains a persistent connection and pushes live price ticks without consuming REST quota.

**FMP free tier (250 req/day)** is the most constrained. The `fmpLoadAll()` function batches all required endpoints into a single parallel call (9 endpoints at once) to minimise the number of sequential requests.

---

## Local Development

```bash
# Clone the repo
git clone https://github.com/enrico1c/Finance-dashboard.git
cd Finance-dashboard

# Serve locally (any static server works)
npx serve .
# or
python -m http.server 8080
```

Open `http://localhost:8080` in your browser. Add API keys via the **⚙ API** modal — they are stored in `localStorage` and read directly on local builds (the Vercel proxy is only needed in production to hide keys from the network tab).

---

*Data is provided for informational purposes only and does not constitute financial advice.*
