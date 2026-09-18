/**
 * Einmalig ausführen (node scripts/build-clip-labels.mjs), wenn sich die Labels ändern.
 *
 * Rechnet die Text-Embeddings für alle Kategorien/Muster/Stile vorab aus.
 * Dadurch muss das Handy nur das kleine Bild-Modell laden (~11-43 MB) statt
 * zusätzlich das Text-Modell (~40-160 MB).
 */
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers'
import { writeFileSync } from 'node:fs'

const MODEL = 'Xenova/mobileclip_s0'

const CLOTHING_TEMPLATES = [
  'a photo of a {}.',
  'a product photo of a {}.',
  'a {} lying flat on the floor.',
  'a photo of a {}, a type of clothing.',
  'a close-up photo of a {}.',
]

/** Deutsche Kategorie -> englische Begriffe (werden gemittelt). */
const CATEGORY = {
  'T-Shirt': ['t-shirt', 'tee shirt', 'short sleeve t-shirt'],
  Longsleeve: ['long sleeve shirt', 'long sleeve t-shirt'],
  Hemd: ['button-up shirt', 'dress shirt', 'collared shirt'],
  Bluse: ['blouse', "women's blouse"],
  Top: ['tank top', 'crop top', 'sleeveless top'],
  Pullover: ['sweater', 'knit sweater', 'pullover jumper'],
  Hoodie: ['hoodie', 'hooded sweatshirt'],
  Sweatshirt: ['sweatshirt', 'crewneck sweatshirt'],
  Jacke: ['jacket', 'zip jacket', 'denim jacket', 'puffer jacket'],
  Mantel: ['coat', 'long winter coat', 'trench coat'],
  Blazer: ['blazer', 'suit jacket'],
  Weste: ['vest', 'waistcoat', 'gilet'],
  Cardigan: ['cardigan', 'knit cardigan'],
  Jeans: ['jeans', 'denim pants', 'blue jeans'],
  Hose: ['trousers', 'pants', 'slacks'],
  Chino: ['chino pants', 'khaki trousers'],
  Shorts: ['shorts', 'short pants'],
  Jogginghose: ['sweatpants', 'jogger pants', 'track pants'],
  Rock: ['skirt', 'mini skirt', 'midi skirt'],
  Kleid: ['dress', 'summer dress', 'evening dress'],
  Overall: ['jumpsuit', 'overall', 'romper'],
  Anzug: ['suit', 'two-piece suit'],
  Sneaker: ['sneakers', 'trainers', 'pair of sneakers'],
  Schuhe: ['dress shoes', 'leather shoes', 'loafers'],
  Stiefel: ['boots', 'ankle boots', 'leather boots'],
  Sandalen: ['sandals', 'flip flops', 'slides'],
  Mütze: ['beanie', 'knit hat', 'wool beanie'],
  Cap: ['baseball cap', 'cap'],
  Hut: ['hat', 'fedora hat', 'sun hat'],
  Schal: ['scarf', 'wool scarf'],
  Gürtel: ['belt', 'leather belt'],
  Krawatte: ['necktie', 'tie'],
  Tasche: ['handbag', 'bag', 'backpack', 'tote bag'],
  Brille: ['eyeglasses', 'sunglasses'],
  Uhr: ['wristwatch', 'watch'],
  Schmuck: ['necklace', 'jewelry', 'bracelet', 'earrings'],
}

const PATTERN = {
  Uni: ['a plain solid colored piece of clothing', 'a single color garment without pattern'],
  Gestreift: ['a striped piece of clothing', 'a garment with stripes'],
  Kariert: ['a checkered plaid piece of clothing', 'a tartan plaid garment'],
  Geblümt: ['a floral patterned piece of clothing', 'a garment with flower print'],
  Gemustert: [
    'a piece of clothing with a graphic print',
    'a garment with a logo print',
    'a garment with an all-over pattern',
  ],
}

const STYLE = {
  Casual: ['casual everyday clothing', 'relaxed casual outfit piece'],
  Business: ['formal business clothing', 'office wear'],
  Elegant: ['elegant evening wear', 'fancy dressy clothing'],
  Sport: ['sportswear for training', 'athletic gym clothing'],
  Streetwear: ['streetwear style clothing', 'urban street fashion'],
}

const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'fp32' })

async function embed(texts) {
  const inputs = tokenizer(texts, { padding: 'max_length', truncation: true })
  const { text_embeds } = await model(inputs)
  return text_embeds.normalize(2, -1).tolist()
}

function mean(vectors) {
  const out = new Array(vectors[0].length).fill(0)
  for (const v of vectors) v.forEach((x, i) => (out[i] += x))
  const norm = Math.hypot(...out)
  return out.map((x) => x / norm)
}

/** Int8 mit eigenem Skalierungsfaktor pro Vektor – 4x kleiner, Fehler vernachlässigbar. */
function pack(vec) {
  const max = Math.max(...vec.map(Math.abs))
  const scale = max / 127
  const bytes = Int8Array.from(vec.map((x) => Math.round(x / scale)))
  return { scale: Number(scale.toPrecision(6)), v: Buffer.from(bytes.buffer).toString('base64') }
}

async function group(map, templates) {
  const out = []
  for (const [value, terms] of Object.entries(map)) {
    const texts = templates ? terms.flatMap((t) => templates.map((tpl) => tpl.replace('{}', t))) : terms
    out.push({ value, ...pack(mean(await embed(texts))) })
    process.stdout.write('.')
  }
  return out
}

const result = {
  model: MODEL,
  dim: 0,
  groups: {
    category: await group(CATEGORY, CLOTHING_TEMPLATES),
    pattern: await group(PATTERN, ['a photo of {}.', '{}.']),
    style: await group(STYLE, ['a photo of {}.', 'a piece of {}.']),
  },
}
result.dim = Buffer.from(result.groups.category[0].v, 'base64').length

const target = new URL('../src/lib/clipLabels.json', import.meta.url)
writeFileSync(target, JSON.stringify(result))
console.log(`\nfertig: ${target.pathname} (dim ${result.dim})`)
