const db = require('../config/database');

function parseId(rawId) {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseMonthYear(rawYear, rawMonth) {
  const year = Number(rawYear);
  const month = Number(rawMonth);

  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    return { error: 'Year must be a valid integer between 1900 and 2200.' };
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: 'Month must be an integer between 1 and 12.' };
  }

  return { year, month };
}

// GET /api/budgets (optional helper for listing all budgets)
function getAllBudgets(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM monthly_budgets ORDER BY year DESC, month DESC');
    const budgets = stmt.all();
    res.status(200).json({
      success: true,
      data: budgets,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const { year, month, error } = parseMonthYear(req.params.year, req.params.month);
    if (error) {
      return res.status(400).json({
        success: false,
        error,
      });
    }

    const stmt = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?');
    const budget = stmt.get(year, month);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: `No budget found for ${year}-${String(month).padStart(2, '0')}.`,
      });
    }

    res.status(200).json({
      success: true,
      data: budget,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body;
    const parsed = parseMonthYear(year, month);
    if (parsed.error) {
      return res.status(400).json({
        success: false,
        error: parsed.error,
      });
    }

    const numAmount = Number(amount);
    if (typeof amount === 'undefined' || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid number greater than 0.',
      });
    }

    // Check if a budget already exists for this year and month
    const existingStmt = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?');
    const existing = existingStmt.get(parsed.year, parsed.month);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${parsed.year}-${String(parsed.month).padStart(2, '0')} already exists. Use PUT /api/budgets/${existing.id} to update it.`,
      });
    }

    const cleanAmount = Math.round(numAmount * 100) / 100;
    const insertStmt = db.prepare(`
      INSERT INTO monthly_budgets (year, month, amount)
      VALUES (?, ?, ?)
    `);

    const result = insertStmt.run(parsed.year, parsed.month, cleanAmount);
    const selectStmt = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?');
    const newBudget = selectStmt.get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: newBudget,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Budget ID must be a positive integer.',
      });
    }

    const selectStmt = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?');
    const existing = selectStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Budget with ID ${id} not found.`,
      });
    }

    const { amount, year, month } = req.body;
    let targetYear = existing.year;
    let targetMonth = existing.month;

    if (year !== undefined || month !== undefined) {
      const parsed = parseMonthYear(year !== undefined ? year : existing.year, month !== undefined ? month : existing.month);
      if (parsed.error) {
        return res.status(400).json({
          success: false,
          error: parsed.error,
        });
      }
      targetYear = parsed.year;
      targetMonth = parsed.month;

      // If year or month changed, verify no conflict with another record
      if (targetYear !== existing.year || targetMonth !== existing.month) {
        const conflictStmt = db.prepare('SELECT id FROM monthly_budgets WHERE year = ? AND month = ? AND id != ?');
        const conflict = conflictStmt.get(targetYear, targetMonth, id);
        if (conflict) {
          return res.status(409).json({
            success: false,
            error: `A budget for ${targetYear}-${String(targetMonth).padStart(2, '0')} already exists.`,
          });
        }
      }
    }

    const numAmount = amount !== undefined ? Number(amount) : existing.amount;
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid number greater than 0.',
      });
    }

    const cleanAmount = Math.round(numAmount * 100) / 100;
    const updateStmt = db.prepare(`
      UPDATE monthly_budgets
      SET year = ?, month = ?, amount = ?
      WHERE id = ?
    `);

    updateStmt.run(targetYear, targetMonth, cleanAmount, id);
    const updated = selectStmt.get(id);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllBudgets,
  getBudgetByMonth,
  createBudget,
  updateBudget,
};
