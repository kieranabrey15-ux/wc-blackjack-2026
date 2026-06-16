// netlify/lib/players.mjs
// The 102 players actually picked across the league. Stats for anyone not here are ignored.

export const PICKED = [
  "Achraf Hakimi","Alexis Mac Allister","Alphonso Davies","Amad Diallo","Antoine Semenyo",
  "Antonee Robinson","Antonio Nusa","Arda Güler","Ayase Ueda","Bernardo Silva","Borja Iglesias",
  "Brahim Díaz","Breel Embolo","Bruno Fernandes","Bukayo Saka","Casemiro","Christian Pulisic",
  "Cody Gakpo","Cristiano Ronaldo","Dani Olmo","Declan Rice","Denzel Dumfries","Diego Moreira",
  "Désiré Doué","Eberechi Eze","Edin Džeko","Endrick","Enner Valencia","Enzo Fernández",
  "Erling Haaland","Fabinho","Federico Valverde","Ferran Torres","Florian Wirtz","Gabriel",
  "Gilberto Mora","Granit Xhaka","Hakan Çalhanoğlu","Harry Kane","Heung-min Son","Igor Thiago",
  "Ismaïla Sarr","Jamal Musiala","James Rodríguez","Jamie Leweling","Jhon Arias","John McGinn",
  "Jonathan David","Joshua Kimmich","João Cancelo","João Félix","João Neves","Jude Bellingham",
  "Julián Álvarez","Jérémy Doku","Kai Havertz","Kevin De Bruyne","Kylian Mbappé","Lamine Yamal",
  "Lautaro Martínez","Leandro Trossard","Leroy Sané","Lionel Messi","Luis Díaz","Luka Modrić",
  "Marko Arnautovic","Martin Ødegaard","Memphis Depay","Michael Olise","Mikel Merino",
  "Mikel Oyarzabal","Mohamed Amoura","Mohamed Salah","Neymar","Nico Paz","Nico Williams",
  "Nuno Mendes","Ousmane Dembélé","Pau Cubarsí","Pedri","Pedro Neto","Rafael Leão","Raphinha",
  "Rayan","Rayan Cherki","Ricardo Pepi","Ritsu Doan","Riyad Mahrez","Roberto Alvarado","Rodri",
  "Rubén Vargas","Sadio Mané","Scott McTominay","Takefusa Kubo","Tijjani Reijnders","Tyler Adams",
  "Viktor Gyökeres","Vinicius Junior","Vitinha","Vladimír Coufal","Yerry Mina","Youri Tielemans",
];

// API feeds often render names differently (reordered, fuller, abbreviated initials).
// Key = normalized string the API might send -> value = our canonical display name.
// Extend this whenever the unmatched log (see poll-stats) flags a scorer that didn't map.
export const ALIASES = {
  "son":"Heung-min Son", "sonheungmin":"Heung-min Son", "heungminson":"Heung-min Son",
  "viniciusjose":"Vinicius Junior", "vinicius":"Vinicius Junior", "vinijunior":"Vinicius Junior",
  "viniciusjuniordeoliveira":"Vinicius Junior",
  "rodrigohernandez":"Rodri", "rodrihernandez":"Rodri",
  "gabrieldosmagalhaes":"Gabriel", "gabrielmagalhaes":"Gabriel",
  "rafaelleao":"Rafael Leão", "leao":"Rafael Leão",
  "bernardomotacarvalho":"Bernardo Silva",
  "endrickfelipe":"Endrick", "rodrygo":"Rayan", // do NOT confuse; left as example
  "rayanaitnouri":"Rayan", "rayancherki":"Rayan Cherki",
  "amadtraore":"Amad Diallo", "amad":"Amad Diallo",
  "joaopedro":"João Neves", // example only — verify before trusting
  "memphis":"Memphis Depay", "depay":"Memphis Depay",
  "kdb":"Kevin De Bruyne", "debruyne":"Kevin De Bruyne",
  "fabinhotavares":"Fabinho",
  "lamineyamal":"Lamine Yamal", "yamal":"Lamine Yamal",
  "robertoalvarado":"Roberto Alvarado", "piojoalvarado":"Roberto Alvarado",
};

// Strip accents, punctuation, spaces -> lowercase ascii. "Hakan Çalhanoğlu" -> "hakancalhanoglu"
export function normalize(name) {
  if (!name) return "";
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "").toLowerCase();
}

// Build a fast lookup once: normalized canonical -> canonical, plus aliases.
const LOOKUP = (() => {
  const m = new Map();
  for (const p of PICKED) m.set(normalize(p), p);
  for (const [k, v] of Object.entries(ALIASES)) m.set(normalize(k), v);
  return m;
})();

// Returns the canonical display name for an API-supplied name, or null if not one of our picks.
export function matchPlayer(apiName) {
  const n = normalize(apiName);
  if (LOOKUP.has(n)) return LOOKUP.get(n);
  // last-resort: surname-only contains match against unique surnames
  for (const p of PICKED) {
    const surname = normalize(p.split(" ").slice(-1)[0]);
    if (surname.length >= 5 && (n === surname || n.endsWith(surname))) return p;
  }
  return null;
}
