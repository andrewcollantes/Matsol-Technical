const express = require('express');
const { listActiveClients } = require('../database/clients.store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const activeClients = (await listActiveClients())
    .sort((a, b) => a.name.localeCompare(b.name));

  res.render('user_account', {
    currentUser: req.session.user,
    clients: activeClients
  });
});



module.exports = router;