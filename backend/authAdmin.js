module.exports = function (req, res, next) {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Access restricted" });
  }
  next();
};
