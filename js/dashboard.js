/**
 * dashboard.js — Pure dashboard metric calculations and Dashboard view rendering.
 * Keeps all financial math strictly independent of LocalStorage.
 */

import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  renderTransactionTable,
  sortTransactions,
} from './transactions.js';

let overviewChartInstance = null;
let categoryChartInstance = null;

/**
 * Computes all primary Dashboard KPIs dynamically from transactions.
 * Total Balance = Total Income - Total Expenses.
 * @param {Array<object>} transactions
 * @param {string} activeMonth YYYY-MM
 */
export function calculateDashboardMetrics(transactions, activeMonth) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlySpending = 0;
  let monthlyIncome = 0;
  let monthlyTxCount = 0;

  transactions.forEach((tx) => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      if (tx.date.startsWith(activeMonth)) {
        monthlyIncome += tx.amount;
        monthlyTxCount += 1;
      }
    } else {
      totalExpenses += tx.amount;
      if (tx.date.startsWith(activeMonth)) {
        monthlySpending += tx.amount;
        monthlyTxCount += 1;
      }
    }
  });

  const totalBalance = totalIncome - totalExpenses;
  const recentTransactions = sortTransactions(transactions, 'date-desc').slice(0, 6);

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    monthlySpending,
    monthlyIncome,
    monthlyTxCount,
    recentTransactions,
  };
}

/**
 * Computes daily expense totals across the active month for the Monthly Spending Overview chart.
 * @param {Array<object>} transactions
 * @param {string} monthKey YYYY-MM
 */
export function getMonthlyDailySeries(transactions, monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyTotals = new Array(daysInMonth).fill(0);

  let hasExpenses = false;
  transactions.forEach((tx) => {
    if (tx.type === 'expense' && tx.date.startsWith(monthKey)) {
      const day = Number(tx.date.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) {
        dailyTotals[day - 1] += tx.amount;
        hasExpenses = true;
      }
    }
  });

  const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
  return { labels, values: dailyTotals, hasExpenses };
}

/**
 * Computes expense totals grouped by category for a month (or all-time if monthKey is null).
 * @param {Array<object>} transactions
 * @param {string|null} monthKey
 */
export function getExpenseCategoryTotals(transactions, monthKey = null) {
  const map = new Map();
  let total = 0;

  transactions.forEach((tx) => {
    if (tx.type !== 'expense') return;
    if (monthKey && !tx.date.startsWith(monthKey)) return;
    const prev = map.get(tx.category) || { category: tx.category, total: 0, count: 0 };
    prev.total += tx.amount;
    prev.count += 1;
    map.set(tx.category, prev);
    total += tx.amount;
  });

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      share: total > 0 ? (item.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Renders the Monthly Spending Overview bar chart.
 */
function renderOverviewChart(transactions, activeMonth) {
  const canvas = document.getElementById('dash-overview-chart');
  const emptyEl = document.getElementById('dash-overview-empty');
  if (!canvas) return;

  if (overviewChartInstance) {
    overviewChartInstance.destroy();
    overviewChartInstance = null;
  }

  const { labels, values, hasExpenses } = getMonthlyDailySeries(transactions, activeMonth);
  if (!hasExpenses || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  overviewChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Daily Expenses',
          data: values,
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
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `${formatMonthLabel(activeMonth)} · Day ${items[0].label}`,
            label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`,
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

/**
 * Renders the Expense Category Breakdown doughnut chart and custom legend.
 */
function renderCategoryChart(transactions, activeMonth) {
  const canvas = document.getElementById('dash-category-chart');
  const emptyEl = document.getElementById('dash-category-empty');
  const legendEl = document.getElementById('dash-category-legend');
  if (!canvas || !legendEl) return;

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  const breakdown = getExpenseCategoryTotals(transactions, activeMonth);

  if (breakdown.length === 0 || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    legendEl.innerHTML = '';
    return;
  }
  emptyEl?.classList.add('hidden');

  const labels = breakdown.map((b) => b.category);
  const data = breakdown.map((b) => b.total);
  const colors = breakdown.map((b) => CATEGORY_COLORS[b.category] || '#64748b');

  categoryChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = breakdown[ctx.dataIndex];
              return ` ${item.category}: ${formatCurrency(item.total)} (${item.share.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });

  legendEl.innerHTML = breakdown
    .slice(0, 6)
    .map((item, idx) => {
      const color = colors[idx];
      return `
        <li class="legend-item">
          <span class="legend-left">
            <span class="legend-swatch" style="background-color: ${color};"></span>
            <span class="legend-name">${escapeHtml(item.category)}</span>
          </span>
          <span class="legend-val tabular-nums">${escapeHtml(
            formatCurrency(item.total)
          )} · ${item.share.toFixed(0)}%</span>
        </li>
      `;
    })
    .join('');
}

/**
 * Renders the complete Dashboard view.
 */
export function renderDashboardView({
  transactions,
  activeMonth,
  budgetStatus,
  onEditTx,
  onDeleteTx,
  onOpenAddModal,
}) {
  const metrics = calculateDashboardMetrics(transactions, activeMonth);
  const monthLabel = formatMonthLabel(activeMonth);

  // KPI Values
  const balanceEl = document.getElementById('dash-total-balance');
  const incomeEl = document.getElementById('dash-total-income');
  const expensesEl = document.getElementById('dash-total-expenses');
  const monthlyEl = document.getElementById('dash-monthly-spending');
  const monthlyMetaEl = document.getElementById('dash-monthly-meta');

  if (balanceEl) {
    const sign = metrics.totalBalance < 0 ? '−' : '';
    balanceEl.textContent = `${sign}${formatCurrency(Math.abs(metrics.totalBalance))}`;
  }
  if (incomeEl) incomeEl.textContent = formatCurrency(metrics.totalIncome);
  if (expensesEl) expensesEl.textContent = formatCurrency(metrics.totalExpenses);
  if (monthlyEl) monthlyEl.textContent = formatCurrency(metrics.monthlySpending);

  if (monthlyMetaEl) {
    if (budgetStatus && budgetStatus.budgetLimit > 0) {
      monthlyMetaEl.textContent = `${budgetStatus.utilization.toFixed(
        1
      )}% of ${formatCurrency(budgetStatus.budgetLimit)} budget`;
    } else {
      monthlyMetaEl.textContent = `${monthLabel} outflows`;
    }
  }

  // Subtitles
  const overviewSub = document.getElementById('dash-overview-subtitle');
  const categorySub = document.getElementById('dash-category-subtitle');
  if (overviewSub) overviewSub.textContent = `Daily expense flow in ${monthLabel}`;
  if (categorySub) categorySub.textContent = `Share of spending in ${monthLabel}`;

  // Dashboard Budget Warning/Alert Strip
  const alertEl = document.getElementById('dash-budget-alert');
  if (alertEl) {
    if (budgetStatus && budgetStatus.status === 'exceeded') {
      const overage = Math.abs(budgetStatus.remaining);
      alertEl.className = 'alert-banner alert-banner-danger';
      alertEl.innerHTML = `
        <i data-lucide="alert-octagon"></i>
        <div class="alert-content">
          <span class="alert-title">Monthly Budget Exceeded (${budgetStatus.utilization.toFixed(
            1
          )}%)</span>
          <span class="alert-desc">Spending in ${escapeHtml(
            monthLabel
          )} has exceeded your ${escapeHtml(
        formatCurrency(budgetStatus.budgetLimit)
      )} budget by ${escapeHtml(formatCurrency(overage))}.</span>
        </div>
      `;
    } else if (budgetStatus && budgetStatus.status === 'warning') {
      alertEl.className = 'alert-banner alert-banner-warning';
      alertEl.innerHTML = `
        <i data-lucide="alert-triangle"></i>
        <div class="alert-content">
          <span class="alert-title">Approaching Monthly Budget Limit (${budgetStatus.utilization.toFixed(
            1
          )}%)</span>
          <span class="alert-desc">You have ${escapeHtml(
            formatCurrency(budgetStatus.remaining)
          )} remaining for ${escapeHtml(monthLabel)}.</span>
        </div>
      `;
    } else {
      alertEl.className = 'alert-banner hidden';
      alertEl.innerHTML = '';
    }
  }

  // Charts
  renderOverviewChart(transactions, activeMonth);
  renderCategoryChart(transactions, activeMonth);

  // Recent Transactions Table
  const recentEl = document.getElementById('dash-recent-container');
  renderTransactionTable(recentEl, metrics.recentTransactions, {
    showActions: true,
    emptyTitle: 'No transactions yet',
    emptyDescription: 'Record your first income or expense to populate your financial dashboard.',
    emptyActionLabel: 'Add Transaction',
    onEmptyAction: onOpenAddModal,
    onEdit: onEditTx,
    onDelete: onDeleteTx,
  });

  if (window.lucide) window.lucide.createIcons();
}
