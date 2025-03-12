const express = require("express");
const { db } = require("../../config/firebase");
const { Timestamp } = require("@google-cloud/firestore");
const jwt = require("jsonwebtoken");
const { checkAuth } = require("../../middlewares/authMiddleware");
const { generateId } = require("../../utils/utils");
const { sendEmail, generateOTP } = require("../../utils/email");
const moment = require("moment");

const router = express.Router();

const createAuth = async (req, res) => {
  try {
    const body = req.body;
    let id = await generateId("internal_user");

    body.email = body.email.trim();
    body.password = body.password.trim();

    await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(`1CDI${id}`)
      .set({ ...body, id: `1CDI${id}`, createdAt: Timestamp.now() });

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
      .where("email", "==", email.toLowerCase())
      .get();

    if (userSnap.empty) {
      return res
        .status(404)
        .send({ success: false, message: "User not found" });
    }

    const user = userSnap.docs[0].data();

    if (user.password !== password) {
      return res
        .status(401)
        .send({ success: false, message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res
        .status(401)
        .send({ success: false, message: "You are not authorized" });
    }

    const jwtPayload = {
      email: user.email,
      name: user.name,
      department: user.department,
      hierarchy: user.hierarchy,
      userId: userSnap.docs[0].id,
    };

    // if (user.role) {
    //   jwtPayload.role = user.role;
    // }

    const now = moment();
    const expiry = moment().endOf("day");

    const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: expiry.diff(now, "seconds"),
    });

    res.status(200).send({ token, success: true, hierarchy: user.hierarchy });
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

    const allUsers = users.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

    let modifiedUsers = allUsers.map((user) => {
      let obj = { ...user };
      if (obj?.senior) {
        console.log("found senior for", obj.name);
        let seniorData = allUsers.find((item) => item.id == obj.senior);
        obj.seniorName = seniorData?.name || seniorData?.email || null;
      }
      return obj;
    });

    res.status(200).send({
      users: modifiedUsers,
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const updateUser = async (req, res) => {
  try {
    const body = req.body;
    const email = body.email;
    const userSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .where("email", "==", email)
      .get();

    if (body.updatedEmail && body.updatedEmail != "") {
      body.email = body.updatedEmail;
      delete body.updatedEmail;
    }

    const userId = userSnap.docs[0].id;

    if (body.exitDate && body.exitDate !== "") {
      let dt = moment(body.exitDate).toDate();
      body.exitDate = dt;
    }

    await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(userId)
      .update(body);

    res.status(200).send({
      message: "User updated successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const sendEmailOtp = async (req, res) => {
  try {
    const email = req.body.email;

    const snapshot = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .where("email", "==", email)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .send({ message: "User not found", success: false });
    }

    const otp = generateOTP();
    console.log("otp", otp);

    const subject = "Your OTP Code for Password Reset";
    const text = `Your one-time password (OTP) for resetting your password is: ${otp}`;

    const status = await sendEmail({
      email: email,
      subject,
      text,
    });

    if (!status) {
      return res
        .status(500)
        .send({ message: "Something went wrong", success: false });
    }

    const token = jwt.sign({ otp }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    res.status(200).send({
      message: "OTP sent successfully",
      success: true,
      otpToken: token,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const otp = req.body.otp;
    const otpToken = req.body.otpToken;

    const decoded = jwt.verify(otpToken, process.env.JWT_SECRET);

    if (parseInt(decoded.otp) !== parseInt(otp)) {
      return res.status(401).send({ message: "Invalid OTP", success: false });
    }

    res.status(200).send({
      message: "OTP verified successfully",
      success: true,
    });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const resetPassword = async (req, res) => {
  try {
    const body = req.body;
    const email = body.email;
    const password = body.password;

    const snapshot = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .where("email", "==", email)
      .get();
    const userId = snapshot.docs[0].id;

    await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(userId)
      .update({ password });

    res
      .status(200)
      .send({ message: "Password reset successfully", success: true });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const email = req.email;

    const userSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .where("email", "==", email)
      .get();

    if (userSnap.docs.length == 0) {
      return res
        .status(404)
        .send({ message: "User not found", success: false });
    }

    let userData = userSnap.docs[0].data();
    return res.status(200).send({ success: true, data: userData });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const validateToken = async (req, res) => {
  try {
    let decodedData = req.decoded;
    res.status(200).send({ success: true, data: decodedData });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

router.post("/login", logIn);
router.post("/createAuth", checkAuth, createAuth);
router.post("/updateUser", checkAuth, updateUser);
router.get("/getAllUsers", getAllUsers);
router.post("/sendEmailOtp", sendEmailOtp);
router.post("/verifyOtp", verifyOtp);
router.post("/resetPassword", resetPassword);
router.get("/getUserDetails", checkAuth, getUserDetails);
router.get("/validateToken", checkAuth, validateToken);

module.exports = { auth: router };
