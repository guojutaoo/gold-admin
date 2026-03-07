const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const https = require("https");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
require("dotenv").config();

const { dbOperations } = require("./database.cjs");
const {
  generateThresholdHtml,
  generateDropHtml,
  generateIntervalHtml,
} = require("./email_templates.cjs");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const SINA_API_KEY = process.env.SINA_API_KEY || "";
const SINA_FUTURES_SYMBOLS =
  process.env.SINA_FUTURES_SYMBOLS ||
  "nf_AU0,nf_AG0,hf_GC,hf_SI,g_icbc,g_ccb,g_boc,sh518880,hf_XAU,hf_XAG";

// 中间件
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// JWT 验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// 管理员验证中间件
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

const normalizeNotifyModes = (notifyModes, notifyMode) => {
  if (Array.isArray(notifyModes)) {
    return notifyModes.filter(Boolean);
  }
  if (typeof notifyModes === "string") {
    return notifyModes
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof notifyMode === "string") {
    return notifyMode
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const buildMailer = () => {
  const host = process.env.SMTP_HOST || "smtp.qq.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "408499081@qq.com";
  const pass = process.env.SMTP_PASS || "ovbwspiwqcpdcaic";
  const from = process.env.SMTP_FROM || user;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !from) {
    return { error: "SMTP_HOST and SMTP_FROM required" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return { transporter, from };
};

// ==================== 认证相关 API ====================

// 登录
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const emailTrimmed = String(email).trim();
    const user = await dbOperations.getUserByEmail(emailTrimmed);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        plan: user.plan,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 获取当前用户信息
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await dbOperations.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      plan: user.plan,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/form/verify", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const tokenRow = await dbOperations.getFormToken(token);
    if (!tokenRow || tokenRow.status !== "active") {
      return res.status(401).json({ error: "Invalid token" });
    }

    res.json({
      valid: true,
      bound_email: tokenRow.bound_email || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/form/submit", async (req, res) => {
  try {
    const {
      token,
      email,
      monitor_gold,
      monitor_silver,
      notify_mode,
      notify_modes,
      interval_hours,
      drop_threshold,
      price_threshold,
    } = req.body;

    const tokenValue = String(token || "").trim();
    if (!tokenValue) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const tokenRow = await dbOperations.getFormToken(tokenValue);
    if (!tokenRow || tokenRow.status !== "active") {
      return res.status(401).json({ error: "Invalid token" });
    }

    const emailValue = String(email || "").trim();
    if (!emailValue) {
      return res.status(400).json({ error: "Email required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailValue)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const notifyModes = normalizeNotifyModes(notify_modes, notify_mode);
    if (!notifyModes.length) {
      return res.status(400).json({ error: "Notify mode required" });
    }

    if (!monitor_gold && !monitor_silver) {
      return res.status(400).json({ error: "At least one asset required" });
    }

    const resolvedIntervalHours = notifyModes.includes("interval")
      ? (interval_hours ?? 2)
      : null;
    const resolvedDropThreshold = notifyModes.includes("drop")
      ? (drop_threshold ?? 5)
      : null;
    const resolvedPriceThreshold = notifyModes.includes("threshold")
      ? (price_threshold ?? null)
      : null;

    if (
      notifyModes.includes("interval") &&
      (resolvedIntervalHours === null || resolvedIntervalHours === undefined)
    ) {
      return res.status(400).json({ error: "Interval hours required" });
    }

    if (
      notifyModes.includes("drop") &&
      (resolvedDropThreshold === null || resolvedDropThreshold === undefined)
    ) {
      return res.status(400).json({ error: "Drop threshold required" });
    }

    if (
      notifyModes.includes("threshold") &&
      (resolvedPriceThreshold === null || resolvedPriceThreshold === undefined)
    ) {
      return res.status(400).json({ error: "Price threshold required" });
    }

    try {
      await dbOperations.bindFormTokenToEmail(tokenValue, emailValue);
    } catch (error) {
      if (String(error.message || "").includes("already bound")) {
        return res.status(409).json({
          error: "Token already bound to another email, please purchase again",
        });
      }
      if (String(error.message || "").includes("not found")) {
        return res.status(401).json({ error: "Invalid token" });
      }
      return res.status(400).json({ error: error.message });
    }

    let user = await dbOperations.getUserByEmail(emailValue);
    if (!user) {
      const userId = await dbOperations.generateUserId();
      const displayName = emailValue.split("@")[0];
      const tempPassword = `${emailValue}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const passwordHash = bcrypt.hashSync(tempPassword, 10);

      const newUser = await dbOperations.createUser({
        user_id: userId,
        name: displayName,
        email: emailValue,
        password_hash: passwordHash,
        role: "user",
        status: "active",
        plan: "paid",
      });
      user = newUser;
    }

    await dbOperations.createOrUpdateUserConfig(user.id, {
      monitor_gold,
      monitor_silver,
      notify_mode: notifyModes.join(","),
      interval_hours: notifyModes.includes("interval")
        ? Number(resolvedIntervalHours)
        : null,
      drop_threshold: notifyModes.includes("drop")
        ? Number(resolvedDropThreshold)
        : null,
      price_threshold: notifyModes.includes("threshold")
        ? Number(resolvedPriceThreshold)
        : null,
    });

    res.json({ success: true, bound_email: emailValue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(
  "/api/admin/form-tokens",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const count = Math.min(Math.max(Number(req.body?.count || 1), 1), 1000);
      const created = [];

      while (created.length < count) {
        const token = crypto.randomBytes(24).toString("base64url");
        await dbOperations.ensureFormToken(token);
        const row = await dbOperations.getFormToken(token);
        if (row) {
          created.push(token);
        }
      }

      res.json({
        count: created.length,
        tokens: created,
        paths: created.map((t) => `/user-form?token=${t}`),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ==================== 用户管理 API (管理员) ====================

// 获取所有用户
app.get("/api/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await dbOperations.getAllUsers();
    const usersWithConfig = await Promise.all(
      users.map(async (u) => {
        const config = await dbOperations.getUserConfig(u.id);
        const configValue = config || {
          monitor_gold: true,
          monitor_silver: false,
          notify_mode: "interval",
          interval_hours: 2,
          drop_threshold: 2.0,
          price_threshold: null,
        };
        const notifyModes = normalizeNotifyModes(configValue.notify_mode);
        const assets = [];
        if (configValue.monitor_gold) assets.push("gold");
        if (configValue.monitor_silver) assets.push("silver");

        return {
          id: u.id,
          user_id: u.user_id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          plan: u.plan,
          assets,
          notifyModes,
          notifyMode: configValue.notify_mode,
          intervalHours: configValue.interval_hours,
          dropThreshold: configValue.drop_threshold,
          priceThreshold: configValue.price_threshold,
          created_at: u.created_at,
        };
      }),
    );
    res.json(usersWithConfig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建用户
app.post("/api/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      status,
      plan,
      monitor_gold,
      monitor_silver,
      notify_mode,
      notify_modes,
      interval_hours,
      drop_threshold,
      price_threshold,
    } = req.body;
    const notifyModes = normalizeNotifyModes(notify_modes, notify_mode);
    const emailTrimmed = email ? String(email).trim() : '';

    if (!emailTrimmed || !plan) {
      return res.status(400).json({ error: "Email and plan required" });
    }

    if (!notifyModes.length) {
      return res.status(400).json({ error: "Notify mode required" });
    }

    if (!monitor_gold && !monitor_silver) {
      return res.status(400).json({ error: "At least one asset required" });
    }

    if (
      notifyModes.includes("interval") &&
      (interval_hours === null || interval_hours === undefined)
    ) {
      return res.status(400).json({ error: "Interval hours required" });
    }

    if (
      notifyModes.includes("drop") &&
      (drop_threshold === null || drop_threshold === undefined)
    ) {
      return res.status(400).json({ error: "Drop threshold required" });
    }

    if (
      notifyModes.includes("threshold") &&
      (price_threshold === null || price_threshold === undefined)
    ) {
      return res.status(400).json({ error: "Price threshold required" });
    }

    const existingUser = await dbOperations.getUserByEmail(emailTrimmed);
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const userId = await dbOperations.generateUserId();
    const displayName = name && name.trim() ? name.trim() : emailTrimmed.split("@")[0];
    const tempPassword =
      password ||
      `${emailTrimmed}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = bcrypt.hashSync(tempPassword, 10);

    const newUser = await dbOperations.createUser({
      user_id: userId,
      name: displayName,
      email: emailTrimmed,
      password_hash: passwordHash,
      role: role || "user",
      status: status || "active",
      plan,
    });

    await dbOperations.createOrUpdateUserConfig(newUser.id, {
      monitor_gold,
      monitor_silver,
      notify_mode: notifyModes.join(","),
      interval_hours: notifyModes.includes("interval") ? interval_hours : null,
      drop_threshold: notifyModes.includes("drop") ? drop_threshold : null,
      price_threshold: notifyModes.includes("threshold")
        ? price_threshold
        : null,
    });

    res.status(201).json({
      id: newUser.id,
      user_id: newUser.user_id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      plan: newUser.plan,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新用户
app.put("/api/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      status,
      plan,
      monitor_gold,
      monitor_silver,
      notify_mode,
      notify_modes,
      interval_hours,
      drop_threshold,
      price_threshold,
    } = req.body;
    const notifyModes = normalizeNotifyModes(notify_modes, notify_mode);
    const emailTrimmed = email ? String(email).trim() : undefined;

    const existingUser = await dbOperations.getUserById(id);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (emailTrimmed) {
      const emailOwner = await dbOperations.getUserByEmail(emailTrimmed);
      if (emailOwner && emailOwner.id !== Number(id)) {
        return res.status(409).json({ error: "Email already exists" });
      }
    }

    const updatePayload = {};
    if (name) updatePayload.name = name;
    if (emailTrimmed) updatePayload.email = emailTrimmed;
    if (status) updatePayload.status = status;
    if (plan) updatePayload.plan = plan;

    if (Object.keys(updatePayload).length) {
      await dbOperations.updateUser(id, updatePayload);
    }

    const hasConfigUpdate =
      monitor_gold !== undefined ||
      monitor_silver !== undefined ||
      notify_mode !== undefined ||
      notify_modes !== undefined ||
      interval_hours !== undefined ||
      drop_threshold !== undefined ||
      price_threshold !== undefined;

    if (hasConfigUpdate) {
      if (!notifyModes.length) {
        return res.status(400).json({ error: "Notify mode required" });
      }

      if (!monitor_gold && !monitor_silver) {
        return res.status(400).json({ error: "At least one asset required" });
      }

      if (
        notifyModes.includes("interval") &&
        (interval_hours === null || interval_hours === undefined)
      ) {
        return res.status(400).json({ error: "Interval hours required" });
      }

      if (
        notifyModes.includes("drop") &&
        (drop_threshold === null || drop_threshold === undefined)
      ) {
        return res.status(400).json({ error: "Drop threshold required" });
      }

      if (
        notifyModes.includes("threshold") &&
        (price_threshold === null || price_threshold === undefined)
      ) {
        return res.status(400).json({ error: "Price threshold required" });
      }

      await dbOperations.createOrUpdateUserConfig(id, {
        monitor_gold,
        monitor_silver,
        notify_mode: notifyModes.join(","),
        interval_hours: notifyModes.includes("interval")
          ? interval_hours
          : null,
        drop_threshold: notifyModes.includes("drop") ? drop_threshold : null,
        price_threshold: notifyModes.includes("threshold")
          ? price_threshold
          : null,
      });
    }

    const updatedUser = await dbOperations.getUserById(id);

    res.json({
      id: updatedUser.id,
      user_id: updatedUser.user_id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      plan: updatedUser.plan,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除用户
app.delete(
  "/api/users/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      await dbOperations.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

app.post(
  "/api/admin/broadcast-email",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { subject, content } = req.body;
      if (!subject || !content) {
        return res.status(400).json({ error: "Subject and content required" });
      }

      const mailer = buildMailer();
      if (mailer.error) {
        return res.status(500).json({ error: mailer.error });
      }

      const users = await dbOperations.getAllUsers();
      const recipients = users
        .filter((u) => u.status === "active" && u.email && u.role !== "admin")
        .map((u) => u.email);

      if (!recipients.length) {
        return res.json({ total: 0, sent: 0, failed: 0, failures: [] });
      }

      let sent = 0;
      let failed = 0;
      const failures = [];

      for (const email of recipients) {
        try {
          await mailer.transporter.sendMail({
            from: mailer.from,
            to: email,
            subject,
            text: content,
          });
          sent += 1;
        } catch (error) {
          failed += 1;
          failures.push({ email, error: error.message });
        }
      }

      res.json({ total: recipients.length, sent, failed, failures });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ==================== 用户配置 API ====================

// 获取用户配置
app.get("/api/config", authenticateToken, async (req, res) => {
  try {
    const config = await dbOperations.getUserConfig(req.user.id);
    if (!config) {
      // 返回默认配置
      return res.json({
        monitor_gold: true,
        monitor_silver: false,
        notify_mode: "interval",
        notify_modes: ["interval"],
        interval_hours: 2,
        drop_threshold: 2.0,
        price_threshold: null,
      });
    }
    res.json({
      ...config,
      notify_modes: normalizeNotifyModes(config.notify_mode),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新用户配置
app.post("/api/config", authenticateToken, async (req, res) => {
  try {
    const {
      monitor_gold,
      monitor_silver,
      notify_mode,
      notify_modes,
      interval_hours,
      drop_threshold,
      price_threshold,
    } = req.body;
    const notifyModes = normalizeNotifyModes(notify_modes, notify_mode);

    if (!notifyModes.length) {
      return res.status(400).json({ error: "Notify mode required" });
    }

    if (!monitor_gold && !monitor_silver) {
      return res.status(400).json({ error: "At least one asset required" });
    }

    if (
      notifyModes.includes("interval") &&
      (interval_hours === null || interval_hours === undefined)
    ) {
      return res.status(400).json({ error: "Interval hours required" });
    }

    if (
      notifyModes.includes("drop") &&
      (drop_threshold === null || drop_threshold === undefined)
    ) {
      return res.status(400).json({ error: "Drop threshold required" });
    }

    if (
      notifyModes.includes("threshold") &&
      (price_threshold === null || price_threshold === undefined)
    ) {
      return res.status(400).json({ error: "Price threshold required" });
    }

    const config = await dbOperations.createOrUpdateUserConfig(req.user.id, {
      monitor_gold,
      monitor_silver,
      notify_mode: notifyModes.join(","),
      interval_hours: notifyModes.includes("interval") ? interval_hours : null,
      drop_threshold: notifyModes.includes("drop") ? drop_threshold : null,
      price_threshold: notifyModes.includes("threshold")
        ? price_threshold
        : null,
    });
    res.json({ ...config, notify_modes: notifyModes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 通知日志 API ====================

// 获取当前用户的通知日志
app.get("/api/logs", authenticateToken, async (req, res) => {
  try {
    const logs = await dbOperations.getUserNotificationLogs(req.user.id);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有通知日志 (管理员)
app.get("/api/logs/all", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await dbOperations.getAllNotificationLogs();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 创建通知日志
app.post("/api/logs", authenticateToken, async (req, res) => {
  try {
    const log = await dbOperations.createNotificationLog({
      user_id: req.user.id,
      ...req.body,
    });
    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== 管理员查询 API ====================

app.get(
  "/api/admin/user-info",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { email, userId } = req.query;
      const emailTrimmed = email ? String(email).trim() : undefined;

      if (!emailTrimmed && !userId) {
        return res.status(400).json({ error: "Email or userId required" });
      }

      const user = emailTrimmed
        ? await dbOperations.getUserByEmail(emailTrimmed)
        : await dbOperations.getUserById(userId);

      if (!user) {
        return res.json({
          found: false,
          user: null,
          config: {
            monitor_gold: true,
            monitor_silver: false,
            notify_mode: "interval",
            notify_modes: ["interval"],
            interval_hours: 2,
            drop_threshold: 2.0,
            price_threshold: null,
          },
          logs: [],
        });
      }

      const config = await dbOperations.getUserConfig(user.id);
      const logs = await dbOperations.getUserNotificationLogs(user.id);
      const notifyModes = normalizeNotifyModes(
        config?.notify_mode || "interval",
      );

      res.json({
        found: true,
        user: {
          id: user.id,
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          plan: user.plan,
          created_at: user.created_at,
        },
        config: config
          ? { ...config, notify_modes: notifyModes }
          : {
              monitor_gold: true,
              monitor_silver: false,
              notify_mode: "interval",
              notify_modes: ["interval"],
              interval_hours: 2,
              drop_threshold: 2.0,
              price_threshold: null,
            },
        logs,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ==================== 金价 API ====================

function parseSinaVarResponse(responseText) {
  const result = {};
  const matches = responseText.matchAll(
    /var\s+hq_str_([A-Za-z0-9_]+)="([^"]*)";/g,
  );
  for (const match of matches) {
    const symbol = match[1];
    const csv = match[2] || "";
    result[symbol] = csv ? csv.split(",") : [];
  }
  return result;
}

function buildHfResult(symbol, data) {
  const price = Number.parseFloat(data[0]) || 0;
  const change = Number.parseFloat(data[1]) || 0;
  const previousClose = Number.parseFloat(data[7]) || 0;
  const result = {
    symbol,
    name: data[13] || symbol,
    price,
    change,
    bid: Number.parseFloat(data[2]) || 0,
    ask: Number.parseFloat(data[3]) || 0,
    high: Number.parseFloat(data[4]) || 0,
    low: Number.parseFloat(data[5]) || 0,
    time: data[6] || "",
    previousClose,
    open: Number.parseFloat(data[8]) || 0,
    openInterest: Number.parseInt(data[9], 10) || 0,
    bidVolume: Number.parseInt(data[10], 10) || 0,
    askVolume: Number.parseInt(data[11], 10) || 0,
    date: data[12] || "",
    volume: Number.parseInt(data[14], 10) || 0,
  };

  if (previousClose > 0) {
    result.changePercent = (
      ((price - previousClose) / previousClose) *
      100
    ).toFixed(2);
  } else {
    result.changePercent = "0.00";
  }

  return result;
}

function buildCnResult(symbol, data) {
  const price = Number.parseFloat(data[2]) || 0;
  const previousClose = Number.parseFloat(data[3]) || 0;
  const change = price - previousClose;
  const dateFromAny = (data || []).find(
    (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
  );
  const result = {
    symbol,
    name: data[0] || symbol,
    price,
    change,
    previousClose,
    open: Number.parseFloat(data[4]) || 0,
    high: Number.parseFloat(data[6]) || 0,
    low: Number.parseFloat(data[5]) || 0,
    bid: Number.parseFloat(data[7]) || 0,
    ask: Number.parseFloat(data[8]) || 0,
    openInterest: Number.parseInt(data[9], 10) || 0,
    volume: Number.parseFloat(data[10]) || 0,
    bidVolume: Number.parseInt(data[11], 10) || 0,
    askVolume: Number.parseInt(data[12], 10) || 0,
    date: dateFromAny || data[13] || "",
    time: data[1] || "",
    limitUp: Number.parseFloat(data[14]) || 0,
    limitDown: Number.parseFloat(data[15]) || 0,
  };

  if (previousClose > 0) {
    result.changePercent = ((change / previousClose) * 100).toFixed(2);
  } else {
    result.changePercent = "0.00";
  }

  return result;
}

function buildNfResult(symbol, data) {
  // Format: Name, Time, Open, High, Low, LastClose, Bid, Ask, Price, ...
  // Index 8 is Current Price
  // Index 17 is Date
  const price = Number.parseFloat(data[8]) || 0;
  const previousClose = Number.parseFloat(data[10]) || Number.parseFloat(data[5]) || 0; // Index 10 is usually Settle/PrevClose? Index 5 is LastClose?
  // Let's assume index 10 is previous settlement
  const result = {
    symbol,
    name: data[0] || symbol,
    price,
    change: price - previousClose,
    previousClose,
    open: Number.parseFloat(data[2]) || 0,
    high: Number.parseFloat(data[3]) || 0,
    low: Number.parseFloat(data[4]) || 0,
    bid: Number.parseFloat(data[6]) || 0,
    ask: Number.parseFloat(data[7]) || 0,
    time: data[1] || "",
    date: data[17] || new Date().toISOString().split('T')[0],
  };

  if (previousClose > 0) {
    result.changePercent = ((result.change / previousClose) * 100).toFixed(2);
  } else {
    result.changePercent = "0.00";
  }
  return result;
}

function buildSinaPricesPayload(rawMap, fetchedAt) {
  const symbols = Object.keys(rawMap);
  const parsed = {};

  for (const symbol of symbols) {
    const data = rawMap[symbol] || [];
    if (symbol.startsWith("nf_")) {
      parsed[symbol] = buildNfResult(symbol, data);
    } else if (symbol.startsWith("hf_")) {
      parsed[symbol] = buildHfResult(symbol, data);
    } else {
      parsed[symbol] = buildCnResult(symbol, data);
    }
  }

  return {
    fetched_at: fetchedAt,
    source: "sina",
    api_key_present: Boolean(SINA_API_KEY),
    symbols: parsed,
  };
}

function isSinaEmptyData(data) {
  return !data || data.length === 0 || (data.length === 1 && data[0] === "");
}

function parseSinaSymbol(rawMap, symbol) {
  const data = rawMap[symbol] || [];
  if (isSinaEmptyData(data)) return null;
  if (symbol.startsWith("nf_")) return buildNfResult(symbol, data);
  if (symbol.startsWith("hf_")) return buildHfResult(symbol, data);
  return buildCnResult(symbol, data);
}

function buildCategorizedPricesPayload(rawMap, fetchedAt) {
  // 1. Benchmark: Domestic Futures (nf_AU0)
  // Fallback to International (hf_GC or hf_XAU)
  const domesticGold = parseSinaSymbol(rawMap, "nf_AU0");
  let benchmarkGold = null;

  if (domesticGold && domesticGold.price > 0) {
    benchmarkGold = {
      ...domesticGold,
      label: "国内基准(期货)",
      unit: "元/克",
      anchor: "上海黄金交易所(主力)",
      proxy_symbol: "nf_AU0"
    };
  } else {
    // Fallback: International
    const globalGold = parseSinaSymbol(rawMap, "hf_GC") || parseSinaSymbol(rawMap, "hf_XAU");
    if (globalGold) {
      benchmarkGold = {
        ...globalGold,
        price: (globalGold.price * 7.2 / 31.1035).toFixed(2), // Rough estimate
        label: "国际金价折算",
        unit: "元/克",
        anchor: "国际现货折算",
        proxy_symbol: globalGold.symbol
      };
    }
  }

  // 2. Silver: Domestic Futures (nf_AG0)
  const domesticSilver = parseSinaSymbol(rawMap, "nf_AG0");
  let anchorSilver = null;
  
  if (domesticSilver && domesticSilver.price > 0) {
    // Convert kg to g
    anchorSilver = {
      ...domesticSilver,
      price: (domesticSilver.price / 1000).toFixed(2),
      label: "国内白银",
      unit: "元/克",
      anchor: "上海白银(主力)",
      proxy_symbol: "nf_AG0"
    };
  } else {
      // Fallback: International Silver
      const globalSilver = parseSinaSymbol(rawMap, "hf_SI") || parseSinaSymbol(rawMap, "hf_XAG");
      if (globalSilver) {
        anchorSilver = {
          ...globalSilver,
          price: (globalSilver.price * 7.2 / 31.1035).toFixed(2),
          label: "国际白银折算",
          unit: "元/克",
          anchor: "国际现货折算",
          proxy_symbol: globalSilver.symbol
        };
      }
  }

  // 3. Savings Gold (Disabled)
  const savings = {};
  
  // Try to parse g_icbc, fallback to g_ccb, then g_boc
  /*
  const icbc = parseSinaSymbol(rawMap, "g_icbc");
  const ccb = parseSinaSymbol(rawMap, "g_ccb");
  const boc = parseSinaSymbol(rawMap, "g_boc");

  if (icbc && icbc.price > 0) {
    savings.g_icbc = { ...icbc, label: "积存金(工行)", unit: "元/克", anchor: "工行API" };
  } else if (ccb && ccb.price > 0) {
    savings.g_ccb = { ...ccb, label: "积存金(建行)", unit: "元/克", anchor: "建行API" };
  } else if (boc && boc.price > 0) {
    savings.g_boc = { ...boc, label: "积存金(中行)", unit: "元/克", anchor: "中行API" };
  }
  */

  // 4. Physical Gold (Au99.99)
  // Since direct Au99.99 symbol is often empty, we use Huaan Gold ETF (sh518880) as a proxy for physical gold price.
  // sh518880 tracks Au99.99 closely, unit price is usually ~1/100 of 1g gold.
  const huaanEtf = parseSinaSymbol(rawMap, "sh518880");
  let jewelry = null;
  
  if (huaanEtf && huaanEtf.price > 0) {
    jewelry = {
      ...huaanEtf,
      price: (huaanEtf.price * 100).toFixed(2), // Convert to per gram
      changePercent: huaanEtf.changePercent,
      label: "实物黄金(Au99.99)",
      unit: "元/克",
      anchor: "华安黄金ETF(sh518880)",
      proxy_symbol: "sh518880"
    };
  }

  return {
    fetched_at: fetchedAt,
    source: "sina",
    gold: {
      benchmark: benchmarkGold,
      savings,
      jewelry,
    },
    silver: {
      anchor: anchorSilver,
    },
    unavailable: [],
  };
}

function fetchSinaFuturesQuotes(symbols) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "hq.sinajs.cn",
      path: `/list=${String(symbols || "").replace(/\s+/g, "")}`,
      method: "GET",
      headers: {
        Accept: "*/*",
        Referer: "https://finance.sina.com.cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    };

    const request = https.request(options, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        resolve(data);
      });
    });

    request.on("error", (error) => {
      reject(error);
    });

    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error("Request timeout"));
    });

    request.end();
  });
}

// 获取金价
app.get("/api/gold-prices", async (req, res) => {
  try {
    const fetchedAt = new Date().toISOString();
    const responseText = await fetchSinaFuturesQuotes(SINA_FUTURES_SYMBOLS);
    const rawMap = parseSinaVarResponse(responseText);
    const payload = buildCategorizedPricesPayload(rawMap, fetchedAt);
    await dbOperations.savePriceCache("sina", "all", payload);
    res.json(payload);
  } catch (error) {
    console.error("Error fetching gold prices:", error);
    res.status(500).json({ error: error.message });
  }
});

function isQuietHours(now) {
  const hour = now.getHours();
  return hour >= 23 || hour < 7;
}

function parseLogTime(row) {
  const raw = row?.sent_at || row?.created_at;
  const value = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function getGoldCategories(prices) {
  const categories = [];

  if (prices?.gold?.benchmark) {
    categories.push({
      key: "benchmark",
      label: "基准金价",
      value: prices.gold.benchmark,
    });
  }

  const savingsLabels = {
    g_ccb: "积存金(建行)",
    g_boc: "积存金(中行)",
    g_icbc: "积存金(工行)",
    g_chowtaifook: "周大福(首饰金)",
    sh518880: "实物黄金(Au99.99)"
  };

  const savingsMap = prices?.gold?.savings || {};
  for (const symbol of Object.keys(savingsMap)) {
    const item = savingsMap[symbol];
    if (!item) continue;
    categories.push({
      key: symbol,
      label: savingsLabels[symbol] || `积存金(${symbol})`,
      value: item,
    });
  }

  if (prices?.gold?.jewelry) {
    categories.push({
      key: "jewelry",
      label: prices.gold.jewelry.label || "实物黄金(Au99.99)",
      value: prices.gold.jewelry,
    });
  }

  return categories;
}

function pickMinPrice(categories) {
  let picked = null;
  for (const item of categories) {
    const price = Number(item?.value?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!picked || price < picked.price) {
      picked = { ...item, price };
    }
  }
  return picked;
}

function pickMaxAbsChange(categories) {
  let picked = null;
  for (const item of categories) {
    const changePercent = Number.parseFloat(item?.value?.changePercent);
    if (!Number.isFinite(changePercent)) continue;
    const absValue = Math.abs(changePercent);
    if (!picked || absValue > picked.absValue) {
      picked = { ...item, changePercent, absValue };
    }
  }
  return picked;
}

async function canSendByDirectionLimit(userId, asset, mode, direction, nowMs) {
  const last = await dbOperations.getLatestSentNotificationLogByContentLike(
    userId,
    asset,
    mode,
    `%dir=${direction}%`,
  );
  if (!last) return true;
  const lastMs = parseLogTime(last);
  if (!lastMs) return true;
  return nowMs - lastMs >= 30 * 60 * 1000;
}

async function sendAlertEmail(mailer, to, subject, html) {
  await mailer.transporter.sendMail({
    from: mailer.from,
    to,
    subject,
    html,
  });
}

// 核心通知逻辑 (支持Mock数据)
async function runPriceNotificationsOnce(
  mockNow = null,
  mockPrices = null,
  targetUserId = null,
) {
  const mailer = buildMailer();
  if (mailer.error) return { error: mailer.error };

  const now = mockNow ? new Date(mockNow) : new Date();
  try {
    await dbOperations.expireOverdueActiveUsers();
  } catch (e) {
    console.error("Expire users failed:", e);
  }
  // Mock模式下不检查静默时间，或者由调用方决定
  if (!mockNow) {
    if (isQuietHours(now)) return { skipped: "quiet_hours" };
    
    // Check for Weekend (Saturday=6, Sunday=0)
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`Skipping notifications: Weekend (Day ${dayOfWeek})`);
      return { skipped: "weekend" };
    }
  }

  const nowMs = now.getTime();
  const fetchedAt = now.toISOString();

  let prices;
  if (mockPrices) {
    prices = mockPrices;
  } else {
    try {
      const responseText = await fetchSinaFuturesQuotes(SINA_FUTURES_SYMBOLS);
      const rawMap = parseSinaVarResponse(responseText);
      prices = buildCategorizedPricesPayload(rawMap, fetchedAt);
      await dbOperations.savePriceCache("sina", "all", prices);
    } catch (e) {
      console.error("Fetch prices failed:", e);
      return { error: e.message };
    }
  }

  const users = await dbOperations.getAllUsers();
  const logs = [];

  for (const user of users) {
    if (targetUserId && user.id !== Number(targetUserId)) continue;
    if (!user?.email) continue;
    if (user.status !== "active") continue;
    if (user.role === "admin") continue;

    const config = await dbOperations.getUserConfig(user.id);
    if (!config) continue;

    const notifyModes = normalizeNotifyModes(config.notify_mode);
    if (!notifyModes.length) continue;

    const cycleHours = Number.isFinite(Number(config.interval_hours))
      ? Number(config.interval_hours)
      : 2;

    // 计算当前周期窗口起始时间 (Clock Aligned)
    const currentHour = now.getHours();
    const windowStartHour = currentHour - (currentHour % cycleHours);
    const windowStartDate = new Date(now);
    windowStartDate.setHours(windowStartHour, 0, 0, 0);
    const windowStartTime = windowStartDate.getTime();
    const cycleWindowMs = cycleHours * 60 * 60 * 1000;

    // 1. 定时播报逻辑
    if (notifyModes.includes("interval")) {
      const lastIntervalLog = await dbOperations.getLatestSentNotificationLog(
        user.id,
        "all",
        "interval",
      );
      const lastSentTime = parseLogTime(lastIntervalLog);

      // 如果当前是周期的起始小时 (例如间隔2小时，当前是12点)，并且本周期没发过
      const isCycleHour = currentHour % cycleHours === 0;
      // 允许5分钟的误差 (防止定时任务稍微延迟)
      // 如果是Mock模式，不检查分钟
      const isOnHour = mockNow ? true : now.getMinutes() < 5;

      const hasSentInWindow =
        lastSentTime && lastSentTime >= windowStartTime && lastSentTime < windowStartTime + cycleWindowMs;

      // 规则：只要在当前窗口内没发过，且现在是窗口的起始时段（或模拟模式），就发送
      if (isCycleHour && isOnHour && !hasSentInWindow) {
        const goldCategories = getGoldCategories(prices);
        const benchmark = goldCategories.find(c => c.key === 'benchmark');
        // Savings Gold removed
        const savings = null; 
        const jewelry = goldCategories.find(c => c.key === 'jewelry');

        const silver = prices?.silver?.anchor;
        const silverPrice = Number(silver?.price);
        const normalizedSilverPrice = silverPrice;

        const html = generateIntervalHtml({
          benchmarkGold: benchmark ? { price: benchmark.value.price, label: benchmark.label, changePercent: benchmark.value.changePercent } : null,
          savingsGold: savings ? { price: savings.value.price, label: savings.label, changePercent: savings.value.changePercent } : null,
          jewelryGold: jewelry ? { price: jewelry.value.price, label: jewelry.label, changePercent: jewelry.value.changePercent } : null,
          silver: silver
            ? { ...silver, price: normalizedSilverPrice.toFixed(2) }
            : null,
          time: fetchedAt,
          interval: cycleHours,
        });

        try {
          await sendAlertEmail(
            mailer,
            user.email,
            `【定时播报】黄金/白银最新行情`,
            html,
          );
          await dbOperations.createNotificationLog({
            user_id: user.id,
            asset: "all",
            mode: "interval",
            status: "sent",
            content: `interval=${cycleHours};fetched_at=${fetchedAt};html_preview=${encodeURIComponent(html.slice(0, 500))}...`,
            sent_at: fetchedAt,
            html_content: html 
          });
          logs.push({ user: user.email, type: "interval", status: "sent" });
        } catch (error) {
          await dbOperations.createNotificationLog({
            user_id: user.id,
            asset: "all",
            mode: "interval",
            status: "failed",
            content: `interval=${cycleHours};error=${error.message}`,
            sent_at: fetchedAt,
          });
          logs.push({
            user: user.email,
            type: "interval",
            status: "failed",
            error: error.message,
          });
        }
      }
    }

    const thresholdValue = Number(config.price_threshold);
    const dropValue = Number(config.drop_threshold);

    // 2. 阈值告警逻辑
    if (notifyModes.includes("threshold") && Number.isFinite(thresholdValue)) {
      if (config.monitor_gold) {
        const goldCategories = getGoldCategories(prices);
        const triggered = goldCategories.filter(
          (c) => Number(c?.value?.price) <= thresholdValue,
        );

        if (triggered.length) {
          const lastGoldThreshold =
            await dbOperations.getLatestSentNotificationLog(
              user.id,
              "gold",
              "threshold",
            );
          const lastSentTime = parseLogTime(lastGoldThreshold);
          
          // 周期内去重: 检查最后一次发送是否在当前窗口内
          // 逻辑修正：如果上次发送时间 >= 本窗口起始时间，说明本窗口已经发过了
          const hasSentInWindow = lastSentTime && lastSentTime >= windowStartTime;
          
          const canSendDirection = await canSendByDirectionLimit(
            user.id,
            "gold",
            "threshold",
            "down",
            nowMs,
          );

          if (!hasSentInWindow && canSendDirection) {
            const picked = pickMinPrice(triggered);
            if (picked) {
              const html = generateThresholdHtml({
                asset: "gold",
                label: picked.label,
                price: picked.price,
                threshold: thresholdValue,
                time: fetchedAt,
                direction: "down",
              });
              try {
                await sendAlertEmail(
                  mailer,
                  user.email,
                  `【黄金阈值提醒】已达到 ${thresholdValue} 元/克`,
                  html,
                );
                await dbOperations.createNotificationLog({
                  user_id: user.id,
                  asset: "gold",
                  mode: "threshold",
                  status: "sent",
                  content: `dir=down;category=${picked.key};label=${picked.label};price=${picked.price};threshold=${thresholdValue};fetched_at=${fetchedAt}`,
                  sent_at: fetchedAt,
                  html_content: html
                });
                logs.push({
                  user: user.email,
                  type: "threshold-gold",
                  status: "sent",
                });
              } catch (error) {
                await dbOperations.createNotificationLog({
                  user_id: user.id,
                  asset: "gold",
                  mode: "threshold",
                  status: "failed",
                  content: `dir=down;category=${picked.key};label=${picked.label};price=${picked.price};threshold=${thresholdValue};error=${error.message}`,
                  sent_at: fetchedAt,
                });
                logs.push({
                  user: user.email,
                  type: "threshold-gold",
                  status: "failed",
                  error: error.message,
                });
              }
            }
          }
        }
      }

      if (config.monitor_silver) {
        const silver = prices?.silver?.anchor;
        const silverPrice = Number(silver?.price);
        const normalizedSilverPrice = silverPrice;
        if (
          Number.isFinite(normalizedSilverPrice) &&
          normalizedSilverPrice <= thresholdValue
        ) {
          const lastSilverThreshold =
            await dbOperations.getLatestSentNotificationLog(
              user.id,
              "silver",
              "threshold",
            );
          const lastSentTime = parseLogTime(lastSilverThreshold);
          const hasSentInWindow = lastSentTime && lastSentTime >= windowStartTime;

          const canSendDirection = await canSendByDirectionLimit(
            user.id,
            "silver",
            "threshold",
            "down",
            nowMs,
          );

          if (!hasSentInWindow && canSendDirection) {
            const html = generateThresholdHtml({
              asset: "silver",
              label: "白银",
              price: normalizedSilverPrice,
              threshold: thresholdValue,
              time: fetchedAt,
              direction: "down",
            });
            try {
              await sendAlertEmail(
                mailer,
                user.email,
                `【白银阈值提醒】已达到 ${thresholdValue} 元/克`,
                html,
              );
              await dbOperations.createNotificationLog({
                user_id: user.id,
                asset: "silver",
                mode: "threshold",
                status: "sent",
                content: `dir=down;category=anchor;label=白银;price=${normalizedSilverPrice};threshold=${thresholdValue};fetched_at=${fetchedAt}`,
                sent_at: fetchedAt,
                html_content: html
              });
              logs.push({
                user: user.email,
                type: "threshold-silver",
                status: "sent",
              });
            } catch (error) {
              await dbOperations.createNotificationLog({
                user_id: user.id,
                asset: "silver",
                mode: "threshold",
                status: "failed",
                content: `dir=down;category=anchor;label=白银;price=${normalizedSilverPrice};threshold=${thresholdValue};error=${error.message}`,
                sent_at: fetchedAt,
              });
              logs.push({
                user: user.email,
                type: "threshold-silver",
                status: "failed",
                error: error.message,
              });
            }
          }
        }
      }
    }

    // 3. 价格剧烈波动逻辑
    if (
      notifyModes.includes("drop") &&
      Number.isFinite(dropValue) &&
      dropValue > 0
    ) {
      if (config.monitor_gold) {
        const goldCategories = getGoldCategories(prices);
        const picked = pickMaxAbsChange(goldCategories);
        if (picked && picked.absValue >= dropValue) {
          const direction = picked.changePercent >= 0 ? "up" : "down";
          const canSendDirection = await canSendByDirectionLimit(
            user.id,
            "gold",
            "drop",
            direction,
            nowMs,
          );
          if (canSendDirection) {
            const html = generateDropHtml({
              asset: "gold",
              label: picked.label,
              price: picked.value?.price,
              changePercent: picked.changePercent,
              threshold: dropValue,
              time: fetchedAt,
              direction,
            });
            try {
              await sendAlertEmail(
                mailer,
                user.email,
                `【黄金价格变动】${picked.label} ${picked.changePercent}%`,
                html,
              );
              await dbOperations.createNotificationLog({
                user_id: user.id,
                asset: "gold",
                mode: "drop",
                status: "sent",
                content: `dir=${direction};category=${picked.key};label=${picked.label};change_percent=${picked.changePercent};threshold=${dropValue};fetched_at=${fetchedAt}`,
                sent_at: fetchedAt,
                html_content: html
              });
              logs.push({
                user: user.email,
                type: "drop-gold",
                status: "sent",
              });
            } catch (error) {
              await dbOperations.createNotificationLog({
                user_id: user.id,
                asset: "gold",
                mode: "drop",
                status: "failed",
                content: `dir=${direction};category=${picked.key};label=${picked.label};change_percent=${picked.changePercent};threshold=${dropValue};error=${error.message}`,
                sent_at: fetchedAt,
              });
              logs.push({
                user: user.email,
                type: "drop-gold",
                status: "failed",
                error: error.message,
              });
            }
          }
        }
      }

      if (config.monitor_silver) {
        const silver = prices?.silver?.anchor;
        const changePercent = Number.parseFloat(silver?.changePercent);
        if (
          Number.isFinite(changePercent) &&
          Math.abs(changePercent) >= dropValue
        ) {
          const direction = changePercent >= 0 ? "up" : "down";
          const canSendDirection = await canSendByDirectionLimit(
            user.id,
            "silver",
            "drop",
            direction,
            nowMs,
          );
          if (canSendDirection) {
            const html = generateDropHtml({
              asset: "silver",
              label: "白银",
              price: silver?.price,
              changePercent: changePercent,
              threshold: dropValue,
              time: fetchedAt,
              direction,
            });
            try {
              await sendAlertEmail(
                mailer,
                user.email,
                `【白银价格变动】${changePercent}%`,
                html,
              );
              await dbOperations.createNotificationLog({
                user_id: user.id,
                asset: "silver",
                mode: "drop",
                status: "sent",
                content: `dir=${direction};category=anchor;label=白银;change_percent=${changePercent};threshold=${dropValue};fetched_at=${fetchedAt}`,
                sent_at: fetchedAt,
                html_content: html
              });
              logs.push({
                user: user.email,
                type: "drop-silver",
                status: "sent",
              });
            } catch (error) {
              await dbOperations.createNotificationLog({
                user_id: user.id,
                asset: "silver",
                mode: "drop",
                status: "failed",
                content: `dir=${direction};category=anchor;label=白银;change_percent=${changePercent};threshold=${dropValue};error=${error.message}`,
                sent_at: fetchedAt,
              });
              logs.push({
                user: user.email,
                type: "drop-silver",
                status: "failed",
                error: error.message,
              });
            }
          }
        }
      }
    }
  }

  return { logs };
}

// 模拟触发API (Debug)
app.post(
  "/api/debug/simulate-trigger",
  authenticateToken,
  async (req, res) => {
    try {
      const { mockTime, mockGoldPrice, mockSilverPrice, targetEmail } = req.body;
      
      let targetUserId = null;
      if (targetEmail) {
        const u = await dbOperations.getUserByEmail(targetEmail);
        if (u) targetUserId = u.id;
      } else {
        targetUserId = req.user.id;
      }

      const mockPrices = mockGoldPrice || mockSilverPrice ? {
        fetched_at: new Date().toISOString(),
        source: "mock",
        gold: {
          benchmark: { price: mockGoldPrice || 600, changePercent: -1.5, label: '基准金价' },
          savings: { g_icbc: { price: mockGoldPrice || 600, changePercent: -1.5, label: '积存金(工行)' } },
          jewelry: null
        },
        silver: {
          anchor: { price: mockSilverPrice || 7, changePercent: 2.0, label: '白银' }
        }
      } : null;

      const result = await runPriceNotificationsOnce(mockTime, mockPrices, targetUserId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

let priceNotificationRunning = false;

setInterval(async () => {
  if (priceNotificationRunning) return;
  priceNotificationRunning = true;
  try {
    await runPriceNotificationsOnce();
  } catch (error) {
    console.error("Price notification loop failed:", error);
  } finally {
    priceNotificationRunning = false;
  }
}, 60 * 1000);

// ==================== 统计 API ====================

// 获取统计数据
app.get("/api/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await dbOperations.getAllUsers();
    const logs = await dbOperations.getAllNotificationLogs(1000);

    const today = new Date().toISOString().split("T")[0];

    res.json({
      total: users.length,
      active: users.filter((u) => u.status === "active").length,
      monitoring: users.filter((u) => u.status === "active").length,
      sentToday: logs.filter((l) => l.sent_at && l.sent_at.startsWith(today))
        .length,
      pending: logs.filter((l) => l.status === "pending").length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log("Available endpoints:");
  console.log("  POST /api/auth/login");
  console.log("  GET  /api/auth/me");
  console.log("  GET  /api/users");
  console.log("  POST /api/users");
  console.log("  PUT  /api/users/:id");
  console.log("  DELETE /api/users/:id");
  console.log("  GET  /api/config");
  console.log("  POST /api/config");
  console.log("  GET  /api/logs");
  console.log("  GET  /api/logs/all");
  console.log("  GET  /api/gold-prices");
  console.log("  GET  /api/stats");
});

module.exports = app;
