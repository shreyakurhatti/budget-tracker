/**
 * app.js — Application entry point and view orchestrator.
 * Coordinates routing, period selection, data refresh, CSV export, and UI feedback.
 */

import { renderAnalyticsView } from './analytics.js';
import {
  calculateBudgetStatus,
  initBudgetModule,
  renderBudgetView,
} from './budget.js';
import { renderDashboardView } from './dashboard.js';
import {
  getBudgetForMonth,
  getTransactions,
  initStorage,
  resetDemoData,
} from './storage.js';
import {
  escapeHtml,
  formatMonthLabel,
  getAvailableMonths,
  getCurrentMonthKey,
  initTransactionsModule,
  openDeleteModal,
  openTransactionModal,
  renderTransactionsView,
  sortTransactions,
} from './transactions.js';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transactions',
  analytics: 'Analytics',
  budget: 'Budget',
};

const appState = {
  activeView: 'dashboard',
  activeMonth: getCurrentMonthKey(),
};

/**
 * Displays a non-blocking toast notification.
 * @param {string} message
 * @param {'default'|'error'} variant
 */
function showToast(message, variant = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = variant === 'error' ? 'toast toast-error' : 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Populates the Active Period month dropdown dynamically from recorded transactions.
 */
function syncMonthSelector(transactions) {
  const select = document.getElementById('active-month-select');
  const periodLabel = document.getElementById('topbar-period-label');
  if (!select) return;

  const months = getAvailableMonths(transactions);
  if (!months.includes(appState.activeMonth)) {
    appState.activeMonth = months[0] || getCurrentMonthKey();
  }

  select.innerHTML = months
    .map(
      (key) =>
        `<option value="${escapeHtml(key)}" ${
          key === appState.activeMonth ? 'selected' : ''
        }>${escapeHtml(formatMonthLabel(key))}</option>`
    )
    .join('');

  if (periodLabel) {
    periodLabel.textContent = formatMonthLabel(appState.activeMonth);
  }
}

/**
 * Switches the visible workspace view and updates sidebar navigation state.
 * @param {string} viewName
 */
function navigateTo(viewName) {
  if (!VIEW_TITLES[viewName]) return;
  appState.activeView = viewName;

  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = VIEW_TITLES[viewName];

  closeMobileSidebar();
  refreshApplication();
}

function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

/**
 * Exports all stored transactions as a clean RFC-4180 CSV file.
 */
function exportTransactionsCsv() {
  const transactions = sortTransactions(getTransactions(), 'date-desc');
  if (transactions.length === 0) {
    showToast('No transactions available to export', 'error');
    return;
  }

  const headers = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Description'];
  const escapeCsv = (val) => `"${String(val ?? '').replaceAll('"', '""')}"`;

  const lines = [
    headers.join(','),
    ...transactions.map((tx) =>
      [
        tx.id,
        tx.date,
        tx.title,
        tx.type,
        tx.category,
        tx.amount.toFixed(2),
        tx.description,
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clearledger-transactions-${getCurrentMonthKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Transactions exported to CSV');
}

/**
 * Reads latest state from storage and re-renders the active view & shared chrome.
 */
function refreshApplication() {
  const transactions = getTransactions();
  syncMonthSelector(transactions);

  const budgetLimit = getBudgetForMonth(appState.activeMonth);
  const budgetStatus = calculateBudgetStatus(
    transactions,
    appState.activeMonth,
    budgetLimit
  );

  if (appState.activeView === 'dashboard') {
    renderDashboardView({
      transactions,
      activeMonth: appState.activeMonth,
      budgetStatus,
      onEditTx: (id) => openTransactionModal('edit', id),
      onDeleteTx: (id) => openDeleteModal(id),
      onOpenAddModal: () => openTransactionModal('add'),
    });
  } else if (appState.activeView === 'transactions') {
    renderTransactionsView(transactions);
  } else if (appState.activeView === 'analytics') {
    renderAnalyticsView({
      transactions,
      activeMonth: appState.activeMonth,
    });
  } else if (appState.activeView === 'budget') {
    renderBudgetView({
      transactions,
      activeMonth: appState.activeMonth,
      budgetLimit,
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Bootstraps the application once the DOM is ready.
 */
function bootstrap() {
  initStorage();

  // Initialize feature modules
  initTransactionsModule({
    onDataChange: refreshApplication,
    showToast,
    getAllTransactions: getTransactions,
  });

  initBudgetModule({
    getActiveMonth: () => appState.activeMonth,
    onDataChange: refreshApplication,
    showToast,
  });

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.view);
    });
  });

  // Mobile drawer controls
  document.getElementById('open-sidebar-btn')?.addEventListener('click', openMobileSidebar);
  document.getElementById('close-sidebar-btn')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  // Month selector
  document.getElementById('active-month-select')?.addEventListener('change', (e) => {
    appState.activeMonth = e.target.value;
    refreshApplication();
  });

  // Primary Add Transaction CTA & Dashboard View All shortcut
  document
    .getElementById('open-add-modal-btn')
    ?.addEventListener('click', () => openTransactionModal('add'));

  document
    .getElementById('view-all-tx-btn')
    ?.addEventListener('click', () => navigateTo('transactions'));

  // Sidebar utilities
  document.getElementById('export-csv-btn')?.addEventListener('click', exportTransactionsCsv);
  document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
    resetDemoData();
    appState.activeMonth = getCurrentMonthKey();
    refreshApplication();
    showToast('Demo data restored');
  });

  // Initial render
  refreshApplication();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
