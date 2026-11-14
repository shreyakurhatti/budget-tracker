/**
 * transactions.js — Pure transaction helpers, validation, filtering, sorting,
 * and UI controllers for Transaction History & Add/Edit/Delete modals.
 */

import {
  getTransactionById,
  saveTransaction,
  updateTransaction,
  deleteTransaction,
} from './storage.js';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Bonus',
  'Gift',
  'Other Income',
];

export const CATEGORY_COLORS = {
  Food: '#2563eb',
  Housing: '#0f172a',
  Transport: '#0891b2',
  Utilities: '#4f46e5',
  Healthcare: '#dc2626',
  Entertainment: '#d97706',
  Shopping: '#7c3aed',
  Education: '#0d9488',
  Other: '#64748b',
  Salary: '#15803d',
  Freelance: '#059669',
  Investments: '#0284c7',
  Bonus: '#16a34a',
  Gift: '#65a30d',
  'Other Income': '#475569',
};

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats a numeric value as USD currency.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return CURRENCY_FORMATTER.format(num);
}

/**
 * Formats YYYY-MM-DD into a crisp human-readable date string.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns today's date in YYYY-MM-DD local format.
 * @returns {string}
 */
export function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns current month key as YYYY-MM.
 * @returns {string}
 */
export function getCurrentMonthKey() {
  return getTodayIsoDate().slice(0, 7);
}

/**
 * Converts YYYY-MM to "November 2026".
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  if (!y || !m) return monthKey;
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Builds a sorted list of available YYYY-MM month keys from transactions + recent 6 months.
 * @param {Array<object>} transactions
 * @returns {Array<string>}
 */
export function getAvailableMonths(transactions) {
  const set = new Set();
  const now = new Date();
  for (let i = 0; i < 6; i += 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    set.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  transactions.forEach((tx) => {
    if (tx.date && tx.date.length >= 7) {
      set.add(tx.date.slice(0, 7));
    }
  });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Escapes HTML special characters to prevent XSS in template rendering.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Pure validation for transaction form fields.
 * @param {object} input
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTransactionInput(input) {
  const errors = {};
  const title = String(input.title || '').trim();
  const amount = Number(input.amount);
  const category = String(input.category || '').trim();
  const date = String(input.date || '').trim();
  const type = input.type;

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds maximum supported limit.';
  }

  if (!category) {
    errors.category = 'Please select a category.';
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Please select a valid date.';
  }

  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Invalid transaction type.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Pure filter function for transaction search, type, and category.
 * @param {Array<object>} transactions
 * @param {{ search?: string, type?: string, category?: string }} criteria
 * @returns {Array<object>}
 */
export function filterTransactions(transactions, criteria = {}) {
  const search = String(criteria.search || '').trim().toLowerCase();
  const type = criteria.type || 'all';
  const category = criteria.category || 'all';

  return transactions.filter((tx) => {
    if (type !== 'all' && tx.type !== type) return false;
    if (category !== 'all' && tx.category !== category) return false;
    if (search) {
      const haystack = `${tx.title} ${tx.description} ${tx.category} ${tx.amount} ${tx.date}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/**
 * Pure sort function for transactions.
 * @param {Array<object>} transactions
 * @param {string} sortBy
 * @returns {Array<object>}
 */
export function sortTransactions(transactions, sortBy = 'date-desc') {
  const copy = [...transactions];
  copy.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
      case 'amount-desc':
        return b.amount - a.amount || b.date.localeCompare(a.date);
      case 'amount-asc':
        return a.amount - b.amount || b.date.localeCompare(a.date);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    }
  });
  return copy;
}

/**
 * Renders a transaction table into the target container.
 * Reusable across both Dashboard (compact recent rows) and Transaction History.
 */
export function renderTransactionTable(containerEl, list, options = {}) {
  const {
    showActions = true,
    emptyTitle = 'No transactions recorded',
    emptyDescription = 'Add an income or expense entry to begin tracking your cash flow.',
    emptyActionLabel = 'Add Transaction',
    onEmptyAction = null,
    onEdit = null,
    onDelete = null,
  } = options;

  if (!containerEl) return;

  if (list.length === 0) {
    containerEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
        <h3 class="empty-state-title">${escapeHtml(emptyTitle)}</h3>
        <p class="empty-state-desc">${escapeHtml(emptyDescription)}</p>
        ${
          onEmptyAction
            ? `<button type="button" class="btn btn-primary btn-sm empty-action-btn">${escapeHtml(
                emptyActionLabel
              )}</button>`
            : ''
        }
      </div>
    `;
    const btn = containerEl.querySelector('.empty-action-btn');
    if (btn && onEmptyAction) {
      btn.addEventListener('click', onEmptyAction);
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const rowsHtml = list
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const sign = isIncome ? '+' : '−';
      const amountClass = isIncome ? 'amount-income' : 'amount-expense';
      const typeLabelClass = isIncome ? 'type-label-income' : 'type-label-expense';
      const typeLabel = isIncome ? 'Income' : 'Expense';
      const descHtml = tx.description
        ? `<span class="tx-desc">${escapeHtml(tx.description)}</span>`
        : '';

      const actionsCell = showActions
        ? `
          <td class="col-right">
            <div class="row-actions">
              <button type="button" class="icon-btn edit-tx-btn" data-id="${escapeHtml(
                tx.id
              )}" aria-label="Edit ${escapeHtml(tx.title)}" title="Edit">
                <i data-lucide="pencil"></i>
              </button>
              <button type="button" class="icon-btn icon-btn-danger delete-tx-btn" data-id="${escapeHtml(
                tx.id
              )}" aria-label="Delete ${escapeHtml(tx.title)}" title="Delete">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        `
        : '';

      return `
        <tr>
          <td class="tx-meta-inline tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
          <td>
            <div class="tx-title-cell">
              <span class="tx-title">${escapeHtml(tx.title)}</span>
              ${descHtml}
            </div>
          </td>
          <td class="tx-meta-inline">${escapeHtml(tx.category)}</td>
          <td><span class="${typeLabelClass}">${typeLabel}</span></td>
          <td class="col-right tabular-nums ${amountClass}">${sign}${escapeHtml(
            formatCurrency(tx.amount)
          )}</td>
          ${actionsCell}
        </tr>
      `;
    })
    .join('');

  containerEl.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Transaction</th>
          <th>Category</th>
          <th>Type</th>
          <th class="col-right">Amount</th>
          ${showActions ? '<th class="col-right">Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  if (showActions) {
    containerEl.querySelectorAll('.edit-tx-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onEdit) onEdit(btn.dataset.id);
      });
    });
    containerEl.querySelectorAll('.delete-tx-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onDelete) onDelete(btn.dataset.id);
      });
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

// Module UI State
const filterState = {
  search: '',
  type: 'all',
  category: 'all',
  sort: 'date-desc',
};

let activeFormType = 'expense';
let pendingDeleteId = null;
let callbacks = {
  onDataChange: () => {},
  showToast: () => {},
};

/**
 * Populates the transaction form category select based on current type ('expense' | 'income').
 */
function populateFormCategories(type, selectedCategory = '') {
  const select = document.getElementById('tx-category-input');
  if (!select) return;
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  select.innerHTML = [
    '<option value="">Select category...</option>',
    ...list.map(
      (cat) =>
        `<option value="${escapeHtml(cat)}" ${
          cat === selectedCategory ? 'selected' : ''
        }>${escapeHtml(cat)}</option>`
    ),
  ].join('');
}

/**
 * Populates the Transaction History category filter dropdown dynamically.
 */
function populateFilterCategories(transactions) {
  const select = document.getElementById('tx-category-filter');
  if (!select) return;

  const previous = filterState.category;
  const categories = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);
  transactions.forEach((tx) => categories.add(tx.category));

  const sorted = Array.from(categories).sort((a, b) => a.localeCompare(b));
  select.innerHTML = [
    '<option value="all">All Categories</option>',
    ...sorted.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`),
  ].join('');

  if (previous === 'all' || sorted.includes(previous)) {
    select.value = previous;
  } else {
    filterState.category = 'all';
    select.value = 'all';
  }
}

function clearFormErrors() {
  ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
    const errEl = document.getElementById(`err-tx-${field}`);
    const inputEl = document.getElementById(`tx-${field}-input`);
    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('input-invalid');
  });
}

function setFormType(type) {
  activeFormType = type === 'income' ? 'income' : 'expense';
  const expBtn = document.getElementById('type-expense-btn');
  const incBtn = document.getElementById('type-income-btn');
  if (expBtn && incBtn) {
    expBtn.classList.toggle('active', activeFormType === 'expense');
    incBtn.classList.toggle('active', activeFormType === 'income');
  }
  const currentVal = document.getElementById('tx-category-input')?.value || '';
  const validList = activeFormType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  populateFormCategories(activeFormType, validList.includes(currentVal) ? currentVal : '');
}

/**
 * Opens the Add or Edit Transaction modal.
 * @param {'add'|'edit'} mode
 * @param {string|null} txId
 */
export function openTransactionModal(mode = 'add', txId = null) {
  const modal = document.getElementById('transaction-modal');
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('submit-tx-btn');
  const idInput = document.getElementById('tx-id-input');
  const nameInput = document.getElementById('tx-title-input');
  const amountInput = document.getElementById('tx-amount-input');
  const dateInput = document.getElementById('tx-date-input');
  const descInput = document.getElementById('tx-description-input');

  clearFormErrors();

  if (mode === 'edit' && txId) {
    const tx = getTransactionById(txId);
    if (!tx) return;
    titleEl.textContent = 'Edit Transaction';
    submitBtn.textContent = 'Save Changes';
    idInput.value = tx.id;
    setFormType(tx.type);
    populateFormCategories(tx.type, tx.category);
    nameInput.value = tx.title;
    amountInput.value = String(tx.amount);
    dateInput.value = tx.date;
    descInput.value = tx.description || '';
  } else {
    titleEl.textContent = 'Add Transaction';
    submitBtn.textContent = 'Save Transaction';
    idInput.value = '';
    setFormType('expense');
    populateFormCategories('expense', '');
    nameInput.value = '';
    amountInput.value = '';
    dateInput.value = getTodayIsoDate();
    descInput.value = '';
  }

  modal.classList.remove('hidden');
  nameInput.focus();
}

export function closeTransactionModal() {
  const modal = document.getElementById('transaction-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * Opens the custom Delete Confirmation modal.
 * @param {string} txId
 */
export function openDeleteModal(txId) {
  const tx = getTransactionById(txId);
  if (!tx) return;
  pendingDeleteId = tx.id;
  document.getElementById('delete-tx-name').textContent = tx.title;
  document.getElementById('delete-tx-amount').textContent = formatCurrency(tx.amount);
  document.getElementById('delete-modal').classList.remove('hidden');
}

export function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

/**
 * Renders the Transaction History view based on current filters and sort order.
 * @param {Array<object>} transactions
 */
export function renderTransactionsView(transactions) {
  populateFilterCategories(transactions);

  const filtered = filterTransactions(transactions, filterState);
  const sorted = sortTransactions(filtered, filterState.sort);

  const countEl = document.getElementById('tx-result-count');
  const netEl = document.getElementById('tx-result-net');
  const clearBtn = document.getElementById('tx-clear-filters-btn');
  const tableContainer = document.getElementById('tx-table-container');

  const hasFilters =
    filterState.search.trim() !== '' ||
    filterState.type !== 'all' ||
    filterState.category !== 'all';

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !hasFilters);
  }

  if (countEl) {
    countEl.textContent = `${sorted.length} ${sorted.length === 1 ? 'transaction' : 'transactions'}`;
  }

  const net = sorted.reduce(
    (sum, tx) => (tx.type === 'income' ? sum + tx.amount : sum - tx.amount),
    0
  );
  if (netEl) {
    const prefix = net > 0 ? '+' : net < 0 ? '−' : '';
    netEl.textContent = `Net: ${prefix}${formatCurrency(Math.abs(net))}`;
  }

  renderTransactionTable(tableContainer, sorted, {
    showActions: true,
    emptyTitle: hasFilters ? 'No matching transactions' : 'No transactions recorded',
    emptyDescription: hasFilters
      ? 'Try clearing or adjusting your search query and category filters.'
      : 'Add your first income or expense transaction to start building your ledger.',
    emptyActionLabel: hasFilters ? 'Clear Filters' : 'Add Transaction',
    onEmptyAction: () => {
      if (hasFilters) {
        resetTransactionFilters();
        renderTransactionsView(transactions);
      } else {
        openTransactionModal('add');
      }
    },
    onEdit: (id) => openTransactionModal('edit', id),
    onDelete: (id) => openDeleteModal(id),
  });
}

function resetTransactionFilters() {
  filterState.search = '';
  filterState.type = 'all';
  filterState.category = 'all';
  filterState.sort = 'date-desc';

  const searchInput = document.getElementById('tx-search');
  const catSelect = document.getElementById('tx-category-filter');
  const sortSelect = document.getElementById('tx-sort-select');
  if (searchInput) searchInput.value = '';
  if (catSelect) catSelect.value = 'all';
  if (sortSelect) sortSelect.value = 'date-desc';

  document.querySelectorAll('[data-type-filter]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.typeFilter === 'all');
  });
}

/**
 * Initializes event listeners for transaction filters, form submission, and modals.
 */
export function initTransactionsModule({ onDataChange, showToast, getAllTransactions }) {
  callbacks = { onDataChange, showToast };

  // Filter controls
  const searchInput = document.getElementById('tx-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState.search = e.target.value;
      renderTransactionsView(getAllTransactions());
    });
  }

  document.querySelectorAll('[data-type-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.type = btn.dataset.typeFilter || 'all';
      document.querySelectorAll('[data-type-filter]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderTransactionsView(getAllTransactions());
    });
  });

  const catSelect = document.getElementById('tx-category-filter');
  if (catSelect) {
    catSelect.addEventListener('change', (e) => {
      filterState.category = e.target.value;
      renderTransactionsView(getAllTransactions());
    });
  }

  const sortSelect = document.getElementById('tx-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      filterState.sort = e.target.value;
      renderTransactionsView(getAllTransactions());
    });
  }

  const clearBtn = document.getElementById('tx-clear-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      resetTransactionFilters();
      renderTransactionsView(getAllTransactions());
    });
  }

  // Modal type toggle
  document.querySelectorAll('[data-tx-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setFormType(btn.dataset.txType);
    });
  });

  // Modal close buttons & backdrop
  document.getElementById('close-tx-modal-btn')?.addEventListener('click', closeTransactionModal);
  document.getElementById('cancel-tx-modal-btn')?.addEventListener('click', closeTransactionModal);
  document.getElementById('transaction-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'transaction-modal') closeTransactionModal();
  });

  // Delete modal controls
  document.getElementById('close-delete-modal-btn')?.addEventListener('click', closeDeleteModal);
  document.getElementById('cancel-delete-btn')?.addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
  document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      const deleted = await deleteTransaction(pendingDeleteId);
      closeDeleteModal();
      if (deleted) {
        callbacks.showToast('Transaction deleted');
        await callbacks.onDataChange();
      }
    } catch (err) {
      closeDeleteModal();
      callbacks.showToast(err.message || 'Failed to delete transaction', 'error');
    }
  });

  // Form submission
  const txForm = document.getElementById('transaction-form');
  if (txForm) {
    txForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors();

      const id = document.getElementById('tx-id-input').value.trim();
      const payload = {
        type: activeFormType,
        title: document.getElementById('tx-title-input').value.trim(),
        amount: Number(document.getElementById('tx-amount-input').value),
        category: document.getElementById('tx-category-input').value,
        date: document.getElementById('tx-date-input').value,
        description: document.getElementById('tx-description-input').value.trim(),
      };

      const { valid, errors } = validateTransactionInput(payload);
      if (!valid) {
        Object.entries(errors).forEach(([field, message]) => {
          const errEl = document.getElementById(`err-tx-${field}`);
          const inputEl = document.getElementById(`tx-${field}-input`);
          if (errEl) errEl.textContent = message;
          if (inputEl) inputEl.classList.add('input-invalid');
        });
        return;
      }

      try {
        if (id) {
          await updateTransaction(id, payload);
          callbacks.showToast('Transaction updated');
        } else {
          await saveTransaction(payload);
          callbacks.showToast(
            payload.type === 'income' ? 'Income entry added' : 'Expense entry added'
          );
        }

        closeTransactionModal();
        await callbacks.onDataChange();
      } catch (err) {
        callbacks.showToast(err.message || 'Failed to save transaction', 'error');
      }
    });
  }

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTransactionModal();
      closeDeleteModal();
    }
  });
}
