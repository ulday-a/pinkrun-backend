require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');

const registerRoutes = require('./routes/register');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'pinkrun-backend' });
});

app.use('/api', registerRoutes);
app.use('/api', authRoutes);
app.use('/api', paymentRoutes);

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Pink Run backend запущен на порту ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось подключиться к базе данных:', err);
    process.exit(1);
  });
