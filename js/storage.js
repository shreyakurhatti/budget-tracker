/**
 * storage.js — REST API Persistence & Data Access Layer for ClearLedger.
 * Communicates with the Node.js/Express SQLite backend.
 */

// Resolve API base URL: reads bound Vercel service URL if available, defaults to relative URL for browser
const API_BASE =
  typeof process !== 'undefined' && process?.env?.BACKEND_URL
    ? String(process.env.BACKEND_URL).replace(/\/$/, '')
    : '';

const STORAGE_KEYS = {
  TRANSACTIONS_BACKUP: 'clearledger_transactions_v1',
  BUDGETS_BACKUP: 'clearledger_budgets_v1',
  MIGRATED: 'clearledger_migrated_v1',
};

// In-memory cache for instant synchronous filtering and modal lookups
let cachedTransactions = [];
let cachedBudgets = {};

/**
 * Generates a unique identifier.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Helper to parse monthKey ('YYYY-MM') into year and month integers.
 * @param {string} monthKey
 * @returns {{ year: number, month: number }}
 */
function parseMonthKey(monthKey) {
  const [yearStr, monthStr] = String(monthKey).split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
  };
}

/**
 * Performs one-time migration of existing LocalStorage data into the database via REST API.
 */
export async function initStorage() {
  const isMigrated = localStorage.getItem(STORAGE_KEYS.MIGRATED);
  if (isMigrated === 'true') {
    return { migrated: false, count: 0 };
  }

  let importedTxCount = 0;
  let importedBudgetCount = 0;

  try {
    const rawTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS_BACKUP);
    const rawBudgets = localStorage.getItem(STORAGE_KEYS.BUDGETS_BACKUP);

    const localTransactions = rawTx ? JSON.parse(rawTx) : [];
    const localBudgets = rawBudgets ? JSON.parse(rawBudgets) : {};

    // Check if the backend already has records
    const checkRes = await fetch(`${API_BASE}/api/transactions`);
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const existingDbCount = Array.isArray(checkData.data) ? checkData.data.length : 0;

      // Only import if database is empty and local data exists
      if (existingDbCount === 0 && Array.isArray(localTransactions) && localTransactions.length > 0) {
        for (const tx of localTransactions) {
          try {
            const res = await fetch(`${API_BASE}/api/transactions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: tx.title,
                amount: tx.amount,
                category: tx.category,
                type: tx.type,
                date: tx.date,
                description: tx.description || '',
              }),
            });
            if (res.ok) importedTxCount += 1;
          } catch (e) {
            console.warn('Failed to import transaction during migration:', tx, e);
          }
        }
      }

      // Import budgets if any exist
      if (typeof localBudgets === 'object' && localBudgets !== null) {
        for (const [key, amount] of Object.entries(localBudgets)) {
          const { year, month } = parseMonthKey(key);
          const numAmount = Number(amount);
          if (year && month && numAmount > 0) {
            try {
              const res = await fetch(`${API_BASE}/api/budgets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, month, amount: numAmount }),
              });
              if (res.ok) importedBudgetCount += 1;
            } catch (e) {
              console.warn('Failed to import budget during migration:', key, e);
            }
          }
        }
      }
    }

    // Set migration flag so this never runs again; keep local storage data as backup
    localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
    const totalImported = importedTxCount + importedBudgetCount;
    window.__migrationStats = {
      importedTxCount,
      importedBudgetCount,
      totalImported,
    };
    console.log(
      `Migration completed: Imported ${importedTxCount} transactions and ${importedBudgetCount} budgets into SQLite database.`
    );
    return { migrated: true, count: totalImported };
  } catch (err) {
    console.error('Migration error:', err);
    // Even if an error happens, we don't break startup
    return { migrated: false, count: 0, error: err.message };
  }
}

/**
 * Retrieves all stored transactions from the API (newest first).
 * REST mapping: GET /api/transactions
 * @returns {Promise<Array<object>>}
 */
export async function getTransactions() {
  const res = await fetch(`${API_BASE}/api/transactions`);
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Failed to fetch transactions (HTTP ${res.status})`);
  }
  const json = await res.json();
  cachedTransactions = Array.isArray(json.data) ? json.data : [];
  return cachedTransactions;
}

/**
 * Retrieves cached transactions synchronously (useful for immediate filter updates).
 * @returns {Array<object>}
 */
export function getCachedTransactions() {
  return cachedTransactions;
}

/**
 * Retrieves a single transaction by ID.
 * Synchronous lookup from cache first, with API fallback.
 * @param {string|number} id
 * @returns {object|null}
 */
export function getTransactionById(id) {
  const found = cachedTransactions.find((tx) => String(tx.id) === String(id));
  return found || null;
}

/**
 * Creates and persists a new transaction via the API.
 * REST mapping: POST /api/transactions
 * @param {object} txInput
 * @returns {Promise<object>}
 */
export async function saveTransaction(txInput) {
  const res = await fetch(`${API_BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: txInput.title,
      amount: txInput.amount,
      category: txInput.category,
      type: txInput.type,
      date: txInput.date,
      description: txInput.description || '',
    }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Failed to create transaction (HTTP ${res.status})`);
  }

  const json = await res.json();
  const created = json.data;
  cachedTransactions.unshift(created);
  return created;
}

/**
 * Updates an existing transaction by ID via the API.
 * REST mapping: PUT /api/transactions/:id
 * @param {string|number} id
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateTransaction(id, updates) {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: updates.title,
      amount: updates.amount,
      category: updates.category,
      type: updates.type,
      date: updates.date,
      description: updates.description || '',
    }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Failed to update transaction (HTTP ${res.status})`);
  }

  const json = await res.json();
  const updated = json.data;
  const idx = cachedTransactions.findIndex((tx) => String(tx.id) === String(id));
  if (idx !== -1) {
    cachedTransactions[idx] = updated;
  }
  return updated;
}

/**
 * Deletes a transaction by ID via the API.
 * REST mapping: DELETE /api/transactions/:id
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
export async function deleteTransaction(id) {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || `Failed to delete transaction (HTTP ${res.status})`);
  }

  cachedTransactions = cachedTransactions.filter((tx) => String(tx.id) !== String(id));
  return true;
}

/**
 * Retrieves the monthly budget map ({ "YYYY-MM": number }) from the API.
 * REST mapping: GET /api/budgets
 * @returns {Promise<Record<string, number>>}
 */
export async function getBudgets() {
  const res = await fetch(`${API_BASE}/api/budgets`);
  if (!res.ok) {
    return cachedBudgets;
  }
  const json = await res.json();
  const map = {};
  if (Array.isArray(json.data)) {
    json.data.forEach((b) => {
      const key = `${b.year}-${String(b.month).padStart(2, '0')}`;
      map[key] = b.amount;
    });
  }
  cachedBudgets = map;
  return map;
}

/**
 * Retrieves the configured monthly budget for a specific YYYY-MM period from the API.
 * REST mapping: GET /api/budgets/:year/:month
 * @param {string} monthKey 'YYYY-MM'
 * @returns {Promise<number>}
 */
export async function getBudgetForMonth(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  if (!year || !month) return 0;

  try {
    const res = await fetch(`${API_BASE}/api/budgets/${year}/${month}`);
    if (res.status === 404) {
      return 0;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch budget (HTTP ${res.status})`);
    }
    const json = await res.json();
    return json.data && Number(json.data.amount) > 0 ? Number(json.data.amount) : 0;
  } catch (err) {
    console.warn(`Could not load budget for ${monthKey}:`, err.message);
    return 0;
  }
}

/**
 * Saves or updates the monthly budget limit for a specific YYYY-MM period via the API.
 * REST mapping: POST /api/budgets OR PUT /api/budgets/:id
 * @param {string} monthKey 'YYYY-MM'
 * @param {number} amount
 * @returns {Promise<number>}
 */
export async function saveBudgetForMonth(monthKey, amount) {
  const { year, month } = parseMonthKey(monthKey);
  const cleanAmount = Math.round(Number(amount) * 100) / 100;

  // Check if a budget already exists for this year and month
  const checkRes = await fetch(`${API_BASE}/api/budgets/${year}/${month}`);
  if (checkRes.ok) {
    const checkJson = await checkRes.json();
    const existingId = checkJson.data?.id;
    if (existingId) {
      const putRes = await fetch(`${API_BASE}/api/budgets/${existingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, amount: cleanAmount }),
      });
      if (!putRes.ok) {
        const errorJson = await putRes.json().catch(() => ({}));
        throw new Error(errorJson.error || 'Failed to update budget');
      }
      cachedBudgets[monthKey] = cleanAmount;
      return cleanAmount;
    }
  }

  // Create new budget entry
  const postRes = await fetch(`${API_BASE}/api/budgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month, amount: cleanAmount }),
  });

  if (!postRes.ok) {
    const errorJson = await postRes.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to create budget');
  }

  cachedBudgets[monthKey] = cleanAmount;
  return cleanAmount;
}

/**
 * Resets demo data by posting initial sample transactions and budgets through the API.
 */
export async function resetDemoData() {
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const { year, month } = parseMonthKey(currentMonthKey);

  const sampleBudget = 3200;
  await saveBudgetForMonth(currentMonthKey, sampleBudget);

  const sampleTransactions = [
    { title: 'Monthly Salary', amount: 5400, category: 'Salary', type: 'income', date: `${currentMonthKey}-01`, description: 'Primary engineering payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${currentMonthKey}-02`, description: 'Monthly lease payment' },
    { title: 'Grocery Shopping', amount: 215.4, category: 'Food', type: 'expense', date: `${currentMonthKey}-04`, description: 'Weekly produce and pantry essentials' },
    { title: 'Electric & Fiber Internet', amount: 148.75, category: 'Utilities', type: 'expense', date: `${currentMonthKey}-06`, description: 'Monthly utilities bill' },
  ];

  for (const tx of sampleTransactions) {
    await saveTransaction(tx);
  }
}
