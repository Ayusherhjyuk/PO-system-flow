const express = require('express');
const routes = require('./routes');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/', routes);

  app.use((req, res) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    const status = err.status || (err.name === 'MulterError' ? 400 : 500);
    res.status(status).json({ error: err.message || 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
