const jwt = require("jsonwebtoken");
const { db } = require("../config/firebase");

const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "token is required" });
  }

  const decodedToken = token.split(" ")[1];
  const decoded = jwt.verify(decodedToken, process.env.JWT_SECRET);
  const email = decoded.email;
  const role = decoded.role;
  const userSnap = await db
    .collection("users")
    .doc("internal_users")
    .collection("credentials")
    .where("email", "==", email)
    .get();

  const user = userSnap.docs[0].data();

  if (!user) {
    return res.status(401).send({ message: "user not found" });
  }

  if (user.role !== role) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  req.email = email;
  req.role = role;
  next();
};

module.exports = { checkAuth };
