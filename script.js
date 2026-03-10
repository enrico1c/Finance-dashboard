let currentTicker = "NASDAQ:AAPL";

function changeTicker() {
  const input = document.getElementById("tickerInput").value.trim().toUpperCase();
  if (!input) return;
  currentTicker = "NASDAQ:" + input;
  loadChart(currentTicker);
}

function loadChart(symbol) {
  document.getElementById("priceChart").innerHTML = "";

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

loadChart(currentTicker);
