// src/data/repository.js
// Single data access layer. Today: localStorage. Later: swap to HTTP/.NET/SQL Server.

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function generateManifestNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const rand = Math.floor(100 + Math.random() * 900);
  return `TRF-${y}${m}${day}-${hh}${mm}${ss}-${rand}`;
}

export const repo = {
  // ---------- Masters (temporary local demo) ----------
  listBranches() {
    return [
      { branchId: "BR001", branchName: "Sam Levy Branch" },
      { branchId: "BR002", branchName: "Westgate Branch" },
      { branchId: "BR003", branchName: "CBD Branch" },
    ];
  },

  listCertificateTypes() {
    return [{ certTypeId: "ZINARA_LICENSE", name: "ZINARA License" }];
  },

  // ---------- Step 2: HQ Capture ----------
  captureToHqStock({ certTypeId, batchId, certificateNumber, method = "MANUAL_OR_MOCK" }) {
    const num = (certificateNumber ?? "").trim();
    if (!num) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Certificate Number is required.";
      throw err;
    }

    const key = "zinara.captures";
    const arr = loadJson(key, []);

    const exists = arr.some(
      (x) => (x.certificateNumber ?? "").toLowerCase() === num.toLowerCase()
    );
    if (exists) {
      const err = new Error("DUPLICATE_CERTIFICATE");
      err.message = `Duplicate certificate number: ${num}`;
      throw err;
    }

    arr.unshift({
      certType: certTypeId,
      batchId: (batchId ?? "").trim() || null,
      certificateNumber: num,
      capturedAt: nowIso(),
      captureMethod: method,

      // Stock control fields
      status: "HQ_STOCK",
      currentOwnerType: "HQ",
      currentOwnerId: "HQ",
      manifestNo: null,
      lastMovementAt: null,

      // Issuance fields (future)
      issuedAt: null,
      issuedToClientName: null,
      issuedPolicyNumber: null,
      issuedByUserId: null,
    });

    saveJson(key, arr);
        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "CAPTURE",
      actorId: "HQ_USER", // UI can pass real user later
      actorRole: "HQ",
      entityType: "CERTIFICATE",
      entityId: num,
      details: {
        certType: certTypeId,
        batchId: (batchId ?? "").trim() || null,
        status: "HQ_STOCK",
      },
    });

    return { ok: true, certificateNumber: num };
  },

  // For Step 3 snapshot
  getHqAvailableStockCount({ certTypeId }) {
    const captures = loadJson("zinara.captures", []);
    return captures.filter((c) => c.certType === certTypeId && c.status === "HQ_STOCK").length;
  },

  // ---------- Step 3: HQ Create Transfer ----------
  createTransferSequential({ branchId, certTypeId, quantity, note }) {
    const qty = Number(quantity);
    if (!branchId || !certTypeId || !Number.isFinite(qty) || qty <= 0) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Branch, Certificate Type and Quantity are required.";
      throw err;
    }

    const captures = loadJson("zinara.captures", []);
    const free = captures
      .map((c, idx) => ({ c, idx }))
      .filter((x) => x.c.certType === certTypeId && x.c.status === "HQ_STOCK");

    if (free.length < qty) {
      const err = new Error("INSUFFICIENT_STOCK");
      err.message = `Not enough HQ stock. Available: ${free.length}, requested: ${qty}.`;
      throw err;
    }

    // Current "sequential" approach: oldest captured first
    const ordered = free.sort((a, b) => {
      const ta = new Date(a.c.capturedAt ?? 0).getTime();
      const tb = new Date(b.c.capturedAt ?? 0).getTime();
      return ta - tb;
    });

    const selected = ordered.slice(0, qty);
    const manifestNo = generateManifestNo();
    const now = nowIso();

    // Mark captures as IN_TRANSIT
    const updated = [...captures];
    selected.forEach(({ idx }) => {
      updated[idx] = {
        ...updated[idx],
        status: "IN_TRANSIT",
        currentOwnerType: "BRANCH",
        currentOwnerId: branchId,
        manifestNo,
        lastMovementAt: now,
      };
    });
    saveJson("zinara.captures", updated);

    // Create transfer record
    const branches = this.listBranches();
    const branch = branches.find((b) => b.branchId === branchId);

    const transfers = loadJson("zinara.transfers", []);
    const transfer = {
      transferId: manifestNo,
      manifestNo,
      from: { locationType: "HQ", locationId: "HQ", locationName: "HQ" },
      to: {
        locationType: "BRANCH",
        locationId: branchId,
        locationName: branch?.branchName ?? branchId,
      },
      certType: certTypeId,
      quantity: qty,
      certificateNumbers: selected.map((x) => x.c.certificateNumber),
      status: "SENT",
      note: (note ?? "").trim() || null,
      createdAt: now,
      receivedAt: null,
    };

    transfers.unshift(transfer);
    saveJson("zinara.transfers", transfers);
        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "TRANSFER_CREATE",
      actorId: "HQ_USER",
      actorRole: "HQ",
      entityType: "TRANSFER",
      entityId: manifestNo,
      details: {
        toBranchId: branchId,
        certType: certTypeId,
        quantity: qty,
        certificateNumbers: selected.map((x) => x.c.certificateNumber),
        note: (note ?? "").trim() || null,
      },
    });


    return transfer;
  },

  // ---------- Step 4: Branch Incoming + Accept ----------
  listTransfersForBranch({ branchId }) {
    const all = loadJson("zinara.transfers", []);
    return all.filter((t) => t?.to?.locationId === branchId);
  },

  acceptTransfer({ transferId, branchId }) {
    if (!transferId || !branchId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "transferId and branchId are required.";
      throw err;
    }

    const transfers = loadJson("zinara.transfers", []);
    const idx = transfers.findIndex((t) => t.transferId === transferId);
    if (idx < 0) {
      const err = new Error("TRANSFER_NOT_FOUND");
      err.message = "Transfer not found.";
      throw err;
    }

    const t = transfers[idx];
    if (t.status !== "SENT") {
      const err = new Error("INVALID_STATE");
      err.message = `Transfer cannot be accepted in status: ${t.status}`;
      throw err;
    }

    const now = nowIso();
    transfers[idx] = { ...t, status: "RECEIVED", receivedAt: now };
    saveJson("zinara.transfers", transfers);

    // Move certs to BRANCH_STOCK
    const nums = new Set(t.certificateNumbers ?? []);
    const captures = loadJson("zinara.captures", []);
    const updatedCaptures = captures.map((c) => {
      if (nums.has(c.certificateNumber) && c.status === "IN_TRANSIT") {
        return {
          ...c,
          status: "BRANCH_STOCK",
          currentOwnerType: "BRANCH",
          currentOwnerId: branchId,
          lastMovementAt: now,
        };
      }
      return c;
    });

    saveJson("zinara.captures", updatedCaptures);
        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "TRANSFER_ACCEPT",
      actorId: branchId,
      actorRole: "BRANCH",
      entityType: "TRANSFER",
      entityId: transferId,
      details: { branchId, manifestNo: t.manifestNo, quantity: t.quantity },
    });

    return { ok: true };
  },

    // ---------- Step 5: Branch Issue Certificate ----------
  getBranchAvailableStockCount({ branchId, certTypeId }) {
    const captures = loadJson("zinara.captures", []);
    return captures.filter(
      (c) =>
        c.certType === certTypeId &&
        c.status === "BRANCH_STOCK" &&
        c.currentOwnerId === branchId
    ).length;
  },

  listBranchAvailableCertificates({ branchId, certTypeId, limit = 200 }) {
    const captures = loadJson("zinara.captures", []);
    return captures
      .filter(
        (c) =>
          c.certType === certTypeId &&
          c.status === "BRANCH_STOCK" &&
          c.currentOwnerId === branchId
      )
      // default ordering: oldest stock first (FIFO). Later: true numeric sequence.
      .sort((a, b) => new Date(a.lastMovementAt ?? 0) - new Date(b.lastMovementAt ?? 0))
      .slice(0, limit);
  },

  issueNextCertificate({ branchId, certTypeId, clientName, policyNumber, issuedByUserId }) {
    const name = (clientName ?? "").trim();
    const policy = (policyNumber ?? "").trim();

    if (!branchId || !certTypeId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Branch and Certificate Type are required.";
      throw err;
    }
    if (!name) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Client Name is required.";
      throw err;
    }
    if (!policy) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Policy Number is required.";
      throw err;
    }

    const captures = loadJson("zinara.captures", []);
    const available = captures
      .map((c, idx) => ({ c, idx }))
      .filter(
        (x) =>
          x.c.certType === certTypeId &&
          x.c.status === "BRANCH_STOCK" &&
          x.c.currentOwnerId === branchId
      )
      .sort((a, b) => new Date(a.c.lastMovementAt ?? 0) - new Date(b.c.lastMovementAt ?? 0));

    if (available.length === 0) {
      const err = new Error("NO_STOCK");
      err.message = "No available certificates in branch stock.";
      throw err;
    }

    const pick = available[0]; // "next" (FIFO for now)
    const now = nowIso();

    const updated = [...captures];
    updated[pick.idx] = {
      ...updated[pick.idx],
      status: "ISSUED",
      issuedAt: now,
      issuedToClientName: name,
      issuedPolicyNumber: policy,
      issuedByUserId: issuedByUserId ?? null,
      lastMovementAt: now,
    };

    saveJson("zinara.captures", updated);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "ISSUE",
      actorId: issuedByUserId ?? branchId,
      actorRole: "BRANCH",
      entityType: "CERTIFICATE",
      entityId: updated[pick.idx].certificateNumber,
      details: {
        branchId,
        certType: certTypeId,
        clientName: name,
        policyNumber: policy,
        mode: "AUTO",
      },
    });


    return {
      ok: true,
      certificateNumber: updated[pick.idx].certificateNumber,
      issuedAt: now,
    };
  },

  issueSpecificCertificate({
    branchId,
    certificateNumber,
    clientName,
    policyNumber,
    issuedByUserId,
  }) {
    const num = (certificateNumber ?? "").trim();
    const name = (clientName ?? "").trim();
    const policy = (policyNumber ?? "").trim();

    if (!branchId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Branch is required.";
      throw err;
    }
    if (!num) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Certificate Number is required.";
      throw err;
    }
    if (!name) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Client Name is required.";
      throw err;
    }
    if (!policy) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Policy Number is required.";
      throw err;
    }

    const captures = loadJson("zinara.captures", []);
    const idx = captures.findIndex(
      (c) =>
        (c.certificateNumber ?? "").toLowerCase() === num.toLowerCase() &&
        c.status === "BRANCH_STOCK" &&
        c.currentOwnerId === branchId
    );

    if (idx < 0) {
      const err = new Error("CERT_NOT_AVAILABLE");
      err.message = "That certificate is not available in your branch stock.";
      throw err;
    }

    const now = nowIso();

    const updated = [...captures];
    updated[idx] = {
      ...updated[idx],
      status: "ISSUED",
      issuedAt: now,
      issuedBranchId: issuedBranchId ?? null,
      issuedToClientName: name,
      issuedPolicyNumber: policy,
      issuedByUserId: issuedByUserId ?? null,
      lastMovementAt: now,
    };

    saveJson("zinara.captures", updated);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "ISSUE",
      actorId: issuedByUserId ?? branchId,
      actorRole: "BRANCH",
      entityType: "CERTIFICATE",
      entityId: updated[idx].certificateNumber,
      details: {
        branchId,
        clientName: name,
        policyNumber: policy,
        mode: "MANUAL",
      },
    });


    return { ok: true, certificateNumber: updated[idx].certificateNumber, issuedAt: now };
  },

    // ---------- Step 6: Branch Return to HQ ----------
  listBranchReturnableCertificates({ branchId, certTypeId, limit = 300 }) {
    const captures = loadJson("zinara.captures", []);
    return captures
      .filter(
        (c) =>
          c.certType === certTypeId &&
          c.status === "BRANCH_STOCK" &&
          c.currentOwnerType === "BRANCH" &&
          c.currentOwnerId === branchId
      )
      .sort((a, b) => new Date(a.lastMovementAt ?? 0) - new Date(b.lastMovementAt ?? 0))
      .slice(0, limit);
  },

  getBranchReturnableStockCount({ branchId, certTypeId }) {
    return this.listBranchReturnableCertificates({ branchId, certTypeId, limit: 100000 }).length;
  },

  listReturnsForBranch({ branchId }) {
    const all = loadJson("zinara.returns", []);
    return all.filter((r) => r?.from?.locationId === branchId);
  },

  createReturnToHq({ branchId, certTypeId, mode, quantity, certificateNumbers, reason, createdBy }) {
    if (!branchId || !certTypeId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Branch and Certificate Type are required.";
      throw err;
    }

    const why = (reason ?? "").trim();
    if (!why) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Return reason is required.";
      throw err;
    }

    const captures = loadJson("zinara.captures", []);
    const now = nowIso();

    // Choose cert numbers: AUTO by qty OR MANUAL explicit list
    let selectedNums = [];

    if (mode === "AUTO") {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        const err = new Error("VALIDATION_ERROR");
        err.message = "Quantity must be a positive number.";
        throw err;
      }

      const available = captures
        .map((c, idx) => ({ c, idx }))
        .filter(
          (x) =>
            x.c.certType === certTypeId &&
            x.c.status === "BRANCH_STOCK" &&
            x.c.currentOwnerType === "BRANCH" &&
            x.c.currentOwnerId === branchId
        )
        .sort((a, b) => new Date(a.c.lastMovementAt ?? 0) - new Date(b.c.lastMovementAt ?? 0));

      if (available.length < qty) {
        const err = new Error("INSUFFICIENT_STOCK");
        err.message = `Not enough branch stock to return. Available: ${available.length}, requested: ${qty}.`;
        throw err;
      }

      selectedNums = available.slice(0, qty).map((x) => x.c.certificateNumber);
    } else {
      const list = Array.isArray(certificateNumbers) ? certificateNumbers : [];
      selectedNums = list.map((x) => String(x ?? "").trim()).filter(Boolean);

      if (selectedNums.length === 0) {
        const err = new Error("VALIDATION_ERROR");
        err.message = "Select at least one certificate to return.";
        throw err;
      }
    }

    // Validate every selected cert is actually returnable
    const numSet = new Set(selectedNums.map((x) => x.toLowerCase()));

    const eligibleIdx = captures
      .map((c, idx) => ({ c, idx }))
      .filter(
        (x) =>
          numSet.has((x.c.certificateNumber ?? "").toLowerCase()) &&
          x.c.certType === certTypeId &&
          x.c.status === "BRANCH_STOCK" &&
          x.c.currentOwnerType === "BRANCH" &&
          x.c.currentOwnerId === branchId
      );

    if (eligibleIdx.length !== selectedNums.length) {
      const err = new Error("CERT_NOT_AVAILABLE");
      err.message =
        "One or more selected certificates are not available in BRANCH_STOCK (they may have been issued or already in transit).";
      throw err;
    }

    // Create Return manifest
    const manifestNo = `RET-${Date.now()}`;

    // Update captures: BRANCH_STOCK -> RETURN_IN_TRANSIT (going back to HQ)
    const updated = [...captures];
    eligibleIdx.forEach(({ idx }) => {
      updated[idx] = {
        ...updated[idx],
        status: "RETURN_IN_TRANSIT",
        currentOwnerType: "HQ",
        currentOwnerId: "HQ",
        returnManifestNo: manifestNo,
        lastMovementAt: now,
      };
    });
    saveJson("zinara.captures", updated);

    // Save return record
    const returns = loadJson("zinara.returns", []);
    const branch = this.listBranches().find((b) => b.branchId === branchId);

    const record = {
      returnId: manifestNo,
      manifestNo,
      certType: certTypeId,
      quantity: selectedNums.length,
      certificateNumbers: selectedNums,
      status: "SENT", // HQ will RECEIVE later
      reason: why,
      createdAt: now,
      createdBy: createdBy ?? null,
      from: {
        locationType: "BRANCH",
        locationId: branchId,
        locationName: branch?.branchName ?? branchId,
      },
      to: {
        locationType: "HQ",
        locationId: "HQ",
        locationName: "HQ",
      },
      receivedAt: null,
      receivedBy: null,
    };

    returns.unshift(record);
    saveJson("zinara.returns", returns);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "RETURN_CREATE",
      actorId: createdBy ?? branchId,
      actorRole: "BRANCH",
      entityType: "RETURN",
      entityId: manifestNo,
      details: {
        fromBranchId: branchId,
        certType: certTypeId,
        quantity: selectedNums.length,
        certificateNumbers: selectedNums,
        reason: why,
        mode,
      },
    });


    return record;
  },

    // ---------- Step 6b: HQ Receive Returns ----------
  listIncomingReturnsForHq() {
    const all = loadJson("zinara.returns", []);
    // Incoming to HQ means: to.locationId === "HQ"
    return all.filter((r) => r?.to?.locationId === "HQ");
  },

  receiveReturnAtHq({ returnId, receivedBy }) {
    if (!returnId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "returnId is required.";
      throw err;
    }

    const returns = loadJson("zinara.returns", []);
    const idx = returns.findIndex((r) => r.returnId === returnId);
    if (idx < 0) {
      const err = new Error("RETURN_NOT_FOUND");
      err.message = "Return not found.";
      throw err;
    }

    const r = returns[idx];
    if (r.status !== "SENT") {
      const err = new Error("INVALID_STATE");
      err.message = `Return cannot be received in status: ${r.status}`;
      throw err;
    }

    const now = nowIso();

    // Mark return as RECEIVED
    returns[idx] = {
      ...r,
      status: "RECEIVED",
      receivedAt: now,
      receivedBy: receivedBy ?? null,
    };
    saveJson("zinara.returns", returns);

    // Update certificates: RETURN_IN_TRANSIT -> HQ_STOCK
    const nums = new Set((r.certificateNumbers ?? []).map((x) => String(x).toLowerCase()));
    const captures = loadJson("zinara.captures", []);

    const updated = captures.map((c) => {
      const cn = String(c.certificateNumber ?? "").toLowerCase();
      if (nums.has(cn) && c.status === "RETURN_IN_TRANSIT") {
        return {
          ...c,
          status: "HQ_STOCK",
          currentOwnerType: "HQ",
          currentOwnerId: "HQ",
          lastMovementAt: now,
          returnManifestNo: null,
        };
      }
      return c;
    });

    saveJson("zinara.captures", updated);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "RETURN_RECEIVE",
      actorId: receivedBy ?? "HQ_USER",
      actorRole: "HQ",
      entityType: "RETURN",
      entityId: returnId,
      details: {
        manifestNo: r.manifestNo,
        quantity: r.quantity,
        fromBranchId: r?.from?.locationId,
      },
    });


    return { ok: true };
  },

  // ---------- Step 7: Thresholds + Stock Requests (Admin default + Branch override) ----------

  // Storage key: zinara.thresholds
  // Shape:
  // {
  //   defaults: { [certTypeId]: number },
  //   branchOverrides: { [`${branchId}::${certTypeId}`]: number }
  // }
  _getThresholdStore() {
    const key = "zinara.thresholds";
    const store = loadJson(key, null);
    if (store && store.defaults && store.branchOverrides) return store;
    const fresh = { defaults: {}, branchOverrides: {} };
    saveJson(key, fresh);
    return fresh;
  },

  _saveThresholdStore(store) {
    saveJson("zinara.thresholds", store);
  },

  getDefaultThreshold({ certTypeId }) {
    const store = this._getThresholdStore();
    const v = store.defaults?.[certTypeId];
    return typeof v === "number" ? v : 0;
  },

  setDefaultThreshold({ certTypeId, value }) {
    const n = Number(value);
    if (!certTypeId || !Number.isFinite(n) || n < 0) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Default threshold must be a number >= 0.";
      throw err;
    }
    const store = this._getThresholdStore();
    store.defaults[certTypeId] = n;
    this._saveThresholdStore(store);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "THRESHOLD_DEFAULT_SET",
      actorId: "HQ_USER",
      actorRole: "HQ",
      entityType: "THRESHOLD",
      entityId: certTypeId,
      details: { certTypeId, value: n },
    });

    return { ok: true };
  },

  getBranchOverrideThreshold({ branchId, certTypeId }) {
    const store = this._getThresholdStore();
    const key = `${branchId}::${certTypeId}`;
    const v = store.branchOverrides?.[key];
    return typeof v === "number" ? v : null;
  },

  setBranchOverrideThreshold({ branchId, certTypeId, value }) {
    const n = Number(value);
    if (!branchId || !certTypeId || !Number.isFinite(n) || n < 0) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Branch threshold must be a number >= 0.";
      throw err;
    }
    const store = this._getThresholdStore();
    const k = `${branchId}::${certTypeId}`;
    store.branchOverrides[k] = n;
    this._saveThresholdStore(store);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "THRESHOLD_OVERRIDE_SET",
      actorId: branchId,
      actorRole: "BRANCH",
      entityType: "THRESHOLD",
      entityId: `${branchId}::${certTypeId}`,
      details: { branchId, certTypeId, value: n },
    });

    return { ok: true };
  },

  clearBranchOverrideThreshold({ branchId, certTypeId }) {
    const store = this._getThresholdStore();
    const k = `${branchId}::${certTypeId}`;
    delete store.branchOverrides[k];
    this._saveThresholdStore(store);
    return { ok: true };
  },

  getEffectiveThreshold({ branchId, certTypeId }) {
    const override = this.getBranchOverrideThreshold({ branchId, certTypeId });
    if (typeof override === "number") return override;
    return this.getDefaultThreshold({ certTypeId });
  },

  // Stock count for branch (available only)
  getBranchAvailableStockCount({ branchId, certTypeId }) {
    const captures = loadJson("zinara.captures", []);
    return captures.filter(
      (c) =>
        c.certType === certTypeId &&
        c.status === "BRANCH_STOCK" &&
        c.currentOwnerType === "BRANCH" &&
        c.currentOwnerId === branchId
    ).length;
  },

  // Requests storage key: zinara.stockRequests
  // Record shape:
  // { requestId, branchId, branchName, certTypeId, quantity, reason, status, createdAt, fulfilledAt, fulfilment: { manifestNo, transferId } }
  listStockRequestsForBranch({ branchId }) {
    const all = loadJson("zinara.stockRequests", []);
    return all.filter((r) => r.branchId === branchId);
  },

  listStockRequestsForHq({ status = null }) {
    const all = loadJson("zinara.stockRequests", []);
    if (!status) return all;
    return all.filter((r) => r.status === status);
  },

  createStockRequest({ branchId, certTypeId, quantity, reason, createdBy }) {
    const qty = Number(quantity);
    const why = (reason ?? "").trim();

    if (!branchId || !certTypeId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Branch and Certificate Type are required.";
      throw err;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Quantity must be a positive number.";
      throw err;
    }
    if (!why) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "Reason is required.";
      throw err;
    }

    const branches = this.listBranches();
    const b = branches.find((x) => x.branchId === branchId);

    const now = nowIso();
    const requestId = `REQ-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const all = loadJson("zinara.stockRequests", []);
    const record = {
      requestId,
      branchId,
      branchName: b?.branchName ?? branchId,
      certTypeId,
      quantity: qty,
      reason: why,
      status: "OPEN", // OPEN -> FULFILLED (or CANCELLED later)
      createdAt: now,
      createdBy: createdBy ?? null,
      fulfilledAt: null,
      fulfilledBy: null,
      fulfilment: null,
    };

    all.unshift(record);
    saveJson("zinara.stockRequests", all);

        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "REQUEST_CREATE",
      actorId: createdBy ?? branchId,
      actorRole: "BRANCH",
      entityType: "REQUEST",
      entityId: requestId,
      details: { branchId, certTypeId, quantity: qty, reason: why },
    });


    return record;
  },

  fulfilStockRequest({ requestId, fulfilledBy }) {
    if (!requestId) {
      const err = new Error("VALIDATION_ERROR");
      err.message = "requestId is required.";
      throw err;
    }

    const all = loadJson("zinara.stockRequests", []);
    const idx = all.findIndex((r) => r.requestId === requestId);
    if (idx < 0) {
      const err = new Error("REQUEST_NOT_FOUND");
      err.message = "Stock request not found.";
      throw err;
    }

    const r = all[idx];
    if (r.status !== "OPEN") {
      const err = new Error("INVALID_STATE");
      err.message = `Request cannot be fulfilled in status: ${r.status}`;
      throw err;
    }

    // Create transfer from HQ -> Branch using existing function
    const transfer = this.createTransferSequential({
      branchId: r.branchId,
      certTypeId: r.certTypeId,
      quantity: r.quantity,
      note: `Fulfil request ${r.requestId}: ${r.reason}`,
    });

    const now = nowIso();
    all[idx] = {
      ...r,
      status: "FULFILLED",
      fulfilledAt: now,
      fulfilledBy: fulfilledBy ?? null,
      fulfilment: { manifestNo: transfer.manifestNo, transferId: transfer.transferId },
    };

    saveJson("zinara.stockRequests", all);
        this._auditAppend({
      auditId: `AUD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      at: nowIso(),
      eventType: "REQUEST_FULFIL",
      actorId: fulfilledBy ?? "HQ_USER",
      actorRole: "HQ",
      entityType: "REQUEST",
      entityId: requestId,
      details: {
        branchId: r.branchId,
        certTypeId: r.certTypeId,
        quantity: r.quantity,
        manifestNo: transfer.manifestNo,
      },
    });

    return { ok: true, transfer };
  },


    // ---------- Step 8: Dashboards (Aggregations) ----------

  _allCaptures() {
    return loadJson("zinara.captures", []);
  },

  _allTransfers() {
    return loadJson("zinara.transfers", []);
  },

  _allReturns() {
    return loadJson("zinara.returns", []);
  },

  _allRequests() {
    return loadJson("zinara.stockRequests", []);
  },

  // HQ: total HQ stock by certType
  getHqStockSummary() {
    const captures = this._allCaptures();
    const certTypes = this.listCertificateTypes();

    return certTypes.map((t) => {
      const count = captures.filter((c) => c.certType === t.certTypeId && c.status === "HQ_STOCK").length;
      return { certTypeId: t.certTypeId, certTypeName: t.name, hqStock: count };
    });
  },

  // HQ: branch stock vs thresholds (effective)
  getBranchStockStatus() {
    const captures = this._allCaptures();
    const branches = this.listBranches();
    const certTypes = this.listCertificateTypes();

    const rows = [];

    for (const b of branches) {
      for (const t of certTypes) {
        const stock = captures.filter(
          (c) =>
            c.certType === t.certTypeId &&
            c.status === "BRANCH_STOCK" &&
            c.currentOwnerType === "BRANCH" &&
            c.currentOwnerId === b.branchId
        ).length;

        const threshold = this.getEffectiveThreshold({ branchId: b.branchId, certTypeId: t.certTypeId });
        const shortage = Math.max(0, threshold - stock);

        rows.push({
          branchId: b.branchId,
          branchName: b.branchName,
          certTypeId: t.certTypeId,
          certTypeName: t.name,
          stock,
          threshold,
          shortage,
          status: shortage > 0 ? "SHORT" : "OK",
        });
      }
    }

    // Put biggest shortages first
    rows.sort((a, b) => (b.shortage - a.shortage) || (a.branchName.localeCompare(b.branchName)));
    return rows;
  },

  // HQ: operational queues (counts)
  getHqOpsCounters() {
    const transfers = this._allTransfers();
    const returns = this._allReturns();
    const requests = this._allRequests();

    return {
      openRequests: requests.filter((r) => r.status === "OPEN").length,
      sentTransfers: transfers.filter((t) => t.status === "SENT").length,
      pendingReturns: returns.filter((r) => r.status === "SENT").length, // returns waiting to be received at HQ
    };
  },

  // HQ: recent activity (simple feed)
  getHqRecentActivity({ limit = 15 } = {}) {
    const transfers = this._allTransfers().map((t) => ({
      type: "TRANSFER",
      id: t.transferId,
      when: t.createdAt,
      title: `Transfer ${t.manifestNo} to ${t?.to?.locationName ?? t?.to?.locationId}`,
      status: t.status,
      meta: { qty: t.quantity, certType: t.certType },
    }));

    const returns = this._allReturns().map((r) => ({
      type: "RETURN",
      id: r.returnId,
      when: r.createdAt,
      title: `Return ${r.manifestNo} from ${r?.from?.locationName ?? r?.from?.locationId}`,
      status: r.status,
      meta: { qty: r.quantity, certType: r.certType },
    }));

    const requests = this._allRequests().map((r) => ({
      type: "REQUEST",
      id: r.requestId,
      when: r.createdAt,
      title: `Request ${r.requestId} from ${r.branchName}`,
      status: r.status,
      meta: { qty: r.quantity, certType: r.certTypeId },
    }));

    return [...transfers, ...returns, ...requests]
      .filter((x) => x.when)
      .sort((a, b) => new Date(b.when) - new Date(a.when))
      .slice(0, limit);
  },

  // Branch: stock + threshold
  getBranchDashboard({ branchId }) {
    const certTypes = this.listCertificateTypes();
    const captures = this._allCaptures();
    const transfers = this._allTransfers();
    const returns = this._allReturns();
    const requests = this._allRequests();

    const perType = certTypes.map((t) => {
      const stock = captures.filter(
        (c) =>
          c.certType === t.certTypeId &&
          c.status === "BRANCH_STOCK" &&
          c.currentOwnerType === "BRANCH" &&
          c.currentOwnerId === branchId
      ).length;

      const threshold = this.getEffectiveThreshold({ branchId, certTypeId: t.certTypeId });
      const shortage = Math.max(0, threshold - stock);

      return { certTypeId: t.certTypeId, certTypeName: t.name, stock, threshold, shortage };
    });

    const incomingTransfers = transfers.filter(
      (t) => t?.to?.locationId === branchId && t.status === "SENT"
    ).length;

    const myOpenRequests = requests.filter((r) => r.branchId === branchId && r.status === "OPEN").length;

    const mySentReturns = returns.filter((r) => r?.from?.locationId === branchId && r.status === "SENT").length;

    // Recent issued (last 10) for this branch
    const issued = captures
      .filter((c) => c.status === "ISSUED" && c.issuedByUserId && c.currentOwnerId === branchId)
      .sort((a, b) => new Date(b.issuedAt ?? 0) - new Date(a.issuedAt ?? 0))
      .slice(0, 10)
      .map((c) => ({
        certificateNumber: c.certificateNumber,
        issuedAt: c.issuedAt,
        clientName: c.issuedToClientName,
        policyNumber: c.issuedPolicyNumber,
      }));

    return {
      perType,
      counters: { incomingTransfers, myOpenRequests, mySentReturns },
      recentIssued: issued,
    };
  },

    // ---------- Step 9: Audit Trail ----------
  _auditAppend(event) {
    const key = "zinara.audit";
    const all = loadJson(key, []);
    all.unshift(event);               // newest first
    saveJson(key, all);
  },

  auditSearch({ text = "", eventType = "", actor = "", limit = 200 } = {}) {
    const all = loadJson("zinara.audit", []);
    const q = String(text ?? "").trim().toLowerCase();
    const et = String(eventType ?? "").trim().toUpperCase();
    const ac = String(actor ?? "").trim().toLowerCase();

    let res = all;

    if (et) res = res.filter((e) => String(e.eventType ?? "").toUpperCase() === et);
    if (ac) res = res.filter((e) => String(e.actorId ?? "").toLowerCase().includes(ac));
    if (q) {
      res = res.filter((e) => {
        const blob = JSON.stringify(e).toLowerCase();
        return blob.includes(q);
      });
    }

    return res.slice(0, limit);
  },

  // ---------- Masters storage ----------
  _getMasters() {
    const key = "zinara.masters";
    const m = loadJson(key, null);
    if (m && m.branches && m.certTypes && m.users) return m;

    const seed = {
      branches: [
        { branchId: "BR001", branchName: "Sam Levy Branch", isActive: true },
        { branchId: "BR002", branchName: "Westgate Branch", isActive: true },
        { branchId: "BR003", branchName: "CBD Branch", isActive: true },
      ],
      certTypes: [{ certTypeId: "ZINARA_LICENSE", name: "ZINARA License", isActive: true }],
      users: [
        { username: "hq", role: "HQ", branchId: null, isActive: true },
        { username: "branch", role: "BRANCH", branchId: "BR001", isActive: true },
      ],
    };
    saveJson(key, seed);
    return seed;
  },

  _saveMasters(m) {
    saveJson("zinara.masters", m);
  },

  // Override your existing listBranches/listCertificateTypes to read masters
  listBranches() {
    const m = this._getMasters();
    return (m.branches ?? []).slice().sort((a, b) => a.branchName.localeCompare(b.branchName));
  },

  listCertificateTypes() {
    const m = this._getMasters();
    return (m.certTypes ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },

  listUsers() {
    const m = this._getMasters();
    return (m.users ?? []).slice().sort((a, b) => a.username.localeCompare(b.username));
  },

    // ---------- Admin Masters: Branch CRUD ----------
  upsertBranch({ branchId, branchName, isActive = true }) {
    const id = String(branchId ?? "").trim().toUpperCase();
    const name = String(branchName ?? "").trim();

    if (!id) throw Object.assign(new Error("Branch ID is required."), { code: "VALIDATION" });
    if (!/^BR[0-9]{3}$/.test(id)) {
      throw Object.assign(new Error("Branch ID must match BR### (e.g., BR001)."), { code: "VALIDATION" });
    }
    if (!name) throw Object.assign(new Error("Branch Name is required."), { code: "VALIDATION" });

    const m = this._getMasters();
    const idx = m.branches.findIndex((b) => b.branchId === id);

    if (idx >= 0) {
      m.branches[idx] = { ...m.branches[idx], branchName: name, isActive: Boolean(isActive) };
    } else {
      const exists = m.branches.some((b) => b.branchId === id);
      if (exists) throw Object.assign(new Error("Duplicate Branch ID."), { code: "DUPLICATE" });
      m.branches.unshift({ branchId: id, branchName: name, isActive: Boolean(isActive) });
    }
    this._saveMasters(m);
    return { ok: true };
  },

  setBranchActive({ branchId, isActive }) {
    const id = String(branchId ?? "").trim().toUpperCase();
    const m = this._getMasters();
    const idx = m.branches.findIndex((b) => b.branchId === id);
    if (idx < 0) throw new Error("Branch not found.");
    m.branches[idx] = { ...m.branches[idx], isActive: Boolean(isActive) };
    this._saveMasters(m);
    return { ok: true };
  },

  // ---------- Admin Masters: CertType CRUD ----------
  upsertCertType({ certTypeId, name, isActive = true }) {
    const id = String(certTypeId ?? "").trim().toUpperCase();
    const nm = String(name ?? "").trim();
    if (!id) throw Object.assign(new Error("Certificate Type ID is required."), { code: "VALIDATION" });
    if (!/^[A-Z0-9_]+$/.test(id)) {
      throw Object.assign(new Error("certTypeId must be uppercase letters/numbers/underscore."), { code: "VALIDATION" });
    }
    if (!nm) throw Object.assign(new Error("Certificate Type Name is required."), { code: "VALIDATION" });

    const m = this._getMasters();
    const idx = m.certTypes.findIndex((t) => t.certTypeId === id);

    if (idx >= 0) {
      m.certTypes[idx] = { ...m.certTypes[idx], name: nm, isActive: Boolean(isActive) };
    } else {
      const exists = m.certTypes.some((t) => t.certTypeId === id);
      if (exists) throw Object.assign(new Error("Duplicate certTypeId."), { code: "DUPLICATE" });
      m.certTypes.unshift({ certTypeId: id, name: nm, isActive: Boolean(isActive) });
    }

    this._saveMasters(m);
    return { ok: true };
  },

  setCertTypeActive({ certTypeId, isActive }) {
    const id = String(certTypeId ?? "").trim().toUpperCase();
    const m = this._getMasters();
    const idx = m.certTypes.findIndex((t) => t.certTypeId === id);
    if (idx < 0) throw new Error("Certificate type not found.");
    m.certTypes[idx] = { ...m.certTypes[idx], isActive: Boolean(isActive) };
    this._saveMasters(m);
    return { ok: true };
  },

  // ---------- Admin Masters: Users CRUD (prototype) ----------
  upsertUser({ username, role, branchId = null, isActive = true }) {
    const u = String(username ?? "").trim().toLowerCase();
    const r = String(role ?? "").trim().toUpperCase();

    if (!u) throw Object.assign(new Error("Username is required."), { code: "VALIDATION" });
    if (!["HQ", "BRANCH"].includes(r)) {
      throw Object.assign(new Error("Role must be HQ or BRANCH."), { code: "VALIDATION" });
    }

    let bId = branchId ? String(branchId).trim().toUpperCase() : null;
    if (r === "BRANCH") {
      if (!bId) throw Object.assign(new Error("branchId is required for BRANCH users."), { code: "VALIDATION" });
      const exists = this.listBranches().some((b) => b.branchId === bId);
      if (!exists) throw Object.assign(new Error("branchId does not exist in Branch Masters."), { code: "VALIDATION" });
    } else {
      bId = null;
    }

    const m = this._getMasters();
    const idx = m.users.findIndex((x) => x.username === u);

    if (idx >= 0) {
      m.users[idx] = { ...m.users[idx], role: r, branchId: bId, isActive: Boolean(isActive) };
    } else {
      const dup = m.users.some((x) => x.username === u);
      if (dup) throw Object.assign(new Error("Duplicate username."), { code: "DUPLICATE" });
      m.users.unshift({ username: u, role: r, branchId: bId, isActive: Boolean(isActive) });
    }

    this._saveMasters(m);
    return { ok: true };
  },

  setUserActive({ username, isActive }) {
    const u = String(username ?? "").trim().toLowerCase();
    const m = this._getMasters();
    const idx = m.users.findIndex((x) => x.username === u);
    if (idx < 0) throw new Error("User not found.");
    m.users[idx] = { ...m.users[idx], isActive: Boolean(isActive) };
    this._saveMasters(m);
    return { ok: true };
  },

    // ---------- Reports ----------
  reportIssued({ dateFrom, dateTo, branchId = "", certTypeId = "" }) {
    const captures = loadJson("zinara.captures", []);
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() : null;

    return captures
      .filter((c) => c.status === "ISSUED" && c.issuedAt)
      .filter((c) => {
        const t = new Date(c.issuedAt).getTime();
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
        if (branchId && String(c.issuedBranchId ?? c.currentOwnerId ?? "") !== branchId) return false;
        if (certTypeId && c.certType !== certTypeId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))
      .map((c) => ({
        certificateNumber: c.certificateNumber,
        certType: c.certType,
        clientName: c.issuedToClientName,
        policyNumber: c.issuedPolicyNumber,
        issuedAt: c.issuedAt,
        issuedBy: c.issuedByUserId,
        branchId: c.issuedBranchId ?? c.currentOwnerId ?? null,
      }));
  },

  reportMovementsSummary({ dateFrom, dateTo }) {
    const transfers = loadJson("zinara.transfers", []);
    const returns = loadJson("zinara.returns", []);
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() : null;

    const inRange = (iso) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
      return true;
    };

    const transferRows = transfers
      .filter((t) => inRange(t.createdAt))
      .map((t) => ({
        kind: "TRANSFER",
        manifestNo: t.manifestNo,
        to: t?.to?.locationName ?? t?.to?.locationId,
        certType: t.certType,
        qty: t.quantity,
        status: t.status,
        createdAt: t.createdAt,
        receivedAt: t.receivedAt ?? null,
      }));

    const returnRows = returns
      .filter((r) => inRange(r.createdAt))
      .map((r) => ({
        kind: "RETURN",
        manifestNo: r.manifestNo,
        from: r?.from?.locationName ?? r?.from?.locationId,
        certType: r.certType,
        qty: r.quantity,
        status: r.status,
        createdAt: r.createdAt,
        receivedAt: r.receivedAt ?? null,
      }));

    return [...transferRows, ...returnRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  reportStockPosition() {
    const hq = this.getHqStockSummary();
    const branch = this.getBranchStockStatus();
    return { hq, branch };
  },

  // CSV export utility
  toCsv(rows) {
    if (!rows || rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(headers.map((h) => esc(r[h])).join(","));
    }
    return lines.join("\n");
  },


};

