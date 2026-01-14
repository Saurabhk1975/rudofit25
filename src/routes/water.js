const express = require("express");
const router = express.Router();
const WaterTracker = require("../models/WaterTracker");
const UserProfile = require("../models/UserProfile");
// POST /waterTracker — Add water intake for the current day
router.post("/waterTracker", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: "userId and amount are required" });
    }

    const date = new Date().toISOString().split("T")[0]; // format YYYY-MM-DD
    let record = await WaterTracker.findOne({ userId, date });

    if (!record) {
      record = new WaterTracker({ userId, date, totalIntake: 0 });
    }

    // Add the new amount to existing total
    record.totalIntake = Number(record.totalIntake || 0) + Number(amount);
    await record.save();

    res.json({
      message: "✅ Water intake updated successfully",
      data: record,
    });
  } catch (error) {
    console.error("❌ Error in /waterTracker:", error);
    res.status(500).json({ error: "Server error while updating water tracker" });
  }
});
router.post("/updateFcmToken", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({ error: "userId and fcmToken required" });
    }

    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!profile.fcmTokens.includes(fcmToken)) {
      profile.fcmTokens.push(fcmToken);
      await profile.save();
    }

    return res.json({
      message: "FCM token saved",
      fcmTokens: profile.fcmTokens,
    });
  } catch (err) {
    console.error("FCM update error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});


// GET /waterTracker/:userId — Get today’s water data for that user
router.get("/waterTracker/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const date = new Date().toISOString().split("T")[0];

    const record = await WaterTracker.findOne({ userId, date });

    // If record doesn’t exist, just return default 0 value
    if (!record) {
      return res.json({
        message: "No record found for today — returning default 0 value",
        data: {
          userId,
          date,
          totalIntake: 0,
        },
      });
    }

    res.json({
      message: "✅ Water tracker data fetched successfully",
      data: record,
    });
  } catch (error) {
    console.error("❌ Error in GET /waterTracker:", error);
    res.status(500).json({ error: "Server error while fetching water tracker" });
  }
});

module.exports = router;

