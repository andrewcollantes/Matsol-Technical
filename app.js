const express = require('express');
const path = require('path');
const compression = require('compression');
const sessionMiddleware = require('./config/session');

const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const userRoutes = require('./modules/user/user.routes');
const clientRoutes = require('./modules/client/client.routes');
const assetRoutes = require('./modules/asset/asset.routes');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Render runs behind a reverse proxy; trust it so secure cookies work.
app.set('trust proxy', 1);

app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sessionMiddleware);
// Serve public assets (now organized by feature in public/js/<feature>/, public/css/<feature>/)
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: isProd ? '1d' : 0
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) {
  app.set('view cache', true);
}

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.use('/', authRoutes);
app.use('/admin_account', adminRoutes);
app.use('/user_account', userRoutes);
app.use('/user_account', assetRoutes);
app.use('/client', clientRoutes);

module.exports = app;