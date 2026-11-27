export type RebarStructureKind = 'footplat' | 'pedestal' | 'beam' | 'column' | 'slab' | 'stair';
export type ArithmeticOperator = '+' | '-' | '*' | '/';
export type CustomFormulaNode = {
  id: string;
  label: string;
  kind: 'group' | 'value';
  operator?: ArithmeticOperator;
  value?: string | number;
  unit?: string;
  children?: CustomFormulaNode[];
};
export type CustomFormulaParameters = { groups?: CustomFormulaNode[] };

export type RebarBreakdownLine = {
  label: string;
  diameter: number;
  pieces: number;
  cutLengthM: number;
  totalLengthM: number;
  weightKg: number;
  weightPerMeter: number;
};
export type RebarDiameterSummary = {
  diameter: number;
  totalLengthM: number;
  requiredWeightKg: number;
  stockBars: number;
  stockWeightKg: number;
  weightPerMeter: number;
};
export type RebarCalculationResult = {
  structureLabel: string;
  totalLengthM: number;
  totalWeightKg: number;
  totalStockBars: number;
  totalStockWeightKg: number;
  stockLengthM: number;
  breakdown: RebarBreakdownLine[];
  diameterSummary: RebarDiameterSummary[];
  formulas: string[];
  /** Tahapan operasional dari parameter geometris sampai rekap kebutuhan. */
  operationalSteps: string[];
};

const SNI_NOMINAL_WEIGHT_KG_PER_M: Record<number, number> = {
  6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 13: 1.042, 14: 1.208,
  16: 1.578, 19: 2.226, 22: 2.984, 25: 3.853, 28: 4.834, 29: 5.185,
  32: 6.313, 36: 7.990, 38: 8.903, 40: 9.865, 43: 11.400, 50: 15.413, 54: 17.978, 57: 20.031,
};

const LABELS: Record<RebarStructureKind, string> = {
  footplat: 'Footplat',
  pedestal: 'Pedestal',
  beam: 'Balok / Sloof / Ring Balok',
  column: 'Kolom',
  slab: 'Plat',
  stair: 'Tangga',
};

const numeric = (source: unknown): number => {
  const value = Number(source);
  return Number.isFinite(value) ? value : 0;
};
const shown = (value: number, digits = 3) =>
  value.toLocaleString('id-ID', { maximumFractionDigits: digits });
const positive = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(name + ' harus lebih besar dari nol.');
  return value;
};
const nonNegative = (value: number, name: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(name + ' tidak boleh negatif.');
  return value;
};
const integerPositive = (value: number, name: string) => {
  if (!Number.isInteger(value) || value <= 0) throw new Error(name + ' harus bilangan bulat lebih besar dari nol.');
  return value;
};
const kgPerMeter = (diameter: number) =>
  SNI_NOMINAL_WEIGHT_KG_PER_M[diameter] ?? (0.785 * 0.7854 * diameter * diameter) / 100;

function makeLine(label: string, diameterValue: unknown, piecesValue: number, cutLengthValue: number): RebarBreakdownLine {
  const diameter = positive(numeric(diameterValue), 'Diameter besi (' + label + ')');
  const pieces = integerPositive(piecesValue, 'Jumlah potong (' + label + ')');
  const cutLengthM = positive(cutLengthValue, 'Panjang potong (' + label + ')');
  const totalLengthM = pieces * cutLengthM;
  const weightPerMeter = kgPerMeter(diameter);
  return {
    label,
    diameter,
    pieces,
    cutLengthM,
    totalLengthM,
    weightPerMeter,
    weightKg: totalLengthM * weightPerMeter,
  };
}

function addOptionalLinearBars(
  parameters: Record<string, any>,
  memberLength: number,
  memberCount: number,
  lines: RebarBreakdownLine[],
) {
  const groups = Array.isArray(parameters.longitudinal_groups) ? parameters.longitudinal_groups : [];
  groups.forEach((group: Record<string, any>, index: number) => {
    const label = String(group.label || 'Tulangan memanjang ' + (index + 1));
    const diameter = numeric(group.diameter_mm);
    const barsPerMember = numeric(group.bars_per_member);
    const positions = numeric(group.positions_per_member || 1);
    const extraLength = numeric(group.extra_length_m || 0);
    const fixedLength = numeric(group.fixed_length_m);
    const started = [group.diameter_mm, group.bars_per_member, group.fixed_length_m, group.extra_length_m]
      .some((value, fieldIndex) => fieldIndex < 3 && value !== undefined && value !== null && String(value).trim() !== '');
    if (!started) return;
    positive(diameter, 'Diameter ' + label);
    integerPositive(barsPerMember, 'Jumlah tulangan ' + label);
    integerPositive(positions, 'Jumlah posisi/segmen ' + label);
    nonNegative(extraLength, 'Tambahan panjang ' + label);
    const cover = positive(numeric(parameters.cover_mm), 'Selimut beton elemen');
    const clearMemberLength = memberLength - (group.length_mode === 'fixed' ? 0 : (2 * cover) / 1000);
    const baseLength = group.length_mode === 'fixed' ? positive(fixedLength, 'Panjang potongan ' + label) : positive(clearMemberLength, 'Panjang bersih tulangan ' + label);
    lines.push(makeLine(label, diameter, barsPerMember * positions * memberCount, baseLength + extraLength));
  });
}

function addOptionalTies(
  parameters: Record<string, any>,
  memberLength: number,
  memberCount: number,
  lines: RebarBreakdownLine[],
) {
  const fields = ['tie_diameter_mm', 'tie_width_mm', 'tie_depth_mm', 'tie_spacing_mm'];
  const started = fields.some((key) => parameters[key] !== undefined && String(parameters[key]).trim() !== '');
  if (!started) return;
  const diameter = positive(numeric(parameters.tie_diameter_mm), 'Diameter sengkang/cincin');
  const width = positive(numeric(parameters.tie_width_mm), 'Lebar penampang beton');
  const depth = positive(numeric(parameters.tie_depth_mm), 'Tinggi/dimensi kedua penampang beton');
  const spacing = positive(numeric(parameters.tie_spacing_mm), 'Jarak sengkang zona lapangan');
  const cover = positive(numeric(parameters.tie_cover_mm), 'Selimut beton ke sisi luar sengkang');
  const hook = positive(numeric(parameters.tie_hook_mm), 'Panjang kait tiap ujung sengkang');
  const endOffset = nonNegative(numeric(parameters.tie_end_offset_mm || 0), 'Jarak sengkang dari ujung');
  // Panjang potong dihitung pada garis tengah sengkang: dimensi beton dikurangi
  // dua selimut dan satu diameter sengkang (dua setengah diameter).
  const centerlineWidth = width - 2 * cover - diameter;
  const centerlineDepth = depth - 2 * cover - diameter;
  positive(centerlineWidth, 'Dimensi garis tengah sengkang arah lebar');
  positive(centerlineDepth, 'Dimensi garis tengah sengkang arah tinggi');
  if (endOffset * 2 >= memberLength * 1000) throw new Error('Jarak sengkang dari ujung melebihi panjang elemen.');
  const available = memberLength * 1000 - 2 * endOffset;
  const supportZoneM = numeric(parameters.tie_support_zone_m || 0);
  const supportSpacing = numeric(parameters.tie_support_spacing_mm || 0);
  let tiesPerMember: number;
  if (supportZoneM > 0 || supportSpacing > 0) {
    positive(supportZoneM, 'Panjang zona tumpuan tiap ujung');
    positive(supportSpacing, 'Jarak sengkang zona tumpuan');
    const supportZone = supportZoneM * 1000;
    if (supportZone * 2 > available) throw new Error('Total zona tumpuan tidak boleh melebihi panjang bersih elemen.');
    const supportIntervals = Math.ceil(supportZone / supportSpacing);
    const middleLength = available - 2 * supportZone;
    const middleInterior = middleLength > 0 ? Math.max(Math.ceil(middleLength / spacing) - 1, 0) : 0;
    tiesPerMember = 2 * (supportIntervals + 1) + middleInterior;
  } else {
    tiesPerMember = Math.ceil(available / spacing) + 1;
  }
  const cutLength = (2 * (centerlineWidth + centerlineDepth) + 2 * hook) / 1000;
  lines.push(makeLine('Sengkang / cincin', diameter, tiesPerMember * memberCount, cutLength));
}
function addFlatGrid(
  parameters: Record<string, any>,
  lines: RebarBreakdownLine[],
  label: string,
) {
  const length = positive(numeric(parameters.flat_length_m), 'Panjang bidang');
  const width = positive(numeric(parameters.flat_width_m), 'Lebar bidang');
  const quantity = integerPositive(numeric(parameters.member_count || 1), 'Jumlah bidang');
  const layers = integerPositive(numeric(parameters.layers), 'Jumlah layer/lapis');
  const cover = positive(numeric(parameters.cover_mm), 'Selimut beton');
  const lap = nonNegative(numeric(parameters.lap_allowance_mm || 0), 'Tambahan panjang sambungan per batang');
  const spacingX = positive(numeric(parameters.spacing_x_mm), 'Jarak tulangan arah X');
  const spacingY = positive(numeric(parameters.spacing_y_mm), 'Jarak tulangan arah Y');
  const diameterX = positive(numeric(parameters.diameter_x_mm), 'Diameter tulangan arah X');
  const diameterY = positive(numeric(parameters.diameter_y_mm), 'Diameter tulangan arah Y');
  const clearLength = length * 1000 - 2 * cover;
  const clearWidth = width * 1000 - 2 * cover;
  positive(clearLength, 'Panjang bersih bidang setelah selimut');
  positive(clearWidth, 'Lebar bersih bidang setelah selimut');
  const barsAlongX = Math.ceil(clearWidth / spacingY) + 1;
  const barsAlongY = Math.ceil(clearLength / spacingX) + 1;
  const xCut = (clearLength + lap) / 1000;
  const yCut = (clearWidth + lap) / 1000;
  lines.push(makeLine(label + ' · tulangan arah X', diameterX, barsAlongX * quantity * layers, xCut));
  lines.push(makeLine(label + ' · tulangan arah Y', diameterY, barsAlongY * quantity * layers, yCut));
}

export function calculateStructuredRebar(parametersValue: Record<string, any>, multiplierValue = 1): RebarCalculationResult {
  const parameters = parametersValue || {};
  const structure = (parameters.structure_type || 'beam') as RebarStructureKind;
  if (!(structure in LABELS)) throw new Error('Jenis struktur pembesian tidak dikenal.');
  const stockLengthM = positive(numeric(parameters.stock_length_m || 12), 'Panjang besi per batang');
  const multiplier = nonNegative(numeric(multiplierValue), 'Faktor pengali pembesian');
  const wastePct = nonNegative(numeric(parameters.waste_pct || 0), 'Persentase waste');
  if (wastePct > 30) throw new Error('Waste dibatasi maksimal 30%.');
  const lines: RebarBreakdownLine[] = [];
  const setupNotes: string[] = [];
  const parameterSteps: string[] = [];

  if (structure === 'footplat' || structure === 'slab') {
    addFlatGrid(parameters, lines, structure === 'footplat' ? 'Footplat' : 'Plat');
    const flatLength = numeric(parameters.flat_length_m);
    const flatWidth = numeric(parameters.flat_width_m);
    const memberCount = numeric(parameters.member_count || 1);
    const layers = numeric(parameters.layers);
    const cover = numeric(parameters.cover_mm);
    const lap = numeric(parameters.lap_allowance_mm || 0);
    const clearLength = flatLength * 1000 - 2 * cover;
    const clearWidth = flatWidth * 1000 - 2 * cover;
    const barsAlongX = Math.ceil(clearWidth / numeric(parameters.spacing_y_mm)) + 1;
    const barsAlongY = Math.ceil(clearLength / numeric(parameters.spacing_x_mm)) + 1;
    parameterSteps.push(
      'Dimensi bersih arah panjang = (' + shown(flatLength, 3) + ' m × 1.000) − (2 × ' + shown(cover, 0) + ' mm) = ' + shown(clearLength, 0) + ' mm.',
      'Dimensi bersih arah lebar = (' + shown(flatWidth, 3) + ' m × 1.000) − (2 × ' + shown(cover, 0) + ' mm) = ' + shown(clearWidth, 0) + ' mm.',
      'Jumlah batang arah X = ceil(' + shown(clearWidth, 0) + ' ÷ ' + shown(numeric(parameters.spacing_y_mm), 0) + ') + 1 = ' + shown(barsAlongX, 0) + ' batang per layer/bidang.',
      'Jumlah batang arah Y = ceil(' + shown(clearLength, 0) + ' ÷ ' + shown(numeric(parameters.spacing_x_mm), 0) + ') + 1 = ' + shown(barsAlongY, 0) + ' batang per layer/bidang.',
      'Jumlah batang total dikalikan jumlah bidang ' + shown(memberCount, 0) + ' dan layer ' + shown(layers, 0) + '.',
      'Panjang potong arah X = (' + shown(clearLength, 0) + ' + allowance ' + shown(lap, 0) + ') ÷ 1.000 = ' + shown((clearLength + lap) / 1000, 3) + ' m.',
      'Panjang potong arah Y = (' + shown(clearWidth, 0) + ' + allowance ' + shown(lap, 0) + ') ÷ 1.000 = ' + shown((clearWidth + lap) / 1000, 3) + ' m.',
    );
    setupNotes.push(LABELS[structure] + ': bidang ' + shown(numeric(parameters.flat_length_m), 3) + ' × ' + shown(numeric(parameters.flat_width_m), 3) + ' m; jumlah ' + shown(numeric(parameters.member_count || 1), 0) + '; ' + shown(numeric(parameters.layers), 0) + ' layer; selimut ' + shown(numeric(parameters.cover_mm), 0) + ' mm; arah X Ø' + shown(numeric(parameters.diameter_x_mm), 0) + '@' + shown(numeric(parameters.spacing_x_mm), 0) + ' mm; arah Y Ø' + shown(numeric(parameters.diameter_y_mm), 0) + '@' + shown(numeric(parameters.spacing_y_mm), 0) + ' mm.');
  } else if (structure === 'stair') {
    const steps = integerPositive(numeric(parameters.step_count), 'Jumlah anak tangga');
    const tread = positive(numeric(parameters.tread_width_m), 'Lebar injakan anak tangga');
    const riser = positive(numeric(parameters.riser_height_m), 'Tinggi anak tangga');
    const stairWidth = positive(numeric(parameters.stair_width_m), 'Lebar tangga');
    const flights = integerPositive(numeric(parameters.flight_count || 1), 'Jumlah bidang/flight tangga');
    const cover = positive(numeric(parameters.cover_mm), 'Selimut beton tangga');
    const slopeLength = Math.sqrt((steps * tread) ** 2 + (steps * riser) ** 2);
    parameterSteps.push(
      'Panjang horizontal tangga = ' + shown(steps, 0) + ' × ' + shown(tread, 3) + ' m = ' + shown(steps * tread, 3) + ' m.',
      'Tinggi total tangga = ' + shown(steps, 0) + ' × ' + shown(riser, 3) + ' m = ' + shown(steps * riser, 3) + ' m.',
      'Panjang bidang miring = √((' + shown(steps * tread, 3) + ' m)² + (' + shown(steps * riser, 3) + ' m)²) = ' + shown(slopeLength, 3) + ' m.',
    );
    setupNotes.push('Tangga: ' + steps + ' anak tangga; injakan ' + shown(tread, 3) + ' m; tanjakan ' + shown(riser, 3) + ' m; lebar ' + shown(stairWidth, 3) + ' m; panjang bidang miring estimasi ' + shown(slopeLength, 3) + ' m; jumlah flight ' + flights + '; tulangan utama Ø' + shown(numeric(parameters.stair_main_diameter_mm), 0) + '@' + shown(numeric(parameters.stair_main_spacing_mm), 0) + ' mm; tulangan pembagi Ø' + shown(numeric(parameters.stair_distribution_diameter_mm), 0) + '@' + shown(numeric(parameters.stair_distribution_spacing_mm), 0) + ' mm; bordes ' + shown(numeric(parameters.landing_count || 0), 0) + ' bidang.');
    const mainDiameter = positive(numeric(parameters.stair_main_diameter_mm), 'Diameter tulangan utama tangga');
    const mainSpacing = positive(numeric(parameters.stair_main_spacing_mm), 'Jarak tulangan utama tangga');
    const stairClearWidth = positive(stairWidth * 1000 - 2 * cover, 'Lebar bersih tangga setelah selimut');
    const mainLayers = integerPositive(numeric(parameters.stair_main_layers || 1), 'Layer tulangan utama tangga');
    const mainAnchor = nonNegative(numeric(parameters.stair_main_anchor_mm || 0), 'Tambahan penyaluran tulangan utama tangga');
    const mainCount = Math.ceil(stairClearWidth / mainSpacing) + 1;
    parameterSteps.push(
      'Lebar bersih tangga = (' + shown(stairWidth, 3) + ' m × 1.000) − (2 × ' + shown(cover, 0) + ' mm) = ' + shown(stairClearWidth, 0) + ' mm.',
      'Jumlah tulangan utama per layer/flight = ceil(' + shown(stairClearWidth, 0) + ' ÷ ' + shown(mainSpacing, 0) + ') + 1 = ' + shown(mainCount, 0) + ' batang.',
      'Panjang potong tulangan utama = panjang bidang miring ' + shown(slopeLength, 3) + ' m + penyaluran ' + shown(mainAnchor, 0) + ' mm ÷ 1.000 = ' + shown(slopeLength + mainAnchor / 1000, 3) + ' m.',
    );
    lines.push(makeLine(
      'Tangga · tulangan utama mengikuti bidang miring',
      mainDiameter,
      mainCount * flights * mainLayers,
      slopeLength + mainAnchor / 1000,
    ));
    const distributionDiameter = positive(numeric(parameters.stair_distribution_diameter_mm), 'Diameter tulangan pembagi tangga');
    const distributionSpacing = positive(numeric(parameters.stair_distribution_spacing_mm), 'Jarak tulangan pembagi tangga');
    const distributionLayers = integerPositive(numeric(parameters.stair_distribution_layers || 1), 'Layer tulangan pembagi tangga');
    const distributionExtra = nonNegative(numeric(parameters.stair_distribution_extra_mm || 0), 'Tambahan panjang tulangan pembagi tangga');
    const barsAlongSlope = Math.ceil((slopeLength * 1000) / distributionSpacing) + 1;
    parameterSteps.push(
      'Jumlah tulangan pembagi per layer/flight = ceil((' + shown(slopeLength, 3) + ' m × 1.000) ÷ ' + shown(distributionSpacing, 0) + ' mm) + 1 = ' + shown(barsAlongSlope, 0) + ' batang.',
      'Panjang potong tulangan pembagi = (lebar bersih ' + shown(stairClearWidth, 0) + ' mm + tambahan ' + shown(distributionExtra, 0) + ' mm) ÷ 1.000 = ' + shown((stairClearWidth + distributionExtra) / 1000, 3) + ' m.',
    );
    lines.push(makeLine(
      'Tangga · tulangan pembagi melintang',
      distributionDiameter,
      barsAlongSlope * flights * distributionLayers,
      (stairClearWidth + distributionExtra) / 1000,
    ));

    const landingCount = integerPositive(numeric(parameters.landing_count || 0) + 1, 'Jumlah bordes') - 1;
    if (landingCount > 0) {
      const landingLength = positive(numeric(parameters.landing_length_m), 'Panjang bordes');
      const landingWidth = positive(numeric(parameters.landing_width_m), 'Lebar bordes');
      const landingLayers = integerPositive(numeric(parameters.landing_layers || 1), 'Layer tulangan bordes');
      const landingSpacingX = positive(numeric(parameters.landing_spacing_x_mm), 'Jarak tulangan bordes arah X');
      const landingSpacingY = positive(numeric(parameters.landing_spacing_y_mm), 'Jarak tulangan bordes arah Y');
      const landingDiameterX = positive(numeric(parameters.landing_diameter_x_mm), 'Diameter tulangan bordes arah X');
      const landingDiameterY = positive(numeric(parameters.landing_diameter_y_mm), 'Diameter tulangan bordes arah Y');
      const clearLandingLength = landingLength * 1000 - 2 * cover;
      const clearLandingWidth = landingWidth * 1000 - 2 * cover;
      const landingLap = nonNegative(numeric(parameters.landing_lap_allowance_mm || 0), 'Tambahan sambungan tulangan bordes');
      positive(clearLandingLength, 'Panjang bersih bordes');
      positive(clearLandingWidth, 'Lebar bersih bordes');
      const landingBarsX = Math.ceil(clearLandingWidth / landingSpacingY) + 1;
      const landingBarsY = Math.ceil(clearLandingLength / landingSpacingX) + 1;
      parameterSteps.push(
        'Bordes: jumlah batang arah X = ceil(' + shown(clearLandingWidth, 0) + ' ÷ ' + shown(landingSpacingY, 0) + ') + 1 = ' + shown(landingBarsX, 0) + ' batang per layer/bordes.',
        'Bordes: jumlah batang arah Y = ceil(' + shown(clearLandingLength, 0) + ' ÷ ' + shown(landingSpacingX, 0) + ') + 1 = ' + shown(landingBarsY, 0) + ' batang per layer/bordes.',
        'Panjang potong bordes arah X = (' + shown(clearLandingLength, 0) + ' + ' + shown(landingLap, 0) + ') ÷ 1.000 = ' + shown((clearLandingLength + landingLap) / 1000, 3) + ' m.',
        'Panjang potong bordes arah Y = (' + shown(clearLandingWidth, 0) + ' + ' + shown(landingLap, 0) + ') ÷ 1.000 = ' + shown((clearLandingWidth + landingLap) / 1000, 3) + ' m.',
      );
      lines.push(makeLine(
        'Bordes · tulangan arah X',
        landingDiameterX,
        (Math.ceil(clearLandingWidth / landingSpacingY) + 1) * landingCount * landingLayers,
        (clearLandingLength + landingLap) / 1000,
      ));
      lines.push(makeLine(
        'Bordes · tulangan arah Y',
        landingDiameterY,
        (Math.ceil(clearLandingLength / landingSpacingX) + 1) * landingCount * landingLayers,
        (clearLandingWidth + landingLap) / 1000,
      ));
    }
  } else {
    const memberLength = positive(numeric(parameters.member_length_m), structure === 'column' ? 'Tinggi kolom' : structure === 'pedestal' ? 'Kedalaman pedestal' : 'Panjang total balok');
    const memberCount = integerPositive(numeric(parameters.member_count || 1), 'Jumlah elemen');
    setupNotes.push(LABELS[structure] + ': panjang/tinggi/kedalaman ' + shown(memberLength, 3) + ' m; jumlah elemen ' + memberCount + '; selimut beton ' + shown(numeric(parameters.cover_mm), 0) + ' mm.');
    if (numeric(parameters.tie_diameter_mm) > 0) setupNotes.push('Sengkang: penampang beton ' + shown(numeric(parameters.tie_width_mm), 0) + ' × ' + shown(numeric(parameters.tie_depth_mm), 0) + ' mm; Ø' + shown(numeric(parameters.tie_diameter_mm), 0) + '; selimut ' + shown(numeric(parameters.tie_cover_mm), 0) + ' mm; kait ' + shown(numeric(parameters.tie_hook_mm), 0) + ' mm tiap ujung; jarak lapangan ' + shown(numeric(parameters.tie_spacing_mm), 0) + ' mm' + (numeric(parameters.tie_support_zone_m) > 0 ? '; zona tumpuan ' + shown(numeric(parameters.tie_support_zone_m), 3) + ' m pada masing-masing ujung @' + shown(numeric(parameters.tie_support_spacing_mm), 0) + ' mm' : '') + '.');
    const cover = numeric(parameters.cover_mm);
    (Array.isArray(parameters.longitudinal_groups) ? parameters.longitudinal_groups : []).forEach((group: Record<string, any>, index: number) => {
      const label = String(group.label || 'Tulangan memanjang ' + (index + 1));
      const barsPerMember = numeric(group.bars_per_member);
      const positions = numeric(group.positions_per_member || 1);
      const extra = numeric(group.extra_length_m || 0);
      const fixed = numeric(group.fixed_length_m);
      const started = [group.diameter_mm, group.bars_per_member, group.fixed_length_m, group.extra_length_m]
        .some((value, fieldIndex) => fieldIndex < 3 && value !== undefined && value !== null && String(value).trim() !== '');
      if (!started) return;
      const baseLength = group.length_mode === 'fixed' ? fixed : memberLength - (2 * cover) / 1000;
      const cutLength = baseLength + extra;
      const pieces = barsPerMember * positions * memberCount;
      parameterSteps.push(
        label + ': jumlah potongan = ' + shown(barsPerMember, 0) + ' batang/elemen × ' + shown(positions, 0) + ' posisi × ' + shown(memberCount, 0) + ' elemen = ' + shown(pieces, 0) + ' potong.',
        group.length_mode === 'fixed'
          ? label + ': panjang potong dasar ditetapkan ' + shown(fixed, 3) + ' m.'
          : label + ': panjang bersih = ' + shown(memberLength, 3) + ' m − (2 × ' + shown(cover, 0) + ' mm ÷ 1.000) = ' + shown(baseLength, 3) + ' m.',
        label + ': panjang potong akhir = ' + shown(baseLength, 3) + ' m + tambahan ' + shown(extra, 3) + ' m = ' + shown(cutLength, 3) + ' m.',
      );
    });
    addOptionalLinearBars(parameters, memberLength, memberCount, lines);
    addOptionalTies(parameters, memberLength, memberCount, lines);

    if (numeric(parameters.tie_diameter_mm) > 0) {
      const tieDiameter = numeric(parameters.tie_diameter_mm);
      const tieWidth = numeric(parameters.tie_width_mm);
      const tieDepth = numeric(parameters.tie_depth_mm);
      const tieSpacing = numeric(parameters.tie_spacing_mm);
      const tieCover = numeric(parameters.tie_cover_mm);
      const hook = numeric(parameters.tie_hook_mm);
      const endOffset = numeric(parameters.tie_end_offset_mm || 0);
      const available = memberLength * 1000 - 2 * endOffset;
      const centerlineWidth = tieWidth - 2 * tieCover - tieDiameter;
      const centerlineDepth = tieDepth - 2 * tieCover - tieDiameter;
      const supportZone = numeric(parameters.tie_support_zone_m || 0) * 1000;
      const supportSpacing = numeric(parameters.tie_support_spacing_mm || 0);
      let tiesPerMember = 0;
      if (supportZone > 0 || supportSpacing > 0) {
        const supportIntervals = Math.ceil(supportZone / supportSpacing);
        const middleLength = available - 2 * supportZone;
        const middleInterior = middleLength > 0 ? Math.max(Math.ceil(middleLength / tieSpacing) - 1, 0) : 0;
        tiesPerMember = 2 * (supportIntervals + 1) + middleInterior;
        parameterSteps.push(
          'Panjang efektif sengkang = (' + shown(memberLength, 3) + ' m × 1.000) − (2 × ' + shown(endOffset, 0) + ' mm) = ' + shown(available, 0) + ' mm.',
          'Interval tiap zona tumpuan = ceil(' + shown(supportZone, 0) + ' ÷ ' + shown(supportSpacing, 0) + ') = ' + shown(supportIntervals, 0) + ' interval.',
          'Panjang zona lapangan = ' + shown(available, 0) + ' − (2 × ' + shown(supportZone, 0) + ') = ' + shown(middleLength, 0) + ' mm; sengkang interior lapangan = ' + shown(middleInterior, 0) + '.',
          'Jumlah sengkang per elemen = 2 × (' + shown(supportIntervals, 0) + ' + 1) + ' + shown(middleInterior, 0) + ' = ' + shown(tiesPerMember, 0) + ' buah.',
        );
      } else {
        tiesPerMember = Math.ceil(available / tieSpacing) + 1;
        parameterSteps.push(
          'Panjang efektif sengkang = (' + shown(memberLength, 3) + ' m × 1.000) − (2 × ' + shown(endOffset, 0) + ' mm) = ' + shown(available, 0) + ' mm.',
          'Jumlah sengkang per elemen = ceil(' + shown(available, 0) + ' ÷ ' + shown(tieSpacing, 0) + ') + 1 = ' + shown(tiesPerMember, 0) + ' buah.',
        );
      }
      const cutLength = (2 * (centerlineWidth + centerlineDepth) + 2 * hook) / 1000;
      parameterSteps.push(
        'Lebar garis tengah sengkang = ' + shown(tieWidth, 0) + ' − (2 × ' + shown(tieCover, 0) + ') − ' + shown(tieDiameter, 0) + ' = ' + shown(centerlineWidth, 0) + ' mm.',
        'Tinggi garis tengah sengkang = ' + shown(tieDepth, 0) + ' − (2 × ' + shown(tieCover, 0) + ') − ' + shown(tieDiameter, 0) + ' = ' + shown(centerlineDepth, 0) + ' mm.',
        'Panjang potong sengkang = [2 × (' + shown(centerlineWidth, 0) + ' + ' + shown(centerlineDepth, 0) + ') + (2 × ' + shown(hook, 0) + ')] ÷ 1.000 = ' + shown(cutLength, 3) + ' m.',
        'Jumlah sengkang seluruh elemen = ' + shown(tiesPerMember, 0) + ' × ' + shown(memberCount, 0) + ' = ' + shown(tiesPerMember * memberCount, 0) + ' buah.',
      );
    }
  }

  if (!lines.length) throw new Error('Isi minimal satu kelompok tulangan dengan diameter, jumlah, jarak/panjang yang lengkap.');
  const diameterMap = new Map<number, { totalLengthM: number; requiredWeightKg: number; weightPerMeter: number }>();
  lines.forEach((line) => {
    const old = diameterMap.get(line.diameter) || { totalLengthM: 0, requiredWeightKg: 0, weightPerMeter: line.weightPerMeter };
    old.totalLengthM += line.totalLengthM * multiplier;
    old.requiredWeightKg += line.weightKg * multiplier;
    diameterMap.set(line.diameter, old);
  });
  const diameterSummary = Array.from(diameterMap.entries()).sort((a, b) => a[0] - b[0]).map(([diameter, totals]) => {
    const stockBars = Math.ceil((totals.totalLengthM * (1 + wastePct / 100)) / stockLengthM);
    return {
      diameter,
      totalLengthM: totals.totalLengthM,
      requiredWeightKg: totals.requiredWeightKg,
      stockBars,
      weightPerMeter: totals.weightPerMeter,
      stockWeightKg: stockBars * stockLengthM * totals.weightPerMeter,
    };
  });
  const totalLengthM = lines.reduce((sum, line) => sum + line.totalLengthM, 0) * multiplier;
  const totalWeightKg = lines.reduce((sum, line) => sum + line.weightKg, 0) * multiplier;
  const totalStockBars = diameterSummary.reduce((sum, line) => sum + line.stockBars, 0);
  const totalStockWeightKg = diameterSummary.reduce((sum, line) => sum + line.stockWeightKg, 0);
  const formulas = [...setupNotes, ...lines.map((line) =>
    line.label + ': ' + line.pieces + ' potong × ' + shown(line.cutLengthM, 3) +
    ' m = ' + shown(line.totalLengthM, 3) + ' m; Ø' + shown(line.diameter, 0) +
    ' (' + shown(line.weightPerMeter, 3) + ' kg/m) = ' + shown(line.weightKg, 3) + ' kg',
  )];

  const operationalSteps = [
    ...setupNotes,
    ...parameterSteps,
    ...lines.flatMap((line) => [
      line.label + ' — jumlah potongan: ' + shown(line.pieces, 0) + ' potong.',
      'Panjang total: ' + shown(line.pieces, 0) + ' × ' + shown(line.cutLengthM, 3) +
        ' m = ' + shown(line.totalLengthM, 3) + ' m.',
      'Berat teoritis: ' + shown(line.totalLengthM, 3) + ' m × ' +
        shown(line.weightPerMeter, 3) + ' kg/m = ' + shown(line.weightKg, 3) + ' kg.',
    ]),
    ...diameterSummary.flatMap((row) => [
      'Ø' + shown(row.diameter, 0) + ' — panjang setelah faktor pengali: ' +
        shown(row.totalLengthM, 3) + ' m; berat kebutuhan: ' + shown(row.requiredWeightKg, 3) + ' kg.',
      'Estimasi batang stok Ø' + shown(row.diameter, 0) + ': ceil((' +
        shown(row.totalLengthM, 3) + ' m × (1 + ' + shown(wastePct, 2) +
        '%)) ÷ ' + shown(stockLengthM, 2) + ' m) = ' + shown(row.stockBars, 0) + ' batang.',
      'Berat stok ekuivalen Ø' + shown(row.diameter, 0) + ': ' +
        shown(row.stockBars, 0) + ' × ' + shown(stockLengthM, 2) + ' m × ' +
        shown(row.weightPerMeter, 3) + ' kg/m = ' + shown(row.stockWeightKg, 3) + ' kg.',
    ]),
    'Total panjang seluruh kelompok: ' + shown(totalLengthM, 3) + ' m.',
    'Total berat kebutuhan teoritis: ' + shown(totalWeightKg, 3) + ' kg.',
    'Total estimasi batang stok: ' + shown(totalStockBars, 0) + ' batang.',
    'Total berat ekuivalen stok: ' + shown(totalStockWeightKg, 3) + ' kg.',
  ];

  return {
    structureLabel: LABELS[structure],
    totalLengthM,
    totalWeightKg,
    totalStockBars,
    totalStockWeightKg,
    stockLengthM,
    breakdown: lines,
    diameterSummary,
    formulas,
    operationalSteps,
  };
}

export function describeStructuredRebar(parameters: Record<string, any>, multiplier = 1): string {
  const result = calculateStructuredRebar(parameters, multiplier);
  return [
    'Jenis struktur: ' + result.structureLabel,
    'Tahapan operasional:',
    ...result.operationalSteps.map((step, index) => (index + 1) + '. ' + step),
  ].join('\\n');
}

export type CustomFormulaCalculationStep = {
  /** Kedalaman kelompok; dipakai untuk indentasi pada pratinjau dan PDF. */
  depth: number;
  expression: string;
  result: number;
};

export type CustomFormulaCalculationTrace = {
  expression: string;
  numericExpression: string;
  steps: CustomFormulaCalculationStep[];
  result: number;
};

const formatCustomFormulaNumber = (value: number) =>
  value.toLocaleString('id-ID', { maximumFractionDigits: 4 });

const customOperatorSymbol = (operator: ArithmeticOperator) => {
  if (operator === '*') return '×';
  if (operator === '/') return '÷';
  if (operator === '-') return '−';
  return '+';
};

function evaluateCustomNodesWithTrace(
  nodes: CustomFormulaNode[],
  steps: CustomFormulaCalculationStep[],
  depth: number,
): { value: number; expression: string } {
  if (!nodes.length) throw new Error('Tambahkan minimal satu sub-kategori pada setiap kelompok.');

  const operands = nodes.map((node) => {
    if (node.kind === 'group') {
      const nested = evaluateCustomNodesWithTrace(node.children || [], steps, depth + 1);
      return { value: nested.value, expression: '(' + nested.expression + ')' };
    }

    const raw = Number(node.value);
    if (String(node.value ?? '').trim() === '' || !Number.isFinite(raw)) {
      throw new Error('Nilai pada sub-kategori "' + (node.label || 'tanpa nama') + '" belum valid.');
    }
    return { value: raw, expression: formatCustomFormulaNumber(raw) };
  });

  const operators = nodes.slice(1).map((node) => node.operator || '+');
  const expression = operands.map((operand, index) =>
    (index ? ' ' + customOperatorSymbol(operators[index - 1]) + ' ' : '') + operand.expression,
  ).join('');

  // Pertahankan persis perilaku evaluator yang sudah dipakai data lama:
  // kali/bagi dihitung di dalam satu term, lalu term dijumlahkan.
  // Pada evaluator lama tanda '-' memberi tanda negatif pada term sebelumnya.
  const terms: number[] = [];
  let current = operands[0].value;

  for (let index = 1; index < operands.length; index += 1) {
    const operator = operators[index - 1];
    const next = operands[index].value;

    if (operator === '*') {
      const left = current;
      current *= next;
      steps.push({
        depth,
        expression: formatCustomFormulaNumber(left) + ' × ' + formatCustomFormulaNumber(next),
        result: current,
      });
    } else if (operator === '/') {
      if (next === 0) throw new Error('Pembagian dengan nol tidak diperbolehkan.');
      const left = current;
      current /= next;
      steps.push({
        depth,
        expression: formatCustomFormulaNumber(left) + ' ÷ ' + formatCustomFormulaNumber(next),
        result: current,
      });
    } else {
      terms.push(current * (operator === '-' ? -1 : 1));
      current = next;
    }
  }
  terms.push(current);

  let total = terms[0];
  for (let index = 1; index < terms.length; index += 1) {
    const left = total;
    const right = terms[index];
    total += right;
    steps.push({
      depth,
      expression: formatCustomFormulaNumber(left) + ' + ' + formatCustomFormulaNumber(right),
      result: total,
    });
  }

  if (!Number.isFinite(total)) throw new Error('Hasil rumus bertingkat tidak valid.');
  return { value: total, expression };
}

export function evaluateCustomFormulaNodes(nodes: CustomFormulaNode[]): number {
  return evaluateCustomNodesWithTrace(nodes, [], 0).value;
}

export function calculateCustomBuilder(parameters: CustomFormulaParameters): number {
  const groups = parameters.groups || [];
  if (!groups.length) throw new Error('Tambahkan minimal satu kategori perhitungan.');
  return evaluateCustomFormulaNodes(groups);
}

export function describeCustomNode(node: CustomFormulaNode): string {
  if (node.kind === 'group') {
    return (node.label || 'Kategori') + ' = (' + (node.children || []).map((child, index) =>
      (index ? ' ' + (child.operator || '+') + ' ' : '') + describeCustomNode(child),
    ).join('') + ')';
  }
  return (node.label || 'Sub-kategori') + ' = ' + String(node.value ?? '') + (node.unit ? ' ' + node.unit : '');
}

export function describeCustomBuilder(parameters: CustomFormulaParameters): string {
  const groups = parameters.groups || [];
  return groups.map((group, index) =>
    (index ? ' ' + (group.operator || '+') + ' ' : '') + describeCustomNode(group),
  ).join(' ');
}

/**
 * Membentuk satu sumber rincian perhitungan untuk pratinjau aplikasi dan PDF.
 * Fungsi ini hanya membaca parameters yang sudah tersimpan; tidak mengubah payload.
 */
export function traceCustomBuilder(parameters: CustomFormulaParameters): CustomFormulaCalculationTrace {
  const groups = parameters.groups || [];
  if (!groups.length) throw new Error('Tambahkan minimal satu kategori perhitungan.');
  const steps: CustomFormulaCalculationStep[] = [];
  const evaluated = evaluateCustomNodesWithTrace(groups, steps, 0);
  return {
    expression: describeCustomBuilder(parameters),
    numericExpression: evaluated.expression,
    steps,
    result: evaluated.value,
  };
}

export function defaultRebarStructureParameters(kind: RebarStructureKind = 'beam') {
  const common = { structure_type: kind, stock_length_m: '12', waste_pct: '0', cover_mm: '' };
  if (kind === 'footplat' || kind === 'slab') {
    return { ...common, flat_length_m: '', flat_width_m: '', member_count: '1', layers: '1', spacing_x_mm: '', spacing_y_mm: '', diameter_x_mm: '', diameter_y_mm: '', lap_allowance_mm: '' };
  }
  if (kind === 'stair') {
    return {
      ...common, step_count: '', tread_width_m: '', riser_height_m: '', stair_width_m: '', flight_count: '1',
      stair_main_diameter_mm: '', stair_main_spacing_mm: '', stair_main_layers: '1', stair_main_anchor_mm: '',
      stair_distribution_diameter_mm: '', stair_distribution_spacing_mm: '', stair_distribution_layers: '1', stair_distribution_extra_mm: '',
      landing_count: '0', landing_length_m: '', landing_width_m: '', landing_layers: '1',
      landing_diameter_x_mm: '', landing_diameter_y_mm: '', landing_spacing_x_mm: '', landing_spacing_y_mm: '',
    };
  }
  const longitudinal = kind === 'beam'
    ? [
        { label: 'Tulangan utama menerus', diameter_mm: '', bars_per_member: '', positions_per_member: '1', length_mode: 'member', fixed_length_m: '', extra_length_m: '' },
        { label: 'Tulangan tambahan tumpuan', diameter_mm: '', bars_per_member: '', positions_per_member: '2', length_mode: 'fixed', fixed_length_m: '', extra_length_m: '' },
        { label: 'Tulangan tambahan lapangan', diameter_mm: '', bars_per_member: '', positions_per_member: '1', length_mode: 'fixed', fixed_length_m: '', extra_length_m: '' },
      ]
    : [{ label: 'Tulangan pokok memanjang', diameter_mm: '', bars_per_member: '', positions_per_member: '1', length_mode: 'member', fixed_length_m: '', extra_length_m: '' }];
  return {
    ...common, member_length_m: '', member_count: '1', longitudinal_groups: longitudinal,
    tie_diameter_mm: '', tie_width_mm: '', tie_depth_mm: '', tie_spacing_mm: '', tie_support_zone_m: '', tie_support_spacing_mm: '', tie_cover_mm: '', tie_hook_mm: '', tie_end_offset_mm: '',
  };
}

export function defaultCustomBuilderParameters(): CustomFormulaParameters {
  return {
    groups: [{
      id: 'category-a', label: 'Kategori A', kind: 'group', operator: '+',
      children: [{ id: 'sub-a-1', label: 'Sub-kategori 1', kind: 'value', value: '0', unit: '', operator: '+' }],
    }],
  };
}
