const express = require("express");
const multer = require("multer");
const router = express.Router();
const FoodEntry = require("../models/FoodEntry");
const UserProfile = require("../models/UserProfile");
const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.GROQ_API_KEY });

/* ------------------ MULTER CONFIG ------------------ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ------------------ AI HELPER ------------------ */
const askAIForNutrition = async (input) => {
  const prompt = `Give me approximate nutrition in JSON for this food: ${input}. Format:
  {"calories":200,"protein":10,"fat":5,"carbs":30,"sugar":2,"calcium":20}`;
  const response = await client.chat.completions.create({
    model: "llama3-8b-8192",
    messages: [{ role: "user", content: prompt }],
  });
  return JSON.parse(response.choices[0].message.content);
};

/* =========================================================
   1️⃣  ADD FOOD (JSON / IMAGE / CUSTOM TEXT)
========================================================= */
router.post("/addFood", upload.single("image"), async (req, res) => {
  try {
    const { userId, foodData, customText } = req.body;
    let aiResult;

    if (foodData) {
      aiResult = JSON.parse(foodData);
    } else if (req.file) {
      aiResult = await askAIForNutrition(
        `Food in this image: ${req.file.path}`
      );
    } else if (customText) {
      aiResult = await askAIForNutrition(customText);
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();

    let userFood = await FoodEntry.findOne({ userId });
    if (!userFood) userFood = new FoodEntry({ userId, nutritionByDate: [] });

    let yearData = userFood.nutritionByDate.find((e) => e.year === y);
    if (!yearData) {
      yearData = { year: y, months: [] };
      userFood.nutritionByDate.push(yearData);
    }

    let monthData = yearData.months.find((e) => e.month === m);
    if (!monthData) {
      monthData = { month: m, days: [] };
      yearData.months.push(monthData);
    }

    let dayData = monthData.days.find((e) => e.day === d);
    if (!dayData) {
      dayData = {
        day: d,
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        sugar: 0,
        calcium: 0,
        foodItems: [],
      };
      monthData.days.push(dayData);
    }

    // Update totals
    for (const key in aiResult) {
      dayData[key] = (dayData[key] || 0) + (aiResult[key] || 0);
    }

    dayData.foodItems.push({
      name: customText || "Custom Food",
      ...aiResult,
      imageUrl: req.file ? req.file.path : null,
      sourceType: req.file ? "image" : foodData ? "json" : "text",
    });

    await userFood.save();
    res.json({ message: "✅ Food added successfully", userFood });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   2️⃣  LIST FOOD
========================================================= */
router.get("/listFood/:userId", async (req, res) => {
  const food = await FoodEntry.findOne({ userId: req.params.userId });
  res.json(food || {});
});

/* =========================================================
   3️⃣  GET CUSTOM DATE DATA
========================================================= */
router.post("/getCustomDateData", async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.body;

    if (!userId || !startDate)
      return res
        .status(400)
        .json({ error: "userId and startDate are required" });

    const [startDay, startMonth, startYear] = startDate.split("/").map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const end = endDate
      ? (() => {
          const [d, m, y] = endDate.split("/").map(Number);
          return new Date(y, m - 1, d);
        })()
      : start;

    const data = await FoodEntry.findOne({ userId });
    if (!data) return res.json({ message: "No data found for user" });

    let total = {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      sugar: 0,
      calcium: 0,
    };
    let tracker = 0;

    data.nutritionByDate.forEach((year) => {
      year.months.forEach((month) => {
        month.days.forEach((day) => {
          const entryDate = new Date(year.year, month.month - 1, day.day);
          if (entryDate >= start && entryDate <= end) {
            tracker++;
            for (let key in total) {
              total[key] += day[key] || 0;
            }
          }
        });
      });
    });

    if (tracker === 0)
      return res.json({ message: "No data found for given date range" });

    res.json({
      message: "✅ Data fetched successfully",
      userId,
      from: startDate,
      to: endDate || startDate,
      daysCount: tracker,
      totals: total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   4️⃣  GET HOMEPAGE DATA (TODAY’S SUMMARY)
========================================================= */
router.get("/dataHomepage/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();

    const profile = await UserProfile.findOne({ userId });
    const food = await FoodEntry.findOne({ userId });

    if (!profile) return res.json({ message: "Profile not found" });
    if (!food) return res.json({ message: "No food data found" });

    const yearData = food.nutritionByDate.find((e) => e.year === y);
    const monthData = yearData?.months.find((e) => e.month === m);
    const dayData = monthData?.days.find((e) => e.day === d);

    if (!dayData) return res.json({ message: "No food data for today" });

    const response = {
      userId,
      date: `${d}/${m}/${y}`,
      target: {
        calories: profile.targetCalorie,
        protein: profile.targetProtein,
        fat: profile.targetFat,
        carb: profile.targetCarb,
      },
      consumed: {
        calories: dayData.calories,
        protein: dayData.protein,
        fat: dayData.fat,
        carb: dayData.carbs,
      },
    };

    res.json({
      message: "✅ Homepage data fetched successfully",
      data: response,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🔔 UPDATE / ADD FCM TOKEN (multi-device support)
router.post("/updateFcmToken", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({ error: "userId and fcmToken are required" });
    }

    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // initialize array if missing
    if (!Array.isArray(profile.fcmToken)) {
      profile.fcmToken = [];
    }

    // avoid duplicates
    if (!profile.fcmToken.includes(fcmToken)) {
      profile.fcmToken.push(fcmToken);
    }

    await profile.save();

    return res.json({
      message: "FCM token updated successfully",
      fcmTokens: profile.fcmToken,
    });
  } catch (err) {
    console.error("❌ updateFcmToken error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
// 🚪 LOGOUT — REMOVE FCM TOKEN
router.post("/logout", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({ error: "userId and fcmToken required" });
    }

    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    profile.fcmToken = (profile.fcmToken || []).filter(
      (token) => token !== fcmToken
    );

    await profile.save();

    return res.json({
      message: "Logged out successfully",
      fcmTokens: profile.fcmToken,
    });
  } catch (err) {
    console.error("❌ logout error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});


module.exports = router;

