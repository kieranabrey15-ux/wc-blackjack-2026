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
  // Reordered / nickname / accented forms football-data.org may send.
  "son":"Heung-min Son","sonheungmin":"Heung-min Son","heungminson":"Heung-min Son","hson":"Heung-min Son",
  "vinicius":"Vinicius Junior","vinijr":"Vinicius Junior","vinijunior":"Vinicius Junior","viniciusjr":"Vinicius Junior",
  "viniciusjunior":"Vinicius Junior","viniciusjose":"Vinicius Junior","viniciusjosepaixaodeoliveirajunior":"Vinicius Junior",
  "rodri":"Rodri","rodrihernandez":"Rodri","rodrigohernandez":"Rodri",
  "gabriel":"Gabriel","gabrielmagalhaes":"Gabriel","gabrieldosmagalhaes":"Gabriel",
  "rafaelleao":"Rafael Leão","rafaleao":"Rafael Leão","leao":"Rafael Leão",
  "bernardosilva":"Bernardo Silva","bernardo":"Bernardo Silva","bernardomotacarvalho":"Bernardo Silva",
  "brunofernandes":"Bruno Fernandes","endrick":"Endrick",
  "rayancherki":"Rayan Cherki","memphis":"Memphis Depay","memphisdepay":"Memphis Depay","depay":"Memphis Depay",
  "kdb":"Kevin De Bruyne","debruyne":"Kevin De Bruyne","kevindebruyne":"Kevin De Bruyne",
  "lamineyamal":"Lamine Yamal","yamal":"Lamine Yamal","kylianmbappe":"Kylian Mbappé","mbappe":"Kylian Mbappé",
  "ousmanedembele":"Ousmane Dembélé","dembele":"Ousmane Dembélé","michaelolise":"Michael Olise","olise":"Michael Olise",
  "robertoalvarado":"Roberto Alvarado","alvarado":"Roberto Alvarado","piojoalvarado":"Roberto Alvarado",
  "jamesrodriguez":"James Rodríguez","james":"James Rodríguez",
  "mohamedsalah":"Mohamed Salah","salah":"Mohamed Salah","mohamedamoura":"Mohamed Amoura","amoura":"Mohamed Amoura",
  "hakancalhanoglu":"Hakan Çalhanoğlu","calhanoglu":"Hakan Çalhanoğlu","ardaguler":"Arda Güler","guler":"Arda Güler",
  "viktorgyokeres":"Viktor Gyökeres","gyokeres":"Viktor Gyökeres","martinodegaard":"Martin Ødegaard","odegaard":"Martin Ødegaard",
  "takefusakubo":"Takefusa Kubo","kubo":"Takefusa Kubo","ritsudoan":"Ritsu Doan",
  "lautaromartinez":"Lautaro Martínez","lautaro":"Lautaro Martínez","julianalvarez":"Julián Álvarez",
  "lionelmessi":"Lionel Messi","messi":"Lionel Messi","cristianoronaldo":"Cristiano Ronaldo","ronaldo":"Cristiano Ronaldo",
  "lukamodric":"Luka Modrić","modric":"Luka Modrić","achrafhakimi":"Achraf Hakimi","hakimi":"Achraf Hakimi",
  "antonionusa":"Antonio Nusa","nusa":"Antonio Nusa","ismailasarr":"Ismaïla Sarr","sadiomane":"Sadio Mané",
  "edindzeko":"Edin Džeko","vladimircoufal":"Vladimír Coufal","coufal":"Vladimír Coufal","jeremydoku":"Jérémy Doku",
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
