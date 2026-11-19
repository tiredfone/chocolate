import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const log = console.log;
console.log = () => {};
const { CLASSES, ENUMS, classEra, propEra } = await import('../shared/classes.js');
const { parsePlace } = await import('../shared/rbxl.js');
const { classMembers, GLOBALS, LIBS, DATATYPE_MEMBERS } = await import('../studio/reference.js');
console.log = log;

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'studio', 'assistant', 'corpus.json');
const ASSETS = '/var/www/assets/assets';
const MAX_BYTES = 1_900_000;
const SNIP_CHARS = 650;
const SNIP_PER_GAME = 4;
const SNIP_TOTAL = 700;

const docs = [];
const add = (kind, title, text, extra = {}) => docs.push({ k: kind, t: title, x: text.replace(/[ \t]+\n/g, '\n').trim(), ...extra });

const visible = (n) => !n.startsWith('__') && !/^Signal/.test(n) && !/^(children|childAdded|Remove)$/.test(n);

function apiDocs() {
  for (const cls of [...CLASSES.keys()].sort()) {
    const m = classMembers(cls);
    if (!m) continue;
    const props = m.props.filter((p) => p.from === cls && visible(p.name));
    const methods = m.methods.filter((x) => x.from === cls && visible(x.name));
    const events = m.events.filter((x) => x.from === cls && visible(x.name));
    if (!props.length && !methods.length && !events.length && !m.service && !m.creatable) continue;
    const kind = m.service ? 'service' : m.abstract ? 'abstract class' : m.creatable ? 'class (Instance.new)' : 'class';
    const era = classEra(cls) === 2018 ? ' Only available with the 2018 client.' : '';
    const parts = [`${cls} is a ${kind} that inherits ${m.chain.slice(1, 4).join(' > ') || 'nothing'}.${era}`];
    if (props.length) parts.push('Properties: ' + props.map((p) => `${p.name}${p.type && p.type !== 'computed' ? ':' + p.type : ''}${propEra(cls, p.name) === 2018 ? '(2018)' : ''}`).join(', ') + '.');
    if (methods.length) parts.push('Methods: ' + methods.map((x) => x.name).join(', ') + '.');
    if (events.length) parts.push('Events: ' + events.map((x) => x.name).join(', ') + '.');
    let text = parts.join('\n');
    if (text.length > 1500) {
      const head = parts[0];
      const chunks = [];
      let cur = head;
      for (const line of parts.slice(1)) {
        for (let i = 0; i < line.length; i += 1100) {
          const piece = line.slice(i, i + 1100);
          if (cur.length + piece.length > 1500) {
            chunks.push(cur);
            cur = `${cls} (continued)`;
          }
          cur += '\n' + piece;
        }
      }
      chunks.push(cur);
      chunks.forEach((c, i) => add('api', i ? `${cls} ${i + 1}` : cls, c, { c: cls }));
    } else add('api', cls, text, { c: cls });
  }
  for (const [name, members] of Object.entries(ENUMS)) {
    const keys = Object.keys(members);
    add('enum', `Enum.${name}`, `Enum.${name} values: ${keys.slice(0, 60).map((k) => `Enum.${name}.${k}`).join(', ')}${keys.length > 60 ? ', ...' : ''}.`);
  }
  const globals = Object.entries(GLOBALS).map(([k, v]) => `${k} (${v})`).join(', ');
  add('lua', 'Lua globals functions game workspace print wait spawn', `Solar's Lua is Lua 5.1. Globals available: ${globals}. There is no string.split (use string.gmatch), no goto, no continue, no integer division, no bit32.`);
  for (const [lib, names] of Object.entries(LIBS)) add('lua', `${lib} library`, `${lib}: ${names.join(', ')}.`);
  for (const [dt, mem] of Object.entries(DATATYPE_MEMBERS)) {
    add('lua', `${dt} datatype members`, `${dt} properties: ${mem.props.join(', ')}. Methods: ${mem.methods.join(', ') || 'none'}.`);
  }
}

function solarDocs() {
  add('solar', 'Chocolate overview eras 2012 2018', 'Solar games run on Chocolate, which emulates the Roblox client and server in two eras: 2012 and 2018, picked per game in its Configure page. Scripts are Lua 5.1. The 2018 era adds newer classes (TweenService, DataStoreService, CollectionService, Attachments, and more). A class or property marked (2018) in the API docs does not exist in 2012 games. Anything not in the API docs is not implemented: do not use it.');
  add('solar', 'MarketplaceService game passes developer products purchase', 'Game passes and developer products are made on the Store card of the game\'s Configure page. In a Script: MarketplaceService:UserOwnsGamePassAsync(userId, passId) returns true if the player owns the pass; MarketplaceService:PlayerOwnsAsset(player, assetId) checks any asset. MarketplaceService:PromptGamePassPurchase(player, passId) and MarketplaceService:PromptProductPurchase(player, productId) open the purchase prompt; MarketplaceService:PromptPurchase(player, assetId) does the same for a catalog asset. Events: MarketplaceService.PromptGamePassPurchaseFinished(player, passId, wasPurchased) and PromptProductPurchaseFinished(userId, productId, isPurchased). Every purchase pays the full Robux price to the game owner. A purchase only works while the player is in that game.');
  add('solar', 'ProcessReceipt developer product receipts grant', 'Developer products: set MarketplaceService.ProcessReceipt = function(receiptInfo) ... end in a server Script. Grant the product, then return Enum.ProductPurchaseDecision.PurchaseGranted. Return Enum.ProductPurchaseDecision.NotProcessedYet if you could not grant it; Solar keeps the receipt and offers it again. receiptInfo has PlayerId and ProductId.');
  add('solar', 'gamepass example UserOwnsGamePassAsync give tool', 'local MarketplaceService = game:GetService("MarketplaceService")\nlocal Players = game:GetService("Players")\nlocal PASS_ID = 0\nPlayers.PlayerAdded:Connect(function(player)\n\tif MarketplaceService:UserOwnsGamePassAsync(player.UserId, PASS_ID) then\n\t\tprint(player.Name .. " owns the pass")\n\tend\nend)\nReplace PASS_ID with the game pass id from the Store card. Use Players.PlayerAdded:connect in 2012 games if :Connect is not available.');
  add('solar', 'BadgeService badges AwardBadge UserHasBadge', 'BadgeService:AwardBadge(userId, badgeId) awards a badge and returns true on success; BadgeService:UserHasBadge(userId, badgeId) checks it. Badges are created on the game\'s Configure page (Badges card). A badge can only be awarded for the game it is linked to, or for an unlinked badge owned by the game\'s owner, and only while that user is playing the game.');
  add('solar', 'SolarPerks OBC badge chat color name color', 'Every Player has a Configuration named SolarPerks when they have perks. It holds Badge (StringValue, an asset URL), ChatColor and NameColor (Color3Value). OBC members choose their chat and name colours in Settings. Read them with player:FindFirstChild("SolarPerks"). Do not rely on it existing: always check for nil.');
  add('solar', 'Player data SaveNumber LoadNumber SaveString persistent', 'Per-player saved data: player:WaitForDataReady(), player:SaveNumber(key, value), player:LoadNumber(key) (default 0), SaveString/LoadString (default ""), SaveBoolean/LoadBoolean (default false). Values persist across visits.');
  add('solar', 'DataStoreService GetDataStore 2018', 'In 2018 games: local store = game:GetService("DataStoreService"):GetDataStore("Name"); store:GetAsync(key), store:SetAsync(key, value), store:UpdateAsync(key, function(old) return new end), store:IncrementAsync(key, delta), store:RemoveAsync(key). Also GetGlobalDataStore and GetOrderedDataStore. Wrap calls in pcall. Data is stored per game by Solar. Not available in 2012 games.');
  add('solar', 'HttpService HTTP requests not enabled', 'HttpService:GenerateGUID() works. HTTP requests (GetAsync, PostAsync, HttpGet) are not enabled in Solar games and will error. Do not suggest calling web APIs.');
  add('solar', 'Gear tools AllowGear StarterPack', 'Players spawn with their equipped gear only when the game has Allow Gear switched on in its Configure page. Tools placed in StarterPack are always given. Tool code: use Tool.Equipped, Tool.Unequipped, Tool.Activated and the Handle part.');
  add('solar', 'Players PlayerAdded character spawn leaderstats', 'Common pattern: Players.PlayerAdded:Connect(function(player) local stats = Instance.new("IntValue") stats.Name = "leaderstats" stats.Parent = player ... end). Children of leaderstats (IntValue, StringValue) appear on the player list. Character spawning: player.CharacterAdded:Connect(function(char) ... end), char:FindFirstChild("Humanoid").');
  add('solar', 'RemoteEvent client server FilteringEnabled', 'Use RemoteEvent and RemoteFunction in ReplicatedStorage to talk between a LocalScript and a Script: remote:FireServer(args) on the client and remote.OnServerEvent:Connect(function(player, args) end) on the server; remote:FireClient(player, args) and remote.OnClientEvent on the other side. Never trust client arguments: validate them on the server.');
  add('solar', 'Studio scripts where to put Script LocalScript ModuleScript', 'Script runs on the server (put in Workspace or ServerScriptService). LocalScript runs on the client (StarterPlayerScripts, StarterGui, StarterPack tools, or the character). ModuleScript returns a table and is loaded with require(module). Edit scripts by double clicking them in the Explorer.');
  add('solar', 'Assistant limits scope code help only', 'The Assistant helps write and fix Lua code for Solar games using only APIs that Chocolate implements. It does not edit the place, cannot run code, and does not help with building or modelling. Users insert its code into scripts themselves.');
}

const SECRET_LINE = /(api[_-]?key|secret|token|passw(or)?d|webhook|authorization|bearer|\.roblosecurity|cookie|private[_-]?key|credential)/i;
const URL_CREDS = /https?:\/\/[^\s"'\/]*:[^\s"'\/]*@/i;
const LONG_BLOB = /[A-Za-z0-9+\/_=-]{40,}/;
const BAD_URL = /https?:\/\/[^\s"']*(discord(app)?\.com\/api|hooks\.slack|webhook)/i;

function clean(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  for (const l of lines) {
    if (SECRET_LINE.test(l) || URL_CREDS.test(l) || LONG_BLOB.test(l) || BAD_URL.test(l)) continue;
    out.push(l.replace(/[ \t]+$/g, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cut(text, max) {
  if (text.length <= max) return text;
  const part = text.slice(0, max);
  const nl = part.lastIndexOf('\n');
  return (nl > max * 0.5 ? part.slice(0, nl) : part).trim() + '\n...';
}

function scripts(nodes) {
  const found = [];
  const walk = (n, trail) => {
    const name = n.props.get('Name');
    const label = String((name && name.v) ?? n.cls);
    if (n.cls === 'Script' || n.cls === 'LocalScript' || n.cls === 'ModuleScript') {
      const src = n.props.get('Source');
      const v = src && typeof src === 'object' ? src.v : src;
      if (typeof v === 'string' && v.trim().length >= 80) found.push({ cls: n.cls, name: label, trail: trail.slice(-2).join('.'), src: v });
    }
    for (const c of n.children || []) walk(c, [...trail, label]);
  };
  for (const n of nodes) walk(n, []);
  return found;
}

function score(s) {
  const t = s.src;
  let v = Math.min(t.length, 2500) / 100;
  if (/GetService/.test(t)) v += 4;
  if (/PlayerAdded|Touched|MouseButton1Click|OnServerEvent|Changed/.test(t)) v += 4;
  if (/Instance\.new/.test(t)) v += 2;
  if (/^\s*--/m.test(t) && t.split('\n').length < 12) v -= 3;
  if (s.cls === 'ModuleScript') v -= 1;
  return v;
}

function gameSnippets() {
  let games = [];
  if (!process.argv.includes('--with-games')) {
    log('game snippets skipped (pass --with-games to include them)');
    return 0;
  }
  try {
    games = JSON.parse(execFileSync('php', [path.join(here, 'assistant-games.php')], { encoding: 'utf8', maxBuffer: 16 << 20 }));
  } catch (e) {
    log('could not list games: ' + e.message.split('\n')[0]);
    return 0;
  }
  const seen = new Set();
  let count = 0;
  for (const g of games) {
    if (count >= SNIP_TOTAL) break;
    const file = path.join(ASSETS, String(g.id));
    let nodes;
    try {
      nodes = parsePlace(new Uint8Array(fs.readFileSync(file)));
    } catch {
      continue;
    }
    const list = scripts(nodes).sort((a, b) => score(b) - score(a));
    let taken = 0;
    for (const s of list) {
      if (taken >= SNIP_PER_GAME || count >= SNIP_TOTAL) break;
      const text = cut(clean(s.src), SNIP_CHARS);
      if (text.length < 80) continue;
      const hash = crypto.createHash('sha1').update(text.replace(/\s+/g, '')).digest('hex');
      if (seen.has(hash)) continue;
      seen.add(hash);
      add('game', `${g.name} ${s.cls} ${s.name}`, `Example from the Solar game "${g.name}" (${s.cls} ${s.trail ? s.trail + '.' : ''}${s.name}):\n${text}`, { g: g.id });
      taken++;
      count++;
    }
  }
  log(`games scanned: ${games.length}, snippets: ${count}`);
  return count;
}

apiDocs();
solarDocs();
gameSnippets();

let json = JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), docs });
while (Buffer.byteLength(json) > MAX_BYTES) {
  const i = docs.map((d) => d.k).lastIndexOf('game');
  if (i < 0) break;
  docs.splice(i, 1);
  json = JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), docs });
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json);
const kinds = {};
for (const d of docs) kinds[d.k] = (kinds[d.k] || 0) + 1;
log(`wrote ${OUT}: ${docs.length} docs, ${Buffer.byteLength(json)} bytes`, JSON.stringify(kinds));
