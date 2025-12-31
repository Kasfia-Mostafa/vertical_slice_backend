// Load environment variables from .env file
require("dotenv").config();

// Import required dependencies
const express = require("express"); // Web framework for Node.js
const { Pool } = require("pg"); // PostgreSQL client for database connections
const cors = require("cors"); // Cross-Origin Resource Sharing middleware

// Initialize Express application
const app = express();

// Enable CORS to allow frontend requests from different origins
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

/**
 * PostgreSQL Database Connection Pool
 * Creates a connection pool to manage multiple database connections efficiently.
 * Configuration is loaded from environment variables with fallback defaults.
 */
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false, // Required for many cloud DB providers
  },
});

/**
 * TASK 2: Get Universities (Filtered by Fee, Country, and Degree)
 *
 * GET /api/universities
 *
 * Query Parameters:
 * - maxFee: Maximum tuition fee filter (numeric)
 * - country: Country name filter (partial match, case-insensitive)
 * - degree: Degree level filter (e.g., 'Bachelor', 'Master', 'PhD' or empty for all)
 *
 * Returns: Array of university objects matching the filter criteria
 */
app.get("/", (req, res) => {
  res.send("University Portal API is live and running!");
});
app.get("/api/universities", async (req, res) => {
  try {
    // Extract filter parameters from query string
    const { maxFee, country, degree } = req.query;

    /**
     * SQL LOGIC EXPLAINED:
     * 1. tuition <= $1: Filters by the numeric budget.
     * 2. country ILIKE $2: Partial, case-insensitive match for the country name.
     * 3. ($3 = '' OR degree_level = $3):
     * - If 'degree' is empty (User selected "All"), it ignores this filter.
     * - If 'degree' has a value, it matches the column 'degree_level' exactly.
     */
    const queryText = `
      SELECT * FROM universities
      WHERE tuition <= $1
      AND country ILIKE $2
      AND ($3 = '' OR degree_level = $3)
      ORDER BY name ASC`;

    // Prepare parameterized query values to prevent SQL injection
    const values = [
      maxFee || 100000, // $1: Default max fee if not provided
      `%${country || ""}%`, // $2: Wildcard pattern for ILIKE search
      degree || "", // $3: Empty string allows all degrees
    ];

    // Execute the parameterized query
    const result = await pool.query(queryText, values);

    // Return the filtered university data as JSON
    res.json(result.rows);
  } catch (err) {
    // Log the error for debugging purposes
    console.error("Fetch Error:", err.message);

    // Return 500 status with generic error message to client
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * TASK 4: Submit Application (With Numeric Validation and Fixes)
 *
 * POST /api/apply
 *
 * Request Body:
 * - studentName: Name of the student applying
 * - email: Student's email address
 * - universityId: ID of the university to apply to
 * - gpa: Student's GPA score
 * - ielts: Student's IELTS score
 *
 * Response:
 * - Success (201): Application submitted with application ID
 * - Rejected (403): Scores don't meet minimum requirements
 * - Not Found (404): University doesn't exist
 * - Error (400/500): Validation or database errors
 */
app.post("/api/apply", async (req, res) => {
  // Extract application data from request body
  const { studentName, email, universityId, gpa, ielts } = req.body;

  try {
    // Step 1: Retrieve university requirements from database for validation
    const uniCheck = await pool.query(
      "SELECT name, min_gpa, min_ielts FROM universities WHERE id = $1",
      [universityId]
    );

    // Check if university exists in database
    if (uniCheck.rows.length === 0) {
      return res.status(404).json({ message: "University not found" });
    }

    // Extract university name and minimum requirements
    const { name, min_gpa, min_ielts } = uniCheck.rows[0];

    // Step 2: Convert string inputs to numeric values for comparison
    const numGPA = parseFloat(gpa);
    const numIELTS = parseFloat(ielts);

    // Validate that student scores meet university minimum requirements
    if (numGPA < parseFloat(min_gpa) || numIELTS < parseFloat(min_ielts)) {
      return res.status(403).json({
        message: `Application Rejected: Your scores do not meet the minimum requirements for ${name}.`,
      });
    }

    // Step 3: Format scores to 2 decimal places to prevent database numeric overflow (PostgreSQL error code 22003)
    const safeGPA = numGPA.toFixed(2);
    const safeIELTS = numIELTS.toFixed(2);

    // Step 4: Insert application into database and return the new application ID
    const newApp = await pool.query(
      `INSERT INTO applications (student_name, student_email, university_id, gpa_submitted, ielts_submitted)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [studentName, email, universityId, safeGPA, safeIELTS]
    );

    // Return success response with 201 (Created) status
    res.status(201).json({
      message: "Application submitted successfully!",
      applicationId: newApp.rows[0].id,
    });
  } catch (err) {
    // Log error details for debugging
    console.error("Submission Error:", err.message);

    // Handle specific PostgreSQL numeric overflow error (22003)
    if (err.code === "22003") {
      return res
        .status(400)
        .json({ message: "Score value too high for database limits." });
    }

    // Return generic database error for other exceptions
    res.status(500).json({ message: "Database error during submission." });
  }
});

/**
 * Start the Express Server
 * Listens on port 5000 for incoming HTTP requests
 */
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
