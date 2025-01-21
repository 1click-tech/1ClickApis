const express = require("express");
const { db } = require("../../config/firebase");
const { checkAuth } = require("../../middlewares/authMiddleware");
const { Timestamp } = require("firebase-admin/firestore");
const moment = require("moment");
const { getLeadsStats, generateId } = require("../../utils/utils");
const router = express.Router();

const getSalesMembers = async (req, res) => {
  try {
    const snapshot = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .where("role", "==", "salesMember")
      .get();

    const salesMembers = snapshot.docs.map((doc) => doc.data());
    res.status(200).json({ salesMembers, success: true });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

const updateLead = async (req, res) => {
  try {
    const body = req.body;
    const leadId = body.leadId;
    const followUpDate = body.followUpDate;
    const updatedFollowUpdate = followUpDate
      ? Timestamp.fromDate(moment(followUpDate).utc().toDate())
      : null;

    console.log("followupdate", updatedFollowUpdate);
    body.followUpDate = updatedFollowUpdate;
    delete body.leadId;

    const leadRef = db.collection("leads").doc(`1click${leadId}`);
    const historyRef = db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("history");

    const historySnap = await historyRef
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get();
    let dataTag = "NA";
    if (!historySnap.empty) {
      dataTag = historySnap.docs[0].data().disposition || "NA";
    }

    await leadRef.update({ ...body, updatedAt: Timestamp.now(), dataTag });
    await historyRef.doc().set({
      ...body,
      updatedAt: Timestamp.now(),
      updatedBy: req.userId,
      hierarchy: req.hierarchy,
    });

    res
      .status(200)
      .json({ success: true, message: "Lead updated successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message, success: false });
  }
};

const updateBusinessDetails = async (req, res) => {
  try {
    const body = req.body;
    const leadId = body.leadId;
    delete body.leadId;

    await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("details")
      .doc("businessDetails")
      .set(body);

    res.status(200).json({
      success: true,
      message: "Business details updated successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

const contactDetails = async (req, res) => {
  try {
    const body = req.body;
    const leadId = body.leadId;
    const contactDetails = body.contactDetails;
    const altPhoneNumber = contactDetails.details.altPhoneNumber;
    delete body.leadId;

    await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("details")
      .doc("contactDetails")
      .set(contactDetails);

    await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .update({ altPhoneNumber: altPhoneNumber });

    res
      .status(200)
      .json({ success: true, message: "Contact details updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

const addProduct = async (req, res) => {
  try {
    const body = req.body;
    const leadId = body.leadId;
    delete body.leadId;

    const productRef = await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("products")
      .add(body);

    const id = productRef.id;

    res.status(200).json({
      success: true,
      message: "Product added successfully",
      product: { ...body, id },
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

const updateProduct = async (req, res) => {
  try {
    const body = req.body;
    const productId = body.id;
    const leadId = body.leadId;

    delete body.leadId;
    delete body.id;

    await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("products")
      .doc(productId)
      .update(body);

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: { ...body, id: productId },
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const body = req.body;
    const leadId = body.leadId;
    const productId = body.id;

    await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("products")
      .doc(productId)
      .delete();

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      id: productId,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// today worked leads
const getLeadsStatsToday = async (req, res) => {
  try {
    const userId = req.userId;
    const { totalLeadsAssigned, leadsUpdatedToday, remainingLeads } =
      await getLeadsStats(userId);

    res.status(200).send({
      totalLeadsAssigned,
      leadsUpdatedToday,
      remainingLeads,
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

const getFollowUpDates = async (req, res) => {
  try {
    const userId = req.userId;
    const today = moment();
    const startTemp = Timestamp.fromDate(today.startOf("day").toDate());
    const endTemp = Timestamp.fromDate(today.endOf("day").toDate());

    const followUpSnapshot = await db
      .collection("leads")
      .where("salesExecutive", "==", userId)
      .where("followUpDate", ">=", startTemp)
      .where("followUpDate", "<=", endTemp)
      .get();

    const followUps = followUpSnapshot.docs.map((doc) => doc.data());
    console.log("followUps", followUps.length);

    res.status(200).send({ followUps, success: true });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const updateLockLeadsStatus = async (req, res) => {
  try {
    const lockLeads = req.body.lockLeads;
    const userId = req.userId;

    await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(userId)
      .update({
        lockLeads: lockLeads,
      });

    res.status(200).send({ success: true });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const getLockLeadsStatus = async (req, res) => {
  try {
    const userId = req.userId;

    const snapshot = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(userId)
      .get();

    const data = snapshot.data();
    const lockLeads = data["lockLeads"] || false;
    res.status(200).send({ lockLeads, success: true });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

// address: "",
// gstNumber: "",
// package: "",
// receivedAmount: "",
// dueDate: "",
// invoiceDate: "",
// totalAmount: "",

const raisePI = async (req, res) => {
  try {
    const body = req.body;
    const userId = req.userId;
    const address = body.address;
    const gstNumber = body.gstNumber;
    const package = body.package;
    const receivedAmount = body.receivedAmount;
    const dueDate = body.dueDate;
    const invoiceDate = body.invoiceDate;
    const totalAmount = body.totalAmount;
    const leadId = body.leadId;
    const email = body.email;
    const phone = body.phone;
    const company_name = body.company_name;
    const contractType = body.contractType;

    const memberSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(userId)
      .get();
    const member = memberSnap.data();

    const contractBody = {
      createdAt: Timestamp.now(),
      address,
      gstNumber,
      package,
      receivedAmount,
      dueDate: Timestamp.fromDate(moment(dueDate).toDate()),
      invoiceDate: Timestamp.fromDate(moment(invoiceDate).toDate()),
      totalAmount,
      leadId,
      email,
      phone_number: phone,
      salesExecutive: userId,
      company_name,
      salesMemberName: member.name || null,
      contractType,
    };

    const contractId = await generateId("contract");
    const docId = `1CC${contractId}`;
    await db.collection("contracts").doc(docId).set(contractBody);

    const orderBody = {
      createdAt: Timestamp.now(),
      invoiceDate: Timestamp.fromDate(moment(invoiceDate).toDate()),
      receivedAmount,
    };

    await db
      .collection("contracts")
      .doc(docId)
      .collection("orders")
      .add(orderBody);

    res.status(200).send({ success: true, message: "PI raised successfully" });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

const addNewInvoice = async (req, res) => {
  try {
    const body = req.body;
    const contractId = body.contractId;
    const receivedAmount = body.receivedAmount;
    const invoiceDate = body.invoiceDate;

    await db
      .collection("contracts")
      .doc(contractId)
      .collection("orders")
      .add({
        createdAt: Timestamp.now(),
        invoiceDate: Timestamp.fromDate(moment(invoiceDate).toDate()),
        receivedAmount,
      });

    res
      .status(200)
      .send({ success: true, message: "Invoice added successfully" });
  } catch (error) {
    res.status(500).send({ message: error.message, success: false });
  }
};

router.get("/getSalesMembers", checkAuth, getSalesMembers);
router.post("/updateLead", checkAuth, updateLead);
router.post("/updateBusinessDetails", checkAuth, updateBusinessDetails);
router.post("/contactDetails", checkAuth, contactDetails);
router.post("/addProduct", checkAuth, addProduct);
router.post("/updateProduct", checkAuth, updateProduct);
router.post("/deleteProduct", checkAuth, deleteProduct);
router.get("/getLeadsStatsToday", checkAuth, getLeadsStatsToday);
router.get("/getFollowUpDates", checkAuth, getFollowUpDates);
router.post("/updateLockLeadsStatus", checkAuth, updateLockLeadsStatus);
router.get("/getLockLeadsStatus", checkAuth, getLockLeadsStatus);
router.post("/raisePI", checkAuth, raisePI);
router.post("/addNewInvoice", checkAuth, addNewInvoice);

module.exports = { salesPanel: router };
