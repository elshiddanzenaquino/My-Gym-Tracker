require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = require("./db");
const authMiddleware = require("./authMiddleware");
const authAdmin = require("./authAdmin");

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("Gym Tracker API is running");
});

// ===== FETCH ALL USERS (Admin only for management UI) =====
app.get("/api/users", authMiddleware, authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email, role, active
      FROM users
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== CLIENT PROGRAM VIEW =====
app.get("/api/user-programs/:user_id", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.user_id;

    const result = await pool.query(
      `
      SELECT 
        p.id AS program_id,
        p.name AS program_name,
        w.id AS workout_id,
        w.target_muscle,
        w.description,
        w.sets,
        w.weight_equipment,
        up.status,
        up.updated_at,
        upg.completed_at AS program_completed_at
      FROM user_programs upg
      JOIN programs p ON upg.program_id = p.id
      LEFT JOIN workouts w ON p.id = w.program_id
      LEFT JOIN user_progress up 
           ON w.id = up.workout_id AND up.user_id = $1
      WHERE upg.user_id = $1
      ORDER BY p.created_at DESC, w.id ASC
      `,
      [userId]
    );

    res.json(result.rows || []);
  } catch (err) {
    console.error("Error fetching user programs:", err);
    res.status(200).json([]);
  }
});

// ===== COACH PROGRAMS =====
app.get("/api/coach-programs/:coach_id", authMiddleware, async (req, res) => {
  try {
    const coachId = req.params.coach_id;

    const result = await pool.query(
      `
      SELECT id, name, description
      FROM programs
      WHERE coach_id = $1
      ORDER BY created_at DESC
      `,
      [coachId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching coach programs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== LIST CLIENTS =====
app.get("/api/clients", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, email
      FROM users
      WHERE role = 'client'
      ORDER BY name ASC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching clients:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/audit-logs", authMiddleware, authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        l.*,
        u1.name AS actor_name,
        u2.name AS target_name
      FROM audit_logs l
      JOIN users u1 ON l.actor_id = u1.id
      LEFT JOIN users u2 ON l.target_id = u2.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== FETCH PROGRAM FEEDBACK =====
app.get(
  "/api/program-comments/:program_id",
  authMiddleware,
  async (req, res) => {
    try {
      const programId = req.params.program_id;

      const result = await pool.query(
        `
      SELECT 
        c.id, 
        c.message, 
        c.created_at, 
        u.name AS user_name
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.program_id = $1
      ORDER BY c.created_at DESC
      `,
        [programId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching comments:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ===== COACH DASHBOARD STATS =====
app.get("/api/coach-stats/:id", authMiddleware, async (req, res) => {
  try {
    const coachId = req.params.id;

    const totalPrograms = await pool.query(
      "SELECT COUNT(*) FROM programs WHERE coach_id = $1",
      [coachId]
    );

    const totalClients = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'client'"
    );

    const feedback = await pool.query(
      `
      SELECT COUNT(*)
      FROM comments c
      JOIN programs p ON p.id = c.program_id
      WHERE p.coach_id = $1
      `,
      [coachId]
    );

    res.json({
      programs: Number(totalPrograms.rows[0].count),
      clients: Number(totalClients.rows[0].count),
      feedback: Number(feedback.rows[0].count),
    });
  } catch (err) {
    console.error("Stats fetch error:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ===== REGISTER =====
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
      `,
      [name, email, hashed, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== LOGIN =====
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE email = $1 OR name = $1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // prevent login if inactive
    if (user.active === false || user.active === "f") {
      // Postgres can store t/f
      return res.status(403).json({ error: "Account is deactivated" });
    }

    const token = jwt.sign(
      { user_id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== CREATE PROGRAM =====
app.post("/api/programs", authMiddleware, async (req, res) => {
  try {
    const { coach_id, name, description } = req.body;

    if (!coach_id || !name || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `
      INSERT INTO programs (coach_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [coach_id, name, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating program:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== CREATE WORKOUT =====
app.post("/api/workouts", authMiddleware, async (req, res) => {
  try {
    const { program_id, target_muscle, description, sets, weight_equipment } =
      req.body;

    if (!program_id || !target_muscle || !description || !sets) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `
      INSERT INTO workouts (program_id, target_muscle, description, sets, weight_equipment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [program_id, target_muscle, description, sets, weight_equipment]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating workout:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== ASSIGN PROGRAM =====
app.post("/api/assign-program", authMiddleware, async (req, res) => {
  try {
    let { user_id, program_id } = req.body;
    user_id = Number(user_id);
    program_id = Number(program_id);

    if (!user_id || !program_id) {
      return res.status(400).json({ error: "Missing or invalid user/program" });
    }

    const exists = await pool.query(
      `
      SELECT id
      FROM user_programs
      WHERE user_id = $1 AND program_id = $2
      `,
      [user_id, program_id]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ error: "Program already assigned" });
    }

    const assignment = await pool.query(
      `
      INSERT INTO user_programs (user_id, program_id)
      VALUES ($1, $2)
      RETURNING *
      `,
      [user_id, program_id]
    );

    await pool.query(
      `
      INSERT INTO user_progress (user_id, workout_id)
      SELECT $1, id FROM workouts WHERE program_id = $2
      `,
      [user_id, program_id]
    );

    res.status(201).json({
      message: "Program assigned and progress initialized",
      assignment: assignment.rows[0],
    });
  } catch (err) {
    console.error("Error assigning program:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== MARK WORKOUT DONE =====
app.patch("/api/mark-workout", authMiddleware, async (req, res) => {
  try {
    const { user_id, workout_id } = req.body;

    if (!user_id || !workout_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const updateResult = await pool.query(
      `
      UPDATE user_progress
      SET status = 'done', updated_at = NOW()
      WHERE user_id = $1 AND workout_id = $2
      RETURNING *
      `,
      [user_id, workout_id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Progress entry not found" });
    }

    const programRes = await pool.query(
      "SELECT program_id FROM workouts WHERE id = $1",
      [workout_id]
    );

    if (programRes.rowCount === 0) {
      return res.status(404).json({ error: "Workout not found" });
    }

    const programId = programRes.rows[0].program_id;

    const pending = await pool.query(
      `
      SELECT 1
      FROM user_progress up
      JOIN workouts w ON up.workout_id = w.id
      WHERE up.user_id = $1
        AND w.program_id = $2
        AND up.status <> 'done'
      LIMIT 1
      `,
      [user_id, programId]
    );

    if (pending.rowCount === 0) {
      await pool.query(
        `
        UPDATE user_programs
        SET completed_at = NOW()
        WHERE user_id = $1 AND program_id = $2
        `,
        [user_id, programId]
      );
    }

    res.json({ message: "Workout marked as done" });
  } catch (err) {
    console.error("Error updating progress:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== UPDATE ROLE =====
app.patch(
  "/api/users/:id/role",
  authMiddleware,
  authAdmin,
  async (req, res) => {
    try {
      const { role } = req.body;
      const userId = req.params.id;

      if (!role) {
        return res.status(400).json({ error: "Role is required" });
      }

      const allowed = ["client", "coach", "super_admin"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      await pool.query("UPDATE users SET role=$1 WHERE id=$2", [role, userId]);

      res.json({ message: "Role updated" });
    } catch (err) {
      console.error("Role update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ===== RESET PASSWORD =====
app.patch(
  "/api/users/:id/password",
  authMiddleware,
  authAdmin,
  async (req, res) => {
    try {
      const { new_password } = req.body;
      const userId = req.params.id;

      if (!new_password || new_password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters" });
      }

      const hashed = await bcrypt.hash(new_password, 10);

      await pool.query("UPDATE users SET password=$1 WHERE id=$2", [
        hashed,
        userId,
      ]);

      res.json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("Password reset error:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  }
);

app.patch("/api/toggle-user", authMiddleware, authAdmin, async (req, res) => {
  try {
    const { user_id, active } = req.body;

    if (!user_id || active === undefined) {
      return res.status(400).json({ error: "Missing user_id or active flag" });
    }

    const result = await pool.query(
      "UPDATE users SET active=$1 WHERE id=$2 RETURNING id",
      [active, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User status updated" });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== SUBMIT COMMENT =====
app.post("/api/comments", authMiddleware, async (req, res) => {
  try {
    const { user_id, program_id, message } = req.body;

    if (!user_id || !program_id || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const assignment = await pool.query(
      `
      SELECT completed_at
      FROM user_programs
      WHERE user_id = $1 AND program_id = $2
      `,
      [user_id, program_id]
    );

    if (assignment.rowCount === 0) {
      return res
        .status(400)
        .json({ error: "Program not assigned to this user" });
    }

    if (!assignment.rows[0].completed_at) {
      return res.status(400).json({ error: "Program not completed yet" });
    }

    const exists = await pool.query(
      `
      SELECT 1
      FROM comments
      WHERE user_id = $1 AND program_id = $2
      `,
      [user_id, program_id]
    );

    if (exists.rowCount > 0) {
      return res.status(400).json({ error: "Feedback already submitted" });
    }

    const comment = await pool.query(
      `
      INSERT INTO comments (user_id, program_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [user_id, program_id, message]
    );

    res.status(201).json({
      message: "Comment submitted successfully",
      comment: comment.rows[0],
    });
  } catch (err) {
    console.error("Comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== SERVER START =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
