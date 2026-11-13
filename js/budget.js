/**
 * budget.js — Pure monthly budget calculations, 80%/100% alert logic,
 * and Budget Management view controller.
 */

import { getExpenseCategoryTotals } from './dashboard.js';
import { saveBudgetForMonth } from './storage.js';
import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
} from './transactions.js';

let budgetChartInstance = null;

/**
 * Pure calculation for monthly budget utilization and warning thresholds.
 * @param {Array<object>} transactions
 * @param {string} monthKey YYYY-MM
 * @param {number} budgetLimit
 */
export function calculateBudgetStatus(transactions, monthKey, budgetLimit) {
  const limit = Number(budgetLimit) || 0;
  const monthlyExpenses = transactions
    .filter((tx) => tx.type === 'expense' && tx.date.startsWith(monthKey))
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (limit <= 0) {
    return {
      budgetLimit: 0,
      monthlyExpenses,
      remaining: 0,
      utilization: 0,
      status: 'unset',
    };
  }

  const remaining = limit - monthlyExpenses;
  const utilization = (monthlyExpenses / limit) * 100;

  let status = 'healthy';
  if (utilization >= 100) {
    status = 'exceeded';
  } else if (utilization >= 80) {
    status = 'warning';
  }

  return {
    budgetLimit: limit,
    monthlyExpenses,
    remaining,
    utilization,
    status,
  };
}

function renderBudgetChart(budgetStatus) {
  const canvas = document.getElementById('budget-chart');
  const emptyEl = document.getElementById('budget-chart-empty');
  if (!canvas) return;

  if (budgetChartInstance) {
    budgetChartInstance.destroy();
    budgetChartInstance = null;
  }

  if (budgetStatus.budgetLimit <= 0 || typeof window.Chart === 'undefined') {
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  const spent = budgetStatus.monthlyExpenses;
  const remainingPositive = Math.max(0, budgetStatus.remaining);
  const overage = budgetStatus.remaining < 0 ? Math.abs(budgetStatus.remaining) : 0;

  const labels =
    overage > 0 ? ['Within Budget', 'Over Budget'] : ['Spent', 'Remaining'];
  const values =
    overage > 0 ? [budgetStatus.budgetLimit, overage] : [spent, remainingPositive];
  const colors =
    overage > 0
      ? ['#0f172a', '#dc2626']
      : [
          budgetStatus.status === 'warning' ? '#d97706' : '#2563eb',
          '#e2e8f0',
        ];

  budgetChartInstance = new window.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#475569',
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

/**
 * Renders the Budget Management view.
 */
export function renderBudgetView({ transactions, activeMonth, budgetLimit }) {
  const status = calculateBudgetStatus(transactions, activeMonth, budgetLimit);
  const monthLabel = formatMonthLabel(activeMonth);

  const subEl = document.getElementById('budget-period-subtitle');
  const inputEl = document.getElementById('budget-amount-input');
  const limitEl = document.getElementById('budget-limit-display');
  const spentEl = document.getElementById('budget-spent-display');
  const remainingEl = document.getElementById('budget-remaining-display');
  const percentEl = document.getElementById('budget-percent-display');
  const barEl = document.getElementById('budget-progressbar');
  const fillEl = document.getElementById('budget-progress-fill');
  const bannerEl = document.getElementById('budget-alert-banner');
  const impactEl = document.getElementById('budget-category-impact');

  if (subEl) subEl.textContent = `Configure monthly spending limit for ${monthLabel}`;
  if (inputEl && document.activeElement !== inputEl) {
    inputEl.value = status.budgetLimit > 0 ? String(status.budgetLimit) : '';
  }

  if (limitEl) {
    limitEl.textContent =
      status.budgetLimit > 0 ? formatCurrency(status.budgetLimit) : 'Not set';
  }
  if (spentEl) {
    spentEl.textContent = formatCurrency(status.monthlyExpenses);
  }
  if (remainingEl) {
    if (status.budgetLimit <= 0) {
      remainingEl.textContent = '—';
      remainingEl.style.color = '';
    } else if (status.remaining < 0) {
      remainingEl.textContent = `−${formatCurrency(Math.abs(status.remaining))} over`;
      remainingEl.style.color = '#dc2626';
    } else {
      remainingEl.textContent = formatCurrency(status.remaining);
      remainingEl.style.color = '#15803d';
    }
  }

  const clampedPct = Math.min(100, Math.max(0, status.utilization));
  if (percentEl) percentEl.textContent = `${status.utilization.toFixed(1)}%`;
  if (barEl) barEl.setAttribute('aria-valuenow', String(Math.round(clampedPct)));
  if (fillEl) {
    fillEl.style.width = `${clampedPct}%`;
    fillEl.classList.remove('warning', 'danger');
    if (status.status === 'exceeded') fillEl.classList.add('danger');
    else if (status.status === 'warning') fillEl.classList.add('warning');
  }

  if (bannerEl) {
    if (status.status === 'exceeded') {
      bannerEl.className = 'alert-banner alert-banner-danger';
      bannerEl.innerHTML = `
        <i data-lucide="alert-octagon"></i>
        <div class="alert-content">
          <span class="alert-title">Budget Exceeded for ${escapeHtml(monthLabel)}</span>
          <span class="alert-desc">You have spent ${escapeHtml(
            formatCurrency(status.monthlyExpenses)
          )} against a ${escapeHtml(
        formatCurrency(status.budgetLimit)
      )} budget (${status.utilization.toFixed(1)}% utilized).</span>
        </div>
      `;
    } else if (status.status === 'warning') {
      bannerEl.className = 'alert-banner alert-banner-warning';
      bannerEl.innerHTML = `
        <i data-lucide="alert-triangle"></i>
        <div class="alert-content">
          <span class="alert-title">80% Budget Warning — ${escapeHtml(monthLabel)}</span>
          <span class="alert-desc">You have utilized ${status.utilization.toFixed(
            1
          )}% of your monthly budget. ${escapeHtml(
        formatCurrency(status.remaining)
      )} remains.</span>
        </div>
      `;
    } else if (status.status === 'healthy') {
      bannerEl.className = 'alert-banner alert-banner-healthy';
      bannerEl.innerHTML = `
        <i data-lucide="check-circle-2"></i>
        <div class="alert-content">
          <span class="alert-title">On Track for ${escapeHtml(monthLabel)}</span>
          <span class="alert-desc">Current utilization is ${status.utilization.toFixed(
            1
          )}% with ${escapeHtml(formatCurrency(status.remaining))} remaining.</span>
        </div>
      `;
    } else {
      bannerEl.className = 'alert-banner hidden';
      bannerEl.innerHTML = '';
    }
  }

  renderBudgetChart(status);

  if (impactEl) {
    const breakdown = getExpenseCategoryTotals(transactions, activeMonth);
    if (breakdown.length === 0) {
      impactEl.innerHTML =
        '<p class="progress-note">No monthly expenses recorded for this period yet.</p>';
    } else {
      impactEl.innerHTML = breakdown
        .slice(0, 5)
        .map((item) => {
          const budgetShare =
            status.budgetLimit > 0
              ? `${((item.total / status.budgetLimit) * 100).toFixed(1)}% of budget`
              : `${item.share.toFixed(1)}% of spend`;
          return `
            <div class="impact-row">
              <span class="legend-left">
                <span class="legend-swatch" style="background-color: ${
                  CATEGORY_COLORS[item.category] || '#64748b'
                };"></span>
                <span class="impact-name">${escapeHtml(item.category)}</span>
              </span>
              <span class="impact-right">
                <span class="impact-share tabular-nums">${escapeHtml(budgetShare)}</span>
                <span class="metric-val tabular-nums">${escapeHtml(
                  formatCurrency(item.total)
                )}</span>
              </span>
            </div>
          `;
        })
        .join('');
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Initializes the Budget form submission handler.
 */
export function initBudgetModule({ getActiveMonth, onDataChange, showToast }) {
  const form = document.getElementById('budget-form');
  const input = document.getElementById('budget-amount-input');
  const errEl = document.getElementById('err-budget-amount');

  if (!form || !input) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (errEl) errEl.textContent = '';
    input.classList.remove('input-invalid');

    const val = Number(input.value);
    if (!Number.isFinite(val) || val <= 0) {
      if (errEl) errEl.textContent = 'Please enter a valid monthly budget greater than 0.';
      input.classList.add('input-invalid');
      return;
    }

    const activeMonth = getActiveMonth();
    saveBudgetForMonth(activeMonth, val);
    showToast(`Monthly budget saved for ${formatMonthLabel(activeMonth)}`);
    onDataChange();
  });
}
