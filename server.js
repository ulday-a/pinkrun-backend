require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');

const registerRoutes = require('./routes/register');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');

const app = express();
app.use(express.json());
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '*')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, из Postman) и из списка разрешённых адресов
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS: адрес ' + origin + ' не разрешён'));
  },
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
