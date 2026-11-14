const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');

// GET all budgets
router.get('/', budgetController.getAllBudgets);

// GET budget for one month (year and month)
router.get('/:year/:month', budgetController.getBudgetByMonth);

// POST create budget for a month
router.post('/', budgetController.createBudget);

// PUT update budget by ID
router.put('/:id', budgetController.updateBudget);

module.exports = router;
