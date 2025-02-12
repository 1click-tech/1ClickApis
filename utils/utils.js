const { db } = require("../config/firebase");
const moment = require("moment");

const generateId = async (type) => {
  let id = null;
  if (type === "lead") {
    const leadCountSnap = await db.collection("backend").doc("leads").get();

    const count = leadCountSnap?.data()?.leadsCount
      ? leadCountSnap?.data()?.leadsCount + 1
      : 1;

    await db.collection("backend").doc("leads").set(
      {
        leadsCount: count,
      },
      { merge: true }
    );
    id = count;
  } else if (type === "sales") {
    const salesCountSnap = await db.collection("backend").doc("sales").get();
    const count = salesCountSnap?.data()?.salesMembersCount
      ? salesCountSnap?.data()?.salesMembersCount + 1
      : 1;

    await db.collection("backend").doc("sales").set(
      {
        salesMembersCount: count,
      },
      { merge: true }
    );
    id = count;
  } else if (type === "contract") {
    const contractCountSnap = await db
      .collection("backend")
      .doc("contracts")
      .get();
    const count = contractCountSnap?.data()?.contractsCount
      ? contractCountSnap?.data()?.contractsCount + 1
      : 1;

    await db.collection("backend").doc("contracts").set(
      {
        contractsCount: count,
      },
      { merge: true }
    );
    id = count;
  } else if (type == "internal_user") {
    const internalUserSnap = await db
      .collection("backend")
      .doc("internalUser")
      .get();
    const count = internalUserSnap?.data()?.internalMembersCount
      ? internalUserSnap?.data()?.internalMembersCount + 1
      : 1;

    await db.collection("backend").doc("internalUser").set(
      {
        internalMembersCount: count,
      },
      { merge: true }
    );
    id = count;
  }

  return id;
};

function generateSerialNumber(currentNumber) {
  // Extract the numeric part from the serial number
  let numericPart = parseInt(currentNumber); // Extract '0001' from '1CD0001'

  // Convert numeric part back to a string and pad with zeros
  let numericString = numericPart.toString().padStart(4, "0");

  // Combine the prefix with the numeric part
  return `1CD${numericString}`;
}

function getTeamMembersOfUser(userId, users) {
  function findTeamMembers(seniorId) {
    const directMembers = users.filter((user) => user.senior === seniorId);
    const allTeamMembers = directMembers.reduce((team, member) => {
      return team.concat([member], findTeamMembers(member.id));
    }, []);

    return allTeamMembers;
  }
  return findTeamMembers(userId);
}

const getLeadsStats = async (salesMemberId) => {
  const startOfDay = moment().startOf("day").toDate();
  const endOfDay = moment().endOf("day").toDate();

  // Query leads assigned to the sales member
  const totalLeadsSnapshot = await db
    .collection("leads")
    .where("salesExecutive", "==", salesMemberId)
    .get();

  const totalLeadsAssigned = totalLeadsSnapshot.docs.map((lead) => lead.data());

  // Query leads updated today
  const leadsUpdatedTodaySnapshot = await db
    .collection("leads")
    .where("salesExecutive", "==", salesMemberId)
    .where("updatedAt", ">=", startOfDay)
    .where("updatedAt", "<=", endOfDay)
    .get();

  const leadsUpdatedToday = leadsUpdatedTodaySnapshot.docs.map((lead) =>
    lead.data()
  );

  return {
    totalLeadsAssigned,
    leadsUpdatedToday,
  };
};

const removeCountryCode = (phone) => {
  return phone.toString().replace(/^\+91/, "");
};

module.exports = {
  generateId,
  getTeamMembersOfUser,
  getLeadsStats,
  generateSerialNumber,
  removeCountryCode,
};
