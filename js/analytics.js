/**
 * analytics.js — Pure expense analytics calculations and Chart.js visualizations.
 * Independent of LocalStorage for seamless future backend REST integration.
 */

import { getExpenseCategoryTotals, getMonthlyDailySeries } from './dashboard.js';
import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
} from './transactions.js';

let incomeExpenseChartInstance = null;
let categoryBarChartInstance = null;
let distributionChartInstance = null;
let momChartInstance = null;

/**
 * Computes summary analytics metrics from transactions.
 * @param {Array<object>} transactions
 * @param {string} activeMonth YYYY-MM
 */
export function calculateAnalyticsMetrics(transactions, activeMonth) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlyIncome = 0;
  let monthlyExpenses = 0;

  transactions.forEach((tx) => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      if (tx.date.startsWith(activeMonth)) monthlyIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;
      if (tx.date.startsWith(activeMonth)) monthlyExpenses += tx.amount;
    }
  });

  const totalSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;
  const monthlyNet = monthlyIncome - monthlyExpenses;

  const categoryTotals = getExpenseCategoryTotals(transactions, null);
  const highestCategory = categoryTotals.length > 0 ? categoryTotals[0] : null;

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet,
    highestCategory,
    categoryTotals,
  };
}

/**
 * Builds a 6-month series ending at `activeMonth` comparing monthly income vs expenses.
 * @param {Array<object>} transactions
 * @param {string} activeMonth YYYY-MM
 * @param {number} count
 */
export function getMonthlyIncomeVsExpenseSeries(transactions, activeMonth, count = 6) {
  const [year, month] = activeMonth.split('-').map(Number);
  const monthKeys = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    const dt = new Date(year, month - 1 - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    monthKeys.push({
      key,
      label: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
  }

  const incomeData = monthKeys.map(({ key }) =>
    transactions
      .filter((tx) => tx.type === 'income' && tx.date.startsWith(key))
      .reduce((sum, tx) => sum + tx.amount, 0)
  );

  const expenseData = monthKeys.map(({ key }) =>
    transactions
      .filter((tx) => tx.type === 'expense' && tx.date.startsWith(key))
      .reduce((sum, tx) => sum + tx.amount, 0)
  );

  const hasData =
    incomeData.some((v) => v > 0) || expenseData.some((v) => v > 0);

  return {
    labels: monthKeys.map((m) => m.label),
    incomeData,
    expenseData,
    hasData,
  };
}

/**
 * Builds daily and cumulative spending distribution for the active month.
 * @param {Array<object>} transactions
 * @param {string} activeMonth
 */
export function getSpendingDistributionSeries(transactions, activeMonth) {
  const { labels, values, hasExpenses } = getMonthlyDailySeries(transactions, activeMonth);
  let running = 0;
  const cumulative = values.map((v) => {
    running += v;
    return Math.round(running * 100) / 100;
  });
  return { labels, daily: values, cumulative, hasExpenses };
}

function renderIncomeVsExpenseChart(transactions, activeMonth) {
  const canvas = document.getElementById('ana-income-expense-chart');
  const emptyEl = document.getElementById('ana-income-expense-empty');
  if (!canvas) return;

  if (incomeExpenseChartInstance) {
    incomeExpenseChartInstance.destroy();
    incomeExpenseChartInstance = null;
  }

  const { labels, incomeData, expenseData, hasData } = getMonthlyIncomeVsExpenseSeries(
    transactions,
    activeMonth,
    6
  );

  if (!hasData || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  incomeExpenseChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: '#15803d',
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: '#0f172a',
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#475569',
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            callback: (val) => `$${val}`,
          },
        },
      },
    },
  });
}

function renderCategoryBarChart(categoryTotals) {
  const canvas = document.getElementById('ana-category-bar-chart');
  const emptyEl = document.getElementById('ana-category-bar-empty');
  if (!canvas) return;

  if (categoryBarChartInstance) {
    categoryBarChartInstance.destroy();
    categoryBarChartInstance = null;
  }

  if (categoryTotals.length === 0 || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  categoryBarChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: categoryTotals.map((c) => c.category),
      datasets: [
        {
          label: 'Total Spent',
          data: categoryTotals.map((c) => c.total),
          backgroundColor: categoryTotals.map((c) => CATEGORY_COLORS[c.category] || '#64748b'),
          borderRadius: 4,
          maxBarThickness: 20,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = categoryTotals[ctx.dataIndex];
              return ` ${formatCurrency(item.total)} (${item.share.toFixed(1)}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            callback: (val) => `$${val}`,
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#334155', font: { size: 12, weight: '500' } },
        },
      },
    },
  });
}

function renderDistributionChart(transactions, activeMonth) {
  const canvas = document.getElementById('ana-distribution-chart');
  const emptyEl = document.getElementById('ana-distribution-empty');
  if (!canvas) return;

  if (distributionChartInstance) {
    distributionChartInstance.destroy();
    distributionChartInstance = null;
  }

  const { labels, cumulative, hasExpenses } = getSpendingDistributionSeries(
    transactions,
    activeMonth
  );

  if (!hasExpenses || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  distributionChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cumulative Monthly Spend',
          data: cumulative,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${formatMonthLabel(activeMonth)} · Day ${items[0].label}`,
            label: (ctx) => ` Cumulative: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            maxTicksLimit: 10,
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            callback: (val) => `$${val}`,
          },
        },
      },
    },
  });
}

function renderCategoryAllocationTable(categoryTotals) {
  const wrap = document.getElementById('ana-category-table-wrap');
  if (!wrap) return;

  if (categoryTotals.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-desc">No expense categories to display yet.</p>
      </div>
    `;
    return;
  }

  const rows = categoryTotals
    .map(
      (item) => `
      <tr>
        <td>
          <span class="legend-left">
            <span class="legend-swatch" style="background-color: ${
              CATEGORY_COLORS[item.category] || '#64748b'
            };"></span>
            <span>${escapeHtml(item.category)}</span>
          </span>
        </td>
        <td class="col-right tabular-nums">${item.count}</td>
        <td class="col-right tabular-nums">${escapeHtml(formatCurrency(item.total))}</td>
        <td class="col-right tabular-nums">${item.share.toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th class="col-right">Entries</th>
          <th class="col-right">Total</th>
          <th class="col-right">Share</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Computes Month-over-Month spending comparisons and category trends.
 * @param {Array<object>} transactions
 * @param {string} activeMonth YYYY-MM
 */
export function calculateMonthOverMonthSpending(transactions, activeMonth) {
  const [year, month] = activeMonth.split('-').map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const currentMonthLabel = formatMonthLabel(activeMonth);
  const prevMonthLabel = formatMonthLabel(prevMonthKey);

  const currentCategoryMap = new Map();
  const prevCategoryMap = new Map();
  let currentTotalExpenses = 0;
  let prevTotalExpenses = 0;

  transactions.forEach((tx) => {
    if (tx.type !== 'expense') return;
    if (tx.date.startsWith(activeMonth)) {
      currentCategoryMap.set(tx.category, (currentCategoryMap.get(tx.category) || 0) + tx.amount);
      currentTotalExpenses += tx.amount;
    } else if (tx.date.startsWith(prevMonthKey)) {
      prevCategoryMap.set(tx.category, (prevCategoryMap.get(tx.category) || 0) + tx.amount);
      prevTotalExpenses += tx.amount;
    }
  });

  const allCategories = new Set([...currentCategoryMap.keys(), ...prevCategoryMap.keys()]);
  const categoriesComparison = Array.from(allCategories).map((category) => {
    const current = currentCategoryMap.get(category) || 0;
    const previous = prevCategoryMap.get(category) || 0;
    const diff = current - previous;
    let percentChange = null;
    if (previous > 0) {
      percentChange = ((current - previous) / previous) * 100;
    }

    return {
      category,
      current,
      previous,
      diff,
      percentChange,
    };
  });

  categoriesComparison.sort((a, b) => b.current - a.current || b.previous - a.previous);

  const totalDiff = currentTotalExpenses - prevTotalExpenses;
  let totalPercentChange = null;
  if (prevTotalExpenses > 0) {
    totalPercentChange = ((currentTotalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100;
  }

  return {
    activeMonth,
    prevMonthKey,
    currentMonthLabel,
    prevMonthLabel,
    currentTotalExpenses,
    prevTotalExpenses,
    totalDiff,
    totalPercentChange,
    categoriesComparison,
    hasData: currentTotalExpenses > 0 || prevTotalExpenses > 0,
  };
}

function renderMomChart(momData) {
  const canvas = document.getElementById('ana-mom-chart');
  const emptyEl = document.getElementById('ana-mom-empty');
  if (!canvas) return;

  if (momChartInstance) {
    momChartInstance.destroy();
    momChartInstance = null;
  }

  if (!momData.hasData || momData.categoriesComparison.length === 0 || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  const categories = momData.categoriesComparison.map((item) => item.category);
  const prevData = momData.categoriesComparison.map((item) => item.previous);
  const currentData = momData.categoriesComparison.map((item) => item.current);

  momChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        {
          label: momData.prevMonthLabel,
          data: prevData,
          backgroundColor: '#94a3b8',
          borderRadius: 4,
          maxBarThickness: 18,
        },
        {
          label: momData.currentMonthLabel,
          data: currentData,
          backgroundColor: '#2563eb',
          borderRadius: 4,
          maxBarThickness: 18,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#475569',
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { size: 11, family: 'JetBrains Mono, monospace' },
            callback: (val) => `$${val}`,
          },
        },
      },
    },
  });
}

function renderMomTable(momData) {
  const wrap = document.getElementById('ana-mom-table-wrap');
  if (!wrap) return;

  if (!momData.hasData || momData.categoriesComparison.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-desc">No month-over-month expense activity to compare.</p>
      </div>
    `;
    return;
  }

  const rows = momData.categoriesComparison
    .map((item) => {
      const isIncrease = item.diff > 0;
      const isDecrease = item.diff < 0;
      const diffSign = isIncrease ? '+' : isDecrease ? '−' : '';
      const diffColorClass = isIncrease ? 'amount-expense' : isDecrease ? 'amount-income' : '';

      let trendBadgeHtml = '';
      if (item.previous === 0 && item.current > 0) {
        trendBadgeHtml = `<span style="font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px; background:#eff6ff; color:#2563eb;">New</span>`;
      } else if (item.current === 0 && item.previous > 0) {
        trendBadgeHtml = `<span style="font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px; background:#f0fdf4; color:#15803d;">−100% ↓</span>`;
      } else if (item.percentChange !== null) {
        const absPct = Math.abs(item.percentChange).toFixed(1);
        if (isIncrease) {
          trendBadgeHtml = `<span style="font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px; background:#fef2f2; color:#dc2626;">+${absPct}% ↑</span>`;
        } else if (isDecrease) {
          trendBadgeHtml = `<span style="font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px; background:#f0fdf4; color:#15803d;">−${absPct}% ↓</span>`;
        } else {
          trendBadgeHtml = `<span style="font-size:11px; font-weight:500; color:#64748b;">0.0%</span>`;
        }
      } else {
        trendBadgeHtml = `<span style="font-size:11px; color:#64748b;">—</span>`;
      }

      return `
        <tr>
          <td>
            <span class="legend-left">
              <span class="legend-swatch" style="background-color: ${
                CATEGORY_COLORS[item.category] || '#64748b'
              };"></span>
              <span>${escapeHtml(item.category)}</span>
            </span>
          </td>
          <td class="col-right tabular-nums">${escapeHtml(formatCurrency(item.previous))}</td>
          <td class="col-right tabular-nums">${escapeHtml(formatCurrency(item.current))}</td>
          <td class="col-right tabular-nums ${diffColorClass}">${diffSign}${escapeHtml(formatCurrency(Math.abs(item.diff)))}</td>
          <td class="col-right">${trendBadgeHtml}</td>
        </tr>
      `;
    })
    .join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th class="col-right">${escapeHtml(momData.prevMonthLabel)}</th>
          <th class="col-right">${escapeHtml(momData.currentMonthLabel)}</th>
          <th class="col-right">Change</th>
          <th class="col-right">Trend</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * Renders the Analytics view.
 */
export function renderAnalyticsView({ transactions, activeMonth }) {
  const metrics = calculateAnalyticsMetrics(transactions, activeMonth);
  const momData = calculateMonthOverMonthSpending(transactions, activeMonth);

  const topCatEl = document.getElementById('ana-top-category');
  const topCatMetaEl = document.getElementById('ana-top-category-meta');
  const savingsEl = document.getElementById('ana-total-savings');
  const savingsMetaEl = document.getElementById('ana-savings-meta');
  const monthlyNetEl = document.getElementById('ana-monthly-net');
  const monthlyNetMetaEl = document.getElementById('ana-monthly-net-meta');
  const momKpiVal = document.getElementById('ana-mom-kpi-val');
  const momKpiMeta = document.getElementById('ana-mom-kpi-meta');
  const momIcon = document.getElementById('ana-mom-icon');
  const momSub = document.getElementById('ana-mom-subtitle');
  const momTableSub = document.getElementById('ana-mom-table-subtitle');

  if (topCatEl && topCatMetaEl) {
    if (metrics.highestCategory) {
      topCatEl.textContent = metrics.highestCategory.category;
      topCatMetaEl.textContent = `${formatCurrency(
        metrics.highestCategory.total
      )} · ${metrics.highestCategory.share.toFixed(1)}% of total expenses`;
    } else {
      topCatEl.textContent = '—';
      topCatMetaEl.textContent = 'No expense data available';
    }
  }

  if (savingsEl && savingsMetaEl) {
    const sign = metrics.totalSavings < 0 ? '−' : '';
    savingsEl.textContent = `${sign}${formatCurrency(Math.abs(metrics.totalSavings))}`;
    savingsMetaEl.textContent = `Overall savings rate: ${metrics.savingsRate.toFixed(1)}%`;
  }

  if (monthlyNetEl && monthlyNetMetaEl) {
    const sign = metrics.monthlyNet < 0 ? '−' : metrics.monthlyNet > 0 ? '+' : '';
    monthlyNetEl.textContent = `${sign}${formatCurrency(Math.abs(metrics.monthlyNet))}`;
    monthlyNetMetaEl.textContent = `${formatMonthLabel(activeMonth)} (${formatCurrency(
      metrics.monthlyIncome
    )} in − ${formatCurrency(metrics.monthlyExpenses)} out)`;
  }

  if (momKpiVal && momKpiMeta) {
    if (!momData.hasData) {
      momKpiVal.className = 'kpi-value tabular-nums';
      momKpiVal.textContent = '—';
      momKpiMeta.textContent = 'No expense data for comparison';
      if (momIcon) momIcon.className = 'kpi-icon';
    } else if (momData.prevTotalExpenses === 0) {
      momKpiVal.className = 'kpi-value tabular-nums';
      momKpiVal.textContent = formatCurrency(momData.currentTotalExpenses);
      momKpiMeta.textContent = `No spending recorded in ${momData.prevMonthLabel}`;
      if (momIcon) momIcon.className = 'kpi-icon';
    } else {
      const isIncrease = momData.totalDiff > 0;
      const isDecrease = momData.totalDiff < 0;
      const diffSign = isIncrease ? '+' : isDecrease ? '−' : '';
      const absPct = momData.totalPercentChange !== null ? Math.abs(momData.totalPercentChange).toFixed(1) : 0;
      momKpiVal.textContent = `${diffSign}${formatCurrency(Math.abs(momData.totalDiff))}`;
      if (isIncrease) {
        momKpiVal.className = 'kpi-value tabular-nums amount-expense';
        momKpiMeta.textContent = `+${absPct}% spending increase vs. ${momData.prevMonthLabel}`;
        if (momIcon) momIcon.className = 'kpi-icon icon-expense';
      } else if (isDecrease) {
        momKpiVal.className = 'kpi-value tabular-nums amount-income';
        momKpiMeta.textContent = `−${absPct}% savings vs. ${momData.prevMonthLabel}`;
        if (momIcon) momIcon.className = 'kpi-icon icon-income';
      } else {
        momKpiVal.className = 'kpi-value tabular-nums';
        momKpiMeta.textContent = `Identical to ${momData.prevMonthLabel}`;
        if (momIcon) momIcon.className = 'kpi-icon';
      }
    }
  }

  if (momSub) {
    momSub.textContent = `${momData.currentMonthLabel} vs. ${momData.prevMonthLabel} by category`;
  }
  if (momTableSub) {
    momTableSub.textContent = `Expenditure delta and percentage trend compared to ${momData.prevMonthLabel}`;
  }

  renderIncomeVsExpenseChart(transactions, activeMonth);
  renderCategoryBarChart(metrics.categoryTotals);
  renderDistributionChart(transactions, activeMonth);
  renderCategoryAllocationTable(metrics.categoryTotals);
  renderMomChart(momData);
  renderMomTable(momData);

  if (window.lucide) window.lucide.createIcons();
}
