const express = require("express");
const { db } = require("../../config/firebase");
const { Timestamp } = require("@google-cloud/firestore");
const jwt = require("jsonwebtoken");
const { checkAuth } = require("../../middlewares/authMiddleware");

const router = express.Router();

const createAuth = async (req, res) => {
  try {
    const body = req.body;
    await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc()
      .set({ ...body, createdAt: Timestamp.now() });

    res
      .status(200)
      .send({ message: "User created successfully", success: true });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

// Login for internal users
const logIn = async (req, res) => {
  try {
    const body = req.body;
    const email = body.email;
    const password = body.password;

    const userSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .where("email", "==", email)
      .get();

    if (userSnap.empty) {
      return res.status(404).send("User not found");
    }

    const user = userSnap.docs[0].data();

    if (user.password !== password) {
      return res.status(401).send("Invalid email or password");
    }

    const jwtPayload = {
      email: user.email,
    };

    if (user.role) {
      jwtPayload.role = user.role;
    }

    const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.status(200).send({ token, success: true, role: user.role });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message, success: false });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();
    res.status(200).send({
      users: users.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

router.post("/createAuth", checkAuth, createAuth);
router.post("/login", logIn);
router.get("/getAllUsers", checkAuth, getAllUsers);

module.exports = { auth: router };
