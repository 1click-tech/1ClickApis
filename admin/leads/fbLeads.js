const express = require("express");
const { Timestamp } = require("@google-cloud/firestore");
const moment = require("moment"); // Add this line
const router = express.Router();
const { db } = require("../../config/firebase");

const fetchFacebookData = async (url) => {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FB_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.error(
        "Facebook API request failed:",
        response.status,
        response.statusText
      );
      return null;
    }

    const jsonResponse = await response.json();

    return jsonResponse;
  } catch (error) {
    console.error("Error fetching data from Facebook:", error);
    return null;
  }
};

// Firebase Firestore Integration
const storeDataInFirestore = async (data) => {
  const collectionRef = db.collection("data");
  const docRef = collectionRef.doc("adverts");
  const formRef = docRef.collection("fb");
  const formId = data.id;
  const formSnap = await formRef.doc(`form${formId}`).get();
  const formObj = {
    id: formId,
    name: data.name,
    status: data.status,
    lastUpdated: Timestamp.now(),
  };
  if (formSnap.exists) {
    await formRef.doc(`form${formId}`).update(formObj);
  } else {
    await formRef.doc(`form${formId}`).set(formObj);
  }
};
const storeFBLeads = async (req, res) => {
  try {
    const url =
      "https://graph.facebook.com/v14.0/101526569624705/leadgen_forms?limit=100";
    const response = await fetchFacebookData(url);

    if (!response || !response.data) {
      throw new Error("No data found in Facebook API response");
    }

    let allForms = response.data;
    allForms = allForms.filter((form) => form.status === "ACTIVE");

    // Store forms data in Firestore concurrently
    const storeFormsPromises = allForms.map((form) =>
      storeDataInFirestore(form)
    );
    await Promise.all(storeFormsPromises);

    // Fetching lastFetched time
    let timeSnapshot = await db.collection("backend").doc("leads").get();

    if (!timeSnapshot.exists) {
      console.log(
        "Document 'backend/leads' does not exist. Creating it with default values."
      );
      await db.collection("backend").doc("leads").set({
        lastFetched: Timestamp.now(),
      });
      timeSnapshot = await db.collection("backend").doc("leads").get();
    }

    const data = timeSnapshot.data();
    if (!data) {
      throw new Error("No data found in the 'backend/leads' document.");
    }

    let lastFetched = data.lastFetched;

    if (!lastFetched) {
      console.log(
        "Field 'lastFetched' is missing. Setting it to the current time."
      );
      lastFetched = Timestamp.now();
      await db.collection("backend").doc("leads").update({
        lastFetched: lastFetched,
      });
    }

    const timestamp = moment(
      new Timestamp(lastFetched._seconds, lastFetched._nanoseconds).toDate()
    );
    let allLeads = [];

    // Process leads concurrently
    const fetchLeadsPromises = allForms.map(async (form) => {
      const leads = [];
      const formId = form.id;
      const formName = form.name;

      const url = `https://graph.facebook.com/v14.0/${formId}/leads`;

      const leadsToArr = async (url) => {
        const response = await fetchFacebookData(url);

        if (!response || !response.data) {
          console.error("No leads data available");
          return;
        }

        for (let i = 0; i < response.data.length; i++) {
          const lead = response.data[i];
          const createdTime = moment(lead.created_time);
          if (createdTime.isAfter(timestamp)) {
            // Format field_data as a direct object
            const formattedFieldData = lead.field_data.reduce((acc, field) => {
              if (field.values && field.values.length > 0) {
                acc[field.name] = field.values.join(", "); // Combine values into a single string if there are multiple
              } else {
                acc[field.name] = ""; // Default to an empty string if no values
              }
              return acc;
            }, {});

            const formattedLead = {
              ...lead,
              field_data: { ...formattedFieldData, adType: formName },
            };
            leads.push(formattedLead);
            if (
              i === response.data.length - 1 &&
              response.paging &&
              response.paging.next
            ) {
              await leadsToArr(response.paging.next);
            }
          } else if (Timestamp.fromDate(createdTime.toDate()) < timestamp) {
            break;
          }
        }
      };

      await leadsToArr(url);
      allLeads.push(...leads);
    });

    await Promise.all(fetchLeadsPromises);

    //   console.log("All Leads:", JSON.stringify(allLeads, null, 2));

    // Store each lead in a separate document if it falls within the time range
    if (allLeads.length > 0) {
      allLeads = allLeads.slice(0, 1);

      for (let lead of allLeads) {
        const leadCountSnap = await db.collection("backend").doc("leads").get();
        const leadCount = leadCountSnap.data().leadCount + 1;
        const docId = `1click${leadCount}`;
        console.log("docId", docId);
        await db
          .collection("leads")
          .doc(docId)
          .set({
            createdAt: Timestamp.fromDate(moment(lead.created_time)).toDate(),
            ...lead.field_data,
          });

        // update leadCount
        await db.collection("backend").doc("leads").update({
          leadCount: leadCount,
        });
      }

      // const storeLeadsPromises = allLeads.map((lead, index) => {
      //   const docId = `1click${startIndex + index}`;
      //   return leadsCollection.doc(docId).set({
      //     ...lead,
      //     index: startIndex + index,
      //   });
      // });

      // await Promise.all(storeLeadsPromises);
    }

    // Update last fetched time
    await db.collection("backend").doc("leads").update({
      lastFetched: Timestamp.now(),
    });

    res.status(200).send({ message: "All leads stored successfully" });
  } catch (error) {
    console.error("FBError", error);
    res.status(500).send({ message: error.message });
  }
};
router.get("/storeFBLeads", storeFBLeads);

module.exports = { fbLeads: router };