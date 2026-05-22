// Single source of truth for DTE rates, solar production, equipment, and load profiles.
// All rates in dollars per kWh unless noted. Rates include capacity + non-capacity + distribution;
// they do NOT include PSCR or other riders. Pulled from DTE rate cards effective early 2026.

const DTE = {
  // ---------- Rate plans ----------
  plans: {
    'D1.11': {
      id: 'D1.11',
      name: 'Time of Day 3pm–7pm (Default)',
      summary: 'All DTE customers were moved to this plan in March 2023. 4-hour peak window — shortest of any TOU plan.',
      summer: { months: [6,7,8,9],
        offPeak: 0.1844, peak: 0.2413,
        peakHoursWeekday: [15,16,17,18],
      },
      nonSummer: { months: [1,2,3,4,5,10,11,12],
        offPeak: 0.1844, peak: 0.2005,
        peakHoursWeekday: [15,16,17,18],
      },
      hasSuperOff: false,
    },
    'D1.2': {
      id: 'D1.2',
      name: 'Time of Day 11am–7pm',
      summary: '8-hour peak window, but significantly cheaper off-peak rate. Good for solar self-consumption.',
      summer: { months: [6,7,8,9,10],
        offPeak: 0.1518, peak: 0.2593,
        peakHoursWeekday: [11,12,13,14,15,16,17,18],
      },
      nonSummer: { months: [1,2,3,4,5,11,12],
        offPeak: 0.1497, peak: 0.2341,
        peakHoursWeekday: [11,12,13,14,15,16,17,18],
      },
      hasSuperOff: false,
    },
    'D1.13': {
      id: 'D1.13',
      name: 'Overnight Savers',
      summary: 'Three-tier pricing with cheapest super off-peak (11.74¢) of any DTE plan. Optimal for battery + EV.',
      summer: { months: [6,7,8,9],
        superOff: 0.1174, offPeak: 0.2546, peak: 0.3556,
        superOffHours: [1,2,3,4,5,6],
        peakHoursWeekday: [15,16,17,18],
      },
      nonSummer: { months: [1,2,3,4,5,10,11,12],
        superOff: 0.1174, offPeak: 0.1555, peak: 0.1906,
        superOffHours: [1,2,3,4,5,6],
        peakHoursWeekday: [15,16,17,18],
      },
      hasSuperOff: true,
    },
    'D1.8': {
      id: 'D1.8',
      name: 'Dynamic Peak Pricing (closed to new enrollment)',
      summary: 'Legacy dynamic plan. Closed to new customers. Listed for historical reference.',
      offPeak: 0.1431, midPeak: 0.1861, peak: 0.2692, criticalPeak: 1.05,
      closedToNew: true,
    },
    'D1.1': {
      id: 'D1.1',
      name: 'Cool Currents (separate meter for central AC)',
      summary: 'DTE installs a separate meter for your central AC. Effective ~17¢/kWh summer, ~15¢/kWh winter.',
      summer: { capacityEnergy: 0.02832, nonCapacityEnergy: 0.04535, distribution: 0.09726, serviceCharge: 1.95, effective: 0.171 },
      nonSummer: { capacityEnergy: 0.00702, nonCapacityEnergy: 0.04535, distribution: 0.09726, serviceCharge: 0, effective: 0.150 },
      note: 'DTE may briefly cycle the AC during high-demand events.',
    },
  },

  // ---------- Common charges & DG ----------
  common: {
    serviceCharge: 8.50,
    riaCredit: -8.50,
    distribution: 0.09726,
  },

  dg: {
    interconnectionFee: 50,
    sizingCap: 1.10, // 110% of previous 12-month usage
    exportRateOffPeak: 0.0775,
    exportRatePeakSummer: 0.14,
    note: 'DTE replaced net metering with an inflow/outflow DG program. Export rates are far below retail, so systems should be designed to maximize self-consumption.',
  },

  itc: {
    eliminated: true,
    effectiveDate: '2026-01-01',
    rate: 0.0,
    legislation: 'One Big Beautiful Bill Act, signed July 4, 2025',
    note: 'The 30% federal residential solar tax credit (Section 25D) was ELIMINATED for customer-owned residential solar/battery systems effective January 1, 2026. Third-party owned systems (leases/PPAs) may still qualify under Section 48E commercial credits.',
  },

  // ---------- Solar production (Southeast Michigan, ~42°N) ----------
  solar: {
    annualPeakSunHours: 3.7,
    systemLoss: 0.82,
    monthlyPeakSunHours: {
      1: 2.2, 2: 2.8, 3: 3.5, 4: 4.2,
      5: 4.8, 6: 5.2, 7: 5.3, 8: 4.8,
      9: 4.0, 10: 3.2, 11: 2.2, 12: 1.8,
    },
    // Production per kW installed
    summerKwhPerKwPerDay: 4.25,
    winterKwhPerKwPerDay: 2.4,
    annualKwhPerKwLow: 1200,
    annualKwhPerKwHigh: 1350,
    // Roof orientation derate (vs south-facing optimum)
    orientationFactor: { S: 1.0, SE: 0.96, SW: 0.96, E: 0.88, W: 0.88 },
  },

  // Array size catalog
  arrays: [
    { kw: 2.4, panels: 6, kwhLow: 2900, kwhHigh: 3200, best: 'Minimal baseline offset' },
    { kw: 3.2, panels: 8, kwhLow: 3800, kwhHigh: 4300, best: 'Small household, ~15 kWh/day' },
    { kw: 4.8, panels: 12, kwhLow: 5700, kwhHigh: 6500, best: 'Average household, ~19 kWh/day' },
    { kw: 6.4, panels: 16, kwhLow: 7600, kwhHigh: 8600, best: 'Household + mini-split' },
    { kw: 8.0, panels: 20, kwhLow: 9600, kwhHigh: 10800, best: 'Household + EV (light driving)' },
    { kw: 10.0, panels: 25, kwhLow: 12000, kwhHigh: 13500, best: 'Household + EV + heat pump' },
  ],

  // ---------- Equipment catalog ----------
  equipment: {
    inverters: [
      { id: 'victron-mp2-3k', model: '2× Victron MultiPlus-II 48/3000', voltage: '48V', output: '6kW split phase', pv: 'External MPPT', price: 2200, bestFor: 'Staged builds, battery-first, Dynamic ESS' },
      { id: 'victron-mp2-5k', model: '2× Victron MultiPlus-II 48/5000', voltage: '48V', output: '10kW split phase', pv: 'External MPPT', price: 3620, bestFor: 'Larger homes, heavy loads, staged' },
      { id: 'eg4-12kpv', model: 'EG4 12kPV Hybrid', voltage: '48V', output: '8kW', pv: '12kW built-in', price: 4049, bestFor: 'All-in-one, simple install' },
      { id: 'eg4-18kpv', model: 'EG4 18kPV Hybrid', voltage: '48V', output: '12kW', pv: '18kW built-in', price: 4898, bestFor: 'Large homes, heavy loads' },
      { id: 'growatt-sph', model: 'Growatt SPH 10000', voltage: 'HV (400V)', output: '10kW', pv: '15kW', price: 2816, bestFor: 'HV battery systems (not DIY recommended)' },
    ],
    batteries: [
      { id: 'docan-panda', model: 'Docan Panda', voltage: '51.2V', kwh: 32, costPerKwh: 86, cycles: 8000, price: 2755, shipping: 560, bestFor: 'Best value, large capacity, Victron compatible' },
      { id: 'eg4-lls', model: 'EG4 LL-S', voltage: '48V', kwh: 4.8, costPerKwh: 298, cycles: 7000, price: 1430, shipping: 0, bestFor: 'Modular 48V systems, DIY' },
      { id: 'lg-16h', model: 'LG 16H Prime', voltage: '400V HV', kwh: 16, costPerKwh: 172, cycles: 8000, price: 2750, shipping: 0, bestFor: 'HV systems only, max brand reliability' },
    ],
    panels: {
      sweetSpot: '400W panels at ~$160 each (bulk/sale pricing)',
      example: '8× 400W for $1,276 shipped (CCCell brand)',
      specs: 'efficiency >20%, 25-year warranty, bifacial preferred',
      pricePerPanel: 160,
    },
    comfort: [
      { equipment: 'Mini-split 12K BTU', purpose: 'Zone cooling/heating + supplemental heat pump in winter', cost: '$700–1,500', energy: '500–600W draw' },
      { equipment: 'Cool Currents (DTE)', purpose: 'Central AC discount rate (separate meter)', cost: 'Free install', energy: 'Moves AC to ~17¢ flat rate' },
      { equipment: 'Pioneer ECOasis ERV', purpose: 'Fresh air + MERV 13 filter', cost: '$300–400', energy: '~8W draw' },
    ],
    accessories: {
      cerboGx: 350,
      victronMppt250_100: 800,
      rackingPerArray: 500,
    },
  },

  // ---------- Hourly load profile (% of daily kWh) ----------
  hourlyLoadProfile: [
    0.025, 0.025, 0.025, 0.025, 0.025, 0.030, // 0-5
    0.040, 0.050, 0.050, 0.045, 0.045, 0.045, // 6-11
    0.050, 0.050, 0.050, 0.055, 0.060, 0.060, // 12-17
    0.055, 0.050, 0.045, 0.040, 0.035, 0.030, // 18-23
  ],

  // Normalized hourly solar shape (peaks at solar noon, zero at night).
  // Use to distribute daily kWh across the day.
  hourlySolarShape: (function () {
    const shape = new Array(24).fill(0);
    // Sunrise ~6, sunset ~20 (annual average; very rough for Michigan).
    for (let h = 6; h <= 20; h++) {
      const x = (h - 13) / 7; // peak at 13 (1pm)
      shape[h] = Math.max(0, Math.cos((x * Math.PI) / 2));
    }
    const sum = shape.reduce((a,b) => a+b, 0);
    return shape.map(v => v / sum);
  })(),

  // ---------- Rate projections (5.5% aggressive scenario) ----------
  projections: {
    annualGrowth: 0.055,
    baseYear: 2026,
    rationale: [
      'Data center demand surge in Michigan',
      'Grid hardening / aging infrastructure',
      'Coal plant decommissioning capital recovery',
      'Battery storage buildout (Trenton Channel)',
      'AI / electrification demand growth',
      'Annual rate case filings (vs biannual historically)',
      'General inflation baseline',
    ],
    history: [
      { year: 2015, rate: 0.145, change: null },
      { year: 2016, rate: 0.150, change: 0.034 },
      { year: 2017, rate: 0.155, change: 0.033 },
      { year: 2018, rate: 0.160, change: 0.032 },
      { year: 2019, rate: 0.165, change: 0.031 },
      { year: 2020, rate: 0.170, change: 0.030 },
      { year: 2021, rate: 0.179, change: 0.053 },
      { year: 2022, rate: 0.180, change: 0.006 },
      { year: 2023, rate: 0.188, change: 0.044 },
      { year: 2024, rate: 0.195, change: 0.037 },
      { year: 2025, rate: 0.205, change: 0.051 },
      { year: 2026, rate: 0.209, change: 0.020 },
    ],
  },

  // ---------- Example system configurations ----------
  configurations: [
    {
      id: 'A',
      name: 'Battery-Only Arbitrage (No Solar)',
      bestFor: 'Renters, shaded roofs, waiting on a reroof',
      components: [
        { component: 'Inverter', model: 'EG4 12kPV Hybrid 48V', price: 4049 },
        { component: 'Battery', model: '4× EG4 LL-S 48V 100Ah (19.2 kWh)', price: 5720 },
      ],
      total: 9769,
      mechanism: 'Switch to D1.13 Overnight Savers. Charge battery at 11.74¢ during 1am–7am super off-peak. Discharge during peak (35.56¢ summer) and off-peak (25.46¢ summer) hours.',
      annualSavings: '$450–550 battery-only, $700+ with EV',
      payback: '~14–18 years battery-only, ~10–12 years with EV',
    },
    {
      id: 'B',
      name: 'Solar + Battery — Standard Home (~19 kWh/day)',
      bestFor: 'Average DTE household, timed with roof replacement',
      components: [
        { component: 'Inverter', model: 'EG4 12kPV Hybrid 48V', price: 4049 },
        { component: 'Battery', model: '4× EG4 LL-S 48V 100Ah (19.2 kWh)', price: 5720 },
        { component: 'Panels', model: '8× 400W (3.2 kW array)', price: 1276 },
        { component: 'Racking/wiring', model: 'Various', price: 750 },
      ],
      total: 11545,
      mechanism: 'D1.13 Overnight Savers. Solar charges battery during day, battery discharges during peak. Super off-peak tops off overnight.',
      annualSavings: '$800–900',
      payback: '~13–14 years. 25-year savings: ~$15,000+',
    },
    {
      id: 'C',
      name: 'Future-Proof — Home + EV + Heat Pump',
      bestFor: 'Households planning electrification over next 3–5 years',
      components: [
        { component: 'Inverter', model: 'EG4 12kPV Hybrid 48V', price: 4049 },
        { component: 'Battery', model: '5× EG4 LL-S 48V 100Ah (24 kWh)', price: 7150 },
        { component: 'Panels', model: '20× 400W (8.0 kW array)', price: 3200 },
        { component: 'Racking/wiring', model: 'Various', price: 1250 },
      ],
      total: 15899,
      mechanism: 'Daily usage 50–70 kWh (home + EV + heat pump in winter).',
      annualSavings: '$1,500–2,000',
      payback: '~8–10 years. 25-year savings: ~$30,000+',
    },
    {
      id: 'D',
      name: 'Comfort Upgrade — Mini-Split + Cool Currents',
      bestFor: 'Homes with hot rooms where central AC struggles',
      components: [
        { component: 'Mini-split 12,000 BTU', model: 'Living room cooling/heating', price: 1100 },
        { component: 'Cool Currents enrollment', model: 'Central AC on separate meter at ~17¢', price: 0 },
        { component: 'Pioneer ECOasis ERV', model: 'Fresh air + MERV 13 filtration', price: 350 },
      ],
      total: 1450,
      mechanism: 'Central AC runs on Cool Currents at the cheap flat rate. Mini-split handles problem areas and provides backup when DTE cycles the central unit. ERV provides filtered fresh air exchange at ~8W draw.',
      annualSavings: 'Varies — primarily comfort + AC cost shift',
      payback: 'Comfort benefit dominates ROI',
    },
    {
      id: 'E',
      name: 'RECOMMENDED — Victron + Docan Panda (Staged)',
      bestFor: 'DIY homeowners staging investment, maximizing battery arbitrage, adding solar later',
      stages: [
        {
          name: 'Stage 1 — Battery Arbitrage (no solar yet)',
          components: [
            { component: 'Inverter (split phase)', model: '2× Victron MultiPlus-II 48/3000', price: 2200 },
            { component: 'System controller', model: 'Victron Cerbo GX', price: 350 },
            { component: 'Battery', model: 'Docan Panda 32kWh 51.2V 628Ah LiFePO4', price: 2755 },
            { component: 'Shipping (from Houston TX)', model: 'Freight delivery', price: 560 },
          ],
          total: 5865,
          notes: 'Switch to D1.13. Victron Dynamic ESS automatically charges at super off-peak and discharges during peak.',
          annualSavings: '$450–550 house only, $700+ with EV',
          payback: '~8–12 years house only, ~7–8 years with EV',
        },
        {
          name: 'Stage 2 — Add Solar (with roof replacement)',
          components: [
            { component: 'Solar charge controller', model: 'Victron SmartSolar MPPT 250/100', price: 800 },
            { component: 'Panels', model: '8× 400W', price: 1276 },
            { component: 'Racking/wiring', model: 'Various', price: 500 },
          ],
          total: 2576,
          notes: 'Plugs into existing Cerbo GX. Dynamic ESS auto-incorporates solar. Nothing from Stage 1 wasted.',
          combinedAnnualSavings: '$900–1,100',
          combinedPayback: '~8–9 years on $8,441 combined',
        },
        {
          name: 'Stage 3 — Scale for EV + Heat Pump',
          components: [
            { component: 'Additional inverters', model: '2× Victron MultiPlus-II 48/5000 parallel', price: 3620 },
            { component: 'Additional solar', model: '12× 400W panels + MPPT + racking', price: 3000 },
            { component: 'Additional battery (optional)', model: 'Second Docan Panda 32kWh', price: 3315 },
          ],
        },
      ],
      total: 5865,
      reasoning: [
        'Each stage independently useful — nothing thrown away',
        'Dynamic ESS handles rate optimization automatically',
        'Modular: add inverters, MPPTs, batteries as budget allows',
        '48V system safe for DIY maintenance and expansion',
        'Works with virtually any 48V battery (not locked to one brand)',
        'Lower upfront cost than EG4 all-in-one when solar isn\'t needed yet',
      ],
    },
  ],

  // ---------- Real-world reference case (Dearborn, MI) ----------
  referenceCase: {
    location: 'Dearborn, MI',
    dailyMainMeter: 18.86,
    overnightBaselineW: 64,
    peakDemand15minKw: 2.185,
    topLoads: 'Furnace blower (55%), Kitchen (17%), Living room (15%)',
    currentPlan: 'D1.11 (3–7pm)',
    coolCurrents: true,
  },
};

// Expose globally.
window.DTE = DTE;
