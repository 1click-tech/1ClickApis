const express = require("express");
const { db } = require("../../config/firebase");
const { checkAuth } = require("../../middlewares/authMiddleware");
const moment = require("moment");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const { userRoles } = require("../../data/commonData");
const {
  generateId,
  getTeamMembersOfUser,
  getLeadsStats,
  generateSerialNumber,
} = require("../../utils/utils");
const { firestore } = require("firebase-admin");
const multer = require("multer");
const xlsx = require("xlsx");
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

const createLead = async (data) => {
  const phone = data.phone_number;

  if (phone) {
    const leadSnap = await db
      .collection("leads")
      .where("phone_number", "==", phone)
      .get();

    if (!leadSnap.empty) {
      const leadData = leadSnap.docs[0].data();
      if (data.source === "facebook") {
        const leadId = leadData.leadId;
        await db.collection("leads").doc(`1click${leadId}`).update({
          updatedAt: Timestamp.now(),
          disposition: "Not Open",
          subDisposition: "Hot Lead",
          reEnquire: true,
        });
      }
      return { success: false, lead: leadData, message: "Lead already exists" };
    } else {
      const leadId = await generateId("lead");
      const doc = `1click${leadId}`;
      const leadBody = {
        ...data,
        leadId,
        profileId: generateSerialNumber(leadId),
      };
      await db.collection("leads").doc(doc).set(leadBody);
      return { success: true, lead: leadBody };
    }
  }
};

// Get all leads
const getLeads = async (req, res) => {
  try {
    const body = req.body;

    const startDate = body.startDate
      ? moment(body.startDate).startOf("day").toDate()
      : moment().startOf("day").toDate();
    const endDate = body.endDate
      ? moment(body.endDate).endOf("day").toDate()
      : moment().endOf("day").toDate();

    let leadSnap = null;

    // leads for sales member
    if (req?.hierarchy === "executive") {
      leadSnap = await db
        .collection("leads")
        .where("createdAt", ">=", Timestamp.fromDate(startDate))
        .where("createdAt", "<=", Timestamp.fromDate(endDate))
        .where("salesExecutive", "==", req.userId)
        .get();
    } else if (req?.hierarchy == "manager") {
      leadSnap = await db
        .collection("leads")
        .where("createdAt", ">=", Timestamp.fromDate(startDate))
        .where("createdAt", "<=", Timestamp.fromDate(endDate))
        .where("salesExecutive", "==", null)
        .get();
    } else if (req?.hierarchy == "teamLead") {
      let teamMemberSnap = await db
        .collection("users")
        .doc("internal_users")
        .collection("credentials")
        .where("leader", "==", req.userId)
        .get();

      let teamMembers = teamMemberSnap.docs.map((item) => item.id);

      leadSnap = await db
        .collection("leads")
        .where("createdAt", ">=", Timestamp.fromDate(startDate))
        .where("createdAt", "<=", Timestamp.fromDate(endDate))
        .where("salesExecutive", "in", teamMembers)
        .get();
    } else {
      //leads for all members
      leadSnap = await db
        .collection("leads")
        .where("createdAt", ">=", Timestamp.fromDate(startDate))
        .where("createdAt", "<=", Timestamp.fromDate(endDate))
        .get();
    }

    // set the name of the salesmember and assigned by user from their unique id
    const leads = leadSnap.docs.map((doc) => doc.data());
    const usersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();
    const users = usersSnap.docs.map((doc) => doc.data());

    let modifiedLeads = [];

    for (let lead of leads) {
      if (lead?.salesExecutive) {
        let salesUser = users.find((user) => user.id == lead.salesExecutive);
        lead.salesExecutiveName = salesUser?.name || null;
      }
      if (lead?.assignedBy) {
        let assignedByUser = users.find((user) => user.id == lead?.assignedBy);
        lead.assignedBy = assignedByUser?.name || null;
      }

      modifiedLeads.push(lead);
    }

    res.status(200).json({ leads: modifiedLeads, success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message, success: false });
  }
};

// Assign leads to sales member
const assignLeadsToSalesMember = async (req, res) => {
  try {
    const body = req.body;
    const leads = body.leads;
    const salesMember = body.salesMember;
    const salesMemberName = body.salesMemberName || null;
    let assignedBy = req.userId || null;

    const snapshot = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .doc(assignedBy)
      .get();
    const userData = snapshot.data();

    for (let lead of leads) {
      await db.collection("leads").doc(`1click${lead}`).update({
        salesExecutive: salesMember,
        assignedBy: userData.name,
        assignedAt: Timestamp.now(),
        salesExecutiveName: salesMemberName,
      });
    }

    res
      .status(200)
      .send({ message: "Leads assigned successfully", success: true });
  } catch (error) {
    res.status(500).json({ message: error.message, success: false });
  }
};

// get all managers and their team members
const getSalesTeamMembers = async (req, res) => {
  try {
    const salesDeptMembersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();

    let users = salesDeptMembersSnap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    users = users.filter((item) => item.isActive);

    const userMap = {};

    users.forEach((user) => {
      userMap[user.id] = { ...user, teamMembers: [] };
    });

    let result = [];
    const orphans = [];
    users.forEach((user) => {
      if (user.senior) {
        if (userMap[user.senior]) {
          userMap[user.senior].teamMembers.push(userMap[user.id]);
        }
      } else {
        result.push(userMap[user.id]);
      }
    });

    users.forEach((user) => {
      if (
        (!user?.senior || user?.seniour == "") &&
        userMap[user.id].teamMembers.length === 0
      ) {
        orphans.push(userMap[user.id]);
      }
    });

    result = result.filter((item) => {
      let found = orphans.find((i) => i.id == item.id);

      return !found;
    });

    let finalData = [...result, ...orphans];

    res.status(200).send({ success: true, data: finalData });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

// get update history of lead
const getUpdateHistoryOfLead = async (req, res) => {
  try {
    const { leadId } = req.body;

    const historySnap = await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("history")
      .orderBy("updatedAt", "desc")
      .get();

    const historyData = historySnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).send({ success: true, data: historyData });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

const globalSearch = async (req, res) => {
  try {
    const { searchBy, searchText } = req.body;

    let leadsSnap;

    if (searchBy == "leadId") {
      let splits = searchText.split("1CD");
      let leadId = splits[splits.length - 1];
      leadsSnap = await db
        .collection("leads")
        .where("leadId", "==", parseInt(leadId))
        .get();
    } else if (searchBy == "companyName") {
      leadsSnap = await db
        .collection("leads")
        .where("company_name", "==", searchText)
        .get();
    } else if (searchBy == "profileId") {
      leadsSnap = await db
        .collection("leads")
        .where("profileId", "==", searchText)
        .get();
    } else {
      leadsSnap = await db
        .collection("leads")
        .where("phone_number", "==", parseInt(searchText))
        .get();
    }

    let leads =
      leadsSnap?.docs.map((item) => ({ id: item.id, ...item.data() })) || [];

    res.status(200).send({ success: true, data: leads });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

const createdManualLead = async (req, res) => {
  try {
    const body = req.body;

    const leadBody = {
      createdAt: Timestamp.fromDate(moment(body.date).toDate()),
      createdBy: req.userId,
      looking_for: body.lookingFor,
      company_name: body.companyName,
      full_name: body.contactPerson,
      phone_number: body.phone,
      your_mobile_number: body.mobileNumber || "NA",
      email: body.email,
      city: body.city,
      ["whats_is_your_requirement_?_write_in_brief"]: body.requirement,
      profileScore: body.profileScore || "NA",
      salesExecutive: body.salesMember.id,
      disposition: body.disposition || "NA",
      subDisposition: body.subDisposition || "NA",
      remarks: body.remarks || "NA",
      source: "manual",
      adType: "manual",
      assignedAt: Timestamp.now(),
      assignedBy: req.userId,
      followUpDate: body.followUpDate
        ? Timestamp.fromDate(moment(body.followUpDate).toDate())
        : "NA",
      updatedAt: Timestamp.now(),
    };

    const result = await createLead(leadBody);
    if (!result.success) {
      return res
        .status(400)
        .send({ message: "Lead already exists", success: false });
    }

    const docId = `1click${result.lead.leadId}`;

    await db
      .collection("leads")
      .doc(docId)
      .collection("history")
      .doc()
      .set({
        updatedAt: Timestamp.now(),
        updatedBy: req.userId,
        disposition: body.disposition,
        subDisposition: body.subDisposition,
        followUpDate: Timestamp.fromDate(moment(body.followUpDate).toDate()),
        hierarchy: req.hierarchy,
        remarks: body.remarks,
      });

    res
      .status(200)
      .send({ message: "Lead created successfully", success: true });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

const manupulateLeads = async (req, res) => {
  try {
    const leads = await db.collection("leads").get();

    const leadsData = leads.docs.map((item) => item.id);

    let batch = db.batch();
    let ref = db.collection("leads");

    for (let lead of leadsData) {
      let docRef = ref.doc(lead);
      batch.update(docRef, {
        salesExecutiveName: FieldValue.delete(),
        salesExecutive: FieldValue.delete(),
      });
    }

    await batch.commit();

    res.send("ok");
  } catch (error) {
    res.send(error.message);
  }
};

const manipulateUsers = async (req, res) => {
  try {
    const usersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();

    const users = usersSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

    const ref = db
      .collection("users")
      .doc("internal_users")
      .collection("credentials");
    const batch = db.batch();
    for (let i = 0; i < users.length; i++) {
      let user = users[i];
      const docId = user.id;
      delete user.id;

      let newId = `1CDI${i + 1}`;
      user.id = newId;
      console.log("user is", user);
      batch.set(ref.doc(newId), user);
      batch.delete(ref.doc(docId));
    }

    await batch.commit();
    res.send("ok");
  } catch (error) {
    res.send(error.message);
  }
};

const importLeadsFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "No file uploaded", success: false });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { raw: true });

    const duplicateLeads = [];

    for (let row of data) {
      const salesExecutiveEmail = row["User Mail Id"];
      if (salesExecutiveEmail) {
        const salesMemberSnap = await db
          .collection("users")
          .doc("internal_users")
          .collection("credentials")
          .where("email", "==", salesExecutiveEmail)
          .get();

        if (!salesMemberSnap.empty) {
          const salesMember = salesMemberSnap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))[0];

          row.salesMember = salesMember.id;
        } else {
          row.salesMember = null;
        }
      }

      let stampValue = Timestamp.fromDate(
        moment(row.Date, "DD-MM-YYYY").toDate()
      );

      const leadBody = {
        createdAt: stampValue,
        createdBy: req.userId,
        lookingFor: row["Looking For"] || "NA",
        company_name: row["Company Name"] || "NA",
        full_name: row["Contact Person"] || "NA",
        phone_number: row["Default Number"] || "NA",
        your_mobile_number: row["Contact Number"] || "NA",
        email: row["Mail Id"] || "NA",
        city: row.City || "",
        ["whats_is_your_requirement_?_write_in_brief"]: row.Query || "",
        profileScore: row.profileScore || "NA",
        disposition: row?.Disposition?.trim() || "NA",
        subDisposition: row["Sub Disposition"]?.trim() || "NA",
        remarks: row.remarks || "NA",
        source: "excel_import",
        adType: "manual",
        dataTag: row["Data Tag"] || "NA",
      };

      if (row.salesMember) {
        leadBody.salesExecutive = row.salesMember;
        leadBody.assignedAt = Timestamp.fromDate(moment().toDate());
        leadBody.assignedBy = req.userId;
        leadBody.updatedAt = Timestamp.fromDate(moment().toDate());
      }

      const result = await createLead(leadBody);
      if (!result.success) {
        duplicateLeads.push(row);
      }
    }

    res.status(200).json({
      message: "Leads imported successfully",
      success: true,
      duplicateLeads,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message, success: false });
  }
};

const getLeadDetails = async (req, res) => {
  try {
    const body = req.body;
    const leadId = body.leadId;

    const leadSnap = await db.collection("leads").doc(`1click${leadId}`).get();
    let leadData = leadSnap.data();

    if (!leadData.salesMemberName && leadData.salesExecutive) {
      const salesSnap = await db
        .collection("users")
        .doc("internal_users")
        .collection("credentials")
        .doc(leadData.salesExecutive)
        .get();

      const memberData = salesSnap.data();
      leadData.salesMemberName = memberData.name;
    }

    const detailsSnap = await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("details")
      .get();
    const leadDetails = {
      business: {},
      contact: {},
    };
    if (!detailsSnap.empty) {
      const details = detailsSnap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));
      leadDetails.business =
        details.find((item) => item.id === "businessDetails") || {};
      leadDetails.contact =
        details.find((item) => item.id === "contactDetails") || {};
    }

    const historySnap = await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("history")
      .orderBy("followUpDate", "desc")
      .get();

    const historyData = historySnap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    const lastCallBackDate =
      historyData.length >= 2 ? historyData[1].followUpDate : null;

    leadData.lastCallBackDate = lastCallBackDate;

    const productsSnap = await db
      .collection("leads")
      .doc(`1click${leadId}`)
      .collection("products")
      .get();

    const products = productsSnap.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    res.status(200).send({
      success: true,
      data: { leadData, leadDetails, historyData, products },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: error.message });
  }
};

const getLeadsForSalesPanel = async (req, res) => {
  try {
    const body = req.body;
    const startDate = body.startDate;
    const endDate = body.endDate;
    const myData = body.myData;

    let start = moment(startDate).startOf("day").toDate();
    let end = moment(endDate).endOf("day").toDate();

    let stampStart = Timestamp.fromDate(start);
    let stampEnd = Timestamp.fromDate(end);

    const userId = req.userId;

    // getting all the internal user to filterout the member of the current user's team
    const allUsersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();
    const allUsers = allUsersSnap.docs.map((item) => item.data());
    // filter the team members
    const getTeamMembers = await getTeamMembersOfUser(userId, allUsers);
    let allTeamMemberIds = [];

    // extract the ids of all the team members including user'
    if (req.hierarchy == "superAdmin") {
      allTeamMemberIds = allUsers?.map((user) => user.id);
    } else {
      if (Array.isArray(getTeamMembers)) {
        allTeamMemberIds = getTeamMembers?.map((user) => user.id);
      }
      allTeamMemberIds.push(userId);
    }

    // getting the assigned lead to all the team member of user
    let allLeads = [];
    for (let teamMemberId of allTeamMemberIds) {
      let snap = [];

      if (myData) {
        snap = await db
          .collection("leads")
          .where("salesExecutive", "==", teamMemberId)
          .get();

        const leadsData = snap.docs.map((doc) => doc.data());
        allLeads.push(...leadsData);
      } else {
        snap = await db
          .collection("leads")
          .where("assignedAt", ">=", stampStart)
          .where("assignedAt", "<=", stampEnd)
          .where("salesExecutive", "==", teamMemberId)
          .get();

        const assignedLeads = snap.docs.map((doc) => doc.data());

        // Today follow updates
        const followUpdateSnap = await db
          .collection("leads")
          .where("followUpDate", ">=", stampStart)
          .where("followUpDate", "<=", stampEnd)
          .where("salesExecutive", "==", teamMemberId)
          .get();

        const followUpLeads = followUpdateSnap.docs.map((doc) => doc.data());

        allLeads.push(...followUpLeads, ...assignedLeads);
      }

      // filter leads
      allLeads = allLeads.reduce((acc, lead) => {
        if (!acc.find((item) => item.leadId === lead.leadId)) {
          acc.push(lead);
        }
        return acc;
      }, []);

      // here add the name of the sales executive and assigned by user's
      allLeads = allLeads.map((lead) => {
        if (lead?.salesExecutive) {
          let salesUser = allUsers.find(
            (user) => user.id == lead.salesExecutive
          );
          lead.salesExecutiveName = salesUser?.name;
        }
        if (lead?.assignedBy) {
          let assignedByUser = allUsers.find(
            (user) => user.id == lead?.assignedBy
          );
          lead.assignedBy = assignedByUser?.name || null;
        }
        return lead;
      });
    }

    if (myData) {
      const order = [
        "NA",
        "Not Open",
        "Call Back",
        "No Response",
        "Presentation",
        "FollowUp",
        "Prospect",
        "Not Interested",
        "Deal Done",
      ];

      allLeads.sort((a, b) => {
        const indexA = order.indexOf(a.disposition);
        const indexB = order.indexOf(b.disposition);
        // If disposition is not in the predefined order, send it to the bottom
        return (
          (indexA === -1 ? Infinity : indexA) -
          (indexB === -1 ? Infinity : indexB)
        );
      });
    }

    res.status(200).send({ success: true, leads: allLeads });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

// Get all sales team members updated leads of today
const getUpdatedLeadsCount = async (req, res) => {
  try {
    const userId = req.userId;

    // getting all the internal user to filterout the member of the current user's team
    const allUsersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();

    const allUsers = allUsersSnap.docs.map((item) => item.data());

    // filter the team members
    const getTeamMembers = await getTeamMembersOfUser(userId, allUsers);
    let allTeamMemberIds = [];

    // extract the ids of all the team members including user'
    if (req.hierarchy == "superAdmin") {
      allTeamMemberIds = allUsers?.map((user) => user.id);
    } else {
      if (Array.isArray(getTeamMembers)) {
        allTeamMemberIds = getTeamMembers?.map((user) => user.id);
      }
      allTeamMemberIds.push(userId);
    }

    const data = [];
    for (let memberId of allTeamMemberIds) {
      const snap = await db
        .collection("users")
        .doc("internal_users")
        .collection("credentials")
        .doc(memberId)
        .get();

      const memberData = snap.data();

      const memberLeadsData = await getLeadsStats(memberId);

      data.push({ ...memberData, leadCounts: memberLeadsData });
    }

    res.status(200).send({ success: true, data });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

// Get all allocated leads
const getAllAllocatedLeads = async (req, res) => {
  try {
    const userId = req.userId;

    // getting all the internal user to filterout the member of the current user's team
    const allUsersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();

    const allUsers = allUsersSnap.docs.map((item) => item.data());

    // filter the team members
    const getTeamMembers = await getTeamMembersOfUser(userId, allUsers);
    let allTeamMemberIds = [];

    // extract the ids of all the team members including user'
    if (req.hierarchy == "superAdmin") {
      allTeamMemberIds = allUsers?.map((user) => user.id);
    } else {
      if (Array.isArray(getTeamMembers)) {
        allTeamMemberIds = getTeamMembers?.map((user) => user.id);
      }
      allTeamMemberIds.push(userId);
    }

    const leads = [];

    for (let memberId of allTeamMemberIds) {
      const memberLeadsData = await getLeadsStats(memberId);

      leads.push(...memberLeadsData.totalLeadsAssigned);
    }

    res.status(200).send({ success: true, leads });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

const getDataForDashboard = async (req, res) => {
  try {
    const { endDate, startDate } = req.body;
    let start = moment(startDate).startOf("day").toDate();
    let end = moment(endDate).endOf("day").toDate();

    const memberId = req.body.memberId;

    // convert date to timestamp
    let stampStart = Timestamp.fromDate(start);
    let stampEnd = Timestamp.fromDate(end);

    const userId = req.userId;

    // getting all the internal user to filterout the member of the current user's team
    const allUsersSnap = await db
      .collection("users")
      .doc("internal_users")
      .collection("credentials")
      .get();
    const allUsers = allUsersSnap.docs.map((item) => item.data());

    // filter the team members
    const getTeamMembers = await getTeamMembersOfUser(userId, allUsers);
    let allTeamMemberIds = [];

    let membersData = [];

    // extract the ids of all the team members including user'
    if (req.hierarchy == "superAdmin") {
      allTeamMemberIds = allUsers?.map((user) => user.id);
      const members = allUsers.filter((user) => user.id !== userId);
      membersData.push(...members);
    } else {
      if (Array.isArray(getTeamMembers)) {
        allTeamMemberIds = getTeamMembers?.map((user) => user.id);
      }
      allTeamMemberIds.unshift(userId);
      const currentUser = allUsers.find((user) => user.id === userId);
      membersData.push(currentUser, ...getTeamMembers);
    }

    // getting the assigned lead to all the team member of user
    let allLeads = [];
    // For particular member leads
    if (memberId) {
      const currentMember = allUsers.find((user) => user.id === memberId);
      // if current user is manager than all of his sales team data
      if (currentMember.hierarchy === "manager") {
        const managerMembers = await getTeamMembersOfUser(memberId, allUsers);
        const membersOfManager = managerMembers?.map((user) => user.id);
        const allMemberIds = [memberId, ...membersOfManager];
        for (let teamMemberId of allMemberIds) {
          const snap = await db
            .collection("leads")
            .where("updatedAt", ">=", stampStart)
            .where("updatedAt", "<=", stampEnd)
            .where("salesExecutive", "==", teamMemberId)
            .get();

          let snapData = snap.docs.map((doc) => doc.data());
          // here add the name of the sales executive and assigned by user's
          snapData = snapData.map((lead) => {
            if (lead?.salesExecutive) {
              let salesUser = allUsers.find(
                (user) => user.id == lead.salesExecutive
              );
              lead.salesExecutiveName = salesUser?.name;
            }
            if (lead?.assignedBy) {
              let assignedByUser = allUsers.find(
                (user) => user.id == lead?.assignedBy
              );
              lead.assignedBy = assignedByUser?.name || null;
            }
            return lead;
          });

          allLeads = [...allLeads, ...snapData];
        }
      } else {
        const snap = await db
          .collection("leads")
          .where("updatedAt", ">=", stampStart)
          .where("updatedAt", "<=", stampEnd)
          .where("salesExecutive", "==", memberId)
          .get();

        let snapData = snap.docs.map((doc) => doc.data());
        // here add the name of the sales executive and assigned by user's
        snapData = snapData.map((lead) => {
          if (lead?.salesExecutive) {
            let salesUser = allUsers.find(
              (user) => user.id == lead.salesExecutive
            );
            lead.salesExecutiveName = salesUser?.name;
          }
          if (lead?.assignedBy) {
            let assignedByUser = allUsers.find(
              (user) => user.id == lead?.assignedBy
            );
            lead.assignedBy = assignedByUser?.name || null;
          }
          return lead;
        });

        allLeads = [...allLeads, ...snapData];
      }
    } else {
      for (let teamMemberId of allTeamMemberIds) {
        const snap = await db
          .collection("leads")
          .where("updatedAt", ">=", stampStart)
          .where("updatedAt", "<=", stampEnd)
          .where("salesExecutive", "==", teamMemberId)
          .get();

        let snapData = snap.docs.map((doc) => doc.data());
        // here add the name of the sales executive and assigned by user's
        snapData = snapData.map((lead) => {
          if (lead?.salesExecutive) {
            let salesUser = allUsers.find(
              (user) => user.id == lead.salesExecutive
            );
            lead.salesExecutiveName = salesUser?.name;
          }
          if (lead?.assignedBy) {
            let assignedByUser = allUsers.find(
              (user) => user.id == lead?.assignedBy
            );
            lead.assignedBy = assignedByUser?.name || null;
          }
          return lead;
        });

        allLeads = [...allLeads, ...snapData];
      }
    }

    membersData = membersData.map((member) => ({
      name: member.name,
      id: member.id,
      hierarchy: member.hierarchy,
      senior: member.senior,
    }));

    res.status(200).send({ success: true, leads: allLeads, membersData });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

const getContractDetails = async (req, res) => {
  try {
    const leadId = req.body.leadId;
    const contractSnap = await db
      .collection("contracts")
      .where("leadId", "==", parseInt(leadId))
      .get();
    const contractData = contractSnap.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    const contracts = [];
    for (let contract of contractData) {
      const id = contract.id;
      const snapshot = await db
        .collection("contracts")
        .doc(id)
        .collection("orders")
        .get();
      const orders = snapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }));
      contracts.push({ ...contract, orders });
    }

    res.status(200).send({ success: true, contracts });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

const changeToDate = (date) => {
  if (!date._seconds) return null;
  let dt = new Timestamp(date._seconds, date._nanoseconds).toDate();
  return moment(dt).format("DD-MM-YYYY hh:mm A");
};

const getHotLeads = async (req, res) => {
  let startDate = moment("01-01-2025", "DD-MM-YYYY").startOf("day");
  let endDate = moment("31-01-2025", "DD-MM-YYYY").endOf("day");
  const snap = await db
    .collection("leads")
    .where("createdAt", ">=", startDate)
    .where("createdAt", "<=", endDate)
    .where("source", "==", "facebook")
    .get();

  let data = snap.docs.map((doc) => doc.data());
  data = data.map((item) => {
    Object.keys(item).forEach((key) => {
      if (item[key]?._seconds) {
        item[key] = changeToDate(item[key]);
      }
    });
    return item;
  });
  res.send({ len: data.length, data });
};

const deleteDataFromDb = async (req, res) => {
  try {
    console.log("req.decoded", req.decoded, req.hierarchy);

    if (req.hierarchy != "superAdmin") {
      return res
        .status(401)
        .send({ success: false, message: "Not authorized" });
    }

    const { leads } = req.body;

    console.log("leads", leads,req.body);

    if (!leads?.length) {
      return res
        .status(400)
        .send({ success: false, message: "No data provided" });
    }

    const batch = db.batch();

    leads.forEach((id) => {
      let ref = db.collection("leads").doc(id);
      batch.delete(ref);
    });
    batch.commit();

    res.status(200).send({ success: true, message: "Deleted successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
};

router.post(
  "/importLeadsFromExcel",
  upload.single("file"),
  checkAuth,
  importLeadsFromExcel
);

router.post("/getLeads", checkAuth, getLeads);
router.post("/assignLeadsToSalesMember", checkAuth, assignLeadsToSalesMember);
router.get("/getSalesTeamMembers", checkAuth, getSalesTeamMembers);
router.post("/getUpdateHistoryOfLead", checkAuth, getUpdateHistoryOfLead);
router.post("/globalSearch", checkAuth, globalSearch);
router.post("/createdManualLead", checkAuth, createdManualLead);
router.post("/getLeadDetails", checkAuth, getLeadDetails);
router.post("/manupulateLeads", manupulateLeads);
router.post("/getLeadsForSalesPanel", checkAuth, getLeadsForSalesPanel);
router.get("/getUpdatedLeadsCount", checkAuth, getUpdatedLeadsCount);
router.post("/getDataForDashboard", checkAuth, getDataForDashboard);
router.post("/getContractDetails", checkAuth, getContractDetails);
router.get("/getAllAllocatedLeads", checkAuth, getAllAllocatedLeads);
router.post("/deleteDataFromDb", checkAuth, deleteDataFromDb);
// router.get("/getHotLeads", getHotLeads);

module.exports = { leads: router, createLead };
