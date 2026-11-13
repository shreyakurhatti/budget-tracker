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
 * Renders the Analytics view.
 */
export function renderAnalyticsView({ transactions, activeMonth }) {
  const metrics = calculateAnalyticsMetrics(transactions, activeMonth);

  const topCatEl = document.getElementById('ana-top-category');
  const topCatMetaEl = document.getElementById('ana-top-category-meta');
  const savingsEl = document.getElementById('ana-total-savings');
  const savingsMetaEl = document.getElementById('ana-savings-meta');
  const monthlyNetEl = document.getElementById('ana-monthly-net');
  const monthlyNetMetaEl = document.getElementById('ana-monthly-net-meta');

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

  renderIncomeVsExpenseChart(transactions, activeMonth);
  renderCategoryBarChart(metrics.categoryTotals);
  renderDistributionChart(transactions, activeMonth);
  renderCategoryAllocationTable(metrics.categoryTotals);

  if (window.lucide) window.lucide.createIcons();
}
