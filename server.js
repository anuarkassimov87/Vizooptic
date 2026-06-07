import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const TIME_RE = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

function buildSlots() {
  const slots = [];
  const start = 9 * 60;
  const end = 18 * 60 + 30;

  for (let minutes = start; minutes <= end; minutes += 15) {
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mins = String(minutes % 60).padStart(2, "0");
    slots.push(`${hours}:${mins}`);
  }

  return slots;
}

const availableSlots = buildSlots();

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10);
}

function isValidSlot(value) {
  return TIME_RE.test(value) && availableSlots.includes(value);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (appointment_date, appointment_time)
    );
  `);
}

app.use(express.json());

app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use("/assets", express.static(path.join(__dirname, "assets")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

app.get("/api/slots", async (req, res) => {
  const date = String(req.query.date || "");

  if (!isValidDate(date)) {
    res.status(400).json({ error: "Укажите корректную дату." });
    return;
  }

  const { rows } = await pool.query(
    "SELECT to_char(appointment_time, 'HH24:MI') AS time FROM bookings WHERE appointment_date = $1",
    [date]
  );
  const booked = new Set(rows.map((row) => row.time));

  res.json({
    date,
    slots: availableSlots.map((time) => ({
      time,
      available: !booked.has(time)
    }))
  });
});

app.post("/api/bookings", async (req, res) => {
  const date = String(req.body.date || "").trim();
  const time = String(req.body.time || "").trim();
  const name = String(req.body.name || "").trim();
  const phone = String(req.body.phone || "").trim();

  if (!isValidDate(date)) {
    res.status(400).json({ error: "Выберите корректную дату." });
    return;
  }

  if (!isValidSlot(time)) {
    res.status(400).json({ error: "Выберите время с 09:00 до 18:30." });
    return;
  }

  if (name.length < 2) {
    res.status(400).json({ error: "Введите имя." });
    return;
  }

  if (!/^[+\d\s()\-]{8,24}$/.test(phone)) {
    res.status(400).json({ error: "Введите корректный номер телефона." });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO bookings (appointment_date, appointment_time, customer_name, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, appointment_date::text, to_char(appointment_time, 'HH24:MI') AS appointment_time, customer_name, phone`,
      [date, time, name, phone]
    );

    res.status(201).json({
      message: "Спасибо за обращение. Наш специалист свяжется с вами в ближайшее время.",
      booking: rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "Это время уже занято. Выберите другой слот." });
      return;
    }
    throw error;
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Ошибка сервера. Попробуйте позже." });
});

await initDb();
app.listen(port, () => {
  console.log(`VIZO OPTIC booking app is running on port ${port}`);
});
