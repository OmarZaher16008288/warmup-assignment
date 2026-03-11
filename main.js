const fs = require("fs");

// Helper: convert "hh:mm:ss am/pm" to total seconds
function timeToSeconds(timeStr) {
    timeStr = timeStr.trim();
    const parts = timeStr.split(" ");
    const timeParts = parts[0].split(":").map(Number);
    let hours = timeParts[0];
    const minutes = timeParts[1];
    const seconds = timeParts[2];
    if (parts.length > 1) {
        const period = parts[1].toLowerCase();
        if (period === "pm" && hours !== 12) hours += 12;
        if (period === "am" && hours === 12) hours = 0;
    }
    return hours * 3600 + minutes * 60 + seconds;
}

// Helper: convert "h:mm:ss" to total seconds
function durationToSeconds(dur) {
    dur = dur.trim();
    const parts = dur.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Helper: convert total seconds to "h:mm:ss"
function secondsToDuration(secs) {
    secs = Math.abs(secs);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Function 1: getShiftDuration(startTime, endTime)
function getShiftDuration(startTime, endTime) {
    const startSecs = timeToSeconds(startTime);
    const endSecs = timeToSeconds(endTime);
    const diff = endSecs - startSecs;
    return secondsToDuration(diff);
}

// Function 2: getIdleTime(startTime, endTime)
function getIdleTime(startTime, endTime) {
    const startSecs = timeToSeconds(startTime);
    const endSecs = timeToSeconds(endTime);
    const deliveryStart = 8 * 3600;   // 8:00 AM in seconds
    const deliveryEnd = 22 * 3600;    // 10:00 PM in seconds

    let idleSecs = 0;

    // Time before 8:00 AM
    if (startSecs < deliveryStart) {
        const beforeDelivery = Math.min(deliveryStart, endSecs) - startSecs;
        if (beforeDelivery > 0) idleSecs += beforeDelivery;
    }

    // Time after 10:00 PM
    if (endSecs > deliveryEnd) {
        const afterDelivery = endSecs - Math.max(deliveryEnd, startSecs);
        if (afterDelivery > 0) idleSecs += afterDelivery;
    }

    return secondsToDuration(idleSecs);
}

// Function 3: getActiveTime(shiftDuration, idleTime)
function getActiveTime(shiftDuration, idleTime) {
    const shiftSecs = durationToSeconds(shiftDuration);
    const idleSecs = durationToSeconds(idleTime);
    return secondsToDuration(shiftSecs - idleSecs);
}

// Function 4: metQuota(date, activeTime)
function metQuota(date, activeTime) {
    const eidStart = new Date("2025-04-10");
    const eidEnd = new Date("2025-04-30");
    const d = new Date(date);

    let quotaSecs;
    if (d >= eidStart && d <= eidEnd) {
        quotaSecs = 6 * 3600; // 6 hours
    } else {
        quotaSecs = 8 * 3600 + 24 * 60; // 8h24m
    }

    const activeSecs = durationToSeconds(activeTime);
    return activeSecs >= quotaSecs;
}

// Function 5: addShiftRecord(textFile, shiftObj)
function addShiftRecord(textFile, shiftObj) {
    const { driverID, driverName, date, startTime, endTime } = shiftObj;

    let lines = [];
    try {
        const content = fs.readFileSync(textFile, { encoding: "utf8" });
        lines = content.split("\n").filter(l => l.trim() !== "");
    } catch (e) {
        lines = [];
    }

    // Check for duplicate
    for (const line of lines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            return {};
        }
    }

    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime = getIdleTime(startTime, endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quota = metQuota(date, activeTime);
    const hasBonus = false;

    const newRecord = {
        driverID,
        driverName,
        date,
        startTime,
        endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: quota,
        hasBonus
    };

    const newLine = `${driverID},${driverName},${date},${startTime},${endTime},${shiftDuration},${idleTime},${activeTime},${quota},${hasBonus}`;

    // Find last occurrence of driverID
    let lastIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].split(",")[0].trim() === driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        // Driver not found, append at end
        lines.push(newLine);
    } else {
        // Insert after last record of this driverID
        lines.splice(lastIndex + 1, 0, newLine);
    }

    fs.writeFileSync(textFile, lines.join("\n") + "\n", { encoding: "utf8" });

    return newRecord;
}

// Function 6: setBonus(textFile, driverID, date, newValue)
function setBonus(textFile, driverID, date, newValue) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split("\n");

    const updated = lines.map(line => {
        if (line.trim() === "") return line;
        const cols = line.split(",");
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            cols[9] = String(newValue);
            return cols.join(",");
        }
        return line;
    });

    fs.writeFileSync(textFile, updated.join("\n"), { encoding: "utf8" });
}

// Function 7: countBonusPerMonth(textFile, driverID, month)
function countBonusPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split("\n").filter(l => l.trim() !== "");

    const normalizedMonth = String(parseInt(month)).padStart(2, "0");

    let driverExists = false;
    let count = 0;

    for (const line of lines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            driverExists = true;
            const date = cols[2].trim(); // yyyy-mm-dd
            const recordMonth = date.split("-")[1]; // mm
            if (recordMonth === normalizedMonth) {
                const hasBonusVal = cols[9].trim().toLowerCase();
                if (hasBonusVal === "true") {
                    count++;
                }
            }
        }
    }

    if (!driverExists) return -1;
    return count;
}

// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const content = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = content.split("\n").filter(l => l.trim() !== "");

    const normalizedMonth = String(month).padStart(2, "0");
    let totalSecs = 0;

    for (const line of lines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            const date = cols[2].trim();
            const recordMonth = date.split("-")[1];
            if (recordMonth === normalizedMonth) {
                const activeTime = cols[7].trim();
                totalSecs += durationToSeconds(activeTime);
            }
        }
    }

    return secondsToDuration(totalSecs);
}

// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shiftContent = fs.readFileSync(textFile, { encoding: "utf8" });
    const shiftLines = shiftContent.split("\n").filter(l => l.trim() !== "");

    const rateContent = fs.readFileSync(rateFile, { encoding: "utf8" });
    const rateLines = rateContent.split("\n").filter(l => l.trim() !== "");

    // Get driver's day off
    let dayOff = null;
    for (const line of rateLines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            dayOff = cols[1].trim().toLowerCase();
            break;
        }
    }

    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

    const normalizedMonth = String(month).padStart(2, "0");
    let totalSecs = 0;

    const eidStart = new Date("2025-04-10");
    const eidEnd = new Date("2025-04-30");

    for (const line of shiftLines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            const date = cols[2].trim();
            const recordMonth = date.split("-")[1];
            if (recordMonth === normalizedMonth) {
                const d = new Date(date);
                const dayOfWeek = dayNames[d.getDay()];

                // Skip if day off
                if (dayOff && dayOfWeek === dayOff) continue;

                // Determine quota for this day
                let quotaSecs;
                if (d >= eidStart && d <= eidEnd) {
                    quotaSecs = 6 * 3600;
                } else {
                    quotaSecs = 8 * 3600 + 24 * 60;
                }

                totalSecs += quotaSecs;
            }
        }
    }

    // Reduce by 2 hours per bonus
    const bonusReduction = bonusCount * 2 * 3600;
    totalSecs = Math.max(0, totalSecs - bonusReduction);

    return secondsToDuration(totalSecs);
}

// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateContent = fs.readFileSync(rateFile, { encoding: "utf8" });
    const rateLines = rateContent.split("\n").filter(l => l.trim() !== "");

    let basePay = 0;
    let tier = 0;

    for (const line of rateLines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            basePay = parseInt(cols[2].trim());
            tier = parseInt(cols[3].trim());
            break;
        }
    }

    const allowedMissingHours = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowed = allowedMissingHours[tier] || 0;

    const actualSecs = durationToSeconds(actualHours);
    const requiredSecs = durationToSeconds(requiredHours);

    if (actualSecs >= requiredSecs) {
        return basePay;
    }

    const missingSecs = requiredSecs - actualSecs;
    const missingHours = missingSecs / 3600;
    const adjustedMissingHours = missingHours - allowed;

    if (adjustedMissingHours <= 0) {
        return basePay;
    }

    // Only full hours count
    const billableHours = Math.floor(adjustedMissingHours);
    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableHours * deductionRatePerHour;

    return basePay - salaryDeduction;
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