// UI strings (AZ + EN) and number formatting. Keys must exist in both languages
// (checked by tests/test_i18n.mjs). Texts that come from the data files
// (disclaimer, cost notes, ...) are read from wind_meta.json, not stored here.
import * as state from './state.js';

export const DICT = {
  az: {
    'app.title': 'Azərbaycan Külək Atlası',
    'app.subtitle':
      'tələbə layihəsi; Qlobal Külək Atlası (GWA), DTU və ya Dünya Bankı ilə əlaqəsi yoxdur',
    'menu.about': 'Haqqında',
    'menu.methods': 'Data və metodlar',
    'menu.github': 'GitHub',
    'lang.aria': 'Dil seçimi',

    'panel.layers': 'Qatlar',
    'panel.layersAria': 'Qatlar panelini aç / bağla',
    'panel.details': 'Məlumat paneli',
    'panel.detailsAria': 'Məlumat panelini aç / bağla',

    'basemap.title': 'Əsas xəritə',
    'basemap.esri': 'Esri peyk görüntüsü',
    'basemap.osm': 'OpenStreetMap',
    'basemap.plain': 'Sadə açıq fon',
    'basemap.terms': 'Plitka provayderlərinin istifadə şərtləri tətbiq olunur.',

    'wind.title': 'Külək qatı',
    'wind.show': 'Orta külək sürəti',
    'wind.opacity': 'Qeyri-şəffaflıq',

    'overlays.title': 'Üst qatlar',
    'overlays.outline': 'Azərbaycan sərhədi',
    'overlays.region': 'Tədqiqat bölgəsi',
    'overlays.sites': 'Namizəd sahələr (rəng = seçilmiş hündürlük)',

    'height.aria': 'Hündürlük seçimi (yerdən, metr)',
    'height.unit': 'm',
    'legend.aria': 'Orta külək sürəti üçün rəng şkalası',
    'legend.unit': 'm/s',
    'map.home': 'Bütün Azərbaycana yaxınlaş',
    'map.zoomIn': 'Yaxınlaşdır',
    'map.zoomOut': 'Uzaqlaşdır',

    'region.badge': '{n} turbin (ən yaxşı kompromis)',
    'region.badgeNoCount': 'Tədqiqat bölgəsi',
    'region.badgeAria': 'Tədqiqat bölgəsinə yaxınlaş',

    'point.title': 'Nöqtə məlumatı',
    'point.hint': 'Külək sürətini oxumaq üçün xəritədə klikləyin.',
    'point.lat': 'Enlik',
    'point.lon': 'Uzunluq',
    'point.height': 'Hündürlük',
    'point.speed': 'Orta külək sürəti',
    'point.nodata': 'məlumat yoxdur',
    'point.outside': 'Bu nöqtə Azərbaycandan kənardadır: məlumat yoxdur.',
    'point.noDataInside':
      'Bu nöqtədə külək qatında dəyər yoxdur (qatın əhatə etmədiyi sahə və ya şəbəkədə boşluq).',
    'point.holeNote':
      'Qeyd: qatda boşluqlar var; bəzi hündürlüklərdə (məsələn, 150 m) tədqiqat bölgəsinin qərbində dəyər yoxdur.',
    'point.loading': 'Yüklənir…',
    'point.error': 'Şəbəkə faylı yüklənmədi.',

    'regionCard.title': 'Tədqiqat bölgəsi',
    'regionCard.area': 'Sahə',
    'regionCard.best': 'Ən yaxşı kompromis həlli: {n} turbin',
    'regionCard.zoom': 'Bölgəyə yaxınlaş',

    'data.title': 'Külək qatı haqqında',
    'data.stats':
      'Seçilmiş hündürlük ({h} m), görünən piksellər: min {min}, orta {mean}, maks {max} m/s.',
    'data.coverageLine':
      'Dəyəri olan ~1 km-lik xanalar: {valid} / {inside} (~{share}%).',
    'data.sources': 'Mənbə raster-lər: {count} fayl, sərhədlər {w}–{e}°E, {s}–{north}°N.',
    'data.gridNote':
      'Klik oxunuşu ~1 km-lik şəbəkədən gəlir (sahə üzrə orta); piksel görüntüsündən kiçik fərq ola bilər.',

    'banner.coverage':
      'Test qatı: külək dəyərləri Azərbaycan ərazisinin yalnız ~{share}%-i üçün mövcuddur (mənbə raster-lər {w}–{e}°E, {s}–{north}°N). Qalan ərazidə xəritə boşdur.',

    'modal.close': 'Bağla',
    'about.title': 'Haqqında',
    'about.p1':
      'Bu sayt System Design kursu üçün tələbə layihəsidir: yalnız Azərbaycan üçün kiçik külək atlası. Orta külək sürətini və tədqiqat bölgəsi üçün NSGA-II ilə seçilmiş turbinləri göstərir.',
    'about.p2':
      'Layihə Qlobal Külək Atlası, DTU və ya Dünya Bankı ilə əlaqəli deyil; yalnız görünüş baxımından ilhamlanıb. Kod və dizayn orijinaldır.',
    'about.p3': 'Yalnız ilkin planlaşdırma üçündür, investisiya əsası deyil.',
    'methods.title': 'Data və metodlar',
    'methods.sources': 'Məlumat mənbələri və atribusiya',
    'methods.tiles':
      'Xəritə plitələri (Esri, OpenStreetMap) öz istifadə şərtlərinə tabedir; yayımlamazdan əvvəl yoxlayın.',
    'turbines.legend': 'Turbin (qüllə hündürlüyü)',
    'turbine.title': 'Turbin məlumatı',
    'turbine.hubWs': 'Hub hündürlüyündə külək sürəti',
    'turbine.percentile': 'Külək percentili ({n} namizəd sahə arasında)',
    'turbine.cf': 'Tutum əmsalı (brutto)',
    'turbine.aep': 'İllik enerji (brutto)',
    'turbine.tower': 'Qüllə hündürlüyü',
    'turbine.cost': 'Nisbi xərc (model vahidi)',
    'turbine.access': 'Ən yaxın çıxış nöqtəsi',
    'turbine.alternatives': 'Eyni sahədə digər qüllə hündürlükləri',
    'turbine.altRow': '{h} m: enerji {de} GWh/il ({dp} %), xərc {dc}',
    'turbine.inSolutions': '{total} həllin {n}-də görünür',
    'turbine.close': 'Bağla',
    'turbine.aria': 'Turbin {site}, qüllə {h} m',
    'turbine.honesty': 'Brutto tutum əmsalı (itkisiz), doğrulanmamış külək datası, nisbi xərc vahidləri; bağlantı xətləri yalnız istiqamətvericidir.',
    'access.type.substation': 'yarımstansiya',
    'access.type.road': 'yol qovşağı',
    'access.id': 'ID',
    'access.type': 'Növ',
    'access.name': 'Ad',
    'access.voltage': 'Gərginlik',
    'access.source': 'Mənbə: OpenStreetMap-dən istifadəçi qeydləri, yoxlanılmayıb.',
    'access.aria': 'Çıxış nöqtəsi {id}',
    'banner.connection': 'Bağlantı xətləri yalnız istiqamətvericidir.',
    'solutions.title': 'Pareto həlləri: {n}',
    'solutions.error': 'Həll faylları yüklənmədi.',
    'solutions.info': 'Bunlar eyni çox-məqsədli optimallaşdırmanın (NSGA-II) alternativ həlləridir: hər nöqtə bir həlldir və heç biri “yeganə düzgün” deyil. SVF defolt həlli seçmək üçün istifadə olunan çəkili xaldır.',
    'solutions.current': 'Seçilmiş həll: {id}',
    'solutions.isBest': '(ən yaxşı SVF)',
    'presets.aria': 'Hazır seçimlər',
    'preset.best': 'Ən yaxşı kompromis (SVF)',
    'preset.energy': 'Ən yüksək enerji',
    'preset.access': 'Ən yüksək əlçatanlıq',
    'preset.cost': 'Ən aşağı xərc',
    'plot.aria': 'Pareto həllərinin səpələnmə qrafiki: hər nöqtə bir həlldir',
    'plot.x': 'Nisbi xərc (model vahidi)',
    'plot.y': 'İllik enerji (GWh/il)',
    'plot.access': 'Orta əlçatanlıq (0–1)',
    'plot.best': 'ən yaxşı SVF',
    'plot.point': 'Həll {id}: {aep} GWh/il, xərc {cost}, əlçatanlıq {acc}',
    'obj.aep': 'İllik enerji (brutto)',
    'obj.access': 'Orta əlçatanlıq (0–1)',
    'obj.cost': 'Nisbi xərc (model vahidi)',
    'obj.svf': 'SVF (çəkili xal), sıra',
    'table.title': 'Seçilmiş həllin turbinləri',
    'table.sort': 'Sırala: {col}',
    'col.site': 'Sahə',
    'col.tower': 'Qüllə, m',
    'col.wind': 'Külək, m/s',
    'col.aep': 'Enerji, MWh/il',
    'col.cf': 'Tutum əm., %',
    'col.access': 'Əlçat., 0–1',
    'col.dist': 'Məsafə, km',
    'col.cost': 'Xərc',
    'dl.csv': 'CSV yüklə',
    'dl.geojson': 'GeoJSON yüklə',
    'scenarios.title': 'Ssenarilər (sonra əlavə olunacaq)',
    'scenarios.text': 'Şəbəkə və ssenari simulyatoru sonrakı mərhələdədir. Hələlik heç bir ssenari nəticəsi yoxdur.',
    'scenarios.button': 'Ssenarini işə sal',
    'methods.limit':
      'Turbinlər bir-birindən asılı olmayaraq seçilir: xərc modelində ortaq infrastruktur və ya qruplaşdırma (clustering) həddi yoxdur, ona görə həll kompakt külək elektrik stansiyası deyil, ayrı-ayrılıqda yaxşı sahələr toplusudur. Bağlantı xətləri ən yaxın çıxış nöqtəsinə düz xətdir və yalnız istiqamətvericidir.',
    'methods.pending':
      'Model zənciri: ML güc əyrisi, Rayleigh külək paylanması, NSGA-II optimallaşdırıcısı. Xərc modeli: hər turbin 1,0 vahid, qüllə əlavəsi 50 / 100 / 150 m üçün 0 / 10 / 25 %, yol 0,02 vahid/km. Məhdudiyyətlər: brutto tutum əmsalı (itkisiz), doğrulanmamış külək datası, tək turbin modeli, 50 m qüllədə 92 m rotor yerdən yalnız ~4 m boşluq qoyur, yalnız ilkin planlaşdırma.',

    'error.load':
      'Məlumat faylları yüklənmədi. Saytı fayl kimi (file://) deyil, yerli server və ya GitHub Pages ilə açın.',
  },

  en: {
    'app.title': 'Azerbaijan Wind Atlas',
    'app.subtitle':
      'student project, not affiliated with the Global Wind Atlas, DTU or the World Bank',
    'menu.about': 'About',
    'menu.methods': 'Data and methods',
    'menu.github': 'GitHub',
    'lang.aria': 'Language',

    'panel.layers': 'Layers',
    'panel.layersAria': 'Expand / collapse the layers panel',
    'panel.details': 'Details',
    'panel.detailsAria': 'Expand / collapse the details panel',

    'basemap.title': 'Basemap',
    'basemap.esri': 'Esri World Imagery',
    'basemap.osm': 'OpenStreetMap',
    'basemap.plain': 'Plain light',
    'basemap.terms': "The tile providers' terms of use apply.",

    'wind.title': 'Wind layer',
    'wind.show': 'Mean wind speed',
    'wind.opacity': 'Opacity',

    'overlays.title': 'Overlays',
    'overlays.outline': 'Azerbaijan outline',
    'overlays.region': 'Study region',
    'overlays.sites': 'Candidate sites (colour = selected height)',

    'height.aria': 'Height selector (above ground, metres)',
    'height.unit': 'm',
    'legend.aria': 'Colour scale for mean wind speed',
    'legend.unit': 'm/s',
    'map.home': 'Zoom to all of Azerbaijan',
    'map.zoomIn': 'Zoom in',
    'map.zoomOut': 'Zoom out',

    'region.badge': '{n} turbines (best compromise)',
    'region.badgeNoCount': 'Study region',
    'region.badgeAria': 'Zoom to the study region',

    'point.title': 'Point data',
    'point.hint': 'Click on the map to read the wind speed.',
    'point.lat': 'Latitude',
    'point.lon': 'Longitude',
    'point.height': 'Height',
    'point.speed': 'Mean wind speed',
    'point.nodata': 'no data',
    'point.outside': 'This point is outside Azerbaijan: no data.',
    'point.noDataInside':
      'No value in the wind layer at this point (area not covered by the layer, or a hole in the grid).',
    'point.holeNote':
      'Note: the layer has holes; at some heights (e.g. 150 m) there are no values in the west of the study region.',
    'point.loading': 'Loading…',
    'point.error': 'The grid file could not be loaded.',

    'regionCard.title': 'Study region',
    'regionCard.area': 'Area',
    'regionCard.best': 'Best-compromise solution: {n} turbines',
    'regionCard.zoom': 'Zoom to region',

    'data.title': 'About the wind layer',
    'data.stats':
      'Selected height ({h} m), visible pixels: min {min}, mean {mean}, max {max} m/s.',
    'data.coverageLine': 'Cells (~1 km) with a value: {valid} / {inside} (~{share}%).',
    'data.sources': 'Source rasters: {count} files, bounds {w}–{e}°E, {s}–{north}°N.',
    'data.gridNote':
      'The click readout comes from a ~1 km grid (area average), so it can differ slightly from the pixel image.',

    'banner.coverage':
      'Test layer: wind values exist for only ~{share}% of the area of Azerbaijan (source rasters {w}–{e}°E, {s}–{north}°N). The map is empty elsewhere.',

    'modal.close': 'Close',
    'about.title': 'About',
    'about.p1':
      'This site is a student project for a System Design course: a small wind atlas for Azerbaijan only. It shows mean wind speed and, for the study region, turbines chosen by NSGA-II.',
    'about.p2':
      'The project is not affiliated with the Global Wind Atlas, DTU or the World Bank; it is only inspired by its look. Code and design are original.',
    'about.p3': 'Preliminary planning only, not an investment basis.',
    'methods.title': 'Data and methods',
    'methods.sources': 'Data sources and attribution',
    'methods.tiles':
      'Map tiles (Esri, OpenStreetMap) are subject to their own terms of use; check them before publishing.',
    'turbines.legend': 'Turbine (tower height)',
    'turbine.title': 'Turbine details',
    'turbine.hubWs': 'Hub-height wind speed',
    'turbine.percentile': 'Wind percentile (among {n} candidate sites)',
    'turbine.cf': 'Capacity factor (gross)',
    'turbine.aep': 'Annual energy (gross)',
    'turbine.tower': 'Tower height',
    'turbine.cost': 'Relative cost (model units)',
    'turbine.access': 'Nearest access point',
    'turbine.alternatives': 'Other tower heights at the same site',
    'turbine.altRow': '{h} m: energy {de} GWh/yr ({dp} %), cost {dc}',
    'turbine.inSolutions': 'Appears in {n} of {total} solutions',
    'turbine.close': 'Close',
    'turbine.aria': 'Turbine {site}, {h} m tower',
    'turbine.honesty': 'Gross capacity factor (no losses), unvalidated wind data, relative cost units; connection lines are indicative only.',
    'access.type.substation': 'substation',
    'access.type.road': 'road junction',
    'access.id': 'ID',
    'access.type': 'Type',
    'access.name': 'Name',
    'access.voltage': 'Voltage',
    'access.source': 'Source: user notes from OpenStreetMap, not verified.',
    'access.aria': 'Access point {id}',
    'banner.connection': 'Connection lines are indicative only.',
    'solutions.title': 'Pareto solutions: {n}',
    'solutions.error': 'The solution files could not be loaded.',
    'solutions.info': 'These are alternative solutions of one multi-objective optimisation (NSGA-II): each dot is one solution and none is “the” correct one. SVF is the weighted score used to pick the default solution.',
    'solutions.current': 'Selected solution: {id}',
    'solutions.isBest': '(best SVF)',
    'presets.aria': 'Presets',
    'preset.best': 'Best compromise (SVF)',
    'preset.energy': 'Highest energy',
    'preset.access': 'Highest access',
    'preset.cost': 'Lowest cost',
    'plot.aria': 'Scatter plot of the Pareto solutions: each dot is one solution',
    'plot.x': 'Relative cost (model units)',
    'plot.y': 'Annual energy (GWh/yr)',
    'plot.access': 'Mean access (0–1)',
    'plot.best': 'best SVF',
    'plot.point': 'Solution {id}: {aep} GWh/yr, cost {cost}, access {acc}',
    'obj.aep': 'Annual energy (gross)',
    'obj.access': 'Mean access (0–1)',
    'obj.cost': 'Relative cost (model units)',
    'obj.svf': 'SVF (weighted score), rank',
    'table.title': 'Turbines of the selected solution',
    'table.sort': 'Sort by: {col}',
    'col.site': 'Site',
    'col.tower': 'Tower, m',
    'col.wind': 'Wind, m/s',
    'col.aep': 'Energy, MWh/yr',
    'col.cf': 'CF, %',
    'col.access': 'Access, 0–1',
    'col.dist': 'Dist., km',
    'col.cost': 'Cost',
    'dl.csv': 'Download CSV',
    'dl.geojson': 'Download GeoJSON',
    'scenarios.title': 'Scenarios (coming later)',
    'scenarios.text': 'The network and scenario simulator belongs to a later phase. There are no scenario results yet.',
    'scenarios.button': 'Run scenario',
    'methods.limit':
      'Turbines are chosen independently of each other: the cost model has no shared-infrastructure or clustering term, so the solution is a set of individually good sites, not a compact wind farm. Connection lines show the straight line to the nearest access point and are indicative only.',
    'methods.pending':
      'Model chain: ML power curve, Rayleigh wind distribution, NSGA-II optimiser. Cost model: 1.0 unit per turbine, tower surcharge 0 / 10 / 25 % for 50 / 100 / 150 m, road 0.02 units/km. Limitations: gross capacity factor (no losses), unvalidated wind data, one turbine model, a 92 m rotor on a 50 m tower leaves only ~4 m ground clearance, preliminary planning only.',

    'error.load':
      'The data files could not be loaded. Open the site through a local server or GitHub Pages, not as a file (file://).',
  },
};

export function getLang() {
  return state.get('lang');
}

export function t(key, params) {
  const lang = state.get('lang');
  let s = DICT[lang] && DICT[lang][key];
  if (s === undefined) {
    console.warn('Missing i18n key:', key);
    return key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  return s;
}

/**
 * Number formatting: AZ = comma decimal and dot thousands separator (1.234,56), EN = 1,234.56.
 * Done by hand on top of en-US because some browsers ship without Azerbaijani locale data.
 */
export function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  if (state.get('lang') !== 'az') return s;
  return s.replace(/[,.]/g, (c) => (c === ',' ? '.' : ','));
}

/** Fill every [data-i18n], [data-i18n-aria], [data-i18n-title] element. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  document.title = t('app.title');
}

export function setLang(lang) {
  if (!DICT[lang]) return;
  try {
    localStorage.setItem('wind-atlas-lang', lang);
  } catch (e) {
    /* storage may be blocked: ignore */
  }
  document.documentElement.lang = lang;
  state.set('lang', lang);
  applyStatic();
}

/** Default AZ; use the stored choice if there is one. */
export function initLang() {
  let lang = 'az';
  try {
    const stored = localStorage.getItem('wind-atlas-lang');
    if (stored && DICT[stored]) lang = stored;
  } catch (e) {
    /* ignore */
  }
  document.documentElement.lang = lang;
  state.set('lang', lang);
  applyStatic();
}
