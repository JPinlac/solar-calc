// DTE System Planner — live calculator.
// All inputs recalculate on every change. No federal tax credit assumed.
// Rate-inflation here is 3%/yr (conservative). The projections page uses 5.5%
// (aggressive) — we use the lower number for the headline payback because
// payback should not depend on optimistic rate assumptions.

(() => {
  const $ = (id) => document.getElementById(id);
  const fmtCurrency = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmtCurrency2 = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const fmtKwh = (n) => `${n.toFixed(1)} kWh`;

  // Constants from spec
  const EV_EFFICIENCY = 3.5;            // mi/kWh
  const HEAT_PUMP_WINTER_KWH = 12;      // kWh/day in winter only
  const EWH_KWH = 6;                    // kWh/day
  const COOL_CURRENTS_SUMMER_KWH_MO = 250;
  // Battery = Docan Panda 32 kWh @ $2,755 per unit + $560 flat freight once.
  // Matches the recommended Victron + Panda staged path used everywhere else on the site.
  const BATTERY_KWH_EACH = 32;
  const BATTERY_PRICE = 2755;
  const BATTERY_FREIGHT = 560;
  // Inverter is auto-sized — see autoSizeInverter(). Pricing comes from data.js:
  //   2× MultiPlus-II 48/3000 = $2,200; 2× MP2-5000 = $3,620; Cerbo GX = $350.
  const MPPT_PRICE = 800;
  // 400W panels at $145 each — Phono Solar via D2 Solar Detroit (local Detroit retailer,
  // cheaper than the $160 mail-order baseline used elsewhere on the site).
  const PANEL_PRICE = 145;
  const MINI_SPLIT_PRICE = 1100;
  const ROUND_TRIP = 0.9;               // 90% battery round-trip efficiency
  const SUMMER_PSH = 5.0;                // peak sun hours summer day avg
  const WINTER_PSH = 2.5;                // peak sun hours winter day avg
  const RATE_INFLATION = 0.03;          // 3% annual — conservative
  const PROJECTION_YEARS = 25;

  let chart = null;
  let activeSeason = 'summer';

  // ---------- Read form state ----------
  // Battery count and inverter tier are NOT user inputs anymore — both are
  // sized automatically from the load profile (see autoSizeBattery / autoSizeInverter).
  const readState = () => {
    const s = {
      dailyKwh: +$('dailyKwh').value,
      currentPlan: $('currentPlan').value,
      coolCurrents: $('coolCurrents').checked,
      addSolar: $('addSolar').checked,
      addBattery: true,
      addMiniSplit: $('addMiniSplit').checked,
      addEv: $('addEv').checked,
      addHeatPump: $('addHeatPump').checked,
      addEwh: $('addEwh').checked,
      panelCount: +$('panelCount').value,
      orientation: $('orientation').value,
      evMiles: +$('evMiles').value,
    };
    s.batteryCount = autoSizeBattery(s);
    s.inverterTier = autoSizeInverter(s);
    return s;
  };

  // ---------- Auto-sizing ----------
  // Battery sizes to the kWh that must be SHIFTED out of super-off-peak / off-peak
  // (i.e. the part of the daily load not consumed during the 1am-7am window).
  // EV is charged directly during super off-peak so it does NOT need battery capacity.
  // 20% headroom for cloudy winter days and degradation, rounded up to whole 32kWh Pandas.
  const SUPER_OFF_DIRECT_FRACTION = 0.18; // approx % of daily kWh during 1-7am per hourlyLoadProfile
  function autoSizeBattery(s) {
    const houseShiftable = s.dailyKwh * (1 - SUPER_OFF_DIRECT_FRACTION);
    let extraShiftable = 0;
    if (s.addHeatPump) extraShiftable += HEAT_PUMP_WINTER_KWH * 0.7; // winter-weighted annual avg
    if (s.addEwh) extraShiftable += EWH_KWH * 0.5;
    if (s.addMiniSplit) extraShiftable += 3;
    const required = (houseShiftable + extraShiftable) * 1.2;
    return Math.max(1, Math.ceil(required / BATTERY_KWH_EACH));
  }

  // Inverter sizes to total household daily load. MP2-3000 pair (6kW) handles a
  // typical home; heat pump or large totals (>=35 kWh/day) bump to MP2-5000 pair
  // (10kW); very large totals (>60 kWh/day) double up to two pairs in parallel.
  function autoSizeInverter(s) {
    const totalDaily = s.dailyKwh +
      (s.addEv ? s.evMiles / EV_EFFICIENCY : 0) +
      (s.addHeatPump ? HEAT_PUMP_WINTER_KWH * 0.7 : 0) +
      (s.addEwh ? EWH_KWH : 0);
    if (totalDaily > 60) {
      return { label: '4× Victron MultiPlus-II 48/5000 (20 kW parallel split phase) + Cerbo GX', cost: 7590, kw: 20 };
    }
    if (s.addHeatPump || totalDaily >= 35) {
      return { label: '2× Victron MultiPlus-II 48/5000 (10 kW split phase) + Cerbo GX', cost: 3970, kw: 10 };
    }
    return { label: '2× Victron MultiPlus-II 48/3000 (6 kW split phase) + Cerbo GX', cost: 2550, kw: 6 };
  }

  // ---------- Recommended plan (Section 5 decision matrix) ----------
  const recommendPlan = (s) => {
    if (s.addBattery) {
      return { id: 'D1.13', reason: 'Battery storage unlocks the 11.74¢ super off-peak rate from 1am–7am — the largest arbitrage spread DTE offers.' };
    }
    if (s.addSolar) {
      return { id: 'D1.2', reason: 'Solar self-consumption pairs best with D1.2: cheaper off-peak hours mean exports lose less value, and the 11am–7pm peak window aligns with afternoon production.' };
    }
    return { id: 'D1.11', reason: 'No battery and no solar — stay on D1.11, the default 4-hour peak window that minimizes exposure to TOU premiums.' };
  };

  // ---------- Rate lookup ----------
  // Returns the retail $/kWh for a given hour on a given plan & season.
  const rateAt = (planId, season, hour) => {
    const plan = DTE.plans[planId];
    const band = season === 'summer' ? plan.summer : plan.nonSummer;
    if (plan.hasSuperOff && band.superOffHours.includes(hour)) return band.superOff;
    if (band.peakHoursWeekday.includes(hour)) return band.peak;
    return band.offPeak;
  };

  const periodAt = (planId, season, hour) => {
    const plan = DTE.plans[planId];
    const band = season === 'summer' ? plan.summer : plan.nonSummer;
    if (plan.hasSuperOff && band.superOffHours.includes(hour)) return 'superOff';
    if (band.peakHoursWeekday.includes(hour)) return 'peak';
    return 'offPeak';
  };

  // ---------- Build hourly load profile for a representative day ----------
  const buildLoadDay = (s, season) => {
    let baseDaily = s.dailyKwh;

    // Cool Currents: subtract ~250 kWh/mo summer AC from main meter.
    if (s.coolCurrents && season === 'summer') {
      baseDaily = Math.max(2, baseDaily - (COOL_CURRENTS_SUMMER_KWH_MO / 30));
    }

    const load = DTE.hourlyLoadProfile.map(pct => baseDaily * pct);

    // EV — 12 kWh/day if EV checked, placed at super off-peak window for D1.13,
    // otherwise at off-peak overnight.
    if (s.addEv) {
      const evKwh = s.evMiles / EV_EFFICIENCY;
      const planId = recommendPlan(s).id;
      const hours = planId === 'D1.13' ? [1,2,3,4,5,6] : [22,23,0,1,2,3,4,5];
      const perHr = evKwh / hours.length;
      hours.forEach(h => load[h] += perHr);
    }

    // Heat pump — winter only, ~12 kWh/day. Bias toward morning/evening.
    if (s.addHeatPump && season === 'winter') {
      const hpHours = [6,7,8,17,18,19,20,21];
      const perHr = HEAT_PUMP_WINTER_KWH / hpHours.length;
      hpHours.forEach(h => load[h] += perHr);
    }

    // Electric water heater — ~6 kWh/day spread across off-peak.
    if (s.addEwh) {
      const planId = recommendPlan(s).id;
      const plan = DTE.plans[planId];
      const band = season === 'summer' ? plan.summer : plan.nonSummer;
      const peakSet = new Set(band.peakHoursWeekday);
      const superSet = new Set(plan.hasSuperOff ? band.superOffHours : []);
      const offPeakHours = [];
      for (let h = 0; h < 24; h++) {
        if (!peakSet.has(h) && !superSet.has(h)) offPeakHours.push(h);
      }
      const perHr = EWH_KWH / offPeakHours.length;
      offPeakHours.forEach(h => load[h] += perHr);
    }

    // Mini-split adds modest summer cooling + winter shoulder heat.
    if (s.addMiniSplit) {
      const msKwh = season === 'summer' ? 4 : 3;
      const msHours = season === 'summer' ? [12,13,14,15,16,17,18,19] : [6,7,8,17,18,19,20];
      const perHr = msKwh / msHours.length;
      msHours.forEach(h => load[h] += perHr);
    }

    return load;
  };

  // ---------- Solar production curve ----------
  // dailyKwh = arrayKw * peakSunHours * 0.82, distributed via hourlySolarShape.
  const buildSolarDay = (s, season) => {
    if (!s.addSolar) return new Array(24).fill(0);
    const arrayKw = s.panelCount * 0.4;
    const psh = season === 'summer' ? SUMMER_PSH : WINTER_PSH;
    const orient = DTE.solar.orientationFactor[s.orientation] || 1.0;
    const dailyKwh = arrayKw * psh * DTE.solar.systemLoss * orient;
    return DTE.hourlySolarShape.map(p => p * dailyKwh);
  };

  // ---------- Simulate one day ----------
  // Returns { hourly: [...24], dailyCost, dailyExportRevenue, gridImportByPeriod, batterySoc[] }
  const simulateDay = (s, season, planId) => {
    const load = buildLoadDay(s, season);
    const solar = buildSolarDay(s, season);
    const batteryCapacity = s.addBattery ? s.batteryCount * BATTERY_KWH_EACH : 0;
    let soc = batteryCapacity * 0.5; // start half full

    const plan = DTE.plans[planId];
    const band = season === 'summer' ? plan.summer : plan.nonSummer;
    const superOffRate = plan.hasSuperOff ? band.superOff : band.offPeak;

    const hourly = [];
    let dailyCost = 0;
    let dailyExport = 0;

    for (let h = 0; h < 24; h++) {
      const rate = rateAt(planId, season, h);
      const period = periodAt(planId, season, h);
      const isSuperOffWindow = plan.hasSuperOff && band.superOffHours.includes(h);

      let baseload = load[h];
      let solarKwh = solar[h];
      let net = baseload - solarKwh; // positive = need power, negative = excess
      let gridImport = 0;
      let exportKwh = 0;
      let batteryFlow = 0; // positive = charging, negative = discharging

      // D1.13 overnight charging: top off battery from super off-peak window.
      if (planId === 'D1.13' && isSuperOffWindow && batteryCapacity > 0 && soc < batteryCapacity) {
        const room = batteryCapacity - soc;
        const chargeKwh = Math.min(room, 3.0); // ~3 kWh/hr practical charge limit
        soc += chargeKwh * ROUND_TRIP; // grid kWh into battery, after losses
        gridImport += chargeKwh;
        batteryFlow += chargeKwh;
      }

      if (net < 0) {
        // Excess solar — try to charge battery, else export.
        const excess = -net;
        if (batteryCapacity > 0 && soc < batteryCapacity) {
          const room = batteryCapacity - soc;
          const chargeKwh = Math.min(room, excess);
          soc += chargeKwh * ROUND_TRIP; // round-trip loss on the way in
          batteryFlow += chargeKwh;
          const leftover = excess - chargeKwh;
          if (leftover > 0) {
            exportKwh += leftover;
          }
        } else {
          exportKwh += excess;
        }
      } else if (net > 0) {
        // Need power. Discharge battery if available and current rate > super off.
        let remaining = net;
        if (batteryCapacity > 0 && soc > 0 && rate > superOffRate + 0.001) {
          const discharge = Math.min(soc, remaining);
          soc -= discharge;
          batteryFlow -= discharge;
          remaining -= discharge;
        }
        if (remaining > 0) {
          gridImport += remaining;
        }
      }

      // Export revenue per Section 9: ~14¢ summer peak, ~7.75¢ otherwise.
      const exportRate = (season === 'summer' && period === 'peak')
        ? DTE.dg.exportRatePeakSummer
        : DTE.dg.exportRateOffPeak;
      const hourCost = gridImport * rate - exportKwh * exportRate;
      dailyCost += hourCost;
      dailyExport += exportKwh * exportRate;

      hourly.push({
        hour: h,
        load: baseload,
        solar: solarKwh,
        gridImport,
        exportKwh,
        batteryFlow,
        soc,
        period,
        rate,
      });
    }

    return { hourly, dailyCost, dailyExport, batteryCapacity };
  };

  // ---------- Equipment cost ----------
  const equipmentCost = (s) => {
    const items = [];
    let total = 0;

    // Inverter is auto-sized from total daily load. Always present (battery is
    // always part of the optimized scenario).
    items.push({ label: s.inverterTier.label, cost: s.inverterTier.cost });
    total += s.inverterTier.cost;

    // Battery is auto-sized to the shiftable daily load.
    const battSubtotal = s.batteryCount * BATTERY_PRICE;
    items.push({ label: `${s.batteryCount}× Docan Panda 32 kWh battery`, cost: battSubtotal });
    total += battSubtotal;
    items.push({ label: 'Freight (Houston TX, one-time)', cost: BATTERY_FREIGHT });
    total += BATTERY_FREIGHT;

    if (s.addSolar) {
      const panels = s.panelCount * PANEL_PRICE;
      items.push({ label: `${s.panelCount}× 400W Phono panels (D2 Solar Detroit)`, cost: panels });
      total += panels;
      items.push({ label: 'Victron SmartSolar MPPT 250/100', cost: MPPT_PRICE });
      total += MPPT_PRICE;
      const racking = s.panelCount <= 12 ? 500 : 1000;
      items.push({ label: 'Racking & wiring', cost: racking });
      total += racking;
    }

    if (s.addMiniSplit) {
      items.push({ label: 'Mini-split 12K BTU', cost: MINI_SPLIT_PRICE });
      total += MINI_SPLIT_PRICE;
    }

    if (s.coolCurrents) {
      items.push({ label: 'Cool Currents enrollment (DTE installs free)', cost: 0 });
    }

    return { items, total };
  };

  // ---------- Annualize ----------
  // Mix summer & winter daily costs: 4 summer months for D1.11/D1.13, 5 for D1.2.
  // We approximate annual = 122 summer days + 243 non-summer days for D1.11/D1.13,
  // and 153 / 212 for D1.2. Close enough.
  const annualizeCost = (s, planId) => {
    const summer = simulateDay(s, 'summer', planId);
    const winter = simulateDay(s, 'winter', planId);
    const summerDays = planId === 'D1.2' ? 153 : 122;
    const winterDays = 365 - summerDays;
    // Cool Currents: add the separate-meter cost back (~17¢ × 250 kWh/mo × 4 mo).
    let extra = 0;
    if (s.coolCurrents) {
      const ccSummer = DTE.plans['D1.1'].summer.effective * COOL_CURRENTS_SUMMER_KWH_MO * 4;
      const ccWinter = DTE.plans['D1.1'].nonSummer.effective * COOL_CURRENTS_SUMMER_KWH_MO * 0.2 * 8;
      extra = ccSummer + ccWinter;
    }
    return {
      annual: summer.dailyCost * summerDays + winter.dailyCost * winterDays + extra,
      summer, winter, summerDays, winterDays,
    };
  };

  // ---------- 25-year savings with 3% rate inflation ----------
  const projectSavings = (annualSavings) => {
    let total = 0;
    for (let y = 0; y < PROJECTION_YEARS; y++) {
      total += annualSavings * Math.pow(1 + RATE_INFLATION, y);
    }
    return total;
  };

  // ---------- Render results ----------
  const render = () => {
    const s = readState();
    const rec = recommendPlan(s);

    // Sync conditional sections
    $('solarOpts').classList.toggle('show', s.addSolar);
    $('evOpts').classList.toggle('show', s.addEv);

    // Sync value displays
    $('dailyKwhVal').textContent = s.dailyKwh;
    $('panelCountVal').textContent = s.panelCount;
    $('evMilesVal').textContent = s.evMiles;

    // "No-system" baseline must include the SAME load additions (EV, heat pump,
    // water heater, mini-split) as the optimized scenario — otherwise an EV would
    // make the optimized bill go up vs. a baseline that ignores it, and savings
    // look artificially small. Only the equipment that the system PROVIDES is
    // stripped: solar production and battery storage. Cool Currents stays in both
    // because it's a free DTE program, not equipment purchase.
    const baselineState = { ...s, addSolar: false, batteryCount: 0, addBattery: false };
    const baseline = annualizeCost(baselineState, s.currentPlan);
    const optimized = annualizeCost(s, rec.id);
    const annualSavings = baseline.annual - optimized.annual;

    const eq = equipmentCost(s);
    const payback = eq.total > 0 && annualSavings > 0 ? eq.total / annualSavings : null;
    const lifetimeSavings = annualSavings > 0 ? projectSavings(annualSavings) - eq.total : -eq.total;

    // Monthly bills
    const baselineMonthly = baseline.annual / 12;
    const optimizedMonthly = optimized.annual / 12;

    // Seasonal breakdown (per day)
    const sumProd = buildSolarDay(s, 'summer').reduce((a,b)=>a+b, 0);
    const winProd = buildSolarDay(s, 'winter').reduce((a,b)=>a+b, 0);

    // Build result HTML
    const out = $('calc-result');
    out.innerHTML = `
      <div class="card">
        <h3 style="margin-top:0">Recommended Plan: ${rec.id}</h3>
        <div class="reasoning">${rec.reason}</div>
      </div>

      <div class="card">
        <h3 style="margin-top:0;font-size:1rem">Auto-sized system</h3>
        <ul class="equipment-breakdown">
          <li><span>Battery</span><span>${s.batteryCount}× Docan Panda — ${s.batteryCount * BATTERY_KWH_EACH} kWh</span></li>
          <li><span>Inverter</span><span>${s.inverterTier.kw} kW Victron</span></li>
        </ul>
        <p class="small text-dim" style="margin-top:.5rem;margin-bottom:0">
          Sized to shift your full daily load with 20% headroom. Adjust your inputs above to re-size.
        </p>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <div class="metric-label">Current Bill</div>
          <div class="metric-value">${fmtCurrency(baselineMonthly)}</div>
          <div class="metric-sub">/month on ${s.currentPlan}</div>
        </div>
        <div class="metric good">
          <div class="metric-label">Optimized Bill</div>
          <div class="metric-value">${fmtCurrency(optimizedMonthly)}</div>
          <div class="metric-sub">/month on ${rec.id}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Equipment Cost</div>
          <div class="metric-value">${fmtCurrency(eq.total)}</div>
          <div class="metric-sub">No federal tax credit applied</div>
        </div>
        <div class="metric ${payback && payback < 15 ? 'good' : 'warn'}">
          <div class="metric-label">Payback Period</div>
          <div class="metric-value">${payback ? payback.toFixed(1) + ' yr' : '—'}</div>
          <div class="metric-sub">${annualSavings > 0 ? fmtCurrency(annualSavings) + ' annual savings' : 'No savings vs baseline'}</div>
        </div>
        <div class="metric ${lifetimeSavings > 0 ? 'good' : 'warn'}">
          <div class="metric-label">25-Year Net Savings</div>
          <div class="metric-value">${fmtCurrency(lifetimeSavings)}</div>
          <div class="metric-sub">3%/yr rate inflation, equipment cost subtracted</div>
        </div>
      </div>

      ${eq.items.length ? `
        <div class="card">
          <h3 style="margin-top:0;font-size:1rem">Equipment breakdown</h3>
          <ul class="equipment-breakdown">
            ${eq.items.map(i => `<li><span>${i.label}</span><span>${fmtCurrency(i.cost)}</span></li>`).join('')}
            <li><strong>Total</strong><strong>${fmtCurrency(eq.total)}</strong></li>
          </ul>
        </div>
      ` : ''}

      <div class="chart-card">
        <h3>Daily energy flow</h3>
        <div class="season-toggle">
          <button type="button" data-season="summer" class="${activeSeason==='summer'?'active':''}">Summer day</button>
          <button type="button" data-season="winter" class="${activeSeason==='winter'?'active':''}">Winter day</button>
        </div>
        <div class="chart-wrap"><canvas id="dayChart"></canvas></div>
        <p class="small text-dim" style="margin-top:.5rem">
          Bars: grid import colored by rate period. Lines: load, solar production, and battery state of charge.
        </p>
      </div>

      <div class="card">
        <h3 style="margin-top:0;font-size:1rem">Seasonal breakdown</h3>
        <div class="seasonal-grid">
          <div>
            <h4>Summer day</h4>
            <div>Solar: <span class="val">${fmtKwh(sumProd)}</span></div>
            <div>Optimized cost: <span class="val">${fmtCurrency2(optimized.summer.dailyCost)}</span></div>
            <div>Baseline cost: <span class="val">${fmtCurrency2(baseline.summer.dailyCost)}</span></div>
          </div>
          <div>
            <h4>Winter day</h4>
            <div>Solar: <span class="val">${fmtKwh(winProd)}</span></div>
            <div>Optimized cost: <span class="val">${fmtCurrency2(optimized.winter.dailyCost)}</span></div>
            <div>Baseline cost: <span class="val">${fmtCurrency2(baseline.winter.dailyCost)}</span></div>
          </div>
        </div>
        <p class="small text-dim" style="margin-top:.75rem">
          Note: payback uses a conservative 3%/yr rate inflation. The projections page uses 5.5%/yr —
          that's the aggressive scenario justified by Michigan-specific data-center demand and grid hardening.
          We use the lower figure here so headline payback isn't dependent on optimistic forecasts.
        </p>
      </div>
    `;

    // Wire up season toggle
    out.querySelectorAll('.season-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSeason = btn.dataset.season;
        out.querySelectorAll('.season-toggle button').forEach(b => b.classList.toggle('active', b === btn));
        renderChart(s, rec.id);
      });
    });

    renderChart(s, rec.id);
  };

  // ---------- Chart ----------
  const renderChart = (s, planId) => {
    const canvas = document.getElementById('dayChart');
    if (!canvas) return;

    // Always destroy the previous chart instance before drawing a new one,
    // otherwise Chart.js leaks event listeners and stacks canvases.
    if (chart) { chart.destroy(); chart = null; }

    const sim = simulateDay(s, activeSeason, planId);
    const labels = Array.from({ length: 24 }, (_, h) => `${h}:00`);

    const peakColor = 'rgba(239,71,111,0.7)';
    const offPeakColor = 'rgba(76,201,240,0.55)';
    const superOffColor = 'rgba(17,138,178,0.65)';
    const colorFor = (p) => p === 'peak' ? peakColor : p === 'superOff' ? superOffColor : offPeakColor;

    const gridImportData = sim.hourly.map(h => +h.gridImport.toFixed(3));
    const gridColors = sim.hourly.map(h => colorFor(h.period));
    const loadData = sim.hourly.map(h => +h.load.toFixed(3));
    const solarData = sim.hourly.map(h => +h.solar.toFixed(3));
    const socData = sim.hourly.map(h => +h.soc.toFixed(3));

    const datasets = [
      {
        type: 'bar',
        label: 'Grid import (by rate)',
        data: gridImportData,
        backgroundColor: gridColors,
        borderWidth: 0,
        yAxisID: 'y',
        order: 3,
      },
      {
        type: 'line',
        label: 'Load (kWh)',
        data: loadData,
        borderColor: '#e6edf3',
        backgroundColor: 'rgba(230,237,243,0.1)',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        yAxisID: 'y',
        order: 1,
      },
    ];

    if (s.addSolar) {
      datasets.push({
        type: 'line',
        label: 'Solar (kWh)',
        data: solarData,
        borderColor: '#ffd166',
        backgroundColor: 'rgba(255,209,102,0.2)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        yAxisID: 'y',
        order: 2,
      });
    }

    if (s.addBattery) {
      datasets.push({
        type: 'line',
        label: 'Battery SOC (kWh)',
        data: socData,
        borderColor: '#06d6a0',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [4, 3],
        tension: 0.3,
        pointRadius: 0,
        yAxisID: 'y1',
        order: 0,
      });
    }

    chart = new Chart(canvas.getContext('2d'), {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#e6edf3' } },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                if (ctx.dataset.label === 'Grid import (by rate)') {
                  const h = sim.hourly[ctx.dataIndex];
                  return `Rate: ${h.period} (${(h.rate * 100).toFixed(2)}¢)`;
                }
                return '';
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: '#9ba9b4', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: {
            title: { display: true, text: 'kWh / hour', color: '#9ba9b4' },
            ticks: { color: '#9ba9b4' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: true,
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Battery SOC (kWh)', color: '#06d6a0' },
            ticks: { color: '#06d6a0' },
            grid: { drawOnChartArea: false },
            beginAtZero: true,
            display: s.addBattery,
          },
        },
      },
    });
  };

  // ---------- Wire inputs ----------
  const init = () => {
    const form = document.getElementById('calc-form');
    if (!form) return;
    form.addEventListener('input', render);
    form.addEventListener('change', render);
    render();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
