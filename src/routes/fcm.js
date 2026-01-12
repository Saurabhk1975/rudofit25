console.log("fcm_file_loaded");
const express = require("express");
const router = express.Router();
const UserProfile = require("../models/UserProfile");

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
router.post("/logout", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: "User not found" });
    }

    profile.fcmTokens = profile.fcmTokens.filter(
      (t) => t !== fcmToken
    );

    await profile.save();

    res.json({
      message: "Logged out",
      fcmTokens: profile.fcmTokens,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
