const pool = require("../db");

async function logAudit(actorId, action, targetId = null, details = null) {
  try {
    await pool.query(
      `
      INSERT INTO audit_logs (actor_id, action, target_id, details)
      VALUES ($1, $2, $3, $4)
      `,
      [actorId, action, targetId, details]
    );
  } catch (err) {
    console.error("Audit logging failed:", err);
  }
}

module.exports = logAudit;
