let currentTicker = "NASDAQ:AAPL";

function openTab(evt, tabName) {

  let tabcontent = document.getElementsByClassName("tabcontent");
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  let tablinks = document.getElementsByClassName("tablink");
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].classList.remove("active");
  }

  document.getElementById(tabName).style.display = "block";
}

function loadChart(symbol) {

  document.getElementById("priceChart").innerHTML = "";

  new TradingView.widget({
    autosize: true,
    symbol: symbol,
    interval: "D",
    theme: "dark",
    style: "1",
    locale: "it",
    container_id: "priceChart"
  });

}

loadChart(currentTicker);
