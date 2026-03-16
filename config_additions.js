/* ══════════════════════════════════════════════════════════════════
   config_additions.js  — New API key providers to add to KNOWN_PROVIDERS
   Merge these entries into the KNOWN_PROVIDERS array in config.js
   ══════════════════════════════════════════════════════════════════ */

/*
  ADD THESE TWO OBJECTS to the KNOWN_PROVIDERS array in config.js:

  {
    id:"gie",
    name:"GIE AGSI — EU Gas Storage",
    badge:"GIE",
    desc:"EU Natural Gas Storage transparency · Daily fill levels · LNG inventory · Country/facility breakdown · Free registration at agsi.gie.eu",
    limit:"Free (registration required)",
    docsUrl:"https://agsi.gie.eu/",
    sessionKey:"gie_call_count",
    limitWarn:null,
    limitMax:null
  },
  {
    id:"comtrade",
    name:"UN Comtrade+ — Trade Flows",
    badge:"UNC",
    desc:"Global bilateral trade flows by HS code · Critical minerals · 500 API calls/day free · Rare earths · Tungsten · Neon · All strategic commodities",
    limit:"500 calls/day (free tier)",
    docsUrl:"https://comtradeplus.un.org/",
    sessionKey:"comtrade_call_count",
    limitWarn:450,
    limitMax:500
  },

  Also add key helper functions (below):
*/

/* Add these helper functions to config.js after the existing getters */
function getGieKey()      { return getKey("gie");      }
function getComtradeKey() { return getKey("comtrade");  }
