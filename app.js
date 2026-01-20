require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
  console.log("requested url", req.originalUrl);
  next();
});

// Admin Auth Routes
const { auth } = require("./admin/auth/auth");
app.use("/admin/auth", auth);
const { roles } = require("./admin/auth/roles");
app.use("/admin/roles", roles);

// leads
const { leads } = require("./admin/leads/leads");
app.use("/admin/leads", leads);
const { fbLeads } = require("./admin/leads/fbLeads");
app.use("/admin/fbLeads", fbLeads);

// sales panel
const { salesPanel } = require("./admin/sales/salesPanel");
app.use("/admin/sales", salesPanel);

// panel
const { panel } = require("./admin/panel/panel");
app.use("/admin/panel", panel);
const { websiteAnalyzer } = require("./utils/openAI/websiteAnalyzer");
app.use("/openAI/websiteAnalyzer", websiteAnalyzer);

const PORT = parseInt(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
