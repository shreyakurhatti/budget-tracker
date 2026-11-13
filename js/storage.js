/**
 * storage.js — Centralized LocalStorage persistence layer.
 *
 * Designed as an isolated repository module so that when backend integration
 * (Node.js + Express.js + SQL) begins, each function here can be replaced with
 * a corresponding fetch('/api/...') call without modifying UI or calculation modules.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGETS: 'clearledger_budgets_v1',
  INITIALIZED: 'clearledger_initialized_v1',
};

/**
 * Generates a collision-resistant unique identifier for transactions.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Formats a Date object as YYYY-MM-DD in local time.
 * @param {Date} date
 * @returns {string}
 */
function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns a YYYY-MM key offset by `monthsAgo` from today.
 * @param {number} monthsAgo
 * @returns {{ year: number, monthIndex: number, key: string }}
 */
function getMonthOffset(monthsAgo) {
  const now = new Date();
  const dt = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const year = dt.getFullYear();
  const monthIndex = dt.getMonth();
  const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return { year, monthIndex, key };
}

/**
 * Builds an ISO date string within a given month offset, clamped to today for current month.
 * @param {number} monthsAgo
 * @param {number} day
 * @returns {string}
 */
function buildSampleDate(monthsAgo, day) {
  const now = new Date();
  const { year, monthIndex } = getMonthOffset(monthsAgo);
  const maxDaysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let clampedDay = Math.min(day, maxDaysInMonth);
  if (monthsAgo === 0) {
    clampedDay = Math.min(clampedDay, now.getDate());
  }
  return toIsoDate(new Date(year, monthIndex, Math.max(1, clampedDay)));
}

/**
 * Creates realistic starter transactions relative to the current date
 * so first-time users immediately see populated charts, tables, and budgets.
 */
function createSeedData() {
  const currentMonth = getMonthOffset(0).key;

  const transactions = [
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: buildSampleDate(0, 1),
      description: 'Primary engineering payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: buildSampleDate(0, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Grocery Shopping',
      amount: 215.4,
      category: 'Food',
      type: 'expense',
      date: buildSampleDate(0, 4),
      description: 'Weekly produce and pantry essentials',
    },
    {
      id: generateId(),
      title: 'Electric & Fiber Internet',
      amount: 148.75,
      category: 'Utilities',
      type: 'expense',
      date: buildSampleDate(0, 6),
      description: 'Monthly electricity and gigabit fiber bill',
    },
    {
      id: generateId(),
      title: 'UI Design Advisory',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: buildSampleDate(0, 8),
      description: 'Client product architecture review',
    },
    {
      id: generateId(),
      title: 'Metro Pass & Fuel',
      amount: 96.5,
      category: 'Transport',
      type: 'expense',
      date: buildSampleDate(0, 9),
      description: 'Commuter transit pass and refueling',
    },
    {
      id: generateId(),
      title: 'Whole Foods Market',
      amount: 164.2,
      category: 'Food',
      type: 'expense',
      date: buildSampleDate(0, 11),
      description: 'Fresh groceries and coffee beans',
    },
    {
      id: generateId(),
      title: 'Dental Checkup',
      amount: 185,
      category: 'Healthcare',
      type: 'expense',
      date: buildSampleDate(0, 12),
      description: 'Routine cleaning and exam copay',
    },
    // Previous month (-1)
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: buildSampleDate(1, 1),
      description: 'Primary engineering payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: buildSampleDate(1, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Grocery & Household',
      amount: 412.8,
      category: 'Food',
      type: 'expense',
      date: buildSampleDate(1, 10),
      description: 'Bi-weekly groceries and household items',
    },
    {
      id: generateId(),
      title: 'Index Fund Dividend',
      amount: 320,
      category: 'Investments',
      type: 'income',
      date: buildSampleDate(1, 15),
      description: 'Quarterly ETF distribution',
    },
    {
      id: generateId(),
      title: 'Office Chair Upgrade',
      amount: 389,
      category: 'Shopping',
      type: 'expense',
      date: buildSampleDate(1, 19),
      description: 'Ergonomic home workspace chair',
    },
    {
      id: generateId(),
      title: 'Cinema & Dining Out',
      amount: 134.5,
      category: 'Entertainment',
      type: 'expense',
      date: buildSampleDate(1, 24),
      description: 'Weekend dinner and tickets',
    },
    // Two months ago (-2)
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: buildSampleDate(2, 1),
      description: 'Payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: buildSampleDate(2, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Online Systems Course',
      amount: 240,
      category: 'Education',
      type: 'expense',
      date: buildSampleDate(2, 14),
      description: 'Distributed systems workshop',
    },
    {
      id: generateId(),
      title: 'Groceries & Dining',
      amount: 465,
      category: 'Food',
      type: 'expense',
      date: buildSampleDate(2, 20),
      description: 'Monthly food expenses',
    },
    // Three months ago (-3)
    {
      id: generateId(),
      title: 'Monthly Salary',
      amount: 5200,
      category: 'Salary',
      type: 'income',
      date: buildSampleDate(3, 1),
      description: 'Payroll deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: buildSampleDate(3, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Utilities & Mobile',
      amount: 192,
      category: 'Utilities',
      type: 'expense',
      date: buildSampleDate(3, 12),
      description: 'Electric, water, and mobile plan',
    },
    {
      id: generateId(),
      title: 'Grocery Shopping',
      amount: 390,
      category: 'Food',
      type: 'expense',
      date: buildSampleDate(3, 18),
      description: 'Supermarket runs',
    },
  ];

  const budgets = {
    [currentMonth]: 3200,
    [getMonthOffset(1).key]: 3200,
  };

  return { transactions, budgets };
}

/**
 * Normalizes a raw transaction record into the strict application schema.
 * @param {object} raw
 * @returns {object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Math.round((Number(raw.amount) || 0) * 100) / 100,
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || toIsoDate(new Date())),
    description: String(raw.description || '').trim(),
  };
}

/**
 * Initializes LocalStorage with seed data on very first launch.
 */
export function initStorage() {
  try {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      const { transactions, budgets } = createSeedData();
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
      localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  } catch (err) {
    console.error('Failed to initialize storage:', err);
  }
}

/**
 * Retrieves all stored transactions.
 * Future REST mapping: GET /api/transactions
 * @returns {Array<object>}
 */
export function getTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeTransaction) : [];
  } catch (err) {
    console.error('Failed to read transactions from storage:', err);
    return [];
  }
}

/**
 * Retrieves a single transaction by ID.
 * Future REST mapping: GET /api/transactions/:id
 * @param {string} id
 * @returns {object|null}
 */
export function getTransactionById(id) {
  const list = getTransactions();
  return list.find((tx) => tx.id === id) || null;
}

/**
 * Creates and persists a new transaction.
 * Future REST mapping: POST /api/transactions
 * @param {object} txInput
 * @returns {object}
 */
export function saveTransaction(txInput) {
  const transactions = getTransactions();
  const created = normalizeTransaction({
    ...txInput,
    id: txInput.id || generateId(),
  });
  transactions.push(created);
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  return created;
}

/**
 * Updates an existing transaction by ID.
 * Future REST mapping: PUT /api/transactions/:id
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const index = transactions.findIndex((tx) => tx.id === id);
  if (index === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[index],
    ...updates,
    id,
  });
  transactions[index] = updated;
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  return updated;
}

/**
 * Deletes a transaction by ID.
 * Future REST mapping: DELETE /api/transactions/:id
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((tx) => tx.id !== id);
  if (next.length === transactions.length) return false;
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(next));
  return true;
}

/**
 * Retrieves the monthly budget map ({ "YYYY-MM": number }).
 * Future REST mapping: GET /api/budgets
 * @returns {Record<string, number>}
 */
export function getBudgets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('Failed to read budgets from storage:', err);
    return {};
  }
}

/**
 * Retrieves the configured monthly budget for a specific YYYY-MM period.
 * Future REST mapping: GET /api/budgets/:monthKey
 * @param {string} monthKey
 * @returns {number}
 */
export function getBudgetForMonth(monthKey) {
  const budgets = getBudgets();
  const val = Number(budgets[monthKey]);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

/**
 * Saves the monthly budget limit for a specific YYYY-MM period.
 * Future REST mapping: PUT /api/budgets/:monthKey
 * @param {string} monthKey
 * @param {number} amount
 * @returns {number}
 */
export function saveBudgetForMonth(monthKey, amount) {
  const budgets = getBudgets();
  const cleanAmount = Math.round(Number(amount) * 100) / 100;
  budgets[monthKey] = cleanAmount;
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  return cleanAmount;
}

/**
 * Resets LocalStorage to the curated starter dataset.
 */
export function resetDemoData() {
  const { transactions, budgets } = createSeedData();
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
  localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}
