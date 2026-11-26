// Tiny offline Polish -> English translator for search descriptions.
// CLIP only understands English, so we map common words (with Polish inflections) to English.
// Unknown words are kept as they are, so English queries pass through unchanged.

// [stem, english]. Stems of 4+ letters match any word that starts with them (handles inflection).
// Shorter entries must match the whole word. Matching ignores Polish diacritics.
const DICT = [
  // people
  ['osob', 'person'], ['czlowiek', 'person'], ['ludzi', 'people'], ['ludzie', 'people'],
  ['mezczyzn', 'man'], ['facet', 'man'], ['pan', 'man'], ['pana', 'man'], ['kobiet', 'woman'], ['pani', 'woman'],
  ['dziecko', 'child'], ['dzieci', 'children'], ['dziecka', 'child'], ['chlop', 'boy'], ['dziewczyn', 'girl'],
  ['dziewczynk', 'little girl'], ['starsz', 'elderly'], ['staruszk', 'elderly person'], ['mlod', 'young'],
  ['tlum', 'crowd'], ['policjant', 'police officer'], ['rowerzyst', 'cyclist'], ['kierowc', 'driver'],
  // colours
  ['czerwon', 'red'], ['niebiesk', 'blue'], ['granatow', 'navy blue'], ['zielon', 'green'], ['zolt', 'yellow'],
  ['czarn', 'black'], ['bial', 'white'], ['szar', 'gray'], ['brazow', 'brown'], ['rozow', 'pink'],
  ['fiolet', 'purple'], ['pomarancz', 'orange'], ['bezow', 'beige'], ['zlot', 'golden'], ['srebrn', 'silver'],
  ['kolorow', 'colorful'], ['ciemn', 'dark'], ['jasn', 'light'],
  // clothing & items
  ['czap', 'hat'], ['kapelusz', 'hat'], ['kask', 'helmet'], ['kaptur', 'hood'], ['kurt', 'jacket'],
  ['plaszcz', 'coat'], ['koszulk', 't-shirt'], ['koszul', 'shirt'], ['bluz', 'sweatshirt'], ['sweter', 'sweater'],
  ['swetr', 'sweater'], ['spodni', 'trousers'], ['dzins', 'jeans'], ['spodenk', 'shorts'], ['spodnic', 'skirt'],
  ['sukien', 'dress'], ['garnitur', 'suit'], ['buty', 'shoes'], ['butach', 'shoes'], ['butami', 'shoes'],
  ['szalik', 'scarf'], ['rekawicz', 'gloves'], ['okular', 'glasses'], ['plecak', 'backpack'], ['torb', 'bag'],
  ['walizk', 'suitcase'], ['parasol', 'umbrella'], ['telefon', 'phone'], ['kamizel', 'vest'], ['mundur', 'uniform'],
  ['broda', 'beard'], ['brod', 'beard'], ['wlos', 'hair'], ['blond', 'blonde'], ['lys', 'bald'],
  ['dlug', 'long'], ['krotk', 'short'], ['wysok', 'tall'], ['nisk', 'short'], ['duz', 'big'],
  ['mal', 'small'], ['male', 'small'],
  // animals & vehicles
  ['pies', 'dog'], ['psa', 'dog'], ['psem', 'dog'], ['kot', 'cat'], ['kota', 'cat'], ['kotem', 'cat'],
  ['ptak', 'bird'], ['kon', 'horse'], ['konia', 'horse'], ['samochod', 'car'], ['auto', 'car'], ['aut', 'car'],
  ['rower', 'bicycle'], ['motocykl', 'motorcycle'], ['motor', 'motorcycle'], ['autobus', 'bus'],
  ['ciezarow', 'truck'], ['tramwaj', 'tram'], ['pociag', 'train'], ['hulajnog', 'scooter'], ['wozek', 'stroller'],
  ['wozk', 'stroller'],
  // actions
  ['odchodz', 'walking away, seen from behind'], ['odszedl', 'walking away, seen from behind'],
  ['odchodzac', 'walking away, seen from behind'], ['przychodz', 'walking towards the camera'],
  ['nadchodz', 'walking towards the camera'], ['idzie', 'walking'], ['idac', 'walking'], ['spaceruj', 'walking'],
  ['chodz', 'walking'], ['biegn', 'running'], ['biega', 'running'], ['stoi', 'standing'], ['stojac', 'standing'],
  ['siedz', 'sitting'], ['lezy', 'lying'], ['lezac', 'lying'], ['jedzie', 'riding'], ['jadac', 'riding'],
  ['prowadz', 'driving'], ['rozmawia', 'talking'], ['trzyma', 'holding'], ['niesie', 'carrying'],
  ['niosac', 'carrying'], ['pcha', 'pushing'], ['macha', 'waving'], ['tanczy', 'dancing'], ['skacze', 'jumping'],
  ['pali', 'smoking'], ['je', 'eating'], ['pije', 'drinking'], ['wchodz', 'entering'], ['wychodz', 'leaving'],
  ['przechodz', 'walking past'], ['wsiada', 'getting into'], ['wysiada', 'getting out of'],
  // places & scene
  ['ulic', 'street'], ['chodnik', 'sidewalk'], ['przejsci', 'crosswalk'], ['drog', 'road'], ['drzw', 'door'],
  ['sklep', 'shop'], ['parking', 'parking lot'], ['park', 'park'], ['las', 'forest'], ['lesie', 'forest'],
  ['plaz', 'beach'], ['morz', 'sea'], ['jezior', 'lake'], ['pokoj', 'room'], ['kuchni', 'kitchen'],
  ['schod', 'stairs'], ['budyn', 'building'], ['dom', 'house'], ['domu', 'house'], ['ogrod', 'garden'],
  ['brama', 'gate'], ['bramy', 'gate'], ['bramie', 'gate'], ['plot', 'fence'], ['drzew', 'tree'],
  ['noc', 'night'], ['nocy', 'night'], ['noca', 'at night'], ['dzien', 'day'], ['deszcz', 'rain'], ['snieg', 'snow'],
  ['sniegu', 'snow'], ['slonc', 'sun'], ['ciemno', 'dark'],
  // little words
  ['w', 'in'], ['we', 'in'], ['z', 'with'], ['ze', 'with'], ['i', 'and'], ['oraz', 'and'], ['na', 'on'],
  ['pod', 'under'], ['przy', 'near'], ['obok', 'next to'], ['przed', 'in front of'], ['za', 'behind'],
  ['do', 'to'], ['od', 'from'], ['po', 'on'], ['przez', 'through'], ['nad', 'above'], ['bez', 'without'],
  ['ktora', ''], ['ktory', ''], ['ktore', ''], ['ktorzy', ''], ['jest', ''], ['sa', ''], ['sie', ''],
  // command words and question words: the AI only needs WHAT to look for, so they are dropped
  ['znajd', ''], ['znalez', ''], ['szuka', ''], ['wyszuka', ''], ['sprawd', ''], ['pokaz', ''], ['zobacz', ''],
  ['zaznacz', ''], ['pojawi', ''], ['pojawil', ''], ['wystepuj', ''], ['widac', ''], ['widoczn', ''],
  ['miejsc', ''], ['obszar', ''], ['okienk', ''], ['prostok', ''], ['kadrze', ''], ['filmie', ''], ['nagrani', ''],
  ['czy', ''], ['kiedy', ''], ['gdzie', ''], ['tu', ''], ['tutaj', ''], ['tam', ''], ['tym', ''], ['tej', ''],
  ['byl', ''], ['byla', ''], ['bylo', ''], ['byly', ''], ['byli', ''], ['moment', ''], ['prosze', ''],
  ['ktos', 'someone'], ['jakis', 'a'], ['jakas', 'a'], ['jakies', 'some'], ['ten', 'the'], ['ta', 'the'], ['to', ''],
];

const strip = (s) => s.toLowerCase()
  .replace(/ł/g, 'l')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const exact = new Map();
const stems = [];
for (const [pl, en] of DICT) {
  const key = strip(pl);
  if (!exact.has(key)) exact.set(key, en);
  if (key.length >= 4) stems.push([key, en]);
}
stems.sort((a, b) => b[0].length - a[0].length); // longest stem wins

function translateWord(word) {
  const w = strip(word);
  if (exact.has(w)) return exact.get(w);
  for (const [stem, en] of stems) if (w.startsWith(stem)) return en;
  return word; // unknown: keep (may already be English)
}

export function translatePlToEn(text) {
  const out = [];
  for (const token of text.split(/(\s+|[,.;:!?()]+)/)) {
    if (!token) continue;
    if (/^\s+$/.test(token)) { out.push(' '); continue; }
    if (/^[,.;:!?()]+$/.test(token)) { out.push(token); continue; }
    const en = translateWord(token);
    out.push(en || null); // null = dropped word
  }
  // a preposition directly before a dropped word ("w [tym] [miejscu]") is dropped too
  const SMALL = new Set(['in', 'on', 'at', 'to', 'from', 'with', 'near', 'the', 'a']);
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] === null) {
      let j = i - 1;
      while (j >= 0 && out[j] === ' ') j--;
      if (j >= 0 && SMALL.has(out[j])) out[j] = null;
    }
  }
  return out.filter((t) => t !== null).join('')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/(\b[\w-]+\b)( \1\b)+/g, '$1') // "walking walking" -> "walking"
    .trim()
    .replace(/^[,.;:]\s*|[,;:]\s*$/g, '');
}
