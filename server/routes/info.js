const express = require('express');
const router = express.Router();

// Simple info endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PhotoLabReact API info',
    date: new Date().toISOString()
  });
});

module.exports = router;
