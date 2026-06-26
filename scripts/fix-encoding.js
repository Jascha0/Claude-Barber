const fs = require("fs");

function fixFile(filePath) {
  let c = fs.readFileSync(filePath, "utf8");
  const fixes = [
    ["nÃ¶tig", "nötig"],
    ["fÃ¼r", "für"],
    ["LÃ¤uft", "Läuft"],
    ["KÃ¼rze", "Kürze"],
    ["MÃ¼nchen", "München"],
    ["kÃ¼ndbar", "kündbar"],
    ["PersÃ¶nliche", "Persönliche"],
    ["PrioritÃ¤ts", "Prioritäts"],
    ["VerfÃ¼gbarkeit", "Verfügbarkeit"],
    ["BuchungsÃ¼bersicht", "Buchungsübersicht"],
    ["WhatsApp-BestÃ¤tigungen", "WhatsApp-Bestätigungen"],
    ["BestÃ¤tigungen", "Bestätigungen"],
    ["BuchungsbestÃ¤tigung", "Buchungsbestätigung"],
    ["EinrichtungsgebÃ¼hr", "Einrichtungsgebühr"],
    ["Ãbersicht", "Übersicht"],
    ["Ãberraschungen", "Überraschungen"],
    ["Ãffnungszeiten", "Öffnungszeiten"],
    ["wÃ¤hlen", "wählen"],
    ["Danke! Wir melden uns in KÃ¼r", "Danke! Wir melden uns in Kür"],
    ["Ã¼", "ü"],
    ["Ã¶", "ö"],
    ["Ã¤", "ä"],
    ["Ã", "Ä"],
    ["Â·", "·"],
    ["Â©", "©"],
    ["â", "–"],
    ["â¦", "…"],
    ["Wird gesendetâ¦", "Wird gesendet…"],
  ];
  fixes.forEach(([a, b]) => {
    while (c.includes(a)) c = c.split(a).join(b);
  });
  fs.writeFileSync(filePath, c, "utf8");
  console.log("Fixed:", filePath);
}

process.argv.slice(2).forEach(fixFile);
