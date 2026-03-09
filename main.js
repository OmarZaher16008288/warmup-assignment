const fs = require("fs");

/**
 * Parse "h:mm:ss am" or "hh:mm:ss pm" (any surrounding whitespace,
 * period in any case) into total seconds since midnight.
 */
function parseTimeToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();
    const spaceIdx = timeStr.lastIndexOf(" ");
    const period   = timeStr.slice(spaceIdx + 1).trim(); // "am" or "pm"
    const timePart = timeStr.slice(0, spaceIdx).trim();
    const [h, m, s] = timePart.split(":").map(Number);

    let hours = h;
    if (period === "am") {
        if (hours === 12) hours = 0;      // 12:xx am  → 0 h
    } else {
        if (hours !== 12) hours += 12;    // 1–11 pm → 13–23; 12 pm stays 12
    }

    return hours * 3600 + m * 60 + s;
}

/**
 * Parse "h:mm:ss" or "hhh:mm:ss" into total seconds.
 */
function parseDurationToSeconds(durationStr) {
    const parts = durationStr.trim().split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/**
 * Format total seconds → "h:mm:ss"  (hours not zero-padded).
 */
function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Same logic – used where "hhh:mm:ss" format is expected (hours can be large)
const formatDurationLong = formatDuration;

/**
 * Read a text file and return non-empty, trimmed lines.
 * Returns [] if the file does not exist.
 */
function readLines(filePath) {
    try {
        return fs.readFileSync(filePath, { encoding: "utf8" })
            .split("\n")
            .filter(l => l.trim() !== "");
    } catch (e) {
        return [];
    }
}

/**
 * Split a comma-separated line into trimmed fields.
 */
function parseLine(line) {
    return line.split(",").map(c => c.trim());
}

/**
 * Return true if dateStr (yyyy-mm-dd) falls in the
 * Eid al-Fitr 2025 period: April 10–30, 2025.
 * String-based check avoids timezone issues.
 */
function isEidPeriod(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return year === 2025 && month === 4 && day >= 10 && day <= 30;
}

/**
 * Return the English day-of-week name for a date string (yyyy-mm-dd).
 * Uses UTC to avoid DST / timezone shifts.
 */
function getDayName(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getUTCDay()];
}

const NORMAL_QUOTA_SEC = 8 * 3600 + 24 * 60;  // 8 h 24 min
const EID_QUOTA_SEC    = 6 * 3600;             // 6 h

function quotaForDate(dateStr) {
    return isEidPeriod(dateStr) ? EID_QUOTA_SEC : NORMAL_QUOTA_SEC;
}
// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = parseTimeToSeconds(startTime);
    const endSec   = parseTimeToSeconds(endTime);
    return formatDuration(endSec - startSec);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = parseTimeToSeconds(startTime);
    const endSec   = parseTimeToSeconds(endTime);

    const DELIVERY_START = 8  * 3600;   // 08:00:00
    const DELIVERY_END   = 22 * 3600;   // 22:00:00

    // Idle time BEFORE 8 AM
    let idleBefore = 0;
    if (startSec < DELIVERY_START) {
        const earlyEnd = Math.min(DELIVERY_START, endSec);
        idleBefore = Math.max(0, earlyEnd - startSec);
    }

    // Idle time AFTER 10 PM
    let idleAfter = 0;
    if (endSec > DELIVERY_END) {
        const lateStart = Math.max(DELIVERY_END, startSec);
        idleAfter = Math.max(0, endSec - lateStart);
    }

    return formatDuration(idleBefore + idleAfter);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = parseDurationToSeconds(shiftDuration);
    const idleSec  = parseDurationToSeconds(idleTime);
    return formatDuration(Math.max(0, shiftSec - idleSec));
}
// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = parseDurationToSeconds(activeTime);
    return activeSec >= quotaForDate(date);
}
// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const { driverID, driverName, date, startTime, endTime } = shiftObj;
    const startTrimmed = startTime.trim();
    const endTrimmed   = endTime.trim();

    // Read existing file content (preserve raw for safety)
    let rawContent = "";
    try {
        rawContent = fs.readFileSync(textFile, { encoding: "utf8" });
    } catch (e) {
        rawContent = "";
    }

    const lines = rawContent.split("\n").filter(l => l.trim() !== "");

    // Duplicate check: same driverID AND same date
    for (const line of lines) {
        const cols = parseLine(line);
        if (cols[0] === driverID && cols[2] === date) {
            return {};
        }
    }

    // Compute derived fields
    const shiftDuration = getShiftDuration(startTrimmed, endTrimmed);
    const idleTime      = getIdleTime(startTrimmed, endTrimmed);
    const activeTime    = getActiveTime(shiftDuration, idleTime);
    const quota         = metQuota(date, activeTime);
    const hasBonus      = false;

    // Return object
    const newRecord = {
        driverID,
        driverName,
        date,
        startTime:     startTrimmed,
        endTime:       endTrimmed,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota:      quota,
        hasBonus
    };

    // Text line to append / insert
    const newLine = [
        driverID, driverName, date,
        startTrimmed, endTrimmed,
        shiftDuration, idleTime, activeTime,
        quota, hasBonus
    ].join(",");

    // Insert after the LAST existing record of this driverID,
    // or at the very end if the driver is new.
    let lastIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (parseLine(lines[i])[0] === driverID) {
            lastIdx = i;
        }
    }

    if (lastIdx === -1) {
        lines.push(newLine);
    } else {
        lines.splice(lastIdx + 1, 0, newLine);
    }

    fs.writeFileSync(textFile, lines.join("\n") + "\n", { encoding: "utf8" });
    return newRecord;
}


// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const rawContent = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = rawContent.split("\n");

    const updated = lines.map(line => {
        if (line.trim() === "") return line;
        const cols = parseLine(line);
        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = String(newValue);
            return cols.join(",");
        }
        return line;
    });

    fs.writeFileSync(textFile, updated.join("\n"), { encoding: "utf8" });
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const lines = readLines(textFile);
    const targetMonth = parseInt(month, 10);

    let driverFound = false;
    let count = 0;

    for (const line of lines) {
        const cols = parseLine(line);
        if (cols[0] !== driverID) continue;

        driverFound = true;
        const recordMonth = parseInt(cols[2].split("-")[1], 10);
        if (recordMonth === targetMonth && cols[9].toLowerCase() === "true") {
            count++;
        }
    }

    return driverFound ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const lines = readLines(textFile);
    let totalSec = 0;

    for (const line of lines) {
        const cols = parseLine(line);
        if (cols[0] !== driverID) continue;

        const recordMonth = parseInt(cols[2].split("-")[1], 10);
        if (recordMonth !== month) continue;

        totalSec += parseDurationToSeconds(cols[7]); // activeTime
    }

    return formatDurationLong(totalSec);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shiftLines = readLines(textFile);
    const rateLines  = readLines(rateFile);

    // Find the driver's day off
    let dayOff = null;
    for (const line of rateLines) {
        const cols = parseLine(line);
        if (cols[0] === driverID) {
            dayOff = cols[1].trim();
            break;
        }
    }

    let totalRequiredSec = 0;

    for (const line of shiftLines) {
        const cols = parseLine(line);
        if (cols[0] !== driverID) continue;

        const dateStr = cols[2];
        const recordMonth = parseInt(dateStr.split("-")[1], 10);
        if (recordMonth !== month) continue;

        // Skip if the shift falls on the driver's scheduled day off
        if (dayOff && getDayName(dateStr) === dayOff) continue;

        totalRequiredSec += quotaForDate(dateStr);
    }

    // Bonus deduction: 2 h per bonus
    totalRequiredSec = Math.max(0, totalRequiredSec - bonusCount * 2 * 3600);

    return formatDurationLong(totalRequiredSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateLines = readLines(rateFile);

    let basePay = 0;
    let tier    = 1;

    for (const line of rateLines) {
        const cols = parseLine(line);
        if (cols[0] === driverID) {
            basePay = parseInt(cols[2], 10);
            tier    = parseInt(cols[3], 10);
            break;
        }
    }

    // Allowed missing hours (no deduction within this buffer)
    const ALLOWED_HOURS = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowedMissing = ALLOWED_HOURS[tier] !== undefined ? ALLOWED_HOURS[tier] : 0;

    const actualSec   = parseDurationToSeconds(actualHours);
    const requiredSec = parseDurationToSeconds(requiredHours);

    // No deduction when actual >= required
    if (actualSec >= requiredSec) {
        return basePay;
    }

    // Total missing time in fractional hours
    const missingHours    = (requiredSec - actualSec) / 3600;
    const billableHours   = missingHours - allowedMissing;

    // Within the allowed buffer → no deduction
    if (billableHours <= 0) {
        return basePay;
    }

    // Only full hours are billed
    const billableFullHours = Math.floor(billableHours);

    // deductionRatePerHour = floor(basePay / 185)
    const deductionRate = Math.floor(basePay / 185);
    const deduction     = billableFullHours * deductionRate;

    return basePay - deduction;
}


module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
