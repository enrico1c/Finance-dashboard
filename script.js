let currentTicker = "AAPL";
let currentNewsMode = "ticker";

const panelState = {
  chart: { visible: true, size: 2 },
  fundamentals: { visible: true, size: 1 },
  news: { visible: true, size: 1 },
  notes: { visible: true, size: 1 },
  comparables: { visible: true, size: 1 }
};

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mapTickerToTradingView(ticker) {
  return `NASDAQ:${ticker}`;
}

function setNewsModeLabel(text) {
  const label = document.getElementById("newsModeLabel");
  if (label) label.textContent = text;
}

function loadChart(symbol) {
  const chartEl = document.getElementById("priceChart");
  chartEl.innerHTML = "";

  new TradingView.widget({
    autosize: true,
    symbol: symbol,
    interval: "D",
    timezone: "Europe/Rome",
    theme: "dark",
    style: "1",
    locale: "it",
    toolbar_bg: "#171b22",
    enable_publishing: false,
    allow_symbol_change: true,
    container_id: "priceChart"
  });
}

function loadFundamentals(ticker) {
  const box = document.getElementById("financials");
  box.innerHTML = `
    <div class="metric"><span>Ticker</span><span>${escapeHtml(ticker)}</span></div>
    <div class="metric"><span>Status</span><span>Interactive layout active</span></div>
    <div class="metric"><span>Display</span><span>No page scrolling</span></div>
    <div class="metric"><span>Note</span><span>Possiamo aggiungere metriche reali nel passo successivo</span></div>
  `;
}

function buildSearchLinks(query, mode) {
  const label = mode === "ticker" ? "Ticker" : "Topic/Country";

  return [
    {
      source: "Google News",
      title: `Search ${query} on Google News`,
      url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
      summary: `${label} search via Google News.`
    },
    {
      source: "Ground News",
      title: `Search ${query} on Ground News`,
      url: `https://ground.news/search?query=${encodeURIComponent(query)}`,
      summary: `${label} search via Ground News.`
    },
    {
      source: "Reuters",
      title: `Search ${query} on Reuters`,
      url: `https://www.reuters.com/site-search/?query=${encodeURIComponent(query)}`,
      summary: `${label} search via Reuters.`
    },
    {
      source: "CNBC",
      title: `Search ${query} on CNBC`,
      url: `https://www.cnbc.com/search/?query=${encodeURIComponent(query)}`,
      summary: `${label} search via CNBC.`
    },
    {
      source: "Financial Times",
      title: `Search ${query} on FT`,
      url: `https://www.ft.com/search?q=${encodeURIComponent(query)}`,
      summary: `${label} search via Financial Times.`
    },
    {
      source: "The Economist",
      title: `Search ${query} on The Economist`,
      url: `https://www.economist.com/search?q=${encodeURIComponent(query)}`,
      summary: `${label} search via The Economist.`
    },
    {
      source: "New York Times",
      title: `Search ${query} on NYT`,
      url: `https://www.nytimes.com/search?query=${encodeURIComponent(query)}`,
      summary: `${label} search via New York Times.`
    }
  ];
}

function renderNews(items) {
  const box = document.getElementById("newsBox");

  if (!items.length) {
    box.innerHTML = "No links found.";
    return;
  }

  box.innerHTML = `
    <div class="news-list">
      ${items.map(item => `
        <div class="news-item">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
          <div class="news-meta">${escapeHtml(item.source)}</div>
          <div class="news-summary">${escapeHtml(item.summary || "")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function loadTickerNews(ticker) {
  currentNewsMode = "ticker";
  setNewsModeLabel(`Mode: Ticker News · ${ticker}`);
  renderNews(buildSearchLinks(ticker, "ticker"));
}

function searchTopicNews() {
  const query = document.getElementById("topicInput").value.trim();
  if (!query) return;

  currentNewsMode = "topic";
  setNewsModeLabel(`Mode: Topic/Country News · ${query}`);
  renderNews(buildSearchLinks(query, "topic"));
}

function loadComparables(ticker) {
  const box = document.getElementById("peers");
  box.innerHTML = `
    <div class="metric"><span>Main Ticker</span><span>${escapeHtml(ticker)}</span></div>
    <div class="metric"><span>News Mode</span><span>${escapeHtml(currentNewsMode)}</span></div>
    <div class="metric"><span>Visible Panels</span><span>${countVisiblePanels()}</span></div>
    <div class="metric"><span>Layout</span><span>Adaptive</span></div>
  `;
}

function countVisiblePanels() {
  return Object.values(panelState).filter(p => p.visible).length;
}

function resizePanel(panelName, delta) {
  const panel = panelState[panelName];
  if (!panel) return;

  panel.size += delta;
  if (panel.size < 1) panel.size = 1;
  if (panel.size > 3) panel.size = 3;

  applyLayout();
}

function applyLayout() {
  const chart = document.getElementById("panel-chart");
  const fundamentals = document.getElementById("panel-fundamentals");
  const news = document.getElementById("panel-news");
  const notes = document.getElementById("panel-notes");
  const comparables = document.getElementById("panel-comparables");

  const allPanels = {
    chart,
    fundamentals,
    news,
    notes,
    comparables
  };

  for (const key in allPanels) {
    if (panelState[key].visible) {
      allPanels[key].classList.remove("hidden");
    } else {
      allPanels[key].classList.add("hidden");
    }

    allPanels[key].style.gridColumn = "";
    allPanels[key].style.gridRow = "";
  }

  const visible = Object.keys(panelState).filter(key => panelState[key].visible);

  if (visible.length === 0) {
    chart.classList.remove("hidden");
    panelState.chart.visible = true;
  }

  const visibleNow = Object.keys(panelState).filter(key => panelState[key].visible);

  let rowCursor = 1;

  if (panelState.chart.visible) {
    chart.style.gridColumn = "1 / span 12";
    chart.style.gridRow = `${rowCursor} / span ${panelState.chart.size}`;
    rowCursor += panelState.chart.size;
  }

  const secondary = ["fundamentals", "news", "notes", "comparables"].filter(key => panelState[key].visible);

  if (secondary.length > 0) {
    let colStart = 1;
    const span = Math.floor(12 / secondary.length);

    secondary.forEach((key, index) => {
      const panelEl = allPanels[key];
      const start = colStart;
      const end = index === secondary.length - 1 ? 13 : colStart + span;

      panelEl.style.gridColumn = `${start} / ${end}`;
      panelEl.style.gridRow = `${rowCursor} / span ${panelState[key].size}`;

      colStart += span;
    });
  }

  loadComparables(currentTicker);
  setTimeout(() => loadChart(mapTickerToTradingView(currentTicker)), 50);
}

function changeTicker() {
  const input = document.getElementById("tickerInput").value.trim().toUpperCase();
  if (!input) return;

  currentTicker = input;
  loadChart(mapTickerToTradingView(currentTicker));
  loadFundamentals(currentTicker);
  loadTickerNews(currentTicker);
  loadComparables(currentTicker);
}

function setupChecklist() {
  const toggles = document.querySelectorAll(".panel-toggle");

  toggles.forEach(toggle => {
    toggle.addEventListener("change", function () {
      const panelName = this.dataset.panel;
      panelState[panelName].visible = this.checked;

      if (countVisiblePanels() === 0) {
        this.checked = true;
        panelState[panelName].visible = true;
      }

      applyLayout();
    });
  });
}

window.addEventListener("load", () => {
  setupChecklist();
  loadChart(mapTickerToTradingView(currentTicker));
  loadFundamentals(currentTicker);
  loadTickerNews(currentTicker);
  loadComparables(currentTicker);
  applyLayout();
});
