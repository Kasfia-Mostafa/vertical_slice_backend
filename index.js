// 1. Load environment variables
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();

// 2. Middleware
app.use(cors());
app.use(express.json());

// 3. Database Connection Logic
// This uses DATABASE_URL for Vercel/Neon and falls back to local variables for your laptop.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

/**
 * Root Route - For checking if the server is live
 */
app.get("/", (req, res) => {
  res.send("University Portal API is live and running!");
});

/**
 * Get Universities (Filtered)
 */
app.get("/api/universities", async (req, res) => {
  try {
    const { maxFee, country, degree } = req.query;

    const queryText = `
      SELECT * FROM universities
      WHERE tuition <= $1
      AND country ILIKE $2
      AND ($3 = '' OR degree_level = $3)
      ORDER BY name ASC`;

    const values = [
      maxFee || 100000,
      `%${country || ""}%`,
      degree || "",
    ];

    const result = await pool.query(queryText, values);
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch Error:", err.message);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

/**
 * Submit Application
 */
app.post("/api/apply", async (req, res) => {
  const { studentName, email, universityId, gpa, ielts } = req.body;

  try {
    // Check requirements
    const uniCheck = await pool.query(
      "SELECT name, min_gpa, min_ielts FROM universities WHERE id = $1",
      [universityId]
    );

    if (uniCheck.rows.length === 0) {
      return res.status(404).json({ message: "University not found" });
    }

    const { name, min_gpa, min_ielts } = uniCheck.rows[0];
    const numGPA = parseFloat(gpa);
    const numIELTS = parseFloat(ielts);

    if (numGPA < parseFloat(min_gpa) || numIELTS < parseFloat(min_ielts)) {
      return res.status(403).json({
        message: `Rejected: Minimum requirement for ${name} is GPA ${min_gpa} and IELTS ${min_ielts}.`,
      });
    }

    // Insert application
    const newApp = await pool.query(
      `INSERT INTO applications (student_name, student_email, university_id, gpa_submitted, ielts_submitted)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [studentName, email, universityId, numGPA.toFixed(2), numIELTS.toFixed(2)]
    );

    res.status(201).json({
      message: "Application submitted successfully!",
      applicationId: newApp.rows[0].id,
    });
  } catch (err) {
    console.error("Submission Error:", err.message);
    res.status(500).json({ message: "Database error during submission." });
  }
});

// 4. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
