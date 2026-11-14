const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// GET all transactions (newest first)
router.get('/', transactionController.getAllTransactions);

// GET one transaction by ID
router.get('/:id', transactionController.getTransactionById);

// POST create transaction
router.post('/', transactionController.createTransaction);

// PUT update transaction by ID
router.put('/:id', transactionController.updateTransaction);

// DELETE transaction by ID
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router;
