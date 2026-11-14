const db = require('../config/database');

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseId(rawId) {
  const parsed = Number(rawId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function validateTransactionInput(body) {
  const { title, amount, category, type, date } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return 'Title is required and cannot be empty.';
  }

  const numAmount = Number(amount);
  if (typeof amount === 'undefined' || isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a valid number greater than 0.';
  }

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return 'Category is required and cannot be empty.';
  }

  if (type !== 'income' && type !== 'expense') {
    return 'Type must be either "income" or "expense".';
  }

  if (!isValidDate(date)) {
    return 'Date must be a valid calendar date in YYYY-MM-DD format.';
  }

  return null;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    const transactions = stmt.all();
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID must be a positive integer.',
      });
    }

    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const transaction = stmt.get(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`,
      });
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const validationError = validateTransactionInput(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const title = req.body.title.trim();
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const category = req.body.category.trim();
    const type = req.body.type;
    const date = req.body.date.trim();
    const description = req.body.description ? String(req.body.description).trim() : null;

    const insertStmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(title, amount, category, type, date, description);
    const selectStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const newTransaction = selectStmt.get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: newTransaction,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID must be a positive integer.',
      });
    }

    const selectStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const existing = selectStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`,
      });
    }

    const validationError = validateTransactionInput(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    const title = req.body.title.trim();
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const category = req.body.category.trim();
    const type = req.body.type;
    const date = req.body.date.trim();
    const description = req.body.description !== undefined
      ? (req.body.description ? String(req.body.description).trim() : null)
      : existing.description;

    const updateStmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);

    updateStmt.run(title, amount, category, type, date, description, id);
    const updated = selectStmt.get(id);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID must be a positive integer.',
      });
    }

    const selectStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const existing = selectStmt.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found.`,
      });
    }

    const deleteStmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    deleteStmt.run(id);

    res.status(200).json({
      success: true,
      message: `Transaction ${id} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
