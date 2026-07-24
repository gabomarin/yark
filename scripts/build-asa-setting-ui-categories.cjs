/**
 * Genera src/shared/asa-setting-ui-categories-data.json
 * Heurística + overrides manuales sobre el catálogo ASA.
 *
 * Uso: node scripts/build-asa-setting-ui-categories.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "src/shared/asa-server-settings-data.json");
const OUT_PATH = path.join(ROOT, "src/shared/asa-setting-ui-categories-data.json");

/** @type {Array<{ id: string, label: string }>} */
const CATEGORIES = [
  { id: "general", label: "General" },
  { id: "rates", label: "Rates" },
  { id: "breeding", label: "Breeding" },
  { id: "dinos", label: "Dinos" },
  { id: "structures", label: "Structures" },
  { id: "pvp", label: "PvP" },
  { id: "pve", label: "PvE" },
  { id: "world", label: "World" },
  { id: "players", label: "Players" },
  { id: "tribes", label: "Tribes" },
  { id: "chat", label: "Chat / MOTD" },
  { id: "mods", label: "Mods" },
  { id: "networking", label: "Networking" },
  { id: "events", label: "Events" },
  { id: "other", label: "Other" },
];

/** Overrides exactos por key (case-insensitive). */
const KEY_OVERRIDES = {
  SessionName: "general",
  ServerPassword: "general",
  ServerAdminPassword: "general",
  MaxPlayers: "general",
  ActiveMods: "mods",
  ActiveMapMod: "mods",
  TotalConversionMod: "mods",
  Message: "chat",
  Duration: "chat",
  BanListURL: "general",
  BadWordListURL: "chat",
  BadWordWhiteListURL: "chat",
  DifficultyOffset: "world",
  OverrideOfficialDifficulty: "world",
  ServerCrosshair: "players",
  ServerForceNoHUD: "players",
  ShowMapPlayerLocation: "players",
  AllowThirdPersonPlayer: "players",
  RCONEnabled: "networking",
  RCONPort: "networking",
  RCONServerGameLogBuffer: "networking",
  ArmadoggoDeathCooldown: "dinos",
  YoungIceFoxDeathCooldown: "dinos",
  CosmoWeaponAmmoReloadAmount: "dinos",
  MaxCosmoWeaponAmmo: "dinos",
  CryoHospitalHoursToRegenFood: "dinos",
  CryoHospitalHoursToRegenHP: "dinos",
  CryoHospitalMatingCooldownReduction: "breeding",
  FreezeReaperPregnancy: "breeding",
  ClampItemStats: "players",
  CustomLiveTuningUrl: "general",
  ShowFloatingDamageText: "players",
  StartTimeHour: "world",
  UseAstraeosTraversalBuff: "world",
  UseFjordurTraversalBuff: "world",
  UseExclusiveList: "general",
  UseOptimizedHarvestingHealth: "rates",
  EnemyAccessBunkerHPThreshold: "structures",
  MinDistanceBetweenBunkers: "structures",
  MaxTrainCars: "world",
  NeedsPowerToActivateAquaticCompartments: "structures",
  OverrideSecondsUntilBuriedTreasureAutoReveals: "world",
};

/**
 * Reglas ordenadas: primera coincidencia gana.
 * Cada regla: { category, test: (key, desc) => boolean }
 */
const RULES = [
  {
    category: "mods",
    test: (k) => /activemod|mapmod|totalconversion|modid|modlist/.test(k),
  },
  {
    category: "chat",
    test: (k, d) =>
      /motd|messageoftheday|broadcast|badword|chat|globalvoice|proximity/.test(k)
      || /\bmotd\b|message of the day/.test(d),
  },
  {
    category: "events",
    test: (k, d) =>
      /halloween|winterwonder|easter|valentine|turkeytrial|fear|evolution|event/.test(k)
      || /\bevent\b|seasonal/.test(d),
  },
  {
    category: "pve",
    test: (k) => /pve/.test(k),
  },
  {
    category: "pvp",
    test: (k) => /pvp/.test(k),
  },
  {
    category: "breeding",
    test: (k, d) =>
      /baby|imprint|egg|mate|gestat|incub|cuddle|breed|layegg/.test(k)
      || /imprint|breeding|gestation|egg hatch/.test(d),
  },
  {
    category: "dinos",
    test: (k, d) =>
      /dino|tame|flyer|torpor|wild|creature|harvestingdamage|spawnweight|npc|armadoggo|cosmo|cryo|icefox|reaper|wyvern|gacha|stek/.test(
        k,
      )
      || /creature|dinosaur|taming|cryopod|cryofridge/.test(d),
  },
  {
    category: "structures",
    test: (k, d) =>
      /structure|building|turret|crop|platform|raft|decay|pipe|foundation|wall|gate|tek\b|saddle|bunker|compartment/.test(
        k,
      )
      || /structure|building|turret|decay|bunker/.test(d),
  },
  {
    category: "rates",
    test: (k, d) =>
      /xp|multiplier|harvestamount|resourcespeed|tamingspeed|craftingskill|hexagon|spoil|decompos|damagemulti|resistancemulti|fooddrain|waterdrain|staminadrain|healthrecovery|optimizedharvesting/.test(
        k,
      )
      || /\bmultiplier\b|\bxp\b|gather rate|taming speed|harvest/.test(d),
  },
  {
    category: "world",
    test: (k, d) =>
      /day|night|weather|fog|difficulty|supplycrate|resource|world|climate|temperature|oxygen|cave|boss|tribute|hexagonreward|lootcrate|starttime|traversal|treasure|traincar/.test(
        k,
      )
      || /day cycle|night|weather|difficulty|world|traversal|treasure/.test(d),
  },
  {
    category: "tribes",
    test: (k, d) =>
      /tribe|alliance|clan|govern/.test(k) || /\btribe\b|alliance/.test(d),
  },
  {
    category: "players",
    test: (k, d) =>
      /player|character|engram|level|inventory|crosshair|hud|thirdperson|spectator|implant|respec|tribute/.test(
        k,
      )
      || /player|character|engram|hud/.test(d),
  },
  {
    category: "networking",
    test: (k, d) =>
      /rcon|port|network|tick|bandwidth|connection|latency|packet|ip_|multiHome|serverip/.test(k)
      || /rcon|network|bandwidth/.test(d),
  },
  {
    category: "general",
    test: (k, d) =>
      /password|session|admin|maxplayers|servername|mapname|kick|ban|whitelist|spectator|cheat|force|allow|enable|disable|auto|save|backup|cluster|transfer/.test(
        k,
      )
      || /password|admin|session|server name|kick|ban/.test(d),
  },
];

function entryId(file, section, key) {
  return `${file}\0${section}\0${key}`.toLowerCase();
}

function classify(setting) {
  const key = setting.key;
  const keyLower = key.toLowerCase();
  const desc = String(setting.description ?? "").toLowerCase();

  const override = KEY_OVERRIDES[key];
  if (override !== undefined) {
    return override;
  }

  for (const rule of RULES) {
    if (rule.test(keyLower, desc)) {
      return rule.category;
    }
  }

  // Sección INI como pista débil
  const section = String(setting.section ?? "").toLowerCase();
  if (section.includes("messageoftheday")) return "chat";
  if (section.includes("sessionsettings")) return "general";

  return "other";
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const settings = Array.isArray(catalog.settings) ? catalog.settings : [];

  /** @type {Record<string, string>} */
  const byId = {};
  /** @type {Record<string, number>} */
  const counts = {};
  for (const cat of CATEGORIES) {
    counts[cat.id] = 0;
  }

  for (const setting of settings) {
    if (typeof setting.key !== "string" || typeof setting.file !== "string") {
      continue;
    }
    const category = classify(setting);
    const id = entryId(setting.file, setting.section ?? "", setting.key);
    byId[id] = category;
    counts[category] = (counts[category] ?? 0) + 1;
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      settingCount: Object.keys(byId).length,
      sourceCatalog: "asa-server-settings-data.json",
      counts,
    },
    categories: CATEGORIES,
    byId,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Settings: ${payload.meta.settingCount}`);
  console.log("Counts:", counts);
}

main();
